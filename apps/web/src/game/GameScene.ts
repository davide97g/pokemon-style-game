/**
 * Author: Michael Hadley, mikewesthad.com
 * Asset Credits:
 *  - Tuxemon, https://github.com/Tuxemon/Tuxemon
 */

import Phaser from "phaser";
import { ASSET_PATHS } from "./config/AssetPaths";
import { OSM_CONFIG } from "./config/OSMConfig";
import { PLANETILER_CONFIG } from "./config/PlanetilerConfig";
import { Player } from "./entities/Player";
import { RemotePlayer } from "./entities/RemotePlayer";
import {
  MultiplayerService,
  type PlayerData,
} from "./services/MultiplayerService";
import {
  generateTilemapFromOSM,
  loadTilemapFromCache,
  saveTilemapToCache,
} from "./services/TilemapGenerator";
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

  // OSM Map
  private mapType: "static" | "osm" = "static";
  private loadingIndicator?: Phaser.GameObjects.Container;

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
    this.load.image("solarTiles", ASSET_PATHS.solarTiles);
    this.load.tilemapTiledJSON("map", ASSET_PATHS.map);
    this.load.atlas("atlas", ASSET_PATHS.atlas.image, ASSET_PATHS.atlas.json);
    this.load.audio("mainTheme", ASSET_PATHS.music.mainTheme);
  }

  create(): void {
    // Check if user wants OSM map
    const savedMapType = localStorage.getItem("mapType") as
      | "static"
      | "osm"
      | null;
    if (savedMapType === "osm") {
      this.mapType = "osm";
      this.loadOSMMap();
      return;
    }

    // Load static map
    this.loadStaticMap();
  }

  private loadStaticMap(): void {
    const map = this.make.tilemap({ key: "map" });
    this.gameMap = map;

    const tileset = map.addTilesetImage("tuxmon-sample-32px-extruded", "tiles");
    const solarTileset = map.addTilesetImage("solar-tileset", "solarTiles");

    if (!tileset) {
      console.error("Tileset not found");
      return;
    }

    // Create layers with both tilesets
    const tilesets = solarTileset ? [tileset, solarTileset] : [tileset];

    map.createLayer("Below Player", tilesets, 0, 0);
    const worldLayer = map.createLayer("World", tilesets, 0, 0);
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
  }

  private async loadOSMMap(): Promise<void> {
    this.showLoadingIndicator("Requesting location...");

    try {
      // Get user location
      const position = await this.getUserLocation();
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      this.updateLoadingIndicator("Loading map data...");

      // Check cache first
      let tilemapData = loadTilemapFromCache(
        lat,
        lng,
        OSM_CONFIG.defaultRadius,
      );

      if (!tilemapData) {
        // Generate new tilemap
        this.updateLoadingIndicator(
          PLANETILER_CONFIG.enabled
            ? "Loading map from tile servers..."
            : "Generating map from OSM data...",
        );
        tilemapData = await generateTilemapFromOSM(
          lat,
          lng,
          OSM_CONFIG.defaultRadius,
          PLANETILER_CONFIG.enabled,
        );

        // Cache it
        saveTilemapToCache(lat, lng, OSM_CONFIG.defaultRadius, tilemapData);
      }

      this.updateLoadingIndicator("Creating map...");

      // Phaser 3 issue: cache.tilemap.add() doesn't automatically detect format
      // Solution: Manually parse and add the tilemap data with format specification
      const tilemapDataObj = tilemapData.tilemapData;
      const cacheKey = "osm-map";

      // Remove any existing entry
      if (this.cache.tilemap.exists(cacheKey)) {
        this.cache.tilemap.remove(cacheKey);
      }

      // Create a cache entry object with format information
      // Phaser's cache expects: { format: number, data: object }
      const cacheData = {
        format: 1, // TILED_JSON format constant (1 = TILED_JSON in Phaser 3)
        data: tilemapDataObj,
      };

      // Add to cache with format specified
      this.cache.tilemap.add(cacheKey, cacheData);

      // Create tilemap from cache - Phaser should now recognize the format
      const map = this.make.tilemap({ key: cacheKey });
      this.gameMap = map;

      // Debug: log the tilemap structure
      console.log("Tilemap created. Total layers:", map.layers.length);
      console.log(
        "Available layers:",
        map.layers.map((l) => ({ id: l.id, name: l.name })),
      );
      console.log("Tilemap data keys:", Object.keys(tilemapData.tilemapData));
      console.log(
        "Tilemap layers in data:",
        tilemapData.tilemapData.layers?.length,
      );

      // Validate tilemap structure
      if (
        !tilemapData.tilemapData.layers ||
        tilemapData.tilemapData.layers.length === 0
      ) {
        console.error(
          "Tilemap has no layers. Tilemap data:",
          JSON.stringify(tilemapData.tilemapData, null, 2),
        );
        throw new Error("Tilemap has no layers - check tilemap data structure");
      }

      // Check if Phaser parsed the layers - if not, the tilemap structure might be invalid
      if (map.layers.length === 0) {
        console.error("Phaser did not parse layers from cache.");
        console.error("Tilemap data structure:", {
          hasLayers: !!tilemapData.tilemapData.layers,
          layersCount: tilemapData.tilemapData.layers?.length,
          layers: tilemapData.tilemapData.layers,
          hasTilesets: !!tilemapData.tilemapData.tilesets,
          tilesetsCount: tilemapData.tilemapData.tilesets?.length,
        });

        // Fallback: Try to manually create a minimal valid tilemap
        console.warn("Attempting to create fallback tilemap...");
        const fallbackTilemap = {
          ...tilemapData.tilemapData,
          layers: tilemapData.tilemapData.layers || [
            {
              data: new Array(
                tilemapData.tilemapData.width * tilemapData.tilemapData.height,
              ).fill(0),
              height: tilemapData.tilemapData.height,
              id: 1,
              name: "Below Player",
              opacity: 1,
              type: "tilelayer",
              visible: true,
              width: tilemapData.tilemapData.width,
              x: 0,
              y: 0,
            },
            {
              data: new Array(
                tilemapData.tilemapData.width * tilemapData.tilemapData.height,
              ).fill(0),
              height: tilemapData.tilemapData.height,
              id: 2,
              name: "World",
              opacity: 1,
              type: "tilelayer",
              visible: true,
              width: tilemapData.tilemapData.width,
              x: 0,
              y: 0,
            },
            {
              data: new Array(
                tilemapData.tilemapData.width * tilemapData.tilemapData.height,
              ).fill(0),
              height: tilemapData.tilemapData.height,
              id: 3,
              name: "Above Player",
              opacity: 1,
              type: "tilelayer",
              visible: true,
              width: tilemapData.tilemapData.width,
              x: 0,
              y: 0,
            },
          ],
        };

        this.cache.tilemap.remove("osm-map");
        this.cache.tilemap.add("osm-map", fallbackTilemap);
        const fallbackMap = this.make.tilemap({ key: "osm-map" });

        if (fallbackMap.layers.length === 0) {
          throw new Error(
            "Failed to create tilemap - Phaser could not parse the data structure",
          );
        }

        this.gameMap = fallbackMap;
        console.log(
          "Fallback tilemap created successfully with",
          fallbackMap.layers.length,
          "layers",
        );
      }

      // Add tilesets
      const tileset = map.addTilesetImage(
        "tuxmon-sample-32px-extruded",
        "tiles",
      );
      const solarTileset = map.addTilesetImage("solar-tileset", "solarTiles");

      if (!tileset) {
        throw new Error("Tileset not found");
      }

      const tilesets = solarTileset ? [tileset, solarTileset] : [tileset];

      // Create layers - use the layer names from the tilemap data
      const belowLayer = map.createLayer("Below Player", tilesets, 0, 0);
      const worldLayer = map.createLayer("World", tilesets, 0, 0);
      const aboveLayer = map.createLayer("Above Player", tilesets, 0, 0);

      if (!belowLayer || !worldLayer || !aboveLayer) {
        console.error(
          "Failed to create tilemap layers. Available layers:",
          map.layers.map((l) => l.name),
        );
        console.error(
          "Tilemap data structure:",
          JSON.stringify(tilemapData.tilemapData, null, 2),
        );
        throw new Error("Failed to create tilemap layers");
      }

      if (worldLayer) {
        worldLayer.setCollisionByProperty({ collides: true });
      }

      if (aboveLayer) {
        aboveLayer.setDepth(10);
      }

      // Use generated spawn point
      const spawnX = tilemapData.spawnX;
      const spawnY = tilemapData.spawnY;

      this.hideLoadingIndicator();

      // Setup input
      this.isMobile = isMobileDevice();
      if (this.isMobile) {
        this.virtualCursors = createVirtualCursorKeys();
        this.cursors = this.virtualCursors;
        this.setupMobileControls();
      } else {
        this.cursors = this.input.keyboard?.createCursorKeys();
      }

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

      // Start music after game loads
      this.startMusic();

      // Ensure music continues when tab loses focus
      this.setupBackgroundAudio();

      // Create volume toggle icon
      this.createVolumeToggleIcon();

      // Initialize multiplayer
      this.initMultiplayer();

      this.setupDebugControls();
      this.setupInputHandling();
    } catch (error) {
      console.error("Failed to load OSM map:", error);
      this.hideLoadingIndicator();

      // Show error and fallback to static map
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      let userMessage = "Failed to load OSM map. ";
      if (errorMessage.includes("timeout") || errorMessage.includes("504")) {
        userMessage += "The OSM server is taking too long to respond. ";
      } else if (errorMessage.includes("Geolocation")) {
        userMessage += "Could not access your location. ";
      }
      userMessage += "Falling back to static map.";

      this.showErrorDialog(userMessage, () => {
        this.mapType = "static";
        localStorage.setItem("mapType", "static");
        this.loadStaticMap();
      });
    }
  }

  private getUserLocation(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported by this browser"));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        resolve,
        (error) => {
          reject(
            new Error(
              `Geolocation error: ${error.message || "Permission denied"}`,
            ),
          );
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        },
      );
    });
  }

  private showLoadingIndicator(text: string): void {
    if (this.loadingIndicator) {
      this.loadingIndicator.destroy();
    }

    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    this.loadingIndicator = this.add.container(width / 2, height / 2);
    this.loadingIndicator.setScrollFactor(0);
    this.loadingIndicator.setDepth(1000);

    const bg = this.add.rectangle(0, 0, 400, 150, 0x000000, 0.8);
    bg.setStrokeStyle(2, 0xffffff);
    this.loadingIndicator.add(bg);

    const loadingText = this.add.text(0, -30, text, {
      fontSize: "20px",
      fontFamily: "monospace",
      color: "#ffffff",
      align: "center",
    });
    loadingText.setOrigin(0.5, 0.5);
    this.loadingIndicator.add(loadingText);

    // Store text reference for updates
    (this.loadingIndicator as any).text = loadingText;
  }

  private updateLoadingIndicator(text: string): void {
    if (this.loadingIndicator && (this.loadingIndicator as any).text) {
      (this.loadingIndicator as any).text.setText(text);
    }
  }

  private hideLoadingIndicator(): void {
    if (this.loadingIndicator) {
      this.loadingIndicator.destroy();
      this.loadingIndicator = undefined;
    }
  }

  private showErrorDialog(message: string, onClose: () => void): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    const dialog = this.add.container(width / 2, height / 2);
    dialog.setScrollFactor(0);
    dialog.setDepth(1001);

    const bg = this.add.rectangle(0, 0, 500, 200, 0x000000, 0.9);
    bg.setStrokeStyle(2, 0xff0000);
    dialog.add(bg);

    const errorText = this.add.text(0, -30, message, {
      fontSize: "18px",
      fontFamily: "monospace",
      color: "#ff6666",
      align: "center",
      wordWrap: { width: 450 },
    });
    errorText.setOrigin(0.5, 0.5);
    dialog.add(errorText);

    const okText = this.add.text(0, 50, "Press SPACE to continue", {
      fontSize: "16px",
      fontFamily: "monospace",
      color: "#ffffff",
      align: "center",
    });
    okText.setOrigin(0.5, 0.5);
    dialog.add(okText);

    const spaceKey = this.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE,
    );
    const handleSpace = () => {
      spaceKey?.off("down", handleSpace);
      dialog.destroy();
      onClose();
    };
    spaceKey?.on("down", handleSpace);
  }

  public setMapType(type: "static" | "osm"): void {
    this.mapType = type;
    localStorage.setItem("mapType", type);
  }

  public getMapType(): "static" | "osm" {
    return this.mapType;
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
    this.input.keyboard?.on("keydown-I", () => {
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
}
