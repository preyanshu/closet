import type { Item, Outfit } from "@/data/mock";
import { describeWeather, type WeatherSummary } from "@/services/weather";
import type { WearerPresentation } from "@/types/domain";
import { runStyleTurn, runStyleTurnStream, WardrobeApiError } from "@/services/api/wardrobe-api";

function isEligible(item: Item): boolean {
  return item.lifecycleStatus === "owned" && item.availabilityStatus === "available" && item.processingStatus !== "failed";
}

/**
 * Client-side stylist agent (MCP-style). The phone is the tool host: the LLM
 * never sees the bulk closet — it requests slices via tools, and we execute
 * them locally against the wardrobe DB. Loop: ≤MAX_AGENT_TURNS (20) turns,
 * temp configured per lane, deterministic sorted tool results.
 */

export const MAX_AGENT_TURNS = 20;
/** Server caps a turn at 2000; qwen3's hidden reasoning needs the headroom. */
const AGENT_MAX_TOKENS = 2000;
export const SEARCH_PAGE_DEFAULT = 20;
export const SEARCH_PAGE_MAX = 40;
export const GET_ITEMS_MAX = 25;

const ROLE_RANK: Record<string, number> = {
  one_piece: 1, base_top: 2, bottom: 3, mid_layer: 4, outer_layer: 5,
  socks: 6, footwear: 7, belt: 8, bag: 9, hat: 10, eyewear: 11, jewelry: 12, scarf: 13, other: 14,
};

function roleRank(role: string): number {
  return ROLE_RANK[role] ?? 99;
}

function byRoleThenWearThenId(a: Item, b: Item): number {
  return roleRank(a.role) - roleRank(b.role) || b.wearCount - a.wearCount || a.id.localeCompare(b.id);
}

function costPerWear(item: Item): string {
  if (item.priceMinor == null || item.wearCount <= 0) return "-";
  return `$${((item.priceMinor / 100) / item.wearCount).toFixed(2)}`;
}

/** Full-fat line: everything we have about an item, for get_items / get_item. */
export function itemFullLine(item: Item, isFavorite: boolean): string {
  const secondary = item.secondaryColors.length ? ` +${item.secondaryColors.join("+")}` : "";
  return [
    item.id, item.name, `${item.category}/${item.subcategory ?? "-"}`, item.role,
    `${item.primaryColor}${secondary}`, item.pattern ?? "-", item.fit ?? "-",
    item.sleeveLength ?? "-", item.visibleTexture ?? "-", item.formality ?? "-",
    item.warmthBand ?? "-", item.styleTags.join("/") || "-",
    item.brand ?? "-", item.priceMinor != null ? `$${(item.priceMinor / 100).toFixed(0)}` : "-",
    `worn ${item.wearCount}x`, `cpw ${costPerWear(item)}`,
    `last ${item.lastWorn ?? "never"}`, item.availabilityStatus, isFavorite ? "fav" : "-",
  ].join(" | ");
}

/** Index line: medium detail for search_items pages. */
export function itemIndexLine(item: Item, isFavorite: boolean): string {
  const secondary = item.secondaryColors.length ? ` +${item.secondaryColors.join("+")}` : "";
  return [
    item.id, item.name, item.role, `${item.primaryColor}${secondary}`,
    item.formality ?? "-", item.warmthBand ?? "-", item.styleTags.join("/") || "-",
    `worn ${item.wearCount}x`, isFavorite ? "fav" : "-",
  ].join(" | ");
}

function sortItems(items: Item[]): Item[] {
  return [...items].sort(byRoleThenWearThenId);
}

type ToolWardrobe = {
  items: Item[];
  favoriteIds: Set<string>;
  savedLooks: Outfit[];
};

type ToolContext = {
  occasion?: string;
  season?: string;
  styleTags?: string[];
  weather?: WeatherSummary;
  /** Sourced from profile metadata; omitted when unspecified. */
  presentation?: WearerPresentation;
};

export type AgentToolName = "get_wardrobe_overview" | "search_items" | "get_items" | "get_saved_looks" | "get_item";

export const STYLIST_TOOLS: Array<Record<string, unknown>> = [
  {
    type: "function",
    function: {
      name: "get_wardrobe_overview",
      description: "High-level map of the closet: counts per role, palette histogram, style-tag histogram, favorites, most-worn, never-worn, availability summary. Call this first.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "search_items",
      description: "Paginated filtered search over the wardrobe. Returns medium-detail index lines plus total/page/has_more. Sort is deterministic (role order, then wear count, then id).",
      parameters: {
        type: "object",
        properties: {
          role: { type: "string", description: "Filter by role: base_top, bottom, one_piece, mid_layer, outer_layer, footwear, bag, belt, hat, eyewear, jewelry, socks, scarf" },
          category: { type: "string", description: "Filter by category: top, bottom, outerwear, shoes, accessory" },
          colors: { type: "array", items: { type: "string" }, description: "Match primary or secondary colors (case-insensitive)" },
          style_tags: { type: "array", items: { type: "string" } },
          formality: { type: "string", description: "casual | smart-casual | formal" },
          warmth: { type: "string", description: "light | medium | heavy" },
          query: { type: "string", description: "Free-text substring match on name" },
          favorites_only: { type: "boolean" },
          include_unavailable: { type: "boolean", description: "Default false — laundry/packed items are excluded" },
          page: { type: "integer", description: "1-based page number" },
          page_size: { type: "integer", description: "Default 20, max 40" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_items",
      description: "Batch drill-down: full-fat detail lines for up to 25 item ids you are considering.",
      parameters: {
        type: "object",
        properties: {
          ids: { type: "array", items: { type: "string" }, maxItems: GET_ITEMS_MAX },
        },
        required: ["ids"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_saved_looks",
      description: "Recent saved (hearted) and manual outfits with item ids and labels — the user's taste memory. Do not re-propose these exactly; riff on or improve them.",
      parameters: {
        type: "object",
        properties: { limit: { type: "integer", description: "Default 5, max 5" } },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_item",
      description: "Full detail for a single item id.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
  },
];

const SHOW_OUTFITS_TOOL: Record<string, unknown> = {
  type: "function",
  function: {
    name: "show_outfits",
    description: "Render outfit cards with images in the chat. Call this after writing your reply when you are showing looks, and only after you have seen the exact item ids in a wardrobe tool result.",
    parameters: {
      type: "object",
      properties: {
        looks: {
          type: "array",
          description: "1 to 5 complete looks",
          items: {
            type: "object",
            properties: {
              items: { type: "array", items: { type: "string" }, description: "Real item ids from tool results" },
              label: { type: "string", description: "Short look name" },
              reason: { type: "string", description: "One grounded sentence about the pieces in this look" },
            },
            required: ["items", "label", "reason"],
          },
        },
      },
      required: ["looks"],
    },
  },
};

export const CHAT_TOOLS: Array<Record<string, unknown>> = [...STYLIST_TOOLS, SHOW_OUTFITS_TOOL];

function buildOverview(wardrobe: ToolWardrobe): string {
  const pool = wardrobe.items.filter(isEligible);
  const byRoleCount: Record<string, number> = {};
  const palette: Record<string, number> = {};
  const tags: Record<string, number> = {};
  for (const item of pool) {
    byRoleCount[item.role] = (byRoleCount[item.role] ?? 0) + 1;
    palette[item.primaryColor] = (palette[item.primaryColor] ?? 0) + 1;
    for (const tag of item.styleTags) tags[tag] = (tags[tag] ?? 0) + 1;
  }
  const favorites = sortItems(pool.filter((item) => wardrobe.favoriteIds.has(item.id))).slice(0, 10);
  const mostWorn = [...pool].sort((a, b) => b.wearCount - a.wearCount).slice(0, 5);
  const neverWorn = pool.filter((item) => item.wearCount === 0);
  const unavailable = wardrobe.items.filter((item) => item.availabilityStatus !== "available");

  const hist = (record: Record<string, number>) =>
    Object.entries(record).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, v]) => `${k}:${v}`).join(", ");

  return [
    `total_items: ${pool.length} wearable (of ${wardrobe.items.length} owned)`,
    `roles: ${hist(byRoleCount)}`,
    `palette: ${hist(palette)}`,
    `style_tags: ${hist(tags)}`,
    favorites.length ? `favorites:\n${favorites.map((item) => itemIndexLine(item, true)).join("\n")}` : "favorites: none",
    `most_worn:\n${mostWorn.map((item) => `${item.name} (${item.wearCount}x)`).join(", ")}`,
    `never_worn: ${neverWorn.length} items (${neverWorn.slice(0, 10).map((item) => item.id).join(", ")}${neverWorn.length > 10 ? "…" : ""})`,
    unavailable.length ? `unavailable_avoid: ${unavailable.map((item) => `${item.id}(${item.availabilityStatus})`).join(", ")}` : "availability: all available",
  ].join("\n");
}

function runSearchTool(args: Record<string, unknown>, wardrobe: ToolWardrobe): string {
  let pool = wardrobe.items.filter(isEligible);
  const includeUnavailable = Boolean(args.include_unavailable);
  if (includeUnavailable) pool = wardrobe.items.filter((item) => item.lifecycleStatus === "owned");

  const role = typeof args.role === "string" ? args.role : null;
  const category = typeof args.category === "string" ? args.category : null;
  const colors = Array.isArray(args.colors) ? (args.colors as string[]).map((c) => c.toLowerCase()) : [];
  const styleTags = Array.isArray(args.style_tags) ? (args.style_tags as string[]) : [];
  const formality = typeof args.formality === "string" ? args.formality : null;
  const warmth = typeof args.warmth === "string" ? args.warmth : null;
  const query = typeof args.query === "string" ? args.query.toLowerCase() : null;
  const favoritesOnly = Boolean(args.favorites_only);

  const active = {
    warmth: Boolean(warmth),
    formality: Boolean(formality),
    style_tags: styleTags.length > 0,
    colors: colors.length > 0,
    category: Boolean(category),
    role: Boolean(role),
  };

  const matches = (item: Item, flags: typeof active): boolean => {
    if (flags.role && role && item.role !== role) return false;
    if (flags.category && category && item.category !== category) return false;
    if (flags.colors && colors.length > 0) {
      const itemColors = [item.primaryColor, ...item.secondaryColors].map((c) => c.toLowerCase());
      if (!colors.some((c) => itemColors.includes(c))) return false;
    }
    if (flags.style_tags && styleTags.length > 0 && !styleTags.some((tag) => item.styleTags.includes(tag))) return false;
    if (flags.formality && formality && item.formality !== formality) return false;
    if (flags.warmth && warmth && item.warmthBand !== warmth) return false;
    if (query && !item.name.toLowerCase().includes(query)) return false;
    if (favoritesOnly && !wardrobe.favoriteIds.has(item.id)) return false;
    return true;
  };

  const sortByRole = (items: Item[]) => sortItems(items);

  let filtered = sortByRole(pool.filter((item) => matches(item, active)));
  let dropped: string[] = [];

  // Over-filtered searches self-relax (deterministic priority) and return the
  // hits directly — one wasted turn here costs a whole agent session.
  if (filtered.length === 0 && !query && !favoritesOnly) {
    const order: Array<[keyof typeof active, string]> = [
      ["warmth", `warmth=${warmth}`],
      ["colors", `colors=${colors.join("/")}`],
      ["style_tags", `style_tags=${styleTags.join("/")}`],
      ["formality", `formality=${formality}`],
      ["category", `category=${category}`],
      ["role", `role=${role}`],
    ];
    for (const [flag, label] of order) {
      if (!active[flag]) continue;
      active[flag] = false;
      dropped.push(label);
      filtered = sortByRole(pool.filter((item) => matches(item, active)));
      if (filtered.length > 0) break;
    }
    if (filtered.length > 0) {
      const slice = filtered.slice(0, SEARCH_PAGE_DEFAULT);
      const lines = slice.map((item) => itemIndexLine(item, wardrobe.favoriteIds.has(item.id)));
      return `0 results with your filters; relaxed by dropping ${dropped.join(", ")} → total: ${filtered.length}\n${lines.join("\n")}`;
    }
    return "0 results even after relaxing every filter. Try a different role or query.";
  }

  const total = filtered.length;
  const page = Math.max(1, Math.floor(Number(args.page ?? 1)) || 1);
  const pageSize = Math.min(SEARCH_PAGE_MAX, Math.max(1, Math.floor(Number(args.page_size ?? SEARCH_PAGE_DEFAULT)) || SEARCH_PAGE_DEFAULT));
  const start = (page - 1) * pageSize;
  const slice = filtered.slice(start, start + pageSize);
  const hasMore = start + pageSize < total;

  if (total === 0) return "0 results. Broaden your filters.";
  const lines = slice.map((item) => itemIndexLine(item, wardrobe.favoriteIds.has(item.id)));
  return `total: ${total} | page: ${page}/${Math.ceil(total / pageSize)} | has_more: ${hasMore}\n${lines.join("\n")}`;
}

function runGetItems(args: Record<string, unknown>, wardrobe: ToolWardrobe): string {
  const ids = Array.isArray(args.ids) ? (args.ids as unknown[]).map(String).slice(0, GET_ITEMS_MAX) : [];
  if (ids.length === 0) return "No ids provided.";
  const lines = ids
    .map((id) => wardrobe.items.find((item) => item.id === id))
    .filter((item): item is Item => Boolean(item))
    .map((item) => itemFullLine(item, wardrobe.favoriteIds.has(item.id)));
  const missing = ids.filter((id) => !wardrobe.items.some((item) => item.id === id));
  return lines.length > 0
    ? `${lines.join("\n")}${missing.length ? `\nmissing_ids: ${missing.join(", ")}` : ""}`
    : `None of those ids exist. missing: ${ids.join(", ")}`;
}

function runGetSavedLooks(args: Record<string, unknown>, wardrobe: ToolWardrobe): string {
  const limit = Math.min(5, Math.max(1, Math.floor(Number(args.limit ?? 5)) || 5));
  if (wardrobe.savedLooks.length === 0) return "No saved looks yet.";
  return wardrobe.savedLooks
    .slice(0, limit)
    .map((look) => `${look.label} [${look.itemIds.join(", ")}] — ${look.description}`)
    .join("\n");
}

function runGetItem(args: Record<string, unknown>, wardrobe: ToolWardrobe): string {
  const id = typeof args.id === "string" ? args.id : "";
  const item = wardrobe.items.find((entry) => entry.id === id);
  return item ? itemFullLine(item, wardrobe.favoriteIds.has(item.id)) : `No item with id "${id}".`;
}

/**
 * llama-3.3 quirk: array argument values sometimes arrive JSON-encoded as
 * strings (colors: "[\"black\"]"). Revive before executing so filters work.
 */
function reviveArgValues(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args ?? {})) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
        try {
          out[key] = JSON.parse(trimmed);
          continue;
        } catch {}
      }
    }
    out[key] = value;
  }
  return out;
}

/** Execute a tool locally against the wardrobe. Deterministic. */
export function runTool(name: AgentToolName | string, rawArgs: Record<string, unknown>, wardrobe: ToolWardrobe): string {
  const args = reviveArgValues(rawArgs);
  switch (name) {
    case "get_wardrobe_overview": return buildOverview(wardrobe);
    case "search_items": return runSearchTool(args, wardrobe);
    case "get_items": return runGetItems(args, wardrobe);
    case "get_saved_looks": return runGetSavedLooks(args, wardrobe);
    case "get_item": return runGetItem(args, wardrobe);
    default: return `Unknown tool "${name}".`;
  }
}

function parseJsonPayload(text: string): { reply?: string; outfits?: Array<{ items?: string[]; label?: string; reason?: string }> } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  const braced = start >= 0 && end > start ? trimmed.slice(start, end + 1) : undefined;
  for (const candidate of [trimmed, fenced, braced]) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      /* try the next slice */
    }
  }
  return null;
}

function reviveItems(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      /* not a stringified array */
    }
  }
  return [];
}

/** Best-effort "reply" string from a malformed JSON envelope. */
function extractReplyLoose(text: string): string | undefined {
  const match = /"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text);
  if (!match) return undefined;
  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return match[1];
  }
}

/**
 * Salvage complete outfit objects from malformed JSON — models occasionally
 * close the last look with `]` instead of `}`. We scan balanced brace pairs
 * (string-aware) and keep every object that has an `items` array, so one bad
 * trailing look never discards the whole reply.
 */
function extractOutfitsLoose(text: string): { reply?: string; outfits: Array<{ items: string[]; label?: string; reason?: string }> } | null {
  const stack: number[] = [];
  const found = new Map<string, { items: string[]; label?: string; reason?: string }>();
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") stack.push(i);
    else if (ch === "}" && stack.length > 0) {
      const start = stack.pop() as number;
      const slice = text.slice(start, i + 1);
      try {
        const obj = JSON.parse(slice) as { items?: unknown; label?: unknown; reason?: unknown };
        const items = reviveItems(obj.items);
        if (items.length > 0 && !found.has(items.join(","))) {
          found.set(items.join(","), {
            items,
            label: typeof obj.label === "string" ? obj.label : undefined,
            reason: typeof obj.reason === "string" ? obj.reason : undefined,
          });
        }
      } catch {
        /* not a complete object */
      }
    }
  }
  if (found.size === 0) return null;
  return { reply: extractReplyLoose(text), outfits: [...found.values()] };
}

export type RawStyleOutfit = { items: string[]; label: string; reason: string };

export type StylistAgentResult = {
  outfits: RawStyleOutfit[];
  reply?: string;
  turnsUsed: number;
};

export const STYLIST_SYSTEM = `You are a personal stylist with a sharp, confident, creative eye. You have real taste and a point of view. You explore the user's wardrobe with your tools, then style complete looks from their real pieces.

PROCESS:
1. get_wardrobe_overview first, to orient yourself. The digest is only counts and a few favorites — it is NOT the pieces themselves.
2. Open the actual pieces with tools before you compose: search_items with no filters returns the full list (paginate if needed), then get_items on your shortlist for detail. Never compose from memory of the digest.
3. Use get_items on your shortlist for full detail before you commit.
4. Check get_saved_looks so you riff on taste they have already shown instead of repeating it.

JUDGMENT (this is styling, not a checklist):
- Style the whole picture: the occasion, the weather, the season, and their taste (favorites, saved looks, what they actually reach for).
- Compose only looks you genuinely believe are excellent. Real stylists are selective — never pad, never repeat a silhouette. Return your best 3 to 5 looks, and fewer if only a few are truly good.
- Occasion and weather live in the ensemble, not in any single item. A plain piece can be perfect in the right combination and a "dressy" piece can look wrong. Trust your eye, be creative, and surprise them sometimes.
- Decide for yourself what reads well — there are no formulas.

INTERFACE RULES (technical, always true):
- Use ONLY item ids returned by tools. Never invent an id.
- Each look: either exactly one "one_piece", OR one "base_top" AND one "bottom". Always include exactly one "footwear".
- One item per slot — never two bottoms, two tops, two pairs of shoes, or two of the same accessory. Layers and accessories are optional accents.
- 3 to 6 pieces per look.
- Do not use items the tools hide as unavailable.

When ready, reply with ONLY valid JSON (no prose, no fences):
{"reply":"One or two sentences of stylist reasoning for the user.","outfits":[{"items":["id","id"],"label":"Short label","reason":"One grounded sentence."}]}
The label and reason must describe only the pieces actually listed in that look's "items" — never name a garment you did not include. Ground every claim in attributes you actually saw.`;

function parseLooseJsonOutfits(text: string): Array<{ items: string[]; label: string; reason: string }> {
  const outfits: Array<{ items: string[]; label: string; reason: string }> = [];
  const blocks = text.matchAll(/"?items"?\s*:\s*\[([^\]]*)\]([\s\S]*?)(?="?items"?\s*:|$)/gi);
  for (const block of blocks) {
    const items = block[1]
      .split(/,\s*/)
      .map((id) => id.replace(/^[\s"'`\[]+|[\s"'`\]]+$/g, ""))
      .filter(Boolean);
    if (items.length === 0) continue;
    const label = /"?label"?\s*:\s*"?([^",}\n]+)/i.exec(block[2])?.[1]?.trim() ?? "Styled look";
    const reason = /"?reason"?\s*:\s*"?([^"}\n]+)/i.exec(block[2])?.[1]?.trim() ?? "";
    outfits.push({ items, label, reason });
  }
  return outfits;
}

function isOutfitLine(line: string): boolean {
  const parts = line.trim().replace(/^[-*•]\s*/, "").split("|").map((part) => part.trim());
  if (parts.length < 2) return false;
  const items = parts[0]
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(/,\s*/)
    .map((id) => id.replace(/^["'`\s]+|["'`\s]+$/g, ""))
    .filter(Boolean);
  return items.length >= 2 && items.some((id) => /^scan-/i.test(id));
}

function parseOutfitLines(text: string): Array<{ items: string[]; label: string; reason: string }> {
  const outfits: Array<{ items: string[]; label: string; reason: string }> = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim().replace(/^[-*•]\s*/, "");
    if (!line || line.startsWith("[") || line.startsWith("{")) continue;
    const parts = line.split("|").map((part) => part.trim());
    if (parts.length < 2) continue;
    const items = parts[0]
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .split(/,\s*/)
      .map((id) => id.replace(/^["'`\s]+|["'`\s]+$/g, ""))
      .filter(Boolean);
    if (items.length === 0) continue;
    outfits.push({ items, label: parts[1], reason: parts[2] ?? "" });
  }
  return outfits;
}

function cleanReply(value: string): string {
  return redactItemIds(value.replace(/\n{3,}/g, "\n\n"));
}

function parseChatPayload(text: string): { reply: string; outfits: Array<{ items?: string[]; label?: string; reason?: string }> } {
  const markerIndex = text.indexOf(OUTFIT_MARKER);
  if (markerIndex >= 0) {
    const reply = text.slice(0, markerIndex).trim();
    const tail = text.slice(markerIndex + OUTFIT_MARKER.length).trim();
    const parsed = parseJsonPayload(tail);
    let outfits: Array<{ items?: string[]; label?: string; reason?: string }> = Array.isArray(parsed)
      ? parsed
      : parsed && Array.isArray(parsed.outfits)
        ? parsed.outfits
        : [];
    if (outfits.length === 0) outfits = parseOutfitLines(tail);
    if (outfits.length === 0) outfits = parseLooseJsonOutfits(tail);
    return { reply: cleanReply(reply), outfits };
  }

  const parsed = parseJsonPayload(text);
  if (parsed && (typeof parsed.reply === "string" || Array.isArray(parsed.outfits))) {
    return { reply: cleanReply(typeof parsed.reply === "string" ? parsed.reply : ""), outfits: Array.isArray(parsed.outfits) ? parsed.outfits : [] };
  }

  if (!parsed) {
    const lines = text.split("\n");
    const lookLines = lines.filter(isOutfitLine);
    if (lookLines.length > 0) {
      return {
        reply: cleanReply(lines.filter((line) => !isOutfitLine(line)).join("\n")),
        outfits: parseOutfitLines(lookLines.join("\n")),
      };
    }
  }

  if (!parsed && text.trimStart().startsWith("{")) {
    const loose = extractOutfitsLoose(text);
    const looseReply = extractReplyLoose(text);
    if (loose || looseReply) return { reply: cleanReply(looseReply ?? ""), outfits: loose?.outfits ?? [] };
  }

  const prose = text.replace(/<(think|thinking)>[\s\S]*?<\/\1>/gi, "").trim() || text;
  return { reply: cleanReply(prose), outfits: [] };
}

export const CHAT_SYSTEM = `You are Alta, the user's personal stylist inside their wardrobe app. You are a genuinely helpful conversational assistant — equal parts stylist, closet expert, and friend with good taste. Talk naturally, answer the actual question, and explain your reasoning. Do not force outfit suggestions into every reply.

TOOLS (the phone is the tool host):
- You cannot see the closet until you ask for it. Use the tools whenever an answer depends on what the user actually owns: their pieces, colors, formality, warmth, what's clean or packed, favorites, past looks.
- get_wardrobe_overview for the map, search_items to find pieces, get_items / get_item for detail, get_saved_looks for their taste memory.
- show_outfits renders the actual outfit cards with images. It is the only way to show looks.
- Never invent an item, id, color, or attribute. Only state facts returned by tools.
- Simple greetings, thanks, or general style theory do not need tools; wardrobe-specific claims always do.

WHEN TO INCLUDE OUTFITS:
- When the user asks for outfit ideas, what to wear, or to style/swap a look, write a short natural reply, then call show_outfits with the complete structured looks.
- When they ask a question (does this go together, is this right for an occasion, what's missing, how to care for a piece, packing advice), just answer in your reply text and do not call show_outfits. Add cards only if they genuinely make the answer better.
- If they ask to adjust a previous look ("swap the shoes", "make it more casual"), revise that look using the conversation history.
- If the wardrobe genuinely cannot support the request, say what is missing and why instead of inventing a look.

STYLE JUDGMENT:
- Style the whole picture: occasion, weather, season, and their taste. Compose only looks you believe are excellent; 3 to 5 at most, fewer is fine.
- Each look: either one "one_piece", or one "base_top" and one "bottom". Always exactly one "footwear". 3 to 6 pieces. One item per slot. Layers and accessories are optional.
- Never use an item the tools hide as unavailable.

REPLY FORMAT:
- Write your reply as plain text exactly as it should appear in the chat: usually a short paragraph, simple dashes for lists, no markdown, no JSON, no fences.
- Never write item ids, look lines, JSON, or marker text in your reply. The app renders cards only from show_outfits.
- When showing looks, write the reply first, then call show_outfits with:
  looks: [{ items: ["real_id", "real_id"], label: "Short label", reason: "One grounded sentence." }]
- Before show_outfits, make sure you have seen the exact item ids in a tool result. If you have not, call search_items first. Never stall with "let me check" — search, then give the result.
- Use only ids returned by wardrobe tools. Never describe a card you did not send in show_outfits. The label and reason must describe only the pieces listed in that look.`;

function makeSeenIdsRecorder(wardrobe: ToolWardrobe, seenIds: Set<string>) {
  return (output: string) => {
    for (const item of wardrobe.items) {
      if (seenIds.has(item.id) || !output.includes(item.id)) continue;
      const escaped = item.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`(^|[^A-Za-z0-9_-])${escaped}([^A-Za-z0-9_-]|$)`).test(output)) seenIds.add(item.id);
    }
  };
}

/** Keep raw item ids out of anything the chat displays. */
function redactItemIds(value: string): string {
  return value
    .replace(/\bscan-[A-Za-z0-9-]+/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function normalizeOutfits(raw: unknown, seenIds: Set<string>): RawStyleOutfit[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry) => ({
      items: reviveItems(entry.items),
      label: redactItemIds(typeof entry.label === "string" ? entry.label.slice(0, 60) : "Styled look") || "Styled look",
      reason: redactItemIds(typeof entry.reason === "string" ? entry.reason.slice(0, 400) : ""),
    }))
    .filter((entry) => entry.items.length > 0 && entry.items.every((id) => seenIds.has(id)));
}

function buildChatUserMessage(context: ToolContext & { userRequest?: string; digest?: string }): string {
  const parts = [
    `<context>`,
    `occasion_hint: ${context.occasion ?? "unknown"}`,
    `season: ${context.weather?.seasonBand ?? context.season ?? "all seasons"}`,
    `style_tags: ${context.styleTags?.length ? context.styleTags.join(", ") : "none"}`,
    ...(context.presentation && context.presentation !== "unspecified"
      ? [`wearer_presentation: ${context.presentation} (style to suit this wearer)`]
      : []),
    `</context>`,
  ];
  if (context.weather) parts.push(`<weather>${describeWeather(context.weather)}</weather>`);
  if (context.digest) parts.push(`<wardrobe_digest>\n${context.digest}\n</wardrobe_digest>`);
  if (context.userRequest) parts.push(`<user_request>${context.userRequest}</user_request>`);
  parts.push("Answer the user. Use tools for anything that depends on their actual wardrobe. If you show outfits, write the reply first, then call show_outfits with structured looks. Never put item ids or look lines inside the reply text.");
  return parts.join("\n");
}

export type AgentProgressEvent =
  | { type: "thinking" }
  | { type: "tool_call"; name: string; label: string; detail?: string }
  | { type: "tool_result"; name: string; summary: string }
  | { type: "text_delta"; text: string };

export type StylistChatResult = {
  reply: string;
  outfits: RawStyleOutfit[];
  turnsUsed: number;
};

const OUTFIT_MARKER = "<<<OUTFITS>>>";

/**
 * Streams only the user-facing reply text. Handles the marker protocol
 * (reply text, then <<<OUTFITS>>> plus pipe-delimited looks) and the older
 * JSON envelope, so chat users never see scaffolding.
 */
function createReplyStream(onText: (text: string) => void) {
  let mode: "detect" | "json" | "prose" | "done" = "detect";
  let probe = "";
  let pending = "";
  let inReply = false;
  let escape: string | null = null;

  const emit = (text: string) => { if (text) onText(text); };

  const pushProse = (text: string) => {
    pending += text;
    const marker = pending.indexOf(OUTFIT_MARKER);
    if (marker >= 0) {
      const visible = pending.slice(0, marker);
      pending = "";
      mode = "done";
      emit(visible);
      return;
    }
    // Emit immediately; only hold back a suffix that could be the start of the
    // marker so a split marker never leaks into the bubble.
    let keep = 0;
    const max = Math.min(OUTFIT_MARKER.length - 1, pending.length);
    for (let size = max; size > 0; size -= 1) {
      if (pending.endsWith(OUTFIT_MARKER.slice(0, size))) { keep = size; break; }
    }
    const emitLength = pending.length - keep;
    if (emitLength > 0) {
      emit(pending.slice(0, emitLength));
      pending = pending.slice(emitLength);
    }
  };

  const consumeReply = (chunk: string) => {
    for (const ch of chunk) {
      if (escape !== null) {
        escape += ch;
        if (escape[0] === "u") {
          if (escape.length === 5) {
            const code = Number.parseInt(escape.slice(1), 16);
            if (Number.isFinite(code)) emit(String.fromCharCode(code));
            escape = null;
          }
        } else {
          const map: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" };
          emit(map[escape] ?? escape);
          escape = null;
        }
        continue;
      }
      if (ch === "\\") { escape = ""; continue; }
      if (ch === '"') { mode = "done"; return; }
      emit(ch);
    }
  };

  const consumeJson = (chunk: string) => {
    if (inReply) { consumeReply(chunk); return; }
    probe += chunk;
    const match = /"reply"\s*:\s*"/.exec(probe);
    if (match) {
      const rest = probe.slice(match.index + match[0].length);
      probe = "";
      inReply = true;
      consumeReply(rest);
    } else if (probe.length > 400) {
      probe = probe.slice(-400);
    }
  };

  return {
    push(chunk: string) {
      if (mode === "done" || !chunk) return;
      if (mode === "detect") {
        probe += chunk;
        const trimmed = probe.replace(/^\s+/, "");
        if (!trimmed) return;
        if (trimmed.startsWith("{")) {
          mode = "json";
          probe = "";
          consumeJson(trimmed);
        } else {
          mode = "prose";
          probe = "";
          pushProse(trimmed);
        }
        return;
      }
      if (mode === "prose") { pushProse(chunk); return; }
      consumeJson(chunk);
    },
    end() {
      if (mode === "detect" && probe) {
        emit(probe);
        probe = "";
      } else if (mode === "prose" && pending) {
        emit(pending);
        pending = "";
      }
    },
  };
}

/** Human-friendly labels for the chat activity feed. */
function toolDisplay(name: string, args: Record<string, unknown>): { label: string; detail?: string } {
  switch (name) {
    case "get_wardrobe_overview":
      return { label: "Reading your closet" };
    case "search_items": {
      const bits: string[] = [];
      if (typeof args.role === "string") bits.push(args.role.replace(/_/g, " "));
      if (typeof args.category === "string") bits.push(args.category);
      if (Array.isArray(args.colors)) bits.push(args.colors.join(", "));
      if (typeof args.query === "string" && args.query) bits.push(`"${args.query}"`);
      return { label: "Searching your wardrobe", detail: bits.join(" · ") || undefined };
    }
    case "get_items":
      return { label: "Opening pieces", detail: Array.isArray(args.ids) ? String(args.ids.length) : undefined };
    case "get_item":
      return { label: "Opening a piece" };
    case "get_saved_looks":
      return { label: "Checking your saved looks" };
    case "show_outfits":
      return { label: "Laying out looks" };
    default:
      return { label: name.replace(/_/g, " ") };
  }
}

function toolSummary(name: string, output: string): string {
  switch (name) {
    case "get_wardrobe_overview": {
      const match = /total_items:\s*(\d+)/.exec(output);
      return match ? `${match[1]} wearable pieces` : "Closet loaded";
    }
    case "search_items": {
      if (output.startsWith("0 results")) return "No matches";
      const match = /total:\s*(\d+)/.exec(output);
      return match ? `${match[1]} ${match[1] === "1" ? "match" : "matches"}` : "Search done";
    }
    case "get_items": {
      const count = output.split("\n").filter((line) => line && !line.startsWith("missing_ids:")).length;
      return `${count} ${count === 1 ? "piece" : "pieces"}`;
    }
    case "get_saved_looks":
      return output === "No saved looks yet." ? "No saved looks yet" : `${output.split("\n").length} saved looks`;
    case "get_item":
      return output.startsWith("No item") ? "Piece not found" : "Piece loaded";
    case "show_outfits":
      return output;
    default:
      return "Done";
  }
}

/**
 * Conversational agent lane: free-form answers, tools on demand, and outfits
 * only when the model decides they belong. Plain prose is a valid final answer.
 */
function extractShowOutfits(args: Record<string, unknown>): unknown[] {
  const raw = args.looks ?? args.outfits;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* malformed */
    }
  }
  return [];
}

/**
 * Conversational agent lane: free-form answers, tools on demand, and outfits
 * rendered through the show_outfits tool. Plain prose is a valid final answer.
 */
export async function runChatAgent(
  context: ToolContext & { userRequest?: string; includeDigest?: boolean },
  wardrobe: ToolWardrobe,
  options: { system?: string; history?: Array<{ role: string; content: string }>; temperature?: number; maxTurns?: number; onEvent?: (event: AgentProgressEvent) => void } = {},
): Promise<StylistChatResult> {
  const system = options.system ?? CHAT_SYSTEM;
  const digest = context.includeDigest !== false ? buildOverview(wardrobe) : undefined;
  const seed: Array<Record<string, unknown>> = [
    ...(options.history ?? []).map((entry) => ({ role: entry.role, content: entry.content })),
    { role: "user", content: buildChatUserMessage({ ...context, digest }) },
  ];
  const messages: Array<Record<string, unknown>> = [{ role: "system", content: system }, ...seed];
  const seenIds = new Set<string>();
  const allIds = new Set(wardrobe.items.map((item) => item.id));
  const recordOutput = makeSeenIdsRecorder(wardrobe, seenIds);
  for (const entry of seed) {
    if (typeof entry.content === "string") recordOutput(entry.content);
  }
  const maxTurns = options.maxTurns ?? MAX_AGENT_TURNS;
  const request = (context.userRequest ?? "").trim();
  const wantsOutfits = /\b(outfits?|what (?:should|to) (?:i )?wear|style me|put together|dress me|outfit ideas?|looks? (?:for|to wear))\b/i.test(request)
    || (request.split(/\s+/).filter(Boolean).length <= 4 && (context.occasion ?? "everyday") !== "everyday");
  let nudged = false;
  let lastReply = "";

  const onEvent = options.onEvent;
  const pause = () => (onEvent ? new Promise<void>((resolve) => { setTimeout(resolve, 240); }) : Promise.resolve());

  for (let turn = 0; turn < maxTurns; turn += 1) {
    onEvent?.({ type: "thinking" });
    let result: Awaited<ReturnType<typeof runStyleTurn>>;
    let streamed = false;
    if (onEvent) {
      const replyStream = createReplyStream((text) => onEvent({ type: "text_delta", text }));
      try {
        result = await runStyleTurnStream(messages, CHAT_TOOLS, AGENT_MAX_TOKENS, options.temperature ?? 0.8, (text) => {
          streamed = true;
          replyStream.push(text);
        });
        replyStream.end();
      } catch (error) {
        if (streamed) throw error;
        result = await runStyleTurn(messages, CHAT_TOOLS, AGENT_MAX_TOKENS, options.temperature ?? 0.8);
      }
    } else {
      result = await runStyleTurn(messages, CHAT_TOOLS, AGENT_MAX_TOKENS, options.temperature ?? 0.8);
    }

    if (result.tool_calls && result.tool_calls.length > 0) {
      const calls = result.tool_calls;
      const renderCalls = calls.filter((call) => call.name === "show_outfits");
      const wardrobeCalls = calls.filter((call) => call.name !== "show_outfits");
      const turnText = (result.text ?? "").trim();
      if (renderCalls.length > 0 && turnText) lastReply = turnText;

      messages.push({ role: "assistant", content: result.text ?? "", tool_calls: calls.map((call) => ({
        id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments) },
      })) });

      for (const call of wardrobeCalls) {
        onEvent?.({ type: "tool_call", name: call.name, ...toolDisplay(call.name, call.arguments) });
        await pause();
        const output = runTool(call.name, call.arguments, wardrobe);
        recordOutput(output);
        onEvent?.({ type: "tool_result", name: call.name, summary: toolSummary(call.name, output) });
        messages.push({ role: "tool", tool_call_id: call.id, content: output });
      }

      if (renderCalls.length === 0) continue;

      const rendered: RawStyleOutfit[] = [];
      for (const call of renderCalls) {
        const looks = normalizeOutfits(extractShowOutfits(call.arguments), allIds);
        onEvent?.({ type: "tool_call", name: "show_outfits", label: "Laying out looks" });
        await pause();
        const summary = looks.length > 0 ? `${looks.length} ${looks.length === 1 ? "look" : "looks"}` : "No cards rendered";
        messages.push({ role: "tool", tool_call_id: call.id, content: summary });
        onEvent?.({ type: "tool_result", name: "show_outfits", summary });
        rendered.push(...looks);
      }

      if (rendered.length > 0) {
        return { reply: turnText || lastReply, outfits: rendered, turnsUsed: turn + 1 };
      }

      if (!nudged) {
        nudged = true;
        messages.push({ role: "user", content: "show_outfits received missing or invalid item ids, so no cards were rendered. Call search_items for the exact ids, then write a short fresh reply and call show_outfits again with real ids from the results. Do not say you are still checking — give the final answer." });
      }
      continue;
    }

    const text = (result.text ?? "").trim();
    if (text) lastReply = text;
    if (!text) {
      if (!nudged) {
        nudged = true;
        messages.push({ role: "user", content: "Reply to the user now in plain text. If you are showing looks, write the reply first, then call show_outfits with structured looks." });
        continue;
      }
      throw new WardrobeApiError("The assistant returned no reply — try again.");
    }

    const payload = parseChatPayload(text);
    const reply = payload.reply || lastReply;
    const rawOutfits = payload.outfits;

    if (rawOutfits.length === 0 && wantsOutfits && !nudged) {
      nudged = true;
      messages.push({ role: "assistant", content: text });
      messages.push({ role: "user", content: "You did not render any outfit cards. Call search_items for exact ids if needed, then call show_outfits with structured looks using only real ids. Keep the reply text short." });
      continue;
    }

    if (rawOutfits.length > 0) {
      const outfits = normalizeOutfits(rawOutfits, seenIds);
      if (outfits.length === 0 && !nudged) {
        nudged = true;
        messages.push({ role: "assistant", content: text });
        messages.push({ role: "user", content: "Those outfit item ids were not returned by any tool. Call search_items now to fetch the exact ids, then call show_outfits with real ids from the results. Keep the same look if it still works." });
        continue;
      }
      if (outfits.length === 0 && !reply) throw new WardrobeApiError("The assistant returned an empty reply — try again.");
      return { reply, outfits, turnsUsed: turn + 1 };
    }

    if (!reply) throw new WardrobeApiError("The assistant returned an empty reply — try again.");
    return { reply, outfits: [], turnsUsed: turn + 1 };
  }

  throw new WardrobeApiError("Assistant session exceeded the turn limit — try again.");
}

function buildUserMessage(context: ToolContext & { count?: number; userRequest?: string; digest?: string }): string {
  const occasion = context.occasion ?? "everyday";
  const season = context.weather?.seasonBand ?? context.season ?? "all seasons";
  const styleTags = context.styleTags?.length ? context.styleTags.join(", ") : "none";
  const parts = [
    `<context>`,
    `occasion: ${occasion}`,
    `season: ${season}`,
    `style_tags: ${styleTags}`,
    ...(context.presentation && context.presentation !== "unspecified"
      ? [`wearer_presentation: ${context.presentation} (style the looks to suit this wearer)`]
      : []),
    `outfits: 3 to 5 of your best — fewer if you cannot make that many truly good ones`,
    `</context>`,
  ];
  if (context.weather) parts.push(`<weather>${describeWeather(context.weather)}</weather>`);
  if (context.userRequest) parts.push(`<user_request>${context.userRequest}</user_request>`);
  if (context.digest) parts.push(`<wardrobe_digest>\n${context.digest}\n</wardrobe_digest>`);
  parts.push("Explore the wardrobe with your tools, then reply with the outfit JSON.");
  return parts.join("\n");
}

/**
 * Run the agent loop: ≤MAX_AGENT_TURNS, local tool execution,
 * deterministic sorted results. Throws WardrobeApiError on unrecoverable
 * failure or turn-cap exhaustion with no outfits.
 */
export async function runStylistAgent(
  context: ToolContext & { count?: number; userRequest?: string; includeDigest?: boolean },
  wardrobe: ToolWardrobe,
  options: { system?: string; history?: Array<{ role: string; content: string }>; temperature?: number } = {},
): Promise<StylistAgentResult> {
  const system = options.system ?? STYLIST_SYSTEM;
  const digest = context.includeDigest !== false ? buildOverview(wardrobe) : undefined;
  const seed: Array<Record<string, unknown>> = [
    ...(options.history ?? []).map((entry) => ({ role: entry.role, content: entry.content })),
    { role: "user", content: buildUserMessage({ ...context, digest }) },
  ];
  return runAgentLoop(system, seed, wardrobe, MAX_AGENT_TURNS, options.temperature ?? 0.8);
}

/**
 * Core tool loop shared by the stylist and its reviewer: local tool execution,
 * deterministic sorted results. Throws WardrobeApiError on unrecoverable
 * failure or turn-cap exhaustion with no outfits.
 */
async function runAgentLoop(
  system: string,
  seed: Array<Record<string, unknown>>,
  wardrobe: ToolWardrobe,
  maxTurns: number,
  temperature: number,
  requireToolEvidence = true,
): Promise<StylistAgentResult> {
  const messages: Array<Record<string, unknown>> = [{ role: "system", content: system }, ...seed];
  let repaired = false;
  let nudges = 0;
  const seenIds = new Set<string>();

  // Record which real item ids the model has actually been shown, so it can
  // never compose from guessed ids. The digest and prior turns count as seen.
  const recordOutput = makeSeenIdsRecorder(wardrobe, seenIds);
  for (const entry of seed) {
    if (typeof entry.content === "string") recordOutput(entry.content);
  }

  for (let turn = 0; turn < maxTurns; turn += 1) {
    // qwen3 reasons before answering; the full budget (server caps at 2000)
    // leaves room for both that reasoning and the multi-look JSON.
    const result = await runStyleTurn(messages, STYLIST_TOOLS, AGENT_MAX_TOKENS, temperature);

    if (result.tool_calls && result.tool_calls.length > 0) {
      if (process.env.EXPO_PUBLIC_DEBUG_STYLIST === "1") {
        console.warn(`[stylist] turn ${turn + 1}: tools=${result.tool_calls.map((call) => call.name).join(",")}`);
      }
      messages.push({ role: "assistant", content: "", tool_calls: result.tool_calls.map((call) => ({
        id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments) },
      })) });
      for (const call of result.tool_calls) {
        const output = runTool(call.name, call.arguments, wardrobe);
        recordOutput(output);
        messages.push({ role: "tool", tool_call_id: call.id, content: output });
      }
      continue;
    }

    const text = result.text ?? "";
    let parsed = parseJsonPayload(text);
    if (!parsed || !Array.isArray(parsed.outfits)) parsed = extractOutfitsLoose(text);
    if (parsed && Array.isArray(parsed.outfits)) {
      const outfits: RawStyleOutfit[] = parsed.outfits
        .filter((outfit) => Array.isArray(outfit.items) && outfit.items.length > 0)
        .map((outfit) => ({
          items: (outfit.items ?? []).map(String),
          label: typeof outfit.label === "string" ? outfit.label.slice(0, 60) : "Styled look",
          reason: typeof outfit.reason === "string" ? outfit.reason.slice(0, 400) : "",
        }));

      if (outfits.length > 0) {
        if (!requireToolEvidence) return { outfits, reply: parsed.reply, turnsUsed: turn + 1 };

        const unseen = [...new Set(outfits.flatMap((outfit) => outfit.items))].filter((id) => !seenIds.has(id));
        if ((seenIds.size === 0 || unseen.length > 0) && nudges < 2) {
          nudges += 1;
          if (result.text) messages.push({ role: "assistant", content: result.text });
          messages.push({
            role: "user",
            content: seenIds.size === 0
              ? "You replied without opening the wardrobe. The digest is only counts — do not guess ids or names. Call search_items with no filters (the full list) or get_items now, then compose only from pieces you actually saw."
              : `You used item ids that no tool showed you: ${unseen.slice(0, 12).join(", ")}. Fetch real pieces with search_items/get_items and use only ids from tool results.`,
          });
          continue;
        }

        // Never surface an id the model was never shown.
        const grounded = outfits.filter((outfit) => outfit.items.every((id) => seenIds.has(id)));
        if (grounded.length > 0) return { outfits: grounded, reply: parsed.reply, turnsUsed: turn + 1 };
      }
    }

    // One repair attempt: drop reasoning (`/no_think`) and ask for compact JSON.
    if (process.env.EXPO_PUBLIC_DEBUG_STYLIST === "1") {
      console.warn(`[stylist] unparseable final text (turn ${turn + 1}, ${result.text?.length ?? 0} chars):\n${(result.text ?? "").slice(0, 1200)}`);
    }
    if (!repaired) {
      repaired = true;
      // Force non-thinking for the repair so reasoning can't eat the budget.
      messages[0] = { role: "system", content: `${system}\n\n/no_think` };
      if (result.text) messages.push({ role: "assistant", content: result.text });
      messages.push({
        role: "user",
        content: "That was not valid JSON (or was cut off). Reply now with ONLY the JSON object — no prose, no fences. At most 3 looks, each reason under 20 words.",
      });
      continue;
    }

    throw new WardrobeApiError("Stylist returned unparseable output — try again.");
  }

  throw new WardrobeApiError("Stylist session exceeded the turn limit — try again.");
}

export const REVIEWER_SYSTEM = `${STYLIST_SYSTEM}

You are now reviewing your own candidate looks before the user sees them. Picture a stranger wearing each complete look: does it genuinely work for the occasion, the weather, and the season? Fix only what is off by restyling the combination — a layer, the shoes, the bottom, the palette, or a bolder idea — using your tools. Keep what is already good, keep labels and reasons accurate, and return between 3 and 5 of your best looks in the same JSON schema.`;

function renderCandidateOutfits(outfits: RawStyleOutfit[], wardrobe: ToolWardrobe): string {
  const byId = new Map(wardrobe.items.map((item) => [item.id, item]));
  return outfits
    .map((outfit, index) => {
      const lines = outfit.items.map((id) => {
        const item = byId.get(id);
        return item ? itemFullLine(item, wardrobe.favoriteIds.has(id)) : `${id} | (unknown id)`;
      });
      return `#${index + 1} label="${outfit.label}" reason="${outfit.reason}"\n  ${lines.join("\n  ")}`;
    })
    .join("\n");
}

/**
 * Self-critique pass: hand the stylist's own candidates back to the same
 * model (with tools) to catch occasion mismatches, then return the revised set.
 * Callers should treat a thrown error as "keep the original outfits".
 */
export async function critiqueOutfits(
  context: ToolContext & { count?: number },
  outfits: RawStyleOutfit[],
  wardrobe: ToolWardrobe,
  options: { system?: string; maxTurns?: number; feedback?: string; temperature?: number } = {},
): Promise<StylistAgentResult> {
  const userMessage = [
    `<context>`,
    `occasion: ${context.occasion ?? "everyday"}`,
    `season: ${context.season ?? "all seasons"}`,
    `style_tags: ${context.styleTags?.length ? context.styleTags.join(", ") : "none"}`,
    ...(context.presentation && context.presentation !== "unspecified"
      ? [`wearer_presentation: ${context.presentation} (style the looks to suit this wearer)`]
      : []),
    `outfits_needed: ${context.count ?? outfits.length}`,
    `</context>`,
    `<candidate_outfits>`,
    renderCandidateOutfits(outfits, wardrobe),
    `</candidate_outfits>`,
    `<wardrobe_digest>`,
    buildOverview(wardrobe),
    `</wardrobe_digest>`,
    ...(options.feedback ? [`<review_feedback>\n${options.feedback}\n</review_feedback>`] : []),
    "Review each candidate as a complete look against OCCASION FIT. Where an ensemble does not read as the occasion, re-style the combination (layer, shoes, bottom, palette) using the tools, then reply with the corrected outfit JSON.",
  ].join("\n");
  return runAgentLoop(options.system ?? REVIEWER_SYSTEM, [{ role: "user", content: userMessage }], wardrobe, options.maxTurns ?? 6, options.temperature ?? 0.5, false);
}

export type { ToolWardrobe as StylistWardrobe };
