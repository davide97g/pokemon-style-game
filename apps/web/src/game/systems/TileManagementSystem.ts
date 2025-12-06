/**
 * Tile Management System - Handles tile groups, hiding, and spawning
 */

import type Phaser from "phaser";
import type { LootItem } from "../config/AssetPaths";
import { TREE_TILE_GID, WOOD_REQUIRED_FOR_TREE } from "../config/GameConstants";
import { debugLog } from "../utils/DebugUtils";
import { getTileProperty } from "../utils/TileUtils";

export interface TileGroupMember {
  layer: "world" | "above";
  x: number;
  y: number;
  group: string;
  distance: number;
}

export class TileManagementSystem {
  protected scene: Phaser.Scene;
  private gameMap: Phaser.Tilemaps.Tilemap | null = null;
  private worldLayer?: Phaser.Tilemaps.TilemapLayer;
  private aboveLayer?: Phaser.Tilemaps.TilemapLayer;
  private player?: { getPosition: () => { x: number; y: number } };
  private onGetItemQuantity?: (itemId: string) => number;
  private onRemoveItem?: (itemId: string, quantity: number) => boolean;
  private onPlayDestroySound?: () => void;
  private onSaveGame?: () => void;
  private onDisperseLoot?: (loot: LootItem[], x: number, y: number) => void;

  // Track tiles that were placed/modified by the player
  private placedTiles: Map<
    string,
    { x: number; y: number; gid: number; collides: boolean }
  > = new Map();

  // Tile grouping system for multi-tile objects using Tiled "group" property
  private tileGroups: Map<string, TileGroupMember[]> = new Map();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public setGameMap(gameMap: Phaser.Tilemaps.Tilemap | null): void {
    this.gameMap = gameMap;
  }

  public setWorldLayer(worldLayer?: Phaser.Tilemaps.TilemapLayer): void {
    this.worldLayer = worldLayer;
  }

  public setAboveLayer(aboveLayer?: Phaser.Tilemaps.TilemapLayer): void {
    this.aboveLayer = aboveLayer;
  }

  public setPlayer(player: {
    getPosition: () => { x: number; y: number };
  }): void {
    this.player = player;
  }

  public setOnGetItemQuantity(callback: (itemId: string) => number): void {
    this.onGetItemQuantity = callback;
  }

  public setOnRemoveItem(
    callback: (itemId: string, quantity: number) => boolean,
  ): void {
    this.onRemoveItem = callback;
  }

  public setOnPlayDestroySound(callback: () => void): void {
    this.onPlayDestroySound = callback;
  }

  public setOnSaveGame(callback: () => void): void {
    this.onSaveGame = callback;
  }

  public setOnDisperseLoot(
    callback: (loot: LootItem[], x: number, y: number) => void,
  ): void {
    this.onDisperseLoot = callback;
  }

  /**
   * Initialize tile groups for multi-tile objects using Tiled "group" property
   */
  public initializeTileGroups(): void {
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
          const tileGroup = getTileProperty(tile, "group");
          if (!tileGroup) {
            continue; // Skip tiles without a group property
          }

          // Find all nearby tiles with the same group value
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
   */
  public getTileGroup(tileX: number, tileY: number): TileGroupMember[] | null {
    debugLog(`\n[getTileGroup] Looking for group at (${tileX}, ${tileY})`);

    // First, try to get the group directly
    const groupKey = `${tileX},${tileY}`;
    let group = this.tileGroups.get(groupKey);

    if (group) {
      debugLog(`[getTileGroup] Found cached group with ${group.length} tiles`);
      return group;
    }

    debugLog(`[getTileGroup] No cached group found, searching...`);

    // If not found, check if this tile has a group and find its group
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

      const tileGroup = getTileProperty(tile, "group");
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
   */
  private findTilesByGroup(
    targetGroup: string,
    centerX: number,
    centerY: number,
  ): TileGroupMember[] | null {
    if (!this.gameMap || !this.worldLayer || !this.aboveLayer) {
      debugLog(`[findTilesByGroup] Missing layers or map`);
      return null;
    }

    debugLog(
      `[findTilesByGroup] Starting flood-fill search for group "${targetGroup}" from (${centerX}, ${centerY})`,
    );

    const group: TileGroupMember[] = [];
    const visited = new Set<string>();

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
        const tileGroup = getTileProperty(tile, "group");
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

          const tileGroup = getTileProperty(tile, "group");
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
  public hideTile(tileX: number, tileY: number): void {
    if (!this.worldLayer || !this.aboveLayer) return;

    debugLog(`\n=== hideTile called for position (${tileX}, ${tileY}) ===`);

    // Get the tile group for this position
    const group = this.getTileGroup(tileX, tileY);

    if (group) {
      debugLog(`Found tile group with ${group.length} tiles:`);
      // const maxDistance = Math.max(...group.map((t) => t.distance));

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

      // Fallback: hide single tile if no group found
      const tile = this.worldLayer.getTileAt(tileX, tileY);
      if (tile) {
        tile.setAlpha(0);
        tile.setCollision(false);
        debugLog(`  Fallback: Hidden single tile at (${tileX}, ${tileY})`);
      }
    }

    debugLog(`=== hideTile finished ===\n`);

    // Get loot from tile properties or default based on tile type
    const loot = this.getTileLoot(tileX, tileY);

    // Calculate world position for loot dispersion (center of tile)
    if (this.gameMap && loot.length > 0) {
      const tileWidth = this.gameMap.tileWidth || 32;
      const tileHeight = this.gameMap.tileHeight || 32;
      const worldX = tileX * tileWidth + tileWidth / 2;
      const worldY = tileY * tileHeight + tileHeight / 2;

      // Disperse loot items
      if (this.onDisperseLoot) {
        this.onDisperseLoot(loot, worldX, worldY);
      }
    }

    // Play destroy sound when item is removed from screen
    if (this.onPlayDestroySound) {
      this.onPlayDestroySound();
    }
  }

  /**
   * Get loot items from a tile based on properties or tile type
   */
  private getTileLoot(tileX: number, tileY: number): LootItem[] {
    if (!this.worldLayer && !this.aboveLayer) return [];

    // Check world layer first
    let tile = this.worldLayer?.getTileAt(tileX, tileY);
    if (!tile || tile.index === null || tile.index === -1) {
      // Check above layer
      tile = this.aboveLayer?.getTileAt(tileX, tileY);
    }

    if (!tile || tile.index === null || tile.index === -1) {
      return [];
    }

    // Check for explicit loot property (JSON format: [{"itemId":"wood","quantity":5}])
    const lootProperty = getTileProperty(tile, "loot");
    if (lootProperty) {
      try {
        const loot =
          typeof lootProperty === "string"
            ? JSON.parse(lootProperty)
            : lootProperty;
        if (Array.isArray(loot)) {
          return loot as LootItem[];
        }
      } catch (e) {
        debugLog(`Failed to parse loot property: ${lootProperty}`, e);
      }
    }

    // Default loot based on tile type (e.g., trees drop wood)
    // Check if this is a tree tile by GID or group property
    const tileGID = tile.index + (tile.tileset?.firstgid || 1);
    const groupProperty = getTileProperty(tile, "group");

    // If it's a tree (based on GID or group), drop wood
    if (tileGID === TREE_TILE_GID || groupProperty === "tree") {
      return [{ itemId: "wood", quantity: 5 }];
    }

    return [];
  }

  /**
   * Spawn a tree at the player's current position
   */
  public spawnTree(): void {
    if (!this.player || !this.gameMap || !this.worldLayer) {
      return;
    }

    // Check if player has enough wood
    if (!this.onGetItemQuantity) {
      return;
    }

    const woodQuantity = this.onGetItemQuantity("wood");
    if (woodQuantity < WOOD_REQUIRED_FOR_TREE) {
      debugLog(
        `Not enough wood! Need ${WOOD_REQUIRED_FOR_TREE}, have ${woodQuantity}`,
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
    this.worldLayer.putTileAt(TREE_TILE_GID, tileX, tileY);

    // Set collision property for the tree
    const newTile = this.worldLayer.getTileAt(tileX, tileY);
    if (newTile) {
      newTile.setCollision(true);

      // Track this placed tile
      const tileKey = `${tileX},${tileY}`;
      const tileGID = TREE_TILE_GID;
      this.placedTiles.set(tileKey, {
        x: tileX,
        y: tileY,
        gid: tileGID,
        collides: true,
      });

      // Create a tile group for this tree using group property
      const tileGroup = getTileProperty(newTile, "group");
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
    if (this.onRemoveItem) {
      const removed = this.onRemoveItem("wood", WOOD_REQUIRED_FOR_TREE);
      if (removed) {
        if (this.onPlayDestroySound) {
          this.onPlayDestroySound();
        }
        debugLog(
          `Spawned tree at (${tileX}, ${tileY}) using ${WOOD_REQUIRED_FOR_TREE} wood`,
        );
        // Trigger immediate save after placing tree
        if (this.onSaveGame) {
          this.onSaveGame();
        }
      }
    }
  }

  public getPlacedTiles(): Array<{
    x: number;
    y: number;
    gid: number;
    collides: boolean;
  }> {
    const tiles: Array<{
      x: number;
      y: number;
      gid: number;
      collides: boolean;
    }> = [];

    this.placedTiles.forEach((tileData) => {
      // Verify the tile still exists and matches (in case map was reset)
      const tile = this.worldLayer?.getTileAt(tileData.x, tileData.y);
      if (tile?.collides) {
        tiles.push(tileData);
      }
    });

    return tiles;
  }

  public loadPlacedTiles(
    tiles: Array<{ x: number; y: number; gid: number; collides: boolean }>,
  ): void {
    this.placedTiles.clear();
    if (!this.worldLayer) return;

    tiles.forEach((tileData) => {
      this.worldLayer?.putTileAt(tileData.gid, tileData.x, tileData.y);
      const tile = this.worldLayer?.getTileAt(tileData.x, tileData.y);
      if (tile) {
        tile.setCollision(tileData.collides);
        // Track this restored tile
        const tileKey = `${tileData.x},${tileData.y}`;
        this.placedTiles.set(tileKey, tileData);
      }
    });
  }
}
