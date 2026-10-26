import { clothingItems, type Item, type Outfit } from "@/data/mock";
import { WardrobeApiError } from "@/services/api/wardrobe-api";
import { runStylistAgent, critiqueOutfits, type RawStyleOutfit, type StylistWardrobe } from "@/services/stylist-agent";
import { judgeOccasionFit } from "@/services/decision";
import type { WeatherSummary } from "@/services/weather";
import type { ItemRole, OutfitItemRef } from "@/types/domain";

/** Upper bound on looks per batch. We never pad — fewer is fine. */
const MAX_OUTFITS = 5;

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
  /** Additional pieces that must appear in every composed outfit (multi-anchor). */
  includeItemIds?: string[];
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

function wantedIds(context: OutfitContext): string[] {
  const wanted = new Set<string>();
  if (context.anchorItemId) wanted.add(context.anchorItemId);
  for (const id of context.includeItemIds ?? []) wanted.add(id);
  return [...wanted];
}

function conflictsWith(items: Item[], item: Item): boolean {
  if (item.role === "one_piece") return items.some((entry) => entry.role === "base_top" || entry.role === "bottom");
  if (item.role === "base_top" || item.role === "bottom") return items.some((entry) => entry.role === "one_piece");
  return false;
}

function ensureIncluded(items: Item[], context: OutfitContext, pool: Item[]): Item[] {
  const wanted = wantedIds(context);
  if (wanted.length === 0) return items;

  for (const id of wanted) {
    if (items.some((item) => item.id === id)) continue;
    const anchor = pool.find((item) => item.id === id);
    if (!anchor || conflictsWith(items, anchor)) continue;

    const sameRoleIndex = items.findIndex((item) => item.role === anchor.role);
    if (sameRoleIndex >= 0) items[sameRoleIndex] = anchor;
    else items.push(anchor);
  }
  return items;
}

function buildBase(core: Item[], pool: Item[], context: OutfitContext): Item[] {
  const items = [...core];
  const shoe = pickBest(byRole(pool, "footwear"), context);
  if (shoe) items.push(shoe);
  items.push(...selectLayers(pool, context));
  items.push(...selectAccessories(pool, context));
  return orderItems(ensureIncluded(items, context, pool));
}

function buildCandidates(pool: Item[], context: OutfitContext): Item[][] {
  const tops = byRole(pool, "base_top");
  const bottoms = byRole(pool, "bottom");
  const onepieces = byRole(pool, "one_piece");
  const candidates: Item[][] = [];
  const seen = new Set<string>();
  const MAX = 60;

  const push = (items: Item[]) => {
    const signature = items.map((item) => item.id).join(",");
    if (seen.has(signature)) return;
    seen.add(signature);
    candidates.push(items);
  };

  for (const bottom of bottoms) {
    const topPicks = [...tops].sort((a, b) => itemScore(b, context) - itemScore(a, context)).slice(0, 3);
    for (const top of topPicks) {
      push(buildBase([top, bottom], pool, context));
      if (candidates.length >= MAX) break;
    }
    if (candidates.length >= MAX) break;
  }

  for (const onepiece of onepieces) {
    push(buildBase([onepiece], pool, context));
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

  const wanted = wantedIds(context);
  if (wanted.length > 0) {
    const missing = wanted.filter((id) => !items.some((item) => item.id === id));
    score += missing.length === 0 ? 4 : -1000 - missing.length;
  }

  return score;
}

function coreId(items: Item[]): string | undefined {
  return (items.find((item) => item.role === "bottom") ?? items.find((item) => item.role === "one_piece"))?.id;
}

const ACCESSORY_ROLES: ItemRole[] = ["bag", "belt", "hat", "eyewear", "scarf", "jewelry", "socks"];

function generateVariants(items: Item[], pool: Item[], context: OutfitContext): Item[][] {
  const variants: Item[][] = [];
  const used = new Set(items.filter((item) => ACCESSORY_ROLES.includes(item.role)).map((item) => item.id));
  const ranked = pool
    .filter((item) => ACCESSORY_ROLES.includes(item.role) && !used.has(item.id))
    .sort((a, b) => itemScore(b, context) - itemScore(a, context) || a.id.localeCompare(b.id));

  for (const alt of ranked.slice(0, 3)) {
    const next = [...items];
    const sameRoleIndex = next.findIndex((item) => item.role === alt.role);
    if (sameRoleIndex >= 0) next[sameRoleIndex] = alt;
    else {
      const bag = next.findIndex((item) => item.role === "bag");
      if (bag >= 0) next[bag] = alt;
      else next.push(alt);
    }
    variants.push(orderItems(next));
  }

  const bag = items.find((item) => item.role === "bag");
  if (bag) variants.push(items.filter((item) => item.id !== bag.id));

  const outer = items.find((item) => item.role === "outer_layer");
  if (outer) variants.push(items.filter((item) => item.id !== outer.id));

  if (!items.some((item) => item.role === "mid_layer")) {
    const mid = pickBest(byRole(pool, "mid_layer"), context);
    if (mid) variants.push(orderItems([...items, mid]));
  }

  return variants;
}

function fillWithAlternates(chosen: Candidate[], pool: Item[], context: OutfitContext, count: number): Candidate[] {
  while (chosen.length < count && chosen.length > 0) {
    let added = false;
    for (const candidate of chosen) {
      for (const alt of generateVariants(candidate.items, pool, context)) {
        const signature = alt.map((item) => item.id).join(",");
        if (chosen.some((entry) => entry.items.map((item) => item.id).join(",") === signature)) continue;
        chosen.push({ items: alt, score: outfitScore(alt, context) });
        added = true;
        if (chosen.length >= count) break;
      }
      if (chosen.length >= count) break;
    }
    if (!added) break;
  }
  return chosen;
}

function diversify(ranked: Candidate[], count: number, context: OutfitContext): Candidate[] {
  const wanted = wantedIds(context);
  const candidates = wanted.length > 0 ? ranked.filter((candidate) => wanted.every((id) => candidate.items.some((item) => item.id === id))) : ranked;
  const chosen: Candidate[] = [];
  const remaining = [...candidates];
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

  const chosen = diversify(candidates, count, context);
  if (chosen.length === 0) return [];
  fillWithAlternates(chosen, pool, context, count);
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

// ---------------------------------------------------------------------------
// LLM-native generation via the client-side stylist agent (MCP-style tool
// loop). The LLM explores the wardrobe through tools, composes raw outfits,
// and we validate/repair with the deterministic rules before presenting.
// ---------------------------------------------------------------------------

function aiToOutfit(items: Item[], style: RawStyleOutfit, context: OutfitContext, index: number): Outfit {
  const now = new Date().toISOString();
  const refs: OutfitItemRef[] = items.map((item) => ({ itemId: item.id, role: item.role, layerOrder: ROLE_ORDER[item.role] }));
  const id = `ai-${index + 1}-${hashKey(`${context.occasion ?? "everyday"}|${items.map((item) => item.id).sort().join(",")}`)}`;
  return {
    id,
    ownerId: "local-demo",
    label: style.label || "Styled look",
    source: "recommended",
    description: style.reason || describeOutfit(items, context, "fresh"),
    itemIds: items.map((item) => item.id),
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

/** Validate + repair agent output: cap pieces, drop conflicts, fill footwear. */
export function verifyAndRepairOutfits(raw: RawStyleOutfit[], wardrobe: Item[], context: OutfitContext): Outfit[] {
  const byId = new Map(wardrobe.map((item) => [item.id, item]));
  const result: Outfit[] = [];
  const seen = new Set<string>();
  const max = context.count ?? 3;

  for (const style of raw) {
    const seenIds = new Set<string>();
    const seenRoles = new Set<ItemRole>();
    const pieces = style.items
      .map((id) => byId.get(id))
      .filter((item): item is Item => Boolean(item))
      .filter((item) => {
        if (seenIds.has(item.id)) return false;
        seenIds.add(item.id);
        return true;
      })
      // One item per slot: drop duplicate roles (e.g. two pairs of shoes) and
      // keep the first the stylist chose.
      .filter((item) => {
        if (seenRoles.has(item.role)) return false;
        seenRoles.add(item.role);
        return true;
      });

    const onePiece = pieces.find((item) => item.role === "one_piece");
    const clean = onePiece
      ? pieces.filter((item) => item.role !== "base_top" && item.role !== "bottom")
      : pieces;

    const hasCore = clean.some((item) => item.role === "one_piece")
      || (clean.some((item) => item.role === "base_top") && clean.some((item) => item.role === "bottom"));
    if (!hasCore || clean.length === 0) continue;

    if (!clean.some((item) => item.role === "footwear")) {
      const shoe = pickBest(byRole(wardrobe, "footwear"), context);
      if (shoe && !clean.some((item) => item.id === shoe.id)) clean.push(shoe);
    }

    clean.sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.id.localeCompare(b.id));
    const finalPieces = clean.slice(0, 6);
    const signature = finalPieces.map((item) => item.id).join(",");
    if (seen.has(signature)) continue;
    seen.add(signature);

    result.push(aiToOutfit(finalPieces, style, context, result.length));
    if (result.length >= max) break;
  }

  return result;
}

export type ComposeAIResult = {
  outfits: Outfit[];
  reply?: string;
  turnsUsed?: number;
};

export type ComposeAIOptions = {
  /** Ids the user has hearted; biases the agent toward proven taste. */
  favoriteIds?: string[];
  /** Saved/manual outfits — the taste memory the agent riffs on. */
  savedLooks?: Outfit[];
  /** Free-text user request (chat lane / "dinner tonight"). */
  userRequest?: string;
  /** Override the system prompt (chat lane uses CHAT_SYSTEM). */
  system?: string;
  /** Prior messages for chat continuation. */
  history?: Array<{ role: string; content: string }>;
  /** Today's weather (already fetched) — the stylist styles to it. */
  weather?: WeatherSummary;
  /** Sampling temperature for the stylist model (default 0.8; higher = more creative). */
  temperature?: number;
  /**
   * Run a Jev-gated review pass: Jev judges whether the ensembles already read
   * for the occasion, and only a flagged look triggers a re-styling session.
   * Defaults to OFF in development and ON in production; override per call or
   * with EXPO_PUBLIC_STYLIST_SELF_CRITIQUE=0|1.
   */
  selfCritique?: boolean;
};

/** Dev builds skip the second call by default to conserve the AI quota. */
function resolveSelfCritique(explicit: boolean | undefined): boolean {
  if (explicit !== undefined) return explicit;
  const flag = process.env.EXPO_PUBLIC_STYLIST_SELF_CRITIQUE;
  if (flag === "1" || flag === "true") return true;
  if (flag === "0" || flag === "false") return false;
  return !((globalThis as { __DEV__?: boolean }).__DEV__ === true);
}

/**
 * Agent-native composition. Runs the client-side tool loop against the
 * wardrobe and validates/repairs the model's looks with deterministic rules.
 * Never pads: if the stylist returns one good look, we surface one.
 */
export async function composeOutfitsAI(
  context: OutfitContext = {},
  items: Item[] = clothingItems,
  options: ComposeAIOptions = {},
): Promise<ComposeAIResult> {
  const pool = items.filter(isEligible);
  if (pool.length < 6) throw new WardrobeApiError("Not enough wearable pieces to style a look.");

  // The model decides how many looks are actually good (up to 5); we never pad
  // toward a fixed target — one great look beats three mediocre ones.
  const season = context.season ?? options.weather?.seasonBand;
  const wardrobe: StylistWardrobe = {
    items,
    favoriteIds: new Set(options.favoriteIds ?? []),
    savedLooks: options.savedLooks ?? [],
  };

  const result = await runStylistAgent(
    {
      occasion: context.occasion,
      season,
      styleTags: context.styleTags,
      weather: options.weather,
      userRequest: options.userRequest,
    },
    wardrobe,
    { system: options.system, history: options.history, temperature: options.temperature },
  );

  let source = result.outfits;
  let reply = result.reply;
  let turnsUsed = result.turnsUsed;

  // Jev decides first (one ~40ms Clef call): if the ensembles already read for
  // the occasion, we skip the expensive re-styling session entirely. Only a
  // flagged look triggers the model review — with Jev's critique as feedback.
  if (resolveSelfCritique(options.selfCritique)) {
    try {
      const fit = await judgeOccasionFit(
        { occasion: context.occasion ?? "everyday", season, styleTags: context.styleTags, weather: options.weather },
        result.outfits.map((outfit) => ({ label: outfit.label, item_ids: outfit.items, reason: outfit.reason })),
        pool,
      );
      if (!fit.ok) {
        const reviewed = await critiqueOutfits(
          { occasion: context.occasion, season, styleTags: context.styleTags, weather: options.weather, count: MAX_OUTFITS },
          result.outfits,
          wardrobe,
          { feedback: fit.summary },
        );
        if (reviewed.outfits.length > 0) {
          source = reviewed.outfits;
          reply = reviewed.reply ?? reply;
          turnsUsed += reviewed.turnsUsed;
        }
      }
    } catch {
      // keep the stylist's original outfits
    }
  }

  const verified = verifyAndRepairOutfits(source, pool, { ...context, season, count: MAX_OUTFITS });
  if (verified.length === 0) throw new WardrobeApiError("The stylist returned no valid combos — try again.");

  // Quality over quantity: never substitute rules-engine looks. If the stylist
  // produced a single great outfit, we show a single great outfit.
  return { outfits: verified.slice(0, MAX_OUTFITS), reply, turnsUsed };
}
