/**
 * Loot Dispersion System - Handles loot item dispersion, bouncing animations, and magnetic collection
 */

import Phaser from "phaser";
import type { LootItem } from "../config/AssetPaths";
import { ASSET_PATHS } from "../config/AssetPaths";
import type { Player } from "../entities/Player";
import { gameEventBus } from "../utils/GameEventBus";

interface LootSprite {
  sprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  itemId: string;
  initialX: number;
  initialY: number;
  targetX: number;
  targetY: number;
  velocityX: number;
  velocityY: number;
  bounceCount: number;
  isBeingCollected: boolean;
  collectionProgress: number;
  hasSettled: boolean; // Whether the item has finished bouncing
  createdAt: number; // Timestamp when item was created
  expirationTime: number; // Timestamp when item expires
}

export class LootDispersionSystem {
  private scene: Phaser.Scene;
  private player?: Player;
  private lootSprites: LootSprite[] = [];
  private onItemCollected?: (itemId: string, quantity: number) => void;

  // Configuration
  private readonly DISPERSION_RADIUS = 60; // How far items spread from center
  private readonly BOUNCE_DURATION = 800; // Time for initial bounce animation (ms)
  private readonly MAGNETIC_DISTANCE = 80; // Distance at which items start being pulled
  private readonly COLLECTION_DISTANCE = 15; // Distance at which items are collected
  private readonly MAGNETIC_FORCE = 0.15; // How strongly items are pulled (0-1)
  private readonly GRAVITY = 300; // Gravity for bouncing effect
  private readonly EXPIRATION_TIME = 30000; // 30 seconds in milliseconds

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public setPlayer(player: Player): void {
    this.player = player;
  }

  public setOnItemCollected(
    callback: (itemId: string, quantity: number) => void,
  ): void {
    this.onItemCollected = callback;
  }

  /**
   * Disperse loot items around a position with bouncing animation
   */
  public disperseLoot(loot: LootItem[], x: number, y: number): void {
    if (!ASSET_PATHS.items) {
      console.warn("Item assets not available");
      return;
    }

    // Calculate total number of items to create
    const totalItems = loot.reduce((sum, item) => sum + item.quantity, 0);

    // Create array of all items with their types
    const itemsToSpawn: Array<{ itemId: string; index: number }> = [];
    loot.forEach((lootItem) => {
      for (let i = 0; i < lootItem.quantity; i++) {
        itemsToSpawn.push({
          itemId: lootItem.itemId,
          index: itemsToSpawn.length,
        });
      }
    });

    // Create sprites with better directional distribution
    itemsToSpawn.forEach((item) => {
      this.createLootSprite(item.itemId, x, y, item.index, totalItems);
    });
  }

  /**
   * Create a single loot sprite with bouncing animation
   */
  private createLootSprite(
    itemId: string,
    centerX: number,
    centerY: number,
    itemIndex: number = 0,
    totalItems: number = 1,
  ): void {
    // Get item image path
    const itemPath =
      ASSET_PATHS.items[itemId as keyof typeof ASSET_PATHS.items];
    if (!itemPath) {
      console.warn(`Item asset not found: ${itemId}`);
      return;
    }

    // Calculate dispersion position with better directional distribution
    // Distribute items evenly in a circle to ensure they're visible in different directions
    const angleStep = (Math.PI * 2) / totalItems;
    const baseAngle = itemIndex * angleStep;

    // Add some randomness to the angle and distance for more natural spread
    const angleVariation = (Math.random() - 0.5) * (angleStep * 0.6); // 60% of step size
    const angle = baseAngle + angleVariation;

    // Vary distance slightly for more natural spread
    const baseDistance = this.DISPERSION_RADIUS * 0.7; // Base distance
    const distanceVariation =
      (Math.random() - 0.5) * (this.DISPERSION_RADIUS * 0.3); // ±30% variation
    const distance = baseDistance + distanceVariation;

    const targetX = centerX + Math.cos(angle) * distance;
    const targetY = centerY + Math.sin(angle) * distance;

    // Create sprite at center position
    const sprite = this.scene.physics.add
      .sprite(centerX, centerY, itemId)
      .setDepth(15); // Above tiles, below player

    // Calculate scale to fit within 32x32 max (like animals)
    const maxSize = 32;
    const baseWidth = sprite.width;
    const baseHeight = sprite.height;
    const scaleX = maxSize / baseWidth;
    const scaleY = maxSize / baseHeight;
    const scale = Math.min(scaleX, scaleY, 1); // Don't scale up, only down
    sprite.setScale(scale);

    // Store creation time and expiration time
    const createdAt = this.scene.time.now;
    const expirationTime = createdAt + this.EXPIRATION_TIME;
    sprite.setData("createdAt", createdAt);
    sprite.setData("expirationTime", expirationTime);

    // Set physics properties
    sprite.setGravityY(this.GRAVITY);
    sprite.setCollideWorldBounds(true);
    sprite.setBounce(0.4, 0.4); // Reduced bounce for single bounce effect

    // Set body size to match scaled sprite (items are small)
    // Calculate after scale is applied
    const scaledWidth = baseWidth * scale;
    const scaledHeight = baseHeight * scale;
    const bodyWidth = scaledWidth * 0.8;
    const bodyHeight = scaledHeight * 0.8;
    sprite.setSize(bodyWidth, bodyHeight);
    sprite.setOffset(
      (scaledWidth - bodyWidth) / 2,
      (scaledHeight - bodyHeight) / 2,
    );

    // Calculate initial velocity for bouncing effect
    const velocityX = (targetX - centerX) / (this.BOUNCE_DURATION / 1000);
    const velocityY = -200 - Math.random() * 100; // Upward velocity with variation

    sprite.setVelocity(velocityX, velocityY);

    // Create loot sprite data
    const lootSprite: LootSprite = {
      sprite,
      itemId,
      initialX: centerX,
      initialY: centerY,
      targetX,
      targetY,
      velocityX,
      velocityY,
      bounceCount: 0,
      isBeingCollected: false,
      collectionProgress: 0,
      hasSettled: false,
      createdAt,
      expirationTime,
    };

    this.lootSprites.push(lootSprite);

    // Add subtle rotation animation
    this.scene.tweens.add({
      targets: sprite,
      angle: 360,
      duration: 2000,
      repeat: -1,
      ease: "Linear",
    });

    // Stop item after bounce settles (single bounce only)
    this.scene.time.delayedCall(this.BOUNCE_DURATION * 1.5, () => {
      if (sprite.active && !lootSprite.isBeingCollected) {
        lootSprite.hasSettled = true;
        sprite.setVelocity(0, 0);
        sprite.setGravityY(0);
        sprite.setBounce(0, 0); // Disable bouncing
      }
    });
  }

  /**
   * Update all loot sprites - handle bouncing, magnetic pull, expiration, and collection
   */
  public update(): void {
    if (!this.player) return;

    const playerPos = this.player.getPosition();
    const currentTime = this.scene.time.now;

    // Process items in reverse order to safely remove expired items
    for (let i = this.lootSprites.length - 1; i >= 0; i--) {
      const lootSprite = this.lootSprites[i];
      const sprite = lootSprite.sprite;

      if (!sprite.active) {
        this.lootSprites.splice(i, 1);
        continue;
      }

      // Check expiration
      if (currentTime >= lootSprite.expirationTime) {
        this.removeExpiredItem(lootSprite, i);
        continue;
      }

      // Update opacity based on remaining time
      const remainingTime = lootSprite.expirationTime - currentTime;
      const opacity = Math.max(0.1, remainingTime / this.EXPIRATION_TIME); // Fade from 1.0 to 0.1
      sprite.setAlpha(opacity);

      const distanceToPlayer = Phaser.Math.Distance.Between(
        sprite.x,
        sprite.y,
        playerPos.x,
        playerPos.y,
      );

      // Check if item should be collected (always collectable if within range)
      if (distanceToPlayer <= this.COLLECTION_DISTANCE) {
        this.collectLootItem(lootSprite, i);
        continue;
      }

      // Check if item should be magnetically pulled
      if (
        distanceToPlayer <= this.MAGNETIC_DISTANCE &&
        !lootSprite.isBeingCollected
      ) {
        lootSprite.isBeingCollected = true;
        lootSprite.hasSettled = true; // Force settle when being collected
        sprite.setGravityY(0); // Disable gravity when being collected
        sprite.setVelocity(0, 0); // Stop current velocity
        sprite.setBounce(0, 0); // Disable bouncing

        // Stop any floating animations
        this.scene.tweens.killTweensOf(sprite);

        // Shrink item when being pulled (not enlarge)
        const currentScale = sprite.scaleX;
        this.scene.tweens.add({
          targets: sprite,
          scale: currentScale * 0.6, // Shrink to 60% of current size
          duration: 300,
          ease: "Power2",
        });
      }

      // Apply magnetic pull towards player
      if (lootSprite.isBeingCollected) {
        const dx = playerPos.x - sprite.x;
        const dy = playerPos.y - sprite.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 0) {
          // Normalize direction and apply magnetic force
          const forceX = (dx / distance) * this.MAGNETIC_FORCE * 1000;
          const forceY = (dy / distance) * this.MAGNETIC_FORCE * 1000;

          sprite.setVelocity(forceX, forceY);
        }
      } else if (lootSprite.hasSettled) {
        // Item has settled - ensure it stays still
        sprite.setVelocity(0, 0);
        sprite.setGravityY(0);
      } else {
        // Item is still bouncing - check if it should settle
        const createdAt = sprite.getData("createdAt") || 0;
        const timeSinceCreation = currentTime - createdAt;

        // After bounce duration, start reducing velocity to stop
        if (timeSinceCreation > this.BOUNCE_DURATION) {
          // Reduce velocity over time to simulate friction
          sprite.setVelocity(
            sprite.body.velocity.x * 0.95,
            sprite.body.velocity.y * 0.95,
          );

          // Stop if velocity is very low
          if (
            Math.abs(sprite.body.velocity.x) < 10 &&
            Math.abs(sprite.body.velocity.y) < 10
          ) {
            lootSprite.hasSettled = true;
            sprite.setVelocity(0, 0);
            sprite.setGravityY(0);
            sprite.setBounce(0, 0);
          }
        }
      }
    }
  }

  /**
   * Collect a loot item and add it to inventory
   */
  private collectLootItem(lootSprite: LootSprite, index: number): void {
    const sprite = lootSprite.sprite;

    // Ensure item is stopped
    sprite.setVelocity(0, 0);
    sprite.setGravityY(0);

    // Play collection animation
    this.scene.tweens.add({
      targets: sprite,
      scale: 0,
      alpha: 0,
      duration: 150,
      ease: "Power2",
      onComplete: () => {
        // Remove from array and destroy sprite
        if (index >= 0 && index < this.lootSprites.length) {
          this.lootSprites.splice(index, 1);
        }
        sprite.destroy();

        // Add to inventory
        if (this.onItemCollected) {
          this.onItemCollected(lootSprite.itemId, 1);
        }

        // Emit notification
        gameEventBus.emit("notification:item-collected", {
          itemId: lootSprite.itemId,
          quantity: 1,
        });
      },
    });
  }

  /**
   * Remove expired item (no longer collectable)
   */
  private removeExpiredItem(lootSprite: LootSprite, index: number): void {
    const sprite = lootSprite.sprite;

    // Fade out and remove
    this.scene.tweens.add({
      targets: sprite,
      alpha: 0,
      scale: 0,
      duration: 300,
      ease: "Power2",
      onComplete: () => {
        if (index >= 0 && index < this.lootSprites.length) {
          this.lootSprites.splice(index, 1);
        }
        sprite.destroy();
      },
    });
  }

  /**
   * Clean up all loot sprites
   */
  public shutdown(): void {
    this.lootSprites.forEach((lootSprite) => {
      if (lootSprite.sprite.active) {
        lootSprite.sprite.destroy();
      }
    });
    this.lootSprites = [];
  }

  /**
   * Get all active loot sprites (for debugging)
   */
  public getLootSprites(): LootSprite[] {
    return this.lootSprites;
  }
}
