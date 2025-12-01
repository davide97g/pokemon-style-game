import Phaser from "phaser";
import { WEATHER_UPDATE_INTERVAL } from "../config/GameConstants";
import {
  WEATHER_CODE_MAP,
  WeatherData,
  getWeatherIcon,
} from "../config/WeatherConfig";
import { fetchWeatherData, formatTime } from "../utils/WeatherUtils";

export class WeatherSystem {
  private scene: Phaser.Scene;
  private weatherWidget: Phaser.GameObjects.Container | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.initWeatherWidget();
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
        const weather = await fetchWeatherData(lat, lon);
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
    const width = this.scene.cameras.main.width;
    const padding = 12;
    const widgetWidth = 200;
    const widgetHeight = 100;
    const x = width - widgetWidth - padding;
    const y = padding;

    const container = this.scene.add.container(x, y);
    container.setScrollFactor(0);
    container.setDepth(30);

    const bg = this.scene.add.rectangle(
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
      const errorText = this.scene.add.text(
        widgetWidth / 2,
        widgetHeight / 2,
        error || "Unable to fetch weather",
        {
          font: "11px monospace",
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

    this.renderWeatherContent(container, weather, widgetWidth);

    this.weatherWidget = container;

    // Update weather every 5 minutes
    setInterval(async () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            const newWeather = await fetchWeatherData(lat, lon);
            if (newWeather && this.weatherWidget) {
              this.updateWeatherWidget(newWeather);
            }
          },
          () => {
            // Silently fail on update
          }
        );
      }
    }, WEATHER_UPDATE_INTERVAL);
  }

  private renderWeatherContent(
    container: Phaser.GameObjects.Container,
    weather: WeatherData,
    widgetWidth: number
  ): void {
    const weatherDescription =
      WEATHER_CODE_MAP[weather.weathercode] || "Unknown";
    const weatherIcon = getWeatherIcon(weather.weathercode);

    const iconText = this.scene.add.text(15, 15, weatherIcon, {
      font: "24px monospace",
      color: "#000000",
    });
    container.add(iconText);

    const tempText = this.scene.add.text(
      50,
      12,
      `${weather.temperature.toFixed(1)}°C`,
      {
        font: "bold 16px monospace",
        color: "#000000",
      }
    );
    container.add(tempText);

    const descText = this.scene.add.text(50, 32, weatherDescription, {
      font: "10px monospace",
      color: "#333333",
      wordWrap: { width: widgetWidth - 60 },
    });
    container.add(descText);

    const windText = this.scene.add.text(
      15,
      60,
      `Wind: ${weather.windspeed.toFixed(1)} km/h`,
      {
        font: "10px monospace",
        color: "#666666",
      }
    );
    container.add(windText);

    const timeText = this.scene.add.text(
      15,
      75,
      `Updated: ${formatTime(weather.time)}`,
      {
        font: "9px monospace",
        color: "#666666",
      }
    );
    container.add(timeText);
  }

  private updateWeatherWidget(weather: WeatherData): void {
    if (!this.weatherWidget || !weather) return;

    const children = this.weatherWidget.list.slice(1);
    children.forEach((child) => {
      if (child instanceof Phaser.GameObjects.Text) {
        child.destroy();
      }
    });

    const widgetWidth = 200;
    this.renderWeatherContent(this.weatherWidget, weather, widgetWidth);
  }
}
