import type { Item, Outfit } from "@/data/mock";
import { WardrobeApiError } from "@/services/api/wardrobe-api";
import { composeOutfitsAI, type OutfitContext, type OutfitSuggestion } from "@/services/outfit-engine";
import { PREFERENCE_KEYS, readPreferenceValue, writePreference } from "@/services/storage/wardrobe-repository";
import { useCloset } from "@/state/closet-context";
import { useWeather } from "@/state/use-weather";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";

type LooksStatus = "loading" | "ready" | "error";

export type DailyLooks = {
  looks: Outfit[];
  status: LooksStatus;
  error?: string;
  refreshedAt?: string;
  fromCache: boolean;
  /** A user-initiated restyle is running; old looks stay visible. */
  refreshing: boolean;
  /** Role-based hints when the wardrobe is too thin to style a full look. */
  suggestions: OutfitSuggestion[];
};

function toDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type CachedBatch = {
  /** Local day this batch was generated for. */
  dateKey: string;
  looks: Outfit[];
  suggestions?: OutfitSuggestion[];
  generatedAt: string;
};

/** A shown look needs at least two pieces still in the current wardrobe. */
function usableLooks(looks: Outfit[], items: Item[]): Outfit[] {
  const ids = new Set(items.map((item) => item.id));
  return looks.filter((look) => look.itemIds.filter((id) => ids.has(id)).length >= 2);
}

function parseCached(value: string | null): CachedBatch | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as CachedBatch;
    if (parsed && Array.isArray(parsed.looks) && typeof parsed.dateKey === "string") return parsed;
  } catch {
    /* fall through */
  }
  return null;
}

/**
 * Daily, agent-native look generation with a stale-while-revalidate cache.
 *
 * - One generation per local day, per aesthetic/count/presentation.
 * - The stored batch is shown immediately on every open (no loading state).
 * - When the stored batch is from a previous day, a new run starts quietly in
 *   the background while the old looks stay on screen.
 * - Adding/editing wardrobe pieces does not regenerate today's looks; the next
 *   day's background run picks up the changes.
 * - Explicit ↻ (`refresh()`) forces a restyle; old looks stay visible.
 * - On AI failure we keep cached looks and stay silent; with no looks at all we
 *   surface the error. We never substitute rules-engine output.
 */
export function useDailyLooks(
  options: { aestheticId?: string; count?: number } = {},
): DailyLooks & { refresh: () => void } {
  const { items, isHydrated, favoriteIds, savedLooks, profile } = useCloset();
  const { weather, status: weatherStatus } = useWeather();
  const aestheticId = options.aestheticId ?? "all";
  const count = options.count ?? 3;
  const [state, setState] = useState<DailyLooks>({ looks: [], status: "loading", fromCache: false, refreshing: false, suggestions: [] });
  const [nonce, setNonce] = useState(0);
  const [foregroundTick, setForegroundTick] = useState(0);
  const consumedNonceRef = useRef(0);
  const generatingRef = useRef<string | null>(null);
  const shownKeyRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Re-check the day when the app comes back to the foreground (a session may
  // stay open past midnight); same-day returns early with zero calls.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") setForegroundTick((value) => value + 1);
    });
    return () => subscription.remove();
  }, []);

  const context = useMemo<OutfitContext>(
    () => ({ occasion: "everyday", styleTags: aestheticId === "all" ? [] : [aestheticId], count }),
    [aestheticId, count],
  );

  const presentation = profile.presentation;
  const cacheKey = `${PREFERENCE_KEYS.dailyLooks}:${aestheticId}:${count}:${presentation ?? "unspecified"}`;
  const visibleLooks = useMemo(() => usableLooks(state.looks, items), [state.looks, items]);

  useEffect(() => {
    if (!isHydrated) return;

    const dateKey = toDateKey();
    const runKeyBase = `${cacheKey}:${dateKey}`;
    const force = nonce !== consumedNonceRef.current;
    if (!force && shownKeyRef.current === runKeyBase) return;

    const runKey = `${runKeyBase}:${force ? nonce : "auto"}`;
    if (generatingRef.current === runKey) return;
    generatingRef.current = runKey;

    const show = (cached: CachedBatch, refreshing: boolean) => {
      setState({
        looks: cached.looks,
        status: "ready",
        refreshedAt: cached.generatedAt,
        fromCache: true,
        refreshing,
        suggestions: cached.suggestions ?? [],
      });
    };

    const generate = async (cached: CachedBatch | null) => {
      if (force) consumedNonceRef.current = nonce;
      if (cached?.looks.length) {
        setState((prev) => ({ ...prev, refreshing: force, error: undefined }));
      } else {
        setState((prev) => ({ ...prev, status: "loading", refreshing: force, error: undefined }));
      }
      try {
        const result = await composeOutfitsAI(context, items, {
          favoriteIds: [...favoriteIds],
          savedLooks,
          weather: weather ?? undefined,
          presentation,
        });
        const generatedAt = new Date().toISOString();
        const suggestions = result.suggestions ?? [];
        void writePreference(cacheKey, JSON.stringify({ dateKey, looks: result.outfits, suggestions, generatedAt } satisfies CachedBatch));
        if (mountedRef.current) {
          shownKeyRef.current = runKeyBase;
          setState({ looks: result.outfits, status: "ready", refreshedAt: generatedAt, fromCache: false, refreshing: false, suggestions });
        }
      } catch (error) {
        const message = error instanceof WardrobeApiError ? error.message : "Something went wrong while styling. Try again.";
        const fallback = cached?.looks ?? [];
        if (mountedRef.current) {
          setState({
            looks: fallback,
            status: fallback.length > 0 ? "ready" : "error",
            // Automatic background failures stay quiet (old looks remain);
            // a manual restyle still reports the failure.
            error: fallback.length > 0 && !force ? undefined : message,
            refreshedAt: new Date().toISOString(),
            fromCache: Boolean(cached),
            refreshing: false,
            suggestions: fallback.length > 0 ? cached?.suggestions ?? [] : [],
          });
        }
      } finally {
        if (generatingRef.current === runKey) generatingRef.current = null;
      }
    };

    const run = async () => {
      const cached = parseCached(await readPreferenceValue(cacheKey).catch(() => null));
      if (!mountedRef.current) {
        if (generatingRef.current === runKey) generatingRef.current = null;
        return;
      }

      // A cache whose pieces were deleted is not usable; ignore it rather than
      // rendering an empty "look". An empty batch is still valid (too few
      // pieces → suggestions), so only discard caches with stale looks.
      const cachedUsable = cached && (cached.looks.length === 0 || usableLooks(cached.looks, items).length > 0) ? cached : null;

      if (cachedUsable) {
        show(cachedUsable, force);
        if (cachedUsable.dateKey === dateKey && !force) {
          shownKeyRef.current = runKeyBase;
          generatingRef.current = null;
          return;
        }
        // Stale batch: keep it on screen and refresh quietly in the background,
        // once the weather lookup has settled (it styles the new day).
        if (weatherStatus === "idle" || weatherStatus === "loading") {
          generatingRef.current = null;
          return;
        }
      } else if (weatherStatus === "idle" || weatherStatus === "loading") {
        // First-ever batch needs today's weather; keep the loading card until
        // the soft weather timeout resolves (ready/denied/error all proceed).
        generatingRef.current = null;
        return;
      }

      await generate(cachedUsable);
    };

    void run();
  }, [isHydrated, items, favoriteIds, savedLooks, profile.presentation, weather, weatherStatus, context, cacheKey, presentation, nonce, foregroundTick]);

  const refresh = () => setNonce((value) => value + 1);
  return { ...state, looks: visibleLooks, refresh };
}
