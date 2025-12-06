/**
 * Animal System - Handles animal spawning, animations, and movement
 */

import Phaser from "phaser";
import {
  ANIMAL_CONFIGS,
  type AnimalConfig,
  type LootItem,
} from "../config/AssetPaths";
import type { Player } from "../entities/Player";
import { gameEventBus } from "../utils/GameEventBus";

/**
 * Configuration for animal animations
 * Each animation can have custom frame rate and behavior
 */
export interface AnimationConfig {
  name: string; // Animation key suffix (e.g., "idle", "move1")
  frameRate: number; // Frames per second
  repeat: number; // -1 for infinite, or number of times to repeat
  isMoving: boolean; // Whether this animation should move the animal
  weight: number; // Probability weight for random selection (0-1)
}

/**
 * Animal animation configuration
 * Defines all animations for a single animal type
 */
export interface AnimalAnimationConfig {
  idle: AnimationConfig;
  transitions: AnimationConfig[]; // Dynamic array of transition animations
}

/**
 * Default animation configuration factory
 * Creates default config based on the number of transitions
 */
const createDefaultAnimationConfig = (
  transitionCount: number,
): AnimalAnimationConfig => {
  // Calculate weight for transitions (remaining 50% split evenly)
  const transitionWeight = transitionCount > 0 ? 0.5 / transitionCount : 0;

  // Create transition configs
  const transitions: AnimationConfig[] = [];
  for (let i = 0; i < transitionCount; i++) {
    transitions.push({
      name: `transition-${i + 1}`, // Will be overridden by actual transition name
      frameRate: 8,
      repeat: -1,
      isMoving: false, // Animals don't move, they animate in place
      weight: transitionWeight,
    });
  }

  return {
    idle: {
      name: "idle",
      frameRate: 8,
      repeat: -1,
      isMoving: false,
      weight: 0.5, // 50% chance for idle
    },
    transitions,
  };
};

/**
 * Animal instance data
 */
interface AnimalData {
  sprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  config: AnimalConfig;
  animationTimer?: Phaser.Time.TimerEvent;
  animationConfig: AnimalAnimationConfig;
  currentHp: number; // Current HP
  maxHp: number; // Maximum HP
  isDead: boolean; // Whether the animal is dead
  isPlayingTriggeredAnimation: boolean; // Whether currently playing a triggered animation
  progressBar?: Phaser.GameObjects.Container; // Progress bar showing HP
}

/**
 * Spawn configuration for animals
 */
export interface AnimalSpawnConfig {
  animalKey: string; // Key from ANIMAL_CONFIGS
  quantity: number; // Number of animals to spawn
  spawnArea?: {
    // Optional: specific spawn area, otherwise uses entire map
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export class AnimalSystem {
  private scene: Phaser.Scene;
  private gameMap: Phaser.Tilemaps.Tilemap | null = null;
  private worldLayer?: Phaser.Tilemaps.TilemapLayer;
  private player?: Player;
  private animals: AnimalData[] = [];

  // Animation configuration - can be customized per animal type
  private animationConfigs: Map<string, AnimalAnimationConfig> = new Map();

  // Animation settings
  private readonly ANIMATION_CHANGE_INTERVAL = 2000; // Milliseconds
  private readonly INTERACTION_DISTANCE = 50; // Pixels - distance for player interaction
  private readonly DEATH_DISAPPEAR_DELAY = 2000; // Milliseconds - delay before removing dead animal
  private readonly COLLISION_BODY_SCALE = 0.35; // Collision body size as percentage of sprite (35% = tighter collision)

  // Callbacks
  private onAnimalKilled?: (loot: LootItem[]) => void; // Called when animal dies (to add items to inventory)
  private onDisperseLoot?: (loot: LootItem[], x: number, y: number) => void; // Called to disperse loot items

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.setupDefaultAnimationConfigs();
  }

  /**
   * Set up default animation configurations for all animals
   * Can be overridden per animal type if needed
   */
  private setupDefaultAnimationConfigs(): void {
    ANIMAL_CONFIGS.forEach((config) => {
      // Separate behavioral and triggered transitions
      const behavioralTransitions = config.animations.transitions.filter(
        (t) => t.type === "behavioral",
      );

      // Calculate weight for behavioral transitions (remaining 50% split evenly)
      const behavioralWeight =
        behavioralTransitions.length > 0
          ? 0.5 / behavioralTransitions.length
          : 0;

      // Map transition names from config to animation configs
      const transitions: AnimationConfig[] = config.animations.transitions.map(
        (transition) => {
          const isBehavioral = transition.type === "behavioral";
          return {
            name: transition.name,
            frameRate: 8,
            repeat: isBehavioral ? -1 : 0, // Triggered animations play once
            isMoving: false,
            weight: isBehavioral ? behavioralWeight : 0, // Only behavioral animations have weight
          };
        },
      );

      this.animationConfigs.set(config.key, {
        idle: {
          name: "idle",
          frameRate: 8,
          repeat: -1,
          isMoving: false,
          weight: 0.5, // 50% chance for idle
        },
        transitions,
      });
    });
  }

  /**
   * Set callback for when animal is killed
   */
  public setOnAnimalKilled(callback: (loot: LootItem[]) => void): void {
    this.onAnimalKilled = callback;
  }

  /**
   * Set callback for dispersing loot items
   */
  public setOnDisperseLoot(
    callback: (loot: LootItem[], x: number, y: number) => void,
  ): void {
    this.onDisperseLoot = callback;
  }

  /**
   * Set custom animation configuration for a specific animal type
   */
  public setAnimalAnimationConfig(
    animalKey: string,
    config: Partial<AnimalAnimationConfig>,
  ): void {
    const animalConfig = ANIMAL_CONFIGS.find((c) => c.key === animalKey);
    const transitionCount = animalConfig?.animations.transitions.length || 0;
    const defaultConfig = createDefaultAnimationConfig(transitionCount);
    const existing = this.animationConfigs.get(animalKey) || defaultConfig;
    this.animationConfigs.set(animalKey, { ...existing, ...config });
  }

  /**
   * Initialize the system with required dependencies
   */
  public init(
    gameMap: Phaser.Tilemaps.Tilemap,
    worldLayer: Phaser.Tilemaps.TilemapLayer | undefined,
    player: Player,
  ): void {
    this.gameMap = gameMap;
    this.worldLayer = worldLayer;
    this.player = player;
  }

  /**
   * Create all animal animations for all animal types
   * Should be called after assets are loaded
   */
  public createAllAnimations(): void {
    ANIMAL_CONFIGS.forEach((config) => {
      this.createAnimalAnimations(config);
    });
  }

  /**
   * Create animations for a specific animal using its configuration
   */
  private createAnimalAnimations(config: AnimalConfig): void {
    const animConfig = this.animationConfigs.get(config.key);
    if (!animConfig) {
      console.warn(`Animation config not found for ${config.key}`);
      return;
    }

    // Helper function to create frames from an array of frame numbers
    const createFramesFromArray = (frameNumbers: number[]) => {
      if (frameNumbers.length === 0) return [];
      const start = Math.min(...frameNumbers);
      const end = Math.max(...frameNumbers);
      return this.scene.anims.generateFrameNumbers(config.key, { start, end });
    };

    // Create and register idle animation
    this.scene.anims.create({
      key: `${config.key}-${animConfig.idle.name}`,
      frames: createFramesFromArray(config.animations.idle),
      frameRate: animConfig.idle.frameRate,
      repeat: animConfig.idle.repeat,
    });

    // Create and register all transition animations
    config.animations.transitions.forEach((transition, index) => {
      const transitionAnimConfig = animConfig.transitions[index];
      if (transitionAnimConfig) {
        this.scene.anims.create({
          key: `${config.key}-${transition.name}`,
          frames: createFramesFromArray(transition.frames),
          frameRate: transitionAnimConfig.frameRate,
          repeat: transitionAnimConfig.repeat,
        });
      }
    });
  }

  /**
   * Spawn animals based on spawn configuration
   */
  public spawnAnimals(spawnConfigs: AnimalSpawnConfig[]): void {
    if (!this.gameMap) {
      console.error("Cannot spawn animals: gameMap not set");
      return;
    }

    spawnConfigs.forEach((spawnConfig) => {
      const animalConfig = ANIMAL_CONFIGS.find(
        (config) => config.key === spawnConfig.animalKey,
      );

      if (!animalConfig) {
        console.warn(
          `Animal config not found for key: ${spawnConfig.animalKey}`,
        );
        return;
      }

      if (!this.gameMap) {
        console.warn("Cannot spawn animals: gameMap not set");
        return;
      }

      const mapWidth = this.gameMap.widthInPixels;
      const mapHeight = this.gameMap.heightInPixels;

      for (let i = 0; i < spawnConfig.quantity; i++) {
        let x: number;
        let y: number;

        if (spawnConfig.spawnArea) {
          // Spawn within specific area
          const area = spawnConfig.spawnArea;
          x = area.x + Math.random() * area.width;
          y = area.y + Math.random() * area.height;
        } else {
          // Spawn randomly within map bounds
          x = Math.random() * mapWidth;
          y = Math.random() * mapHeight;
        }

        this.spawnAnimal(animalConfig, x, y);
      }
    });
  }

  /**
   * Spawn a single animal at the given position
   */
  private spawnAnimal(config: AnimalConfig, x: number, y: number): void {
    // Create physics sprite - start with frame 0
    const sprite = this.scene.physics.add
      .sprite(x, y, config.key, 0)
      .setScale(config.scale || 2);

    // Set collision body size - smaller, centered around the bunny
    const scale = config.scale || 2;
    const scaledWidth = config.frameWidth * scale * this.COLLISION_BODY_SCALE;
    const scaledHeight = config.frameHeight * scale * this.COLLISION_BODY_SCALE;
    sprite.setSize(scaledWidth, scaledHeight);

    // Center the collision body
    sprite.setOffset(
      config.frameWidth * scale * 0.125,
      config.frameHeight * scale * 0.125,
    );

    // Make animal immovable (won't move on collision)
    sprite.setImmovable(true);
    // Also prevent player from pushing the animal
    sprite.body.setCollideWorldBounds(false);

    // Add collision with player - both stay still
    if (this.player) {
      this.scene.physics.add.collider(sprite, this.player.getSprite(), () => {
        // On collision, stop both from moving
        sprite.body.setVelocity(0, 0);
        this.player?.getSprite().body.setVelocity(0, 0);
      });
    }

    // Add collision with world layer
    if (this.worldLayer) {
      this.scene.physics.add.collider(sprite, this.worldLayer);
    }

    // Get animation configuration for this animal
    let animationConfig = this.animationConfigs.get(config.key);
    if (!animationConfig) {
      // Create default config if not found
      const transitionCount = config.animations.transitions.length;
      animationConfig = createDefaultAnimationConfig(transitionCount);
      this.animationConfigs.set(config.key, animationConfig);
    }

    // Initialize HP
    const maxHp = config.maxHp || 1;

    // Create progress bar for HP
    const progressBar = this.createProgressBar(sprite, maxHp, maxHp);

    // Create animal data
    const animalData: AnimalData = {
      sprite,
      config,
      animationTimer: undefined,
      animationConfig,
      currentHp: maxHp,
      maxHp,
      isDead: false,
      isPlayingTriggeredAnimation: false,
      progressBar,
    };

    // Play initial animation immediately
    this.selectAnimalAnimation(animalData);

    // Set up timer to change animation periodically
    animalData.animationTimer = this.scene.time.addEvent({
      delay: this.ANIMATION_CHANGE_INTERVAL,
      callback: () => {
        this.selectAnimalAnimation(animalData);
      },
      loop: true,
    });

    this.animals.push(animalData);
  }

  /**
   * Select animal animation based on weighted random distribution
   * Only selects from idle and behavioral animations (not triggered)
   */
  private selectAnimalAnimation(animalData: AnimalData): void {
    // Don't change animation if dead or playing triggered animation
    if (animalData.isDead || animalData.isPlayingTriggeredAnimation) {
      return;
    }

    const animConfig = animalData.animationConfig;

    // Build array of animations (idle + behavioral transitions only)
    const allAnimations: Array<{ config: AnimationConfig; name: string }> = [
      { config: animConfig.idle, name: animConfig.idle.name },
    ];

    // Add only behavioral transitions
    animalData.config.animations.transitions.forEach((transition, index) => {
      if (transition.type === "behavioral") {
        const transitionConfig = animConfig.transitions[index];
        if (transitionConfig) {
          allAnimations.push({
            config: transitionConfig,
            name: transition.name,
          });
        }
      }
    });

    // Calculate cumulative weights
    const weights = allAnimations.map((anim) => anim.config.weight);

    // Normalize weights to sum to 1
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    if (totalWeight === 0) {
      console.warn(`No valid weights for ${animalData.config.key}`);
      return;
    }

    const normalizedWeights = weights.map((w) => w / totalWeight);

    // Calculate cumulative probabilities
    const cumulative: number[] = [];
    let sum = 0;
    normalizedWeights.forEach((weight) => {
      sum += weight;
      cumulative.push(sum);
    });

    // Select animation based on random value
    const random = Math.random();
    let selectedIndex = 0;
    for (let i = 0; i < cumulative.length; i++) {
      if (random < cumulative[i]) {
        selectedIndex = i;
        break;
      }
    }

    const selectedAnimation = allAnimations[selectedIndex];
    const animationKey = `${animalData.config.key}-${selectedAnimation.name}`;

    // Verify animation exists
    if (!this.scene.anims.exists(animationKey)) {
      console.warn(`Animation ${animationKey} does not exist`);
      return;
    }

    // Stop any current animation
    if (animalData.sprite.anims) {
      animalData.sprite.anims.stop();
    }

    // Play the new animation
    animalData.sprite.play(animationKey, true);

    // Ensure sprite doesn't move (animals stay in place)
    animalData.sprite.body.setVelocity(0, 0);
  }

  /**
   * Play a triggered animation (hit, death, etc.)
   */
  private playTriggeredAnimation(
    animalData: AnimalData,
    animationName: string,
  ): void {
    const animationKey = `${animalData.config.key}-${animationName}`;

    if (!this.scene.anims.exists(animationKey)) {
      console.warn(`Animation ${animationKey} does not exist`);
      return;
    }

    animalData.isPlayingTriggeredAnimation = true;

    // Stop any current animation
    if (animalData.sprite.anims) {
      animalData.sprite.anims.stop();
    }

    // Play the triggered animation
    animalData.sprite.play(animationKey, false); // Play once, don't repeat

    // Listen for animation complete
    animalData.sprite.once("animationcomplete", () => {
      animalData.isPlayingTriggeredAnimation = false;
      // Return to idle or behavioral animation
      if (!animalData.isDead) {
        this.selectAnimalAnimation(animalData);
      }
    });
  }

  /**
   * Check if player is near any animal (for interaction)
   */
  public checkAnimalProximity(): AnimalData | null {
    if (!this.player) return null;

    const playerPos = this.player.getPosition();

    for (const animal of this.animals) {
      if (animal.isDead) continue;

      const distance = Phaser.Math.Distance.Between(
        playerPos.x,
        playerPos.y,
        animal.sprite.x,
        animal.sprite.y,
      );

      if (distance <= this.INTERACTION_DISTANCE) {
        return animal;
      }
    }

    return null;
  }

  /**
   * Hit an animal (trigger hit animation and decrease HP)
   */
  public hitAnimal(animalData: AnimalData): void {
    if (animalData.isDead) return;

    // Decrease HP
    animalData.currentHp -= 1;

    // Update progress bar
    this.updateProgressBar(animalData);

    // Play hit animation
    this.playTriggeredAnimation(animalData, "hit");

    // Check if animal should die
    if (animalData.currentHp <= 0) {
      this.killAnimal(animalData);
    }
  }

  /**
   * Kill an animal (trigger death animation, remove after delay, add items)
   */
  private killAnimal(animalData: AnimalData): void {
    if (animalData.isDead) return;

    animalData.isDead = true;

    // Stop animation timer
    if (animalData.animationTimer) {
      animalData.animationTimer.remove();
      animalData.animationTimer = undefined;
    }

    // Play death animation
    this.playTriggeredAnimation(animalData, "death");

    // Remove animal after delay
    this.scene.time.delayedCall(this.DEATH_DISAPPEAR_DELAY, () => {
      // Get loot from config or default to bone
      const loot = animalData.config.loot || [{ itemId: "bone", quantity: 1 }];

      // Get animal position for loot dispersion
      const animalX = animalData.sprite.x;
      const animalY = animalData.sprite.y;

      // Disperse loot items around the animal position
      if (this.onDisperseLoot) {
        this.onDisperseLoot(loot, animalX, animalY);
      } else {
        // Fallback: directly add to inventory if dispersion system not available
        if (this.onAnimalKilled) {
          this.onAnimalKilled(loot);
        }

        // Emit notifications for all loot items
        loot.forEach((lootItem) => {
          gameEventBus.emit("notification:item-collected", {
            itemId: lootItem.itemId,
            quantity: lootItem.quantity,
          });
        });
      }

      // Clean up progress bar
      if (animalData.progressBar) {
        animalData.progressBar.destroy();
      }

      // Remove from array and destroy sprite
      const index = this.animals.indexOf(animalData);
      if (index > -1) {
        this.animals.splice(index, 1);
      }
      animalData.sprite.destroy();
    });
  }

  /**
   * Create progress bar for animal HP
   */
  private createProgressBar(
    sprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
    currentHp: number,
    maxHp: number,
  ): Phaser.GameObjects.Container {
    const barWidth = 32; // Width of progress bar
    const barHeight = 4;
    const padding = 2;

    const progressBarContainer = this.scene.add.container(
      sprite.x,
      sprite.y - sprite.height / 2 - 8,
    );
    progressBarContainer.setDepth(20); // Above tiles but below player
    progressBarContainer.setVisible(false); // Hidden by default, shown when in proximity

    // Background (black)
    const background = this.scene.add.rectangle(
      0,
      0,
      barWidth + padding * 2,
      barHeight + padding * 2,
      0x000000,
      0.9,
    );
    background.setStrokeStyle(1, 0x333333, 1);
    progressBarContainer.add(background);

    // Foreground (red) - shows remaining HP
    const foreground = this.scene.add.rectangle(
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

    // Update initial width
    this.updateProgressBarWidth(progressBarContainer, currentHp, maxHp);

    return progressBarContainer;
  }

  /**
   * Update progress bar width based on HP
   */
  private updateProgressBarWidth(
    progressBar: Phaser.GameObjects.Container,
    currentHp: number,
    maxHp: number,
  ): void {
    const foregroundBar = (
      progressBar as Phaser.GameObjects.Container & {
        foregroundBar?: Phaser.GameObjects.Rectangle;
      }
    ).foregroundBar;

    if (foregroundBar) {
      const barWidth = 32;
      const padding = 2;
      const maxWidth = barWidth - padding * 2;
      const hpPercentage = Math.max(0, currentHp / maxHp);
      const currentWidth = hpPercentage * maxWidth;

      foregroundBar.setSize(Math.max(0, currentWidth), 4);
    }
  }

  /**
   * Update progress bar for an animal
   */
  private updateProgressBar(animalData: AnimalData): void {
    if (animalData.progressBar && !animalData.isDead) {
      this.updateProgressBarWidth(
        animalData.progressBar,
        animalData.currentHp,
        animalData.maxHp,
      );
    }
  }

  /**
   * Update all animals
   * Should be called in the scene's update loop
   * Note: Animals don't move, they only animate in place
   */
  public update(): void {
    if (!this.player) return;

    const playerPos = this.player.getPosition();

    // Update progress bars visibility and position for all animals
    this.animals.forEach((animalData) => {
      if (animalData.isDead || !animalData.progressBar) return;

      // Update progress bar position to follow sprite
      animalData.progressBar.setPosition(
        animalData.sprite.x,
        animalData.sprite.y - animalData.sprite.height / 2 - 8,
      );

      // Check if player is in proximity
      const distance = Phaser.Math.Distance.Between(
        playerPos.x,
        playerPos.y,
        animalData.sprite.x,
        animalData.sprite.y,
      );

      // Show progress bar when player is close (same distance as interaction)
      animalData.progressBar.setVisible(distance <= this.INTERACTION_DISTANCE);
    });
  }

  /**
   * Clean up all animals and timers
   */
  public shutdown(): void {
    this.animals.forEach((animal) => {
      if (animal.animationTimer) {
        animal.animationTimer.remove();
      }
      if (animal.progressBar) {
        animal.progressBar.destroy();
      }
      if (animal.sprite) {
        animal.sprite.destroy();
      }
    });
    this.animals = [];
  }

  /**
   * Get all spawned animals
   */
  public getAnimals(): AnimalData[] {
    return this.animals;
  }

  /**
   * Get animation configuration for a specific animal
   */
  public getAnimationConfig(
    animalKey: string,
  ): AnimalAnimationConfig | undefined {
    return this.animationConfigs.get(animalKey);
  }
}
