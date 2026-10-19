import { useCallback, useEffect, useState } from "react";
import * as Location from "expo-location";
import { fetchWeather, type WeatherSummary } from "@/services/weather";

/**
 * Device weather for styling. Requests foreground location once, resolves the
 * current conditions from Open-Meteo, and caches them for 30 minutes. Everything
 * fails soft: on permission denial or error the caller gets `null` and styles
 * without weather.
 */

const CACHE_MS = 30 * 60 * 1000;
/** Don't let the permission dialog / slow fix block the day's styling. */
const SETTLE_TIMEOUT_MS = 4000;

export type WeatherStatus = "idle" | "loading" | "ready" | "denied" | "error";

export function useWeather() {
  const [weather, setWeather] = useState<WeatherSummary | null>(null);
  const [status, setStatus] = useState<WeatherStatus>("idle");

  const refresh = useCallback(async (): Promise<WeatherSummary | null> => {
    setStatus("loading");
    const settle = (next: WeatherStatus) => setStatus((current) => (current === "loading" ? next : current));
    const timeout = setTimeout(() => settle("error"), SETTLE_TIMEOUT_MS);
    try {
      const { status: permission } = await Location.requestForegroundPermissionsAsync();
      if (permission !== "granted") {
        settle("denied");
        return null;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const summary = await fetchWeather(position.coords.latitude, position.coords.longitude);
      setWeather(summary);
      settle("ready");
      return summary;
    } catch {
      settle("error");
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    if (weather && Date.now() - weather.fetchedAt < CACHE_MS) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { weather, status, refresh };
}
