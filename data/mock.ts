export type ClothingCategory = "top" | "bottom" | "outerwear" | "shoes" | "accessory";

export type ClothingItem = {
  id: string;
  name: string;
  category: ClothingCategory;
  color: string;
  aesthetics: string[];
  imageUrl: string;
  lastWorn: string | null;
  price: number;
  wearCount: number;
};

export type Aesthetic = {
  id: string;
  label: string;
  coveragePercent: number;
};

export type Outfit = {
  previewUri?: string;
  metadata?: { occasion: string; season: string; palette: string; stylingNote: string; demo?: boolean };
  id: string;
  label: string;
  itemIds: string[];
  aestheticId: string;
  description: string;
  tags?: string[];
};

export const mockOutfitAlbums: Outfit[] = [
  {
    id: "mock-album-office-01",
    label: "Monday client check-in",
    itemIds: ["item-02", "item-04", "item-07", "item-11", "item-13"],
    aestheticId: "office",
    description: "Sharp layers with a polished black-and-camel base.",
    tags: ["Office", "Travel"],
  },
  {
    id: "mock-album-office-02",
    label: "Desk to dinner",
    itemIds: ["item-18", "item-06", "item-09", "item-11", "item-14"],
    aestheticId: "office",
    description: "Crisp shirting softened with ivory knitwear and pearls.",
    tags: ["Office", "Evening"],
  },
  {
    id: "mock-album-casual-01",
    label: "Errand reset",
    itemIds: ["item-01", "item-05", "item-09", "item-10", "item-15"],
    aestheticId: "clean-girl",
    description: "Easy denim, clean whites, and a compact shoulder bag.",
    tags: ["Casual", "Summer"],
  },
  {
    id: "mock-album-casual-02",
    label: "Coffee walk",
    itemIds: ["item-03", "item-05", "item-07", "item-12", "item-14"],
    aestheticId: "old-money",
    description: "Soft prep pieces grounded by loafers and a tailored coat.",
    tags: ["Casual", "Travel"],
  },
  {
    id: "mock-album-summer-01",
    label: "Hot day uniform",
    itemIds: ["item-01", "item-05", "item-10", "item-14"],
    aestheticId: "minimal",
    description: "Light, breathable staples with low-effort polish.",
    tags: ["Summer", "Casual"],
  },
  {
    id: "mock-album-evening-01",
    label: "Late reservation",
    itemIds: ["item-02", "item-17", "item-08", "item-11", "item-14"],
    aestheticId: "evening",
    description: "Glossy black textures balanced with a delicate finish.",
    tags: ["Evening"],
  },
  {
    id: "mock-album-travel-01",
    label: "Carry-on capsule",
    itemIds: ["item-18", "item-04", "item-07", "item-12", "item-13"],
    aestheticId: "old-money",
    description: "Repeatable neutrals for flights, meetings, and dinners.",
    tags: ["Travel", "Office"],
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

export const clothingItems: ClothingItem[] = [
  { id: "item-01", name: "Ribbed white tank", category: "top", color: "white", aesthetics: ["clean-girl", "minimal"], imageUrl: "@/assets/item-1.png", lastWorn: "2026-07-18", price: 28, wearCount: 12 },
  { id: "item-02", name: "Black silk blouse", category: "top", color: "black", aesthetics: ["office", "evening", "minimal"], imageUrl: "@/assets/item-2.png", lastWorn: "2026-07-11", price: 89, wearCount: 9 },
  { id: "item-03", name: "Cream knit polo", category: "top", color: "cream", aesthetics: ["old-money", "minimal"], imageUrl: "@/assets/item-3.png", lastWorn: null, price: 59, wearCount: 0 },
  { id: "item-04", name: "Tailored charcoal trouser", category: "bottom", color: "charcoal", aesthetics: ["office", "old-money", "minimal"], imageUrl: "@/assets/item-4.png", lastWorn: "2026-07-20", price: 120, wearCount: 11 },
  { id: "item-05", name: "Straight blue denim", category: "bottom", color: "blue", aesthetics: ["clean-girl", "streetwear"], imageUrl: "@/assets/item-1.png", lastWorn: "2026-07-13", price: 78, wearCount: 10 },
  { id: "item-06", name: "Black pleated skirt", category: "bottom", color: "black", aesthetics: ["office", "evening"], imageUrl: "@/assets/item-2.png", lastWorn: null, price: 65, wearCount: 0 },
  { id: "item-07", name: "Camel wool coat", category: "outerwear", color: "camel", aesthetics: ["old-money", "office"], imageUrl: "@/assets/item-3.png", lastWorn: "2026-07-05", price: 240, wearCount: 6 },
  { id: "item-08", name: "Cropped leather jacket", category: "outerwear", color: "black", aesthetics: ["streetwear", "evening"], imageUrl: "@/assets/item-4.png", lastWorn: "2026-07-16", price: 180, wearCount: 4 },
  { id: "item-09", name: "Ivory cardigan", category: "outerwear", color: "ivory", aesthetics: ["clean-girl", "old-money"], imageUrl: "@/assets/item-1.png", lastWorn: null, price: 52, wearCount: 0 },
  { id: "item-10", name: "White leather sneaker", category: "shoes", color: "white", aesthetics: ["clean-girl", "streetwear", "minimal"], imageUrl: "@/assets/item-2.png", lastWorn: "2026-07-21", price: 95, wearCount: 14 },
  { id: "item-11", name: "Black pointed mule", category: "shoes", color: "black", aesthetics: ["office", "evening", "minimal"], imageUrl: "@/assets/item-3.png", lastWorn: "2026-07-08", price: 110, wearCount: 7 },
  { id: "item-12", name: "Brown loafer", category: "shoes", color: "brown", aesthetics: ["old-money", "office"], imageUrl: "@/assets/item-4.png", lastWorn: null, price: 85, wearCount: 0 },
  { id: "item-13", name: "Slim black belt", category: "accessory", color: "black", aesthetics: ["office", "minimal", "old-money"], imageUrl: "@/assets/item-1.png", lastWorn: "2026-07-19", price: 30, wearCount: 8 },
  { id: "item-14", name: "Pearl studs", category: "accessory", color: "white", aesthetics: ["old-money", "clean-girl", "evening"], imageUrl: "@/assets/item-2.png", lastWorn: null, price: 45, wearCount: 0 },
  { id: "item-15", name: "Nylon shoulder bag", category: "accessory", color: "black", aesthetics: ["streetwear", "minimal"], imageUrl: "@/assets/item-3.png", lastWorn: "2026-07-09", price: 68, wearCount: 5 },
  { id: "item-16", name: "Oversized hoodie", category: "top", color: "gray", aesthetics: ["streetwear"], imageUrl: "@/assets/item-4.png", lastWorn: "2026-07-22", price: 42, wearCount: 9 },
  { id: "item-17", name: "Satin slip dress", category: "bottom", color: "black", aesthetics: ["evening", "minimal"], imageUrl: "@/assets/item-1.png", lastWorn: null, price: 75, wearCount: 0 },
  { id: "item-18", name: "Boxy white shirt", category: "top", color: "white", aesthetics: ["office", "clean-girl", "old-money"], imageUrl: "@/assets/item-2.png", lastWorn: "2026-07-15", price: 48, wearCount: 10 }
];

export const categoryLabels: Record<ClothingCategory, string> = {
  top: "Tops",
  bottom: "Bottoms",
  outerwear: "Outerwear",
  shoes: "Shoes",
  accessory: "Accessories"
};
