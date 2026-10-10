import { clothingItems, type Item, type Outfit } from "@/data/mock";
import type { ItemRole, OutfitItemRef } from "@/types/domain";

/**
 * Rules-first outfit composition engine (PR4).
 *
 * Replaces the old "category + array offset" placeholder with a deterministic
 * engine that mirrors report §13: pick a context, filter eligible items, choose
 * a valid template, build a bounded candidate set, score, diversify, explain,
 * then present. No randomness, so recommendations are stable across renders and
 * can be saved by id.
 */

export type Occasion = "everyday" | "work" | "casual" | "dinner" | "evening" | "formal" | "travel";
export type SeasonBand = "warm" | "cool" | "cold";

export type OutfitContext = {
  occasion?: Occasion;
  season?: SeasonBand;
  /** Preferred style tags (aesthetic ids) to bias toward. */
  styleTags?: string[];
  /** Item the user explicitly wants to wear; guarantees inclusion. */
  anchorItemId?: string;
  count?: number;
};

type OutfitPersonality = "familiar" | "fresh" | "dressy" | "comfort" | "underused";

type Candidate = {
  items: Item[];
  score: number;
};

const ROLE_ORDER: Record<ItemRole, number> = {
  base_top: 1,
  one_piece: 1,
  bottom: 1,
  mid_layer: 2,
  outer_layer: 3,
  socks: 8,
  footwear: 9,
  belt: 10,
  bag: 10,
  hat: 10,
  eyewear: 10,
  jewelry: 10,
  scarf: 10,
  other: 10,
};

const NEUTRALS = new Set(["black", "white", "cream", "ivory", "gray", "grey", "charcoal", "navy", "camel", "brown", "beige", "tan"]);

const FORMALITY_BY_OCCASION: Record<Occasion, string[]> = {
  everyday: ["casual", "smart-casual"],
  work: ["smart-casual", "formal"],
  casual: ["casual"],
  dinner: ["smart-casual", "formal"],
  evening: ["formal", "smart-casual"],
  formal: ["formal"],
  travel: ["casual", "smart-casual"],
};

const WARMTH_BY_SEASON: Record<SeasonBand, "light" | "medium" | "heavy"> = {
  warm: "light",
  cool: "medium",
  cold: "heavy",
};

const WARMTH_DISTANCE: Record<string, Record<string, number>> = {
  light: { light: 0, medium: 1, heavy: 2 },
  medium: { light: 1, medium: 0, heavy: 1 },
  heavy: { light: 2, medium: 1, heavy: 0 },
};

const OCCASION_LABEL: Record<Occasion, string> = {
  everyday: "Every day",
  work: "Work",
  casual: "Casual",
  dinner: "Dinner",
  evening: "Evening",
  formal: "Formal",
  travel: "Travel",
};

const OCCASION_TAG: Record<Occasion, string> = {
  everyday: "Casual",
  work: "Office",
  casual: "Casual",
  dinner: "Evening",
  evening: "Evening",
  formal: "Evening",
  travel: "Travel",
};

const PERSONALITY_LABEL: Record<OutfitPersonality, string> = {
  familiar: "Go-to",
  fresh: "Fresh mix",
  dressy: "Dressier",
  comfort: "Comfortable",
  underused: "Underused gem",
};

const SINGLE_ACCESSORY_ROLES: ItemRole[] = ["bag", "belt", "hat", "eyewear", "scarf"];

export function isEligible(item: Item): boolean {
  return item.lifecycleStatus === "owned" && item.availabilityStatus === "available" && item.processingStatus !== "failed";
}

function byRole(items: Item[], role: ItemRole): Item[] {
  return items.filter((item) => item.role === role).sort((a, b) => a.id.localeCompare(b.id));
}

function isNeutral(color: string): boolean {
  return NEUTRALS.has((color ?? "").toLowerCase());
}

function formatTag(value: string): string {
  return value.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function itemScore(item: Item, context: OutfitContext): number {
  let score = 0;
  const prefs = context.styleTags ?? [];
  if (prefs.length > 0 && item.styleTags.some((tag) => prefs.includes(tag))) score += 3;

  const target = FORMALITY_BY_OCCASION[context.occasion ?? "everyday"];
  if (item.formality && target.includes(item.formality)) score += 2.5;

  if (context.season) {
    const targetWarmth = WARMTH_BY_SEASON[context.season];
    const distance = item.warmthBand ? WARMTH_DISTANCE[item.warmthBand][targetWarmth] : 0;
    if (distance === 0) score += 1.5;
    else if (distance === 2) score -= 1.5;
  }

  score += Math.min(item.wearCount, 10) * 0.12;
  if (isNeutral(item.primaryColor)) score += 0.5;
  if (context.anchorItemId && item.id === context.anchorItemId) score += 6;
  return score;
}

function pickBest(candidates: Item[], context: OutfitContext): Item | undefined {
  let best: Item | undefined;
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    const score = itemScore(candidate, context);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

function orderItems(items: Item[]): Item[] {
  const seen = new Set<string>();
  return [...items]
    .filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)))
    .sort((a, b) => (ROLE_ORDER[a.role] - ROLE_ORDER[b.role]) || a.id.localeCompare(b.id));
}

function selectLayers(pool: Item[], context: OutfitContext): Item[] {
  const cold = context.season === "cold";
  const cool = context.season === "cool";
  const dressy = context.occasion === "work" || context.occasion === "formal" || context.occasion === "evening" || context.occasion === "dinner";
  const layers: Item[] = [];

  if ((cool || cold) && !dressy) {
    const mid = pickBest(byRole(pool, "mid_layer"), context);
    if (mid) layers.push(mid);
  }
  if (cold || dressy) {
    const outer = pickBest(byRole(pool, "outer_layer"), context);
    if (outer) layers.push(outer);
  }
  return layers;
}

function selectAccessories(pool: Item[], context: OutfitContext): Item[] {
  const dressy = context.occasion === "work" || context.occasion === "formal" || context.occasion === "evening" || context.occasion === "dinner";
  const accessories: Item[] = [];

  for (const role of SINGLE_ACCESSORY_ROLES) {
    if (accessories.length >= 1 && !dressy) break;
    const pick = pickBest(byRole(pool, role), context);
    if (pick) accessories.push(pick);
  }
  if (dressy) {
    const jewelry = pickBest(byRole(pool, "jewelry"), context);
    if (jewelry) accessories.push(jewelry);
  }
  return accessories;
}

function ensureAnchor(items: Item[], context: OutfitContext, pool: Item[]): Item[] {
  if (!context.anchorItemId || items.some((item) => item.id === context.anchorItemId)) return items;
  const anchor = pool.find((item) => item.id === context.anchorItemId);
  if (!anchor) return items;

  const sameRoleIndex = items.findIndex((item) => item.role === anchor.role);
  if (sameRoleIndex >= 0) {
    const next = [...items];
    next[sameRoleIndex] = anchor;
    return next;
  }
  return [...items, anchor];
}

function buildBase(core: Item[], pool: Item[], context: OutfitContext): Item[] {
  const items = [...core];
  const shoe = pickBest(byRole(pool, "footwear"), context);
  if (shoe) items.push(shoe);
  items.push(...selectLayers(pool, context));
  items.push(...selectAccessories(pool, context));
  return orderItems(ensureAnchor(items, context, pool));
}

function buildCandidates(pool: Item[], context: OutfitContext): Item[][] {
  const tops = byRole(pool, "base_top");
  const bottoms = byRole(pool, "bottom");
  const onepieces = byRole(pool, "one_piece");
  const candidates: Item[][] = [];
  const MAX = 60;

  for (const bottom of bottoms) {
    const topPicks = [...tops].sort((a, b) => itemScore(b, context) - itemScore(a, context)).slice(0, 3);
    for (const top of topPicks) {
      candidates.push(buildBase([top, bottom], pool, context));
      if (candidates.length >= MAX) break;
    }
    if (candidates.length >= MAX) break;
  }

  for (const onepiece of onepieces) {
    candidates.push(buildBase([onepiece], pool, context));
    if (candidates.length >= MAX) break;
  }

  return candidates;
}

function outfitScore(items: Item[], context: OutfitContext): number {
  let score = items.reduce((total, item) => total + itemScore(item, context), 0);

  const cores = items.filter((item) => item.role === "base_top" || item.role === "bottom" || item.role === "one_piece");
  const nonNeutral = new Set(cores.map((item) => item.primaryColor.toLowerCase()).filter((color) => !isNeutral(color)));
  if (nonNeutral.size === 0) score += 1.5;
  else if (nonNeutral.size === 1) score += 2;
  else if (nonNeutral.size === 2) score += 0.5;
  else score -= 1.5;

  const hasMid = items.some((item) => item.role === "mid_layer");
  const hasOuter = items.some((item) => item.role === "outer_layer");
  if (hasMid && hasOuter) score += 1;
  if (!hasMid && !hasOuter && context.season === "cold") score -= 1;

  if (context.anchorItemId) score += items.some((item) => item.id === context.anchorItemId) ? 4 : -1000;

  return score;
}

function coreId(items: Item[]): string | undefined {
  return (items.find((item) => item.role === "bottom") ?? items.find((item) => item.role === "one_piece"))?.id;
}

function diversify(ranked: Candidate[], count: number): Candidate[] {
  const chosen: Candidate[] = [];
  const remaining = [...ranked];
  const usedCore = new Set<string>();
  const usedTop = new Set<string>();

  while (chosen.length < count && remaining.length > 0) {
    let bestIndex = 0;
    let bestValue = -Infinity;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const core = coreId(candidate.items);
      const top = candidate.items.find((item) => item.role === "base_top")?.id;
      let value = candidate.score;
      if (core && usedCore.has(core)) value -= 100;
      if (top && usedTop.has(top)) value -= 20;
      if (value > bestValue) {
        bestValue = value;
        bestIndex = index;
      }
    }
    const [picked] = remaining.splice(bestIndex, 1);
    const core = coreId(picked.items);
    if (core) usedCore.add(core);
    const top = picked.items.find((item) => item.role === "base_top")?.id;
    if (top) usedTop.add(top);
    chosen.push(picked);
  }

  return chosen;
}

function personalityLabels(chosen: Candidate[]): OutfitPersonality[] {
  const labels: OutfitPersonality[] = chosen.map(() => "fresh");
  if (chosen.length === 0) return labels;
  labels[0] = "familiar";

  const formalityRank = (items: Item[]) => items.filter((item) => item.formality === "formal").length;
  const wearTotal = (items: Item[]) => items.reduce((total, item) => total + item.wearCount, 0);
  const comfortRank = (items: Item[]) => items.filter((item) => item.formality === "casual" || item.warmthBand === "light").length;

  const rest = chosen.map((_, index) => index).filter((index) => index !== 0);
  if (chosen.length === 2) {
    const index = rest[0];
    labels[index] = formalityRank(chosen[index].items) > formalityRank(chosen[0].items) ? "dressy" : "fresh";
    return labels;
  }

  const claim = (index: number, personality: OutfitPersonality) => {
    if (labels[index] === "fresh") labels[index] = personality;
  };
  const dressyIndex = rest.reduce((best, index) => (formalityRank(chosen[index].items) > formalityRank(chosen[best].items) ? index : best), rest[0]);
  const comfortIndex = rest.reduce((best, index) => (comfortRank(chosen[index].items) > comfortRank(chosen[best].items) ? index : best), rest[0]);
  const underusedIndex = rest.reduce((best, index) => (wearTotal(chosen[index].items) < wearTotal(chosen[best].items) ? index : best), rest[0]);
  claim(dressyIndex, "dressy");
  claim(comfortIndex, "comfort");
  claim(underusedIndex, "underused");
  return labels;
}

function describeOutfit(items: Item[], context: OutfitContext, personality: OutfitPersonality): string {
  const occasion = OCCASION_LABEL[context.occasion ?? "everyday"].toLowerCase();
  const hero = items.find((item) => item.role === "outer_layer")
    ?? items.find((item) => item.role === "one_piece")
    ?? items.find((item) => item.role === "bottom")
    ?? items[0];
  const heroName = hero?.name.toLowerCase() ?? "outfit";
  const styleWord = context.styleTags?.[0] ? formatTag(context.styleTags[0]).toLowerCase() : undefined;

  switch (personality) {
    case "familiar":
      return `A reliable ${occasion} pick — the ${heroName} does the heavy lifting.`;
    case "dressy":
      return `A sharper ${occasion} option, led by the ${heroName}.`;
    case "comfort":
      return `Comfort-first for ${occasion}, keeping the ${heroName} relaxed.`;
    case "underused":
      return `A fresh combination that gives the ${heroName} more time out.`;
    default:
      return styleWord ? `A ${styleWord} take for ${occasion}.` : `A fresh mix for ${occasion}.`;
  }
}

function outfitTags(items: Item[], context: OutfitContext): string[] {
  const tags = new Set<string>();
  tags.add(OCCASION_TAG[context.occasion ?? "everyday"]);
  if (context.season === "warm") tags.add("Summer");

  const frequency = new Map<string, number>();
  for (const item of items) {
    for (const tag of item.styleTags) frequency.set(tag, (frequency.get(tag) ?? 0) + 1);
  }
  [...frequency.entries()]
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, 2)
    .forEach(([tag]) => tags.add(formatTag(tag)));

  return [...tags].filter(Boolean).slice(0, 4);
}

function hashKey(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function toOutfit(items: Item[], context: OutfitContext, personality: OutfitPersonality, index: number): Outfit {
  const now = new Date().toISOString();
  const refs: OutfitItemRef[] = items.map((item) => ({ itemId: item.id, role: item.role, layerOrder: ROLE_ORDER[item.role] }));
  const itemIds = items.map((item) => item.id);
  const id = `rec-${index + 1}-${hashKey(`${context.occasion ?? "everyday"}|${[...itemIds].sort().join(",")}`)}`;

  return {
    id,
    ownerId: "local-demo",
    label: PERSONALITY_LABEL[personality],
    source: "recommended",
    description: describeOutfit(items, context, personality),
    itemIds,
    items: refs,
    aestheticId: context.styleTags?.[0] ?? "all",
    tags: outfitTags(items, context),
    metadata: {
      occasion: OCCASION_LABEL[context.occasion ?? "everyday"],
      season: context.season ? context.season : undefined,
    },
    createdAt: now,
    updatedAt: now,
  };
}

/** Compose up to `context.count` ranked, diversified outfits. Deterministic. */
export function composeOutfits(context: OutfitContext = {}, items: Item[] = clothingItems): Outfit[] {
  const count = Math.max(0, context.count ?? 2);
  const pool = items.filter(isEligible);
  if (pool.length === 0 || count === 0) return [];

  const candidates = buildCandidates(pool, context)
    .map((candidateItems) => ({ items: candidateItems, score: outfitScore(candidateItems, context) }))
    .sort((a, b) => b.score - a.score);

  const chosen = diversify(candidates, count);
  if (chosen.length === 0) return [];

  while (chosen.length < count) chosen.push({ ...chosen[0] });

  const personalities = personalityLabels(chosen);
  return chosen.map((candidate, index) => toOutfit(candidate.items, context, personalities[index], index));
}

/**
 * Backwards-compatible entry point used by the home / outfits / plan / calendar
 * screens. `aestheticId` is treated as a style-tag preference.
 */
export function generateOutfitsForToday(aestheticId = "all", sourceItems: Item[] = clothingItems): Outfit[] {
  const styleTags = aestheticId === "all" ? [] : [aestheticId];
  const filtered = styleTags.length > 0 ? sourceItems.filter((item) => item.styleTags.some((tag) => styleTags.includes(tag))) : sourceItems;
  const pool = filtered.length >= 6 ? filtered : sourceItems;
  return composeOutfits({ occasion: "everyday", styleTags, count: 2 }, pool);
}
