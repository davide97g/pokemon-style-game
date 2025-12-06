/**
 * Animal System - Handles animal spawning, animations, and movement
 */

import type Phaser from "phaser";
import { ANIMAL_CONFIGS, type AnimalConfig } from "../config/AssetPaths";
import type { Player } from "../entities/Player";

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
      isMoving: true,
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
  currentDirection?: { x: number; y: number };
  animationTimer?: Phaser.Time.TimerEvent;
  animationConfig: AnimalAnimationConfig;
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

  // Movement settings
  private readonly MOVEMENT_SPEED = 50; // Pixels per second
  private readonly ANIMATION_CHANGE_INTERVAL = 2000; // Milliseconds

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
      const transitionCount = config.animations.transitions.length;
      const defaultConfig = createDefaultAnimationConfig(transitionCount);

      // Map transition names from config to animation configs
      const transitions: AnimationConfig[] = config.animations.transitions.map(
        (transition, index) => {
          const baseConfig = defaultConfig.transitions[index] || {
            name: transition.name,
            frameRate: 8,
            repeat: -1,
            isMoving: true,
            weight: 0.5 / transitionCount,
          };
          return {
            ...baseConfig,
            name: transition.name, // Use the actual transition name from config
          };
        },
      );

      // Recalculate weights to ensure they sum to 1
      const totalTransitionWeight = transitions.reduce(
        (sum, t) => sum + t.weight,
        0,
      );
      if (totalTransitionWeight > 0) {
        transitions.forEach((t) => {
          t.weight = (t.weight / totalTransitionWeight) * 0.5; // Normalize to 50%
        });
      }

      this.animationConfigs.set(config.key, {
        idle: defaultConfig.idle,
        transitions,
      });
    });
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

    // Set collision body size based on frame dimensions
    const scaledWidth = config.frameWidth * (config.scale || 2) * 0.75;
    const scaledHeight = config.frameHeight * (config.scale || 2) * 0.75;
    sprite.setSize(scaledWidth, scaledHeight);
    sprite.setOffset(
      config.frameWidth * (config.scale || 2) * 0.125,
      config.frameHeight * (config.scale || 2) * 0.125,
    );

    // Add collision with player
    if (this.player) {
      this.scene.physics.add.collider(sprite, this.player.getSprite());
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

    // Create animal data
    const animalData: AnimalData = {
      sprite,
      config,
      currentDirection: undefined,
      animationTimer: undefined,
      animationConfig,
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
   */
  private selectAnimalAnimation(animalData: AnimalData): void {
    const animConfig = animalData.animationConfig;

    // Build array of all animations (idle + transitions) with their weights
    const allAnimations: Array<{ config: AnimationConfig; name: string }> = [
      { config: animConfig.idle, name: animConfig.idle.name },
    ];

    // Add all transitions with their names from the config
    animalData.config.animations.transitions.forEach((transition, index) => {
      const transitionConfig = animConfig.transitions[index];
      if (transitionConfig) {
        allAnimations.push({
          config: transitionConfig,
          name: transition.name,
        });
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

    // Set movement direction if moving
    if (selectedAnimation.config.isMoving) {
      // Random direction for movement
      const angle = Math.random() * Math.PI * 2;
      animalData.currentDirection = {
        x: Math.cos(angle) * this.MOVEMENT_SPEED,
        y: Math.sin(angle) * this.MOVEMENT_SPEED,
      };
    } else {
      // Stop movement for idle
      animalData.currentDirection = undefined;
      animalData.sprite.body.setVelocity(0, 0);
    }
  }

  /**
   * Update all animals movement based on current animations
   * Should be called in the scene's update loop
   */
  public update(): void {
    this.animals.forEach((animalData) => {
      // Apply movement if direction is set (moving animation)
      if (animalData.currentDirection) {
        animalData.sprite.body.setVelocity(
          animalData.currentDirection.x,
          animalData.currentDirection.y,
        );
      }
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
