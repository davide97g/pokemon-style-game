import Phaser from "phaser";

export class RemotePlayer {
  private sprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private scene: Phaser.Scene;
  private id: string;
  private targetX: number;
  private targetY: number;
  private currentDirection?: string;
  private lastMovementTime: number = 0;
  private idleTimer?: Phaser.Time.TimerEvent;

  constructor(
    scene: Phaser.Scene,
    id: string,
    x: number,
    y: number,
    direction?: string
  ) {
    this.scene = scene;
    this.id = id;
    this.targetX = x;
    this.targetY = y;
    this.currentDirection = direction;

    // Create a sprite with physics enabled (same as local player)
    this.sprite = scene.physics.add
      .sprite(x, y, "atlas", "misa-front")
      .setSize(30, 40)
      .setOffset(0, 24)
      .setTint(0x8888ff); // Slight tint to distinguish from local player

    this.createAnimations();
    
    // If no direction is provided, ensure we're in idle state
    if (!direction) {
      this.sprite.anims.stop();
    }
  }

  private createAnimations(): void {
    const anims = this.scene.anims;
    
    // Check if animations already exist to avoid duplicates
    if (!anims.exists("misa-left-walk")) {
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
    }

    if (!anims.exists("misa-right-walk")) {
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
    }

    if (!anims.exists("misa-front-walk")) {
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
    }

    if (!anims.exists("misa-back-walk")) {
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
  }

  public getId(): string {
    return this.id;
  }

  public getSprite(): Phaser.Types.Physics.Arcade.SpriteWithDynamicBody {
    return this.sprite;
  }

  public updatePosition(x: number, y: number, direction?: string): void {
    this.targetX = x;
    this.targetY = y;
    if (direction) {
      this.currentDirection = direction;
    }

    // Reset idle timer
    this.resetIdleTimer();

    // Use tween for smooth movement
    const distance = Phaser.Math.Distance.Between(
      this.sprite.x,
      this.sprite.y,
      x,
      y
    );
    const duration = Math.min(distance * 10, 500); // Cap duration for very long distances

    // Update animation based on direction
    if (direction) {
      this.updateAnimation(direction);
    }

    // Tween to new position
    this.scene.tweens.add({
      targets: this.sprite,
      x: x,
      y: y,
      duration: duration,
      ease: "Linear",
    });
  }

  private resetIdleTimer(): void {
    // Clear existing timer
    if (this.idleTimer) {
      this.idleTimer.remove();
    }

    // Set new timer to stop animation after 1 second of no movement
    this.idleTimer = this.scene.time.delayedCall(1000, () => {
      this.stopAnimation();
    });

    this.lastMovementTime = Date.now();
  }

  private stopAnimation(): void {
    this.sprite.anims.stop();
    // Set idle frame based on last direction
    if (this.currentDirection === "left") {
      this.sprite.setTexture("atlas", "misa-left");
    } else if (this.currentDirection === "right") {
      this.sprite.setTexture("atlas", "misa-right");
    } else if (this.currentDirection === "up") {
      this.sprite.setTexture("atlas", "misa-back");
    } else {
      this.sprite.setTexture("atlas", "misa-front");
    }
  }

  private updateAnimation(direction: string): void {
    switch (direction) {
      case "left":
        this.sprite.anims.play("misa-left-walk", true);
        break;
      case "right":
        this.sprite.anims.play("misa-right-walk", true);
        break;
      case "up":
        this.sprite.anims.play("misa-back-walk", true);
        break;
      case "down":
        this.sprite.anims.play("misa-front-walk", true);
        break;
      default:
        // Stop animation and set idle frame (handled by idle timer)
        this.stopAnimation();
    }
  }

  public destroy(): void {
    // Clear idle timer
    if (this.idleTimer) {
      this.idleTimer.remove();
    }
    this.sprite.destroy();
  }

  public getPosition(): { x: number; y: number } {
    return { x: this.sprite.x, y: this.sprite.y };
  }
}

