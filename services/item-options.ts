import type { ClothingCategory, ItemRole, WarmthBand } from "@/types/domain";
import { defaultRoleForCategory } from "@/types/taxonomy";

/**
 * The fixed vocabulary for garment attributes. Scanning picks from these lists
 * and the item editor offers the same choices, so edited items stay consistent
 * with scanned ones.
 */

export const CATEGORY_VALUES = ["top", "bottom", "outerwear", "shoes", "accessory"] as const;
export const COLOR_VALUES = [
  "black", "white", "cream", "gray", "navy", "blue", "green",
  "red", "pink", "brown", "beige", "tan", "camel", "yellow", "purple", "orange",
] as const;
export const FIT_VALUES = ["slim", "regular", "relaxed", "oversized", "wide"] as const;
export const SLEEVE_VALUES = ["sleeveless", "short", "three-quarter", "long"] as const;
export const PATTERN_VALUES = ["solid", "striped", "plaid", "floral", "graphic", "other"] as const;
export const TEXTURE_VALUES = ["smooth", "knit", "denim", "woven", "fleece", "leather-like", "satin-like"] as const;
export const SUBCATEGORY_VALUES = [
  "t-shirt", "shirt", "blouse", "polo", "tank top", "sweater", "knit", "hoodie", "sweatshirt", "dress", "jumpsuit",
  "jeans", "trousers", "chinos", "skirt", "shorts", "leggings",
  "coat", "jacket", "blazer", "cardigan", "vest", "puffer",
  "sneaker", "boot", "loafer", "heel", "sandal", "flat", "dress shoe", "slipper",
  "bag", "belt", "hat", "cap", "scarf", "sunglasses", "jewelry", "watch", "gloves", "socks", "other",
] as const;


export const ROLE_BY_CATEGORY: Record<ClothingCategory, ItemRole> = {
  top: "base_top",
  bottom: "bottom",
  outerwear: "outer_layer",
  shoes: "footwear",
  accessory: "other",
};

/** Subcategory → styling role, so dresses/jumpsuits become one_piece and bags get their own role. */
export const ROLE_BY_SUBCATEGORY: Record<string, ItemRole> = {
  "t-shirt": "base_top", shirt: "base_top", blouse: "base_top", polo: "base_top", "tank top": "base_top",
  sweater: "base_top", knit: "base_top", hoodie: "base_top", sweatshirt: "base_top",
  dress: "one_piece", jumpsuit: "one_piece",
  jeans: "bottom", trousers: "bottom", chinos: "bottom", skirt: "bottom", shorts: "bottom", leggings: "bottom",
  coat: "outer_layer", jacket: "outer_layer", blazer: "outer_layer", cardigan: "outer_layer", vest: "outer_layer", puffer: "outer_layer",
  sneaker: "footwear", boot: "footwear", loafer: "footwear", heel: "footwear", sandal: "footwear", flat: "footwear", "dress shoe": "footwear", slipper: "footwear",
  bag: "bag", belt: "belt", hat: "hat", cap: "hat", scarf: "scarf", sunglasses: "eyewear", jewelry: "jewelry", watch: "jewelry", gloves: "other", socks: "socks",
};

/** Role → category, used when the subcategory is more specific than the category answer. */
export const CATEGORY_BY_ROLE: Record<ItemRole, ClothingCategory> = {
  base_top: "top", one_piece: "top", mid_layer: "outerwear", outer_layer: "outerwear",
  bottom: "bottom", footwear: "shoes",
  bag: "accessory", belt: "accessory", hat: "accessory", eyewear: "accessory",
  jewelry: "accessory", socks: "accessory", scarf: "accessory", other: "accessory",
};


export const FORMALITY_OPTIONS = ["casual", "smart-casual", "formal"] as const;
export const WARMTH_OPTIONS: readonly WarmthBand[] = ["light", "medium", "heavy"];

/** Styling role for a category + type, the same rule the scanner uses. */
export function deriveRole(category: ClothingCategory, subcategory?: string): ItemRole {
  return (subcategory ? ROLE_BY_SUBCATEGORY[subcategory] : undefined) ?? defaultRoleForCategory(category);
}

/** Types that belong to a category (e.g. "jeans" under bottom). "other" is always allowed. */
export function subcategoriesFor(category: ClothingCategory): string[] {
  return SUBCATEGORY_VALUES.filter((value) => value === "other" || CATEGORY_BY_ROLE[ROLE_BY_SUBCATEGORY[value] ?? "other"] === category);
}

const SWATCHES: Record<string, string> = {
  white: "#F5F1E8", ivory: "#F3EAD9", cream: "#EFE3CB", beige: "#D9C7A8", tan: "#C9A67A", camel: "#C08A4E",
  brown: "#6B4A2F", navy: "#1F2A44", charcoal: "#3A3A3A", gray: "#8E8E93", grey: "#8E8E93", black: "#0E0D0B",
  blue: "#3B6EA8", green: "#4F7A57", red: "#B8433A", pink: "#E6A0B4", yellow: "#E3C65A", purple: "#7B5EA7", orange: "#D9822B",
};
/** Display colour for a colour name; unknown names fall through as-is (CSS names work). */
export const swatchColor = (color: string): string => SWATCHES[color.toLowerCase()] ?? color;

import { VIBE_IDS, allowedVibeIds } from "@/services/vibes";
import type { WearerPresentation } from "@/types/domain";

/** Keep only known vibe ids for this wearer (lowercased, de-duplicated, at most three). */
export function cleanVibes(value: unknown, presentation?: WearerPresentation): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const known = new Set<string>(presentation === undefined ? VIBE_IDS : allowedVibeIds(presentation));
  const seen: string[] = [];
  for (const entry of raw) {
    const id = String(entry).trim().toLowerCase().replace(/[\s_]+/g, "-");
    if (known.has(id) && !seen.includes(id)) seen.push(id);
  }
  return seen.slice(0, 3);
}
