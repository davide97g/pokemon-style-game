/**
 * Author: Michael Hadley, mikewesthad.com
 * Asset Credits:
 *  - Tuxemon, https://github.com/Tuxemon/Tuxemon
 */

import Phaser from "phaser";
import { ASSET_PATHS } from "./config/AssetPaths";
import { Player } from "./entities/Player";
import { RemotePlayer } from "./entities/RemotePlayer";
import {
  MultiplayerService,
  type PlayerData,
} from "./services/MultiplayerService";
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

interface InventorySlotConfig {
  columns: number;
  rows: number;
  slotSize: number;
  slotPadding: number;
}

const INVENTORY_SLOT_CONFIG: InventorySlotConfig = {
  columns: 8,
  rows: 4,
  slotSize: 56,
  slotPadding: 8,
};

interface InventoryItem {
  id: string;
  name: string;
  color: number;
  quantity: number;
}

interface InventorySlot {
  background: Phaser.GameObjects.Rectangle;
  itemContainer?: Phaser.GameObjects.Container;
  item?: InventoryItem;
}

const ITEM_TYPES: InventoryItem[] = [
  { id: "grass", name: "Grass", color: 0x4a7c59, quantity: 0 },
  { id: "water", name: "Water", color: 0x5dade2, quantity: 0 },
  { id: "mushroom_blue", name: "Blue Mushroom", color: 0x3498db, quantity: 0 },
  { id: "stone", name: "Stone", color: 0x7f8c8d, quantity: 0 },
  { id: "cactus", name: "Cactus", color: 0x52be80, quantity: 0 },
  { id: "stone_dark", name: "Dark Stone", color: 0x34495e, quantity: 0 },
  { id: "bone", name: "Bone", color: 0xecf0f1, quantity: 0 },
  { id: "wood", name: "Wood", color: 0x8b4513, quantity: 0 },
  { id: "rope", name: "Rope", color: 0x8b6914, quantity: 0 },
  { id: "pebble", name: "Pebble", color: 0x95a5a6, quantity: 0 },
  { id: "shell", name: "Shell", color: 0xf4d03f, quantity: 0 },
  { id: "dust", name: "Dust", color: 0xbdc3c7, quantity: 0 },
  {
    id: "mushroom_brown",
    name: "Brown Mushroom",
    color: 0x8b4513,
    quantity: 0,
  },
  { id: "plank", name: "Plank", color: 0xd2691e, quantity: 0 },
  { id: "log", name: "Log", color: 0x654321, quantity: 0 },
  { id: "coin", name: "Coin", color: 0xffd700, quantity: 0 },
];

const COLLECTION_PROXIMITY_DISTANCE = 32; // pixels - distance to tile center

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
      navigator.userAgent,
    ) || window.innerWidth <= 768
  );
};

export class GameScene extends Phaser.Scene {
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys | VirtualCursorKeys;
  private virtualCursors?: VirtualCursorKeys;
  private isMobile = false;
  private player?: Player;
  private gameMap: Phaser.Tilemaps.Tilemap | null = null;
  private worldLayer?: Phaser.Tilemaps.TilemapLayer;

  // Systems
  private menuSystem?: MenuSystem;
  private dialogSystem?: DialogSystem;
  protected weatherSystem?: WeatherSystem;
  private chatSystem?: ChatSystem;

  // Multiplayer
  private multiplayerService?: MultiplayerService;
  private remotePlayers: Map<string, RemotePlayer> = new Map();

  // Music
  private mainThemeMusic?: Phaser.Sound.WebAudioSound;
  private isMusicPlaying = false;
  private musicVolume = 0.5; // Default volume (0-1)
  private audioContextCheckInterval?: number;
  private isMuted = false;
  private volumeIconContainer?: Phaser.GameObjects.Container;
  private volumeIconGraphics?: Phaser.GameObjects.Graphics;

  // Sound effects
  private hitSound?: Phaser.Sound.BaseSound;
  private destroySound?: Phaser.Sound.BaseSound;
  private introSound?: Phaser.Sound.BaseSound;

  // Inventory
  private inventoryContainer?: Phaser.GameObjects.Container;
  private isInventoryOpen = false;
  private inventorySlots: InventorySlot[] = [];
  private inventoryItems: Map<string, InventoryItem> = new Map();
  private hotbarSlots: InventorySlot[] = [];
  private tooltipContainer?: Phaser.GameObjects.Container;
  private inventoryRecapContainer?: Phaser.GameObjects.Container;

  // Collection notifications
  private collectionNotifications: Phaser.GameObjects.Container[] = [];

  // Tile collection tracking (for collectable items disappearing after N collections)
  private tileCollectionCounts: Map<string, number> = new Map();
  private tileProgressBars: Map<string, Phaser.GameObjects.Container> =
    new Map();
  private nearbyTiles: Set<string> = new Set(); // Track tiles currently in proximity

  // Collection limits per item type
  private readonly COLLECTION_LIMITS: Map<string, number> = new Map([
    ["stone", 10],
    ["stone_dark", 10],
    ["wood", 5],
  ]);

  constructor() {
    super({ key: "GameScene" });
  }

  shutdown(): void {
    // Clean up mobile event listeners
    if (this.isMobile) {
      window.removeEventListener(
        "mobileDirectionChange",
        this.handleMobileDirectionChange,
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
    this.remotePlayers.forEach((player) => {
      player.destroy();
    });
    this.remotePlayers.clear();

    // Clean up progress bars
    this.tileProgressBars.forEach((progressBar) => {
      progressBar.destroy();
    });
    this.tileProgressBars.clear();

    // Stop music
    if (this.mainThemeMusic?.isPlaying) {
      this.mainThemeMusic.stop();
    }

    // Clean up audio context check interval
    if (this.audioContextCheckInterval !== undefined) {
      clearInterval(this.audioContextCheckInterval);
    }
  }

  preload(): void {
    this.load.image("tiles", ASSET_PATHS.tiles);
    this.load.image("txProps", ASSET_PATHS.txProps);
    this.load.tilemapTiledJSON("map", ASSET_PATHS.map);
    this.load.atlas("atlas", ASSET_PATHS.atlas.image, ASSET_PATHS.atlas.json);
    this.load.audio("mainTheme", ASSET_PATHS.music.mainTheme);
    this.load.audio("hit", ASSET_PATHS.audio.hit);
    this.load.audio("destroy", ASSET_PATHS.audio.destroy);
    this.load.audio("intro", ASSET_PATHS.audio.intro);

    // Load item images
    Object.entries(ASSET_PATHS.items).forEach(([key, path]) => {
      this.load.image(key, path);
    });
  }

  create(): void {
    const map = this.make.tilemap({ key: "map" });
    this.gameMap = map;

    const tileset = map.addTilesetImage("tuxmon-sample-32px-extruded", "tiles");
    const txPropsTileset = map.addTilesetImage("txProps", "txProps");
    if (!tileset) {
      console.error("Tileset not found");
      return;
    }
    if (!txPropsTileset) {
      console.error("TX Props tileset not found");
      return;
    }

    // Create layers with both tilesets
    const tilesets = [tileset, txPropsTileset];

    map.createLayer("Below Player", tilesets, 0, 0);
    const worldLayer = map.createLayer("World", tilesets, 0, 0);
    this.worldLayer = worldLayer || undefined;
    const aboveLayer = map.createLayer("Above Player", tilesets, 0, 0);

    if (worldLayer) {
      worldLayer.setCollisionByProperty({ collides: true });
    }

    if (aboveLayer) {
      aboveLayer.setDepth(10);
    }

    const spawnPoint = map.findObject(
      "Objects",
      (obj) => obj.name === "Spawn Point",
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
          },
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
      this.cursors = this.input.keyboard?.createCursorKeys();
    }

    const spawnX = spawnPoint.x ?? 0;
    const spawnY = spawnPoint.y ?? 0;
    this.player = new Player(
      this,
      spawnX,
      spawnY,
      this.cursors ?? {
        up: { isDown: false },
        down: { isDown: false },
        left: { isDown: false },
        right: { isDown: false },
      },
    );

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

    // Initialize sound effects
    this.hitSound = this.sound.add("hit", { volume: 0.5 });
    this.destroySound = this.sound.add("destroy", { volume: 0.5 });
    this.introSound = this.sound.add("intro", { volume: 0.5 });

    // Play intro sound when game loads
    this.introSound?.play();

    // Start music after game loads
    this.startMusic();

    // Ensure music continues when tab loses focus
    this.setupBackgroundAudio();

    // Create volume toggle icon
    this.createVolumeToggleIcon();

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
    this.initInventory();
    this.createInventoryUI();
    this.createInventoryRecap();
    this.setupInventoryControls();
    this.setupCollectionControls();
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
      this.handleMobileDirectionChange,
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
      import.meta.env.VITE_SERVER_URL || "not set (using default)",
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
          playerData.direction,
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
      playerData.y,
    );
    const remotePlayer = new RemotePlayer(
      this,
      playerData.id,
      playerData.x,
      playerData.y,
      playerData.direction,
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
    const spaceKey = this.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE,
    );
    const enterKey = this.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.ENTER,
    );

    spaceKey?.on("down", () => {
      if (this.chatSystem?.isOpen()) return;
      if (this.dialogSystem?.isVisible()) {
        this.dialogSystem.handleAdvance();
      } else if (!this.menuSystem?.isOpen()) {
        this.menuSystem?.toggleMenu();
      }
    });

    enterKey?.on("down", () => {
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
    this.input.keyboard?.on("keydown-T", () => {
      tileInfoMode = !tileInfoMode;
      debugLog(
        `Tile info mode: ${
          tileInfoMode ? "ON" : "OFF"
        }. Click on tiles to see their GID.`,
      );
    });

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!tileInfoMode || !this.gameMap) return;

      const worldX = pointer.worldX;
      const worldY = pointer.worldY;

      const layersToCheck = ["Below Player", "World", "Above Player"];
      layersToCheck.forEach((layerName) => {
        const layer = this.gameMap?.getLayer(layerName);
        if (!layer) return;

        const tile = layer.tilemapLayer?.getTileAtWorldXY(worldX, worldY);
        if (tile && tile.index !== null && tile.index !== -1) {
          const firstGID = this.gameMap?.tilesets[0]?.firstgid || 1;
          const tileGID = tile.index + firstGID;
          const tileX = Math.floor(worldX / (this.gameMap?.tileWidth || 0));
          const tileY = Math.floor(worldY / (this.gameMap?.tileHeight || 0));

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

    this.input.keyboard?.once("keydown", (event: KeyboardEvent) => {
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
      this.chatSystem?.isOpen() ||
      this.isInventoryOpen
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

    // Update progress bars visibility based on proximity
    this.updateProgressBarsVisibility();
  }

  private initMusic(): void {
    // Load volume from localStorage if available
    const savedVolume = localStorage.getItem("musicVolume");
    if (savedVolume !== null) {
      this.musicVolume = parseFloat(savedVolume);
    }

    // Load mute state from localStorage
    const savedMuted = localStorage.getItem("musicMuted");
    if (savedMuted === "true") {
      this.isMuted = true;
    }

    // Create music instance using Web Audio API for background playback
    // Start with volume 0 if muted, otherwise use saved volume
    const initialVolume = this.isMuted ? 0 : this.musicVolume;
    this.mainThemeMusic = this.sound.add("mainTheme", {
      loop: true,
      volume: initialVolume,
    }) as Phaser.Sound.WebAudioSound;

    // Ensure Web Audio context stays active
    try {
      const soundManager = this.sound as Phaser.Sound.WebAudioSoundManager;
      if (soundManager?.context && soundManager.context.state === "suspended") {
        soundManager.context.resume();
      }
    } catch (error) {
      console.error("Error resuming audio context:", error);
      // Fallback if context is not available
    }
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
      // Only set volume if not muted
      if (!this.isMuted) {
        this.mainThemeMusic.setVolume(this.musicVolume);
      }
    }
    // Save to localStorage
    localStorage.setItem("musicVolume", this.musicVolume.toString());
  }

  public getMusicVolume(): number {
    return this.musicVolume;
  }

  public toggleMute(): void {
    this.isMuted = !this.isMuted;
    if (this.mainThemeMusic) {
      if (this.isMuted) {
        this.mainThemeMusic.setVolume(0);
      } else {
        this.mainThemeMusic.setVolume(this.musicVolume);
      }
    }
    this.updateVolumeIcon();
    // Save mute state to localStorage
    localStorage.setItem("musicMuted", this.isMuted.toString());
  }

  public isMutedState(): boolean {
    return this.isMuted;
  }

  private createVolumeToggleIcon(): void {
    const iconSize = 40;
    const padding = 16;
    const x = padding + iconSize / 2;
    const y = padding + iconSize / 2;

    this.volumeIconContainer = this.add.container(x, y);
    this.volumeIconContainer.setScrollFactor(0);
    this.volumeIconContainer.setDepth(100);
    this.volumeIconContainer.setInteractive(
      new Phaser.Geom.Rectangle(
        -iconSize / 2,
        -iconSize / 2,
        iconSize,
        iconSize,
      ),
      Phaser.Geom.Rectangle.Contains,
    );
    this.volumeIconContainer.setInteractive({ useHandCursor: true });

    // Background
    const bg = this.add.rectangle(0, 0, iconSize, iconSize, 0x333333, 0.9);
    bg.setStrokeStyle(2, 0x666666);
    this.volumeIconContainer.add(bg);

    // Volume icon graphics
    this.volumeIconGraphics = this.add.graphics();
    this.volumeIconContainer.add(this.volumeIconGraphics);

    // Mute state is already loaded in initMusic, just update the icon
    if (this.isMuted && this.mainThemeMusic) {
      this.mainThemeMusic.setVolume(0);
    }

    this.updateVolumeIcon();

    // Click handler
    this.volumeIconContainer.on("pointerdown", () => {
      this.toggleMute();
    });

    // Hover effect
    this.volumeIconContainer.on("pointerover", () => {
      bg.setFillStyle(0x444444, 0.9);
    });

    this.volumeIconContainer.on("pointerout", () => {
      bg.setFillStyle(0x333333, 0.9);
    });
  }

  private updateVolumeIcon(): void {
    if (!this.volumeIconGraphics) return;

    this.volumeIconGraphics.clear();

    const iconSize = 24;
    const centerX = 0;
    const centerY = 0;

    if (this.isMuted) {
      // Muted icon: speaker with X
      this.volumeIconGraphics.lineStyle(3, 0xffffff, 1);

      // Speaker base
      this.volumeIconGraphics.beginPath();
      this.volumeIconGraphics.moveTo(
        centerX - iconSize / 3,
        centerY - iconSize / 4,
      );
      this.volumeIconGraphics.lineTo(
        centerX - iconSize / 2,
        centerY - iconSize / 2,
      );
      this.volumeIconGraphics.lineTo(
        centerX - iconSize / 2,
        centerY + iconSize / 2,
      );
      this.volumeIconGraphics.lineTo(
        centerX - iconSize / 3,
        centerY + iconSize / 4,
      );
      this.volumeIconGraphics.closePath();
      this.volumeIconGraphics.strokePath();

      // Speaker cone
      this.volumeIconGraphics.beginPath();
      this.volumeIconGraphics.moveTo(
        centerX - iconSize / 3,
        centerY - iconSize / 4,
      );
      this.volumeIconGraphics.lineTo(centerX, centerY - iconSize / 3);
      this.volumeIconGraphics.lineTo(centerX, centerY + iconSize / 3);
      this.volumeIconGraphics.lineTo(
        centerX - iconSize / 3,
        centerY + iconSize / 4,
      );
      this.volumeIconGraphics.closePath();
      this.volumeIconGraphics.strokePath();

      // X mark
      this.volumeIconGraphics.lineStyle(3, 0xff6666, 1);
      this.volumeIconGraphics.beginPath();
      this.volumeIconGraphics.moveTo(
        centerX + iconSize / 6,
        centerY - iconSize / 6,
      );
      this.volumeIconGraphics.lineTo(
        centerX + iconSize / 2,
        centerY - iconSize / 2,
      );
      this.volumeIconGraphics.moveTo(
        centerX + iconSize / 6,
        centerY + iconSize / 6,
      );
      this.volumeIconGraphics.lineTo(
        centerX + iconSize / 2,
        centerY + iconSize / 2,
      );
      this.volumeIconGraphics.moveTo(
        centerX + iconSize / 2,
        centerY - iconSize / 2,
      );
      this.volumeIconGraphics.lineTo(
        centerX + iconSize / 6,
        centerY + iconSize / 6,
      );
      this.volumeIconGraphics.moveTo(
        centerX + iconSize / 2,
        centerY + iconSize / 2,
      );
      this.volumeIconGraphics.lineTo(
        centerX + iconSize / 6,
        centerY - iconSize / 6,
      );
      this.volumeIconGraphics.strokePath();
    } else {
      // Unmuted icon: speaker with sound waves
      this.volumeIconGraphics.lineStyle(3, 0xffffff, 1);

      // Speaker base
      this.volumeIconGraphics.beginPath();
      this.volumeIconGraphics.moveTo(
        centerX - iconSize / 3,
        centerY - iconSize / 4,
      );
      this.volumeIconGraphics.lineTo(
        centerX - iconSize / 2,
        centerY - iconSize / 2,
      );
      this.volumeIconGraphics.lineTo(
        centerX - iconSize / 2,
        centerY + iconSize / 2,
      );
      this.volumeIconGraphics.lineTo(
        centerX - iconSize / 3,
        centerY + iconSize / 4,
      );
      this.volumeIconGraphics.closePath();
      this.volumeIconGraphics.strokePath();

      // Speaker cone
      this.volumeIconGraphics.beginPath();
      this.volumeIconGraphics.moveTo(
        centerX - iconSize / 3,
        centerY - iconSize / 4,
      );
      this.volumeIconGraphics.lineTo(centerX, centerY - iconSize / 3);
      this.volumeIconGraphics.lineTo(centerX, centerY + iconSize / 3);
      this.volumeIconGraphics.lineTo(
        centerX - iconSize / 3,
        centerY + iconSize / 4,
      );
      this.volumeIconGraphics.closePath();
      this.volumeIconGraphics.strokePath();

      // Sound waves
      this.volumeIconGraphics.lineStyle(2, 0xffffff, 1);
      this.volumeIconGraphics.beginPath();
      this.volumeIconGraphics.arc(
        centerX,
        centerY,
        iconSize / 4,
        -Math.PI / 4,
        Math.PI / 4,
        false,
      );
      this.volumeIconGraphics.strokePath();
      this.volumeIconGraphics.beginPath();
      this.volumeIconGraphics.arc(
        centerX,
        centerY,
        iconSize / 2.5,
        -Math.PI / 3,
        Math.PI / 3,
        false,
      );
      this.volumeIconGraphics.strokePath();
    }
  }

  private setupBackgroundAudio(): void {
    // Keep Web Audio context active (like YouTube does)
    const keepAudioContextActive = () => {
      try {
        const soundManager = this.sound as Phaser.Sound.WebAudioSoundManager;
        if (
          soundManager?.context &&
          soundManager.context.state === "suspended"
        ) {
          soundManager.context.resume();
        }
      } catch (error) {
        console.error("Error keeping audio context active:", error);
        // Fallback if context is not available
      }
    };

    // Handle visibility changes
    document.addEventListener("visibilitychange", () => {
      keepAudioContextActive();
      if (!document.hidden && this.mainThemeMusic && !this.isMusicPlaying) {
        this.startMusic();
      }
    });

    // Handle window focus/blur events (for switching between windows)
    window.addEventListener("blur", () => {
      // Keep audio context active even when window loses focus
      keepAudioContextActive();
      if (this.mainThemeMusic && this.isMusicPlaying) {
        // Ensure music continues playing
        if (this.mainThemeMusic.isPaused) {
          this.mainThemeMusic.resume();
        }
      }
    });

    window.addEventListener("focus", () => {
      keepAudioContextActive();
      if (this.mainThemeMusic && !this.isMusicPlaying) {
        this.startMusic();
      }
    });

    // Prevent audio from being paused by browser
    if (this.mainThemeMusic) {
      this.sound.on("pauseall", () => {
        keepAudioContextActive();
        if (this.mainThemeMusic && this.isMusicPlaying) {
          this.mainThemeMusic.resume();
        }
      });
    }

    // Periodically check and resume audio context (like YouTube does)
    this.audioContextCheckInterval = window.setInterval(() => {
      keepAudioContextActive();
      if (
        this.mainThemeMusic &&
        this.isMusicPlaying &&
        this.mainThemeMusic.isPaused
      ) {
        this.mainThemeMusic.resume();
      }
    }, 1000); // Check every second
  }

  private initInventory(): void {
    // Initialize inventory items map with empty quantities
    ITEM_TYPES.forEach((item) => {
      this.inventoryItems.set(item.id, { ...item, quantity: 0 });
    });
  }

  private createInventoryUI(): void {
    const mainCamera = this.cameras.main;
    const panelWidth = mainCamera.width * 0.6;
    const panelHeight = mainCamera.height * 0.55;

    const centerX = mainCamera.width / 2;
    const centerY = mainCamera.height / 2;

    const container = this.add.container(centerX, centerY);
    container.setScrollFactor(0);
    container.setDepth(150);

    const background = this.add.rectangle(
      0,
      0,
      panelWidth,
      panelHeight,
      0x000000,
      0.55,
    );
    background.setStrokeStyle(3, 0xffffff, 0.4);
    container.add(background);

    const headerHeight = 64;
    const headerBackground = this.add.rectangle(
      0,
      -panelHeight / 2 + headerHeight / 2,
      panelWidth * 0.55,
      headerHeight,
      0x18181b,
      0.95,
    );
    headerBackground.setStrokeStyle(2, 0xffffff, 0.5);
    container.add(headerBackground);

    const titleText = this.add.text(0, headerBackground.y, "INVENTORY", {
      fontFamily: "monospace",
      fontSize: "28px",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 4,
      align: "center",
    });
    titleText.setOrigin(0.5);
    container.add(titleText);

    const { columns, rows, slotSize, slotPadding } = INVENTORY_SLOT_CONFIG;
    const gridWidth = columns * slotSize + (columns - 1) * slotPadding;
    const gridHeight = rows * slotSize + (rows - 1) * slotPadding;

    const gridStartX = -gridWidth / 2 + slotSize / 2;
    const gridStartY = -gridHeight / 2 + headerHeight;

    // Create main inventory slots
    this.inventorySlots = [];
    for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
      for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
        const slotX = gridStartX + columnIndex * (slotSize + slotPadding);
        const slotY = gridStartY + rowIndex * (slotSize + slotPadding);

        const slotBackground = this.add.rectangle(
          slotX,
          slotY,
          slotSize,
          slotSize,
          0x18181b,
          0.9,
        );
        slotBackground.setStrokeStyle(2, 0xffffff, 0.25);
        container.add(slotBackground);

        this.inventorySlots.push({
          background: slotBackground,
        });
      }
    }

    // Create hotbar slots
    const hotbarY = panelHeight / 2 - 72;
    const hotbarColumns = 8;
    const hotbarSlotSize = 56;
    const hotbarPadding = 10;
    const hotbarWidth =
      hotbarColumns * hotbarSlotSize + (hotbarColumns - 1) * hotbarPadding;
    const hotbarStartX = -hotbarWidth / 2 + hotbarSlotSize / 2;

    this.hotbarSlots = [];
    for (let hotbarIndex = 0; hotbarIndex < hotbarColumns; hotbarIndex += 1) {
      const hotbarX =
        hotbarStartX + hotbarIndex * (hotbarSlotSize + hotbarPadding);
      const hotbarSlot = this.add.rectangle(
        hotbarX,
        hotbarY,
        hotbarSlotSize,
        hotbarSlotSize,
        0x0f172a,
        0.95,
      );
      hotbarSlot.setStrokeStyle(2, 0xffffff, 0.3);
      container.add(hotbarSlot);

      this.hotbarSlots.push({
        background: hotbarSlot,
      });
    }

    container.setVisible(false);
    this.inventoryContainer = container;
    this.createTooltip();
    this.updateInventoryDisplay();
  }

  private createInventoryRecap(): void {
    const padding = 16;
    const itemWidth = 200;

    const container = this.add.container(padding + itemWidth / 2, 0);
    container.setScrollFactor(0);
    container.setDepth(100);
    this.inventoryRecapContainer = container;

    this.updateInventoryRecap();
  }

  private updateInventoryRecap(): void {
    if (!this.inventoryRecapContainer) return;

    // Clear existing children
    this.inventoryRecapContainer.removeAll(true);

    // Get all items with quantity > 0
    const itemsWithQuantity: InventoryItem[] = [];
    this.inventoryItems.forEach((item) => {
      if (item.quantity > 0) {
        itemsWithQuantity.push({ ...item });
      }
    });

    if (itemsWithQuantity.length === 0) {
      return;
    }

    const itemHeight = 48;
    const itemWidth = 200;
    const itemSpacing = 4;
    const iconSize = 32;
    const padding = 8;
    const bottomPadding = 16;

    // Calculate container Y position so items align from bottom of camera
    const totalHeight =
      itemsWithQuantity.length * itemHeight +
      (itemsWithQuantity.length - 1) * itemSpacing;
    const containerY =
      this.cameras.main.height - bottomPadding - totalHeight / 2;
    this.inventoryRecapContainer.setY(containerY);

    // Calculate starting Y position (bottom-up, relative to container center)
    let currentY = -totalHeight / 2 + itemHeight / 2;

    itemsWithQuantity.forEach((item) => {
      // Background (black with rounded corners)
      const radius = 8;
      const graphics = this.add.graphics();
      graphics.fillStyle(0x000000, 0.5);
      graphics.lineStyle(2, 0xffffff, 0.3);

      // Draw rounded rectangle
      graphics.fillRoundedRect(
        -itemWidth / 2,
        currentY - itemHeight / 2,
        itemWidth,
        itemHeight,
        radius,
      );
      graphics.strokeRoundedRect(
        -itemWidth / 2,
        currentY - itemHeight / 2,
        itemWidth,
        itemHeight,
        radius,
      );

      this.inventoryRecapContainer?.add(graphics);

      // Item icon
      const iconX = -itemWidth / 2 + padding + iconSize / 2;
      if (this.textures.exists(item.id)) {
        const itemIcon = this.add.image(iconX, currentY, item.id);
        itemIcon.setDisplaySize(iconSize, iconSize);
        this.inventoryRecapContainer?.add(itemIcon);
      } else {
        const itemIcon = this.add.rectangle(
          iconX,
          currentY,
          iconSize,
          iconSize,
          item.color,
          1,
        );
        itemIcon.setStrokeStyle(2, 0xffffff, 0.3);
        this.inventoryRecapContainer?.add(itemIcon);
      }

      // Quantity and name text (icon x quantity name)
      const textX = iconX + iconSize / 2 + padding;
      const quantityText = this.add.text(
        textX,
        currentY,
        `x${item.quantity} ${item.name}`,
        {
          fontFamily: "monospace",
          fontSize: "16px",
          color: "#ffffff",
          stroke: "#000000",
          strokeThickness: 2,
        },
      );
      quantityText.setOrigin(0, 0.5);
      this.inventoryRecapContainer?.add(quantityText);

      currentY += itemHeight + itemSpacing;
    });
  }

  private createTooltip(): void {
    if (!this.inventoryContainer) return;

    const tooltipContainer = this.add.container(0, 0);
    tooltipContainer.setDepth(1); // Relative depth within inventory
    tooltipContainer.setVisible(false);

    // Background
    const background = this.add.rectangle(0, 0, 150, 40, 0x18181b, 0.95);
    background.setStrokeStyle(2, 0xffffff, 0.5);
    background.setOrigin(0, 0);
    tooltipContainer.add(background);

    // Text
    const text = this.add.text(8, 8, "", {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 2,
    });
    text.setOrigin(0, 0);
    tooltipContainer.add(text);

    // Add tooltip as child of inventory container
    this.inventoryContainer.add(tooltipContainer);
    this.tooltipContainer = tooltipContainer;
  }

  private showTooltip(x: number, y: number, item: InventoryItem): void {
    console.log("showTooltip called for:", item.name, "at position:", x, y);
    if (!this.tooltipContainer || !this.inventoryContainer) {
      console.log("Tooltip container or inventory container is missing!");
      return;
    }

    const tooltipText = `${item.name} x${item.quantity}`;
    const textObject = this.tooltipContainer.list[1] as Phaser.GameObjects.Text;
    const background = this.tooltipContainer
      .list[0] as Phaser.GameObjects.Rectangle;

    textObject.setText(tooltipText);

    // Adjust background size to fit text
    const textWidth = textObject.width;
    const textHeight = textObject.height;
    background.setSize(textWidth + 16, textHeight + 16);

    // Position tooltip relative to inventory container (since it's now a child)
    // x and y are already relative to the inventory container
    console.log("Tooltip position relative to inventory:", x + 10, y - 50);
    this.tooltipContainer.setPosition(x + 10, y - 50);
    this.tooltipContainer.setVisible(true);
    console.log("Tooltip visibility set to true");
  }

  private hideTooltip(): void {
    if (!this.tooltipContainer) return;
    this.tooltipContainer.setVisible(false);
  }

  private updateInventoryDisplay(): void {
    if (!this.inventoryContainer) return;

    // Clear existing item containers and event listeners
    this.inventorySlots.forEach((slot) => {
      // Remove event listeners
      if (slot.background) {
        slot.background.removeAllListeners();
      }
      if (slot.itemContainer) {
        slot.itemContainer.destroy();
        slot.itemContainer = undefined;
      }
      slot.item = undefined;
    });

    this.hotbarSlots.forEach((slot) => {
      // Remove event listeners
      if (slot.background) {
        slot.background.removeAllListeners();
      }
      if (slot.itemContainer) {
        slot.itemContainer.destroy();
        slot.itemContainer = undefined;
      }
      slot.item = undefined;
    });

    // Get all items with quantity > 0
    const itemsWithQuantity: InventoryItem[] = [];
    this.inventoryItems.forEach((item) => {
      if (item.quantity > 0) {
        itemsWithQuantity.push({ ...item });
      }
    });

    // Display items in main inventory slots
    itemsWithQuantity.forEach((item, index) => {
      if (index >= this.inventorySlots.length) return;

      const slot = this.inventorySlots[index];
      const slotX = slot.background.x;
      const slotY = slot.background.y;
      const slotSize = slot.background.width;

      const itemContainer = this.add.container(slotX, slotY);
      itemContainer.setScrollFactor(0);
      itemContainer.setDepth(151);

      // Item icon
      const itemSize = slotSize * 0.7;

      // Check if texture exists, otherwise fallback to color
      if (this.textures.exists(item.id)) {
        const itemIcon = this.add.image(0, 0, item.id);
        itemIcon.setDisplaySize(itemSize, itemSize);
        itemContainer.add(itemIcon);
      } else {
        const itemIcon = this.add.rectangle(
          0,
          0,
          itemSize,
          itemSize,
          item.color,
          1,
        );
        itemIcon.setStrokeStyle(2, 0xffffff, 0.3);
        itemContainer.add(itemIcon);
      }

      // Quantity text
      if (item.quantity > 1) {
        const quantityText = this.add.text(
          slotSize / 2 - 4,
          slotSize / 2 - 4,
          item.quantity.toString(),
          {
            fontFamily: "monospace",
            fontSize: "14px",
            color: "#ffffff",
            stroke: "#000000",
            strokeThickness: 3,
            align: "right",
          },
        );
        quantityText.setOrigin(1, 1);
        itemContainer.add(quantityText);
      }

      this.inventoryContainer?.add(itemContainer);
      slot.itemContainer = itemContainer;
      slot.item = item;

      // Add hover events for tooltip
      slot.background.setInteractive({ useHandCursor: true });
      console.log(
        "Setting up hover events for item:",
        item.name,
        "at slot:",
        index,
      );
      slot.background.on("pointerover", () => {
        console.log("HOVER EVENT TRIGGERED for item:", item.name);
        this.showTooltip(slot.background.x, slot.background.y, item);
      });
      slot.background.on("pointerout", () => {
        console.log("HOVER OUT EVENT for item:", item.name);
        this.hideTooltip();
      });
    });

    // Display first 8 items in hotbar
    itemsWithQuantity.slice(0, 8).forEach((item, index) => {
      if (index >= this.hotbarSlots.length) return;

      const slot = this.hotbarSlots[index];
      const slotX = slot.background.x;
      const slotY = slot.background.y;
      const slotSize = slot.background.width;

      const itemContainer = this.add.container(slotX, slotY);
      itemContainer.setScrollFactor(0);
      itemContainer.setDepth(151);

      // Item icon
      const itemSize = slotSize * 0.7;

      // Check if texture exists, otherwise fallback to color
      if (this.textures.exists(item.id)) {
        const itemIcon = this.add.image(0, 0, item.id);
        itemIcon.setDisplaySize(itemSize, itemSize);
        itemContainer.add(itemIcon);
      } else {
        const itemIcon = this.add.rectangle(
          0,
          0,
          itemSize,
          itemSize,
          item.color,
          1,
        );
        itemIcon.setStrokeStyle(2, 0xffffff, 0.3);
        itemContainer.add(itemIcon);
      }

      // Quantity text
      if (item.quantity > 1) {
        const quantityText = this.add.text(
          slotSize / 2 - 4,
          slotSize / 2 - 4,
          item.quantity.toString(),
          {
            fontFamily: "monospace",
            fontSize: "12px",
            color: "#ffffff",
            stroke: "#000000",
            strokeThickness: 2,
            align: "right",
          },
        );
        quantityText.setOrigin(1, 1);
        itemContainer.add(quantityText);
      }

      this.inventoryContainer?.add(itemContainer);
      slot.itemContainer = itemContainer;
      slot.item = item;

      // Add hover events for tooltip
      slot.background.setInteractive({ useHandCursor: true });
      console.log(
        "Setting up hotbar hover events for item:",
        item.name,
        "at slot:",
        index,
      );
      slot.background.on("pointerover", () => {
        console.log("HOTBAR HOVER EVENT TRIGGERED for item:", item.name);
        this.showTooltip(slot.background.x, slot.background.y, item);
      });
      slot.background.on("pointerout", () => {
        console.log("HOTBAR HOVER OUT EVENT for item:", item.name);
        this.hideTooltip();
      });
    });

    // Update inventory recap
    this.updateInventoryRecap();
  }

  private addItemToInventory(itemId: string, quantity: number = 1): void {
    const item = this.inventoryItems.get(itemId);
    if (item) {
      item.quantity += quantity;
      this.updateInventoryDisplay();
    }
  }

  private checkTileProximity(): {
    itemId: string;
    tileX: number;
    tileY: number;
  } | null {
    if (!this.player || !this.gameMap) return null;

    const playerPos = this.player.getPosition();
    const tileWidth = this.gameMap.tileWidth || 32;
    const tileHeight = this.gameMap.tileHeight || 32;

    // Get the tile the player is on or near
    const tileX = Math.floor(playerPos.x / tileWidth);
    const tileY = Math.floor(playerPos.y / tileHeight);

    // Check tiles in a 3x3 area around the player
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const checkX = tileX + dx;
        const checkY = tileY + dy;

        const worldX = checkX * tileWidth + tileWidth / 2;
        const worldY = checkY * tileHeight + tileHeight / 2;

        const distance = Math.sqrt(
          (playerPos.x - worldX) ** 2 + (playerPos.y - worldY) ** 2,
        );

        if (distance <= COLLECTION_PROXIMITY_DISTANCE) {
          // Check if this tile exists and is collectible
          const worldLayer = this.gameMap.getLayer("World");
          if (worldLayer?.tilemapLayer) {
            const tile = worldLayer.tilemapLayer.getTileAt(checkX, checkY);
            if (tile && tile.index !== null && tile.index !== -1) {
              // Check if tile is already hidden (collected max times)
              const tileKey = `${checkX},${checkY}`;
              const collectionCount =
                this.tileCollectionCounts.get(tileKey) || 0;

              // Get collectable item type to check limit
              let itemId: string | null = null;
              if (tile.properties) {
                if (Array.isArray(tile.properties)) {
                  const collectableProperty = tile.properties.find(
                    (prop: { name: string; value: unknown }) =>
                      prop.name === "collectable",
                  );
                  if (
                    collectableProperty &&
                    typeof collectableProperty.value === "string"
                  ) {
                    itemId = collectableProperty.value;
                  }
                } else if (
                  typeof tile.properties === "object" &&
                  "collectable" in tile.properties
                ) {
                  const collectableValue = (
                    tile.properties as { collectable: unknown }
                  ).collectable;
                  if (typeof collectableValue === "string") {
                    itemId = collectableValue;
                  }
                }
              }

              // Check if tile has reached its collection limit
              if (itemId) {
                const limit = this.COLLECTION_LIMITS.get(itemId) || Infinity;
                if (collectionCount >= limit) {
                  continue; // Skip hidden tiles
                }
              }

              // Check for collectable property
              // In Phaser, tile properties from Tiled (including tileset-level properties)
              // are available on the tile object via tile.properties
              if (tile.properties) {
                // Handle properties as array (from Tiled JSON)
                if (Array.isArray(tile.properties)) {
                  const collectableProperty = tile.properties.find(
                    (prop: { name: string; value: unknown }) =>
                      prop.name === "collectable",
                  );
                  if (
                    collectableProperty &&
                    typeof collectableProperty.value === "string"
                  ) {
                    return {
                      itemId: collectableProperty.value,
                      tileX: checkX,
                      tileY: checkY,
                    };
                  }
                }
                // Handle properties as object (Phaser might convert it)
                else if (
                  typeof tile.properties === "object" &&
                  "collectable" in tile.properties
                ) {
                  const collectableValue = (
                    tile.properties as { collectable: unknown }
                  ).collectable;
                  if (typeof collectableValue === "string") {
                    return {
                      itemId: collectableValue,
                      tileX: checkX,
                      tileY: checkY,
                    };
                  }
                }
              }
            }
          }
        }
      }
    }

    return null;
  }

  private setupCollectionControls(): void {
    const collectKey = this.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.X,
    );

    collectKey?.on("down", () => {
      if (
        this.chatSystem?.isOpen() ||
        this.menuSystem?.isOpen() ||
        this.dialogSystem?.isVisible() ||
        this.isInventoryOpen
      ) {
        return;
      }

      const collectableData = this.checkTileProximity();
      if (collectableData) {
        const { itemId, tileX, tileY } = collectableData;

        // Check if the item type exists in inventory
        if (this.inventoryItems.has(itemId)) {
          const tileKey = `${tileX},${tileY}`;
          const currentCount = this.tileCollectionCounts.get(tileKey) || 0;
          const newCount = currentCount + 1;

          // Update collection count
          this.tileCollectionCounts.set(tileKey, newCount);

          // Get collection limit for this item type
          const limit = this.COLLECTION_LIMITS.get(itemId) || Infinity;

          // Update progress bar if item has a limit
          if (limit !== Infinity) {
            this.updateProgressBar(tileX, tileY, itemId, newCount, limit);
          }

          // If reached limit, hide the tile and remove progress bar
          if (newCount >= limit) {
            this.hideTile(tileX, tileY);
            this.removeProgressBar(tileKey);
            this.nearbyTiles.delete(tileKey);
            debugLog(
              `${itemId} at (${tileX}, ${tileY}) disappeared after ${limit} collections`,
            );
          }

          this.addItemToInventory(itemId, 1);
          this.showCollectionNotification(itemId, 1);
          this.hitSound?.play();
          debugLog(`Collected 1x ${itemId}`);
        } else {
          debugWarn(`Unknown collectable item type: ${itemId}`);
        }
      }
    });
  }

  private hideTile(tileX: number, tileY: number): void {
    if (!this.worldLayer) return;

    // Get the tile and hide it by setting alpha to 0
    const tile = this.worldLayer.getTileAt(tileX, tileY);
    if (tile) {
      tile.setAlpha(0);
      // Also remove collision if it exists
      tile.setCollision(false);
      // Play destroy sound when item is removed from screen
      this.destroySound?.play();
    }
  }

  private updateProgressBar(
    tileX: number,
    tileY: number,
    _itemId: string,
    collectionCount: number,
    limit: number,
  ): void {
    if (!this.gameMap) return;

    const tileKey = `${tileX},${tileY}`;
    const tileWidth = this.gameMap.tileWidth || 32;
    const tileHeight = this.gameMap.tileHeight || 32;

    // Calculate world position (center of tile)
    const worldX = tileX * tileWidth + tileWidth / 2;
    const worldY = tileY * tileHeight + tileHeight / 2;

    // Calculate remaining percentage
    const remainingPercentage = ((limit - collectionCount) / limit) * 100;

    // Check if progress bar already exists
    let progressBarContainer = this.tileProgressBars.get(tileKey);

    if (!progressBarContainer) {
      // Create new progress bar container
      progressBarContainer = this.add.container(
        worldX,
        worldY - tileHeight / 2 - 8,
      );
      progressBarContainer.setDepth(20); // Above tiles but below player
      progressBarContainer.setVisible(false); // Hidden by default, shown when in proximity
      this.tileProgressBars.set(tileKey, progressBarContainer);

      // Progress bar dimensions
      const barWidth = tileWidth * 0.8;
      const barHeight = 4;
      const padding = 2;

      // Background (black)
      const background = this.add.rectangle(
        0,
        0,
        barWidth + padding * 2,
        barHeight + padding * 2,
        0x000000,
        0.9,
      );
      background.setStrokeStyle(1, 0x333333, 1);
      progressBarContainer.add(background);

      // Foreground (red) - will be updated
      const foreground = this.add.rectangle(
        -barWidth / 2 + padding,
        0,
        barWidth - padding * 2,
        barHeight,
        0xff0000,
        1,
      );
      foreground.setOrigin(0, 0.5);
      progressBarContainer.add(foreground);

      // Store reference to foreground for updates
      (
        progressBarContainer as Phaser.GameObjects.Container & {
          foregroundBar?: Phaser.GameObjects.Rectangle;
        }
      ).foregroundBar = foreground;
    }

    // Update progress bar width based on remaining percentage
    const foregroundBar = (
      progressBarContainer as Phaser.GameObjects.Container & {
        foregroundBar?: Phaser.GameObjects.Rectangle;
      }
    ).foregroundBar;

    if (foregroundBar) {
      const barWidth = (this.gameMap.tileWidth || 32) * 0.8;
      const padding = 2;
      const maxWidth = barWidth - padding * 2;
      const currentWidth = (remainingPercentage / 100) * maxWidth;

      foregroundBar.setSize(Math.max(0, currentWidth), 4);
    }
  }

  private updateProgressBarsVisibility(): void {
    if (!this.player || !this.gameMap) return;

    const playerPos = this.player.getPosition();
    const tileWidth = this.gameMap.tileWidth || 32;
    const tileHeight = this.gameMap.tileHeight || 32;
    const tileX = Math.floor(playerPos.x / tileWidth);
    const tileY = Math.floor(playerPos.y / tileHeight);

    // Track which tiles are currently in proximity
    const currentNearbyTiles = new Set<string>();

    // Check tiles in a 3x3 area around the player
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const checkX = tileX + dx;
        const checkY = tileY + dy;

        const worldX = checkX * tileWidth + tileWidth / 2;
        const worldY = checkY * tileHeight + tileHeight / 2;

        const distance = Math.sqrt(
          (playerPos.x - worldX) ** 2 + (playerPos.y - worldY) ** 2,
        );

        if (distance <= COLLECTION_PROXIMITY_DISTANCE) {
          const tileKey = `${checkX},${checkY}`;
          const collectionCount = this.tileCollectionCounts.get(tileKey) || 0;

          // Check if this tile is collectable and not exhausted
          const worldLayer = this.gameMap.getLayer("World");
          if (worldLayer?.tilemapLayer) {
            const tile = worldLayer.tilemapLayer.getTileAt(checkX, checkY);
            if (tile && tile.index !== null && tile.index !== -1) {
              // Get item type
              let itemId: string | null = null;
              if (tile.properties) {
                if (Array.isArray(tile.properties)) {
                  const collectableProperty = tile.properties.find(
                    (prop: { name: string; value: unknown }) =>
                      prop.name === "collectable",
                  );
                  if (
                    collectableProperty &&
                    typeof collectableProperty.value === "string"
                  ) {
                    itemId = collectableProperty.value;
                  }
                } else if (
                  typeof tile.properties === "object" &&
                  "collectable" in tile.properties
                ) {
                  const collectableValue = (
                    tile.properties as { collectable: unknown }
                  ).collectable;
                  if (typeof collectableValue === "string") {
                    itemId = collectableValue;
                  }
                }
              }

              // Check if item has a collection limit and hasn't reached it
              if (itemId) {
                const limit = this.COLLECTION_LIMITS.get(itemId) || Infinity;
                // Only show progress bar if item has a limit, hasn't reached it, and tile is visible
                if (
                  limit !== Infinity &&
                  collectionCount < limit &&
                  tile.alpha > 0
                ) {
                  currentNearbyTiles.add(tileKey);

                  // Create progress bar if it doesn't exist
                  if (!this.tileProgressBars.has(tileKey)) {
                    this.updateProgressBar(
                      checkX,
                      checkY,
                      itemId,
                      collectionCount,
                      limit,
                    );
                  }

                  // Show progress bar
                  const progressBar = this.tileProgressBars.get(tileKey);
                  if (progressBar) {
                    progressBar.setVisible(true);
                  }
                }
              }
            }
          }
        }
      }
    }

    // Hide progress bars that are no longer in proximity
    this.tileProgressBars.forEach((progressBar, tileKey) => {
      if (!currentNearbyTiles.has(tileKey)) {
        progressBar.setVisible(false);
      }
    });

    this.nearbyTiles = currentNearbyTiles;
  }

  private removeProgressBar(tileKey: string): void {
    const progressBar = this.tileProgressBars.get(tileKey);
    if (progressBar) {
      progressBar.destroy();
      this.tileProgressBars.delete(tileKey);
    }
  }

  private setupInventoryControls(): void {
    const inventoryKey = this.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.I,
    );

    inventoryKey?.on("down", () => {
      if (
        this.chatSystem?.isOpen() ||
        this.menuSystem?.isOpen() ||
        this.dialogSystem?.isVisible()
      ) {
        return;
      }
      this.toggleInventory();
    });
  }

  private toggleInventory(): void {
    if (!this.inventoryContainer) {
      return;
    }

    this.isInventoryOpen = !this.isInventoryOpen;
    this.inventoryContainer.setVisible(this.isInventoryOpen);
  }

  private showCollectionNotification(itemId: string, quantity: number): void {
    const item = this.inventoryItems.get(itemId);
    if (!item) return;

    const padding = 16;
    const notificationWidth = 200;
    const notificationHeight = 60;
    const itemImageSize = 40;
    const spacing = 8; // Space between notifications

    // Calculate Y position based on existing notifications
    const startY = padding + notificationHeight / 2;
    const notificationY =
      startY +
      this.collectionNotifications.length * (notificationHeight + spacing);

    // Create notification container
    const notificationContainer = this.add.container(
      padding + notificationWidth / 2,
      notificationY,
    );
    notificationContainer.setScrollFactor(0);
    notificationContainer.setDepth(200);

    // Shadow background (darker, offset) with rounded corners
    const shadowOffset = 3;
    const radius = 8;
    const shadowGraphics = this.add.graphics();
    shadowGraphics.fillStyle(0x000000, 0.6);
    shadowGraphics.fillRoundedRect(
      shadowOffset - notificationWidth / 2,
      shadowOffset - notificationHeight / 2,
      notificationWidth,
      notificationHeight,
      radius,
    );
    notificationContainer.add(shadowGraphics);

    // Main background with rounded corners
    const backgroundGraphics = this.add.graphics();
    backgroundGraphics.fillStyle(0x000000, 0.5);
    backgroundGraphics.lineStyle(2, 0xffffff, 0.3);
    backgroundGraphics.fillRoundedRect(
      -notificationWidth / 2,
      -notificationHeight / 2,
      notificationWidth,
      notificationHeight,
      radius,
    );
    backgroundGraphics.strokeRoundedRect(
      -notificationWidth / 2,
      -notificationHeight / 2,
      notificationWidth,
      notificationHeight,
      radius,
    );
    notificationContainer.add(backgroundGraphics);

    // Item image
    const itemImageX = -notificationWidth / 2 + itemImageSize / 2 + 12;
    if (this.textures.exists(itemId)) {
      const itemImage = this.add.image(itemImageX, 0, itemId);
      itemImage.setDisplaySize(itemImageSize, itemImageSize);
      notificationContainer.add(itemImage);
    } else {
      const itemImage = this.add.rectangle(
        itemImageX,
        0,
        itemImageSize,
        itemImageSize,
        item.color,
        1,
      );
      itemImage.setStrokeStyle(2, 0xffffff, 0.3);
      notificationContainer.add(itemImage);
    }

    // Item name and quantity text
    const textX = itemImageX + itemImageSize / 2 + 12;
    const itemText = this.add.text(textX, -8, item.name, {
      fontFamily: "monospace",
      fontSize: "16px",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 2,
    });
    itemText.setOrigin(0, 0.5);
    notificationContainer.add(itemText);

    const quantityText = this.add.text(textX, 8, `x${quantity}`, {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#cccccc",
      stroke: "#000000",
      strokeThickness: 2,
    });
    quantityText.setOrigin(0, 0.5);
    notificationContainer.add(quantityText);

    // Add to notifications array
    this.collectionNotifications.push(notificationContainer);

    // Remove notification after 1 second
    this.time.delayedCall(1000, () => {
      this.removeCollectionNotification(notificationContainer);
    });
  }

  private removeCollectionNotification(
    notification: Phaser.GameObjects.Container,
  ): void {
    const index = this.collectionNotifications.indexOf(notification);
    if (index === -1) return;

    // Remove from array
    this.collectionNotifications.splice(index, 1);

    // Destroy the notification
    notification.destroy();

    // Update positions of remaining notifications
    this.updateNotificationPositions();
  }

  private updateNotificationPositions(): void {
    const padding = 16;
    const notificationHeight = 60;
    const spacing = 8;
    const startY = padding + notificationHeight / 2;

    this.collectionNotifications.forEach((notification, index) => {
      const newY = startY + index * (notificationHeight + spacing);
      this.tweens.add({
        targets: notification,
        y: newY,
        duration: 200,
        ease: "Power2",
      });
    });
  }
}
