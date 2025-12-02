/**
 * Orchestrates the complete OSM to Phaser tilemap conversion process
 */

import { OSM_CONFIG, type TileType } from "../config/OSMConfig";
import { PLANETILER_CONFIG } from "../config/PlanetilerConfig";
import { rasterizeFeatures } from "../utils/TilemapRasterizer";
import { fetchOSMDataForLocation } from "./OSMService";
import { fetchTilesAsGeoJSON } from "./PlanetilerTileService";

export interface GeneratedTilemap {
  tilemapData: any; // Tiled JSON format
  spawnX: number;
  spawnY: number;
}

/**
 * Generate a Phaser-compatible tilemap from OSM data
 * Can use either Overpass API or Planetiler tiles
 */
export const generateTilemapFromOSM = async (
  lat: number,
  lng: number,
  radiusMeters: number = OSM_CONFIG.defaultRadius,
  usePlanetiler: boolean = false,
): Promise<GeneratedTilemap> => {
  let geoJSON: GeoJSON.FeatureCollection;

  // Step 1: Fetch data - try Planetiler/PMTiles first if enabled, fallback to Overpass
  if (usePlanetiler) {
    try {
      geoJSON = await fetchTilesAsGeoJSON(
        lat,
        lng,
        radiusMeters,
        PLANETILER_CONFIG.defaultZoom,
      );

      // If no features found, fallback to Overpass
      if (geoJSON.features.length === 0) {
        console.warn(
          "No Planetiler/PMTiles tiles found, falling back to Overpass API",
        );
        geoJSON = await fetchOSMDataForLocation(lat, lng, radiusMeters);
      }
    } catch (error) {
      console.warn(
        "Planetiler/PMTiles tile fetch failed, falling back to Overpass API:",
        error,
      );
      geoJSON = await fetchOSMDataForLocation(lat, lng, radiusMeters);
    }
  } else {
    geoJSON = await fetchOSMDataForLocation(lat, lng, radiusMeters);
  }

  // Step 2: Rasterize features into tile grid
  const tileGrid = rasterizeFeatures(
    geoJSON.features,
    lat,
    lng,
    radiusMeters,
    OSM_CONFIG.tileSize,
    OSM_CONFIG.mapWidth,
    OSM_CONFIG.mapHeight,
  );

  // Step 3: Convert tile grid to Phaser tilemap format
  const tilemapData = convertTileGridToPhaserFormat(tileGrid);

  // Spawn point is center of map
  const spawnX = (tileGrid.width * 32) / 2;
  const spawnY = (tileGrid.height * 32) / 2;

  return {
    tilemapData,
    spawnX,
    spawnY,
  };
};

/**
 * Convert tile grid to Phaser/Tiled JSON format
 */
const convertTileGridToPhaserFormat = (tileGrid: {
  width: number;
  height: number;
  tiles: (TileType | null)[][];
}): any => {
  const tileWidth = 32;
  const tileHeight = 32;

  // Convert tile types to GIDs
  let data: number[] = [];
  for (let y = 0; y < tileGrid.height; y++) {
    for (let x = 0; x < tileGrid.width; x++) {
      const tileType = tileGrid.tiles[y][x] || "GRASS";
      const gid =
        OSM_CONFIG.tileTypeToGID[tileType] || OSM_CONFIG.defaultTileGID;
      data.push(gid);
    }
  }

  // Ensure we have valid dimensions
  if (tileGrid.width <= 0 || tileGrid.height <= 0) {
    throw new Error(
      `Invalid tile grid dimensions: ${tileGrid.width}x${tileGrid.height}`,
    );
  }

  // Ensure data array has correct length
  const expectedDataLength = tileGrid.width * tileGrid.height;
  if (data.length !== expectedDataLength) {
    console.warn(
      `Data length mismatch: expected ${expectedDataLength}, got ${data.length}. Padding/truncating...`,
    );
    // Pad or truncate to match expected length
    while (data.length < expectedDataLength) {
      data.push(OSM_CONFIG.defaultTileGID);
    }
    data = data.slice(0, expectedDataLength);
  }

  // Create Phaser-compatible tilemap structure (Tiled JSON format)
  // Note: Phaser expects the exact Tiled JSON format
  const tilemap = {
    compressionlevel: -1,
    height: tileGrid.height,
    infinite: false,
    layers: [
      {
        data: data.map((gid) => Math.max(0, gid - 1)), // Phaser uses 0-based indices, ensure non-negative
        height: tileGrid.height,
        id: 1,
        name: "Below Player",
        opacity: 1,
        type: "tilelayer",
        visible: true,
        width: tileGrid.width,
        x: 0,
        y: 0,
      },
      {
        data: new Array(tileGrid.width * tileGrid.height).fill(0),
        height: tileGrid.height,
        id: 2,
        name: "World",
        opacity: 1,
        type: "tilelayer",
        visible: true,
        width: tileGrid.width,
        x: 0,
        y: 0,
      },
      {
        data: new Array(tileGrid.width * tileGrid.height).fill(0),
        height: tileGrid.height,
        id: 3,
        name: "Above Player",
        opacity: 1,
        type: "tilelayer",
        visible: true,
        width: tileGrid.width,
        x: 0,
        y: 0,
      },
    ],
    nextlayerid: 4,
    nextobjectid: 1,
    orientation: "orthogonal",
    properties: [],
    renderorder: "right-down",
    tiledversion: "1.11.2",
    tileheight: tileHeight,
    tilesets: [
      {
        columns: 24,
        firstgid: 1,
        image: "/tilesets/tuxmon-sample-32px-extruded.png",
        imageheight: 1020,
        imagewidth: 816,
        margin: 1,
        name: "tuxmon-sample-32px-extruded",
        spacing: 2,
        tilecount: 720,
        tileheight: tileHeight,
        tilewidth: tileWidth,
      },
    ],
    tilewidth: tileWidth,
    type: "map",
    version: "1.10",
    width: tileGrid.width,
  };

  // Validate the structure before returning
  if (!tilemap.layers || tilemap.layers.length === 0) {
    throw new Error("Generated tilemap has no layers");
  }

  return tilemap;
};

/**
 * Cache key for storing generated tilemaps
 */
export const getCacheKey = (
  lat: number,
  lng: number,
  radius: number,
): string => {
  return `osm_tilemap_${lat.toFixed(4)}_${lng.toFixed(4)}_${radius}`;
};

/**
 * Load tilemap from cache
 */
export const loadTilemapFromCache = (
  lat: number,
  lng: number,
  radius: number,
): GeneratedTilemap | null => {
  try {
    const cacheKey = getCacheKey(lat, lng, radius);
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      return JSON.parse(cached) as GeneratedTilemap;
    }
  } catch (error) {
    console.warn("Failed to load tilemap from cache:", error);
  }
  return null;
};

/**
 * Save tilemap to cache
 */
export const saveTilemapToCache = (
  lat: number,
  lng: number,
  radius: number,
  tilemap: GeneratedTilemap,
): void => {
  try {
    const cacheKey = getCacheKey(lat, lng, radius);
    localStorage.setItem(cacheKey, JSON.stringify(tilemap));
  } catch (error) {
    console.warn("Failed to save tilemap to cache:", error);
  }
};
