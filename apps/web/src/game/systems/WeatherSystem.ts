import Phaser from "phaser";
import { WEATHER_UPDATE_INTERVAL } from "../config/GameConstants";
import {
  getWeatherIcon,
  WEATHER_CODE_MAP,
  type WeatherData,
} from "../config/WeatherConfig";
import { fetchWeatherData, formatTime } from "../utils/WeatherUtils";

export class WeatherSystem {
  private scene: Phaser.Scene;
  private weatherWidget: Phaser.GameObjects.Container | null = null;
  private isExpanded: boolean = false;
  private isLocationDenied: boolean = false;
  private fullWidgetWidth: number = 200;
  private fullWidgetHeight: number = 260;
  private smallWidgetWidth: number = 100;
  private smallWidgetHeight: number = 60;
  private collapseTimer: Phaser.Time.TimerEvent | null = null;

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
          this.isLocationDenied = true;
        } else if (err.code === 2) {
          errorMessage = "Location unavailable";
        } else if (err.code === 3) {
          errorMessage = "Location request timed out";
        }
        this.createWeatherWidget(null, errorMessage);
      },
    );
  }

  private createWeatherWidget(
    weather: WeatherData | null,
    error: string | null,
  ): void {
    const width = this.scene.cameras.main.width;
    const padding = 12;
    const borderRadius = 16;

    // Determine widget size based on state
    let widgetWidth: number;
    let widgetHeight: number;

    if (this.isLocationDenied && error) {
      // Small widget for location denied state
      widgetWidth = this.smallWidgetWidth;
      widgetHeight = this.smallWidgetHeight;
    } else if (!this.isExpanded) {
      // Small widget for collapsed state
      widgetWidth = this.smallWidgetWidth;
      widgetHeight = this.smallWidgetHeight;
    } else {
      // Full widget for expanded state
      widgetWidth = this.fullWidgetWidth;
      widgetHeight = this.fullWidgetHeight;
    }

    const x = width - widgetWidth - padding;
    const y = padding;

    const container = this.scene.add.container(x, y);
    container.setScrollFactor(0);
    container.setDepth(30);

    // Create rounded rectangle background using graphics with 50% transparency
    const bg = this.scene.add.graphics();
    bg.fillStyle(0xffffff, 0.5);
    bg.lineStyle(2, 0x000000, 0.3);
    bg.fillRoundedRect(0, 0, widgetWidth, widgetHeight, borderRadius);
    bg.strokeRoundedRect(0, 0, widgetWidth, widgetHeight, borderRadius);
    container.add(bg);

    if (error || !weather) {
      if (this.isLocationDenied && error === "Location access denied") {
        // Create small widget with refresh icon for location denied
        this.renderLocationDeniedWidget(container, widgetWidth, widgetHeight);
      } else {
        const errorText = this.scene.add.text(
          widgetWidth / 2,
          widgetHeight / 2,
          error || "Unable to fetch weather",
          {
            font: "11px monospace",
            color: "#ff0000",
            align: "center",
            wordWrap: { width: widgetWidth - 20 },
            resolution: 1,
          },
        );
        errorText.setOrigin(0.5);
        container.add(errorText);
      }
      this.weatherWidget = container;
      return;
    }

    // Render content based on expanded state
    if (this.isExpanded) {
      this.renderWeatherContent(container, weather, widgetWidth);
    } else {
      this.renderSmallWeatherContent(container, weather, widgetWidth);
    }

    // Add hover interaction for expanding/collapsing
    this.setupHoverInteraction(container, weather);

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
          },
        );
      }
    }, WEATHER_UPDATE_INTERVAL);
  }

  private renderLocationDeniedWidget(
    container: Phaser.GameObjects.Container,
    widgetWidth: number,
    widgetHeight: number,
  ): void {
    const textStyle = {
      resolution: 1,
      fontFamily: "monospace",
    };

    // Error message
    const errorText = this.scene.add.text(
      widgetWidth / 2,
      15,
      "Location denied",
      {
        font: "9px monospace",
        color: "#ff0000",
        align: "center",
        ...textStyle,
      },
    );
    errorText.setOrigin(0.5);
    container.add(errorText);

    // Refresh icon (↻)
    const refreshIcon = this.scene.add.text(
      widgetWidth / 2,
      widgetHeight - 20,
      "↻",
      {
        font: "bold 16px monospace",
        color: "#000000",
        align: "center",
        ...textStyle,
      },
    );
    refreshIcon.setOrigin(0.5);
    refreshIcon.setInteractive({ useHandCursor: true });

    // Add hover effect
    refreshIcon.on("pointerover", () => {
      refreshIcon.setTint(0x0066ff);
    });
    refreshIcon.on("pointerout", () => {
      refreshIcon.clearTint();
    });

    // Add click handler to retry permission
    refreshIcon.on("pointerdown", () => {
      this.retryLocationPermission();
    });

    container.add(refreshIcon);
  }

  private retryLocationPermission(): void {
    if (!navigator.geolocation) return;

    this.isLocationDenied = false;
    this.isExpanded = false;

    // Clear existing widget
    if (this.weatherWidget) {
      this.weatherWidget.destroy();
      this.weatherWidget = null;
    }

    // Retry location request
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
          this.isLocationDenied = true;
        } else if (err.code === 2) {
          errorMessage = "Location unavailable";
        } else if (err.code === 3) {
          errorMessage = "Location request timed out";
        }
        this.createWeatherWidget(null, errorMessage);
      },
    );
  }

  private renderSmallWeatherContent(
    container: Phaser.GameObjects.Container,
    weather: WeatherData,
    _widgetWidth: number,
  ): void {
    const weatherIcon = getWeatherIcon(weather.weathercode);

    const textStyle = {
      resolution: 1,
      fontFamily: "monospace",
    };

    // Icon
    const iconText = this.scene.add.text(10, 10, weatherIcon, {
      font: "20px monospace",
      color: "#000000",
      ...textStyle,
    });
    container.add(iconText);

    // Temperature (essential info only)
    const tempText = this.scene.add.text(
      35,
      8,
      `${weather.temperature.toFixed(1)}°C`,
      {
        font: "bold 14px monospace",
        color: "#000000",
        ...textStyle,
      },
    );
    container.add(tempText);
  }

  private setupHoverInteraction(
    container: Phaser.GameObjects.Container,
    weather: WeatherData | null,
  ): void {
    if (!weather) return;

    // Remove existing event listeners to prevent duplicates
    container.removeAllListeners("pointerover");
    container.removeAllListeners("pointerout");

    // Determine current widget size
    const currentWidth = this.isExpanded
      ? this.fullWidgetWidth
      : this.smallWidgetWidth;
    const currentHeight = this.isExpanded
      ? this.fullWidgetHeight
      : this.smallWidgetHeight;

    // Make container interactive
    container.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, currentWidth, currentHeight),
      Phaser.Geom.Rectangle.Contains,
    );

    container.on("pointerover", () => {
      // Cancel any pending collapse
      if (this.collapseTimer) {
        this.collapseTimer.remove();
        this.collapseTimer = null;
      }

      if (!this.isExpanded) {
        this.isExpanded = true;
        this.expandWidget(weather);
      }
    });

    container.on("pointerout", () => {
      if (this.isExpanded) {
        // Add a small delay before collapsing to prevent flickering
        // This gives time for the mouse to move into the expanded area
        this.collapseTimer = this.scene.time.delayedCall(200, () => {
          // Double-check the mouse is still outside before collapsing
          if (this.isExpanded && this.weatherWidget) {
            const pointer = this.scene.input.activePointer;
            // Since widget has scrollFactor(0), use screen coordinates
            const widgetX = this.weatherWidget.x;
            const widgetY = this.weatherWidget.y;
            const widgetBounds = new Phaser.Geom.Rectangle(
              widgetX,
              widgetY,
              this.fullWidgetWidth,
              this.fullWidgetHeight,
            );

            // Check if pointer is outside the expanded widget bounds
            // Use screen coordinates since widget is fixed to screen
            const pointerX = pointer.x;
            const pointerY = pointer.y;

            if (!widgetBounds.contains(pointerX, pointerY)) {
              this.isExpanded = false;
              this.collapseWidget(weather);
            }
          }
          this.collapseTimer = null;
        });
      }
    });
  }

  private expandWidget(weather: WeatherData): void {
    if (!this.weatherWidget) return;

    const width = this.scene.cameras.main.width;
    const padding = 12;
    const widgetWidth = this.fullWidgetWidth;
    const widgetHeight = this.fullWidgetHeight;
    const x = width - widgetWidth - padding;
    const y = padding;

    // Update position
    this.weatherWidget.setPosition(x, y);

    // IMMEDIATELY update interaction area to full size BEFORE rendering
    // This prevents the mouse from leaving the interactive area during expansion
    this.weatherWidget.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, widgetWidth, widgetHeight),
      Phaser.Geom.Rectangle.Contains,
    );

    // Clear existing content
    const children = this.weatherWidget.list.slice(1);
    children.forEach((child) => {
      if (
        child instanceof Phaser.GameObjects.Text ||
        child instanceof Phaser.GameObjects.Graphics
      ) {
        child.destroy();
      }
    });

    // Update background
    const bg = this.weatherWidget.list[0] as Phaser.GameObjects.Graphics;
    bg.clear();
    bg.fillStyle(0xffffff, 0.5);
    bg.lineStyle(2, 0x000000, 0.3);
    bg.fillRoundedRect(0, 0, widgetWidth, widgetHeight, 16);
    bg.strokeRoundedRect(0, 0, widgetWidth, widgetHeight, 16);

    // Render full content
    this.renderWeatherContent(this.weatherWidget, weather, widgetWidth);

    // Re-setup hover interaction with updated size
    this.setupHoverInteraction(this.weatherWidget, weather);
  }

  private collapseWidget(weather: WeatherData): void {
    if (!this.weatherWidget) return;

    const width = this.scene.cameras.main.width;
    const padding = 12;
    const widgetWidth = this.smallWidgetWidth;
    const widgetHeight = this.smallWidgetHeight;
    const x = width - widgetWidth - padding;
    const y = padding;

    // Update position
    this.weatherWidget.setPosition(x, y);

    // IMMEDIATELY update interaction area to small size BEFORE rendering
    this.weatherWidget.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, widgetWidth, widgetHeight),
      Phaser.Geom.Rectangle.Contains,
    );

    // Clear existing content
    const children = this.weatherWidget.list.slice(1);
    children.forEach((child) => {
      if (
        child instanceof Phaser.GameObjects.Text ||
        child instanceof Phaser.GameObjects.Graphics
      ) {
        child.destroy();
      }
    });

    // Update background
    const bg = this.weatherWidget.list[0] as Phaser.GameObjects.Graphics;
    bg.clear();
    bg.fillStyle(0xffffff, 0.5);
    bg.lineStyle(2, 0x000000, 0.3);
    bg.fillRoundedRect(0, 0, widgetWidth, widgetHeight, 16);
    bg.strokeRoundedRect(0, 0, widgetWidth, widgetHeight, 16);

    // Render small content
    this.renderSmallWeatherContent(this.weatherWidget, weather, widgetWidth);

    // Re-setup hover interaction with updated size
    this.setupHoverInteraction(this.weatherWidget, weather);
  }

  private renderWeatherContent(
    container: Phaser.GameObjects.Container,
    weather: WeatherData,
    widgetWidth: number,
  ): void {
    const weatherDescription =
      WEATHER_CODE_MAP[weather.weathercode] || "Unknown";
    const weatherIcon = getWeatherIcon(weather.weathercode);

    const textStyle = {
      resolution: 1,
      fontFamily: "monospace",
    };

    const iconText = this.scene.add.text(15, 15, weatherIcon, {
      font: "24px monospace",
      color: "#000000",
      ...textStyle,
    });
    container.add(iconText);

    const tempText = this.scene.add.text(
      50,
      12,
      `${weather.temperature.toFixed(1)}°C`,
      {
        font: "bold 16px monospace",
        color: "#000000",
        ...textStyle,
      },
    );
    container.add(tempText);

    const descText = this.scene.add.text(50, 32, weatherDescription, {
      font: "10px monospace",
      color: "#333333",
      wordWrap: { width: widgetWidth - 60 },
      ...textStyle,
    });
    container.add(descText);

    let yOffset = 60;

    const windText = this.scene.add.text(
      15,
      yOffset,
      `Wind: ${weather.windspeed.toFixed(1)} km/h`,
      {
        font: "10px monospace",
        color: "#666666",
        ...textStyle,
      },
    );
    container.add(windText);
    yOffset += 18;

    if (weather.windgusts_10m !== undefined && weather.windgusts_10m !== null) {
      const gustsText = this.scene.add.text(
        15,
        yOffset,
        `Gusts: ${weather.windgusts_10m.toFixed(1)} km/h`,
        {
          font: "10px monospace",
          color: "#666666",
          ...textStyle,
        },
      );
      container.add(gustsText);
      yOffset += 18;
    }

    if (
      weather.apparent_temperature !== undefined &&
      weather.apparent_temperature !== null
    ) {
      const feelsText = this.scene.add.text(
        15,
        yOffset,
        `Feels: ${weather.apparent_temperature.toFixed(1)}°C`,
        {
          font: "10px monospace",
          color: "#666666",
          ...textStyle,
        },
      );
      container.add(feelsText);
      yOffset += 18;
    }

    if (
      weather.relative_humidity_2m !== undefined &&
      weather.relative_humidity_2m !== null
    ) {
      const humidityText = this.scene.add.text(
        15,
        yOffset,
        `Humidity: ${weather.relative_humidity_2m.toFixed(0)}%`,
        {
          font: "10px monospace",
          color: "#666666",
          ...textStyle,
        },
      );
      container.add(humidityText);
      yOffset += 18;
    }

    if (weather.cloudcover !== undefined && weather.cloudcover !== null) {
      const cloudText = this.scene.add.text(
        15,
        yOffset,
        `Clouds: ${weather.cloudcover.toFixed(0)}%`,
        {
          font: "10px monospace",
          color: "#666666",
          ...textStyle,
        },
      );
      container.add(cloudText);
      yOffset += 18;
    }

    if (weather.pressure_msl !== undefined && weather.pressure_msl !== null) {
      const pressureText = this.scene.add.text(
        15,
        yOffset,
        `Pressure: ${weather.pressure_msl.toFixed(0)} hPa`,
        {
          font: "10px monospace",
          color: "#666666",
          ...textStyle,
        },
      );
      container.add(pressureText);
      yOffset += 18;
    }

    if (weather.uv_index !== undefined && weather.uv_index !== null) {
      const uvText = this.scene.add.text(
        15,
        yOffset,
        `UV: ${weather.uv_index.toFixed(1)}`,
        {
          font: "10px monospace",
          color: "#666666",
          ...textStyle,
        },
      );
      container.add(uvText);
      yOffset += 18;
    }

    if (
      weather.shortwave_radiation !== undefined &&
      weather.shortwave_radiation !== null
    ) {
      const solarText = this.scene.add.text(
        15,
        yOffset,
        `Solar: ${weather.shortwave_radiation.toFixed(0)} W/m²`,
        {
          font: "10px monospace",
          color: "#666666",
          ...textStyle,
        },
      );
      container.add(solarText);
      yOffset += 18;
    }

    if (
      weather.soil_moisture_0_to_7cm !== undefined &&
      weather.soil_moisture_0_to_7cm !== null
    ) {
      const soilText = this.scene.add.text(
        15,
        yOffset,
        `Soil: ${weather.soil_moisture_0_to_7cm.toFixed(2)} m³/m³`,
        {
          font: "10px monospace",
          color: "#666666",
          ...textStyle,
        },
      );
      container.add(soilText);
      yOffset += 18;
    }

    const timeText = this.scene.add.text(
      15,
      yOffset,
      `Updated: ${formatTime(weather.time)}`,
      {
        font: "9px monospace",
        color: "#666666",
        ...textStyle,
      },
    );
    container.add(timeText);
  }

  private updateWeatherWidget(weather: WeatherData): void {
    if (!this.weatherWidget || !weather) return;

    // Remove all children except the background (first child)
    const children = this.weatherWidget.list.slice(1);
    children.forEach((child) => {
      if (
        child instanceof Phaser.GameObjects.Text ||
        child instanceof Phaser.GameObjects.Graphics
      ) {
        child.destroy();
      }
    });

    // Render content based on current expanded state
    if (this.isExpanded) {
      this.renderWeatherContent(
        this.weatherWidget,
        weather,
        this.fullWidgetWidth,
      );
      // Re-setup hover interaction
      this.setupHoverInteraction(this.weatherWidget, weather);
    } else {
      this.renderSmallWeatherContent(
        this.weatherWidget,
        weather,
        this.smallWidgetWidth,
      );
      // Re-setup hover interaction
      this.setupHoverInteraction(this.weatherWidget, weather);
    }
  }
}
