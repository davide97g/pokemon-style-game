/**
 * Author: Michael Hadley, mikewesthad.com
 * Asset Credits:
 *  - Tuxemon, https://github.com/Tuxemon/Tuxemon
 */

import Phaser from "phaser";
import { ASSET_PATHS } from "./config/AssetPaths";
import { Player } from "./entities/Player";
import { RemotePlayer } from "./entities/RemotePlayer";
import { MultiplayerService, PlayerData } from "./services/MultiplayerService";
import { ChatSystem } from "./systems/ChatSystem";
import { DialogSystem } from "./systems/DialogSystem";
import { MenuSystem } from "./systems/MenuSystem";
import { WeatherSystem } from "./systems/WeatherSystem";

// Debug logging utility
const DEBUG = import.meta.env.VITE_DEBUG === "true" || import.meta.env.DEV;
const debugLog = (...args: unknown[]): void => {
  if (DEBUG) {
    console.log(...args);
  }
};
const debugWarn = (...args: unknown[]): void => {
  if (DEBUG) {
    console.warn(...args);
  }
};

// Virtual cursor keys for mobile controls
interface VirtualCursorKeys {
  up: { isDown: boolean };
  down: { isDown: boolean };
  left: { isDown: boolean };
  right: { isDown: boolean };
}

const createVirtualCursorKeys = (): VirtualCursorKeys => {
  return {
    up: { isDown: false },
    down: { isDown: false },
    left: { isDown: false },
    right: { isDown: false },
  };
};

const isMobileDevice = (): boolean => {
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    ) || window.innerWidth <= 768
  );
};

export class GameScene extends Phaser.Scene {
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys | VirtualCursorKeys;
  private virtualCursors?: VirtualCursorKeys;
  private isMobile = false;
  private player?: Player;
  private gameMap: Phaser.Tilemaps.Tilemap | null = null;

  // Systems
  private menuSystem?: MenuSystem;
  private dialogSystem?: DialogSystem;
  protected weatherSystem?: WeatherSystem;
  private chatSystem?: ChatSystem;

  // Multiplayer
  private multiplayerService?: MultiplayerService;
  private remotePlayers: Map<string, RemotePlayer> = new Map();

  // Music
  private mainThemeMusic?: Phaser.Sound.HTML5AudioSound;
  private isMusicPlaying = false;
  private musicVolume = 0.5; // Default volume (0-1)

  constructor() {
    super({ key: "GameScene" });
  }

  shutdown(): void {
    // Clean up mobile event listeners
    if (this.isMobile) {
      window.removeEventListener(
        "mobileDirectionChange",
        this.handleMobileDirectionChange
      );
      window.removeEventListener("mobileActionA", this.handleMobileActionA);
      window.removeEventListener("mobileActionB", this.handleMobileActionB);
      window.removeEventListener("mobileStart", this.handleMobileStart);
    }

    // Clean up multiplayer connection
    if (this.multiplayerService) {
      this.multiplayerService.disconnect();
    }

    // Clean up remote players
    this.remotePlayers.forEach((player) => player.destroy());
    this.remotePlayers.clear();

    // Stop music
    if (this.mainThemeMusic && this.mainThemeMusic.isPlaying) {
      this.mainThemeMusic.stop();
    }
  }

  preload(): void {
    this.load.image("tiles", ASSET_PATHS.tiles);
    this.load.tilemapTiledJSON("map", ASSET_PATHS.map);
    this.load.atlas("atlas", ASSET_PATHS.atlas.image, ASSET_PATHS.atlas.json);
    this.load.audio("mainTheme", ASSET_PATHS.music.mainTheme);
  }

  create(): void {
    const map = this.make.tilemap({ key: "map" });
    this.gameMap = map;

    const tileset = map.addTilesetImage("tuxmon-sample-32px-extruded", "tiles");

    if (!tileset) {
      console.error("Tileset not found");
      return;
    }

    map.createLayer("Below Player", tileset, 0, 0);
    const worldLayer = map.createLayer("World", tileset, 0, 0);
    const aboveLayer = map.createLayer("Above Player", tileset, 0, 0);

    if (worldLayer) {
      worldLayer.setCollisionByProperty({ collides: true });
    }

    if (aboveLayer) {
      aboveLayer.setDepth(10);
    }

    const spawnPoint = map.findObject(
      "Objects",
      (obj) => obj.name === "Spawn Point"
    );

    if (!spawnPoint) {
      console.error("Spawn Point not found in map");
      return;
    }

    const oldStatue = map.findObject("Objects", (obj) => {
      const parsedObj = obj as Phaser.GameObjects.GameObject & {
        properties: [
          {
            name: string;
            type: string;
            value: string;
          }
        ];
        id: number;
      };
      if (!parsedObj.properties) return false;
      return (
        parsedObj.properties.find((property) => property.name === "type")
          ?.value === "intelligent"
      );
    });

    // Setup input - use virtual cursors for mobile, real keyboard for desktop
    this.isMobile = isMobileDevice();
    if (this.isMobile) {
      this.virtualCursors = createVirtualCursorKeys();
      this.cursors = this.virtualCursors;
      this.setupMobileControls();
    } else {
      this.cursors = this.input.keyboard!.createCursorKeys();
    }

    const spawnX = spawnPoint.x ?? 0;
    const spawnY = spawnPoint.y ?? 0;
    this.player = new Player(this, spawnX, spawnY, this.cursors);

    if (worldLayer) {
      this.physics.add.collider(this.player.getSprite(), worldLayer);
    }

    const camera = this.cameras.main;
    camera.startFollow(this.player.getSprite());
    camera.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    // Initialize systems
    this.initSystems();

    // Initialize music
    this.initMusic();

    // Start music after game loads
    this.startMusic();

    if (oldStatue) {
      this.chatSystem?.setStatuePosition({
        x: oldStatue.x ?? 0,
        y: oldStatue.y ?? 0,
      });
    }

    // Initialize multiplayer
    this.initMultiplayer();

    this.setupDebugControls();
    this.setupInputHandling();
  }

  private setupMobileControls(): void {
    // Bind handlers to preserve 'this' context
    this.handleMobileDirectionChange =
      this.handleMobileDirectionChange.bind(this);
    this.handleMobileActionA = this.handleMobileActionA.bind(this);
    this.handleMobileActionB = this.handleMobileActionB.bind(this);
    this.handleMobileStart = this.handleMobileStart.bind(this);

    // Listen for mobile control events
    window.addEventListener(
      "mobileDirectionChange",
      this.handleMobileDirectionChange
    );
    window.addEventListener("mobileActionA", this.handleMobileActionA);
    window.addEventListener("mobileActionB", this.handleMobileActionB);
    window.addEventListener("mobileStart", this.handleMobileStart);
  }

  private handleMobileDirectionChange = (event: Event): void => {
    const customEvent = event as CustomEvent<{
      up: boolean;
      down: boolean;
      left: boolean;
      right: boolean;
    }>;
    if (this.virtualCursors) {
      this.virtualCursors.up.isDown = customEvent.detail.up;
      this.virtualCursors.down.isDown = customEvent.detail.down;
      this.virtualCursors.left.isDown = customEvent.detail.left;
      this.virtualCursors.right.isDown = customEvent.detail.right;
    }
  };

  private handleMobileActionA = (): void => {
    // Main action: start chat or interact
    if (this.chatSystem?.isOpen()) return;
    if (this.dialogSystem?.isVisible()) {
      this.dialogSystem.handleAdvance();
    } else if (
      this.chatSystem?.getIsNearStatue() &&
      !this.chatSystem.isOpen()
    ) {
      const canOpenCheck = this.chatSystem.getCanOpenChatCheck();
      const canOpen = canOpenCheck ? canOpenCheck() : true;
      if (canOpen) {
        this.chatSystem.openChat();
      }
    }
  };

  private handleMobileActionB = (): void => {
    // Secondary action: cancel actions
    if (this.chatSystem?.isOpen()) {
      this.chatSystem.closeChat();
    } else if (this.dialogSystem?.isVisible()) {
      this.dialogSystem.handleAdvance();
    } else if (this.menuSystem?.isOpen()) {
      this.menuSystem.toggleMenu();
    }
  };

  private handleMobileStart = (): void => {
    // Start button: activate menu
    if (this.chatSystem?.isOpen()) return;
    if (this.dialogSystem?.isVisible()) {
      this.dialogSystem.handleAdvance();
    } else if (!this.menuSystem?.isOpen()) {
      this.menuSystem?.toggleMenu();
    }
  };

  private initSystems(): void {
    // Initialize menu system
    this.menuSystem = new MenuSystem(this);
    this.menuSystem.setOnMenuSelect((text, speaker) => {
      this.dialogSystem?.showDialog(text, speaker);
    });
    this.menuSystem.setOnVolumeChange((volume) => {
      this.setMusicVolume(volume);
    });

    // Initialize dialog system
    this.dialogSystem = new DialogSystem(this);

    // Initialize weather system
    this.weatherSystem = new WeatherSystem(this);

    // Initialize chat system
    this.chatSystem = new ChatSystem(this);
    this.chatSystem.initChat();
    this.chatSystem.setCanOpenChatCheck(() => {
      return !this.menuSystem?.isOpen() && !this.dialogSystem?.isVisible();
    });

    // Setup keyboard controls for menu/dialog
    this.setupMenuDialogControls();
  }

  private initMultiplayer(): void {
    // Initialize multiplayer service
    const serverUrl =
      import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
    debugLog("=== Multiplayer Configuration ===");
    debugLog(
      "VITE_SERVER_URL:",
      import.meta.env.VITE_SERVER_URL || "not set (using default)"
    );
    debugLog("Using server URL:", serverUrl);
    debugLog("================================");
    this.multiplayerService = new MultiplayerService(serverUrl);

    // Set up callbacks
    this.multiplayerService.onAllPlayers((players: PlayerData[]) => {
      // Add all existing players (excluding our own)
      const socketId = this.multiplayerService?.getSocketId();
      players.forEach((playerData) => {
        // Don't create remote player for ourselves
        if (playerData.id === socketId) {
          return;
        }
        // Only add if it doesn't already exist
        if (!this.remotePlayers.has(playerData.id)) {
          debugLog("Adding remote player:", playerData.id);
          this.addRemotePlayer(playerData);
        }
      });
    });

    this.multiplayerService.onPlayerJoin((playerData: PlayerData) => {
      // Don't create remote player for ourselves
      const socketId = this.multiplayerService?.getSocketId();
      if (playerData.id === socketId) {
        return;
      }
      // Only add if it doesn't already exist
      if (!this.remotePlayers.has(playerData.id)) {
        debugLog("Adding remote player on join:", playerData.id);
        this.addRemotePlayer(playerData);
      } else {
        debugWarn("Attempted to add duplicate remote player:", playerData.id);
      }
    });

    this.multiplayerService.onPlayerMove((playerData: PlayerData) => {
      // Don't process moves for our own player
      const socketId = this.multiplayerService?.getSocketId();
      if (playerData.id === socketId) {
        return;
      }

      let remotePlayer = this.remotePlayers.get(playerData.id);
      // If player doesn't exist yet, create them (might have joined before we connected)
      if (!remotePlayer) {
        debugLog("Creating remote player from move event:", playerData.id);
        this.addRemotePlayer(playerData);
        remotePlayer = this.remotePlayers.get(playerData.id);
      }

      if (remotePlayer) {
        remotePlayer.updatePosition(
          playerData.x,
          playerData.y,
          playerData.direction
        );
      }
    });

    this.multiplayerService.onPlayerLeave((playerId: string) => {
      this.removeRemotePlayer(playerId);
    });

    // Connect player position updates to multiplayer service
    if (this.player) {
      this.player.setOnPositionUpdate((x, y, direction) => {
        this.multiplayerService?.sendMovement(x, y, direction);
      });
    }

    // Helper function to register player
    const registerPlayer = () => {
      if (this.player && this.multiplayerService?.isConnectedToServer()) {
        const pos = this.player.getPosition();
        debugLog("Registering player at position:", pos.x, pos.y);
        this.multiplayerService.registerNewPlayer(pos.x, pos.y);
      }
    };

    // Connect to server
    this.multiplayerService.connect();

    // Register new player after connection is established
    // Wait a bit for connection to be fully established
    this.time.delayedCall(500, registerPlayer);
  }

  private addRemotePlayer(playerData: PlayerData): void {
    // Double-check to prevent duplicates
    if (this.remotePlayers.has(playerData.id)) {
      debugWarn("Attempted to add duplicate remote player:", playerData.id);
      return; // Player already exists
    }

    debugLog(
      "Creating remote player:",
      playerData.id,
      "at",
      playerData.x,
      playerData.y
    );
    const remotePlayer = new RemotePlayer(
      this,
      playerData.id,
      playerData.x,
      playerData.y,
      playerData.direction
    );

    // Add collision with world layer
    // const worldLayer = this.gameMap?.getLayer("World");
    // if (worldLayer) {
    //   this.physics.add.collider(remotePlayer.getSprite(), worldLayer);
    // }

    this.remotePlayers.set(playerData.id, remotePlayer);
    debugLog("Total remote players:", this.remotePlayers.size);
  }

  private removeRemotePlayer(playerId: string): void {
    const remotePlayer = this.remotePlayers.get(playerId);
    if (remotePlayer) {
      remotePlayer.destroy();
      this.remotePlayers.delete(playerId);
    }
  }

  private setupMenuDialogControls(): void {
    const spaceKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE
    );
    const enterKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.ENTER
    );

    spaceKey.on("down", () => {
      if (this.chatSystem?.isOpen()) return;
      if (this.dialogSystem?.isVisible()) {
        this.dialogSystem.handleAdvance();
      } else if (!this.menuSystem?.isOpen()) {
        this.menuSystem?.toggleMenu();
      }
    });

    enterKey.on("down", () => {
      if (this.chatSystem?.isOpen()) return;
      if (this.dialogSystem?.isVisible()) {
        this.dialogSystem.handleAdvance();
      }
    });
  }

  private setupInputHandling(): void {
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.chatSystem?.shouldBlockInput()) {
        if (this.chatSystem.isOpen()) {
          const chatBounds = this.chatSystem.getChatBounds();
          if (chatBounds) {
            const screenX = pointer.x;
            const screenY = pointer.y;

            if (
              screenX < chatBounds.x ||
              screenX > chatBounds.x + chatBounds.width ||
              screenY < chatBounds.y ||
              screenY > chatBounds.y + chatBounds.height
            ) {
              return;
            }
          } else {
            return;
          }
        } else {
          return;
        }
      }
    });
  }

  private setupDebugControls(): void {
    let tileInfoMode = false;
    this.input.keyboard!.on("keydown-I", () => {
      tileInfoMode = !tileInfoMode;
      debugLog(
        `Tile info mode: ${
          tileInfoMode ? "ON" : "OFF"
        }. Click on tiles to see their GID.`
      );
    });

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!tileInfoMode || !this.gameMap) return;

      const worldX = pointer.worldX;
      const worldY = pointer.worldY;

      const layersToCheck = ["Below Player", "World", "Above Player"];
      layersToCheck.forEach((layerName) => {
        const layer = this.gameMap!.getLayer(layerName);
        if (!layer) return;

        const tile = layer.tilemapLayer?.getTileAtWorldXY(worldX, worldY);
        if (tile && tile.index !== null && tile.index !== -1) {
          const firstGID = this.gameMap!.tilesets[0]?.firstgid || 1;
          const tileGID = tile.index + firstGID;
          const tileX = Math.floor(worldX / this.gameMap!.tileWidth);
          const tileY = Math.floor(worldY / this.gameMap!.tileHeight);

          debugLog(`\n=== Tile Info ===`);
          debugLog(`Layer: ${layerName}`);
          debugLog(`Position: (${tileX}, ${tileY})`);
          debugLog(`Tile Index: ${tile.index}`);
          debugLog(`Tile GID (Global ID): ${tileGID}`);
          debugLog(`Collides: ${tile.collides || false}`);
          if (tile.properties) {
            debugLog(`Properties:`, tile.properties);
          }
          debugLog(`\nTile GID: ${tileGID}`);
        }
      });
    });

    this.input.keyboard!.once("keydown", (event: KeyboardEvent) => {
      if (
        (event.key === "d" || event.key === "D") &&
        (event.metaKey || event.ctrlKey)
      ) {
        this.physics.world.createDebugGraphic();

        const worldLayer = this.gameMap?.getLayer("World");
        if (worldLayer) {
          const graphics = this.add.graphics().setAlpha(0.75).setDepth(20);
          worldLayer.tilemapLayer?.renderDebug(graphics, {
            tileColor: null,
            collidingTileColor: new Phaser.Display.Color(243, 134, 48, 255),
            faceColor: new Phaser.Display.Color(40, 39, 37, 255),
          });
        }
      }
    });
  }

  update(): void {
    // Don't update player movement if menu, dialog, or chat is open
    if (
      !this.player ||
      this.menuSystem?.isOpen() ||
      this.dialogSystem?.isVisible() ||
      this.chatSystem?.isOpen()
    ) {
      if (this.player) {
        this.player.stop();
      }
      return;
    }

    this.player.update();

    // Update chat system with player position
    if (this.player) {
      this.chatSystem?.updatePlayerPosition(this.player.getPosition());
      this.chatSystem?.checkStatueProximity();
    }
  }

  private initMusic(): void {
    // Load volume from localStorage if available
    const savedVolume = localStorage.getItem("musicVolume");
    if (savedVolume !== null) {
      this.musicVolume = parseFloat(savedVolume);
    }

    // Create music instance
    this.mainThemeMusic = this.sound.add("mainTheme", {
      loop: true,
      volume: this.musicVolume,
    }) as Phaser.Sound.HTML5AudioSound;
  }

  private startMusic(): void {
    if (this.mainThemeMusic && !this.isMusicPlaying) {
      this.mainThemeMusic.play();
      this.isMusicPlaying = true;
    }
  }

  public setMusicVolume(volume: number): void {
    this.musicVolume = Math.max(0, Math.min(1, volume)); // Clamp between 0 and 1
    if (this.mainThemeMusic) {
      this.mainThemeMusic.setVolume(this.musicVolume);
    }
    // Save to localStorage
    localStorage.setItem("musicVolume", this.musicVolume.toString());
  }

  public getMusicVolume(): number {
    return this.musicVolume;
  }
}
