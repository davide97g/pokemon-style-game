import { useEffect, useState } from "react";
import {
  fetchWeatherData,
  formatTime,
  getWeatherIcon,
  WEATHER_CODE_MAP,
  type WeatherData,
} from "../utils/weather";

const WEATHER_UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;

    const updateWeather = async () => {
      if (!navigator.geolocation) {
        setError("Geolocation not supported");
        setLoading(false);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          const data = await fetchWeatherData(lat, lon);

          if (data) {
            setWeather(data);
            setError(null);
          } else {
            setError("Failed to fetch weather");
          }
          setLoading(false);
        },
        (err) => {
          let errorMessage = "Unable to get location";
          if (err.code === 1) errorMessage = "Location access denied";
          else if (err.code === 2) errorMessage = "Location unavailable";
          else if (err.code === 3) errorMessage = "Location request timed out";

          setError(errorMessage);
          setLoading(false);
        },
      );
    };

    updateWeather();
    intervalId = setInterval(updateWeather, WEATHER_UPDATE_INTERVAL);

    return () => clearInterval(intervalId);
  }, []);

  if (loading) return null;

  if (error) {
    return (
      <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-red-200 max-w-[200px]">
        <p className="text-xs text-red-500 text-center">{error}</p>
      </div>
    );
  }

  if (!weather) return null;

  return (
    <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm p-4 rounded-lg shadow-lg border border-gray-200 min-w-[200px] pointer-events-auto">
      <div className="flex items-start justify-between mb-2">
        <div className="text-4xl mr-3">
          {getWeatherIcon(weather.weathercode)}
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-gray-900">
            {weather.temperature.toFixed(1)}°C
          </div>
          <div className="text-xs text-gray-500">
            Updated: {formatTime(weather.time)}
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-sm font-medium text-gray-700">
          {WEATHER_CODE_MAP[weather.weathercode] || "Unknown"}
        </p>
        <p className="text-xs text-gray-500">
          Wind: {weather.windspeed.toFixed(1)} km/h
        </p>
      </div>
    </div>
  );
}
