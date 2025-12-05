import { useEffect, useState } from "react";
import { WEATHER_UPDATE_INTERVAL } from "../../game/config/GameConstants";
import {
  getWeatherIcon,
  WEATHER_CODE_MAP,
  type WeatherData,
} from "../../game/config/WeatherConfig";
import { gameEventBus } from "../../game/utils/GameEventBus";
import { fetchWeatherData } from "../../game/utils/WeatherUtils";

const WeatherUI = () => {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLocationDenied, setIsLocationDenied] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError("Geolocation not supported");
      return;
    }

    const fetchWeather = () => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          try {
            const weatherData = await fetchWeatherData(lat, lon);
            setWeather(weatherData);
            setError(null);
            gameEventBus.emit("weather:update", { weather: weatherData });
          } catch {
            setError("Unable to fetch weather");
          }
        },
        (err) => {
          let errorMessage = "Unable to get location";
          if (err.code === 1) {
            errorMessage = "Location access denied";
            setIsLocationDenied(true);
          } else if (err.code === 2) {
            errorMessage = "Location unavailable";
          } else if (err.code === 3) {
            errorMessage = "Location request timed out";
          }
          setError(errorMessage);
        },
      );
    };

    fetchWeather();

    const interval = setInterval(fetchWeather, WEATHER_UPDATE_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  const handleRetry = () => {
    setIsLocationDenied(false);
    setError(null);
    // Retry location request
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          try {
            const weatherData = await fetchWeatherData(lat, lon);
            setWeather(weatherData);
            setError(null);
          } catch {
            setError("Unable to fetch weather");
          }
        },
        () => {
          setError("Location access denied");
          setIsLocationDenied(true);
        },
      );
    }
  };

  if (error && isLocationDenied) {
    return (
      <div className="fixed top-3 right-3 w-24 h-15 bg-white bg-opacity-50 border-2 border-black border-opacity-30 rounded-2xl p-2 z-30">
        <p className="text-red-600 text-xs font-mono text-center mb-2">
          Location denied
        </p>
        <button
          type="button"
          onClick={handleRetry}
          className="text-black text-base font-mono font-bold text-center w-full hover:text-blue-600"
        >
          ↻
        </button>
      </div>
    );
  }

  if (error || !weather) {
    return (
      <div className="fixed top-3 right-3 w-24 h-15 bg-white bg-opacity-50 border-2 border-black border-opacity-30 rounded-2xl p-2 z-30">
        <p className="text-red-600 text-xs font-mono text-center">
          {error || "Unable to fetch weather"}
        </p>
      </div>
    );
  }

  const weatherDescription = WEATHER_CODE_MAP[weather.weathercode] || "Unknown";
  const weatherIcon = getWeatherIcon(weather.weathercode);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: test
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: test
    <div
      className="fixed top-3 right-3 bg-white bg-opacity-50 border-2 border-black border-opacity-30 rounded-2xl p-3 z-30 cursor-pointer transition-all"
      style={{
        width: isExpanded ? "200px" : "100px",
        height: isExpanded ? "260px" : "60px",
      }}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
      aria-label="Weather information"
    >
      {isExpanded ? (
        <div>
          <div className="text-2xl font-mono mb-2">{weatherIcon}</div>
          <p className="text-black text-base font-mono font-bold mb-1">
            {weather.temperature.toFixed(1)}°C
          </p>
          <p className="text-gray-800 text-xs font-mono mb-4">
            {weatherDescription}
          </p>
          <p className="text-gray-600 text-xs font-mono">
            Wind: {weather.windspeed.toFixed(1)} km/h
          </p>
          {weather.windgusts_10m !== undefined &&
            weather.windgusts_10m !== null && (
              <p className="text-gray-600 text-xs font-mono">
                Gusts: {weather.windgusts_10m.toFixed(1)} km/h
              </p>
            )}
          {weather.apparent_temperature !== undefined &&
            weather.apparent_temperature !== null && (
              <p className="text-gray-600 text-xs font-mono">
                Feels like: {weather.apparent_temperature.toFixed(1)}°C
              </p>
            )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-xl font-mono">{weatherIcon}</span>
          <span className="text-black text-base font-mono font-bold">
            {weather.temperature.toFixed(1)}°C
          </span>
        </div>
      )}
    </div>
  );
};

export default WeatherUI;
