# PMTiles Integration

This project now supports fetching tiles from PMTiles archives based on user location.

## What is PMTiles?

PMTiles is a single-file archive format for tiled data that enables efficient, serverless map applications. Instead of serving individual tiles from a tile server, PMTiles stores an entire tileset in a single file that can be served from cloud storage (like S3, Cloudflare R2, etc.) using HTTP range requests.

## Benefits

- **Serverless**: No need for a dedicated tile server
- **Efficient**: Only fetches the tiles you need using HTTP range requests
- **Simple**: Single file deployment
- **Cost-effective**: Can be hosted on cheap cloud storage

## Setup

### 1. Generate PMTiles Archive

You can generate PMTiles archives using Planetiler:

```bash
java -jar planetiler.jar \
  --area=your-region.osm.pbf \
  --output=tiles.pmtiles \
  --format=pmtiles
```

### 2. Host PMTiles File

Upload your `.pmtiles` file to cloud storage that supports HTTP range requests:
- Amazon S3
- Cloudflare R2
- Google Cloud Storage
- Azure Blob Storage
- GitHub Releases (for smaller files)

Make sure CORS is enabled and the file is publicly accessible.

### 3. Configure in Your App

Edit `apps/web/src/game/config/PlanetilerConfig.ts`:

```typescript
export const PLANETILER_CONFIG = {
  enabled: true, // Enable PMTiles
  tileServers: [
    "https://your-storage.com/tiles.pmtiles", // Your PMTiles URL
  ],
  // ... other config
};
```

## Public PMTiles Examples

You can test with publicly available PMTiles archives:

1. **Protomaps Examples**: Check [protomaps.github.io/PMTiles](https://protomaps.github.io/PMTiles/) for example PMTiles files
2. **Generate Your Own**: Use Planetiler to generate PMTiles for your region of interest

## How It Works

1. **Location Detection**: Game gets user's location via geolocation API
2. **PMTiles Initialization**: PMTiles library opens the archive and reads the header
3. **Tile Calculation**: Calculates which tiles are needed based on location and radius
4. **Range Requests**: Fetches only the needed tiles using HTTP range requests
5. **Vector Tile Parsing**: Parses vector tiles (`.pbf`) using `@mapbox/vector-tile`
6. **GeoJSON Conversion**: Converts to GeoJSON format
7. **Rasterization**: Rasterizes into Phaser tilemap format

## PMTiles vs XYZ Tiles

| Feature | PMTiles | XYZ Tiles |
|---------|---------|-----------|
| Deployment | Single file | Multiple files or server |
| HTTP Requests | Range requests (efficient) | Individual tile requests |
| Server Required | No (cloud storage) | Yes (or CDN) |
| File Size | Single large file | Many small files |
| Best For | Static/semi-static data | Dynamic/real-time data |

## Troubleshooting

### "Location is outside PMTiles bounds"
- Your PMTiles archive doesn't cover the user's location
- Generate a new PMTiles archive that includes the area you need
- Or use a different PMTiles file that covers the area

### "Failed to initialize PMTiles source"
- Check that the PMTiles URL is accessible
- Verify CORS is enabled on your storage
- Ensure the file is a valid PMTiles archive

### No tiles loading
- Check browser console for errors
- Verify the PMTiles file contains tiles for the zoom level you're requesting
- Try a different zoom level (check PMTiles header for minZoom/maxZoom)

## References

- [PMTiles GitHub](https://github.com/protomaps/PMTiles)
- [PMTiles Documentation](https://github.com/protomaps/PMTiles/tree/main/js)
- [Planetiler GitHub](https://github.com/onthegomap/planetiler)

