import { WardrobeApiError } from "@/services/api/wardrobe-api";
import { currentCloudUser, fetchAllRecords, putRecord, removeRecord } from "@/services/cloud/cloud-store";
import { isLocalFile, removeImages, signedUrls, uploadImage } from "@/services/cloud/images";
import { File, Paths } from "expo-file-system";
import { guessAlternateRoles } from "@/services/item-roles";
import type { FeedbackEvent, Item, Outfit, Plan, UserProfileMetadata, WearEvent } from "@/types/domain";
import { DEFAULT_WEARER_PRESENTATION } from "@/types/domain";

/**
 * Storage for the closet, backed entirely by the cloud (Supabase). There is no
 * on-device database: everything loads once after sign-in, and every change is
 * queued to the cloud right away (see services/cloud/cloud-store.ts).
 *
 * Preferences are small JSON blobs (favourites, saved-look ids, the daily pool,
 * look memory...). They are kept in an in-memory map after the first load so
 * reads stay instant, and written through to the cloud.
 */

export type WardrobeSnapshot = {
  items: Item[];
  outfits: Outfit[];
  savedLookIds: string[];
  favoriteIds: string[];
  favoriteLookIds: string[];
  stylePreferences: string[] | null;
  /** User profile metadata (presentation etc.) — styles are tailored to it. */
  profile: UserProfileMetadata;
  /** Whether first-run onboarding was finished on any device. */
  onboardingDone: boolean;
};

export const PREFERENCE_KEYS = {
  savedLooks: "saved_look_ids",
  favorites: "favorite_item_ids",
  favoriteLooks: "favorite_look_ids",
  style: "style_preferences",
  dailyLooks: "daily_looks_v1",
  mockCleanup: "mock_cleanup_v1",
  profile: "profile_metadata_v1",
  /** Which wearer setting the vibe tags were last brought up to date for. */
  vibeBackfill: "vibe_backfill_v1",
  /** Set when first-run onboarding is finished (an ISO timestamp). */
  onboardingDone: "onboarding_done_v1",
} as const;

const preferences = new Map<string, string>();

/** Forget everything loaded for the previous user (sign-out or a different account). */
export function resetRepositoryCache() {
  preferences.clear();
}

const parseJson = <T,>(value: string | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

// ── Items ────────────────────────────────────────────────────────────────────

/** What is stored for a piece: the record minus per-device uris, plus storage paths. Uploads photos that are still local. */
async function buildItemData(userId: string, item: Item): Promise<Record<string, unknown>> {
  let displayPath = item.displayAssetPath;
  let originalPath = item.originalAssetPath;
  if (isLocalFile(item.displayAssetUri)) displayPath = await uploadImage(userId, item.id, "display", item.displayAssetUri);
  if (item.originalAssetUri === item.displayAssetUri) originalPath = displayPath;
  else if (isLocalFile(item.originalAssetUri)) originalPath = await uploadImage(userId, item.id, "original", item.originalAssetUri);
  const { displayAssetUri, originalAssetUri, ...rest } = item;
  return {
    ...rest,
    displayAssetPath: displayPath,
    originalAssetPath: originalPath,
    // Only keep a raw uri when there is no stored photo (e.g. a bundled placeholder).
    ...(displayPath ? {} : { displayAssetUri }),
    ...(originalPath ? {} : { originalAssetUri }),
  };
}

/**
 * Save a piece. If its photos are still on this phone they upload first; `onSaved`
 * then receives the piece with cloud links so the app can stop pointing at local files.
 */
export function persistItem(item: Item, onSaved?: (saved: Item) => void): void {
  const userId = currentCloudUser();
  if (!userId) return;
  putRecord(
    "item",
    item.id,
    () => buildItemData(userId, item),
    onSaved
      ? (data) => {
          const displayPath = data.displayAssetPath as string | undefined;
          const originalPath = data.originalAssetPath as string | undefined;
          if (!displayPath && !originalPath) return;
          const uploaded = isLocalFile(item.displayAssetUri) || isLocalFile(item.originalAssetUri);
          if (!uploaded) return;
          void signedUrls([displayPath, originalPath].filter((path): path is string => Boolean(path))).then((urls) => {
            onSaved({
              ...item,
              displayAssetPath: displayPath,
              originalAssetPath: originalPath,
              displayAssetUri: (displayPath && urls.get(displayPath)) || item.displayAssetUri,
              originalAssetUri: (originalPath && urls.get(originalPath)) || item.originalAssetUri,
            });
            // The cleaned-up photo the app made is in the cloud now; don't keep a second copy on the phone.
            // (Photos from the camera roll or camera cache aren't ours to delete.) Wait a moment so the
            // screen has switched to the cloud link first.
            setTimeout(() => {
              for (const uri of new Set([item.displayAssetUri, item.originalAssetUri])) {
                if (isLocalFile(uri) && uri.startsWith(Paths.document.uri)) {
                  try { new File(uri).delete(); } catch { /* already gone */ }
                }
              }
            }, 2000);
          });
        }
      : undefined,
  );
}

export function deleteItem(itemId: string, imagePaths: Array<string | undefined> = []): void {
  removeRecord("item", itemId, () => removeImages(imagePaths.filter((path): path is string => Boolean(path))));
}

// ── Looks ────────────────────────────────────────────────────────────────────

export function persistOutfit(outfit: Outfit): void {
  // Stamp an edit time so the newest version is identifiable.
  const stamped = outfit.updatedAt ? outfit : { ...outfit, updatedAt: new Date().toISOString() };
  putRecord("outfit", outfit.id, async () => ({ ...stamped }));
}

export function deleteOutfit(outfitId: string): void {
  removeRecord("outfit", outfitId);
}

// ── Events ───────────────────────────────────────────────────────────────────

export function recordWearEvent(event: WearEvent): void {
  putRecord("wear_event", event.id, async () => ({ ...event }));
}

export function savePlan(plan: Plan): void {
  putRecord("plan", plan.id, async () => ({ ...plan }));
}

export function recordFeedbackEvent(event: FeedbackEvent): void {
  putRecord("feedback", event.id, async () => ({ ...event }));
}

// ── Preferences ──────────────────────────────────────────────────────────────

/** Read a preference (`null` when absent). Instant: they are all loaded after sign-in. */
export async function readPreferenceValue(key: string): Promise<string | null> {
  return preferences.get(key) ?? null;
}

export async function writePreference(key: string, value: string): Promise<void> {
  preferences.set(key, value);
  putRecord("preference", key, async () => ({ value }));
}

/** Delete every preference whose key starts with `prefix` (retired caches). */
export async function deletePreferencesLike(prefix: string): Promise<void> {
  for (const key of [...preferences.keys()]) {
    if (!key.startsWith(prefix)) continue;
    preferences.delete(key);
    removeRecord("preference", key);
  }
}

/** Persist the user's profile metadata (presentation etc.). */
export async function saveProfileMetadata(profile: UserProfileMetadata): Promise<void> {
  await writePreference(PREFERENCE_KEYS.profile, JSON.stringify(profile));
}

// ── Loading ──────────────────────────────────────────────────────────────────

/** Load the signed-in user's whole closet from the cloud. */
export async function loadWardrobeSnapshot(): Promise<WardrobeSnapshot> {
  const userId = currentCloudUser();
  if (!userId) throw new WardrobeApiError("Sign in to load your closet.", "not_configured", "no signed-in user");
  const records = await fetchAllRecords();

  preferences.clear();
  const rawItems: Array<Record<string, unknown>> = [];
  const outfits: Outfit[] = [];
  for (const record of records) {
    if (record.kind === "preference") preferences.set(record.id, String((record.data as { value?: unknown }).value ?? ""));
    else if (record.kind === "item") rawItems.push(record.data);
    else if (record.kind === "outfit") outfits.push(record.data as unknown as Outfit);
  }

  // One batch call signs every photo link.
  const paths = rawItems.flatMap((data) => [data.displayAssetPath, data.originalAssetPath]).filter((path): path is string => typeof path === "string" && path.length > 0);
  const urls = paths.length > 0 ? await signedUrls(paths) : new Map<string, string>();

  const items = rawItems
    .map((data) => {
      const displayPath = data.displayAssetPath as string | undefined;
      const originalPath = data.originalAssetPath as string | undefined;
      const item = {
        ...data,
        displayAssetUri: (displayPath && urls.get(displayPath)) || (data.displayAssetUri as string | undefined) || "",
        originalAssetUri: (originalPath && urls.get(originalPath)) || (data.originalAssetUri as string | undefined) || (displayPath && urls.get(displayPath)) || "",
      } as unknown as Item;
      // Pieces saved before alternate roles existed get them decided once.
      return item.alternateRoles === undefined ? { ...item, alternateRoles: guessAlternateRoles(item) } : item;
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id.localeCompare(b.id)));

  const profile = parseJson<UserProfileMetadata>(preferences.get(PREFERENCE_KEYS.profile), {});
  const style = preferences.get(PREFERENCE_KEYS.style);
  return {
    items,
    outfits,
    savedLookIds: parseJson<string[]>(preferences.get(PREFERENCE_KEYS.savedLooks), []),
    favoriteIds: parseJson<string[]>(preferences.get(PREFERENCE_KEYS.favorites), []),
    favoriteLookIds: parseJson<string[]>(preferences.get(PREFERENCE_KEYS.favoriteLooks), []),
    stylePreferences: style ? parseJson<string[]>(style, []) : null,
    profile: { presentation: profile.presentation ?? DEFAULT_WEARER_PRESENTATION },
    onboardingDone: preferences.has(PREFERENCE_KEYS.onboardingDone),
  };
}
