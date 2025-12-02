/**
 * Configuration for OSM to Tilemap conversion
 */

export const OSM_CONFIG = {
  // Overpass API endpoints (fallback list)
  overpassEndpoints: [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter",
  ],

  // Default parameters
  defaultRadius: 200, // meters (reduced for faster queries)
  tileSize: 3, // meters per tile (Pokémon style: 2-4m)

  // Map dimensions (in tiles)
  mapWidth: 200,
  mapHeight: 200,

  // Request timeout (ms)
  requestTimeout: 30000, // Increased to 30s

  // Tile type to Phaser GID mapping
  // These GIDs correspond to tiles in the existing tileset
  // We'll use simple mappings for now (1 tile type = 1 tile)
  tileTypeToGID: {
    GRASS: 1, // Default grass tile
    ROAD_MAIN: 50, // Main road (approximate, adjust based on tileset)
    ROAD_SMALL: 51,
    PATH: 52,
    HOUSE: 100, // Building tile (approximate)
    SHOP: 101,
    SCHOOL: 102,
    FACTORY: 103,
    FOREST: 200, // Forest tile (approximate)
    PARK_GRASS: 201,
    WATER: 300, // Water tile (approximate)
    RIVER: 301,
    LAKE: 302,
  } as Record<string, number>,

  // Default tile if classification fails
  defaultTileGID: 1, // Grass
} as const;

export type TileType = keyof typeof OSM_CONFIG.tileTypeToGID;
