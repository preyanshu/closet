import type { Item, Outfit, WearerPresentation } from "@/types/domain";
import { allowedVibeIds, suggestAesthetics, vibeLabel, VIBES } from "@/services/vibes";

/**
 * Brings data saved before the vibe catalog existed up to date:
 *
 * - Pieces: vibe tags that don't suit the wearer are dropped, and (once per
 *   wearer setting) the tags the current rules would give are added, so older
 *   pieces gain Casual / Rugged and lose a tag like "clean girl" on a menswear
 *   closet. Tags the user chose themselves are otherwise kept.
 * - Looks: get the vibe labels the Home chips and Outfits filters read, worked
 *   out from their pieces.
 *
 * Pure functions: they return new objects only for what actually changed.
 */

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((value, index) => value === b[index]);

/** Vibe ids are the only style tags we manage; anything else a piece carries is left alone. */
const isVibe = (tag: string) => VIBES.some((vibe) => vibe.id === tag);

export function retagItem(item: Item, presentation: WearerPresentation | undefined, addDerived: boolean): Item {
  const allowed = new Set(allowedVibeIds(presentation));
  const kept = item.styleTags.filter((tag) => !isVibe(tag) || allowed.has(tag));
  const derived = addDerived
    ? suggestAesthetics(
        { category: item.category, subcategory: item.subcategory, name: item.name, fit: item.fit, pattern: item.pattern, sleeve_length: item.sleeveLength, material: item.visibleTexture, formality: item.formality },
        presentation,
      )
    : [];
  // "minimal" is only the scanner's fallback; don't add it to a piece that already has other vibes.
  const additions = derived.filter((tag) => !(tag === "minimal" && kept.some(isVibe)));
  const next = [...new Set([...kept, ...additions])];
  return sameList(next, item.styleTags) ? item : { ...item, styleTags: next };
}

export function retagLook(look: Outfit, items: Map<string, Item>, presentation: WearerPresentation | undefined): Outfit {
  const allowed = allowedVibeIds(presentation);
  const pieces = look.itemIds.map((id) => items.get(id)).filter((item): item is Item => Boolean(item));
  const existing = (look.metadata?.vibes ?? []).filter((vibe) => allowed.includes(vibe));
  const inferred = pieces.length > 0 ? allowed.filter((vibe) => pieces.filter((piece) => piece.styleTags.includes(vibe)).length * 2 >= pieces.length) : [];
  const vibes = (existing.length > 0 ? existing : inferred).slice(0, 3);

  // Labels of vibes that don't suit the wearer come out of the tags too.
  const hidden = new Set(VIBES.filter((vibe) => !allowed.includes(vibe.id)).map((vibe) => vibe.label.toLowerCase()));
  const tags = [...new Set([...vibes.map(vibeLabel), ...(look.tags ?? [])])].filter((tag) => !hidden.has(tag.toLowerCase())).slice(0, 5);

  const sameVibes = sameList(vibes, look.metadata?.vibes ?? []);
  const sameTags = sameList(tags, look.tags ?? []);
  if (sameVibes && sameTags) return look;
  return { ...look, tags, metadata: { ...look.metadata, vibes } };
}

export type BackfillResult = {
  items: Item[];
  looks: Outfit[];
  changedItems: Item[];
  changedLooks: Outfit[];
};

export function backfillVibes({ items, looks, presentation, addDerived }: { items: Item[]; looks: Outfit[]; presentation: WearerPresentation | undefined; addDerived: boolean }): BackfillResult {
  const nextItems = items.map((item) => retagItem(item, presentation, addDerived));
  const byId = new Map(nextItems.map((item) => [item.id, item]));
  const nextLooks = looks.map((look) => retagLook(look, byId, presentation));
  return {
    items: nextItems,
    looks: nextLooks,
    changedItems: nextItems.filter((item, index) => item !== items[index]),
    changedLooks: nextLooks.filter((look, index) => look !== looks[index]),
  };
}
