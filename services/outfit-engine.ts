import { clothingItems, type ClothingCategory, type Item, type Outfit } from "@/data/mock";

const outfitSlots: ClothingCategory[] = ["top", "bottom", "outerwear", "shoes", "accessory"];

const findByCategory = (items: Item[], category: ClothingCategory, offset: number) => {
  const matches = items.filter((item) => item.category === category);
  return matches[offset % Math.max(matches.length, 1)];
};

export const generateOutfitsForToday = (aestheticId: string, sourceItems = clothingItems): Outfit[] => {
  const matchingItems = aestheticId === "all"
    ? sourceItems
    : sourceItems.filter((item) => item.styleTags.includes(aestheticId));
  const pool = matchingItems.length >= 5 ? matchingItems : sourceItems;

  const now = new Date().toISOString();

  return [0, 1].map((offset) => {
    const selectedIds = outfitSlots
      .map((category) => findByCategory(pool, category, offset))
      .filter((item): item is Item => Boolean(item))
      .map((item) => item.id);

    return {
      id: `${aestheticId}-look-${offset + 1}`,
      label: `Look 0${offset + 1}`,
      source: "recommended",
      itemIds: selectedIds,
      aestheticId,
      description: offset === 0 ? "Structured, polished, and easy to repeat." : "Softer proportions with one sharper anchor piece.",
      tags: offset === 0 ? ["Office", "Casual"] : ["Evening", "Summer"],
      createdAt: now,
      updatedAt: now,
    };
  });
};