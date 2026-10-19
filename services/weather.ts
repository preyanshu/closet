/**
 * Weather for outfit styling. Uses Open-Meteo (no API key). This module is pure
 * (no native imports) so it can run in tests; the device-location lookup lives
 * in `state/use-weather.ts`. Weather fails soft — callers style without it when
 * location or network are unavailable.
 */

export type SeasonBand = "warm" | "cool" | "cold";

export type WeatherSummary = {
  tempC: number;
  feelsLikeC: number;
  condition: string;
  precipitationChance: number;
  windKph: number;
  seasonBand: SeasonBand;
  place?: string;
  fetchedAt: number;
};

export function seasonBandFor(feelsLikeC: number): SeasonBand {
  if (feelsLikeC >= 22) return "warm";
  if (feelsLikeC >= 10) return "cool";
  return "cold";
}

const WMO_CONDITIONS: Record<number, string> = {
  0: "clear",
  1: "mostly clear",
  2: "partly cloudy",
  3: "overcast",
  45: "fog",
  48: "freezing fog",
  51: "light drizzle",
  53: "drizzle",
  55: "heavy drizzle",
  61: "light rain",
  63: "rain",
  65: "heavy rain",
  66: "freezing rain",
  67: "freezing rain",
  71: "light snow",
  73: "snow",
  75: "heavy snow",
  77: "snow grains",
  80: "rain showers",
  81: "rain showers",
  82: "violent rain showers",
  85: "snow showers",
  86: "heavy snow showers",
  95: "thunderstorm",
  96: "thunderstorm with hail",
  99: "thunderstorm with hail",
};

export function describeCondition(code: number): string {
  return WMO_CONDITIONS[code] ?? "unknown";
}

/** One human line the stylist can reason over. */
export function describeWeather(weather: WeatherSummary): string {
  const place = weather.place ? `${weather.place}: ` : "";
  const rain = weather.precipitationChance > 0 ? `, ${Math.round(weather.precipitationChance)}% chance of precipitation` : "";
  const wind = weather.windKph >= 20 ? `, windy (${Math.round(weather.windKph)} km/h)` : "";
  return `${place}${Math.round(weather.tempC)}°C (feels like ${Math.round(weather.feelsLikeC)}°C), ${weather.condition}${rain}${wind}`;
}

export async function fetchWeather(latitude: number, longitude: number, place?: string): Promise<WeatherSummary> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m` +
    `&daily=precipitation_probability_max&forecast_days=1&timezone=auto`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Weather fetch failed (${response.status})`);
  const data = (await response.json()) as {
    current?: Record<string, number>;
    daily?: { precipitation_probability_max?: number[] };
  };
  const current = data.current ?? {};
  const tempC = Number(current.temperature_2m ?? 0);
  const feelsLikeC = Number(current.apparent_temperature ?? tempC);
  return {
    tempC,
    feelsLikeC,
    windKph: Number(current.wind_speed_10m ?? 0),
    condition: describeCondition(Number(current.weather_code ?? 0)),
    precipitationChance: Number(data.daily?.precipitation_probability_max?.[0] ?? 0),
    seasonBand: seasonBandFor(feelsLikeC),
    place,
    fetchedAt: Date.now(),
  };
}
