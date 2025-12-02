export const MENU_ENTRIES = [
  "Pokédex",
  "Pokémon",
  "Bag",
  "Pokégear",
  "Red",
  "Save",
  "Options",
  "Debug",
  "Exit",
] as const;

export const MENU_DIALOG_TEXTS: Record<string, string> = {
  Pokédex:
    "The Pokédex is a high-tech encyclopedia that records data on Pokémon. It automatically records data on any Pokémon you encounter or catch.",
  Pokémon: "You have no Pokémon with you right now.",
  Bag: "Your bag is empty. You should collect some items during your journey.",
  Pokégear:
    "The Pokégear is a useful device that shows the time and map. It also allows you to make calls to other trainers.",
  Red: "This is your trainer card. It shows your name, badges, and other important information about your journey.",
  Save: "Would you like to save your progress? Your game will be saved to the current slot.",
  Options:
    "Adjust game settings here. You can change the text speed, sound volume, and other preferences.",
  Debug:
    "Debug mode activated. This mode shows additional information for developers.",
  Exit: "Are you sure you want to exit? Any unsaved progress will be lost.",
};

export const STATUE_PROXIMITY_DISTANCE = 60; // pixels
export const PLAYER_SPEED = 175;
export const WEATHER_UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes
export const DIALOG_TYPING_SPEED = 30; // milliseconds per character
export const CHAT_MAX_MESSAGES = 6;
export const CHAT_WIDTH = 400;
export const GAME_SCALE = 2; // Pixel art scale factor (2x zoom)
