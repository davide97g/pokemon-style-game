# Tile Server Configuration

The game is now configured to use public tile servers for fetching map data based on user location.

## Current Configuration

✅ **Enabled by default** - The system is ready to use!

The game will automatically:
1. Try public vector tile servers first (faster, more detailed)
2. Fall back to raster tiles if vector tiles aren't available
3. Fall back to Overpass API if all tile servers fail

## Public Tile Servers Used

### Primary Servers (Vector Tiles)
- **OpenMapTiles Community Server**: `https://tile.ourmap.us/{z}/{x}/{y}.pbf`
  - Provides vector tiles in OpenMapTiles format
  - Based on OpenStreetMap data
  - Fast and efficient

- **OpenStreetMap US Vector Tiles**: `https://tiles.openstreetmap.us/vectiles-highroad/{z}/{x}/{y}.pbf`
  - Alternative vector tile source
  - Good coverage for US regions

### Fallback Server (Raster Tiles)
- **OpenStreetMap Standard Tiles**: `https://tile.openstreetmap.org/{z}/{x}/{y}.png`
  - Raster tiles (PNG format)
  - Worldwide coverage
  - Used as last resort

## How It Works

1. **User Location**: Game requests user's location via browser geolocation
2. **Tile Calculation**: Calculates which tiles are needed based on location and radius
3. **Server Selection**: Tries each server in order until one succeeds
4. **Tile Fetching**: Fetches tiles using HTTP requests
5. **Parsing**: Parses vector tiles (`.pbf`) or handles raster tiles (`.png`)
6. **Conversion**: Converts to GeoJSON format
7. **Rasterization**: Converts to Phaser tilemap format

## Adding Your Own PMTiles

If you want to use your own PMTiles archive:

1. Generate PMTiles using Planetiler:
   ```bash
   java -jar planetiler.jar --output=tiles.pmtiles --format=pmtiles
   ```

2. Host the file on cloud storage (S3, Cloudflare R2, etc.)

3. Update `PlanetilerConfig.ts`:
   ```typescript
   tileServers: [
     "https://your-storage.com/tiles.pmtiles", // Add your PMTiles URL here
     // ... existing servers as fallbacks
   ]
   ```

## Troubleshooting

### No tiles loading
- Check browser console for CORS errors
- Verify tile servers are accessible
- Try a different location (some servers may have regional coverage)

### Slow loading
- First load may be slower due to tile fetching
- Tiles are cached for 24 hours to improve subsequent loads
- Consider using PMTiles for better performance

### Location outside bounds
- Some tile servers have limited coverage
- The system will automatically try the next server
- Overpass API fallback works worldwide

## Attribution

When using OpenStreetMap-based tiles, please include attribution:
- "© OpenStreetMap contributors"

## Performance Tips

1. **Use PMTiles**: Single-file archives are more efficient than individual tile requests
2. **Cache**: Tiles are automatically cached for 24 hours
3. **Zoom Level**: Default zoom is 14 - adjust in `PlanetilerConfig.ts` if needed
4. **Radius**: Smaller radius = fewer tiles = faster loading

## Configuration Options

Edit `apps/web/src/game/config/PlanetilerConfig.ts` to:
- Enable/disable tile fetching: `enabled: true/false`
- Change default zoom: `defaultZoom: 14`
- Add/remove tile servers: `tileServers: [...]`
- Adjust cache settings: `enableCache: true`, `cacheExpiration: ...`

