/**
 * Rasterizes OSM features into a 2D tile grid
 */

import * as turf from "@turf/turf";
import type { TileType } from "../config/OSMConfig";
import { OSM_CONFIG } from "../config/OSMConfig";
import {
  latLngToMeters,
  metersToLatLng,
  metersToTileGrid,
  type Point,
  sampleLinePoints,
} from "./CoordinateUtils";
import { classifyOSMFeature, shouldRenderFeature } from "./OSMClassifier";

export interface TileGrid {
  width: number;
  height: number;
  tiles: (TileType | null)[][];
}

/**
 * Rasterize GeoJSON features into a tile grid
 */
export const rasterizeFeatures = (
  features: GeoJSON.Feature[],
  centerLat: number,
  centerLng: number,
  radiusMeters: number,
  tileSize: number = OSM_CONFIG.tileSize,
  gridWidth: number = OSM_CONFIG.mapWidth,
  gridHeight: number = OSM_CONFIG.mapHeight,
): TileGrid => {
  // Initialize grid with default grass
  const tiles: (TileType | null)[][] = [];
  for (let y = 0; y < gridHeight; y++) {
    tiles[y] = [];
    for (let x = 0; x < gridWidth; x++) {
      tiles[y][x] = "GRASS";
    }
  }

  // Convert center to meters
  const centerMeters = latLngToMeters(centerLat, centerLng);
  const originX = centerMeters.x - (gridWidth * tileSize) / 2;
  const originY = centerMeters.y - (gridHeight * tileSize) / 2;

  // Process features in order of priority (water first, then roads, then buildings, then vegetation)
  const sortedFeatures = [...features].sort((a, b) => {
    const aType = classifyOSMFeature(a as any);
    const bType = classifyOSMFeature(b as any);

    // Priority: water > roads > buildings > vegetation > grass
    const priority: Record<string, number> = {
      WATER: 0,
      RIVER: 0,
      LAKE: 0,
      ROAD_MAIN: 1,
      ROAD_SMALL: 1,
      PATH: 1,
      HOUSE: 2,
      SHOP: 2,
      SCHOOL: 2,
      FACTORY: 2,
      FOREST: 3,
      PARK_GRASS: 3,
      GRASS: 4,
    };

    return (priority[aType] || 4) - (priority[bType] || 4);
  });

  for (const feature of sortedFeatures) {
    if (!shouldRenderFeature(feature as any)) continue;

    const tileType = classifyOSMFeature(feature as any);
    const geometry = feature.geometry;

    if (geometry.type === "LineString" || geometry.type === "MultiLineString") {
      rasterizeLineString(feature, tileType, tiles, originX, originY, tileSize);
    } else if (
      geometry.type === "Polygon" ||
      geometry.type === "MultiPolygon"
    ) {
      rasterizePolygon(feature, tileType, tiles, originX, originY, tileSize);
    } else if (geometry.type === "Point") {
      rasterizePoint(feature, tileType, tiles, originX, originY, tileSize);
    }
  }

  return {
    width: gridWidth,
    height: gridHeight,
    tiles,
  };
};

/**
 * Rasterize a LineString (roads, paths, rivers)
 */
const rasterizeLineString = (
  feature: GeoJSON.Feature,
  tileType: TileType,
  tiles: (TileType | null)[][],
  originX: number,
  originY: number,
  tileSize: number,
): void => {
  const coords = feature.geometry.coordinates as number[][];
  const points: Point[] = coords.map((coord) => {
    const meters = latLngToMeters(coord[1], coord[0]);
    return meters;
  });

  // Sample points along the line
  const sampledPoints = sampleLinePoints(points, tileSize / 2);

  // Buffer width based on tile type
  const bufferWidth = tileSize * (tileType === "ROAD_MAIN" ? 1.5 : 1.0);

  for (const point of sampledPoints) {
    const tilePos = metersToTileGrid(
      point.x,
      point.y,
      originX,
      originY,
      tileSize,
    );

    // Fill tiles in a buffer around the line
    const bufferTiles = Math.ceil(bufferWidth / tileSize);
    for (let dy = -bufferTiles; dy <= bufferTiles; dy++) {
      for (let dx = -bufferTiles; dx <= bufferTiles; dx++) {
        const x = tilePos.x + dx;
        const y = tilePos.y + dy;
        if (
          x >= 0 &&
          x < tiles[0].length &&
          y >= 0 &&
          y < tiles.length &&
          Math.sqrt(dx * dx + dy * dy) <= bufferTiles
        ) {
          // Only overwrite if current tile is lower priority (grass, park)
          const currentTile = tiles[y][x];
          if (
            currentTile === "GRASS" ||
            currentTile === "PARK_GRASS" ||
            currentTile === null
          ) {
            tiles[y][x] = tileType;
          }
        }
      }
    }
  }
};

/**
 * Rasterize a Polygon (buildings, water bodies, parks)
 */
const rasterizePolygon = (
  feature: GeoJSON.Feature,
  tileType: TileType,
  tiles: (TileType | null)[][],
  originX: number,
  originY: number,
  tileSize: number,
): void => {
  // Extract coordinates based on geometry type
  let polygonCoords: number[][][];

  if (feature.geometry.type === "Polygon") {
    polygonCoords = feature.geometry.coordinates as number[][][];
  } else if (feature.geometry.type === "MultiPolygon") {
    // For MultiPolygon, use the first polygon
    polygonCoords = (feature.geometry.coordinates as number[][][][])[0];
  } else {
    // Not a polygon, skip
    return;
  }

  // Ensure the polygon ring is closed (first and last point must be identical)
  const ring = polygonCoords[0];

  // A valid polygon ring needs at least 4 positions:
  // - 3 unique points minimum (triangle)
  // - 1 closing point (same as first)
  if (ring.length < 3) return; // Not enough points even for a triangle

  const closedRing = [...ring];
  const firstPoint = closedRing[0];
  const lastPoint = closedRing[closedRing.length - 1];

  // Close the ring if needed
  if (firstPoint[0] !== lastPoint[0] || firstPoint[1] !== lastPoint[1]) {
    closedRing.push([firstPoint[0], firstPoint[1]]);
  }

  // Final check: must have at least 4 positions (3 unique + 1 closing)
  if (closedRing.length < 4) {
    // If we have exactly 3 points, duplicate the first to make it 4
    // This creates a degenerate polygon but satisfies the requirement
    if (closedRing.length === 3) {
      closedRing.push([closedRing[0][0], closedRing[0][1]]);
    } else {
      return; // Too few points, skip this polygon
    }
  }

  // Use Turf.js for point-in-polygon checks
  const polygon = turf.polygon([closedRing]);

  // Get bounding box of polygon
  const bbox = turf.bbox(polygon);
  const minLng = bbox[0];
  const minLat = bbox[1];
  const maxLng = bbox[2];
  const maxLat = bbox[3];

  // Convert bbox to tile coordinates
  const minMeters = latLngToMeters(minLat, minLng);
  const maxMeters = latLngToMeters(maxLat, maxLng);
  const minTile = metersToTileGrid(
    minMeters.x,
    minMeters.y,
    originX,
    originY,
    tileSize,
  );
  const maxTile = metersToTileGrid(
    maxMeters.x,
    maxMeters.y,
    originX,
    originY,
    tileSize,
  );

  // Check each tile in the bounding box
  for (
    let tileY = Math.max(0, minTile.y);
    tileY <= Math.min(tiles.length - 1, maxTile.y);
    tileY++
  ) {
    for (
      let tileX = Math.max(0, minTile.x);
      tileX <= Math.min(tiles[0].length - 1, maxTile.x);
      tileX++
    ) {
      // Get center of tile in world coordinates
      const tileCenterMeters = {
        x: originX + (tileX + 0.5) * tileSize,
        y: originY + (tileY + 0.5) * tileSize,
      };

      // Convert back to lat/lng for point-in-polygon check
      const { lat, lng } = metersToLatLng(
        tileCenterMeters.x,
        tileCenterMeters.y,
      );

      const point = turf.point([lng, lat]);

      // Check if tile center is inside polygon
      if (turf.booleanPointInPolygon(point, polygon)) {
        // Only overwrite if current tile is lower priority
        const currentTile = tiles[tileY][tileX];
        if (
          currentTile === "GRASS" ||
          currentTile === "PARK_GRASS" ||
          currentTile === null ||
          // Allow water to overwrite other water
          tileType.startsWith("WATER") ||
          tileType === "RIVER" ||
          tileType === "LAKE"
        ) {
          tiles[tileY][tileX] = tileType;
        }
      }
    }
  }
};

/**
 * Rasterize a Point (amenities, POIs)
 */
const rasterizePoint = (
  feature: GeoJSON.Feature,
  tileType: TileType,
  tiles: (TileType | null)[][],
  originX: number,
  originY: number,
  tileSize: number,
): void => {
  const coords = feature.geometry.coordinates as number[];
  const meters = latLngToMeters(coords[1], coords[0]);
  const tilePos = metersToTileGrid(
    meters.x,
    meters.y,
    originX,
    originY,
    tileSize,
  );

  if (
    tilePos.x >= 0 &&
    tilePos.x < tiles[0].length &&
    tilePos.y >= 0 &&
    tilePos.y < tiles.length
  ) {
    const currentTile = tiles[tilePos.y][tilePos.x];
    if (
      currentTile === "GRASS" ||
      currentTile === "PARK_GRASS" ||
      currentTile === null
    ) {
      tiles[tilePos.y][tilePos.x] = tileType;
    }
  }
};
