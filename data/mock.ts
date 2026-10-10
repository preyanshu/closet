import {
  type AvailabilityStatus,
  type ClothingCategory,
  type Item,
  type ItemRole,
  type LifecycleStatus,
  type Outfit,
  type OutfitSource,
  type ProcessingStatus,
  type WarmthBand,
} from "@/types/domain";
import { categoryLabels } from "@/types/taxonomy";

export type { ClothingCategory, Item, Outfit } from "@/types/domain";
export { categoryLabels };

export type Aesthetic = {
  id: string;
  label: string;
  coveragePercent: number;
};

const SEED_CREATED_AT = "2026-05-01T09:00:00.000Z";

function seedItem(input: {
  id: string;
  name: string;
  category: ClothingCategory;
  role: ItemRole;
  subcategory?: string;
  primaryColor: string;
  secondaryColors?: string[];
  styleTags: string[];
  pattern?: string;
  sleeveLength?: string;
  fit?: string;
  visibleTexture?: string;
  formality?: string;
  warmthBand?: WarmthBand;
  brand?: string;
  imageUrl: string;
  lastWorn: string | null;
  price: number;
  wearCount: number;
}): Item {
  const updatedAt = input.lastWorn ? `${input.lastWorn}T09:00:00.000Z` : SEED_CREATED_AT;
  return {
    id: input.id,
    ownerId: "local-demo",
    name: input.name,
    category: input.category,
    subcategory: input.subcategory,
    role: input.role,
    primaryColor: input.primaryColor,
    secondaryColors: input.secondaryColors ?? [],
    styleTags: input.styleTags,
    pattern: input.pattern,
    sleeveLength: input.sleeveLength,
    fit: input.fit,
    visibleTexture: input.visibleTexture,
    formality: input.formality,
    warmthBand: input.warmthBand,
    brand: input.brand,
    originalAssetUri: input.imageUrl,
    displayAssetUri: input.imageUrl,
    priceMinor: input.price * 100,
    priceCurrency: "USD",
    wearCount: input.wearCount,
    lastWorn: input.lastWorn,
    availabilityStatus: "available" as AvailabilityStatus,
    lifecycleStatus: "owned" as LifecycleStatus,
    processingStatus: "ready" as ProcessingStatus,
    createdAt: SEED_CREATED_AT,
    updatedAt,
    revision: 1,
  };
}

export const mockOutfitAlbums: Outfit[] = [
  {
    id: "mock-album-office-01",
    label: "Monday client check-in",
    source: "demo" as OutfitSource,
    itemIds: ["item-02", "item-04", "item-07", "item-11", "item-13"],
    items: [
      { itemId: "item-02", role: "base_top" },
      { itemId: "item-04", role: "bottom", layerOrder: 1 },
      { itemId: "item-13", role: "belt", layerOrder: 2 },
      { itemId: "item-07", role: "outer_layer" },
      { itemId: "item-11", role: "footwear" },
    ],
    aestheticId: "office",
    description: "Sharp layers with a polished black-and-camel base.",
    tags: ["Office", "Travel"],
    metadata: { occasion: "office", season: "fall", palette: "black-camel", stylingNote: "Tuck the blouse, keep the belt subtle.", demo: true },
    isDemo: true,
    currentRevisionId: "mock-album-office-01@1",
    createdAt: SEED_CREATED_AT,
    updatedAt: SEED_CREATED_AT,
  },
  {
    id: "mock-album-office-02",
    label: "Desk to dinner",
    source: "demo" as OutfitSource,
    itemIds: ["item-18", "item-06", "item-09", "item-11", "item-14"],
    items: [
      { itemId: "item-18", role: "base_top" },
      { itemId: "item-09", role: "mid_layer", layerOrder: 1 },
      { itemId: "item-06", role: "bottom" },
      { itemId: "item-14", role: "jewelry" },
      { itemId: "item-11", role: "footwear" },
    ],
    aestheticId: "office",
    description: "Crisp shirting softened with ivory knitwear and pearls.",
    tags: ["Office", "Evening"],
    metadata: { occasion: "office", season: "fall", palette: "ivory-black", stylingNote: "Button the shirt fully for a cleaner line.", demo: true },
    isDemo: true,
    currentRevisionId: "mock-album-office-02@1",
    createdAt: SEED_CREATED_AT,
    updatedAt: SEED_CREATED_AT,
  },
  {
    id: "mock-album-casual-01",
    label: "Errand reset",
    source: "demo" as OutfitSource,
    itemIds: ["item-01", "item-05", "item-09", "item-10", "item-15"],
    items: [
      { itemId: "item-01", role: "base_top" },
      { itemId: "item-09", role: "mid_layer", layerOrder: 1 },
      { itemId: "item-05", role: "bottom" },
      { itemId: "item-15", role: "bag" },
      { itemId: "item-10", role: "footwear" },
    ],
    aestheticId: "clean-girl",
    description: "Easy denim, clean whites, and a compact shoulder bag.",
    tags: ["Casual", "Summer"],
    metadata: { occasion: "casual", season: "summer", palette: "white-blue", stylingNote: "Let the cardigan hang open.", demo: true },
    isDemo: true,
    currentRevisionId: "mock-album-casual-01@1",
    createdAt: SEED_CREATED_AT,
    updatedAt: SEED_CREATED_AT,
  },
  {
    id: "mock-album-casual-02",
    label: "Coffee walk",
    source: "demo" as OutfitSource,
    itemIds: ["item-03", "item-05", "item-07", "item-12", "item-14"],
    items: [
      { itemId: "item-03", role: "base_top" },
      { itemId: "item-05", role: "bottom" },
      { itemId: "item-14", role: "jewelry" },
      { itemId: "item-07", role: "outer_layer" },
      { itemId: "item-12", role: "footwear" },
    ],
    aestheticId: "old-money",
    description: "Soft prep pieces grounded by loafers and a tailored coat.",
    tags: ["Casual", "Travel"],
    metadata: { occasion: "casual", season: "fall", palette: "cream-camel", stylingNote: "Roll the polo sleeves once.", demo: true },
    isDemo: true,
    currentRevisionId: "mock-album-casual-02@1",
    createdAt: SEED_CREATED_AT,
    updatedAt: SEED_CREATED_AT,
  },
  {
    id: "mock-album-summer-01",
    label: "Hot day uniform",
    source: "demo" as OutfitSource,
    itemIds: ["item-01", "item-05", "item-10", "item-14"],
    items: [
      { itemId: "item-01", role: "base_top" },
      { itemId: "item-05", role: "bottom" },
      { itemId: "item-14", role: "jewelry" },
      { itemId: "item-10", role: "footwear" },
    ],
    aestheticId: "minimal",
    description: "Light, breathable staples with low-effort polish.",
    tags: ["Summer", "Casual"],
    metadata: { occasion: "casual", season: "summer", palette: "white", stylingNote: "Avoid adding a layer today.", demo: true },
    isDemo: true,
    currentRevisionId: "mock-album-summer-01@1",
    createdAt: SEED_CREATED_AT,
    updatedAt: SEED_CREATED_AT,
  },
  {
    id: "mock-album-evening-01",
    label: "Late reservation",
    source: "demo" as OutfitSource,
    itemIds: ["item-02", "item-17", "item-08", "item-11", "item-14"],
    items: [
      { itemId: "item-02", role: "base_top" },
      { itemId: "item-17", role: "one_piece" },
      { itemId: "item-14", role: "jewelry" },
      { itemId: "item-08", role: "outer_layer" },
      { itemId: "item-11", role: "footwear" },
    ],
    aestheticId: "evening",
    description: "Glossy black textures balanced with a delicate finish.",
    tags: ["Evening"],
    metadata: { occasion: "evening", season: "fall", palette: "black", stylingNote: "Keep the jacket off until the last minute.", demo: true },
    isDemo: true,
    currentRevisionId: "mock-album-evening-01@1",
    createdAt: SEED_CREATED_AT,
    updatedAt: SEED_CREATED_AT,
  },
  {
    id: "mock-album-travel-01",
    label: "Carry-on capsule",
    source: "demo" as OutfitSource,
    itemIds: ["item-18", "item-04", "item-07", "item-12", "item-13"],
    items: [
      { itemId: "item-18", role: "base_top" },
      { itemId: "item-04", role: "bottom" },
      { itemId: "item-13", role: "belt", layerOrder: 1 },
      { itemId: "item-07", role: "outer_layer" },
      { itemId: "item-12", role: "footwear" },
    ],
    aestheticId: "old-money",
    description: "Repeatable neutrals for flights, meetings, and dinners.",
    tags: ["Travel", "Office"],
    metadata: { occasion: "travel", season: "fall", palette: "neutral", stylingNote: "Wear the coat on board, not in the bag.", demo: true },
    isDemo: true,
    currentRevisionId: "mock-album-travel-01@1",
    createdAt: SEED_CREATED_AT,
    updatedAt: SEED_CREATED_AT,
  },
];

export const aesthetics: Aesthetic[] = [
  { id: "old-money", label: "Old money", coveragePercent: 82 },
  { id: "office", label: "Office", coveragePercent: 76 },
  { id: "streetwear", label: "Streetwear", coveragePercent: 64 },
  { id: "clean-girl", label: "Clean girl", coveragePercent: 88 },
  { id: "minimal", label: "Minimal", coveragePercent: 91 },
  { id: "evening", label: "Evening", coveragePercent: 58 }
];

export const clothingItems: Item[] = [
  seedItem({ id: "item-01", name: "Ribbed white tank", category: "top", role: "base_top", subcategory: "Tank", primaryColor: "white", styleTags: ["clean-girl", "minimal"], visibleTexture: "ribbed", formality: "casual", warmthBand: "light", imageUrl: "@/assets/item-1.png", lastWorn: "2026-07-18", price: 28, wearCount: 12 }),
  seedItem({ id: "item-02", name: "Black silk blouse", category: "top", role: "base_top", subcategory: "Blouse", primaryColor: "black", styleTags: ["office", "evening", "minimal"], sleeveLength: "long", visibleTexture: "satin", formality: "formal", warmthBand: "light", imageUrl: "@/assets/item-2.png", lastWorn: "2026-07-11", price: 89, wearCount: 9 }),
  seedItem({ id: "item-03", name: "Cream knit polo", category: "top", role: "base_top", subcategory: "Polo", primaryColor: "cream", styleTags: ["old-money", "minimal"], sleeveLength: "short", formality: "smart-casual", warmthBand: "medium", imageUrl: "@/assets/item-3.png", lastWorn: null, price: 59, wearCount: 0 }),
  seedItem({ id: "item-04", name: "Tailored charcoal trouser", category: "bottom", role: "bottom", subcategory: "Dress pants", primaryColor: "charcoal", styleTags: ["office", "old-money", "minimal"], fit: "tailored", formality: "formal", warmthBand: "medium", imageUrl: "@/assets/item-4.png", lastWorn: "2026-07-20", price: 120, wearCount: 11 }),
  seedItem({ id: "item-05", name: "Straight blue denim", category: "bottom", role: "bottom", subcategory: "Jeans", primaryColor: "blue", styleTags: ["clean-girl", "streetwear"], fit: "straight", formality: "casual", warmthBand: "medium", imageUrl: "@/assets/item-1.png", lastWorn: "2026-07-13", price: 78, wearCount: 10 }),
  seedItem({ id: "item-06", name: "Black pleated skirt", category: "bottom", role: "bottom", subcategory: "Skirt", primaryColor: "black", styleTags: ["office", "evening"], visibleTexture: "pleated", formality: "smart-casual", warmthBand: "light", imageUrl: "@/assets/item-2.png", lastWorn: null, price: 65, wearCount: 0 }),
  seedItem({ id: "item-07", name: "Camel wool coat", category: "outerwear", role: "outer_layer", subcategory: "Coat", primaryColor: "camel", styleTags: ["old-money", "office"], visibleTexture: "wool", formality: "formal", warmthBand: "heavy", brand: "Everlane", imageUrl: "@/assets/item-3.png", lastWorn: "2026-07-05", price: 240, wearCount: 6 }),
  seedItem({ id: "item-08", name: "Cropped leather jacket", category: "outerwear", role: "outer_layer", subcategory: "Jacket", primaryColor: "black", styleTags: ["streetwear", "evening"], visibleTexture: "leather", formality: "smart-casual", warmthBand: "heavy", imageUrl: "@/assets/item-4.png", lastWorn: "2026-07-16", price: 180, wearCount: 4 }),
  seedItem({ id: "item-09", name: "Ivory cardigan", category: "outerwear", role: "mid_layer", subcategory: "Cardigan", primaryColor: "ivory", styleTags: ["clean-girl", "old-money"], sleeveLength: "long", formality: "casual", warmthBand: "medium", imageUrl: "@/assets/item-1.png", lastWorn: null, price: 52, wearCount: 0 }),
  seedItem({ id: "item-10", name: "White leather sneaker", category: "shoes", role: "footwear", subcategory: "Sneakers", primaryColor: "white", styleTags: ["clean-girl", "streetwear", "minimal"], pattern: "solid", formality: "casual", warmthBand: "light", brand: "Veja", imageUrl: "@/assets/item-2.png", lastWorn: "2026-07-21", price: 95, wearCount: 14 }),
  seedItem({ id: "item-11", name: "Black pointed mule", category: "shoes", role: "footwear", subcategory: "Heels", primaryColor: "black", styleTags: ["office", "evening", "minimal"], formality: "formal", warmthBand: "light", imageUrl: "@/assets/item-3.png", lastWorn: "2026-07-08", price: 110, wearCount: 7 }),
  seedItem({ id: "item-12", name: "Brown loafer", category: "shoes", role: "footwear", subcategory: "Loafers", primaryColor: "brown", styleTags: ["old-money", "office"], formality: "smart-casual", warmthBand: "medium", imageUrl: "@/assets/item-4.png", lastWorn: null, price: 85, wearCount: 0 }),
  seedItem({ id: "item-13", name: "Slim black belt", category: "accessory", role: "belt", subcategory: "Belt", primaryColor: "black", styleTags: ["office", "minimal", "old-money"], formality: "smart-casual", warmthBand: "light", imageUrl: "@/assets/item-1.png", lastWorn: "2026-07-19", price: 30, wearCount: 8 }),
  seedItem({ id: "item-14", name: "Pearl studs", category: "accessory", role: "jewelry", subcategory: "Jewelry", primaryColor: "white", secondaryColors: ["gold"], styleTags: ["old-money", "clean-girl", "evening"], formality: "formal", warmthBand: "light", imageUrl: "@/assets/item-2.png", lastWorn: null, price: 45, wearCount: 0 }),
  seedItem({ id: "item-15", name: "Nylon shoulder bag", category: "accessory", role: "bag", subcategory: "Bag", primaryColor: "black", styleTags: ["streetwear", "minimal"], visibleTexture: "nylon", formality: "casual", warmthBand: "light", imageUrl: "@/assets/item-3.png", lastWorn: "2026-07-09", price: 68, wearCount: 5 }),
  seedItem({ id: "item-16", name: "Oversized hoodie", category: "top", role: "base_top", subcategory: "Hoodie", primaryColor: "gray", styleTags: ["streetwear"], fit: "oversized", formality: "casual", warmthBand: "heavy", imageUrl: "@/assets/item-4.png", lastWorn: "2026-07-22", price: 42, wearCount: 9 }),
  seedItem({ id: "item-17", name: "Satin slip dress", category: "bottom", role: "one_piece", subcategory: "Dress", primaryColor: "black", styleTags: ["evening", "minimal"], visibleTexture: "satin", formality: "formal", warmthBand: "light", imageUrl: "@/assets/item-1.png", lastWorn: null, price: 75, wearCount: 0 }),
  seedItem({ id: "item-18", name: "Boxy white shirt", category: "top", role: "base_top", subcategory: "Button-down", primaryColor: "white", styleTags: ["office", "clean-girl", "old-money"], sleeveLength: "long", fit: "boxy", formality: "smart-casual", warmthBand: "light", imageUrl: "@/assets/item-2.png", lastWorn: "2026-07-15", price: 48, wearCount: 10 })
];