/**
 * Wardrobe taxonomy: categories, roles, subcategories, statuses and the labels
 * that render them. Kept separate from domain.ts so scan/confirm flows, the
 * builder and future server-side validation can share one vocabulary.
 */

import {
  AVAILABILITY_STATUSES,
  CATEGORIES,
  ITEM_ROLES,
  LIFECYCLE_STATUSES,
  PROCESSING_STATUSES,
  WARMTH_BANDS,
  type AvailabilityStatus,
  type ClothingCategory,
  type ItemRole,
  type LifecycleStatus,
  type ProcessingStatus,
  type WarmthBand,
} from "@/types/domain";

export const categoryLabels: Record<ClothingCategory, string> = {
  top: "Tops",
  bottom: "Bottoms",
  outerwear: "Outwear",
  shoes: "Shoes",
  accessory: "Accessories",
};

export const roleLabels: Record<ItemRole, string> = {
  base_top: "Base top",
  mid_layer: "Mid layer",
  outer_layer: "Outer layer",
  bottom: "Bottoms",
  one_piece: "One piece",
  footwear: "Footwear",
  bag: "Bag",
  belt: "Belt",
  hat: "Hat",
  eyewear: "Eyewear",
  jewelry: "Jewelry",
  socks: "Socks",
  scarf: "Scarf",
  other: "Other",
};

export const availabilityLabels: Record<AvailabilityStatus, string> = {
  available: "Available",
  laundry: "In laundry",
  packed: "Packed away",
  unavailable: "Unavailable",
};

export const lifecycleLabels: Record<LifecycleStatus, string> = {
  owned: "Owned",
  archived: "Archived",
  sold: "Sold",
  deleted: "Deleted",
};

export const processingLabels: Record<ProcessingStatus, string> = {
  pending: "Processing",
  ready: "Ready",
  partial: "Partially processed",
  failed: "Failed to process",
};

export const warmthLabels: Record<WarmthBand, string> = {
  light: "Light",
  medium: "Medium",
  heavy: "Heavy",
};

export const subcategoryOptions: Record<ClothingCategory, string[]> = {
  top: ["T-shirt", "Tank", "Long-sleeve", "Button-down", "Polo", "Hoodie", "Sweater", "Cardigan", "Blouse", "Turtleneck", "Crop"],
  bottom: ["Jeans", "Chinos", "Joggers", "Shorts", "Skirt", "Dress pants", "Cargo"],
  outerwear: ["Jacket", "Coat", "Blazer", "Parka", "Windbreaker", "Denim jacket", "Bomber", "Puffer"],
  shoes: ["Sneakers", "Boots", "Loafers", "Flats", "Heels", "Sandals", "Dress shoes", "Slippers"],
  accessory: ["Bag", "Belt", "Hat", "Scarf", "Sunglasses", "Jewelry", "Watch", "Socks", "Gloves", "Other"],
};

/** Conservative default role when scan/confirm only knows the category. */
export function defaultRoleForCategory(category: ClothingCategory): ItemRole {
  switch (category) {
    case "top":
      return "base_top";
    case "bottom":
      return "bottom";
    case "outerwear":
      return "outer_layer";
    case "shoes":
      return "footwear";
    case "accessory":
      return "other";
  }
}

export { AVAILABILITY_STATUSES, CATEGORIES, ITEM_ROLES, LIFECYCLE_STATUSES, PROCESSING_STATUSES, WARMTH_BANDS };