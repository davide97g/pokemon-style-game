export interface WeatherData {
  temperature: number;
  windspeed: number;
  weathercode: number;
  time: string;
  daily?: {
    sunrise: string[];
    sunset: string[];
  };
}

export const WEATHER_CODE_MAP: Record<number, string> = {
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

export const getWeatherIcon = (weathercode: number): string => {
  if (weathercode === 0) return "☀️";
  if (weathercode <= 3) return "⛅";
  if (weathercode <= 48) return "🌫️";
  if (weathercode <= 67) return "🌧️";
  if (weathercode <= 86) return "❄️";
  return "⛈️";
};

export const formatTime = (timeString: string): string => {
  const date = new Date(timeString);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const fetchWeatherData = async (
  lat: number,
  lon: number,
): Promise<WeatherData | null> => {
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
};
