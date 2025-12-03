/**
 * Author: Michael Hadley, mikewesthad.com
 * Asset Credits:
 *  - Tuxemon, https://github.com/Tuxemon/Tuxemon
 */

import Phaser from "phaser";
import { ASSET_PATHS } from "./config/AssetPaths";
import { Player } from "./entities/Player";
import {
  type GameSaveData,
  getCurrentWorldId,
  loadGame,
  saveGame,
  setCurrentWorld,
  startSession,
  stopSession,
  updatePlayTime,
} from "./services/SaveService";
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
  private aboveLayer?: Phaser.Tilemaps.TilemapLayer;

  // Systems
  private menuSystem?: MenuSystem;
  private dialogSystem?: DialogSystem;
  protected weatherSystem?: WeatherSystem;
  private chatSystem?: ChatSystem;

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

  // Tile info hover system
  private hoveredTileInfo: {
    tileX: number;
    tileY: number;
    info: string;
  } | null = null;
  private tileInfoPopup?: Phaser.GameObjects.Container;

  // Collection limits per item type
  private readonly COLLECTION_LIMITS: Map<string, number> = new Map([
    ["stone", 10],
    ["stone_dark", 10],
    ["wood", 5],
  ]);

  // Tree spawning configuration
  // TREE_TILE_GID: Use debug mode (press T) and click on a tree tile to find its GID
  // Then set this value to that GID. Default is 173 (may need adjustment)
  private readonly TREE_TILE_GID = 122;
  private readonly WOOD_REQUIRED_FOR_TREE = 4;

  // Save system
  private currentWorldId: string | null = null;
  private autoSaveInterval?: number;
  private lastSaveTime: number = 0;
  private readonly AUTO_SAVE_INTERVAL = 30000; // 30 seconds
  private readonly MIN_SAVE_INTERVAL = 2000; // Minimum 2 seconds between saves
  // Track tiles that were placed/modified by the player
  private placedTiles: Map<
    string,
    { x: number; y: number; gid: number; collides: boolean }
  > = new Map();

  // Tile grouping system for multi-tile objects using Tiled "group" property
  // Maps a tile key (x,y) to a group of related tiles with the same group value
  // Includes distance from the starting tile for flood-fill algorithm
  private tileGroups: Map<
    string,
    Array<{
      layer: "world" | "above";
      x: number;
      y: number;
      group: string;
      distance: number;
    }>
  > = new Map();

  // Helper to get a property value from a tile
  private getTileProperty(
    tile: Phaser.Tilemaps.Tile,
    propertyName: string,
  ): string | null {
    if (!tile.properties) return null;

    if (Array.isArray(tile.properties)) {
      const property = tile.properties.find(
        (prop: { name: string; value: unknown }) => prop.name === propertyName,
      );
      if (property && typeof property.value === "string") {
        return property.value;
      }
    } else if (
      typeof tile.properties === "object" &&
      propertyName in tile.properties
    ) {
      const value = (tile.properties as Record<string, unknown>)[propertyName];
      if (typeof value === "string") {
        return value;
      }
    }

    return null;
  }

  constructor() {
    super({ key: "GameScene" });
  }

  shutdown(): void {
    // Save game state before shutting down
    if (this.currentWorldId) {
      this.saveGameState();
      stopSession(this.currentWorldId);
    }

    // Clean up auto-save interval
    if (this.autoSaveInterval !== undefined) {
      clearInterval(this.autoSaveInterval);
    }

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

    // Clean up progress bars
    this.tileProgressBars.forEach((progressBar) => {
      progressBar.destroy();
    });
    this.tileProgressBars.clear();

    // Clean up tile info popup
    if (this.tileInfoPopup) {
      this.tileInfoPopup.destroy();
    }

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
    // Load tilesets
    this.load.image("tiles-grass", ASSET_PATHS.tiles.grass);
    this.load.image("tiles-plant", ASSET_PATHS.tiles.plantWithShadow);
    this.load.image("tiles-props", ASSET_PATHS.tiles.propsWithShadow);
    this.load.image("tiles-wall", ASSET_PATHS.tiles.wall);
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

    // Add all tilesets to the map
    const grassTileset = map.addTilesetImage("TX Tileset Grass", "tiles-grass");
    const plantTileset = map.addTilesetImage(
      "TX Plant with Shadow",
      "tiles-plant",
    );
    const propsTileset = map.addTilesetImage(
      "TX Props with Shadow",
      "tiles-props",
    );
    const wallTileset = map.addTilesetImage("TX Tileset Wall", "tiles-wall");

    if (!grassTileset || !plantTileset || !propsTileset || !wallTileset) {
      console.error("One or more tilesets not found");
      return;
    }
    // Create layers with all tilesets
    const tilesets = [
      grassTileset,
      plantTileset,
      propsTileset,
      wallTileset,
    ].filter((t) => t !== null) as Phaser.Tilemaps.Tileset[];

    map.createLayer("Below Player", tilesets, 0, 0);
    const worldLayer = map.createLayer("World", tilesets, 0, 0);
    this.worldLayer = worldLayer || undefined;
    const aboveLayer = map.createLayer("Above Player", tilesets, 0, 0);
    this.aboveLayer = aboveLayer || undefined;

    if (worldLayer) {
      worldLayer.setCollisionByProperty({ collides: true });
    }

    if (aboveLayer) {
      aboveLayer.setDepth(10);
    }

    // Initialize tile groups for existing trees in the map
    this.initializeTileGroups();

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

    // Use spawn point as default, but will be overridden by saved position if available
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

    this.setupDebugControls();
    this.setupInputHandling();
    this.initInventory();
    this.createInventoryUI();
    this.createInventoryRecap();
    this.setupInventoryControls();
    this.setupCollectionControls();
    this.setupTreeSpawningControls();
    this.setupTileInfoHover();

    // Initialize save system
    this.initSaveSystem();
  }

  /**
   * Initialize save system - load game state and set up auto-save
   */
  private initSaveSystem(): void {
    // Get current world ID
    this.currentWorldId = getCurrentWorldId();

    if (this.currentWorldId) {
      const worldId = this.currentWorldId;
      // Delay loading slightly to ensure map is fully initialized
      this.time.delayedCall(100, () => {
        if (this.currentWorldId === worldId) {
          this.loadGameState(worldId);
          startSession(worldId);
        }
      });
    }

    // Set up auto-save
    this.setupAutoSave();

    // Save on page unload
    window.addEventListener("beforeunload", () => {
      if (this.currentWorldId) {
        this.saveGameState();
        stopSession(this.currentWorldId);
      }
    });
  }

  /**
   * Set up auto-save interval
   */
  private setupAutoSave(): void {
    if (this.autoSaveInterval !== undefined) {
      clearInterval(this.autoSaveInterval);
    }

    this.autoSaveInterval = window.setInterval(() => {
      if (this.currentWorldId) {
        this.saveGameState();
        updatePlayTime(this.currentWorldId);
      }
    }, this.AUTO_SAVE_INTERVAL);
  }

  /**
   * Save current game state
   */
  private saveGameState(): void {
    if (!this.currentWorldId || !this.player || !this.gameMap) {
      return;
    }

    // Throttle saves to prevent too frequent writes
    const now = Date.now();
    if (now - this.lastSaveTime < this.MIN_SAVE_INTERVAL) {
      return;
    }
    this.lastSaveTime = now;

    const playerPos = this.player.getPosition();
    const playerDirection = this.player.getDirection();

    // Convert inventory Map to Record
    const inventory: Record<string, number> = {};
    this.inventoryItems.forEach((item, itemId) => {
      if (item.quantity > 0) {
        inventory[itemId] = item.quantity;
      }
    });

    // Convert tile collection counts Map to Record
    const tileCollectionCounts: Record<string, number> = {};
    this.tileCollectionCounts.forEach((count, tileKey) => {
      tileCollectionCounts[tileKey] = count;
    });

    // Collect modified tiles (trees that were placed) from tracked placed tiles
    const modifiedTiles: Array<{
      x: number;
      y: number;
      gid: number;
      collides: boolean;
    }> = [];

    // Use the tracked placed tiles map for efficiency
    this.placedTiles.forEach((tileData) => {
      // Verify the tile still exists and matches (in case map was reset)
      const tile = this.worldLayer?.getTileAt(tileData.x, tileData.y);
      if (tile?.collides) {
        modifiedTiles.push(tileData);
      }
    });

    // Collect hidden tiles (tiles that were collected and hidden)
    // Include both world and above layer tiles
    const hiddenTiles: Array<{
      x: number;
      y: number;
      layer: "world" | "above";
    }> = [];

    if (this.worldLayer) {
      // Scan world layer for hidden tiles (alpha = 0)
      for (let y = 0; y < this.gameMap.height; y += 1) {
        for (let x = 0; x < this.gameMap.width; x += 1) {
          const tile = this.worldLayer.getTileAt(x, y);
          if (tile && tile.alpha === 0) {
            hiddenTiles.push({ x, y, layer: "world" });
          }
        }
      }
    }

    if (this.aboveLayer) {
      // Scan above layer for hidden tiles (alpha = 0)
      for (let y = 0; y < this.gameMap.height; y += 1) {
        for (let x = 0; x < this.gameMap.width; x += 1) {
          const tile = this.aboveLayer.getTileAt(x, y);
          if (tile && tile.alpha === 0) {
            hiddenTiles.push({ x, y, layer: "above" });
          }
        }
      }
    }

    // Load existing save data to preserve metadata
    const existingSave = loadGame(this.currentWorldId);
    const saveData: GameSaveData = {
      worldId: this.currentWorldId,
      worldName: existingSave?.worldName || "Unknown World",
      createdAt: existingSave?.createdAt || Date.now(),
      lastPlayedAt: Date.now(),
      totalPlayTime: existingSave?.totalPlayTime || 0,
      sessionStartTime: existingSave?.sessionStartTime,
      playerPosition: {
        x: playerPos.x,
        y: playerPos.y,
        direction: playerDirection,
      },
      inventory,
      tileCollectionCounts,
      modifiedTiles,
      hiddenTiles,
      musicVolume: this.musicVolume,
      isMuted: this.isMuted,
    };

    saveGame(saveData);
    debugLog("Game state saved");
  }

  /**
   * Load game state
   */
  private loadGameState(worldId: string): void {
    const saveData = loadGame(worldId);
    if (!saveData) {
      debugLog("No save data found, starting fresh game");
      return;
    }

    if (!this.gameMap || !this.worldLayer) {
      debugWarn("Cannot load game state: map not ready");
      return;
    }

    debugLog("Loading game state for world:", saveData.worldName);

    // Check if this is a new game (no progress made)
    const isNewGame =
      saveData.playerPosition.x === 0 &&
      saveData.playerPosition.y === 0 &&
      Object.keys(saveData.inventory).length === 0 &&
      saveData.modifiedTiles.length === 0 &&
      saveData.hiddenTiles.length === 0;

    // Load player position - use spawn point for new games
    if (this.player && saveData.playerPosition) {
      let x = saveData.playerPosition.x;
      let y = saveData.playerPosition.y;

      // If it's a new game, use spawn point instead of (0, 0)
      if (isNewGame && this.gameMap) {
        const spawnPoint = this.gameMap.findObject(
          "Objects",
          (obj) => obj.name === "Spawn Point",
        );
        if (spawnPoint) {
          x = spawnPoint.x ?? 0;
          y = spawnPoint.y ?? 0;
          debugLog("New game detected, using spawn point:", x, y);
        }
      }

      this.player.getSprite().setPosition(x, y);
    }

    // Load inventory
    if (saveData.inventory) {
      Object.entries(saveData.inventory).forEach(([itemId, quantity]) => {
        const item = this.inventoryItems.get(itemId);
        if (item) {
          item.quantity = quantity;
        }
      });
      this.updateInventoryDisplay();
    }

    // Load tile collection counts
    if (saveData.tileCollectionCounts) {
      Object.entries(saveData.tileCollectionCounts).forEach(
        ([tileKey, count]) => {
          this.tileCollectionCounts.set(tileKey, count);
        },
      );
    }

    // Restore modified tiles (trees that were placed)
    if (saveData.modifiedTiles && this.worldLayer) {
      this.placedTiles.clear(); // Clear existing tracking
      saveData.modifiedTiles.forEach((tileData) => {
        this.worldLayer?.putTileAt(tileData.gid, tileData.x, tileData.y);
        const tile = this.worldLayer?.getTileAt(tileData.x, tileData.y);
        if (tile) {
          tile.setCollision(tileData.collides);
          // Track this restored tile
          const tileKey = `${tileData.x},${tileData.y}`;
          this.placedTiles.set(tileKey, tileData);
        }
      });
      debugLog(`Restored ${saveData.modifiedTiles.length} placed tiles`);
    }

    // Restore hidden tiles (tiles that were collected)
    // Handle both world and above layer tiles
    if (saveData.hiddenTiles) {
      saveData.hiddenTiles.forEach((tileData) => {
        // Support both old format (without layer) and new format (with layer)
        const layer =
          "layer" in tileData && tileData.layer === "above"
            ? this.aboveLayer
            : this.worldLayer;

        if (layer) {
          const tile = layer.getTileAt(tileData.x, tileData.y);
          if (tile) {
            tile.setAlpha(0);
            if (layer === this.worldLayer) {
              tile.setCollision(false);
            }
          }
        }
      });

      // Rebuild tile groups for trees that were hidden
      // This ensures groups are properly tracked even after loading
      this.initializeTileGroups();
    }

    // Load music settings
    if (saveData.musicVolume !== undefined) {
      this.musicVolume = saveData.musicVolume;
      this.setMusicVolume(saveData.musicVolume);
    }
    if (saveData.isMuted !== undefined) {
      this.isMuted = saveData.isMuted;
      if (this.mainThemeMusic) {
        if (this.isMuted) {
          this.mainThemeMusic.setVolume(0);
        } else {
          this.mainThemeMusic.setVolume(this.musicVolume);
        }
      }
      this.updateVolumeIcon();
    }

    debugLog("Game state loaded successfully");
  }

  /**
   * Set the current world ID (called from Game component)
   */
  public setWorldId(worldId: string): void {
    this.currentWorldId = worldId;
    setCurrentWorld(worldId);
    if (this.currentWorldId) {
      // Delay loading to ensure map is ready
      this.time.delayedCall(200, () => {
        if (this.currentWorldId) {
          this.loadGameState(this.currentWorldId);
          startSession(this.currentWorldId);
        }
      });
    }
  }

  /**
   * Schedule a save (throttled to prevent too frequent saves)
   * This is now handled by calling saveGameState() directly when needed
   */
  private scheduleSave(): void {
    // Trigger save if enough time has passed since last save
    const now = Date.now();
    if (now - this.lastSaveTime >= this.MIN_SAVE_INTERVAL) {
      this.saveGameState();
    }
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
          // Get the correct tileset for this tile
          const tileset = tile.tileset;
          const firstGID = tileset?.firstgid || 1;

          // Calculate the correct GID using the tile's actual tileset
          // tile.index is the local index within the tileset, so we add firstgid to get the global GID
          const tileGID = tile.index + firstGID;

          const tileX = Math.floor(worldX / (this.gameMap?.tileWidth || 0));
          const tileY = Math.floor(worldY / (this.gameMap?.tileHeight || 0));

          debugLog(`\n=== Tile Info ===`);
          debugLog(`Layer: ${layerName}`);
          debugLog(`Position: (${tileX}, ${tileY})`);
          debugLog(`Tile Index (local): ${tile.index}`);
          debugLog(`Tileset: ${tileset?.name || "unknown"}`);
          debugLog(`Tileset firstGID: ${firstGID}`);
          debugLog(`Tile GID (Global ID): ${tileGID}`);
          debugLog(`Collides: ${tile.collides || false}`);
          if (tile.properties) {
            debugLog(`Properties:`, tile.properties);
          }
          debugLog(`\n=== Summary ===`);
          debugLog(`Tile GID: ${tileGID}`);
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

    // Periodically save player position (throttled)
    const now = Date.now();
    if (now - this.lastSaveTime > this.MIN_SAVE_INTERVAL * 2) {
      // Save position every 4 seconds if player is moving
      if (this.player.isMoving()) {
        this.saveGameState();
      }
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
      // Trigger save after inventory change
      this.scheduleSave();
    }
  }

  private removeItemFromInventory(
    itemId: string,
    quantity: number = 1,
  ): boolean {
    const item = this.inventoryItems.get(itemId);
    if (item && item.quantity >= quantity) {
      item.quantity -= quantity;
      this.updateInventoryDisplay();
      // Trigger save after inventory change
      this.scheduleSave();
      return true;
    }
    return false;
  }

  private getItemQuantity(itemId: string): number {
    const item = this.inventoryItems.get(itemId);
    return item?.quantity || 0;
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

          // Trigger save after collection
          this.scheduleSave();

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

  private setupTreeSpawningControls(): void {
    const spawnTreeKey = this.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.B,
    );

    spawnTreeKey?.on("down", () => {
      if (
        this.chatSystem?.isOpen() ||
        this.menuSystem?.isOpen() ||
        this.dialogSystem?.isVisible() ||
        this.isInventoryOpen
      ) {
        return;
      }

      this.handleSpawnTree();
    });
  }

  private setupTileInfoHover(): void {
    // Set up mouse move handler to detect tiles with "info" property
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      this.handleTileInfoHover(pointer);
    });

    // Set up mouse out handler to hide popup
    this.input.on("pointerout", () => {
      this.hideTileInfoPopup();
      this.hoveredTileInfo = null;
    });

    // Set up "a" key handler to show info in dialog
    const aKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.A);

    aKey?.on("down", () => {
      if (
        this.chatSystem?.isOpen() ||
        this.menuSystem?.isOpen() ||
        this.dialogSystem?.isVisible() ||
        this.isInventoryOpen
      ) {
        return;
      }

      if (this.hoveredTileInfo) {
        this.showTileInfoInDialog(this.hoveredTileInfo.info);
      }
    });
  }

  private handleTileInfoHover(pointer: Phaser.Input.Pointer): void {
    if (!this.gameMap || !this.worldLayer) return;

    const worldX = pointer.worldX;
    const worldY = pointer.worldY;

    const tile = this.worldLayer.getTileAtWorldXY(worldX, worldY);
    if (!tile || tile.index === null || tile.index === -1) {
      this.hideTileInfoPopup();
      this.hoveredTileInfo = null;
      return;
    }

    // Check if tile has "info" property
    let infoText: string | null = null;
    if (tile.properties) {
      if (Array.isArray(tile.properties)) {
        const infoProperty = tile.properties.find(
          (prop: { name: string; value: unknown }) => prop.name === "info",
        );
        if (infoProperty && typeof infoProperty.value === "string") {
          infoText = infoProperty.value;
        }
      } else if (
        typeof tile.properties === "object" &&
        "info" in tile.properties
      ) {
        const infoValue = (tile.properties as { info: unknown }).info;
        if (typeof infoValue === "string") {
          infoText = infoValue;
        }
      }
    }

    if (infoText) {
      const tileX = tile.x;
      const tileY = tile.y;
      this.hoveredTileInfo = { tileX, tileY, info: infoText };
      this.showTileInfoPopup(tileX, tileY);
    } else {
      this.hideTileInfoPopup();
      this.hoveredTileInfo = null;
    }
  }

  private showTileInfoPopup(tileX: number, tileY: number): void {
    if (!this.gameMap) return;

    const tileWidth = this.gameMap.tileWidth || 32;
    const tileHeight = this.gameMap.tileHeight || 32;

    // Calculate world position (center of tile)
    const worldX = tileX * tileWidth + tileWidth / 2;
    const worldY = tileY * tileHeight + tileHeight / 2;

    // Create or update popup
    if (!this.tileInfoPopup) {
      this.tileInfoPopup = this.add.container(
        worldX,
        worldY - tileHeight / 2 - 8,
      );
      this.tileInfoPopup.setDepth(20); // Above tiles but below player

      // Popup dimensions
      const popupSize = 24;
      const padding = 4;

      // Background (similar to progress bar)
      const background = this.add.rectangle(
        0,
        0,
        popupSize + padding * 2,
        popupSize + padding * 2,
        0x000000,
        0.9,
      );
      background.setStrokeStyle(1, 0x333333, 1);
      this.tileInfoPopup.add(background);

      // Info icon (simple "i" text or graphics)
      const infoIcon = this.add.graphics();
      infoIcon.lineStyle(2, 0x4ecdc4, 1);
      // Draw "i" icon - circle with dot
      infoIcon.strokeCircle(0, 0, popupSize / 2 - 2);
      infoIcon.fillStyle(0x4ecdc4, 1);
      infoIcon.fillCircle(0, -popupSize / 4, 2);
      this.tileInfoPopup.add(infoIcon);
    } else {
      // Update position
      this.tileInfoPopup.setPosition(worldX, worldY - tileHeight / 2 - 8);
    }

    this.tileInfoPopup.setVisible(true);
  }

  private hideTileInfoPopup(): void {
    if (this.tileInfoPopup) {
      this.tileInfoPopup.setVisible(false);
    }
  }

  private showTileInfoInDialog(infoText: string): void {
    if (!this.dialogSystem) return;

    // Show info text in dialog box with typing effect
    this.dialogSystem.showDialog(infoText);
  }

  private handleSpawnTree(): void {
    if (!this.player || !this.gameMap || !this.worldLayer) {
      return;
    }

    // Check if player has enough wood
    const woodQuantity = this.getItemQuantity("wood");
    if (woodQuantity < this.WOOD_REQUIRED_FOR_TREE) {
      debugLog(
        `Not enough wood! Need ${this.WOOD_REQUIRED_FOR_TREE}, have ${woodQuantity}`,
      );
      return;
    }

    // Get player position and convert to tile coordinates
    const playerPos = this.player.getPosition();
    const tileWidth = this.gameMap.tileWidth || 32;
    const tileHeight = this.gameMap.tileHeight || 32;
    const tileX = Math.floor(playerPos.x / tileWidth);
    const tileY = Math.floor(playerPos.y / tileHeight);

    // Check if the tile is already occupied (has a colliding tile)
    const existingTile = this.worldLayer.getTileAt(tileX, tileY);
    if (existingTile?.collides) {
      debugLog(`Cannot spawn tree at (${tileX}, ${tileY}) - tile is occupied`);
      return;
    }

    // Place the tree tile using the GID directly
    // putTileAt expects a tile index (GID)
    this.worldLayer.putTileAt(this.TREE_TILE_GID, tileX, tileY);

    // Set collision property for the tree
    const newTile = this.worldLayer.getTileAt(tileX, tileY);
    if (newTile) {
      newTile.setCollision(true);

      // Track this placed tile
      const tileKey = `${tileX},${tileY}`;
      const tileGID = this.TREE_TILE_GID;
      this.placedTiles.set(tileKey, {
        x: tileX,
        y: tileY,
        gid: tileGID,
        collides: true,
      });

      // Create a tile group for this tree using group property
      // Check if the tile has a group property
      const tileGroup = this.getTileProperty(newTile, "group");
      if (tileGroup && this.aboveLayer) {
        // Find all tiles with the same group value nearby
        const group = this.findTilesByGroup(tileGroup, tileX, tileY);
        if (group && group.length > 0) {
          this.tileGroups.set(tileKey, group);
          debugLog(
            `Created tile group for spawned object with group "${tileGroup}" at (${tileX}, ${tileY}) with ${group.length} tiles`,
          );
        }
      }
    }

    // Remove wood from inventory
    const removed = this.removeItemFromInventory(
      "wood",
      this.WOOD_REQUIRED_FOR_TREE,
    );
    if (removed) {
      this.destroySound?.play();
      debugLog(
        `Spawned tree at (${tileX}, ${tileY}) using ${this.WOOD_REQUIRED_FOR_TREE} wood`,
      );
      // Trigger immediate save after placing tree
      this.saveGameState();
    }
  }

  /**
   * Initialize tile groups for multi-tile objects using Tiled "group" property
   * Scans all layers to find tiles with a "group" property and groups nearby tiles with the same group value
   */
  private initializeTileGroups(): void {
    if (!this.gameMap || !this.worldLayer || !this.aboveLayer) return;

    // Track which tiles have already been processed to avoid duplicates
    const processedTiles = new Set<string>();

    // Scan both layers for tiles with a "group" property
    const layersToScan: Array<{
      layer: Phaser.Tilemaps.TilemapLayer;
      layerName: "world" | "above";
    }> = [
      { layer: this.worldLayer, layerName: "world" },
      { layer: this.aboveLayer, layerName: "above" },
    ];

    for (const { layer, layerName } of layersToScan) {
      for (let y = 0; y < this.gameMap.height; y += 1) {
        for (let x = 0; x < this.gameMap.width; x += 1) {
          const tileKey = `${x},${y}`;
          const fullKey = `${layerName}:${tileKey}`;

          // Skip if already processed
          if (processedTiles.has(fullKey)) {
            continue;
          }

          const tile = layer.getTileAt(x, y);
          if (!tile || tile.index === null || tile.index === -1) {
            continue;
          }

          // Get the "group" property from this tile
          const tileGroup = this.getTileProperty(tile, "group");
          if (!tileGroup) {
            continue; // Skip tiles without a group property
          }

          // Find all nearby tiles with the same group value (within 1 tile radius)
          const group = this.findTilesByGroup(tileGroup, x, y);
          if (group && group.length > 0) {
            // Mark all tiles in this group as processed
            group.forEach((tileInfo) => {
              const processedKey = `${tileInfo.layer}:${tileInfo.x},${tileInfo.y}`;
              processedTiles.add(processedKey);
            });

            // Store the group using the first tile's position as the key
            this.tileGroups.set(tileKey, group);

            // Also store the group for all other tiles in the group for quick lookup
            group.forEach((tileInfo) => {
              const infoKey = `${tileInfo.x},${tileInfo.y}`;
              if (infoKey !== tileKey) {
                this.tileGroups.set(infoKey, group);
              }
            });

            const maxDistance = Math.max(...group.map((t) => t.distance));
            debugLog(
              `Created tile group for group "${tileGroup}" at (${x}, ${y}) with ${group.length} tiles (max distance: ${maxDistance})`,
            );
          }
        }
      }
    }
  }

  /**
   * Get the tile group for a given tile position using the "group" property
   * Returns all tiles that belong to the same group
   */
  private getTileGroup(
    tileX: number,
    tileY: number,
  ): Array<{
    layer: "world" | "above";
    x: number;
    y: number;
    group: string;
    distance: number;
  }> | null {
    debugLog(`\n[getTileGroup] Looking for group at (${tileX}, ${tileY})`);

    // First, try to get the group directly
    const groupKey = `${tileX},${tileY}`;
    let group = this.tileGroups.get(groupKey);

    if (group) {
      debugLog(`[getTileGroup] Found cached group with ${group.length} tiles`);
      return group;
    }

    debugLog(`[getTileGroup] No cached group found, searching...`);

    // If not found, check if this tile has a class and find its group
    // Check both layers for the tile
    const layersToCheck: Array<{
      layer: Phaser.Tilemaps.TilemapLayer | undefined;
      layerName: "world" | "above";
    }> = [
      { layer: this.worldLayer, layerName: "world" },
      { layer: this.aboveLayer, layerName: "above" },
    ];

    for (const { layer, layerName } of layersToCheck) {
      if (!layer) {
        debugLog(`[getTileGroup] ${layerName} layer not available`);
        continue;
      }

      const tile = layer.getTileAt(tileX, tileY);
      if (!tile || tile.index === null || tile.index === -1) {
        debugLog(
          `[getTileGroup] No tile at (${tileX}, ${tileY}) on ${layerName} layer`,
        );
        continue;
      }

      debugLog(
        `[getTileGroup] Found tile at (${tileX}, ${tileY}) on ${layerName} layer, index: ${tile.index}`,
      );

      const tileGroup = this.getTileProperty(tile, "group");
      debugLog(`[getTileGroup] Tile group property: "${tileGroup || "none"}"`);

      if (tileGroup) {
        // Find all tiles with the same group value in nearby positions
        debugLog(
          `[getTileGroup] Searching for tiles with group "${tileGroup}" near (${tileX}, ${tileY})`,
        );
        group = this.findTilesByGroup(tileGroup, tileX, tileY) || [];
        if (group && group.length > 0) {
          debugLog(
            `[getTileGroup] Found ${group.length} tiles with group "${tileGroup}"`,
          );
          // Cache this group for future lookups
          this.tileGroups.set(groupKey, group);
          break;
        } else {
          debugLog(`[getTileGroup] No tiles found with group "${tileGroup}"`);
        }
      }
    }

    if (!group) {
      debugLog(
        `[getTileGroup] No group found for position (${tileX}, ${tileY})`,
      );
    }

    return group || null;
  }

  /**
   * Find all tiles with the same group value using flood-fill algorithm
   * Recursively checks adjacent tiles (up, down, left, right) with the same group
   * Uses iterative queue-based approach to avoid stack overflow
   */
  private findTilesByGroup(
    targetGroup: string,
    centerX: number,
    centerY: number,
  ): Array<{
    layer: "world" | "above";
    x: number;
    y: number;
    group: string;
    distance: number;
  }> | null {
    if (!this.gameMap || !this.worldLayer || !this.aboveLayer) {
      debugLog(`[findTilesByGroup] Missing layers or map`);
      return null;
    }

    debugLog(
      `[findTilesByGroup] Starting flood-fill search for group "${targetGroup}" from (${centerX}, ${centerY})`,
    );

    const group: Array<{
      layer: "world" | "above";
      x: number;
      y: number;
      group: string;
      distance: number;
    }> = [];

    // Track visited tiles to avoid processing the same tile twice
    const visited = new Set<string>();

    // Queue for iterative flood-fill (avoids stack overflow)
    // Each item: { layer, layerName, x, y, distance }
    interface QueueItem {
      layer: Phaser.Tilemaps.TilemapLayer;
      layerName: "world" | "above";
      x: number;
      y: number;
      distance: number;
    }

    const queue: QueueItem[] = [];

    const layersToCheck: Array<{
      layer: Phaser.Tilemaps.TilemapLayer;
      layerName: "world" | "above";
    }> = [
      { layer: this.worldLayer, layerName: "world" },
      { layer: this.aboveLayer, layerName: "above" },
    ];

    // Add initial tiles to queue (check both layers at center position)
    for (const { layer, layerName } of layersToCheck) {
      const tile = layer.getTileAt(centerX, centerY);
      if (tile && tile.index !== null && tile.index !== -1) {
        const tileGroup = this.getTileProperty(tile, "group");
        if (tileGroup === targetGroup) {
          const key = `${layerName}:${centerX},${centerY}`;
          if (!visited.has(key)) {
            visited.add(key);
            queue.push({
              layer,
              layerName,
              x: centerX,
              y: centerY,
              distance: 0,
            });
            group.push({
              layer: layerName,
              x: centerX,
              y: centerY,
              group: targetGroup,
              distance: 0,
            });
            debugLog(
              `[findTilesByGroup] Added initial tile at (${centerX}, ${centerY}) on ${layerName} layer`,
            );
          }
        }
      }
    }

    // Process queue iteratively (flood-fill)
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;

      const { x, y, distance } = current;

      // Check adjacent tiles (up, down, left, right - not diagonal)
      const directions = [
        { dx: 0, dy: -1 }, // up
        { dx: 0, dy: 1 }, // down
        { dx: -1, dy: 0 }, // left
        { dx: 1, dy: 0 }, // right
      ];

      for (const { dx, dy } of directions) {
        const checkX = x + dx;
        const checkY = y + dy;
        const newDistance = distance + 1;

        // Skip out of bounds
        if (
          checkX < 0 ||
          checkX >= this.gameMap.width ||
          checkY < 0 ||
          checkY >= this.gameMap.height
        ) {
          continue;
        }

        // Check both layers at this position
        for (const {
          layer: checkLayer,
          layerName: checkLayerName,
        } of layersToCheck) {
          const key = `${checkLayerName}:${checkX},${checkY}`;

          // Skip if already visited
          if (visited.has(key)) {
            continue;
          }

          const tile = checkLayer.getTileAt(checkX, checkY);
          if (!tile || tile.index === null || tile.index === -1) {
            continue;
          }

          const tileGroup = this.getTileProperty(tile, "group");
          debugLog(
            `[findTilesByGroup] Checking tile at (${checkX}, ${checkY}) on ${checkLayerName} layer - group: "${
              tileGroup || "none"
            }", distance: ${newDistance}`,
          );

          if (tileGroup === targetGroup) {
            visited.add(key);
            queue.push({
              layer: checkLayer,
              layerName: checkLayerName,
              x: checkX,
              y: checkY,
              distance: newDistance,
            });
            group.push({
              layer: checkLayerName,
              x: checkX,
              y: checkY,
              group: targetGroup,
              distance: newDistance,
            });
            debugLog(
              `[findTilesByGroup] ✓ Added adjacent tile at (${checkX}, ${checkY}) on ${checkLayerName} layer (distance: ${newDistance})`,
            );
          }
        }
      }
    }

    debugLog(
      `[findTilesByGroup] Found ${group.length} connected tiles with group "${targetGroup}"`,
    );
    return group.length > 0 ? group : null;
  }

  /**
   * Hide a tile and all tiles in its group (e.g., tree base + tree top)
   */
  private hideTile(tileX: number, tileY: number): void {
    if (!this.worldLayer || !this.aboveLayer) return;

    debugLog(`\n=== hideTile called for position (${tileX}, ${tileY}) ===`);

    // Get the tile group for this position
    const group = this.getTileGroup(tileX, tileY);

    if (group) {
      debugLog(`Found tile group with ${group.length} tiles:`);
      const maxDistance = Math.max(...group.map((t) => t.distance));

      // Log all tiles about to be destroyed with their properties
      console.log(
        `\n=== TILES ABOUT TO BE DESTROYED (${group.length} tiles) ===`,
      );

      // Collect all tile information first
      const tileData = group.map((tileInfo, index) => {
        const layer =
          tileInfo.layer === "world" ? this.worldLayer : this.aboveLayer;
        const tile = layer?.getTileAt(tileInfo.x, tileInfo.y);

        const tileStamp = tile ? this.getTileProperty(tile, "tilestamp") : null;
        const tileGID = tile
          ? tile.index !== null && tile.index !== -1
            ? tile.index + (tile.tileset?.firstgid || 1)
            : null
          : null;

        return {
          index,
          layer: tileInfo.layer,
          position: { x: tileInfo.x, y: tileInfo.y },
          group: tileInfo.group,
          distance: tileInfo.distance,
          tilestamp: tileStamp || null,
          gid: tileGID,
          tileIndex: tile?.index,
          hasTile: !!tile,
        };
      });

      // Log each tile
      tileData.forEach((data) => {
        console.log(`[${data.index}] Tile Info:`, {
          layer: data.layer,
          position: `(${data.position.x}, ${data.position.y})`,
          group: data.group,
          distance: data.distance,
          tilestamp: data.tilestamp || "none",
          gid: data.gid,
          tileIndex: data.tileIndex,
          hasTile: data.hasTile,
        });

        debugLog(
          `  [${data.index}] Layer: ${data.layer}, Position: (${
            data.position.x
          }, ${data.position.y}), Group: "${data.group}", Distance: ${
            data.distance
          }, TileStamp: "${data.tilestamp || "none"}"`,
        );
      });

      // Group tiles by tilestamp and show matches
      const tilesByStamp = new Map<string, typeof tileData>();
      tileData.forEach((data) => {
        if (data.tilestamp) {
          if (!tilesByStamp.has(data.tilestamp)) {
            tilesByStamp.set(data.tilestamp, []);
          }
          tilesByStamp.get(data.tilestamp)?.push(data);
        }
      });

      if (tilesByStamp.size > 0) {
        console.log(`\n=== TILES GROUPED BY TILESTAMP ===`);
        tilesByStamp.forEach((tiles, stamp) => {
          console.log(`TileStamp "${stamp}": ${tiles.length} tile(s)`);
          tiles.forEach((tile) => {
            console.log(
              `  - ${tile.layer} layer at (${tile.position.x}, ${tile.position.y}), distance: ${tile.distance}`,
            );
          });
        });
        console.log(`=== END OF TILESTAMP GROUPS ===\n`);
      } else {
        console.log(`\n⚠️  No tiles have a "tilestamp" property\n`);
      }

      console.log(`=== END OF TILES TO BE DESTROYED ===\n`);
      debugLog(`  Max distance from center: ${maxDistance}`);

      // Hide all tiles in the group
      let hiddenCount = 0;
      group.forEach((tileInfo) => {
        const layer =
          tileInfo.layer === "world" ? this.worldLayer : this.aboveLayer;
        if (!layer) {
          debugLog(
            `  WARNING: Layer ${tileInfo.layer} not found for tile at (${tileInfo.x}, ${tileInfo.y})`,
          );
          return;
        }

        const tile = layer.getTileAt(tileInfo.x, tileInfo.y);

        if (tile) {
          const beforeAlpha = tile.alpha;
          tile.setAlpha(0);
          // Remove collision for world layer tiles
          if (tileInfo.layer === "world") {
            tile.setCollision(false);
          }
          hiddenCount += 1;
          debugLog(
            `  ✓ Hidden tile at (${tileInfo.x}, ${tileInfo.y}) on ${tileInfo.layer} layer (alpha: ${beforeAlpha} -> 0)`,
          );
        } else {
          debugLog(
            `  ✗ Tile not found at (${tileInfo.x}, ${tileInfo.y}) on ${tileInfo.layer} layer`,
          );
        }
      });

      // Remove the group from tracking
      const groupKey = `${tileX},${tileY}`;
      this.tileGroups.delete(groupKey);

      const groupValue = group[0]?.group || "unknown";
      debugLog(
        `Destroyed tile group (group: "${groupValue}") at (${tileX}, ${tileY}) - ${hiddenCount}/${group.length} tiles hidden`,
      );
    } else {
      debugLog(`No tile group found for position (${tileX}, ${tileY})`);
      // Check if tile has a group property
      const worldTile = this.worldLayer.getTileAt(tileX, tileY);
      const aboveTile = this.aboveLayer.getTileAt(tileX, tileY);

      if (worldTile) {
        const worldGroup = this.getTileProperty(worldTile, "group");
        debugLog(`  World layer tile group: ${worldGroup || "none"}`);
      }
      if (aboveTile) {
        const aboveGroup = this.getTileProperty(aboveTile, "group");
        debugLog(`  Above layer tile group: ${aboveGroup || "none"}`);
      }

      // Fallback: hide single tile if no group found
      const tile = this.worldLayer.getTileAt(tileX, tileY);
      if (tile) {
        tile.setAlpha(0);
        tile.setCollision(false);
        debugLog(`  Fallback: Hidden single tile at (${tileX}, ${tileY})`);
      }
    }

    debugLog(`=== hideTile finished ===\n`);

    // Play destroy sound when item is removed from screen
    this.destroySound?.play();
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
