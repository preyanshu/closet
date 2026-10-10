import { clothingItems, mockOutfitAlbums } from "@/data/mock";
import type {
  AvailabilityStatus,
  FeedbackEvent,
  Item,
  ItemRole,
  LifecycleStatus,
  Outfit,
  OutfitItemRef,
  OutfitMetadata,
  OutfitSource,
  Plan,
  ProcessingStatus,
  WarmthBand,
  WearEvent,
} from "@/types/domain";
import { getDatabase, type WardrobeDatabase } from "@/services/storage/database";

export type WardrobeSnapshot = {
  items: Item[];
  outfits: Outfit[];
  savedLookIds: string[];
  favoriteIds: string[];
  stylePreferences: string[] | null;
};

export const PREFERENCE_KEYS = {
  savedLooks: "saved_look_ids",
  favorites: "favorite_item_ids",
  style: "style_preferences",
} as const;

const DEFAULT_SAVED_LOOK_IDS = ["mock-album-office-01", "mock-album-casual-01"];
const DEFAULT_FAVORITE_IDS = ["item-02", "item-07", "item-10"];
const DEFAULT_STYLE_PREFERENCES = ["minimal", "old-money"];

const ITEM_COLUMNS = [
  "id", "owner_id", "name", "category", "subcategory", "role", "primary_color",
  "secondary_colors", "style_tags", "pattern", "sleeve_length", "fit", "visible_texture",
  "formality", "warmth_band", "brand", "original_asset_uri", "display_asset_uri",
  "price_minor", "price_currency", "wear_count", "last_worn", "availability_status",
  "lifecycle_status", "processing_status", "created_at", "updated_at", "revision", "ai_attributes",
] as const;

const OUTFIT_COLUMNS = [
  "id", "owner_id", "label", "source", "description", "item_ids", "items", "aesthetic_id",
  "tags", "preview_uri", "metadata", "is_demo", "current_revision_id", "archived_at",
  "created_at", "updated_at",
] as const;

type ItemRow = {
  id: string; owner_id: string | null; name: string; category: string; subcategory: string | null;
  role: string; primary_color: string; secondary_colors: string; style_tags: string;
  pattern: string | null; sleeve_length: string | null; fit: string | null; visible_texture: string | null;
  formality: string | null; warmth_band: string | null; brand: string | null;
  original_asset_uri: string; display_asset_uri: string; price_minor: number | null;
  price_currency: string; wear_count: number; last_worn: string | null; availability_status: string;
  lifecycle_status: string; processing_status: string; created_at: string; updated_at: string;
  revision: number; ai_attributes: string | null;
};

type OutfitRow = {
  id: string; owner_id: string | null; label: string; source: string; description: string;
  item_ids: string; items: string | null; aesthetic_id: string; tags: string | null;
  preview_uri: string | null; metadata: string | null; is_demo: number; current_revision_id: string | null;
  archived_at: string | null; created_at: string | null; updated_at: string | null;
};

function bind(columns: readonly string[]): string {
  return columns.map(() => "?").join(", ");
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function itemToRow(item: Item): (string | number | null)[] {
  return [
    item.id, item.ownerId ?? null, item.name, item.category, item.subcategory ?? null, item.role,
    item.primaryColor, JSON.stringify(item.secondaryColors), JSON.stringify(item.styleTags),
    item.pattern ?? null, item.sleeveLength ?? null, item.fit ?? null, item.visibleTexture ?? null,
    item.formality ?? null, item.warmthBand ?? null, item.brand ?? null, item.originalAssetUri,
    item.displayAssetUri, item.priceMinor, item.priceCurrency, item.wearCount, item.lastWorn ?? null,
    item.availabilityStatus, item.lifecycleStatus, item.processingStatus, item.createdAt, item.updatedAt,
    item.revision, item.aiAttributes ? JSON.stringify(item.aiAttributes) : null,
  ];
}

function rowToItem(row: ItemRow): Item {
  return {
    id: row.id,
    ownerId: row.owner_id ?? undefined,
    name: row.name,
    category: row.category as Item["category"],
    subcategory: row.subcategory ?? undefined,
    role: row.role as ItemRole,
    primaryColor: row.primary_color,
    secondaryColors: parseJson<string[]>(row.secondary_colors, []),
    styleTags: parseJson<string[]>(row.style_tags, []),
    pattern: row.pattern ?? undefined,
    sleeveLength: row.sleeve_length ?? undefined,
    fit: row.fit ?? undefined,
    visibleTexture: row.visible_texture ?? undefined,
    formality: row.formality ?? undefined,
    warmthBand: (row.warmth_band as WarmthBand | null) ?? undefined,
    brand: row.brand ?? undefined,
    originalAssetUri: row.original_asset_uri,
    displayAssetUri: row.display_asset_uri,
    priceMinor: row.price_minor,
    priceCurrency: row.price_currency,
    wearCount: row.wear_count,
    lastWorn: row.last_worn,
    availabilityStatus: row.availability_status as AvailabilityStatus,
    lifecycleStatus: row.lifecycle_status as LifecycleStatus,
    processingStatus: row.processing_status as ProcessingStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: row.revision,
    aiAttributes: row.ai_attributes ? (JSON.parse(row.ai_attributes) as Item["aiAttributes"]) : undefined,
  };
}

export function outfitToRow(outfit: Outfit): (string | number | null)[] {
  return [
    outfit.id, outfit.ownerId ?? null, outfit.label, outfit.source, outfit.description,
    JSON.stringify(outfit.itemIds), outfit.items ? JSON.stringify(outfit.items) : null,
    outfit.aestheticId, outfit.tags ? JSON.stringify(outfit.tags) : null, outfit.previewUri ?? null,
    outfit.metadata ? JSON.stringify(outfit.metadata) : null, outfit.isDemo ? 1 : 0,
    outfit.currentRevisionId ?? null, outfit.archivedAt ?? null, outfit.createdAt ?? null,
    outfit.updatedAt ?? null,
  ];
}

function rowToOutfit(row: OutfitRow): Outfit {
  return {
    id: row.id,
    ownerId: row.owner_id ?? undefined,
    label: row.label,
    source: row.source as OutfitSource,
    description: row.description,
    itemIds: parseJson<string[]>(row.item_ids, []),
    items: row.items ? parseJson<OutfitItemRef[]>(row.items, []) : undefined,
    aestheticId: row.aesthetic_id,
    tags: row.tags ? parseJson<string[]>(row.tags, []) : undefined,
    previewUri: row.preview_uri ?? undefined,
    metadata: row.metadata ? parseJson<OutfitMetadata>(row.metadata, {}) : undefined,
    isDemo: row.is_demo === 1,
    currentRevisionId: row.current_revision_id ?? undefined,
    archivedAt: row.archived_at ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  };
}

/** In-memory snapshot used when no SQLite driver is available (web / failure). */
function inMemorySnapshot(): WardrobeSnapshot {
  return {
    items: [...clothingItems],
    outfits: [...mockOutfitAlbums],
    savedLookIds: [...DEFAULT_SAVED_LOOK_IDS],
    favoriteIds: [...DEFAULT_FAVORITE_IDS],
    stylePreferences: [...DEFAULT_STYLE_PREFERENCES],
  };
}

async function seedIfEmpty(db: WardrobeDatabase): Promise<void> {
  const itemCount = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM items");
  const outfitCount = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM outfits");
  const seedItems = (itemCount?.count ?? 0) === 0;
  const seedOutfits = (outfitCount?.count ?? 0) === 0;

  await db.withTransactionAsync(async () => {
    if (seedItems) {
      const statement = `INSERT INTO items (${ITEM_COLUMNS.join(", ")}) VALUES (${bind(ITEM_COLUMNS)})`;
      for (const item of clothingItems) await db.runAsync(statement, itemToRow(item));
    }
    if (seedOutfits) {
      const statement = `INSERT INTO outfits (${OUTFIT_COLUMNS.join(", ")}) VALUES (${bind(OUTFIT_COLUMNS)})`;
      for (const outfit of mockOutfitAlbums) await db.runAsync(statement, outfitToRow(outfit));
    }
  });

  await seedPreference(db, PREFERENCE_KEYS.savedLooks, JSON.stringify(DEFAULT_SAVED_LOOK_IDS));
  await seedPreference(db, PREFERENCE_KEYS.favorites, JSON.stringify(DEFAULT_FAVORITE_IDS));
  await seedPreference(db, PREFERENCE_KEYS.style, JSON.stringify(DEFAULT_STYLE_PREFERENCES));
}

async function seedPreference(db: WardrobeDatabase, key: string, value: string): Promise<void> {
  const existing = await db.getFirstAsync<{ value: string }>("SELECT value FROM preferences WHERE key = ?", key);
  if (!existing) await db.runAsync("INSERT INTO preferences (key, value) VALUES (?, ?)", key, value);
}

async function readPreference(db: WardrobeDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM preferences WHERE key = ?", key);
  return row?.value ?? null;
}

export async function loadWardrobeSnapshot(): Promise<WardrobeSnapshot> {
  const db = await getDatabase();
  if (!db) return inMemorySnapshot();

  await seedIfEmpty(db);

  const itemRows = await db.getAllAsync<ItemRow>("SELECT * FROM items ORDER BY created_at DESC, id ASC");
  const outfitRows = await db.getAllAsync<OutfitRow>("SELECT * FROM outfits");
  const savedLooks = await readPreference(db, PREFERENCE_KEYS.savedLooks);
  const favorites = await readPreference(db, PREFERENCE_KEYS.favorites);
  const style = await readPreference(db, PREFERENCE_KEYS.style);

  return {
    items: itemRows.map(rowToItem),
    outfits: outfitRows.map(rowToOutfit),
    savedLookIds: parseJson<string[]>(savedLooks, DEFAULT_SAVED_LOOK_IDS),
    favoriteIds: parseJson<string[]>(favorites, DEFAULT_FAVORITE_IDS),
    stylePreferences: style ? parseJson<string[]>(style, DEFAULT_STYLE_PREFERENCES) : null,
  };
}

export async function persistItem(item: Item): Promise<void> {
  const db = await getDatabase();
  if (!db) return;
  const statement = `INSERT OR REPLACE INTO items (${ITEM_COLUMNS.join(", ")}) VALUES (${bind(ITEM_COLUMNS)})`;
  await db.runAsync(statement, itemToRow(item));
}

export async function persistOutfit(outfit: Outfit): Promise<void> {
  const db = await getDatabase();
  if (!db) return;
  const statement = `INSERT OR REPLACE INTO outfits (${OUTFIT_COLUMNS.join(", ")}) VALUES (${bind(OUTFIT_COLUMNS)})`;
  await db.runAsync(statement, outfitToRow(outfit));
}

export async function deleteOutfit(outfitId: string): Promise<void> {
  const db = await getDatabase();
  if (!db) return;
  await db.runAsync("DELETE FROM outfits WHERE id = ?", outfitId);
}

export async function writePreference(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  if (!db) return;
  await db.runAsync("INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)", key, value);
}

export async function recordWearEvent(event: WearEvent): Promise<void> {
  const db = await getDatabase();
  if (!db) return;
  await db.runAsync(
    `INSERT OR REPLACE INTO wear_events (id, owner_id, local_date, timezone, occurred_at, outfit_id, outfit_revision_id, item_ids, source, created_at, updated_at, undone_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    event.id, event.ownerId ?? null, event.localDate, event.timezone, event.occurredAt ?? null,
    event.outfitId ?? null, event.outfitRevisionId ?? null, JSON.stringify(event.itemIds),
    event.source, event.createdAt, event.updatedAt, event.undoneAt ?? null,
  );
}

export async function savePlan(plan: Plan): Promise<void> {
  const db = await getDatabase();
  if (!db) return;
  await db.runAsync(
    `INSERT OR REPLACE INTO plans (id, owner_id, local_date, outfit_id, outfit_revision_id, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    plan.id, plan.ownerId ?? null, plan.localDate, plan.outfitId ?? null,
    plan.outfitRevisionId ?? null, plan.note ?? null, plan.createdAt, plan.updatedAt,
  );
}

export async function recordFeedbackEvent(event: FeedbackEvent): Promise<void> {
  const db = await getDatabase();
  if (!db) return;
  await db.runAsync(
    `INSERT OR REPLACE INTO feedback_events (id, owner_id, kind, outfit_id, outfit_revision_id, item_id, context, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    event.id, event.ownerId ?? null, event.kind, event.outfitId ?? null,
    event.outfitRevisionId ?? null, event.itemId ?? null, event.context ?? null, event.createdAt,
  );
}
