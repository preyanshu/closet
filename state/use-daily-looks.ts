import type { Item, Outfit } from "@/data/mock";
import { WardrobeApiError } from "@/services/api/wardrobe-api";
import { triageWardrobeDiff, type WardrobeDiff } from "@/services/decision";
import { composeOutfitsAI, generateOutfitsForToday, type OutfitContext } from "@/services/outfit-engine";
import { PREFERENCE_KEYS, readPreferenceValue, writePreference } from "@/services/storage/wardrobe-repository";
import { useCloset } from "@/state/closet-context";
import { useEffect, useMemo, useRef, useState } from "react";

type LooksStatus = "loading" | "ready" | "error";

export type DailyLooks = {
  looks: Outfit[];
  status: LooksStatus;
  error?: string;
  refreshedAt?: string;
  fromCache: boolean;
};

/** Debounce for wardrobe-mutation triage (batch rapid scans/imports). */
const TRIAGE_DEBOUNCE_MS = 45_000;

function toDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Cheap signature of the wardrobe so a stale daily cache is regenerated. */
function wardrobeHash(items: Item[]): string {
  let hash = 5381;
  for (const item of [...items].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const char of `${item.id}:${item.revision};`) {
      hash = ((hash << 5) + hash + char.charCodeAt(0)) >>> 0;
    }
  }
  return hash.toString(36);
}

type CachedBatch = {
  dateKey: string;
  itemHash: string;
  looks: Outfit[];
  generatedAt: string;
  isFallback?: boolean;
};

function parseCached(value: string | null): CachedBatch | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as CachedBatch;
    if (parsed && Array.isArray(parsed.looks)) return parsed;
  } catch {
    /* fall through */
  }
  return null;
}

/** Fields whose change affects styling; edits to anything else are cosmetic. */
const STYLE_RELEVANT_FIELDS: (keyof Item)[] = [
  "role", "category", "subcategory", "primaryColor", "secondaryColors",
  "pattern", "fit", "sleeveLength", "visibleTexture", "formality",
  "warmthBand", "styleTags", "lifecycleStatus", "availabilityStatus", "processingStatus",
];

type HardRuleResult = { regenerate: boolean; diff: WardrobeDiff | null };

/**
 * Hard-rule triage: regenerate without Clef when cached looks are provably
 * broken (item deleted/edited while referenced) or a bulk import landed.
 */
function hardRuleDiff(prev: Item[], next: Item[], looks: Outfit[]): HardRuleResult {
  const prevById = new Map(prev.map((item) => [item.id, item]));
  const nextById = new Map(next.map((item) => [item.id, item]));
  const lookItemIds = new Set(looks.flatMap((look) => look.itemIds));

  const deletedIds = prev.filter((item) => !nextById.has(item.id)).map((item) => item.id);
  const deletedInLooks = deletedIds.filter((id) => lookItemIds.has(id));
  if (deletedInLooks.length > 0) {
    return { regenerate: true, diff: { kind: "deleted", itemIds: deletedInLooks } };
  }

  const editedPairs: { item: Item; fields: string[] }[] = [];
  for (const item of next) {
    const old = prevById.get(item.id);
    if (!old) continue;
    const fields = STYLE_RELEVANT_FIELDS
      .filter((field) => JSON.stringify(old[field]) !== JSON.stringify(item[field]))
      .map(String);
    if (fields.length > 0) editedPairs.push({ item, fields });
  }
  const editedInLooks = editedPairs.filter((entry) => lookItemIds.has(entry.item.id));
  if (editedInLooks.length > 0) {
    return {
      regenerate: true,
      diff: { kind: "edited", items: editedInLooks.map((entry) => entry.item), changedFields: editedInLooks.map((entry) => entry.fields) },
    };
  }

  const added = next.filter((item) => !prevById.has(item.id));
  if (added.length >= 3) return { regenerate: true, diff: { kind: "added", items: added } };
  if (added.length > 0) return { regenerate: false, diff: { kind: "added", items: added } };
  if (deletedIds.length > 0) return { regenerate: false, diff: { kind: "deleted", itemIds: deletedIds } };
  if (editedPairs.length > 0) {
    return {
      regenerate: false,
      diff: { kind: "edited", items: editedPairs.map((entry) => entry.item), changedFields: editedPairs.map((entry) => entry.fields) },
    };
  }
  return { regenerate: false, diff: null };
}

/**
 * Daily, agent-native look generation with cache + wardrobe-change triage.
 * One agent session per day steady state: the batch is cached per date,
 * aesthetic, and count; wardrobe mutations are triaged (hard rules first,
 * then a Clef decision) so cosmetic changes do not burn a restyle session.
 * Explicit refresh always busts the cache. On AI failure the deterministic
 * engine covers the day with a retry banner.
 */
export function useDailyLooks(
  options: { aestheticId?: string; count?: number } = {},
): DailyLooks & { refresh: () => void } {
  const { items, isHydrated, favoriteIds, savedLooks } = useCloset();
  const aestheticId = options.aestheticId ?? "all";
  const count = options.count ?? 3;
  const [state, setState] = useState<DailyLooks>({ looks: [], status: "loading", fromCache: false });
  const [nonce, setNonce] = useState(0);
  const prevItemsRef = useRef<Item[] | null>(null);
  const lastHashRef = useRef<string | null>(null);

  const context = useMemo<OutfitContext>(
    () => ({ occasion: "everyday", styleTags: aestheticId === "all" ? [] : [aestheticId], count }),
    [aestheticId, count],
  );

  useEffect(() => {
    if (!isHydrated) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const dateKey = toDateKey();
    const cacheKey = `${PREFERENCE_KEYS.dailyLooks}:${dateKey}:${aestheticId}:${count}`;
    const hash = wardrobeHash(items);

    const persist = (looks: Outfit[], isFallback = false) => {
      void writePreference(cacheKey, JSON.stringify({ dateKey, itemHash: hash, looks, generatedAt: new Date().toISOString(), isFallback } satisfies CachedBatch));
    };

    const settleCache = (cached: CachedBatch) => {
      persist(cached.looks, cached.isFallback);
      setState({ looks: cached.looks, status: "ready", refreshedAt: cached.generatedAt, fromCache: true });
      prevItemsRef.current = items;
      lastHashRef.current = hash;
    };

    const generate = async (cached: CachedBatch | null) => {
      setState((prev) => ({ ...prev, status: "loading" }));
      try {
        const result = await composeOutfitsAI(context, items, {
          favoriteIds: [...favoriteIds],
          savedLooks,
        });
        persist(result.outfits);
        if (active) setState({ looks: result.outfits, status: "ready", refreshedAt: new Date().toISOString(), fromCache: false });
      } catch (error) {
        const message = error instanceof WardrobeApiError ? error.message : "Something went wrong while styling. Try again.";
        const fallback = cached && cached.looks.length > 0 ? cached.looks : generateOutfitsForToday(aestheticId, items);
        if (active) {
          setState({
            looks: fallback,
            status: fallback.length > 0 ? "ready" : "error",
            error: message,
            refreshedAt: new Date().toISOString(),
            fromCache: Boolean(cached),
          });
        }
        if (fallback.length > 0 && !cached) persist(fallback, true);
      }
      prevItemsRef.current = items;
      lastHashRef.current = hash;
    };

    const run = async () => {
      const cached = parseCached(await readPreferenceValue(cacheKey).catch(() => null));
      if (!active) return;

      // Fresh cache: show immediately (0 LLM calls).
      if (cached && cached.looks.length > 0 && cached.itemHash === hash && !cached.isFallback) {
        setState({ looks: cached.looks, status: "ready", refreshedAt: cached.generatedAt, fromCache: true });
        prevItemsRef.current = items;
        lastHashRef.current = hash;
        return;
      }

      const prev = prevItemsRef.current;

      // Wardrobe changed since the batch: triage before burning a session.
      if (cached && cached.looks.length > 0 && prev && prev !== items) {
        const hard = hardRuleDiff(prev, items, cached.looks);
        if (!hard.regenerate && hard.diff) {
          try {
            const verdict = await triageWardrobeDiff(hard.diff, cached.looks, items);
            if (!verdict.regenerate && active) {
              // KEEP: extend the cache to the new hash; looks stay valid.
              settleCache(cached);
              return;
            }
          } catch {
            /* triage unavailable: fall through and regenerate */
          }
        } else if (!hard.regenerate) {
          // Hash changed but nothing meaningful did; trust the cache.
          settleCache(cached);
          return;
        }
        if (!active) return;
        await generate(cached);
        return;
      }

      await generate(cached);
    };

    // Explicit refresh and first-load run immediately; mutation-driven
    // regeneration is debounced so rapid scans batch into one session.
    const isMutationDriven = nonce === 0 && lastHashRef.current !== null && lastHashRef.current !== hash;
    if (isMutationDriven) {
      timer = setTimeout(() => void run(), TRIAGE_DEBOUNCE_MS);
    } else {
      void run();
    }

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [isHydrated, items, context, nonce, aestheticId, count, favoriteIds, savedLooks]);

  const refresh = () => setNonce((value) => value + 1);
  return { ...state, refresh };
}
