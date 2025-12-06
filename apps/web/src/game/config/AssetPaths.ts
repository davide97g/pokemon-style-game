export const ASSET_PATHS = {
  tiles: {
    grass: "/tilesets/ancient-ruins/TX Tileset Grass.png",
    plantWithShadow: "/tilesets/ancient-ruins/TX Plant with Shadow.png",
    propsWithShadow: "/tilesets/ancient-ruins/TX Props with Shadow.png",
    wall: "/tilesets/ancient-ruins/TX Tileset Wall.png",
  },
  map: "/tilemaps/main-map.json",
  atlas: {
    image: "/atlas/atlas.png",
    json: "/atlas/atlas.json",
  },
  music: {
    mainTheme: "/songs/main-theme.mp3",
  },
  audio: {
    hit: "/audio/hit.mp3",
    destroy: "/audio/destroy.mp3",
    intro: "/audio/intro.mp3",
  },
  items: {
    mushroom_blue: "/assets/items/mushroom_blue.png",
    stone: "/assets/items/stone.png",
    cactus: "/assets/items/cactus.png",
    bone: "/assets/items/bone.png",
    meat: "/assets/items/meat.png",
    wood: "/assets/items/wood.png",
    rope: "/assets/items/rope.png",
    shell: "/assets/items/shell.png",
    // Generated assets
    mushroom_brown: "/assets/items/mushroom_brown.png",
    plank: "/assets/items/plank.png",
    coin: "/assets/items/coin.png",
    grass: "/assets/items/grass.png",
    water: "/assets/items/water.png",
    stone_dark: "/assets/items/stone_dark.png",
    pebble: "/assets/items/pebble.png",
    dust: "/assets/items/dust.png",
    log: "/assets/items/log.png",
  },
  animals: {
    miniBunny: "/assets/animals/MiniBunny.png",
    miniBear: "/assets/animals/MiniBear.png",
    miniBird: "/assets/animals/MiniBird.png",
    miniBoar: "/assets/animals/MiniBoar.png",
    miniDeer1: "/assets/animals/MiniDeer1.png",
    miniDeer2: "/assets/animals/MiniDeer2.png",
    miniFox: "/assets/animals/MiniFox.png",
    miniWolf: "/assets/animals/MiniWolf.png",
  },
} as const;

/**
 * Animation type classification
 */
export type AnimationType = "behavioral" | "triggered";

/**
 * Individual transition animation configuration
 */
export interface AnimalTransition {
  name: string; // Transition name (e.g., "walk1", "walk2", "run", "jump", "hit", "death")
  frames: number[]; // Frame numbers for this transition
  type: AnimationType; // "behavioral" = randomly selected, "triggered" = manually triggered
}

/**
 * Animation frame ranges for each animal
 * Each animal has an idle animation and an array of transitions
 */
export interface AnimalAnimationFrames {
  idle: number[]; // Frames for idle animation
  transitions: AnimalTransition[]; // Array of transition animations (walk patterns, actions, etc.)
}

/**
 * Loot item configuration
 */
export interface LootItem {
  itemId: string; // Item ID (e.g., "bone", "meat")
  quantity: number; // Quantity to drop
}

// Animal configuration: frame dimensions and animation frames for each animal sprite sheet
export interface AnimalConfig {
  key: string;
  path: string;
  frameWidth: number;
  frameHeight: number;
  scale?: number;
  animations: AnimalAnimationFrames;
  maxHp?: number; // Maximum HP (default: 1)
  loot?: LootItem[]; // Loot items dropped when animal is killed
}

export const ANIMAL_CONFIGS: AnimalConfig[] = [
  {
    key: "miniBunny",
    path: ASSET_PATHS.animals.miniBunny,
    frameWidth: 32,
    frameHeight: 32,
    scale: 2,
    maxHp: 1,
    loot: [
      { itemId: "bone", quantity: 1 },
      { itemId: "meat", quantity: 1 },
    ],
    animations: {
      idle: [0, 1, 2, 3], // Row 0: frames 0-3
      transitions: [
        { name: "walk", frames: [4, 5, 6, 7], type: "behavioral" }, // Randomly selected
        { name: "hit", frames: [8, 9], type: "triggered" }, // Manually triggered
        { name: "death", frames: [12, 13, 14], type: "triggered" }, // Manually triggered
      ],
    },
  },
  {
    key: "miniBear",
    path: ASSET_PATHS.animals.miniBear,
    frameWidth: 32,
    frameHeight: 32,
    scale: 2,
    maxHp: 20,
    loot: [
      { itemId: "bone", quantity: 3 },
      { itemId: "meat", quantity: 5 },
    ],
    animations: {
      idle: [0, 1, 2, 3], // Row 0: frames 0-3
      transitions: [
        { name: "run", frames: [10, 11, 12, 13, 14, 15], type: "behavioral" },
        { name: "jump", frames: [20, 21, 22], type: "behavioral" },
        {
          name: "attack",
          frames: [30, 31, 32, 33, 34, 35],
          type: "behavioral",
        },
        { name: "bite", frames: [40, 41, 42, 43, 44], type: "behavioral" },
        {
          name: "stand",
          frames: [50, 51, 52, 53, 54, 55, 56, 57, 58, 59],
          type: "behavioral",
        },
        { name: "hit", frames: [60, 61], type: "triggered" },
        { name: "death", frames: [70, 71, 72, 73], type: "triggered" },
      ],
    },
  },
  {
    key: "miniBird",
    path: ASSET_PATHS.animals.miniBird,
    frameWidth: 16,
    frameHeight: 16,
    scale: 2,
    maxHp: 1,
    loot: [
      { itemId: "bone", quantity: 1 },
      { itemId: "meat", quantity: 1 },
    ],
    animations: {
      idle: [0, 1, 2, 3], // Row 0: frames 0-3
      transitions: [
        { name: "fly", frames: [4, 5, 6, 7], type: "behavioral" },
        { name: "death", frames: [8, 9, 10, 11], type: "triggered" },
      ],
    },
  },
  {
    key: "miniBoar",
    path: ASSET_PATHS.animals.miniBoar,
    frameWidth: 32,
    frameHeight: 32,
    scale: 2,
    maxHp: 5,
    loot: [
      { itemId: "bone", quantity: 2 },
      { itemId: "meat", quantity: 3 },
    ],
    animations: {
      idle: [0, 1, 2, 3], // Row 0: frames 0-3
      transitions: [
        { name: "walk", frames: [5, 6, 7, 8], type: "behavioral" },
        { name: "jump", frames: [10, 11, 12], type: "behavioral" },
        { name: "attack", frames: [15, 16, 17, 18, 19], type: "behavioral" },
        { name: "hit", frames: [20, 21], type: "triggered" },
        { name: "death", frames: [25, 26, 27, 28], type: "triggered" },
      ],
    },
  },
  {
    key: "miniDeer1",
    path: ASSET_PATHS.animals.miniDeer1,
    frameWidth: 32,
    frameHeight: 32,
    scale: 2,
    maxHp: 3,
    loot: [
      { itemId: "bone", quantity: 1 },
      { itemId: "meat", quantity: 2 },
    ],
    animations: {
      idle: [0, 1, 2, 3], // Row 0: frames 0-3
      transitions: [
        { name: "run", frames: [5, 6, 7, 8], type: "behavioral" },
        { name: "jump", frames: [10, 11, 12], type: "behavioral" },
        { name: "raise", frames: [15, 16, 17, 18, 19], type: "behavioral" },
        { name: "hit", frames: [20, 21], type: "triggered" },
        { name: "death", frames: [25, 26, 27, 28], type: "triggered" },
      ],
    },
  },
  {
    key: "miniDeer2",
    path: ASSET_PATHS.animals.miniDeer2,
    frameWidth: 32,
    frameHeight: 32,
    scale: 2,
    maxHp: 3,
    loot: [
      { itemId: "bone", quantity: 1 },
      { itemId: "meat", quantity: 2 },
    ],
    animations: {
      idle: [0, 1, 2, 3], // Row 0: frames 0-3
      transitions: [
        { name: "run", frames: [7, 8, 9, 10], type: "behavioral" },
        { name: "jump1", frames: [14, 15, 16], type: "behavioral" },
        { name: "jump2", frames: [21, 22, 23, 24, 25], type: "behavioral" },
        {
          name: "jump3",
          frames: [28, 29, 30, 31, 32, 33, 34],
          type: "behavioral",
        },
        { name: "hit", frames: [35, 36], type: "triggered" },
        { name: "death", frames: [42, 43, 44, 45], type: "triggered" },
      ],
    },
  },
  {
    key: "miniFox",
    path: ASSET_PATHS.animals.miniFox,
    frameWidth: 32,
    frameHeight: 32,
    scale: 2,
    maxHp: 5,
    loot: [
      { itemId: "bone", quantity: 2 },
      { itemId: "meat", quantity: 3 },
    ],
    animations: {
      idle: [0, 1, 2, 3], // Row 0: frames 0-3
      transitions: [
        { name: "walk", frames: [6, 7, 8, 9], type: "behavioral" },
        { name: "jump", frames: [12, 13, 14], type: "behavioral" },
        { name: "bark", frames: [18, 19, 20, 21, 22, 23], type: "behavioral" },
        { name: "hit", frames: [24, 25], type: "behavioral" },
        { name: "death", frames: [30, 31, 32, 33], type: "triggered" },
      ],
    },
  },
  {
    key: "miniWolf",
    path: ASSET_PATHS.animals.miniWolf,
    frameWidth: 32,
    frameHeight: 32,
    scale: 2,
    maxHp: 10,
    loot: [
      { itemId: "bone", quantity: 2 },
      { itemId: "meat", quantity: 4 },
    ],
    animations: {
      idle: [0, 1, 2, 3], // Row 0: frames 0-3
      transitions: [
        {
          name: "run",
          frames: [7, 8, 9, 10, 11, 12],
          type: "behavioral",
        },
        {
          name: "jump",
          frames: [14, 15, 16, 17],
          type: "behavioral",
        },
        { name: "bark", frames: [21, 22, 23, 24, 25], type: "behavioral" },
        { name: "attack", frames: [28, 29, 30, 31, 32], type: "behavioral" },
        {
          name: "howl",
          frames: [35, 36, 37, 38, 39, 40, 41],
          type: "behavioral",
        },
        { name: "hit", frames: [42, 43], type: "triggered" },
        { name: "death", frames: [49, 50, 51, 52], type: "triggered" },
      ],
    },
  },
] as const;
