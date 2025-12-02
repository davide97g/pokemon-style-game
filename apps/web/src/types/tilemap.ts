export interface TiledLayer {
  data: number[];
  height: number;
  id: number;
  name: string;
  opacity: number;
  type: string;
  visible: boolean;
  width: number;
  x: number;
  y: number;
}

export interface TiledTileset {
  columns: number;
  firstgid: number;
  image?: string;
  imageheight: number;
  imagewidth: number;
  margin: number;
  name: string;
  spacing: number;
  tilecount: number;
  tileheight: number;
  tilewidth: number;
  tiles?: TiledTileData[];
}

export interface TiledTileData {
  id: number;
  properties?: TiledProperty[];
  type?: string;
}

export interface TiledProperty {
  name: string;
  type: string;
  value: string | number | boolean;
}

export interface TiledObject {
  id: number;
  name: string;
  type?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  properties?: TiledProperty[];
}

export interface TiledObjectLayer {
  id: number;
  name: string;
  objects: TiledObject[];
  opacity: number;
  type: "objectgroup";
  visible: boolean;
  x: number;
  y: number;
}

export interface TiledMap {
  compressionlevel: number;
  height: number;
  infinite: boolean;
  layers: (TiledLayer | TiledObjectLayer)[];
  nextlayerid: number;
  nextobjectid: number;
  orientation: string;
  renderorder: string;
  tiledversion: string;
  tileheight: number;
  tilesets: TiledTileset[];
  tilewidth: number;
  type: string;
  version: string;
  width: number;
}
