/**
 * Utilities for coordinate conversion and geometric calculations
 */

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Convert lat/lng to Web Mercator coordinates (meters)
 */
export const latLngToMeters = (lat: number, lng: number): Point => {
  const earthRadius = 6378137; // Earth radius in meters
  const x = lng * (Math.PI / 180) * earthRadius;
  const y =
    Math.log(Math.tan(((90 + lat) * (Math.PI / 180)) / 2)) * earthRadius;
  return { x, y };
};

/**
 * Convert Web Mercator coordinates back to lat/lng
 */
export const metersToLatLng = (
  x: number,
  y: number,
): { lat: number; lng: number } => {
  const earthRadius = 6378137;
  const lng = (x / earthRadius) * (180 / Math.PI);
  const lat =
    (2 * Math.atan(Math.exp(y / earthRadius)) - Math.PI / 2) * (180 / Math.PI);
  return { lat, lng };
};

/**
 * Calculate bounding box from center point and radius
 */
export const calculateBoundingBox = (
  centerLat: number,
  centerLng: number,
  radiusMeters: number,
): BoundingBox => {
  // Approximate conversion: 1 degree lat ≈ 111km, 1 degree lng ≈ 111km * cos(lat)
  const latDelta = radiusMeters / 111000;
  const lngDelta =
    radiusMeters / (111000 * Math.cos((centerLat * Math.PI) / 180));

  return {
    minLat: centerLat - latDelta,
    maxLat: centerLat + latDelta,
    minLng: centerLng - lngDelta,
    maxLng: centerLng + lngDelta,
  };
};

/**
 * Convert world coordinates (meters) to tile grid coordinates
 */
export const metersToTileGrid = (
  x: number,
  y: number,
  originX: number,
  originY: number,
  tileSize: number,
): Point => {
  const tileX = Math.floor((x - originX) / tileSize);
  const tileY = Math.floor((y - originY) / tileSize);
  return { x: tileX, y: tileY };
};

/**
 * Convert tile grid coordinates to world coordinates (meters)
 */
export const tileGridToMeters = (
  tileX: number,
  tileY: number,
  originX: number,
  originY: number,
  tileSize: number,
): Point => {
  const x = originX + tileX * tileSize;
  const y = originY + tileY * tileSize;
  return { x, y };
};

/**
 * Calculate distance between two points in meters
 */
export const distanceMeters = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number => {
  const R = 6378137; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Sample points along a line at regular intervals
 */
export const sampleLinePoints = (
  points: Point[],
  intervalMeters: number,
): Point[] => {
  if (points.length < 2) return points;

  const sampled: Point[] = [points[0]];

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > intervalMeters) {
      const numSamples = Math.floor(distance / intervalMeters);
      for (let j = 1; j <= numSamples; j++) {
        const t = (j * intervalMeters) / distance;
        sampled.push({
          x: p1.x + dx * t,
          y: p1.y + dy * t,
        });
      }
    }

    sampled.push(p2);
  }

  return sampled;
};
