import type { Item, ItemRole } from "@/types/domain";

/**
 * Items have one stored role, but many pieces do two jobs: a button-up shirt is
 * a base top that can also be worn open over a tee. `alternateRoles` records
 * that explicitly. This module decides it (from the fixed subcategory list the
 * scanner produces), and resolves which role each piece plays in a given look.
 */

const LAYER_ROLES: readonly ItemRole[] = ["mid_layer", "outer_layer"];

/** Subcategories that can be worn over another top. */
const LAYERABLE_SUBCATEGORIES = new Set(["shirt", "blouse", "sweater", "knit", "hoodie", "sweatshirt", "cardigan", "vest"]);

/** Subcategories we know can NOT layer, so we never second-guess them from the name. */
const NON_LAYER_SUBCATEGORIES = new Set([
  "t-shirt", "tee", "tank top", "tank", "camisole", "polo", "dress", "jumpsuit",
  "jeans", "trousers", "chinos", "skirt", "shorts", "leggings",
  "coat", "jacket", "blazer", "puffer",
  "sneaker", "boot", "loafer", "heel", "sandal", "flat", "dress shoe", "slipper",
  "bag", "belt", "hat", "cap", "scarf", "sunglasses", "jewelry", "watch", "gloves", "socks",
]);

const NAME_NOT_A_LAYER = /\b(t-?shirt|tee|tank|cami(sole)?|crop(ped)?|bodysuit|bralette|tube|polo)\b/i;
const NAME_LAYER_CAPABLE = /(shirt|overshirt|flannel|cardigan|knit|sweater|pullover|henley|hoodie|sweatshirt|vest|blouse|button)/i;

const isTopRole = (role: ItemRole) => role === "base_top" || role === "mid_layer" || role === "outer_layer";

/**
 * Best guess at an item's alternate roles when nothing was recorded (manual
 * adds, older items). Trusts the subcategory when it is one we know, and only
 * falls back to the name for unknown or missing subcategories.
 */
export function guessAlternateRoles(item: Pick<Item, "role" | "subcategory" | "name">): ItemRole[] {
  if (!isTopRole(item.role)) return [];
  const sub = (item.subcategory ?? "").trim().toLowerCase();
  if (LAYERABLE_SUBCATEGORIES.has(sub)) return item.role === "mid_layer" ? [] : ["mid_layer"];
  if (NON_LAYER_SUBCATEGORIES.has(sub)) return [];
  if (item.role !== "base_top") return [];
  const text = `${sub} ${item.name}`;
  return NAME_LAYER_CAPABLE.test(text) && !NAME_NOT_A_LAYER.test(text) ? ["mid_layer"] : [];
}

/**
 * Decide alternate roles at scan time. The subcategory is authoritative when it
 * is a known one; the vision model's yes/no answer only settles the unclear
 * cases ("other", or a top with no recognised type).
 */
export function deriveAlternateRoles(input: {
  role: ItemRole;
  subcategory: string;
  name: string;
  canLayer?: { answer: boolean; confidence: number };
}): ItemRole[] {
  const sub = input.subcategory.trim().toLowerCase();
  if (LAYERABLE_SUBCATEGORIES.has(sub) || NON_LAYER_SUBCATEGORIES.has(sub)) return guessAlternateRoles(input);
  if (!isTopRole(input.role)) return [];
  if (input.canLayer && input.canLayer.confidence >= 0.6) return input.canLayer.answer && input.role === "base_top" ? ["mid_layer"] : [];
  return guessAlternateRoles(input);
}

/** What an item can do, whether or not it was recorded. */
export function effectiveAlternateRoles(item: Pick<Item, "role" | "subcategory" | "name" | "alternateRoles">): ItemRole[] {
  return item.alternateRoles ?? guessAlternateRoles(item);
}

/** True if the piece is, or can act as, a layer over another top. */
export function isLayerCapable(item: Pick<Item, "role" | "subcategory" | "name" | "alternateRoles">): boolean {
  if (LAYER_ROLES.includes(item.role)) return true;
  return effectiveAlternateRoles(item).some((role) => LAYER_ROLES.includes(role));
}

/** True for a base top that can be worn as a layer (shirt, knit, hoodie...). */
export function canWorkAsLayer(item: Pick<Item, "role" | "subcategory" | "name" | "alternateRoles">): boolean {
  return item.role === "base_top" && effectiveAlternateRoles(item).some((role) => LAYER_ROLES.includes(role));
}

/** Compact marker for tool output, e.g. "base_top+layer" or "outer_layer+base". */
export function roleWithMarker(item: Pick<Item, "role" | "subcategory" | "name" | "alternateRoles">): string {
  const marks: string[] = [];
  if (canWorkAsLayer(item)) marks.push("layer");
  if (LAYER_ROLES.includes(item.role) && effectiveAlternateRoles(item).includes("base_top")) marks.push("base");
  return marks.length > 0 ? `${item.role}+${marks.join("+")}` : item.role;
}

/**
 * Resolve which role each piece plays in one look, one piece per slot.
 * Pieces are placed in the order given, but a piece that has no alternate role
 * claims its own slot first, so a tee stays the base and the shirt becomes the
 * layer however the model happened to list them. A piece whose slot is taken
 * moves to an alternate role if it has one, otherwise it is dropped.
 */
export function assignRoles(items: Item[]): { kept: Item[]; roleOf: Map<string, ItemRole> } {
  const order = [...items].sort((a, b) => Number(effectiveAlternateRoles(a).length > 0) - Number(effectiveAlternateRoles(b).length > 0));
  const taken = new Set<ItemRole>();
  // A dress or jumpsuit already covers the top and the bottom, so a shirt next
  // to it can only be a layer, and a plain tee or trousers have no slot.
  if (items.some((item) => item.role === "one_piece")) {
    taken.add("base_top");
    taken.add("bottom");
  }
  const roleOf = new Map<string, ItemRole>();
  for (const item of order) {
    const slot = [item.role, ...effectiveAlternateRoles(item)].find((role) => !taken.has(role));
    if (!slot) continue;
    taken.add(slot);
    roleOf.set(item.id, slot);
  }
  return { kept: items.filter((item) => roleOf.has(item.id)), roleOf };
}
