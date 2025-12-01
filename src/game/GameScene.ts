/**
 * Author: Michael Hadley, mikewesthad.com
 * Asset Credits:
 *  - Tuxemon, https://github.com/Tuxemon/Tuxemon
 */

import Phaser from "phaser";

// Menu and Dialog state
const MENU_ENTRIES = [
  "Pokédex",
  "Pokémon",
  "Bag",
  "Pokégear",
  "Red",
  "Save",
  "Options",
  "Debug",
  "Exit",
];

// Statue interaction state
const STATUE_PROXIMITY_DISTANCE = 60; // pixels

// Weather widget types
interface WeatherData {
  temperature: number;
  windspeed: number;
  weathercode: number;
  time: string;
  daily?: {
    sunrise: string[];
    sunset: string[];
  };
}

const WEATHER_CODE_MAP: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow fall",
  73: "Moderate snow fall",
  75: "Heavy snow fall",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

export class GameScene extends Phaser.Scene {
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private player?: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;

  private weatherWidget: Phaser.GameObjects.Container | null = null;

  private gameMap: Phaser.Tilemaps.Tilemap | null = null;

  // Menu and Dialog state
  private isMenuOpen = false;
  private selectedMenuIndex = 0;
  private menuContainer: Phaser.GameObjects.Container | null = null;
  private menuTexts: Phaser.GameObjects.Text[] = [];
  private dialogContainer: Phaser.GameObjects.Container | null = null;
  private dialogText: Phaser.GameObjects.Text | null = null;
  private dialogIndicator: Phaser.GameObjects.Text | null = null;
  private isDialogVisible = false;
  private dialogLines: string[] = [];
  private currentDialogLineIndex = 0;
  private currentDialogCharIndex = 0;
  private dialogTypingTimer: ReturnType<typeof setTimeout> | null = null;

  // Statue interaction state
  private oldStatuePosition: { x: number; y: number } | null = null;
  private isNearStatue = false;
  private chatIconContainer: Phaser.GameObjects.Container | null = null;
  private chatDialogueContainer: Phaser.GameObjects.Container | null = null;
  private chatMessages: Array<{
    container: Phaser.GameObjects.Container;
    sender: string;
    text: string;
  }> = [];
  private chatInputText = "";
  private chatInputField: Phaser.GameObjects.Text | null = null;
  private isChatOpen = false;
  private chatMessageContainer: Phaser.GameObjects.Container | null = null;
  private chatWidth = 400;

  constructor() {
    super({ key: "GameScene" });
  }

  preload(): void {
    this.load.image("tiles", "/tilesets/tuxmon-sample-32px-extruded.png");
    this.load.tilemapTiledJSON("map", "/tilemaps/tuxemon-town.json");

    // An atlas is a way to pack multiple images together into one texture.
    this.load.atlas("atlas", "/atlas/atlas.png", "/atlas/atlas.json");
  }

  create(): void {
    const map = this.make.tilemap({ key: "map" });
    this.gameMap = map;

    // Parameters are the name you gave the tileset in Tiled and then the key of the tileset image in
    // Phaser's cache (i.e. the name you used in preload)
    const tileset = map.addTilesetImage("tuxmon-sample-32px-extruded", "tiles");

    // Parameters: layer name (or index) from Tiled, tileset, x, y
    if (!tileset) {
      console.error("Tileset not found");
      return;
    }
    map.createLayer("Below Player", tileset, 0, 0);
    const worldLayer = map.createLayer("World", tileset, 0, 0);
    const aboveLayer = map.createLayer("Above Player", tileset, 0, 0);

    if (worldLayer) {
      worldLayer.setCollisionByProperty({ collides: true });
    }

    // By default, everything gets depth sorted on the screen in the order we created things.
    if (aboveLayer) {
      aboveLayer.setDepth(10);
    }

    // Object layers in Tiled let you embed extra info into a map - like a spawn point
    const spawnPoint = map.findObject(
      "Objects",
      (obj) => obj.name === "Spawn Point"
    );

    if (!spawnPoint) {
      console.error("Spawn Point not found in map");
      return;
    }

    // Find and store "old statue" object (ID 288) position
    const oldStatue = map.findObject("Objects", (obj) => {
      const parsedObj = obj as Phaser.GameObjects.GameObject & {
        properties: [
          {
            name: string;
            type: string;
            value: string;
          }
        ];
        id: number;
      };
      if (!parsedObj.properties) return false;
      return (
        parsedObj.properties.find((property) => property.name === "type")
          ?.value === "intelligent"
      );
    });

    if (oldStatue) {
      this.oldStatuePosition = {
        x: oldStatue.x ?? 0,
        y: oldStatue.y ?? 0,
      };
    }

    // Create a sprite with physics enabled
    const spawnX = spawnPoint.x ?? 0;
    const spawnY = spawnPoint.y ?? 0;
    this.player = this.physics.add
      .sprite(spawnX, spawnY, "atlas", "misa-front")
      .setSize(30, 40)
      .setOffset(0, 24);

    // Watch the player and worldLayer for collisions
    if (worldLayer) {
      this.physics.add.collider(this.player, worldLayer);
    }

    // Create the player's walking animations from the texture atlas
    const anims = this.anims;
    anims.create({
      key: "misa-left-walk",
      frames: anims.generateFrameNames("atlas", {
        prefix: "misa-left-walk.",
        start: 0,
        end: 3,
        zeroPad: 3,
      }),
      frameRate: 10,
      repeat: -1,
    });
    anims.create({
      key: "misa-right-walk",
      frames: anims.generateFrameNames("atlas", {
        prefix: "misa-right-walk.",
        start: 0,
        end: 3,
        zeroPad: 3,
      }),
      frameRate: 10,
      repeat: -1,
    });
    anims.create({
      key: "misa-front-walk",
      frames: anims.generateFrameNames("atlas", {
        prefix: "misa-front-walk.",
        start: 0,
        end: 3,
        zeroPad: 3,
      }),
      frameRate: 10,
      repeat: -1,
    });
    anims.create({
      key: "misa-back-walk",
      frames: anims.generateFrameNames("atlas", {
        prefix: "misa-back-walk.",
        start: 0,
        end: 3,
        zeroPad: 3,
      }),
      frameRate: 10,
      repeat: -1,
    });

    const camera = this.cameras.main;
    camera.startFollow(this.player);
    camera.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    this.cursors = this.input.keyboard!.createCursorKeys();

    // Initialize menu and dialog
    this.initMenu();
    this.initDialog();

    // Initialize weather widget
    this.initWeatherWidget();

    // Initialize statue interaction UI
    this.initStatueInteraction();

    // Debug: Click on tiles to see their GID
    let tileInfoMode = false;
    this.input.keyboard!.on("keydown-I", () => {
      tileInfoMode = !tileInfoMode;
      console.log(
        `Tile info mode: ${
          tileInfoMode ? "ON" : "OFF"
        }. Click on tiles to see their GID.`
      );
    });

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!tileInfoMode || !this.gameMap) return;

      const worldX = pointer.worldX;
      const worldY = pointer.worldY;

      const layersToCheck = ["Below Player", "World", "Above Player"];
      layersToCheck.forEach((layerName) => {
        const layer = this.gameMap!.getLayer(layerName);
        if (!layer) return;

        const tile = layer.tilemapLayer?.getTileAtWorldXY(worldX, worldY);
        if (tile && tile.index !== null && tile.index !== -1) {
          const firstGID = this.gameMap!.tilesets[0]?.firstgid || 1;
          const tileGID = tile.index + firstGID;
          const tileX = Math.floor(worldX / this.gameMap!.tileWidth);
          const tileY = Math.floor(worldY / this.gameMap!.tileHeight);

          console.log(`\n=== Tile Info ===`);
          console.log(`Layer: ${layerName}`);
          console.log(`Position: (${tileX}, ${tileY})`);
          console.log(`Tile Index: ${tile.index}`);
          console.log(`Tile GID (Global ID): ${tileGID}`);
          console.log(`Collides: ${tile.collides || false}`);
          if (tile.properties) {
            console.log(`Properties:`, tile.properties);
          }
          console.log(`\nTile GID: ${tileGID}`);
        }
      });
    });

    // Debug graphics
    this.input.keyboard!.once("keydown-D", () => {
      this.physics.world.createDebugGraphic();

      if (worldLayer) {
        const graphics = this.add.graphics().setAlpha(0.75).setDepth(20);
        worldLayer.renderDebug(graphics, {
          tileColor: null,
          collidingTileColor: new Phaser.Display.Color(243, 134, 48, 255),
          faceColor: new Phaser.Display.Color(40, 39, 37, 255),
        });
      }
    });
  }

  update(): void {
    // Don't update player movement if menu or dialog is open
    if (!this.player || this.isMenuOpen || this.isDialogVisible) {
      if (this.player) {
        this.player.body.setVelocity(0);
        this.player.anims.stop();
      }
      return;
    }

    const speed = 175;
    const prevVelocity = this.player.body.velocity.clone();

    // Stop any previous movement from the last frame
    this.player.body.setVelocity(0);

    if (!this.cursors) return;

    // Horizontal movement
    if (this.cursors.left.isDown) {
      this.player.body.setVelocityX(-speed);
    } else if (this.cursors.right.isDown) {
      this.player.body.setVelocityX(speed);
    }

    // Vertical movement
    if (this.cursors.up.isDown) {
      this.player.body.setVelocityY(-speed);
    } else if (this.cursors.down.isDown) {
      this.player.body.setVelocityY(speed);
    }

    // Normalize and scale the velocity so that player can't move faster along a diagonal
    this.player.body.velocity.normalize().scale(speed);

    // Update the animation last
    if (this.cursors.left.isDown) {
      this.player.anims.play("misa-left-walk", true);
    } else if (this.cursors.right.isDown) {
      this.player.anims.play("misa-right-walk", true);
    } else if (this.cursors.up.isDown) {
      this.player.anims.play("misa-back-walk", true);
    } else if (this.cursors.down.isDown) {
      this.player.anims.play("misa-front-walk", true);
    } else {
      this.player.anims.stop();

      // If we were moving, pick an idle frame to use
      if (prevVelocity.x < 0) this.player.setTexture("atlas", "misa-left");
      else if (prevVelocity.x > 0)
        this.player.setTexture("atlas", "misa-right");
      else if (prevVelocity.y < 0) this.player.setTexture("atlas", "misa-back");
      else if (prevVelocity.y > 0)
        this.player.setTexture("atlas", "misa-front");
    }

    // Check proximity to statue
    this.checkStatueProximity();
  }

  // Weather widget functions
  private getWeatherIcon(weathercode: number): string {
    if (weathercode === 0) return "☀️";
    if (weathercode <= 3) return "⛅";
    if (weathercode <= 48) return "🌫️";
    if (weathercode <= 67) return "🌧️";
    if (weathercode <= 86) return "❄️";
    return "⛈️";
  }

  private formatTime(timeString: string): string {
    const date = new Date(timeString);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  private async fetchWeatherData(
    lat: number,
    lon: number
  ): Promise<WeatherData | null> {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&daily=sunrise,sunset&timezone=auto`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error("Failed to fetch weather data");
      }

      const data = await response.json();
      return {
        ...data.current_weather,
        daily: data.daily,
      };
    } catch (error) {
      console.error("Error fetching weather:", error);
      return null;
    }
  }

  private initWeatherWidget(): void {
    if (!navigator.geolocation) {
      this.createWeatherWidget(null, "Geolocation not supported");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        const weather = await this.fetchWeatherData(lat, lon);
        this.createWeatherWidget(weather, null);
      },
      (err) => {
        let errorMessage = "Unable to get location";
        if (err.code === 1) {
          errorMessage = "Location access denied";
        } else if (err.code === 2) {
          errorMessage = "Location unavailable";
        } else if (err.code === 3) {
          errorMessage = "Location request timed out";
        }
        this.createWeatherWidget(null, errorMessage);
      }
    );
  }

  private createWeatherWidget(
    weather: WeatherData | null,
    error: string | null
  ): void {
    const width = this.cameras.main.width;
    const padding = 16;
    const widgetWidth = 280;
    const widgetHeight = 140;
    const x = width - widgetWidth - padding;
    const y = padding;

    const container = this.add.container(x, y);
    container.setScrollFactor(0);
    container.setDepth(30);

    const bg = this.add.rectangle(
      widgetWidth / 2,
      widgetHeight / 2,
      widgetWidth,
      widgetHeight,
      0xffffff,
      0.9
    );
    bg.setStrokeStyle(2, 0x000000, 0.3);
    container.add(bg);

    if (error || !weather) {
      const errorText = this.add.text(
        widgetWidth / 2,
        widgetHeight / 2,
        error || "Unable to fetch weather",
        {
          font: "14px monospace",
          color: "#ff0000",
          align: "center",
          wordWrap: { width: widgetWidth - 20 },
        }
      );
      errorText.setOrigin(0.5);
      container.add(errorText);
      this.weatherWidget = container;
      return;
    }

    const weatherDescription =
      WEATHER_CODE_MAP[weather.weathercode] || "Unknown";
    const weatherIcon = this.getWeatherIcon(weather.weathercode);

    const iconText = this.add.text(20, 20, weatherIcon, {
      font: "32px monospace",
      color: "#000000",
    });
    container.add(iconText);

    const tempText = this.add.text(
      60,
      15,
      `${weather.temperature.toFixed(1)}°C`,
      {
        font: "bold 20px monospace",
        color: "#000000",
      }
    );
    container.add(tempText);

    const descText = this.add.text(60, 40, weatherDescription, {
      font: "12px monospace",
      color: "#333333",
      wordWrap: { width: widgetWidth - 80 },
    });
    container.add(descText);

    const windText = this.add.text(
      20,
      80,
      `Wind: ${weather.windspeed.toFixed(1)} km/h`,
      {
        font: "12px monospace",
        color: "#666666",
      }
    );
    container.add(windText);

    const timeText = this.add.text(
      20,
      100,
      `Updated: ${this.formatTime(weather.time)}`,
      {
        font: "11px monospace",
        color: "#666666",
      }
    );
    container.add(timeText);

    this.weatherWidget = container;

    // Update weather every 5 minutes
    setInterval(async () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            const newWeather = await this.fetchWeatherData(lat, lon);
            if (newWeather && this.weatherWidget) {
              this.updateWeatherWidget(newWeather);
            }
          },
          () => {
            // Silently fail on update
          }
        );
      }
    }, 5 * 60 * 1000);
  }

  private updateWeatherWidget(weather: WeatherData): void {
    if (!this.weatherWidget || !weather) return;

    const weatherDescription =
      WEATHER_CODE_MAP[weather.weathercode] || "Unknown";
    const weatherIcon = this.getWeatherIcon(weather.weathercode);

    const children = this.weatherWidget.list.slice(1);
    children.forEach((child) => {
      if (child instanceof Phaser.GameObjects.Text) {
        child.destroy();
      }
    });

    const iconText = this.add.text(20, 20, weatherIcon, {
      font: "32px monospace",
      color: "#000000",
    });
    this.weatherWidget.add(iconText);

    const tempText = this.add.text(
      60,
      15,
      `${weather.temperature.toFixed(1)}°C`,
      {
        font: "bold 20px monospace",
        color: "#000000",
      }
    );
    this.weatherWidget.add(tempText);

    const descText = this.add.text(60, 40, weatherDescription, {
      font: "12px monospace",
      color: "#333333",
      wordWrap: { width: 200 },
    });
    this.weatherWidget.add(descText);

    const windText = this.add.text(
      20,
      80,
      `Wind: ${weather.windspeed.toFixed(1)} km/h`,
      {
        font: "12px monospace",
        color: "#666666",
      }
    );
    this.weatherWidget.add(windText);

    const timeText = this.add.text(
      20,
      100,
      `Updated: ${this.formatTime(weather.time)}`,
      {
        font: "11px monospace",
        color: "#666666",
      }
    );
    this.weatherWidget.add(timeText);
  }

  // Menu functions
  private initMenu(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    const menuWidth = 192;
    const menuX = width - menuWidth - 16;
    const menuY = 16;

    this.menuContainer = this.add.container(menuX, menuY);
    this.menuContainer.setScrollFactor(0);
    this.menuContainer.setDepth(50);
    this.menuContainer.setVisible(false);

    const bg = this.add.rectangle(
      menuWidth / 2,
      0,
      menuWidth,
      height - 32,
      0xcccccc,
      0.85
    );
    bg.setStrokeStyle(2, 0x808080);
    this.menuContainer.add(bg);

    this.menuTexts = [];
    const entryHeight = 24;
    const padding = 12;
    const startY = padding;

    MENU_ENTRIES.forEach((entry, index) => {
      const y = startY + index * entryHeight;
      const entryText = this.add.text(padding, y, entry, {
        font: "16px monospace",
        color: "#ffffff",
        align: "left",
      });
      entryText.setOrigin(0, 0);
      entryText.setPadding(4, 4, 4, 4);
      this.menuContainer!.add(entryText);
      this.menuTexts.push(entryText);
    });

    const spaceKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE
    );
    const enterKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.ENTER
    );

    spaceKey.on("down", () => {
      if (this.isDialogVisible) {
        this.handleDialogAdvance();
      } else {
        this.toggleMenu();
      }
    });

    this.input.keyboard!.on("keydown-UP", () => {
      if (this.isMenuOpen && !this.isDialogVisible) {
        this.selectedMenuIndex =
          this.selectedMenuIndex > 0
            ? this.selectedMenuIndex - 1
            : MENU_ENTRIES.length - 1;
        this.updateMenuSelection();
      }
    });

    this.input.keyboard!.on("keydown-DOWN", () => {
      if (this.isMenuOpen && !this.isDialogVisible) {
        this.selectedMenuIndex =
          this.selectedMenuIndex < MENU_ENTRIES.length - 1
            ? this.selectedMenuIndex + 1
            : 0;
        this.updateMenuSelection();
      }
    });

    enterKey.on("down", () => {
      if (this.isDialogVisible) {
        this.handleDialogAdvance();
      } else if (this.isMenuOpen) {
        const selectedEntry = MENU_ENTRIES[this.selectedMenuIndex];
        this.handleMenuSelect(selectedEntry);
      }
    });
  }

  private toggleMenu(): void {
    this.isMenuOpen = !this.isMenuOpen;
    if (this.menuContainer) {
      this.menuContainer.setVisible(this.isMenuOpen);
    }

    if (this.isMenuOpen) {
      this.selectedMenuIndex = 0;
      this.updateMenuSelection();
    }
  }

  private updateMenuSelection(): void {
    this.menuTexts.forEach((text, index) => {
      const entryName = MENU_ENTRIES[index];
      if (index === this.selectedMenuIndex) {
        text.setFill("#ffffff");
        text.setBackgroundColor("#666666");
        if (!text.text.startsWith("►")) {
          text.setText("► " + entryName);
        }
      } else {
        text.setFill("#ffffff");
        text.setBackgroundColor("");
        if (text.text.startsWith("►")) {
          text.setText(entryName);
        }
      }
    });
  }

  private handleMenuSelect(entry: string): void {
    this.isMenuOpen = false;
    if (this.menuContainer) {
      this.menuContainer.setVisible(false);
    }

    const dialogTexts: Record<string, string> = {
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

    const speaker = entry === "Red" ? undefined : entry;
    const dialogText = dialogTexts[entry] || `${entry} selected.`;
    this.showDialog(dialogText, speaker);
  }

  // Dialog functions
  private initDialog(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    const dialogWidth = width - 64;
    const dialogHeight = 100;
    const dialogX = 32;
    const dialogY = height - dialogHeight - 32;

    this.dialogContainer = this.add.container(dialogX, dialogY);
    this.dialogContainer.setScrollFactor(0);
    this.dialogContainer.setDepth(50);
    this.dialogContainer.setVisible(false);

    const bg = this.add.rectangle(
      dialogWidth / 2,
      dialogHeight / 2,
      dialogWidth,
      dialogHeight,
      0xadd8e6,
      1
    );
    bg.setStrokeStyle(4, 0x4169e1);
    this.dialogContainer.add(bg);

    this.dialogText = this.add.text(16, 16, "", {
      font: "16px monospace",
      color: "#000000",
      align: "left",
      wordWrap: { width: dialogWidth - 80 },
    });
    this.dialogText.setOrigin(0, 0);
    this.dialogContainer.add(this.dialogText);

    this.dialogIndicator = this.add.text(
      dialogWidth - 40,
      dialogHeight - 30,
      "->",
      {
        font: "20px monospace",
        color: "#000000",
        align: "right",
      }
    );
    this.dialogIndicator.setOrigin(0.5, 0.5);
    this.dialogIndicator.setVisible(false);
    this.dialogContainer.add(this.dialogIndicator);
  }

  private splitTextIntoLines(text: string, maxWidth: number): string[] {
    const tempText = this.add.text(0, 0, "", {
      font: "16px monospace",
      color: "#000000",
    });
    tempText.setVisible(false);

    const words = text.split(" ");
    const lines: string[] = [];
    let currentLine = "";

    words.forEach((word) => {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      tempText.setText(testLine);
      const textWidth = tempText.width;

      if (textWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });

    if (currentLine) {
      lines.push(currentLine);
    }

    tempText.destroy();
    return lines;
  }

  private showDialog(text: string, speaker?: string): void {
    if (this.dialogTypingTimer) {
      clearTimeout(this.dialogTypingTimer);
      this.dialogTypingTimer = null;
    }

    this.isDialogVisible = true;
    const fullText = speaker ? `${speaker}: ${text}` : text;

    const dialogWidth = this.cameras.main.width - 64;
    const maxTextWidth = dialogWidth - 80;
    this.dialogLines = this.splitTextIntoLines(fullText, maxTextWidth);

    this.currentDialogLineIndex = 0;
    this.currentDialogCharIndex = 0;
    if (this.dialogText) {
      this.dialogText.setText("");
    }
    if (this.dialogIndicator) {
      this.dialogIndicator.setVisible(false);
    }
    if (this.dialogContainer) {
      this.dialogContainer.setVisible(true);
    }

    this.typeDialogText();

    if (this.dialogIndicator) {
      this.tweens.killTweensOf(this.dialogIndicator);
    }
  }

  private typeDialogText(): void {
    if (this.currentDialogLineIndex >= this.dialogLines.length) {
      if (this.dialogIndicator) {
        this.dialogIndicator.setVisible(false);
      }
      return;
    }

    const currentLine = this.dialogLines[this.currentDialogLineIndex];

    if (this.currentDialogCharIndex < currentLine.length) {
      const textToShow = currentLine.substring(
        0,
        this.currentDialogCharIndex + 1
      );
      if (this.dialogText) {
        this.dialogText.setText(textToShow);
      }
      this.currentDialogCharIndex++;

      this.dialogTypingTimer = setTimeout(() => {
        this.typeDialogText();
      }, 30);
    } else {
      if (this.currentDialogLineIndex < this.dialogLines.length - 1) {
        if (this.dialogIndicator) {
          this.dialogIndicator.setVisible(true);
          this.tweens.killTweensOf(this.dialogIndicator);
          const dialogHeight = 100;
          const originalY = dialogHeight - 30;
          this.dialogIndicator.y = originalY;
          this.tweens.add({
            targets: this.dialogIndicator,
            y: originalY - 5,
            duration: 500,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
          });
        }
      } else {
        if (this.dialogIndicator) {
          this.dialogIndicator.setVisible(false);
        }
      }
    }
  }

  private handleDialogAdvance(): void {
    if (
      this.currentDialogCharIndex <
      this.dialogLines[this.currentDialogLineIndex].length
    ) {
      if (this.dialogTypingTimer) {
        clearTimeout(this.dialogTypingTimer);
        this.dialogTypingTimer = null;
      }
      if (this.dialogText) {
        this.dialogText.setText(this.dialogLines[this.currentDialogLineIndex]);
      }
      this.currentDialogCharIndex =
        this.dialogLines[this.currentDialogLineIndex].length;

      if (this.currentDialogLineIndex < this.dialogLines.length - 1) {
        if (this.dialogIndicator) {
          this.dialogIndicator.setVisible(true);
          this.tweens.killTweensOf(this.dialogIndicator);
          const dialogHeight = 100;
          const originalY = dialogHeight - 30;
          this.dialogIndicator.y = originalY;
          this.tweens.add({
            targets: this.dialogIndicator,
            y: originalY - 5,
            duration: 500,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
          });
        }
      } else {
        if (this.dialogIndicator) {
          this.dialogIndicator.setVisible(false);
        }
      }
      return;
    }

    if (this.currentDialogLineIndex < this.dialogLines.length - 1) {
      this.currentDialogLineIndex++;
      this.currentDialogCharIndex = 0;
      if (this.dialogText) {
        this.dialogText.setText("");
      }
      if (this.dialogIndicator) {
        this.dialogIndicator.setVisible(false);
      }
      if (this.dialogIndicator) {
        this.tweens.killTweensOf(this.dialogIndicator);
      }
      this.typeDialogText();
    } else {
      this.closeDialog();
    }
  }

  private closeDialog(): void {
    if (this.dialogTypingTimer) {
      clearTimeout(this.dialogTypingTimer);
      this.dialogTypingTimer = null;
    }

    if (this.dialogIndicator) {
      this.tweens.killTweensOf(this.dialogIndicator);
    }

    this.isDialogVisible = false;
    if (this.dialogContainer) {
      this.dialogContainer.setVisible(false);
    }
    this.dialogLines = [];
    this.currentDialogLineIndex = 0;
    this.currentDialogCharIndex = 0;
    if (this.dialogIndicator) {
      this.dialogIndicator.setVisible(false);
    }
  }

  // Statue interaction functions
  private checkStatueProximity(): void {
    let nearStatue = false;

    if (this.oldStatuePosition && this.player) {
      const dx = this.player.x - this.oldStatuePosition.x;
      const dy = this.player.y - this.oldStatuePosition.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < STATUE_PROXIMITY_DISTANCE) {
        nearStatue = true;
      }
    }

    if (this.isNearStatue !== nearStatue) {
      this.isNearStatue = nearStatue;
      this.updateChatIconVisibility();
    }
  }

  // Removed flower methods - keeping this comment for reference
  private createFlowerTexture(): void {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;

    ctx.clearRect(0, 0, 32, 32);

    ctx.fillStyle = "#2d5016";
    ctx.fillRect(14, 20, 4, 12);

    ctx.fillStyle = "#4a7c2a";
    ctx.fillRect(10, 24, 4, 3);
    ctx.fillRect(18, 24, 4, 3);

    ctx.fillStyle = "#d45a7f";
    ctx.fillRect(12, 8, 8, 6);
    ctx.fillRect(6, 12, 6, 8);
    ctx.fillRect(20, 12, 6, 8);
    ctx.fillRect(8, 18, 6, 6);
    ctx.fillRect(18, 18, 6, 6);

    ctx.fillStyle = "#f4d03f";
    ctx.fillRect(13, 13, 6, 6);

    this.textures.addCanvas("flower", canvas);
  }

  private checkIfIsolatedDecorativeTile(
    layerData: Phaser.Tilemaps.Tile[][],
    x: number,
    y: number
  ): boolean {
    const checkRadius = 2;
    let decorativeCount = 0;
    let totalChecked = 0;

    for (let dy = -checkRadius; dy <= checkRadius; dy++) {
      for (let dx = -checkRadius; dx <= checkRadius; dx++) {
        const checkX = x + dx;
        const checkY = y + dy;

        if (
          checkX < 0 ||
          checkY < 0 ||
          checkY >= layerData.length ||
          !layerData[checkY] ||
          checkX >= layerData[checkY].length
        ) {
          continue;
        }

        const checkTile = layerData[checkY][checkX];
        if (checkTile && checkTile.index > 0 && !checkTile.collides) {
          decorativeCount++;
        }
        totalChecked++;
      }
    }

    const decorativeRatio = decorativeCount / totalChecked;
    return decorativeRatio < 0.3;
  }

  private initStatueInteraction(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    this.chatIconContainer = this.add.container(width - 100, height - 100);
    this.chatIconContainer.setScrollFactor(0);
    this.chatIconContainer.setDepth(60);
    this.chatIconContainer.setVisible(false);

    const bg = this.add.rectangle(0, 0, 80, 80, 0x333333, 0.9);
    bg.setStrokeStyle(2, 0x666666);
    this.chatIconContainer.add(bg);

    const chatIcon = this.add.graphics();
    chatIcon.lineStyle(3, 0xffffff, 1);
    chatIcon.strokeRect(-20, -20, 40, 30);
    chatIcon.beginPath();
    chatIcon.moveTo(20, 10);
    chatIcon.lineTo(30, 20);
    chatIcon.lineTo(20, 20);
    chatIcon.closePath();
    chatIcon.strokePath();
    chatIcon.lineStyle(2, 0xffffff, 1);
    chatIcon.moveTo(-15, -5);
    chatIcon.lineTo(15, -5);
    chatIcon.moveTo(-15, 0);
    chatIcon.lineTo(10, 0);
    chatIcon.moveTo(-15, 5);
    chatIcon.lineTo(12, 5);
    chatIcon.strokePath();
    this.chatIconContainer.add(chatIcon);

    const pressCText = this.add.text(0, 35, "Press C", {
      font: "12px monospace",
      color: "#ffffff",
      align: "center",
    });
    pressCText.setOrigin(0.5);
    this.chatIconContainer.add(pressCText);

    this.chatWidth = 400;
    const chatHeight = height - 200;
    const chatX = width - this.chatWidth - 20;
    const chatY = height - chatHeight - 20;

    this.chatDialogueContainer = this.add.container(chatX, chatY);
    this.chatDialogueContainer.setScrollFactor(0);
    this.chatDialogueContainer.setDepth(60);
    this.chatDialogueContainer.setVisible(false);

    const chatBg = this.add.rectangle(
      this.chatWidth / 2,
      chatHeight / 2,
      this.chatWidth,
      chatHeight,
      0x1a1a1a,
      0.95
    );
    chatBg.setStrokeStyle(4, 0x666666);
    this.chatDialogueContainer.add(chatBg);

    const headerBg = this.add.rectangle(
      this.chatWidth / 2,
      30,
      this.chatWidth,
      50,
      0x2a2a2a,
      1
    );
    headerBg.setStrokeStyle(2, 0x666666);
    this.chatDialogueContainer.add(headerBg);

    const statueIcon = this.add.text(20, 30, "🗿", {
      font: "24px monospace",
      color: "#ffffff",
    });
    statueIcon.setOrigin(0, 0.5);
    this.chatDialogueContainer.add(statueIcon);

    const headerText = this.add.text(50, 30, "Statue Chat", {
      font: "bold 16px monospace",
      color: "#ffffff",
    });
    headerText.setOrigin(0, 0.5);
    this.chatDialogueContainer.add(headerText);

    const closeButton = this.add.text(this.chatWidth - 30, 30, "×", {
      font: "bold 24px monospace",
      color: "#ffffff",
    });
    closeButton.setOrigin(0.5);
    closeButton.setInteractive({ useHandCursor: true });
    closeButton.on("pointerdown", () => {
      this.closeChat();
    });
    this.chatDialogueContainer.add(closeButton);

    this.chatMessageContainer = this.add.container(this.chatWidth / 2, 100);
    this.chatDialogueContainer.add(this.chatMessageContainer);

    this.addChatMessage("statue", "Hello! I'm an old statue 🗿");

    const inputBg = this.add.rectangle(
      this.chatWidth / 2,
      chatHeight - 60,
      this.chatWidth - 40,
      40,
      0x2a2a2a,
      1
    );
    inputBg.setStrokeStyle(2, 0x666666);
    this.chatDialogueContainer.add(inputBg);

    this.chatInputField = this.add.text(30, chatHeight - 60, "", {
      font: "14px monospace",
      color: "#ffffff",
      backgroundColor: "#1a1a1a",
      padding: { x: 10, y: 8 },
    });
    this.chatInputField.setOrigin(0, 0.5);
    this.chatInputField.setInteractive({ useHandCursor: true });
    this.chatInputField.on("pointerdown", () => {
      this.isChatOpen = true;
    });
    this.chatDialogueContainer.add(this.chatInputField);

    const placeholderText = this.add.text(
      30,
      chatHeight - 60,
      "Type your message...",
      {
        font: "14px monospace",
        color: "#666666",
      }
    );
    placeholderText.setOrigin(0, 0.5);
    placeholderText.setName("placeholder");
    this.chatDialogueContainer.add(placeholderText);

    const sendButton = this.add.text(
      this.chatWidth - 50,
      chatHeight - 60,
      "Send",
      {
        font: "bold 14px monospace",
        color: "#4a9eff",
        backgroundColor: "#2a2a2a",
        padding: { x: 10, y: 8 },
      }
    );
    sendButton.setOrigin(0.5);
    sendButton.setInteractive({ useHandCursor: true });
    sendButton.on("pointerdown", () => {
      this.sendChatMessage();
    });
    this.chatDialogueContainer.add(sendButton);

    const cKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    cKey.on("down", () => {
      if (
        this.isNearStatue &&
        !this.isChatOpen &&
        !this.isMenuOpen &&
        !this.isDialogVisible
      ) {
        this.openChat();
      }
    });

    const escKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.ESC
    );
    escKey.on("down", () => {
      if (this.isChatOpen) {
        this.closeChat();
      }
    });

    this.input.keyboard!.on("keydown", (event: KeyboardEvent) => {
      if (!this.isChatOpen) return;

      if (event.key === "Enter") {
        this.sendChatMessage();
      } else if (event.key === "Backspace") {
        this.chatInputText = (this.chatInputText || "").slice(0, -1);
        this.updateChatInput(this.chatInputText);
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
        this.chatInputText = (this.chatInputText || "") + event.key;
        this.updateChatInput(this.chatInputText);
      }
    });

    this.chatInputText = "";
  }

  private updateChatIconVisibility(): void {
    if (this.chatIconContainer) {
      const shouldShow = this.isNearStatue && !this.isChatOpen;
      this.chatIconContainer.setVisible(shouldShow);

      if (shouldShow) {
        this.tweens.add({
          targets: this.chatIconContainer,
          y: this.chatIconContainer.y - 5,
          duration: 500,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      } else {
        this.tweens.killTweensOf(this.chatIconContainer);
      }
    }
  }

  private openChat(): void {
    this.isChatOpen = true;
    if (this.chatDialogueContainer) {
      this.chatDialogueContainer.setVisible(true);
    }
    if (this.chatIconContainer) {
      this.chatIconContainer.setVisible(false);
    }

    const placeholder = this.chatDialogueContainer?.list.find(
      (child) => child.name === "placeholder"
    );
    if (placeholder && "setVisible" in placeholder) {
      (
        placeholder as Phaser.GameObjects.GameObject & {
          setVisible: (visible: boolean) => void;
        }
      ).setVisible(false);
    }
  }

  private closeChat(): void {
    this.isChatOpen = false;
    if (this.chatDialogueContainer) {
      this.chatDialogueContainer.setVisible(false);
    }
    this.updateChatIconVisibility();

    this.chatInputText = "";
    this.updateChatInput("");
  }

  private updateChatInput(text: string): void {
    this.chatInputText = text;
    if (this.chatInputField) {
      this.chatInputField.setText(text || "");
    }

    const placeholder = this.chatDialogueContainer?.list.find(
      (child) => child.name === "placeholder"
    );
    if (placeholder && "setVisible" in placeholder) {
      (
        placeholder as Phaser.GameObjects.GameObject & {
          setVisible: (visible: boolean) => void;
        }
      ).setVisible(text.length === 0);
    }
  }

  private sendChatMessage(): void {
    if (!this.chatInputText || this.chatInputText.trim().length === 0) return;

    this.addChatMessage("player", this.chatInputText.trim());

    const message = this.chatInputText.trim();
    this.updateChatInput("");

    setTimeout(() => {
      const response = this.getStatueResponse(message);
      this.addChatMessage("statue", response);
    }, 500);
  }

  private addChatMessage(sender: string, text: string): void {
    if (!this.chatMessageContainer) return;

    const messageY = this.chatMessages.length * 60 + 20;
    const messageContainer = this.add.container(0, messageY);

    const isPlayer = sender === "player";
    const bgColor = isPlayer ? 0x4a9eff : 0x2a2a2a;
    const textColor = "#ffffff";
    const xPos = isPlayer ? this.chatWidth - 20 : 20;

    const messageBg = this.add.rectangle(
      xPos,
      0,
      Math.min(text.length * 8 + 20, this.chatWidth - 60),
      40,
      bgColor,
      1
    );
    messageBg.setOrigin(isPlayer ? 1 : 0, 0.5);
    messageContainer.add(messageBg);

    const messageText = this.add.text(xPos + (isPlayer ? -10 : 10), 0, text, {
      font: "12px monospace",
      color: textColor,
      wordWrap: { width: this.chatWidth - 80 },
    });
    messageText.setOrigin(isPlayer ? 1 : 0, 0.5);
    messageContainer.add(messageText);

    this.chatMessageContainer.add(messageContainer);
    this.chatMessages.push({ container: messageContainer, sender, text });

    if (this.chatMessages.length > 6) {
      const toRemove = this.chatMessages.shift();
      if (toRemove) {
        toRemove.container.destroy();

        this.chatMessages.forEach((msg, index) => {
          msg.container.y = index * 60 + 20;
        });
      }
    }
  }

  private getStatueResponse(playerMessage: string): string {
    const lowerMessage = playerMessage.toLowerCase();

    if (lowerMessage.includes("hello") || lowerMessage.includes("hi")) {
      return "Greetings, traveler. I have stood here for many ages.";
    }
    if (lowerMessage.includes("how") && lowerMessage.includes("you")) {
      return "I am as I have always been - still and patient. Time means little to stone.";
    }
    if (lowerMessage.includes("name")) {
      return "I am known as the old statue. My true name has been lost to time.";
    }
    if (lowerMessage.includes("weather")) {
      return "The weather changes, but I remain constant. Rain, sun, or storm - I endure.";
    }
    if (lowerMessage.includes("old") || lowerMessage.includes("ancient")) {
      return "Yes, I am very old. I have witnessed many seasons pass.";
    }
    if (
      lowerMessage.includes("beautiful") ||
      lowerMessage.includes("impressive")
    ) {
      return "Thank you. Though weathered, I still stand as a testament to those who came before.";
    }
    if (lowerMessage.includes("bye") || lowerMessage.includes("goodbye")) {
      return "Farewell, traveler. May your journey be safe.";
    }
    if (lowerMessage.includes("help")) {
      return "I am but a statue, but I can share what I have observed over the ages.";
    }

    const defaultResponses = [
      "Interesting... I have not heard such words in a long time.",
      "The world has changed much since I was first placed here.",
      "I have seen many travelers pass by, but few stop to speak.",
      "Time flows differently for stone than for flesh.",
      "What stories could I tell, if only I could move...",
      "I remember when this place was different, long ago.",
    ];
    return defaultResponses[
      Math.floor(Math.random() * defaultResponses.length)
    ];
  }
}
