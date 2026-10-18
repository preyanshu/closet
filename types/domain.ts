/**
 * Canonical wardrobe domain model.
 *
 * PR1: introduce the durable shapes that the report (docs/wardrobe-architecture-report.md)
 * describes. Consumers still render from in-memory state seeded by data/mock.ts, but the
 * model is now the contract a backend repository will sync with later.
 */

export const CATEGORIES = ["top", "bottom", "outerwear", "shoes", "accessory"] as const;
export type ClothingCategory = (typeof CATEGORIES)[number];

export const ITEM_ROLES = [
  "base_top",
  "mid_layer",
  "outer_layer",
  "bottom",
  "one_piece",
  "footwear",
  "bag",
  "belt",
  "hat",
  "eyewear",
  "jewelry",
  "socks",
  "scarf",
  "other",
] as const;
export type ItemRole = (typeof ITEM_ROLES)[number];

export const AVAILABILITY_STATUSES = ["available", "laundry", "packed", "unavailable"] as const;
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

export const LIFECYCLE_STATUSES = ["owned", "archived", "sold", "deleted"] as const;
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

export const PROCESSING_STATUSES = ["pending", "ready", "partial", "failed"] as const;
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

export const WARMTH_BANDS = ["light", "medium", "heavy"] as const;
export type WarmthBand = (typeof WARMTH_BANDS)[number];

export const AI_REVIEW_STATUSES = ["suggested", "confirmed"] as const;
export type AiReviewStatus = (typeof AI_REVIEW_STATUSES)[number];

export type AiSource = "vision_model" | "user";

/**
 * Evidence for a single AI-derived attribute. User corrections must win over later
 * reprocessing, so each attribute remembers where its value came from.
 */
export type AiAttribute = {
  field: string;
  value: string;
  source: AiSource;
  sourceAssetId?: string;
  modelVersion?: string;
  schemaVersion: number;
  reviewStatus: AiReviewStatus;
  /** Model confidence in [0, 1]; low values surface as tap-to-confirm chips. */
  confidence?: number;
  generatedAt?: string;
  updatedAt?: string;
};

/**
 * Monetary amount in integer minor units plus an ISO 4217 currency code.
 * `minor: null` means UNKNOWN — distinct from zero (a confirmed free item).
 */
export type Money = {
  minor: number | null;
  currency: string;
};

export type Item = {
  id: string;
  ownerId?: string;
  name: string;
  category: ClothingCategory;
  /** Distinguishes cardigan vs shirt vs ring within a category. */
  subcategory?: string;
  /** Renders into the builder as base_top / mid_layer / outer / bottom / footwear / jewelry… */
  role: ItemRole;
  primaryColor: string;
  secondaryColors: string[];
  /** Style-level tags only (minimal, classic, sporty). Occasion/formality stay separate. */
  styleTags: string[];
  pattern?: string;
  sleeveLength?: string;
  fit?: string;
  /**
   * Visual appearance only ("satin-like"). NOT a factual claim ("100% silk").
   * See report §6.
   */
  visibleTexture?: string;
  /** Soft band: casual → formal. A suggestion, not a fact. */
  formality?: string;
  warmthBand?: WarmthBand;
  brand?: string;
  /** Source-of-truth photo (camera, library, import). Never replaced by staging. */
  originalAssetUri: string;
  /** Clean thumb/segmented display version. The original stays available. */
  displayAssetUri: string;
  priceMinor: number | null;
  priceCurrency: string;
  /** Keep as a valid-but-derived counter; real history moves to wear_events in a later PR. */
  wearCount: number;
  lastWorn?: string | null;
  /** "In laundry" is not "no longer owned" — see report §5. */
  availabilityStatus: AvailabilityStatus;
  lifecycleStatus: LifecycleStatus;
  processingStatus: ProcessingStatus;
  createdAt: string;
  updatedAt: string;
  /** Bumps on edit so stale AI/recommendation output can be detected. */
  revision: number;
  aiAttributes?: AiAttribute[];
};

export type OutfitSource = "manual" | "recommended" | "imported" | "demo";

export type OutfitItemRef = {
  itemId: string;
  role: ItemRole;
  layerOrder?: number;
};

export type OutfitMetadata = {
  occasion?: string;
  season?: string;
  palette?: string;
  stylingNote?: string;
  demo?: boolean;
};

export type Outfit = {
  id: string;
  ownerId?: string;
  label: string;
  source: OutfitSource;
  description: string;
  /** Flat list for backwards-compatible rendering. */
  itemIds: string[];
  /** Canonical composition: roles + ordering (layers, jewelry, etc.). */
  items?: OutfitItemRef[];
  /** Legacy style anchor keep for the current UI. */
  aestheticId: string;
  tags?: string[];
  previewUri?: string;
  metadata?: OutfitMetadata;
  isDemo?: boolean;
  currentRevisionId?: string;
  archivedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type WearSource = "manual" | "photo_suggestion" | "imported";

/**
 * A confirmed wear. `wearCount`/`lastWorn` on Item will be derived from these
 * events once the repository lands. Unique days worn = distinct localDate values.
 */
export type WearEvent = {
  id: string;
  ownerId?: string;
  localDate: string;
  timezone: string;
  occurredAt?: string;
  outfitId?: string;
  outfitRevisionId?: string;
  itemIds: string[];
  source: WearSource;
  createdAt: string;
  updatedAt: string;
  undoneAt?: string;
};

export type Plan = {
  id: string;
  ownerId?: string;
  localDate: string;
  outfitId?: string;
  outfitRevisionId?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type FeedbackKind = "save" | "reject" | "swap" | "favorite" | "impression";

export type FeedbackEvent = {
  id: string;
  ownerId?: string;
  kind: FeedbackKind;
  outfitId?: string;
  outfitRevisionId?: string;
  itemId?: string;
  context?: string;
  createdAt: string;
};

/** Price in major units, or null when unknown. */
export function priceToNumber(item: Pick<Item, "priceMinor">): number | null {
  return item.priceMinor == null ? null : item.priceMinor / 100;
}

export function formatPrice(
  item: Pick<Item, "priceMinor" | "priceCurrency">,
  maximumFractionDigits?: number,
): string {
  const amount = priceToNumber(item);
  if (amount == null) return "—";
  const currency = item.priceCurrency || "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: maximumFractionDigits ?? (Number.isInteger(amount) ? 0 : 2),
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

export function itemDisplayUri(item: Pick<Item, "displayAssetUri">): string {
  return item.displayAssetUri;
}