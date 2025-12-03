export const ASSET_PATHS = {
  tiles: "/tilesets/base-terrain.png",
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
} as const;
