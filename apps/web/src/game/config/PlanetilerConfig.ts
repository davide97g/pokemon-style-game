/**
 * Configuration for Planetiler tile service
 */

export const PLANETILER_CONFIG = {
  // Enable Planetiler/PMTiles tile fetching (set to true to use Planetiler/PMTiles tiles)
  enabled: true, // Enabled by default - uses public tile servers

  // Tile server endpoints (can be PMTiles or standard XYZ tile servers)
  // Priority: First server in the list is tried first, falls back to next if it fails
  // For vector tiles, use .pbf extension
  // For raster tiles, use .png or .jpg extension
  // For PMTiles archives, use .pmtiles extension (single file archive)
  tileServers: [
    // Public vector tile servers (OpenMapTiles format)
    // These provide vector tiles in .pbf format
    "https://tile.ourmap.us/{z}/{x}/{y}.pbf", // OpenMapTiles Community Server

    // Alternative: OpenStreetMap US vector tiles
    "https://tiles.openstreetmap.us/vectiles-highroad/{z}/{x}/{y}.pbf",

    // PMTiles archives (if you have your own, add them here)
    // Example: "https://your-storage.com/tiles.pmtiles",

    // Fallback: OSM standard raster tiles (for testing/compatibility)
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  ],

  // Default zoom level for fetching tiles
  defaultZoom: 14,

  // Tile size in pixels (standard is 256x256)
  tileSize: 256,

  // Maximum zoom level to fetch
  maxZoom: 18,

  // Minimum zoom level to fetch
  minZoom: 10,

  // Request timeout (ms)
  requestTimeout: 30000,

  // Enable caching of tiles
  enableCache: true,

  // Cache expiration time (ms) - 24 hours
  cacheExpiration: 24 * 60 * 60 * 1000,
} as const;

export type TileServerType = "xyz" | "pmtiles" | "mbtiles";
