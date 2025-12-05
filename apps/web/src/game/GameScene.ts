/**
 * Author: Michael Hadley, mikewesthad.com
 * Asset Credits:
 *  - Tuxemon, https://github.com/Tuxemon/Tuxemon
 */

import Phaser from "phaser";
import { ASSET_PATHS } from "./config/AssetPaths";
import { AUTO_SAVE_INTERVAL, MIN_SAVE_INTERVAL } from "./config/GameConstants";
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
import { AudioSystem } from "./systems/AudioSystem";
import { ChatSystem } from "./systems/ChatSystem";
import { CollectionSystem } from "./systems/CollectionSystem";
import { DialogSystem } from "./systems/DialogSystem";
import { InventorySystem } from "./systems/InventorySystem";
import { MenuSystem } from "./systems/MenuSystem";
import { TileManagementSystem } from "./systems/TileManagementSystem";
import { WeatherSystem } from "./systems/WeatherSystem";
import { debugLog, debugWarn } from "./utils/DebugUtils";
import { gameEventBus } from "./utils/GameEventBus";
import {
  createVirtualCursorKeys,
  isMobileDevice,
  type VirtualCursorKeys,
} from "./utils/MobileUtils";
import { getTileProperty } from "./utils/TileUtils";

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
  private audioSystem?: AudioSystem;
  private inventorySystem?: InventorySystem;
  private collectionSystem?: CollectionSystem;
  private tileManagementSystem?: TileManagementSystem;

  // Tile info hover system
  private hoveredTileInfo: {
    tileX: number;
    tileY: number;
    info: string;
  } | null = null;
  private tileInfoPopup?: Phaser.GameObjects.Container;

  // Save system
  private currentWorldId: string | null = null;
  private autoSaveInterval?: number;
  private lastSaveTime: number = 0;

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

    // Clean up systems
    this.collectionSystem?.shutdown();
    this.audioSystem?.shutdown();

    // Clean up tile info popup
    if (this.tileInfoPopup) {
      this.tileInfoPopup.destroy();
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

    // Initialize audio system
    this.audioSystem = new AudioSystem(this);
    this.audioSystem.init();
    this.audioSystem.startMusic();
    this.audioSystem.setupBackgroundAudio();
    this.audioSystem.createVolumeToggleIcon();

    // Initialize inventory system
    this.inventorySystem = new InventorySystem();
    this.inventorySystem.init();
    // UI is now handled by React components
    this.inventorySystem.setOnInventoryChange(() => {
      this.scheduleSave();
    });

    // Initialize collection system
    if (!this.inventorySystem) {
      console.error("Inventory system not initialized");
      return;
    }
    this.collectionSystem = new CollectionSystem(
      this,
      this.inventorySystem.getInventoryItems(),
    );
    this.collectionSystem.setGameMap(this.gameMap);
    this.collectionSystem.setWorldLayer(this.worldLayer);
    this.collectionSystem.setPlayer(this.player);
    this.collectionSystem.setOnItemCollected((itemId, quantity) => {
      if (this.inventorySystem) {
        this.inventorySystem.addItem(itemId, quantity);
      }
    });
    this.collectionSystem.setOnCollectionCountChanged(() => {
      this.scheduleSave();
    });
    this.collectionSystem.setOnPlayHitSound(() => {
      this.audioSystem?.playHitSound();
    });

    // Initialize tile management system
    this.tileManagementSystem = new TileManagementSystem(this);
    this.tileManagementSystem.setGameMap(this.gameMap);
    this.tileManagementSystem.setWorldLayer(this.worldLayer);
    this.tileManagementSystem.setAboveLayer(this.aboveLayer);
    this.tileManagementSystem.setPlayer(this.player);
    this.tileManagementSystem.setOnGetItemQuantity((itemId) => {
      return this.inventorySystem?.getItemQuantity(itemId) || 0;
    });
    this.tileManagementSystem.setOnRemoveItem((itemId, quantity) => {
      return this.inventorySystem?.removeItem(itemId, quantity) || false;
    });
    this.tileManagementSystem.setOnPlayDestroySound(() => {
      this.audioSystem?.playDestroySound();
    });
    this.tileManagementSystem.setOnSaveGame(() => {
      this.saveGameState();
    });
    this.tileManagementSystem.initializeTileGroups();

    if (oldStatue) {
      this.chatSystem?.setStatuePosition({
        x: oldStatue.x ?? 0,
        y: oldStatue.y ?? 0,
      });
    }

    this.setupDebugControls();
    this.setupInputHandling();
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
    }, AUTO_SAVE_INTERVAL);
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
    if (now - this.lastSaveTime < MIN_SAVE_INTERVAL) {
      return;
    }
    this.lastSaveTime = now;

    const playerPos = this.player.getPosition();
    const playerDirection = this.player.getDirection();

    // Get inventory data from inventory system
    const inventory = this.inventorySystem?.getInventoryData() || {};

    // Get tile collection counts from collection system
    const tileCollectionCounts =
      this.collectionSystem?.getTileCollectionCounts() || {};

    // Get modified tiles from tile management system
    const modifiedTiles = this.tileManagementSystem?.getPlacedTiles() || [];

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
      musicVolume: this.audioSystem?.getMusicVolumeForSave() || 0.5,
      isMuted: this.audioSystem?.getMutedStateForSave() || false,
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
    if (saveData.inventory && this.inventorySystem) {
      this.inventorySystem.loadInventoryData(saveData.inventory);
    }

    // Load tile collection counts
    if (saveData.tileCollectionCounts && this.collectionSystem) {
      this.collectionSystem.loadTileCollectionCounts(
        saveData.tileCollectionCounts,
      );
    }

    // Restore modified tiles (trees that were placed)
    if (saveData.modifiedTiles && this.tileManagementSystem) {
      this.tileManagementSystem.loadPlacedTiles(saveData.modifiedTiles);
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
      this.tileManagementSystem?.initializeTileGroups();
    }

    // Load music settings
    if (this.audioSystem) {
      this.audioSystem.loadMusicSettings(
        saveData.musicVolume,
        saveData.isMuted,
      );
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
    if (now - this.lastSaveTime >= MIN_SAVE_INTERVAL) {
      this.saveGameState();
    }
  }

  /**
   * Get current music volume (delegates to AudioSystem)
   * Used by MenuSystem for volume slider
   */
  public getMusicVolume(): number {
    return this.audioSystem?.getMusicVolume() || 0.5;
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
      this.audioSystem?.setMusicVolume(volume);
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
        gameEventBus.emit("dialog:advance");
      } else if (!this.menuSystem?.isOpen()) {
        this.menuSystem?.toggleMenu();
      }
    });

    enterKey?.on("down", () => {
      if (this.chatSystem?.isOpen()) return;
      if (this.dialogSystem?.isVisible()) {
        this.dialogSystem.handleAdvance();
        gameEventBus.emit("dialog:advance");
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
      this.inventorySystem?.isOpen()
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
    this.collectionSystem?.updateProgressBarsVisibility();

    // Periodically save player position (throttled)
    const now = Date.now();
    if (now - this.lastSaveTime > MIN_SAVE_INTERVAL * 2) {
      // Save position every 4 seconds if player is moving
      if (this.player.isMoving()) {
        this.saveGameState();
      }
    }
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
        this.inventorySystem?.isOpen()
      ) {
        return;
      }

      const collectableData = this.collectionSystem?.checkTileProximity();
      if (
        collectableData &&
        this.collectionSystem &&
        this.tileManagementSystem
      ) {
        this.collectionSystem.collectItem(
          collectableData.itemId,
          collectableData.tileX,
          collectableData.tileY,
          (tileX, tileY) => {
            this.tileManagementSystem?.hideTile(tileX, tileY);
          },
        );
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
        this.inventorySystem?.isOpen()
      ) {
        return;
      }

      this.tileManagementSystem?.spawnTree();
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
        this.inventorySystem?.isOpen()
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
    const infoText = getTileProperty(tile, "info");

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
      this.inventorySystem?.toggleInventory();
    });
  }
}
