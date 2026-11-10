import type { WearerPresentation } from "@/types/domain";

/**
 * The one vocabulary of vibes. Home chips, the Closet filter, the style quiz,
 * the scanner's tagging and the stylist's labels all read from here.
 *
 * `audience` says who a vibe suits so it isn't offered where it doesn't fit
 * (no "clean girl" chip for a menswear wardrobe). It is a default, not a rule:
 * someone styled for "Any" sees everything.
 */
export type VibeAudience = "any" | "feminine" | "masculine";

export type Vibe = {
  id: string;
  label: string;
  audience: VibeAudience;
  /** Part of the generic chip set everyone gets on Home. */
  base?: boolean;
};

export const VIBES: readonly Vibe[] = [
  { id: "casual", label: "Casual", audience: "any", base: true },
  { id: "office", label: "Office", audience: "any", base: true },
  { id: "evening", label: "Evening", audience: "any", base: true },
  { id: "minimal", label: "Minimal", audience: "any" },
  { id: "streetwear", label: "Streetwear", audience: "any" },
  { id: "old-money", label: "Old money", audience: "any" },
  { id: "clean-girl", label: "Clean girl", audience: "feminine" },
  { id: "rugged", label: "Rugged", audience: "masculine" },
];

export const VIBE_IDS: readonly string[] = VIBES.map((vibe) => vibe.id);

export const vibeLabel = (id: string): string => VIBES.find((vibe) => vibe.id === id)?.label ?? id.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

function suits(vibe: Vibe, presentation?: WearerPresentation): boolean {
  if (vibe.audience === "any" || presentation === undefined || presentation === "unspecified") return true;
  return vibe.audience === (presentation === "male" ? "masculine" : "feminine");
}

/** Every vibe that suits this wearer. */
export function vibesFor(presentation?: WearerPresentation): Vibe[] {
  return VIBES.filter((vibe) => suits(vibe, presentation));
}

export function allowedVibeIds(presentation?: WearerPresentation): string[] {
  return vibesFor(presentation).map((vibe) => vibe.id);
}

/**
 * Chips for Home (after "All"): the generic set, then the vibes the user picked
 * in the style quiz, then any vibe today's looks actually carry. Only vibes
 * that suit the wearer, in that order, without repeats.
 */
export function homeChipVibes({ presentation, preferred = [], inPool = [] }: { presentation?: WearerPresentation; preferred?: string[]; inPool?: string[] }): Vibe[] {
  const allowed = new Map(vibesFor(presentation).map((vibe) => [vibe.id, vibe]));
  const ordered = [
    ...VIBES.filter((vibe) => vibe.base).map((vibe) => vibe.id),
    ...preferred,
    ...inPool,
  ];
  const seen = new Set<string>();
  const chips: Vibe[] = [];
  for (const id of ordered) {
    const vibe = allowed.get(id);
    if (!vibe || seen.has(id)) continue;
    seen.add(id);
    chips.push(vibe);
  }
  return chips;
}

/** The attributes the tagging rules read; a scan result or a saved item can both supply them. */
export type VibeSource = {
  category?: string;
  subcategory?: string;
  name?: string;
  fit?: string;
  pattern?: string;
  sleeve_length?: string;
  material?: string;
  formality?: string;
};

/**
 * Suggested vibes for a piece, from keyword rules over its attributes. Only
 * vibes that suit the wearer are returned (no "clean girl" on a menswear
 * closet). Falls back to Minimal when nothing matches.
 */
export function suggestAesthetics(attrs: VibeSource, presentation?: WearerPresentation): string[] {
  const tags = new Set<string>();
  const haystack = [attrs.category, attrs.subcategory, attrs.name, attrs.fit, attrs.pattern, attrs.sleeve_length, attrs.material, attrs.formality]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/(office|blouse|trouser|shirt|blazer|loafer|suit|silk|charcoal|tailored)/.test(haystack)) tags.add("office");
  if (/(oversized|hoodie|sneaker|graphic|street|cap|denim|puffer)/.test(haystack)) tags.add("streetwear");
  if (/(knit|wool|camel|cashmere|coat|loafer|pearl|prep)/.test(haystack)) tags.add("old-money");
  if (/(white|cream|ivory|clean|tank|linen|minimal)/.test(haystack)) tags.add("clean-girl");
  if (/(silk|satin|slip|evening|black|dress|heel)/.test(haystack)) tags.add("evening");
  if (/(minimal|solid|black|white|tailored|straight)/.test(haystack)) tags.add("minimal");
  if (/(t-shirt|tee|jeans|denim|sneaker|hoodie|shorts|casual|sweatshirt)/.test(haystack)) tags.add("casual");
  if (/(boot|flannel|denim|leather|work|rugged|cargo|canvas)/.test(haystack)) tags.add("rugged");

  const allowed = new Set(allowedVibeIds(presentation));
  const suited = [...tags].filter((tag) => allowed.has(tag));
  return suited.length > 0 ? suited : ["minimal"];
}
