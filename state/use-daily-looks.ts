import type { Item, Outfit } from "@/data/mock";
import { WardrobeApiError, errorMessage } from "@/services/api/wardrobe-api";
import { canComposeOutfit, composeOutfitsAI, isEligible, type OutfitContext, type OutfitSuggestion } from "@/services/outfit-engine";
import { composeFreshBatch } from "@/services/daily-batch";
import { blockedLooks, dislikeLook, loadLookMemory, lookKey, rememberLooks, undislikeLook } from "@/services/look-memory";
import { sanitizeChatText } from "@/services/stylist-agent";
import { readPreferenceValue, writePreference } from "@/services/storage/wardrobe-repository";
import { useCloset } from "@/state/closet-context";
import { useWeather } from "@/state/use-weather";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";

type LooksStatus = "loading" | "ready" | "error";

export type DailyLooks = {
  /** The whole day's pool. Home chips filter this; they never trigger their own generation. */
  looks: Outfit[];
  status: LooksStatus;
  error?: string;
  /** Why the last run failed (unreachable, busy…), so the UI can pick a headline. */
  errorKind?: string;
  refreshedAt?: string;
  /** A restyle is running; the old looks stay visible. */
  refreshing: boolean;
  /** A vibe-specific top-up is running (null when none). */
  generatingVibe: string | null;
  /** Role-based hints when the wardrobe is too thin to style a full look. */
  suggestions: OutfitSuggestion[];
};

/** One pool for the whole closet per wearer presentation. */
const POOL_KEY = "daily_pool_v2";
/** How many looks the daily pool asks for: enough that each vibe usually has something. */
const POOL_SIZE = 6;
/** How many looks a vibe top-up asks for. */
const TOP_UP_SIZE = 3;
/** Wait this long after the closet changes so a burst of scans costs one run. */
const CLOSET_CHANGE_DEBOUNCE_MS = 2500;

type DailyPool = {
  /** Local day this pool was generated for. */
  dateKey: string;
  looks: Outfit[];
  suggestions?: OutfitSuggestion[];
  generatedAt: string;
  /** Ids of the wearable pieces the stylist could see. A new id means the pool is out of date. */
  closetIds: string[];
};

function toDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** In-memory copy of the pool per cache key, so a slow or failed DB read never triggers a new generation. */
const memoryPools = new Map<string, DailyPool>();

/** Strip raw item ids and other scaffolding from text the card shows. */
function cleanLook(look: Outfit): Outfit {
  const label = sanitizeChatText(look.label ?? "");
  const description = sanitizeChatText(look.description ?? "");
  return { ...look, label: label || "Styled look", description: description.length >= 8 ? description : "" };
}

/** A shown look needs at least two pieces still in the current wardrobe. */
function usableLooks(looks: Outfit[], items: Item[]): Outfit[] {
  const ids = new Set(items.map((item) => item.id));
  return looks.filter((look) => look.itemIds.filter((id) => ids.has(id)).length >= 2);
}

function parsePool(value: string | null): DailyPool | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as DailyPool;
    if (parsed && Array.isArray(parsed.looks) && Array.isArray(parsed.closetIds) && typeof parsed.dateKey === "string") return parsed;
  } catch {
    /* fall through */
  }
  return null;
}

/**
 * The daily pool of looks.
 *
 * - One AI generation per day for the whole closet. Chips on Home filter this
 *   pool by the vibes the stylist labelled each look with; they never generate.
 * - The stored pool shows immediately on every open. A new run starts quietly in
 *   the background when the day changes or when pieces were added since the pool
 *   was made (debounced, so scanning several items costs one run). Removing or
 *   laundering pieces never regenerates; looks that lose pieces just disappear.
 * - ↻ (`refresh()`) forces a restyle; old looks stay visible meanwhile.
 * - `generateFor(vibe)` tops the pool up with looks of one vibe, on request.
 * - On AI failure we keep the old looks and stay quiet; with no looks at all we
 *   surface the error. We never substitute rules-engine output.
 */
export function useDailyLooks(): DailyLooks & {
  refresh: () => void;
  generateFor: (vibe: string) => void;
  toggleDislike: (look: Outfit) => void;
  isDisliked: (look: Outfit) => boolean;
} {
  const { items, isHydrated, favoriteIds, savedLooks, myLooks, profile } = useCloset();
  const { weather, status: weatherStatus } = useWeather();
  const presentation = profile.presentation;
  const cacheKey = `${POOL_KEY}:${presentation ?? "unspecified"}`;

  const [state, setState] = useState<DailyLooks>({ looks: [], status: "loading", refreshing: false, generatingVibe: null, suggestions: [] });
  const [nonce, setNonce] = useState(0);
  const [foregroundTick, setForegroundTick] = useState(0);
  const [dislikedKeys, setDislikedKeys] = useState<Set<string>>(new Set());

  const mountedRef = useRef(true);
  const consumedNonceRef = useRef(0);
  const generatingRef = useRef(false);
  /** The closet changed while a run was in flight; run again once it ends. */
  const rerunRef = useRef(false);
  const readRetriedRef = useRef(false);

  // Everything a run reads is kept in a ref so the effect only reacts to real triggers.
  const latest = useRef({ items, favoriteIds, savedLooks, myLooks, weather, presentation });
  latest.current = { items, favoriteIds, savedLooks, myLooks, weather, presentation };

  const wearableIds = useMemo(() => items.filter(isEligible).map((item) => item.id).sort(), [items]);
  const closetKey = wearableIds.join("|");

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Restore which looks were already marked "not for me".
  useEffect(() => {
    let cancelled = false;
    void loadLookMemory().then((memory) => {
      if (!cancelled) setDislikedKeys(new Set(memory.filter((entry) => entry.status === "disliked").map((entry) => entry.key)));
    });
    return () => { cancelled = true; };
  }, [state.looks]);

  // A session may stay open past midnight: re-check the day when the app returns.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") setForegroundTick((value) => value + 1);
    });
    return () => subscription.remove();
  }, []);

  const generate = useCallback(async (cached: DailyPool | null, force: boolean) => {
    if (generatingRef.current) {
      rerunRef.current = true;
      return;
    }
    generatingRef.current = true;
    const { items: allItems, favoriteIds: favorites, savedLooks: saved, myLooks: mine, weather: todaysWeather, presentation: wearer } = latest.current;
    const closetIds = allItems.filter(isEligible).map((item) => item.id);
    const hasLooks = Boolean(cached?.looks.length);
    setState((prev) => (hasLooks
      ? { ...prev, refreshing: true, error: undefined, errorKind: undefined }
      : { ...prev, status: "loading", refreshing: force, error: undefined, errorKind: undefined }));
    try {
      const context: OutfitContext = { occasion: "everyday", styleTags: [], count: POOL_SIZE };
      // Never re-serve what the user already owns, recently saw, or rejected.
      const blocked = blockedLooks(await loadLookMemory(), [...saved, ...mine]);
      const { result, outfits } = await composeFreshBatch((userRequest) => composeOutfitsAI(context, allItems, {
        favoriteIds: [...favorites],
        savedLooks: saved,
        weather: todaysWeather ?? undefined,
        presentation: wearer,
        userRequest,
      }), blocked);
      void rememberLooks(outfits, "shown");
      const generatedAt = new Date().toISOString();
      const suggestions = result.suggestions ?? [];
      const pool: DailyPool = { dateKey: toDateKey(), looks: outfits, suggestions, generatedAt, closetIds };
      memoryPools.set(cacheKey, pool);
      void writePreference(cacheKey, JSON.stringify(pool));
      if (mountedRef.current) setState({ looks: outfits, status: "ready", refreshedAt: generatedAt, refreshing: false, generatingVibe: null, suggestions });
    } catch (error) {
      const fallback = cached?.looks ?? [];
      if (mountedRef.current) {
        setState({
          looks: fallback,
          status: fallback.length > 0 ? "ready" : "error",
          // Automatic background failures stay quiet (old looks remain); a manual restyle reports them.
          error: fallback.length > 0 && !force ? undefined : errorMessage(error, "Something went wrong while styling. Try again."),
          errorKind: error instanceof WardrobeApiError ? error.kind : undefined,
          refreshedAt: new Date().toISOString(),
          refreshing: false,
          generatingVibe: null,
          suggestions: fallback.length > 0 ? cached?.suggestions ?? [] : [],
        });
      }
    } finally {
      generatingRef.current = false;
      if (rerunRef.current && mountedRef.current) {
        rerunRef.current = false;
        setForegroundTick((value) => value + 1);
      }
    }
  }, [cacheKey]);

  useEffect(() => {
    if (!isHydrated) return;
    let cancelled = false;
    const force = nonce !== consumedNonceRef.current;
    const dateKey = toDateKey();

    const run = async () => {
      let raw: string | null = null;
      let readFailed = false;
      try {
        raw = await readPreferenceValue(cacheKey);
      } catch {
        readFailed = true;
      }
      const cached = parsePool(raw) ?? memoryPools.get(cacheKey) ?? null;
      if (cancelled || !mountedRef.current) return;

      // A failed read is not "no cache". Never spend a model call because the
      // database was briefly busy; retry the read once.
      if (readFailed && !cached) {
        if (!readRetriedRef.current) {
          readRetriedRef.current = true;
          setTimeout(() => { if (mountedRef.current) setForegroundTick((value) => value + 1); }, 1500);
        }
        return;
      }

      const current = latest.current.items;
      const canStyle = canComposeOutfit(current);

      if (cached && !generatingRef.current) {
        setState((prev) => ({ looks: cached.looks, status: "ready", refreshedAt: cached.generatedAt, refreshing: prev.refreshing, generatingVibe: prev.generatingVibe, suggestions: cached.suggestions ?? [] }));
      }

      const known = new Set(cached?.closetIds ?? []);
      const addedPieces = current.filter(isEligible).some((item) => !known.has(item.id));
      // A pool that holds no looks is out of date as soon as the closet can style.
      const emptyButReady = Boolean(cached) && cached!.looks.length === 0 && canStyle;
      const stale = !cached || cached.dateKey !== dateKey || addedPieces || emptyButReady;
      if (!force && !stale) return;

      if (!canStyle) {
        // Nothing to style yet; the card on Home explains what to add.
        if (!generatingRef.current) setState((prev) => ({ ...prev, looks: cached?.looks ?? [], status: "ready", refreshing: false, suggestions: cached?.suggestions ?? prev.suggestions }));
        if (!force) return;
      }

      // The first styling of the day needs today's weather; wait for it to settle.
      if (weatherStatus === "idle" || weatherStatus === "loading") return;

      // A burst of scans costs one run: only closet-driven runs wait.
      const closetDriven = !force && cached?.dateKey === dateKey && (addedPieces || emptyButReady);
      if (closetDriven) await new Promise((resolve) => setTimeout(resolve, CLOSET_CHANGE_DEBOUNCE_MS));
      if (cancelled || !mountedRef.current) return;

      if (force) consumedNonceRef.current = nonce;
      if (__DEV__) console.log(`[daily-looks] generating for ${dateKey}: ${force ? "manual refresh" : !cached ? "no pool yet" : cached.dateKey !== dateKey ? "new day" : "closet changed"}`);
      await generate(cached, force);
    };

    void run();
    return () => { cancelled = true; };
  }, [isHydrated, closetKey, presentation, weatherStatus, nonce, foregroundTick, cacheKey, generate]);

  /** Top the pool up with looks for one vibe. They join the same pool, labelled with that vibe. */
  const generateFor = useCallback(async (vibe: string) => {
    if (generatingRef.current) return;
    generatingRef.current = true;
    setState((prev) => ({ ...prev, generatingVibe: vibe, error: undefined, errorKind: undefined }));
    const { items: allItems, favoriteIds: favorites, savedLooks: saved, myLooks: mine, weather: todaysWeather, presentation: wearer } = latest.current;
    try {
      const pool = memoryPools.get(cacheKey) ?? parsePool(await readPreferenceValue(cacheKey));
      const existing = pool?.looks ?? [];
      const context: OutfitContext = { occasion: "everyday", styleTags: [vibe], count: TOP_UP_SIZE };
      // Don't repeat anything on screen, owned, or rejected.
      const blocked = blockedLooks(await loadLookMemory(), [...saved, ...mine, ...existing]);
      const { outfits } = await composeFreshBatch((userRequest) => composeOutfitsAI(context, allItems, {
        favoriteIds: [...favorites],
        savedLooks: saved,
        weather: todaysWeather ?? undefined,
        presentation: wearer,
        userRequest,
      }), blocked);
      void rememberLooks(outfits, "shown");
      // The user asked for this vibe, so these looks carry it.
      const tagged = outfits.map((look) => ({ ...look, metadata: { ...look.metadata, vibes: [...new Set([vibe, ...(look.metadata?.vibes ?? [])])].slice(0, 3) } }));
      const have = new Set(existing.map((look) => look.id));
      const merged = [...existing, ...tagged.filter((look) => !have.has(look.id))];
      const next: DailyPool = { dateKey: pool?.dateKey ?? toDateKey(), looks: merged, suggestions: pool?.suggestions, generatedAt: new Date().toISOString(), closetIds: pool?.closetIds ?? allItems.filter(isEligible).map((item) => item.id) };
      memoryPools.set(cacheKey, next);
      void writePreference(cacheKey, JSON.stringify(next));
      if (mountedRef.current) setState((prev) => ({ ...prev, looks: merged, status: "ready", generatingVibe: null }));
    } catch (error) {
      if (mountedRef.current) {
        setState((prev) => ({ ...prev, generatingVibe: null, error: errorMessage(error, "Something went wrong while styling. Try again."), errorKind: error instanceof WardrobeApiError ? error.kind : undefined }));
      }
    } finally {
      generatingRef.current = false;
    }
  }, [cacheKey]);

  const visibleLooks = useMemo(() => usableLooks(state.looks, items).map(cleanLook), [state.looks, items]);

  const refresh = () => setNonce((value) => value + 1);

  /**
   * "Not for me". The look stays on screen (dimmed) until the next batch, so a
   * mis-tap is reversible; the dislike itself is remembered permanently and
   * keeps it out of every future batch.
   */
  const toggleDislike = (look: Outfit) => {
    const key = lookKey(look.itemIds);
    const already = dislikedKeys.has(key);
    setDislikedKeys((prev) => {
      const next = new Set(prev);
      if (already) next.delete(key); else next.add(key);
      return next;
    });
    void (already ? undislikeLook(look) : dislikeLook(look));
  };
  const isDisliked = (look: Outfit) => dislikedKeys.has(lookKey(look.itemIds));

  return { ...state, looks: visibleLooks, refresh, generateFor: (vibe: string) => void generateFor(vibe), toggleDislike, isDisliked };
}
