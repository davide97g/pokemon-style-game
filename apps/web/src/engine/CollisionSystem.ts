import type { TilemapRenderer } from "./TilemapRenderer";

export interface AABB {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class CollisionSystem {
  constructor(private tilemapRenderer: TilemapRenderer) {}

  checkTilemapCollision(aabb: AABB, layerName = "World"): boolean {
    const tileSize = this.tilemapRenderer.getTileSize();

    // Get corners of the AABB in tile coordinates
    const left = Math.floor(aabb.x / tileSize.width);
    const right = Math.floor((aabb.x + aabb.width - 1) / tileSize.width);
    const top = Math.floor(aabb.y / tileSize.height);
    const bottom = Math.floor((aabb.y + aabb.height - 1) / tileSize.height);

    // Check all tiles that the AABB overlaps
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        if (this.tilemapRenderer.isTileColliding(x, y, layerName)) {
          return true;
        }
      }
    }

    return false;
  }

  resolveCollision(
    aabb: AABB,
    velocityX: number,
    velocityY: number,
    layerName = "World",
  ): { x: number; y: number; velocityX: number; velocityY: number } {
    const tileSize = this.tilemapRenderer.getTileSize();

    // Try moving on X axis
    const testX: AABB = {
      x: aabb.x + velocityX,
      y: aabb.y,
      width: aabb.width,
      height: aabb.height,
    };

    let finalVelocityX = velocityX;
    if (this.checkTilemapCollision(testX, layerName)) {
      // Snap to grid
      if (velocityX > 0) {
        // Moving right
        const rightEdge =
          Math.floor((aabb.x + aabb.width) / tileSize.width) * tileSize.width;
        testX.x = rightEdge - aabb.width;
      } else {
        // Moving left
        const leftEdge = Math.ceil(aabb.x / tileSize.width) * tileSize.width;
        testX.x = leftEdge;
      }
      finalVelocityX = 0;
    }

    // Try moving on Y axis
    const testY: AABB = {
      x: testX.x,
      y: aabb.y + velocityY,
      width: aabb.width,
      height: aabb.height,
    };

    let finalVelocityY = velocityY;
    if (this.checkTilemapCollision(testY, layerName)) {
      // Snap to grid
      if (velocityY > 0) {
        // Moving down
        const bottomEdge =
          Math.floor((aabb.y + aabb.height) / tileSize.height) *
          tileSize.height;
        testY.y = bottomEdge - aabb.height;
      } else {
        // Moving up
        const topEdge = Math.ceil(aabb.y / tileSize.height) * tileSize.height;
        testY.y = topEdge;
      }
      finalVelocityY = 0;
    }

    return {
      x: testX.x,
      y: testY.y,
      velocityX: finalVelocityX,
      velocityY: finalVelocityY,
    };
  }

  checkAABBCollision(a: AABB, b: AABB): boolean {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }
}
