/**
 * Service for fetching tiles from Planetiler-generated tile servers
 * Supports XYZ tile servers, PMTiles, and MBTiles formats
 */

import { PLANETILER_CONFIG } from "../config/PlanetilerConfig";
import {
  type BoundingBox,
  calculateBoundingBox,
} from "../utils/CoordinateUtils";

// PMTiles types - RangeResponse contains data as ArrayBuffer (defined in pmtiles library)

export interface TileCoord {
  x: number;
  y: number;
  z: number;
}

export interface VectorTileFeature {
  type: "Point" | "LineString" | "Polygon";
  geometry: number[][];
  properties: Record<string, unknown>;
}

export interface VectorTile {
  layers: Record<
    string,
    {
      features: VectorTileFeature[];
      version?: number;
      extent?: number;
    }
  >;
}

/**
 * Convert lat/lng to tile coordinates (XYZ scheme)
 */
export const latLngToTile = (
  lat: number,
  lng: number,
  zoom: number,
): TileCoord => {
  const n = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return { x, y, z: zoom };
};

/**
 * Convert tile coordinates to bounding box
 */
export const tileToBoundingBox = (tile: TileCoord): BoundingBox => {
  const n = 2 ** tile.z;
  const minLng = (tile.x / n) * 360 - 180;
  const maxLng = ((tile.x + 1) / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * tile.y) / n)));
  const minLat = (latRad * 180) / Math.PI;
  const latRad2 = Math.atan(Math.sinh(Math.PI * (1 - (2 * (tile.y + 1)) / n)));
  const maxLat = (latRad2 * 180) / Math.PI;
  return { minLat, maxLat, minLng, maxLng };
};

/**
 * Get all tiles needed for a bounding box at a given zoom level
 */
export const getTilesForBoundingBox = (
  bbox: BoundingBox,
  zoom: number,
): TileCoord[] => {
  const minTile = latLngToTile(bbox.maxLat, bbox.minLng, zoom);
  const maxTile = latLngToTile(bbox.minLat, bbox.maxLng, zoom);

  const tiles: TileCoord[] = [];
  for (let x = minTile.x; x <= maxTile.x; x++) {
    for (let y = minTile.y; y <= maxTile.y; y++) {
      tiles.push({ x, y, z: zoom });
    }
  }
  return tiles;
};

/**
 * Fetch a single tile from XYZ tile server
 */
export const fetchXYZTile = async (
  tile: TileCoord,
  serverUrl: string,
): Promise<ArrayBuffer | null> => {
  const url = serverUrl
    .replace("{z}", tile.z.toString())
    .replace("{x}", tile.x.toString())
    .replace("{y}", tile.y.toString());

  // Check cache first
  if (PLANETILER_CONFIG.enableCache) {
    const cacheKey = `planetiler_tile_${tile.z}_${tile.x}_${tile.y}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const cachedData = JSON.parse(cached);
      const now = Date.now();
      if (now - cachedData.timestamp < PLANETILER_CONFIG.cacheExpiration) {
        // Convert base64 back to ArrayBuffer
        const binaryString = atob(cachedData.data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
      }
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    PLANETILER_CONFIG.requestTimeout,
  );

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/x-protobuf,application/octet-stream,*/*",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 404) {
        // Tile doesn't exist (common for sparse tile sets)
        return null;
      }
      throw new Error(
        `Failed to fetch tile: ${response.status} ${response.statusText}`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();

    // Cache the tile
    if (PLANETILER_CONFIG.enableCache && arrayBuffer) {
      const cacheKey = `planetiler_tile_${tile.z}_${tile.x}_${tile.y}`;
      // Convert ArrayBuffer to base64 for storage
      const bytes = new Uint8Array(arrayBuffer);
      let binaryString = "";
      for (let i = 0; i < bytes.length; i++) {
        binaryString += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binaryString);
      localStorage.setItem(
        cacheKey,
        JSON.stringify({
          data: base64,
          timestamp: Date.now(),
        }),
      );
    }

    return arrayBuffer;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Tile request timeout");
    }
    throw error;
  }
};

/**
 * Parse vector tile (protobuf format) using @mapbox/vector-tile
 */
export const parseVectorTile = async (
  buffer: ArrayBuffer,
  _tileCoord: TileCoord,
): Promise<VectorTile> => {
  // Check if it's a PNG (raster tile)
  const bytes = new Uint8Array(buffer);
  const isPNG =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;

  if (isPNG) {
    // This is a raster tile, not a vector tile
    // Return empty structure - we'll handle raster tiles differently
    return { layers: {} };
  }

  // Parse vector tile using @mapbox/vector-tile
  try {
    // Dynamic import to avoid issues if library isn't available
    const VectorTileModule = await import("@mapbox/vector-tile");
    // @mapbox/vector-tile exports VectorTile as a named class export
    const VectorTile = (
      VectorTileModule as { VectorTile: typeof VectorTileModule.VectorTile }
    ).VectorTile;
    const PbfModule = await import("pbf");
    // pbf exports Pbf as default - use any for now to avoid complex type issues
    const Pbf = (
      PbfModule as { default: new (buf?: ArrayBuffer | Uint8Array) => any }
    ).default;

    const pbf = new Pbf(new Uint8Array(buffer));
    const tile = new VectorTile(pbf);

    const layers: Record<
      string,
      { features: VectorTileFeature[]; version?: number; extent?: number }
    > = {};

    for (const layerName of Object.keys(tile.layers)) {
      const layer = tile.layers[layerName];
      const features: VectorTileFeature[] = [];

      for (let i = 0; i < layer.length; i++) {
        const feature = layer.feature(i);
        const geometry = feature.loadGeometry();

        // Convert geometry to our format
        const coords: number[][] = [];
        for (const ring of geometry) {
          for (const point of ring) {
            coords.push([point.x, point.y]);
          }
        }

        let type: "Point" | "LineString" | "Polygon" = "Point";
        if (feature.type === 1) type = "Point";
        else if (feature.type === 2) type = "LineString";
        else if (feature.type === 3) type = "Polygon";

        features.push({
          type,
          geometry: coords,
          properties: feature.properties,
        });
      }

      layers[layerName] = {
        features,
        version: layer.version,
        extent: layer.extent,
      };
    }

    return { layers };
  } catch (error) {
    console.warn("Failed to parse vector tile, falling back to empty:", error);
    return { layers: {} };
  }
};

/**
 * Fetch tiles for a location with radius
 */
export const fetchTilesForLocation = async (
  lat: number,
  lng: number,
  radiusMeters: number,
  zoom: number = PLANETILER_CONFIG.defaultZoom,
): Promise<Map<string, ArrayBuffer>> => {
  const bbox = calculateBoundingBox(lat, lng, radiusMeters);
  const tiles = getTilesForBoundingBox(bbox, zoom);

  const tileMap = new Map<string, ArrayBuffer>();
  const serverUrl = PLANETILER_CONFIG.tileServers[0];

  // Fetch tiles in parallel (with some concurrency limit)
  const fetchPromises = tiles.map(async (tile) => {
    try {
      const tileKey = `${tile.z}/${tile.x}/${tile.y}`;
      const buffer = await fetchXYZTile(tile, serverUrl);
      if (buffer) {
        tileMap.set(tileKey, buffer);
      }
    } catch (error) {
      console.warn(
        `Failed to fetch tile ${tile.z}/${tile.x}/${tile.y}:`,
        error,
      );
    }
  });

  await Promise.all(fetchPromises);

  return tileMap;
};

/**
 * Fetch and parse vector tiles for a location, converting to GeoJSON
 */
export const fetchVectorTilesAsGeoJSON = async (
  lat: number,
  lng: number,
  radiusMeters: number,
  zoom: number = PLANETILER_CONFIG.defaultZoom,
  serverUrl?: string,
): Promise<GeoJSON.FeatureCollection> => {
  const bbox = calculateBoundingBox(lat, lng, radiusMeters);
  const tiles = getTilesForBoundingBox(bbox, zoom);
  const url = serverUrl || PLANETILER_CONFIG.tileServers[0];

  const allFeatures: GeoJSON.Feature[] = [];

  // Fetch and parse tiles
  const parsePromises = tiles.map(async (tile) => {
    try {
      const buffer = await fetchXYZTile(tile, url);
      if (!buffer) return;

      const vectorTile = await parseVectorTile(buffer, tile);
      const geoJSON = vectorTileToGeoJSON(vectorTile, tile);

      allFeatures.push(...geoJSON.features);
    } catch (error) {
      console.warn(
        `Failed to parse tile ${tile.z}/${tile.x}/${tile.y}:`,
        error,
      );
    }
  });

  await Promise.all(parsePromises);

  return {
    type: "FeatureCollection",
    features: allFeatures,
  };
};

/**
 * Convert vector tile features to GeoJSON
 */
export const vectorTileToGeoJSON = (
  tile: VectorTile,
  tileCoord: TileCoord,
): GeoJSON.FeatureCollection => {
  const features: GeoJSON.Feature[] = [];
  const bbox = tileToBoundingBox(tileCoord);
  const extent = 4096; // Standard vector tile extent

  for (const [layerName, layer] of Object.entries(tile.layers)) {
    for (const feature of layer.features) {
      // Convert tile coordinates to lat/lng
      // This is simplified - proper conversion requires more complex math
      const geometry = convertTileGeometryToGeoJSON(
        feature.geometry,
        feature.type,
        bbox,
        extent,
      );

      features.push({
        type: "Feature",
        geometry,
        properties: {
          ...feature.properties,
          _layer: layerName,
        },
      });
    }
  }

  return {
    type: "FeatureCollection",
    features,
  };
};

/**
 * Convert tile-relative geometry to GeoJSON coordinates
 */
const convertTileGeometryToGeoJSON = (
  geometry: number[][],
  type: "Point" | "LineString" | "Polygon",
  bbox: BoundingBox,
  extent: number,
): GeoJSON.Geometry => {
  const latRange = bbox.maxLat - bbox.minLat;
  const lngRange = bbox.maxLng - bbox.minLng;

  const convertPoint = (point: number[]): number[] => {
    const x = point[0] / extent;
    const y = point[1] / extent;
    const lng = bbox.minLng + x * lngRange;
    const lat = bbox.maxLat - y * latRange; // Y is inverted in tiles
    return [lng, lat];
  };

  if (type === "Point") {
    return {
      type: "Point",
      coordinates: convertPoint(geometry[0]),
    };
  }

  if (type === "LineString") {
    return {
      type: "LineString",
      coordinates: geometry.map(convertPoint),
    };
  }

  if (type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: [geometry.map(convertPoint)],
    };
  }

  throw new Error(`Unsupported geometry type: ${type}`);
};

/**
 * Check if a URL is a PMTiles archive
 */
const isPMTilesUrl = (url: string): boolean => {
  return url.endsWith(".pmtiles") || url.includes(".pmtiles");
};

/**
 * Initialize PMTiles source from URL
 */
const initPMTilesSource = async (url: string): Promise<any> => {
  try {
    const PMTilesModule = await import("pmtiles");
    // PMTiles is exported as a class
    const PMTiles = (PMTilesModule as any).PMTiles;
    const source = new PMTiles(url);
    return source;
  } catch (error) {
    console.warn("Failed to initialize PMTiles source:", error);
    return null;
  }
};

/**
 * Fetch a single tile from PMTiles archive
 */
const fetchPMTilesTile = async (
  tile: TileCoord,
  source: any,
): Promise<ArrayBuffer | null> => {
  try {
    // PMTiles uses standard XYZ coordinates (not TMS)
    const response = await source.getZxy(tile.z, tile.x, tile.y);
    if (!response) return null;
    // RangeResponse has data property
    return response.data || response;
  } catch (error) {
    console.warn(
      `Failed to fetch PMTiles tile ${tile.z}/${tile.x}/${tile.y}:`,
      error,
    );
    return null;
  }
};

/**
 * Fetch and parse tiles from PMTiles archive for a location
 */
export const fetchPMTilesAsGeoJSON = async (
  lat: number,
  lng: number,
  radiusMeters: number,
  pmtilesUrl: string,
  zoom: number = PLANETILER_CONFIG.defaultZoom,
): Promise<GeoJSON.FeatureCollection> => {
  // Initialize PMTiles source
  const source = await initPMTilesSource(pmtilesUrl);
  if (!source) {
    throw new Error("Failed to initialize PMTiles source");
  }

  // Check if location is within PMTiles bounds
  const header = await source.getHeader();
  if (
    lat < header.minLat ||
    lat > header.maxLat ||
    lng < header.minLon ||
    lng > header.maxLon
  ) {
    throw new Error("Location is outside PMTiles bounds");
  }

  const bbox = calculateBoundingBox(lat, lng, radiusMeters);
  const tiles = getTilesForBoundingBox(bbox, zoom);

  const allFeatures: GeoJSON.Feature[] = [];

  // Fetch and parse tiles
  const parsePromises = tiles.map(async (tile) => {
    try {
      const buffer = await fetchPMTilesTile(tile, source);
      if (!buffer) return;

      const vectorTile = await parseVectorTile(buffer, tile);
      const geoJSON = vectorTileToGeoJSON(vectorTile, tile);

      allFeatures.push(...geoJSON.features);
    } catch (error) {
      console.warn(
        `Failed to parse PMTiles tile ${tile.z}/${tile.x}/${tile.y}:`,
        error,
      );
    }
  });

  await Promise.all(parsePromises);

  return {
    type: "FeatureCollection",
    features: allFeatures,
  };
};

/**
 * Detect tile server type and fetch accordingly
 * Tries each server in order until one succeeds
 */
export const fetchTilesAsGeoJSON = async (
  lat: number,
  lng: number,
  radiusMeters: number,
  zoom: number = PLANETILER_CONFIG.defaultZoom,
): Promise<GeoJSON.FeatureCollection> => {
  const servers = PLANETILER_CONFIG.tileServers;
  let lastError: Error | null = null;

  // Try each server in order
  for (const serverUrl of servers) {
    try {
      // Check if it's a PMTiles URL
      if (isPMTilesUrl(serverUrl)) {
        const result = await fetchPMTilesAsGeoJSON(
          lat,
          lng,
          radiusMeters,
          serverUrl,
          zoom,
        );
        if (result.features.length > 0) {
          return result;
        }
        // If no features, try next server
        continue;
      }

      // Otherwise, use XYZ tile server
      const result = await fetchVectorTilesAsGeoJSON(
        lat,
        lng,
        radiusMeters,
        zoom,
        serverUrl,
      );
      if (result.features.length > 0) {
        return result;
      }
      // If no features, try next server
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`Tile server ${serverUrl} failed, trying next:`, error);
      // Continue to next server
    }
  }

  // All servers failed
  throw lastError || new Error("All tile servers failed");
};
