import type { Item, Outfit } from "@/data/mock";
import { describeWeather, type WeatherSummary } from "@/services/weather";
import { runStyleTurn, WardrobeApiError } from "@/services/api/wardrobe-api";

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
  const start = trimmed.indexOf("{");
  if (start < 0) return null;
  const end = trimmed.lastIndexOf("}");
  if (end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

export type RawStyleOutfit = { items: string[]; label: string; reason: string };

export type StylistAgentResult = {
  outfits: RawStyleOutfit[];
  reply?: string;
  turnsUsed: number;
};

export const STYLIST_SYSTEM = `You are a personal stylist with a sharp, confident, creative eye. You have real taste and a point of view. You explore the user's wardrobe with your tools, then style complete looks from their real pieces.

PROCESS:
1. get_wardrobe_overview first, to orient yourself.
2. Use search_items to hunt candidates — paginate, the closet may be large, and do not miss a great piece.
3. Use get_items on your shortlist for full detail before you commit.
4. Check get_saved_looks so you riff on taste they have already shown instead of repeating it.

JUDGMENT (this is styling, not a checklist):
- Style the whole picture: the occasion, the weather, the season, and their taste (favorites, saved looks, what they actually reach for).
- Compose only looks you genuinely believe are excellent. Real stylists are selective — never pad, never repeat a silhouette. Return your best 3 to 5 looks, and fewer if only a few are truly good.
- Occasion and weather live in the ensemble, not in any single item. A plain piece can be perfect in the right combination and a "dressy" piece can look wrong. Trust your eye, be creative, and surprise them sometimes.
- Decide for yourself what reads well — there are no formulas.

INTERFACE RULES (technical, always true):
- Use ONLY item ids returned by tools. Never invent an id.
- Each look: either exactly one "one_piece", OR one "base_top" AND one "bottom". Always include footwear (role "footwear").
- 3 to 6 pieces per look; layers and accessories are optional accents.
- Do not use items the tools hide as unavailable.

When ready, reply with ONLY valid JSON (no prose, no fences):
{"reply":"One or two sentences of stylist reasoning for the user.","outfits":[{"items":["id","id"],"label":"Short label","reason":"One grounded sentence."}]}
The reason must be grounded only in attributes you actually saw.`;

export const CHAT_SYSTEM = `${STYLIST_SYSTEM}

You are in a chat conversation. Keep "reply" conversational and under two sentences — it will be shown as a chat bubble above the outfit cards. Respond to follow-ups ("more casual", "swap the shoes") using the conversation history and the tools. If the user rejected a previous look, make the new one visibly different (palette, silhouette, formality, or hero piece).`;

function buildUserMessage(context: ToolContext & { count?: number; userRequest?: string; digest?: string }): string {
  const occasion = context.occasion ?? "everyday";
  const season = context.weather?.seasonBand ?? context.season ?? "all seasons";
  const styleTags = context.styleTags?.length ? context.styleTags.join(", ") : "none";
  const parts = [
    `<context>`,
    `occasion: ${occasion}`,
    `season: ${season}`,
    `style_tags: ${styleTags}`,
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
): Promise<StylistAgentResult> {
  const messages: Array<Record<string, unknown>> = [{ role: "system", content: system }, ...seed];

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const result = await runStyleTurn(messages, STYLIST_TOOLS, undefined, temperature);

    if (result.tool_calls && result.tool_calls.length > 0) {
      messages.push({ role: "assistant", content: "", tool_calls: result.tool_calls.map((call) => ({
        id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments) },
      })) });
      for (const call of result.tool_calls) {
        const output = runTool(call.name, call.arguments, wardrobe);
        messages.push({ role: "tool", tool_call_id: call.id, content: output });
      }
      continue;
    }

    const parsed = parseJsonPayload(result.text ?? "");
    if (parsed && Array.isArray(parsed.outfits)) {
      const outfits: RawStyleOutfit[] = parsed.outfits
        .filter((outfit) => Array.isArray(outfit.items) && outfit.items.length > 0)
        .map((outfit) => ({
          items: (outfit.items ?? []).map(String),
          label: typeof outfit.label === "string" ? outfit.label.slice(0, 60) : "Styled look",
          reason: typeof outfit.reason === "string" ? outfit.reason.slice(0, 400) : "",
        }));
      if (outfits.length > 0) return { outfits, reply: parsed.reply, turnsUsed: turn + 1 };
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
  return runAgentLoop(options.system ?? REVIEWER_SYSTEM, [{ role: "user", content: userMessage }], wardrobe, options.maxTurns ?? 6, options.temperature ?? 0.5);
}

export type { ToolWardrobe as StylistWardrobe };
