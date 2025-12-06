/**
 * Weather Effects System - Handles visual weather effects (fog, rain, snow, thunderstorm)
 */

import Phaser from "phaser";
import type { WeatherData } from "../config/WeatherConfig";
import { gameEventBus } from "../utils/GameEventBus";

export type WeatherType =
  | "clear"
  | "cloudy"
  | "foggy"
  | "rain"
  | "snow"
  | "thunderstorm";

export type RainIntensity = "light" | "moderate" | "heavy";

interface WeatherTypeInfo {
  type: WeatherType;
  rainIntensity?: RainIntensity;
}

/**
 * Map weathercode to weather type and intensity
 */
const getWeatherTypeFromCode = (weathercode: number): WeatherTypeInfo => {
  if (weathercode === 0) return { type: "clear" };
  if (weathercode >= 1 && weathercode <= 3) return { type: "cloudy" };
  if (weathercode >= 45 && weathercode <= 48) return { type: "foggy" };
  if (weathercode >= 95 && weathercode <= 99) {
    return { type: "thunderstorm", rainIntensity: "heavy" };
  }
  if (weathercode >= 51 && weathercode <= 67) {
    // Rain codes
    if (weathercode <= 53) return { type: "rain", rainIntensity: "light" };
    if (weathercode <= 56) return { type: "rain", rainIntensity: "moderate" };
    if (weathercode <= 63) return { type: "rain", rainIntensity: "moderate" };
    if (weathercode <= 67) return { type: "rain", rainIntensity: "heavy" };
    return { type: "rain", rainIntensity: "moderate" };
  }
  if (weathercode >= 71 && weathercode <= 86) {
    // Snow codes
    if (weathercode <= 73) return { type: "snow" };
    if (weathercode <= 77) return { type: "snow" };
    if (weathercode >= 80 && weathercode <= 82) {
      // Rain showers
      if (weathercode === 80) return { type: "rain", rainIntensity: "light" };
      if (weathercode === 81)
        return { type: "rain", rainIntensity: "moderate" };
      return { type: "rain", rainIntensity: "heavy" };
    }
    if (weathercode >= 85 && weathercode <= 86) return { type: "snow" };
    return { type: "snow" };
  }
  return { type: "clear" };
};

export class WeatherEffectsSystem {
  private scene: Phaser.Scene;
  private camera?: Phaser.Cameras.Scene2D.Camera;
  private player?: { getPosition: () => { x: number; y: number } };
  gameMap?: Phaser.Tilemaps.Tilemap | null;

  private currentWeatherType: WeatherType = "clear";
  private currentRainIntensity: RainIntensity = "moderate";
  private isTestMode: boolean = false;
  private testModeTimer?: Phaser.Time.TimerEvent;
  isInternalUpdate: boolean = false;

  // Fog effect
  private fogOverlay?: Phaser.GameObjects.Rectangle;
  private fogMaskGraphics?: Phaser.GameObjects.Graphics;

  // Rain effect
  private rainTint?: Phaser.GameObjects.Rectangle;
  private rainEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;

  // Snow effect
  private snowEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;

  // Thunderstorm effect
  private lightningFlash?: Phaser.GameObjects.Rectangle;
  private lightningTimer?: Phaser.Time.TimerEvent;
  private nextLightningTime: number = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public init(
    camera: Phaser.Cameras.Scene2D.Camera,
    player: { getPosition: () => { x: number; y: number } },
    gameMap?: Phaser.Tilemaps.Tilemap | null,
  ): void {
    this.camera = camera;
    this.player = player;
    this.gameMap = gameMap;

    // Listen to weather updates (only when not in test mode)
    gameEventBus.on("weather:update", (payload?: unknown) => {
      // Ignore real weather updates when test mode is active
      if (this.isTestMode) {
        return;
      }

      if (
        payload &&
        typeof payload === "object" &&
        "weather" in payload &&
        payload.weather
      ) {
        this.setWeather(payload.weather as WeatherData);
      }
    });
  }

  public setWeather(
    weatherData: WeatherData | null,
    force: boolean = false,
  ): void {
    // Don't update weather from external sources if test mode is active (unless forced)
    if (this.isTestMode && !force) {
      return;
    }

    if (!weatherData) {
      this.clearAllEffects();
      this.currentWeatherType = "clear";
      return;
    }

    const weatherInfo = getWeatherTypeFromCode(weatherData.weathercode);
    this.currentWeatherType = weatherInfo.type;
    this.currentRainIntensity = weatherInfo.rainIntensity || "moderate";

    // Clear all effects first
    this.clearAllEffects();

    // Apply effects based on weather type
    switch (this.currentWeatherType) {
      case "foggy":
        this.createFogEffect();
        break;
      case "rain":
        this.createRainEffect();
        break;
      case "snow":
        this.createSnowEffect();
        break;
      case "thunderstorm":
        this.createThunderstormEffect();
        break;
      default:
        // No effects for clear/cloudy
        break;
    }

    // Emit weather change notification event
    gameEventBus.emit("weather:change", {
      weatherType: this.currentWeatherType,
      icon: this.getWeatherIconForType(this.currentWeatherType),
      description: this.getWeatherDescription(this.currentWeatherType),
    });
  }

  public getWeatherType(): WeatherType {
    return this.currentWeatherType;
  }

  public toggleTestMode(): void {
    this.isTestMode = !this.isTestMode;

    if (this.isTestMode) {
      // Start test mode - cycle through weather types
      this.startTestMode();
    } else {
      // Stop test mode
      this.stopTestMode();
    }
  }

  public isTestModeEnabled(): boolean {
    return this.isTestMode;
  }

  private startTestMode(): void {
    // Clear any existing timer
    if (this.testModeTimer) {
      this.testModeTimer.remove();
    }

    // Start with rain
    const rainWeather = this.createMockWeatherData("rain");
    this.setWeather(rainWeather, true); // Force update even in test mode
    this.currentWeatherType = "rain";

    // Set up timer to cycle every 5 seconds
    this.testModeTimer = this.scene.time.addEvent({
      delay: 5000,
      callback: () => {
        if (this.isTestMode) {
          this.cycleToNextWeatherType();
        }
      },
      loop: true,
    });
  }

  private stopTestMode(): void {
    if (this.testModeTimer) {
      this.testModeTimer.remove();
      this.testModeTimer = undefined;
    }
  }

  private cycleToNextWeatherType(): void {
    const weatherTypes: WeatherType[] = [
      "rain", // Start with rain
      "snow",
      "foggy",
      "thunderstorm",
      "clear",
      "cloudy",
    ];

    // Find current index
    const currentIndex = weatherTypes.indexOf(this.currentWeatherType);
    const nextIndex = (currentIndex + 1) % weatherTypes.length;
    const nextWeatherType = weatherTypes[nextIndex];

    // Create mock weather data for the next weather type
    const mockWeather = this.createMockWeatherData(nextWeatherType);
    this.setWeather(mockWeather, true); // Force update even in test mode
  }

  private createMockWeatherData(weatherType: WeatherType): WeatherData {
    const baseWeather: WeatherData = {
      temperature: 15,
      windspeed: 10,
      weathercode: 0,
      time: new Date().toISOString(),
    };

    switch (weatherType) {
      case "clear":
        return { ...baseWeather, weathercode: 0 };
      case "cloudy":
        return { ...baseWeather, weathercode: 2 };
      case "foggy":
        return { ...baseWeather, weathercode: 45 };
      case "rain":
        return { ...baseWeather, weathercode: 61 }; // Moderate rain
      case "snow":
        return { ...baseWeather, weathercode: 71 }; // Light snow
      case "thunderstorm":
        return { ...baseWeather, weathercode: 95 };
      default:
        return baseWeather;
    }
  }

  public update(): void {
    // Update fog mask position to follow player
    if (this.fogMaskGraphics && this.fogOverlay && this.player && this.camera) {
      const width = this.scene.scale.width;
      const height = this.scene.scale.height;
      const playerPos = this.player.getPosition();
      const cameraX = this.camera.scrollX;
      const cameraY = this.camera.scrollY;

      // Calculate position relative to camera (screen coordinates)
      const screenX = playerPos.x - cameraX;
      const screenY = playerPos.y - cameraY;
      const radius = 160; // 10 tiles * 32px / 2 = 160px radius

      // Clear and redraw mask - everything covered except circle around player
      this.fogMaskGraphics.clear();
      this.fogMaskGraphics.fillStyle(0xffffff, 1);

      // Draw full screen
      this.fogMaskGraphics.fillRect(0, 0, width, height);

      // Calculate circle bounds
      const circleLeft = screenX - radius;
      const circleRight = screenX + radius;
      const circleTop = screenY - radius;
      const circleBottom = screenY + radius;

      // Draw rectangles around the circle area
      // Top rectangle
      if (circleTop > 0) {
        this.fogMaskGraphics.fillRect(0, 0, width, circleTop);
      }
      // Bottom rectangle
      if (circleBottom < height) {
        this.fogMaskGraphics.fillRect(
          0,
          circleBottom,
          width,
          height - circleBottom,
        );
      }
      // Left rectangle (middle section)
      if (circleLeft > 0) {
        this.fogMaskGraphics.fillRect(
          0,
          Math.max(0, circleTop),
          circleLeft,
          circleBottom - Math.max(0, circleTop),
        );
      }
      // Right rectangle (middle section)
      if (circleRight < width) {
        this.fogMaskGraphics.fillRect(
          circleRight,
          Math.max(0, circleTop),
          width - circleRight,
          circleBottom - Math.max(0, circleTop),
        );
      }

      // Fill pixels outside the circle in the circle's bounding box
      const step = 2; // Check every 2 pixels for performance
      const startX = Math.max(0, circleLeft);
      const endX = Math.min(width, circleRight);
      const startY = Math.max(0, circleTop);
      const endY = Math.min(height, circleBottom);

      for (let y = startY; y < endY; y += step) {
        for (let x = startX; x < endX; x += step) {
          const dx = x - screenX;
          const dy = y - screenY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance >= radius) {
            // Outside circle, fill this pixel
            this.fogMaskGraphics.fillRect(x, y, step, step);
          }
        }
      }
    }

    // Update lightning flash visibility
    if (this.lightningFlash) {
      const now = Date.now();
      if (now < this.nextLightningTime) {
        // Flash is visible
        this.lightningFlash.setVisible(true);
      } else {
        // Flash is hidden, schedule next lightning
        this.lightningFlash.setVisible(false);
        if (!this.lightningTimer) {
          this.scheduleNextLightning();
        }
      }
    }
  }

  private createFogEffect(): void {
    if (!this.camera || !this.player) return;

    const width = this.scene.scale.width;
    const height = this.scene.scale.height;

    // Create fog overlay (dark gray/white fog)
    this.fogOverlay = this.scene.add.rectangle(
      width / 2,
      height / 2,
      width,
      height,
      0xcccccc, // Light gray fog
      0.8, // High opacity
    );
    this.fogOverlay.setDepth(14);
    this.fogOverlay.setScrollFactor(0);

    // Create mask graphics that covers everything except player area
    this.fogMaskGraphics = this.scene.make.graphics({});
    this.fogMaskGraphics.setScrollFactor(0);

    // Get player position
    const playerPos = this.player.getPosition();
    const cameraX = this.camera.scrollX;
    const cameraY = this.camera.scrollY;
    const screenX = playerPos.x - cameraX;
    const screenY = playerPos.y - cameraY;
    const radius = 160; // 10 tiles * 32px / 2 = 160px radius

    // Draw mask by drawing rectangles around the circle
    // The mask reveals where graphics is drawn, so we draw everywhere EXCEPT the circle
    this.fogMaskGraphics.fillStyle(0xffffff, 1);

    const circleLeft = screenX - radius;
    const circleRight = screenX + radius;
    const circleTop = screenY - radius;
    const circleBottom = screenY + radius;

    // Top rectangle
    if (circleTop > 0) {
      this.fogMaskGraphics.fillRect(0, 0, width, circleTop);
    }
    // Bottom rectangle
    if (circleBottom < height) {
      this.fogMaskGraphics.fillRect(
        0,
        circleBottom,
        width,
        height - circleBottom,
      );
    }
    // Left rectangle (middle section)
    if (circleLeft > 0) {
      this.fogMaskGraphics.fillRect(
        0,
        Math.max(0, circleTop),
        circleLeft,
        circleBottom - Math.max(0, circleTop),
      );
    }
    // Right rectangle (middle section)
    if (circleRight < width) {
      this.fogMaskGraphics.fillRect(
        circleRight,
        Math.max(0, circleTop),
        width - circleRight,
        circleBottom - Math.max(0, circleTop),
      );
    }

    // Fill pixels outside the circle in the circle's bounding box
    const step = 2; // Check every 2 pixels for performance
    const startX = Math.max(0, circleLeft);
    const endX = Math.min(width, circleRight);
    const startY = Math.max(0, circleTop);
    const endY = Math.min(height, circleBottom);

    for (let y = startY; y < endY; y += step) {
      for (let x = startX; x < endX; x += step) {
        const dx = x - screenX;
        const dy = y - screenY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance >= radius) {
          // Outside circle, fill this pixel
          this.fogMaskGraphics.fillRect(x, y, step, step);
        }
      }
    }

    // Create geometry mask from graphics
    const mask = this.fogMaskGraphics.createGeometryMask();
    this.fogOverlay.setMask(mask);
  }

  private createRainEffect(): void {
    if (!this.camera) return;

    const width = this.scene.scale.width;
    const height = this.scene.scale.height;

    // Create blue tint overlay (reduced by half)
    const tintIntensity =
      this.currentRainIntensity === "light"
        ? 0.1
        : this.currentRainIntensity === "moderate"
          ? 0.175
          : 0.25;

    this.rainTint = this.scene.add.rectangle(
      width / 2,
      height / 2,
      width,
      height,
      0x4a90e2, // Blue tint
      tintIntensity,
    );
    this.rainTint.setDepth(13);
    this.rainTint.setScrollFactor(0);

    // Create rain particle emitter
    const particleCount =
      this.currentRainIntensity === "light"
        ? 50
        : this.currentRainIntensity === "moderate"
          ? 100
          : 200;

    // Create simple rain texture (small line)
    const rainTexture = this.scene.add.graphics();
    rainTexture.lineStyle(1, 0x87ceeb, 0.6);
    rainTexture.lineBetween(0, 0, 0, 8);
    rainTexture.generateTexture("rain", 2, 10);
    rainTexture.destroy();

    // Create particle emitter
    this.rainEmitter = this.scene.add.particles(0, 0, "rain", {
      x: { min: 0, max: width },
      y: { min: -50, max: 0 },
      speedY: { min: 200, max: 400 },
      speedX: { min: -50, max: 50 },
      scale: { start: 1, end: 1 },
      alpha: { start: 0.6, end: 0.3 },
      lifespan: 2000,
      frequency: 1000 / particleCount,
      quantity: 1,
    });

    this.rainEmitter.setDepth(16);
    this.rainEmitter.setScrollFactor(0);
  }

  private createSnowEffect(): void {
    if (!this.camera) return;

    const width = this.scene.scale.width;

    // Create snowflake texture (small circle)
    const snowTexture = this.scene.add.graphics();
    snowTexture.fillStyle(0xffffff, 0.8);
    snowTexture.fillCircle(0, 0, 2);
    snowTexture.generateTexture("snowflake", 4, 4);
    snowTexture.destroy();

    // Create particle emitter
    this.snowEmitter = this.scene.add.particles(0, 0, "snowflake", {
      x: { min: 0, max: width },
      y: { min: -50, max: 0 },
      speedY: { min: 30, max: 80 },
      speedX: { min: -30, max: 30 },
      scale: { start: 0.5, end: 1.5 },
      alpha: { start: 0.8, end: 0.3 },
      lifespan: 5000,
      frequency: 50,
      quantity: 1,
      gravityY: 10,
    });

    this.snowEmitter.setDepth(16);
    this.snowEmitter.setScrollFactor(0);
  }

  private createThunderstormEffect(): void {
    // Create rain effect first
    this.createRainEffect();

    if (!this.camera) return;

    const width = this.scene.scale.width;
    const height = this.scene.scale.height;

    // Create lightning flash overlay
    this.lightningFlash = this.scene.add.rectangle(
      width / 2,
      height / 2,
      width,
      height,
      0xffffff, // White flash
      0.3,
    );
    this.lightningFlash.setDepth(17);
    this.lightningFlash.setScrollFactor(0);
    this.lightningFlash.setVisible(false);

    // Schedule first lightning
    this.scheduleNextLightning();
  }

  private scheduleNextLightning(): void {
    if (!this.lightningFlash) return;

    // Random time between 3-10 seconds
    const delay = Phaser.Math.Between(3000, 10000);

    this.lightningTimer = this.scene.time.delayedCall(delay, () => {
      // Flash for 100-200ms
      const flashDuration = Phaser.Math.Between(100, 200);
      this.lightningFlash?.setVisible(true);
      this.nextLightningTime = Date.now() + flashDuration;

      // Hide after flash duration
      this.scene.time.delayedCall(flashDuration, () => {
        this.lightningFlash?.setVisible(false);
        this.lightningTimer = undefined;
        this.scheduleNextLightning();
      });
    });
  }

  private clearAllEffects(): void {
    // Clear fog
    if (this.fogOverlay) {
      this.fogOverlay.destroy();
      this.fogOverlay = undefined;
    }
    if (this.fogMaskGraphics) {
      this.fogMaskGraphics.destroy();
      this.fogMaskGraphics = undefined;
    }

    // Clear rain
    if (this.rainTint) {
      this.rainTint.destroy();
      this.rainTint = undefined;
    }
    if (this.rainEmitter) {
      this.rainEmitter.destroy();
      this.rainEmitter = undefined;
    }

    // Clear snow
    if (this.snowEmitter) {
      this.snowEmitter.destroy();
      this.snowEmitter = undefined;
    }

    // Clear thunderstorm
    if (this.lightningFlash) {
      this.lightningFlash.destroy();
      this.lightningFlash = undefined;
    }
    if (this.lightningTimer) {
      this.lightningTimer.remove();
      this.lightningTimer = undefined;
    }
    this.nextLightningTime = 0;
  }

  private getWeatherIconForType(weatherType: WeatherType): string {
    switch (weatherType) {
      case "clear":
        return "☀️";
      case "cloudy":
        return "⛅";
      case "foggy":
        return "🌫️";
      case "rain":
        return "🌧️";
      case "snow":
        return "❄️";
      case "thunderstorm":
        return "⛈️";
      default:
        return "☀️";
    }
  }

  private getWeatherDescription(weatherType: WeatherType): string {
    switch (weatherType) {
      case "clear":
        return "Clear Sky";
      case "cloudy":
        return "Cloudy";
      case "foggy":
        return "Foggy";
      case "rain":
        return "Rain";
      case "snow":
        return "Snow";
      case "thunderstorm":
        return "Thunderstorm";
      default:
        return "Clear";
    }
  }

  public shutdown(): void {
    this.stopTestMode();
    this.clearAllEffects();
    // Note: We can't easily remove the event listener without storing the handler
    // This is acceptable as the system will be destroyed with the scene
  }
}
