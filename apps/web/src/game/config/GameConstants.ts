/**
 * Game configuration constants
 * Centralized location for easy modification of game parameters
 */

export interface InventorySlotConfig {
  columns: number;
  rows: number;
  slotSize: number;
  slotPadding: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  color: number;
  quantity: number;
}

export interface InventorySlot {
  background: Phaser.GameObjects.Rectangle;
  itemContainer?: Phaser.GameObjects.Container;
  item?: InventoryItem;
}

export const INVENTORY_SLOT_CONFIG: InventorySlotConfig = {
  columns: 8,
  rows: 4,
  slotSize: 56,
  slotPadding: 8,
};

export const ITEM_TYPES: InventoryItem[] = [
  { id: "grass", name: "Grass", color: 0x4a7c59, quantity: 0 },
  { id: "water", name: "Water", color: 0x5dade2, quantity: 0 },
  { id: "mushroom_blue", name: "Blue Mushroom", color: 0x3498db, quantity: 0 },
  { id: "stone", name: "Stone", color: 0x7f8c8d, quantity: 0 },
  { id: "cactus", name: "Cactus", color: 0x52be80, quantity: 0 },
  { id: "stone_dark", name: "Dark Stone", color: 0x34495e, quantity: 0 },
  { id: "bone", name: "Bone", color: 0xecf0f1, quantity: 0 },
  { id: "meat", name: "Meat", color: 0x8b0000, quantity: 0 },
  { id: "wood", name: "Wood", color: 0x8b4513, quantity: 0 },
  { id: "rope", name: "Rope", color: 0x8b6914, quantity: 0 },
  { id: "pebble", name: "Pebble", color: 0x95a5a6, quantity: 0 },
  { id: "shell", name: "Shell", color: 0xf4d03f, quantity: 0 },
  { id: "dust", name: "Dust", color: 0xbdc3c7, quantity: 0 },
  {
    id: "mushroom_brown",
    name: "Brown Mushroom",
    color: 0x8b4513,
    quantity: 0,
  },
  { id: "plank", name: "Plank", color: 0xd2691e, quantity: 0 },
  { id: "log", name: "Log", color: 0x654321, quantity: 0 },
  { id: "coin", name: "Coin", color: 0xffd700, quantity: 0 },
];

export const COLLECTION_PROXIMITY_DISTANCE = 32; // pixels - distance to tile center

export const COLLECTION_LIMITS: Map<string, number> = new Map([
  ["stone", 10],
  ["stone_dark", 10],
  ["wood", 5],
]);

// Tree spawning configuration
// TREE_TILE_GID: Use debug mode (press T) and click on a tree tile to find its GID
// Then set this value to that GID. Default is 122
export const TREE_TILE_GID = 122;
export const WOOD_REQUIRED_FOR_TREE = 4;

// Save system configuration
export const AUTO_SAVE_INTERVAL = 30000; // 30 seconds
export const MIN_SAVE_INTERVAL = 2000; // Minimum 2 seconds between saves

// Audio configuration
export const DEFAULT_MUSIC_VOLUME = 0.5; // Default volume (0-1)
export const SOUND_EFFECT_VOLUME = 0.5;

// Weather system configuration
export const WEATHER_UPDATE_INTERVAL = 300000; // 5 minutes in milliseconds

// Player configuration
export const PLAYER_SPEED = 100; // pixels per second

// Chat system configuration
export const CHAT_MAX_MESSAGES = 10;
export const CHAT_WIDTH = 400;
export const STATUE_PROXIMITY_DISTANCE = 64; // pixels

// Dialog system configuration
export const DIALOG_TYPING_SPEED = 30; // milliseconds per character

// Menu system configuration
export interface MenuEntry {
  id: string;
  label: string;
}

export const MENU_ENTRIES: MenuEntry[] = [
  { id: "codex", label: "Codex" },
  { id: "options", label: "Options" },
  { id: "save", label: "Save" },
  { id: "exit", label: "Exit" },
];

// Debug configuration
export const DEBUG =
  import.meta.env.VITE_DEBUG === "true" || import.meta.env.DEV;
