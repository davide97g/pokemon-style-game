/**
 * Author: Michael Hadley, mikewesthad.com
 * Asset Credits:
 *  - Tuxemon, https://github.com/Tuxemon/Tuxemon
 */

import Phaser from "phaser";
import { ASSET_PATHS } from "./config/AssetPaths";
import { Player } from "./entities/Player";
import { RemotePlayer } from "./entities/RemotePlayer";
import { ChatSystem } from "./systems/ChatSystem";
import { DialogSystem } from "./systems/DialogSystem";
import { MenuSystem } from "./systems/MenuSystem";
import { WeatherSystem } from "./systems/WeatherSystem";
import {
  MultiplayerService,
  PlayerData,
} from "./services/MultiplayerService";

export class GameScene extends Phaser.Scene {
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
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

  constructor() {
    super({ key: "GameScene" });
  }

  shutdown(): void {
    // Clean up multiplayer connection
    if (this.multiplayerService) {
      this.multiplayerService.disconnect();
    }

    // Clean up remote players
    this.remotePlayers.forEach((player) => player.destroy());
    this.remotePlayers.clear();
  }

  preload(): void {
    this.load.image("tiles", ASSET_PATHS.tiles);
    this.load.tilemapTiledJSON("map", ASSET_PATHS.map);
    this.load.atlas("atlas", ASSET_PATHS.atlas.image, ASSET_PATHS.atlas.json);
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

    this.cursors = this.input.keyboard!.createCursorKeys();

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

  private initSystems(): void {
    // Initialize menu system
    this.menuSystem = new MenuSystem(this);
    this.menuSystem.setOnMenuSelect((text, speaker) => {
      this.dialogSystem?.showDialog(text, speaker);
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
    const serverUrl = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
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
          console.log("Adding remote player:", playerData.id);
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
        console.log("Adding remote player on join:", playerData.id);
        this.addRemotePlayer(playerData);
      } else {
        console.warn("Attempted to add duplicate remote player:", playerData.id);
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
        console.log("Creating remote player from move event:", playerData.id);
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

    // Connect to server
    this.multiplayerService.connect();

    // Register new player with initial position after connection is established
    // Wait a bit for connection to be fully established
    this.time.delayedCall(100, () => {
      if (this.player && this.multiplayerService?.isConnectedToServer()) {
        const pos = this.player.getPosition();
        this.multiplayerService.registerNewPlayer(pos.x, pos.y);
      }
    });
  }

  private addRemotePlayer(playerData: PlayerData): void {
    // Double-check to prevent duplicates
    if (this.remotePlayers.has(playerData.id)) {
      console.warn("Attempted to add duplicate remote player:", playerData.id);
      return; // Player already exists
    }

    console.log("Creating remote player:", playerData.id, "at", playerData.x, playerData.y);
    const remotePlayer = new RemotePlayer(
      this,
      playerData.id,
      playerData.x,
      playerData.y,
      playerData.direction
    );

    // Add collision with world layer
    const worldLayer = this.gameMap?.getLayer("World");
    if (worldLayer) {
      this.physics.add.collider(remotePlayer.getSprite(), worldLayer);
    }

    this.remotePlayers.set(playerData.id, remotePlayer);
    console.log("Total remote players:", this.remotePlayers.size);
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
      console.log(
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

          console.log(`\n=== Tile Info ===`);
          console.log(`Layer: ${layerName}`);
          console.log(`Position: (${tileX}, ${tileY})`);
          console.log(`Tile Index: ${tile.index}`);
          console.log(`Tile GID (Global ID): ${tileGID}`);
          console.log(`Collides: ${tile.collides || false}`);
          if (tile.properties) {
            console.log(`Properties:`, tile.properties);
          }
          console.log(`\nTile GID: ${tileGID}`);
        }
      });
    });

    this.input.keyboard!.once("keydown", (event: KeyboardEvent) => {
      if ((event.key === "d" || event.key === "D") && (event.metaKey || event.ctrlKey)) {
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
}
