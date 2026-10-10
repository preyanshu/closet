import { Platform } from "react-native";

export type WardrobeDatabase = import("expo-sqlite").SQLiteDatabase;

/**
 * Ordered, append-only schema migrations. `PRAGMA user_version` tracks how many
 * have been applied, so new releases only run the SQL they still need.
 */
const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY NOT NULL,
    owner_id TEXT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    subcategory TEXT,
    role TEXT NOT NULL,
    primary_color TEXT NOT NULL,
    secondary_colors TEXT NOT NULL DEFAULT '[]',
    style_tags TEXT NOT NULL DEFAULT '[]',
    pattern TEXT,
    sleeve_length TEXT,
    fit TEXT,
    visible_texture TEXT,
    formality TEXT,
    warmth_band TEXT,
    brand TEXT,
    original_asset_uri TEXT NOT NULL,
    display_asset_uri TEXT NOT NULL,
    price_minor INTEGER,
    price_currency TEXT NOT NULL DEFAULT 'USD',
    wear_count INTEGER NOT NULL DEFAULT 0,
    last_worn TEXT,
    availability_status TEXT NOT NULL,
    lifecycle_status TEXT NOT NULL,
    processing_status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    ai_attributes TEXT
  );

  CREATE TABLE IF NOT EXISTS outfits (
    id TEXT PRIMARY KEY NOT NULL,
    owner_id TEXT,
    label TEXT NOT NULL,
    source TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    item_ids TEXT NOT NULL DEFAULT '[]',
    items TEXT,
    aesthetic_id TEXT NOT NULL DEFAULT '',
    tags TEXT,
    preview_uri TEXT,
    metadata TEXT,
    is_demo INTEGER NOT NULL DEFAULT 0,
    current_revision_id TEXT,
    archived_at TEXT,
    created_at TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS wear_events (
    id TEXT PRIMARY KEY NOT NULL,
    owner_id TEXT,
    local_date TEXT NOT NULL,
    timezone TEXT NOT NULL,
    occurred_at TEXT,
    outfit_id TEXT,
    outfit_revision_id TEXT,
    item_ids TEXT NOT NULL DEFAULT '[]',
    source TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    undone_at TEXT
  );

  CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY NOT NULL,
    owner_id TEXT,
    local_date TEXT NOT NULL,
    outfit_id TEXT,
    outfit_revision_id TEXT,
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS feedback_events (
    id TEXT PRIMARY KEY NOT NULL,
    owner_id TEXT,
    kind TEXT NOT NULL,
    outfit_id TEXT,
    outfit_revision_id TEXT,
    item_id TEXT,
    context TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS preferences (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_items_lifecycle ON items (lifecycle_status);
  CREATE INDEX IF NOT EXISTS idx_outfits_source ON outfits (source);
  CREATE INDEX IF NOT EXISTS idx_wear_events_date ON wear_events (local_date);
  CREATE INDEX IF NOT EXISTS idx_plans_date ON plans (local_date);
  `,
];

let databasePromise: Promise<WardrobeDatabase | null> | null = null;

/**
 * Opens the on-device SQLite database and brings it up to the latest schema.
 * Returns `null` on platforms without a working native SQLite driver (e.g. web
 * without the wasm setup) so callers can fall back to in-memory state.
 */
export function getDatabase(): Promise<WardrobeDatabase | null> {
  if (Platform.OS === "web") return Promise.resolve(null);
  if (!databasePromise) databasePromise = openDatabase();
  return databasePromise;
}

async function openDatabase(): Promise<WardrobeDatabase | null> {
  try {
    const SQLite = await import("expo-sqlite");
    const db = await SQLite.openDatabaseAsync("wardrobe.db");
    await db.execAsync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    await migrate(db);
    return db;
  } catch (error) {
    console.warn("[storage] SQLite unavailable; running without persistence.", error);
    return null;
  }
}

async function migrate(db: WardrobeDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  const applied = row?.user_version ?? 0;
  for (let version = applied; version < MIGRATIONS.length; version += 1) {
    await db.execAsync(MIGRATIONS[version]);
  }
  if (applied < MIGRATIONS.length) {
    await db.execAsync(`PRAGMA user_version = ${MIGRATIONS.length}`);
  }
}
