import type {
  TiledLayer,
  TiledMap,
  TiledObject,
  TiledObjectLayer,
  TiledTileset,
} from "../types/tilemap";

export class TilemapRenderer {
  private map: TiledMap | null = null;
  private tilesets: Map<number, HTMLImageElement> = new Map();
  private tilesetData: TiledTileset[] = [];
  private collisionMap: Set<string> = new Set();

  async loadMap(mapPath: string): Promise<void> {
    const response = await fetch(mapPath);
    this.map = await response.json();
    this.tilesetData = this.map?.tilesets ?? [];

    // Extract collision data
    this.extractCollisionData();
  }

  async loadTilesets(basePath: string): Promise<void> {
    if (!this.map) throw new Error("Map not loaded");

    const promises = this.map.tilesets.map(async (tileset) => {
      if (!tileset.image) return;

      const img = new Image();

      // Normalize the image path - extract filename from relative path
      // JSON may have paths like "../tilesets/filename.png" or just "filename.png"
      const imagePath = tileset.image.replace(/^.*[\\/]/, ""); // Extract just the filename
      const path = `${basePath}/${imagePath}`;

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => {
          console.error(`Failed to load tileset image: ${path}`);
          reject(new Error(`Failed to load tileset image: ${path}`));
        };
        img.src = path;
      });

      this.tilesets.set(tileset.firstgid, img);
    });

    await Promise.all(promises);
  }

  private extractCollisionData(): void {
    if (!this.map) return;

    // Find tiles marked with collides property
    this.map.tilesets.forEach((tileset) => {
      if (!tileset.tiles) return;

      tileset.tiles.forEach((tile) => {
        if (!tile.properties) return;

        const collides = tile.properties.find(
          (prop) => prop.name === "collides" && prop.value === true,
        );

        if (collides) {
          // Store tileset-relative GID
          this.collisionMap.add(`${tileset.firstgid + tile.id}`);
        }
      });
    });
  }

  render(
    ctx: CanvasRenderingContext2D,
    layerName: string,
    cameraX: number,
    cameraY: number,
    viewportWidth: number,
    viewportHeight: number,
  ): void {
    if (!this.map) return;

    const layer = this.map.layers.find(
      (l) => l.name === layerName && l.type === "tilelayer",
    ) as TiledLayer | undefined;

    // Log if layer not found (for debugging)
    if (!layer) {
      console.warn(
        `Layer "${layerName}" not found. Available layers:`,
        this.map.layers.map((l) => `${l.name} (${l.type})`).join(", "),
      );
      return;
    }

    // Check visibility - if visible property is undefined, assume it's visible
    if (layer.visible === false) return;

    const tileWidth = this.map.tilewidth;
    const tileHeight = this.map.tileheight;

    // Calculate visible tile range (with buffer)
    const startCol = Math.max(0, Math.floor(cameraX / tileWidth) - 1);
    const endCol = Math.min(
      layer.width,
      Math.ceil((cameraX + viewportWidth) / tileWidth) + 1,
    );
    const startRow = Math.max(0, Math.floor(cameraY / tileHeight) - 1);
    const endRow = Math.min(
      layer.height,
      Math.ceil((cameraY + viewportHeight) / tileHeight) + 1,
    );

    // Render visible tiles
    for (let row = startRow; row < endRow; row++) {
      for (let col = startCol; col < endCol; col++) {
        const tileIndex = row * layer.width + col;
        const gid = layer.data[tileIndex];

        if (gid === 0) continue; // Empty tile

        this.renderTile(
          ctx,
          gid,
          col * tileWidth,
          row * tileHeight,
          cameraX,
          cameraY,
        );
      }
    }
  }

  private renderTile(
    ctx: CanvasRenderingContext2D,
    gid: number,
    worldX: number,
    worldY: number,
    cameraX: number,
    cameraY: number,
  ): void {
    // Tiled uses upper bits of GID for flip flags:
    // Bit 31 (0x80000000): horizontal flip
    // Bit 30 (0x40000000): vertical flip
    // Bit 29 (0x20000000): diagonal flip (anti-diagonal)
    // Lower 29 bits contain the actual tile ID
    const FLIPPED_HORIZONTALLY = 0x80000000;
    const FLIPPED_VERTICALLY = 0x40000000;
    const FLIPPED_DIAGONALLY = 0x20000000;
    const FLIP_FLAGS =
      FLIPPED_HORIZONTALLY | FLIPPED_VERTICALLY | FLIPPED_DIAGONALLY;

    // Extract flip flags
    const flippedHorizontally = (gid & FLIPPED_HORIZONTALLY) !== 0;
    const flippedVertically = (gid & FLIPPED_VERTICALLY) !== 0;
    const flippedDiagonally = (gid & FLIPPED_DIAGONALLY) !== 0;

    // Mask out flip flags to get actual tile ID
    const actualGid = gid & ~FLIP_FLAGS;

    // Find correct tileset for this GID (using actual GID without flags)
    let tileset: TiledTileset | null = null;
    let tilesetImage: HTMLImageElement | null = null;

    for (const ts of this.tilesetData) {
      if (actualGid >= ts.firstgid && actualGid < ts.firstgid + ts.tilecount) {
        tileset = ts;
        tilesetImage = this.tilesets.get(ts.firstgid) || null;
        break;
      }
    }

    if (!tileset || !tilesetImage) return;

    // Calculate tile position in tileset (using actual GID)
    // Account for margin and spacing in the tileset
    const localId = actualGid - tileset.firstgid;
    const tilesPerRow = tileset.columns;
    const margin = tileset.margin || 0;
    const spacing = tileset.spacing || 0;

    const srcX =
      margin + (localId % tilesPerRow) * (tileset.tilewidth + spacing);
    const srcY =
      margin +
      Math.floor(localId / tilesPerRow) * (tileset.tileheight + spacing);

    // Calculate screen position
    const screenX = worldX - cameraX;
    const screenY = worldY - cameraY;

    // Apply transformations if needed
    ctx.save();

    // Move to tile center for transformations
    ctx.translate(
      screenX + tileset.tilewidth / 2,
      screenY + tileset.tileheight / 2,
    );

    if (flippedDiagonally) {
      // Diagonal flip: rotate 90 degrees counter-clockwise
      // Then apply horizontal/vertical flips if set
      ctx.rotate(-Math.PI / 2);
      ctx.scale(flippedHorizontally ? -1 : 1, flippedVertically ? -1 : 1);
    } else {
      // Normal rendering with horizontal/vertical flips only
      ctx.scale(flippedHorizontally ? -1 : 1, flippedVertically ? -1 : 1);
    }

    // Draw tile centered at origin (after transformations)
    ctx.drawImage(
      tilesetImage,
      srcX,
      srcY,
      tileset.tilewidth,
      tileset.tileheight,
      -tileset.tilewidth / 2,
      -tileset.tileheight / 2,
      tileset.tilewidth,
      tileset.tileheight,
    );

    ctx.restore();
  }

  isTileColliding(tileX: number, tileY: number, layerName = "World"): boolean {
    if (!this.map) return false;

    const layer = this.map.layers.find(
      (l) => l.name === layerName && l.type === "tilelayer",
    ) as TiledLayer | undefined;

    if (!layer) return false;

    // Check bounds
    if (
      tileX < 0 ||
      tileX >= layer.width ||
      tileY < 0 ||
      tileY >= layer.height
    ) {
      return true; // Treat out of bounds as collision
    }

    const tileIndex = tileY * layer.width + tileX;
    const gid = layer.data[tileIndex];

    // Mask out flip flags for collision checking
    const FLIP_FLAGS = 0xe0000000; // All three flip flags
    const actualGid = gid & ~FLIP_FLAGS;

    return this.collisionMap.has(`${actualGid}`);
  }

  getMapSize(): { width: number; height: number } {
    if (!this.map) return { width: 0, height: 0 };

    return {
      width: this.map.width * this.map.tilewidth,
      height: this.map.height * this.map.tileheight,
    };
  }

  getTileSize(): { width: number; height: number } {
    if (!this.map) return { width: 32, height: 32 };

    return {
      width: this.map.tilewidth,
      height: this.map.tileheight,
    };
  }

  findObject(
    layerName: string,
    objectName: string,
  ): { x: number; y: number } | null {
    if (!this.map) return null;

    const layer = this.map.layers.find(
      (l) => l.name === layerName && l.type === "objectgroup",
    ) as TiledObjectLayer | undefined;

    if (!layer || layer.type !== "objectgroup") return null;

    const obj = layer.objects.find((o: TiledObject) => o.name === objectName);

    return obj ? { x: obj.x, y: obj.y } : null;
  }
}
