/**
 * Service for fetching OSM data via Overpass API
 */

import { OSM_CONFIG } from "../config/OSMConfig";
import type { BoundingBox } from "../utils/CoordinateUtils";
import { calculateBoundingBox } from "../utils/CoordinateUtils";

export interface OSMResponse {
  elements: Array<{
    type: string;
    id: number;
    lat?: number;
    lon?: number;
    tags?: Record<string, string>;
    nodes?: number[];
    members?: Array<{
      type: string;
      ref: number;
      role: string;
    }>;
    geometry?: Array<{
      lat: number;
      lon: number;
    }>;
  }>;
}

/**
 * Fetch OSM data for a given bounding box with retry and fallback
 */
export const fetchOSMData = async (
  bbox: BoundingBox,
  timeout: number = OSM_CONFIG.requestTimeout,
): Promise<OSMResponse> => {
  // Simplified Overpass QL query - only ways (no relations for performance)
  // Relations are complex and can cause timeouts
  const queryTimeout = Math.min(Math.floor(timeout / 1000), 25); // Max 25s for Overpass
  const query = `
    [out:json][timeout:${queryTimeout}];
    (
      // Buildings (ways only - no relations)
      way["building"](${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng});
      
      // Highways (roads, paths)
      way["highway"](${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng});
      
      // Land use (ways only)
      way["landuse"](${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng});
      
      // Natural features (ways only)
      way["natural"](${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng});
      
      // Waterways
      way["waterway"](${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng});
      
      // Water bodies
      way["water"](${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng});
      
      // Amenities (points only - ways are usually buildings)
      node["amenity"](${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng});
      
      // Leisure (ways only)
      way["leisure"](${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng});
    );
    out geom;
  `;

  // Try each endpoint with retry
  const endpoints = OSM_CONFIG.overpassEndpoints;
  let lastError: Error | null = null;

  for (const endpoint of endpoints) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          if (response.status === 504 || response.status === 429) {
            // Gateway timeout or rate limit - try next endpoint
            lastError = new Error(
              `OSM API error: ${response.status} ${response.statusText}`,
            );
            continue;
          }
          throw new Error(
            `OSM API error: ${response.status} ${response.statusText}`,
          );
        }

        const data: OSMResponse = await response.json();

        // Validate response
        if (!data.elements || !Array.isArray(data.elements)) {
          throw new Error("Invalid OSM response format");
        }

        return data;
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error) {
          if (error.name === "AbortError") {
            lastError = new Error("OSM request timeout");
            continue; // Try next endpoint or retry
          }
          lastError = error;
        }
      }
    }
  }

  // All endpoints failed
  throw lastError || new Error("Failed to fetch OSM data from all endpoints");
};

/**
 * Convert OSM response to GeoJSON format
 * Manual conversion from OSM format to GeoJSON
 */
export const osmToGeoJSON = (
  osmData: OSMResponse,
): GeoJSON.FeatureCollection => {
  const features: GeoJSON.Feature[] = [];

  // Build a map of nodes for quick lookup
  const nodeMap = new Map<number, { lat: number; lon: number }>();
  for (const element of osmData.elements) {
    if (
      element.type === "node" &&
      element.lat !== undefined &&
      element.lon !== undefined
    ) {
      nodeMap.set(element.id, { lat: element.lat, lon: element.lon });
    }
  }

  // Process ways (lines and polygons)
  for (const element of osmData.elements) {
    if (element.type === "way") {
      const nodes = element.nodes || element.geometry;
      if (!nodes || nodes.length === 0) continue;

      let coordinates: number[][] = [];

      // If geometry is provided, use it directly
      if (
        element.geometry &&
        Array.isArray(element.geometry) &&
        element.geometry.length > 0
      ) {
        if (
          typeof element.geometry[0] === "object" &&
          "lat" in element.geometry[0]
        ) {
          coordinates = element.geometry.map(
            (g: { lat: number; lon: number }) => [g.lon, g.lat],
          );
        }
      } else if (element.nodes) {
        // Build coordinates from node references
        coordinates = element.nodes
          .map((nodeId) => {
            const node = nodeMap.get(nodeId);
            return node ? [node.lon, node.lat] : null;
          })
          .filter((coord): coord is number[] => coord !== null);
      }

      if (coordinates.length < 2) continue;

      // Check if it's a closed polygon (first and last points are the same, or building tag)
      const isClosed =
        (coordinates.length >= 4 &&
          coordinates[0][0] === coordinates[coordinates.length - 1][0] &&
          coordinates[0][1] === coordinates[coordinates.length - 1][1]) ||
        element.tags?.building !== undefined ||
        element.tags?.landuse !== undefined ||
        element.tags?.natural === "water" ||
        element.tags?.waterway === undefined;

      let geometry: GeoJSON.Geometry;

      if (isClosed) {
        // Ensure polygon is properly closed (first and last point must be identical)
        const closedCoordinates = [...coordinates];
        const firstPoint = closedCoordinates[0];
        const lastPoint = closedCoordinates[closedCoordinates.length - 1];

        // If not already closed, close it
        if (firstPoint[0] !== lastPoint[0] || firstPoint[1] !== lastPoint[1]) {
          closedCoordinates.push([firstPoint[0], firstPoint[1]]);
        }

        geometry = {
          type: "Polygon",
          coordinates: [closedCoordinates],
        };
      } else {
        geometry = {
          type: "LineString",
          coordinates,
        };
      }

      features.push({
        type: "Feature",
        geometry,
        properties: element.tags || {},
      });
    } else if (
      element.type === "node" &&
      element.lat !== undefined &&
      element.lon !== undefined
    ) {
      // Process standalone nodes (points)
      if (element.tags && Object.keys(element.tags).length > 0) {
        features.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [element.lon, element.lat],
          },
          properties: element.tags,
        });
      }
    }
    // Note: Relations are more complex and skipped for now
    // They would require processing members and building MultiPolygon structures
  }

  return {
    type: "FeatureCollection",
    features,
  };
};

/**
 * Fetch OSM data for a location with radius
 */
export const fetchOSMDataForLocation = async (
  lat: number,
  lng: number,
  radiusMeters: number = OSM_CONFIG.defaultRadius,
): Promise<GeoJSON.FeatureCollection> => {
  const bbox = calculateBoundingBox(lat, lng, radiusMeters);
  const osmData = await fetchOSMData(bbox);
  const geoJSON = osmToGeoJSON(osmData);
  return geoJSON;
};
