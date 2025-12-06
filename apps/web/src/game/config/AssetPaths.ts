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
 * Individual transition animation configuration
 */
export interface AnimalTransition {
  name: string; // Transition name (e.g., "walk1", "walk2", "run", "jump")
  frames: number[]; // Frame numbers for this transition
}

/**
 * Animation frame ranges for each animal
 * Each animal has an idle animation and an array of transitions
 */
export interface AnimalAnimationFrames {
  idle: number[]; // Frames for idle animation
  transitions: AnimalTransition[]; // Array of transition animations (walk patterns, actions, etc.)
}

// Animal configuration: frame dimensions and animation frames for each animal sprite sheet
export interface AnimalConfig {
  key: string;
  path: string;
  frameWidth: number;
  frameHeight: number;
  scale?: number;
  animations: AnimalAnimationFrames;
}

export const ANIMAL_CONFIGS: AnimalConfig[] = [
  {
    key: "miniBunny",
    path: ASSET_PATHS.animals.miniBunny,
    frameWidth: 32,
    frameHeight: 32,
    scale: 2,
    animations: {
      idle: [0, 1, 2, 3], // Row 0: frames 0-3
      transitions: [
        { name: "walk1", frames: [4, 5, 6, 7] }, // Row 1: frames 4-7
        { name: "walk2", frames: [8, 9, 10, 11] }, // Row 2: frames 8-11
        { name: "walk3", frames: [12, 13, 14, 15] }, // Row 3: frames 12-15
      ],
    },
  },
  // {
  //   key: "miniBear",
  //   path: ASSET_PATHS.animals.miniBear,
  //   frameWidth: 80,
  //   frameHeight: 64,
  //   scale: 1.5,
  //   animations: {
  //     idle: [0, 1, 2, 3], // Row 0: frames 0-3
  //     transitions: [
  //       { name: "walk1", frames: [4, 5, 6, 7] },
  //       { name: "walk2", frames: [8, 9, 10, 11] },
  //       { name: "walk3", frames: [12, 13, 14, 15] },
  //     ],
  //   },
  // },
  // {
  //   key: "miniBird",
  //   path: ASSET_PATHS.animals.miniBird,
  //   frameWidth: 16,
  //   frameHeight: 12,
  //   scale: 3,
  //   animations: {
  //     idle: [0, 1, 2, 3], // Row 0: frames 0-3
  //     transitions: [
  //       { name: "fly1", frames: [4, 5, 6, 7] },
  //       { name: "fly2", frames: [8, 9, 10, 11] },
  //       { name: "fly3", frames: [12, 13, 14, 15] },
  //     ],
  //   },
  // },
  // {
  //   key: "miniBoar",
  //   path: ASSET_PATHS.animals.miniBoar,
  //   frameWidth: 40,
  //   frameHeight: 48,
  //   scale: 2,
  //   animations: {
  //     idle: [0, 1, 2, 3], // Row 0: frames 0-3
  //     transitions: [
  //       { name: "walk1", frames: [4, 5, 6, 7] },
  //       { name: "walk2", frames: [8, 9, 10, 11] },
  //       { name: "charge", frames: [12, 13, 14, 15] },
  //     ],
  //   },
  // },
  // {
  //   key: "miniDeer1",
  //   path: ASSET_PATHS.animals.miniDeer1,
  //   frameWidth: 40,
  //   frameHeight: 48,
  //   scale: 2,
  //   animations: {
  //     idle: [0, 1, 2, 3], // Row 0: frames 0-3
  //     transitions: [
  //       { name: "walk1", frames: [4, 5, 6, 7] },
  //       { name: "walk2", frames: [8, 9, 10, 11] },
  //       { name: "run", frames: [12, 13, 14, 15] },
  //     ],
  //   },
  // },
  // {
  //   key: "miniDeer2",
  //   path: ASSET_PATHS.animals.miniDeer2,
  //   frameWidth: 56,
  //   frameHeight: 56,
  //   scale: 1.8,
  //   animations: {
  //     idle: [0, 1, 2, 3], // Row 0: frames 0-3
  //     transitions: [
  //       { name: "walk1", frames: [4, 5, 6, 7] },
  //       { name: "walk2", frames: [8, 9, 10, 11] },
  //       { name: "walk3", frames: [12, 13, 14, 15] },
  //       { name: "jump", frames: [16, 17, 18, 19] }, // Example: 5 transitions
  //       { name: "run", frames: [20, 21, 22, 23] },
  //     ],
  //   },
  // },
  // {
  //   key: "miniFox",
  //   path: ASSET_PATHS.animals.miniFox,
  //   frameWidth: 48,
  //   frameHeight: 48,
  //   scale: 2,
  //   animations: {
  //     idle: [0, 1, 2, 3], // Row 0: frames 0-3
  //     transitions: [
  //       { name: "walk1", frames: [4, 5, 6, 7] },
  //       { name: "walk2", frames: [8, 9, 10, 11] },
  //       { name: "sneak", frames: [12, 13, 14, 15] },
  //     ],
  //   },
  // },
  // {
  //   key: "miniWolf",
  //   path: ASSET_PATHS.animals.miniWolf,
  //   frameWidth: 56,
  //   frameHeight: 64,
  //   scale: 1.8,
  //   animations: {
  //     idle: [0, 1, 2, 3], // Row 0: frames 0-3
  //     transitions: [
  //       { name: "walk1", frames: [4, 5, 6, 7] },
  //       { name: "walk2", frames: [8, 9, 10, 11] },
  //       { name: "run", frames: [12, 13, 14, 15] },
  //       { name: "howl", frames: [16, 17, 18, 19] },
  //     ],
  //   },
  // },
] as const;
