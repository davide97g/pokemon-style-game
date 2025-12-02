# Planetiler Tile Integration

This project now supports fetching tiles from Planetiler-generated tile servers based on user location.

## Overview

Planetiler is a tool that generates vector tilesets from OpenStreetMap data. This integration allows you to:

1. Fetch tiles from Planetiler-generated tile servers
2. Convert vector tiles to GeoJSON format
3. Generate Phaser-compatible tilemaps from the tiles

## Setup

### 1. Generate Tiles with Planetiler

First, you need to generate tiles using Planetiler. You can either:

- **Generate tiles for a specific region**: Use Planetiler to generate tiles for your area of interest
- **Use a pre-generated tile server**: Set up a tile server that serves Planetiler-generated tiles

Example Planetiler command:
```bash
java -jar planetiler.jar --area=your-region.osm.pbf --output=tiles.mbtiles
```

### 2. Configure Tile Server

Edit `apps/web/src/game/config/PlanetilerConfig.ts`:

```typescript
export const PLANETILER_CONFIG = {
  enabled: true, // Set to true to enable Planetiler tiles
  tileServers: [
    "https://your-tile-server.com/{z}/{x}/{y}.pbf", // Vector tiles
    // or
    "https://your-tile-server.com/{z}/{x}/{y}.png", // Raster tiles
  ],
  defaultZoom: 14,
  // ... other config
};
```

### 3. Enable Planetiler in the Game

The game will automatically use Planetiler tiles when `PLANETILER_CONFIG.enabled` is set to `true`. If Planetiler tiles fail to load or return no data, it will automatically fall back to the Overpass API.

## How It Works

1. **Location Detection**: The game gets the user's location via geolocation API
2. **Tile Fetching**: Based on the location and radius, it calculates which tiles are needed
3. **Tile Parsing**: Vector tiles (`.pbf`) are parsed using `@mapbox/vector-tile`
4. **GeoJSON Conversion**: Vector tile features are converted to GeoJSON format
5. **Rasterization**: GeoJSON features are rasterized into a tile grid
6. **Phaser Integration**: The tile grid is converted to Phaser's tilemap format

## Tile Server Formats

### Vector Tiles (.pbf)
- Format: Protocol Buffer (protobuf)
- Parsed using `@mapbox/vector-tile`
- Converted to GeoJSON for processing

### Raster Tiles (.png, .jpg)
- Currently supported but not parsed (used as fallback)
- For full support, you'd need to render raster tiles to canvas

## Caching

Tiles are cached in localStorage with a 24-hour expiration to reduce server load and improve performance.

## Fallback Behavior

If Planetiler tiles are unavailable or return no data, the system automatically falls back to:
1. Overpass API (fetching raw OSM data)
2. Existing OSM service implementation

## Example Tile Server URLs

- **Vector tiles**: `https://tiles.example.com/{z}/{x}/{y}.pbf`
- **Raster tiles**: `https://tiles.example.com/{z}/{x}/{y}.png`
- **PMTiles** (future): `https://tiles.example.com/tiles.pmtiles`

## Notes

- Vector tiles require the `@mapbox/vector-tile` and `pbf` libraries (already installed)
- Tile coordinates use the standard XYZ scheme
- The system supports multiple zoom levels (configurable in `PlanetilerConfig`)
- Tiles are fetched in parallel for better performance

