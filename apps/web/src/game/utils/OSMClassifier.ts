/**
 * Classifies OSM features into logical tile types
 */

import type { TileType } from "../config/OSMConfig";

export interface OSMFeature {
  type: string;
  properties: Record<string, string>;
  geometry: {
    type: string;
    coordinates: number[] | number[][] | number[][][];
  };
}

/**
 * Classify an OSM feature into a tile type
 */
export const classifyOSMFeature = (feature: OSMFeature): TileType => {
  const props = feature.properties;
  const geometryType = feature.geometry.type;

  // Buildings
  if (props.building) {
    const buildingType = props.building.toLowerCase();
    if (buildingType === "commercial" || buildingType === "retail") {
      return "SHOP";
    }
    if (buildingType === "industrial" || buildingType === "warehouse") {
      return "FACTORY";
    }
    if (buildingType === "school" || buildingType === "university") {
      return "SCHOOL";
    }
    return "HOUSE";
  }

  // Highways (roads)
  if (props.highway) {
    const highwayType = props.highway.toLowerCase();
    if (
      highwayType === "residential" ||
      highwayType === "primary" ||
      highwayType === "secondary" ||
      highwayType === "tertiary" ||
      highwayType === "trunk" ||
      highwayType === "motorway"
    ) {
      return "ROAD_MAIN";
    }
    if (highwayType === "service" || highwayType === "unclassified") {
      return "ROAD_SMALL";
    }
    if (
      highwayType === "footway" ||
      highwayType === "path" ||
      highwayType === "cycleway" ||
      highwayType === "pedestrian"
    ) {
      return "PATH";
    }
    // Default for other highway types
    return "ROAD_MAIN";
  }

  // Water features
  if (props.natural === "water" || props.waterway) {
    if (props.waterway === "river" || props.waterway === "stream") {
      return "RIVER";
    }
    if (props.natural === "water" && geometryType === "Polygon") {
      return "LAKE";
    }
    return "WATER";
  }

  // Vegetation and land use
  if (props.natural === "wood" || props.landuse === "forest") {
    return "FOREST";
  }
  if (props.landuse === "park" || props.leisure === "park") {
    return "PARK_GRASS";
  }
  if (props.landuse === "grass" || props.landuse === "meadow") {
    return "PARK_GRASS";
  }

  // Amenities (can be classified as buildings)
  if (props.amenity) {
    const amenityType = props.amenity.toLowerCase();
    if (amenityType === "school" || amenityType === "university") {
      return "SCHOOL";
    }
    if (amenityType === "shop" || amenityType === "marketplace") {
      return "SHOP";
    }
    // Other amenities default to house
    return "HOUSE";
  }

  // Leisure areas
  if (props.leisure) {
    if (props.leisure === "park") {
      return "PARK_GRASS";
    }
    // Other leisure areas default to grass
    return "PARK_GRASS";
  }

  // Default: grass
  return "GRASS";
};

/**
 * Check if a feature should be rendered (filter out unwanted features)
 */
export const shouldRenderFeature = (feature: OSMFeature): boolean => {
  const props = feature.properties;

  // Skip features without meaningful tags
  if (
    !props.building &&
    !props.highway &&
    !props.natural &&
    !props.waterway &&
    !props.landuse &&
    !props.amenity &&
    !props.leisure
  ) {
    return false;
  }

  // Skip very small features (optional optimization)
  // This would require geometry analysis, so we'll keep it simple for now

  return true;
};
