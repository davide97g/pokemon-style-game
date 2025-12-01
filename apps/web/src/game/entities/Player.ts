import Phaser from "phaser";
import { PLAYER_SPEED } from "../config/GameConstants";

// Type for cursor keys (supports both Phaser and virtual cursor keys)
type CursorKeys = Phaser.Types.Input.Keyboard.CursorKeys | {
  up: { isDown: boolean };
  down: { isDown: boolean };
  left: { isDown: boolean };
  right: { isDown: boolean };
};

export class Player {
  private sprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private cursors?: CursorKeys;
  private scene: Phaser.Scene;
  private currentDirection?: string;
  private onPositionUpdate?: (x: number, y: number, direction?: string) => void;
  private lastSentX: number = 0;
  private lastSentY: number = 0;
  private lastSentDirection?: string;
  private positionUpdateThrottle: number = 100; // Send updates every 100ms
  private lastUpdateTime: number = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    cursors: CursorKeys
  ) {
    this.scene = scene;
    this.cursors = cursors;
    this.lastSentX = x;
    this.lastSentY = y;

    // Create a sprite with physics enabled
    this.sprite = scene.physics.add
      .sprite(x, y, "atlas", "misa-front")
      .setSize(30, 40)
      .setOffset(0, 24);

    this.createAnimations();
  }

  private createAnimations(): void {
    const anims = this.scene.anims;
    anims.create({
      key: "misa-left-walk",
      frames: anims.generateFrameNames("atlas", {
        prefix: "misa-left-walk.",
        start: 0,
        end: 3,
        zeroPad: 3,
      }),
      frameRate: 10,
      repeat: -1,
    });
    anims.create({
      key: "misa-right-walk",
      frames: anims.generateFrameNames("atlas", {
        prefix: "misa-right-walk.",
        start: 0,
        end: 3,
        zeroPad: 3,
      }),
      frameRate: 10,
      repeat: -1,
    });
    anims.create({
      key: "misa-front-walk",
      frames: anims.generateFrameNames("atlas", {
        prefix: "misa-front-walk.",
        start: 0,
        end: 3,
        zeroPad: 3,
      }),
      frameRate: 10,
      repeat: -1,
    });
    anims.create({
      key: "misa-back-walk",
      frames: anims.generateFrameNames("atlas", {
        prefix: "misa-back-walk.",
        start: 0,
        end: 3,
        zeroPad: 3,
      }),
      frameRate: 10,
      repeat: -1,
    });
  }

  public getSprite(): Phaser.Types.Physics.Arcade.SpriteWithDynamicBody {
    return this.sprite;
  }

  public update(): void {
    if (!this.cursors) return;

    const prevVelocity = this.sprite.body.velocity.clone();

    // Stop any previous movement from the last frame
    this.sprite.body.setVelocity(0);

    // Horizontal movement
    if (this.cursors.left.isDown) {
      this.sprite.body.setVelocityX(-PLAYER_SPEED);
    } else if (this.cursors.right.isDown) {
      this.sprite.body.setVelocityX(PLAYER_SPEED);
    }

    // Vertical movement
    if (this.cursors.up.isDown) {
      this.sprite.body.setVelocityY(-PLAYER_SPEED);
    } else if (this.cursors.down.isDown) {
      this.sprite.body.setVelocityY(PLAYER_SPEED);
    }

    // Normalize and scale the velocity so that player can't move faster along a diagonal
    this.sprite.body.velocity.normalize().scale(PLAYER_SPEED);

    // Update the animation and direction
    if (this.cursors.left.isDown) {
      this.sprite.anims.play("misa-left-walk", true);
      this.currentDirection = "left";
    } else if (this.cursors.right.isDown) {
      this.sprite.anims.play("misa-right-walk", true);
      this.currentDirection = "right";
    } else if (this.cursors.up.isDown) {
      this.sprite.anims.play("misa-back-walk", true);
      this.currentDirection = "up";
    } else if (this.cursors.down.isDown) {
      this.sprite.anims.play("misa-front-walk", true);
      this.currentDirection = "down";
    } else {
      this.sprite.anims.stop();
      this.currentDirection = undefined;

      // If we were moving, pick an idle frame to use
      if (prevVelocity.x < 0) this.sprite.setTexture("atlas", "misa-left");
      else if (prevVelocity.x > 0)
        this.sprite.setTexture("atlas", "misa-right");
      else if (prevVelocity.y < 0) this.sprite.setTexture("atlas", "misa-back");
      else if (prevVelocity.y > 0)
        this.sprite.setTexture("atlas", "misa-front");
    }

    // Send position updates to multiplayer service (throttled)
    this.sendPositionUpdate();
  }

  private sendPositionUpdate(): void {
    const now = Date.now();
    const x = this.sprite.x;
    const y = this.sprite.y;
    const direction = this.currentDirection;

    // Only send if position or direction changed and enough time has passed
    const positionChanged =
      Math.abs(x - this.lastSentX) > 5 ||
      Math.abs(y - this.lastSentY) > 5 ||
      direction !== this.lastSentDirection;

    if (positionChanged && now - this.lastUpdateTime > this.positionUpdateThrottle) {
      if (this.onPositionUpdate) {
        this.onPositionUpdate(x, y, direction);
      }
      this.lastSentX = x;
      this.lastSentY = y;
      this.lastSentDirection = direction;
      this.lastUpdateTime = now;
    }
  }

  public setOnPositionUpdate(
    callback: (x: number, y: number, direction?: string) => void
  ): void {
    this.onPositionUpdate = callback;
  }

  public stop(): void {
    this.sprite.body.setVelocity(0);
    this.sprite.anims.stop();
  }

  public getPosition(): { x: number; y: number } {
    return { x: this.sprite.x, y: this.sprite.y };
  }

  public getDirection(): string | undefined {
    return this.currentDirection;
  }

  public isMoving(): boolean {
    return (
      this.cursors?.up.isDown ||
      this.cursors?.down.isDown ||
      this.cursors?.left.isDown ||
      this.cursors?.right.isDown ||
      false
    );
  }
}

