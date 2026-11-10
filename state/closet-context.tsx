import type { Item, Outfit } from "@/data/mock";
import type { WearEvent } from "@/types/domain";
import { DEFAULT_WEARER_PRESENTATION, type UserProfileMetadata } from "@/types/domain";
import { guessAlternateRoles } from "@/services/item-roles";
import { backfillVibes } from "@/services/vibe-backfill";
import { setCloudUser } from "@/services/cloud/cloud-store";
import { useAuth } from "@/state/auth-context";
import {
  PREFERENCE_KEYS,
  deleteItem,
  deleteOutfit,
  deletePreferencesLike,
  loadWardrobeSnapshot,
  persistItem,
  persistOutfit,
  readPreferenceValue,
  recordWearEvent,
  resetRepositoryCache,
  saveProfileMetadata,
  writePreference,
} from "@/services/storage/wardrobe-repository";
import { createContext, type PropsWithChildren, use, useCallback, useEffect, useMemo, useRef, useState } from "react";

type ClosetContextValue = {
  /** True once the signed-in user's closet has loaded from the cloud (or there is nobody to load for). */
  isHydrated: boolean;
  /** Why loading failed (no connection...), or undefined. */
  loadError?: string;
  /** Quietly load again from the cloud to pick up changes made on another device. Failures are ignored. */
  reload: () => Promise<void>;
  /** Retry after the first load failed. */
  retryLoad: () => Promise<void>;
  /** Whether first-run onboarding is finished, on this device or any other. */
  onboardingDone: boolean;
  completeOnboarding: () => void;
  items: Item[];
  addItem: (item: Item) => void;
  updateItem: (item: Item) => void;
  removeItem: (itemId: string) => void;
  /** Remove several pieces at once, cleaning up looks that lose all their pieces. */
  removeItems: (itemIds: string[]) => void;
  /** Set availability (available / laundry / …) on several pieces at once. */
  setAvailability: (itemIds: string[], status: Item["availabilityStatus"]) => void;
  /** Favorite or unfavorite several pieces at once. */
  setFavorites: (itemIds: string[], favorite: boolean) => void;
  addedMessage: string | null;
  setAddedMessage: (message: string | null) => void;
  myLooks: Outfit[];
  addMyLook: (outfit: Outfit) => void;
  removeMyLook: (outfitId: string) => void;
  /** Confirmed wear event: bumps wearCount/lastWorn on each item, persists the event. */
  logWear: (outfitId: string, itemIds: string[], localDate?: string) => void;
  /** LLM-recommended looks the user saved; persisted so they survive new daily batches. */
  savedLooks: Outfit[];
  savedLookIds: Set<string>;
  /** `outfit` may come from any view-model shape; source is overridden to "recommended" on save. */
  toggleSavedLook: (outfitId: string, outfit?: Omit<Outfit, "source">) => void;
  isSavedLook: (outfitId: string) => boolean;
  favoriteIds: Set<string>;
  toggleFavorite: (itemId: string) => void;
  isFavorite: (itemId: string) => boolean;
  /** Heart on the Outfits library: a flag only, never adds or removes the look itself. */
  toggleFavoriteLook: (outfitId: string) => void;
  isFavoriteLook: (outfitId: string) => boolean;
  stylePreferences: string[];
  setStylePreferences: (prefs: string[]) => void;
  /** User profile metadata (presentation etc.) used to tailor looks. */
  profile: UserProfileMetadata;
  updateProfile: (profile: UserProfileMetadata) => void;
};

const ClosetContext = createContext<ClosetContextValue | null>(null);

export function ClosetProvider({ children }: PropsWithChildren) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [addedMessage, setAddedMessage] = useState<string | null>(null);
  const [myLooks, setMyLooks] = useState<Outfit[]>([]);
  const [savedLooks, setSavedLooks] = useState<Outfit[]>([]);
  const [savedLookIds, setSavedLookIds] = useState<Set<string>>(() => new Set());
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set());
  const [favoriteLookIds, setFavoriteLookIds] = useState<Set<string>>(() => new Set());
  const [stylePreferences, setStylePreferencesState] = useState<string[]>([]);
  const [profile, setProfile] = useState<UserProfileMetadata>({ presentation: DEFAULT_WEARER_PRESENTATION });

  const [loadError, setLoadError] = useState<string | undefined>();
  const [onboardingDone, setOnboardingDone] = useState(false);
  const { user, status: authStatus } = useAuth();
  const userId = user?.id ?? null;

  // The newest values, for the handoff below (answers given before an account existed).
  const latest = useRef({ profile, stylePreferences, onboardingDone });
  latest.current = { profile, stylePreferences, onboardingDone };

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  /** Load everything for the signed-in user from the cloud into state. */
  const hydrate = useCallback((silent = false): Promise<void> => {
    return loadWardrobeSnapshot()
      .then(async (snapshot) => {
        const flagRaw = await readPreferenceValue(PREFERENCE_KEYS.vibeBackfill).catch(() => null);
        if (!mountedRef.current) return;

        // Onboarding answered before there was an account: save it to this account now,
        // unless the account already has its own (then the cloud wins).
        let done = snapshot.onboardingDone;
        let profileNow = snapshot.profile;
        let styleNow = snapshot.stylePreferences ?? [];
        if (!done && latest.current.onboardingDone) {
          done = true;
          profileNow = latest.current.profile;
          styleNow = latest.current.stylePreferences;
          void writePreference(PREFERENCE_KEYS.onboardingDone, new Date().toISOString());
          void writePreference(PREFERENCE_KEYS.profile, JSON.stringify(profileNow));
          void writePreference(PREFERENCE_KEYS.style, JSON.stringify(styleNow));
        }

        const nonDemo = snapshot.outfits.filter((outfit) => !outfit.isDemo);
        const itemIds = new Set(snapshot.items.map((item) => item.id));
        const resolvable = (outfit: Outfit) => outfit.itemIds.some((id) => itemIds.has(id));
        // Drop looks whose pieces are all gone (left over after item deletion).
        const stale = nonDemo.filter((outfit) => !resolvable(outfit));
        for (const outfit of stale) void deleteOutfit(outfit.id);
        const kept = nonDemo.filter(resolvable);
        const keptRecommended = kept.filter((outfit) => outfit.source === "recommended");
        const keptSavedIds = snapshot.savedLookIds.filter((id) => keptRecommended.some((outfit) => outfit.id === id));
        // Bring older pieces and looks up to date with the vibe catalog. Tags are added once per
        // wearer setting (so a tag the user later removes stays removed); unsuitable ones always go.
        const presentation = profileNow.presentation;
        let appliedFor: string | undefined;
        try { appliedFor = (JSON.parse(flagRaw ?? "{}") as { presentation?: string }).presentation; } catch { /* first run */ }
        const addDerived = appliedFor !== presentation;
        const filled = backfillVibes({ items: snapshot.items, looks: kept, presentation, addDerived });
        for (const item of filled.changedItems) persistItem(item);
        for (const look of filled.changedLooks) persistOutfit(look);
        if (addDerived) {
          void writePreference(PREFERENCE_KEYS.vibeBackfill, JSON.stringify({ presentation }));
          // Retired caches from before the single daily pool.
          void deletePreferencesLike("daily_looks_v1");
          void deletePreferencesLike("daily_looks_last_v1");
        }
        const migrated = filled.looks;
        setItems(filled.items);
        setMyLooks(migrated.filter((outfit) => outfit.source !== "recommended"));
        setSavedLooks(migrated.filter((outfit) => outfit.source === "recommended"));
        setSavedLookIds(new Set(keptSavedIds));
        if (keptSavedIds.length !== snapshot.savedLookIds.length) {
          void writePreference(PREFERENCE_KEYS.savedLooks, JSON.stringify(keptSavedIds));
        }
        setFavoriteIds(new Set(snapshot.favoriteIds));
        setFavoriteLookIds(new Set(snapshot.favoriteLookIds));
        setStylePreferencesState(styleNow);
        setProfile(profileNow);
        setOnboardingDone(done);
        setLoadError(undefined);
        setIsHydrated(true);
      })
      .catch((error) => {
        if (!mountedRef.current || silent) return;
        // Never show an empty closet because the load failed; say so and offer a retry.
        setLoadError(error instanceof Error ? error.message : "Couldn't load your closet. Check your connection and try again.");
        setIsHydrated(false);
      });
  }, []);

  const previousUserRef = useRef<string | null>(null);

  // Follow the signed-in account: load its closet, and clear everything when it signs out or changes.
  useEffect(() => {
    setCloudUser(userId);
    const previous = previousUserRef.current;
    if (previous && previous !== userId) {
      resetRepositoryCache();
      setItems([]);
      setMyLooks([]);
      setSavedLooks([]);
      setSavedLookIds(new Set());
      setFavoriteIds(new Set());
      setFavoriteLookIds(new Set());
      setStylePreferencesState([]);
      setProfile({ presentation: DEFAULT_WEARER_PRESENTATION });
      setOnboardingDone(false);
    }
    previousUserRef.current = userId;
    setLoadError(undefined);
    if (!userId) {
      // Nobody signed in: nothing to load. (Wait while the saved session is still being checked.)
      setIsHydrated(authStatus !== "loading");
      return;
    }
    setIsHydrated(false);
    void hydrate(false);
  }, [userId, authStatus, hydrate]);

  const completeOnboarding = useCallback(() => {
    setOnboardingDone(true);
    void writePreference(PREFERENCE_KEYS.onboardingDone, new Date().toISOString());
  }, []);

  /** Once a piece's photos are in the cloud, point at those instead of the temporary local files. */
  const swapInCloudLinks = useCallback((saved: Item) => {
    setItems((prev) => prev.map((entry) => (entry.id === saved.id
      ? { ...entry, displayAssetUri: saved.displayAssetUri, originalAssetUri: saved.originalAssetUri, displayAssetPath: saved.displayAssetPath, originalAssetPath: saved.originalAssetPath }
      : entry)));
  }, []);

  const addItem = useCallback((input: Item) => {
    // Always record what the piece can do, so it never waits for the next backfill.
    const item: Item = { ...input, alternateRoles: input.alternateRoles ?? guessAlternateRoles(input) };
    setItems((prev) => [item, ...prev]);
    persistItem(item, swapInCloudLinks);
  }, [swapInCloudLinks]);

  const updateItem = useCallback((item: Item) => {
    setItems((prev) => prev.map((entry) => (entry.id === item.id ? item : entry)));
    persistItem(item, swapInCloudLinks);
  }, [swapInCloudLinks]);

  const removeItems = useCallback((itemIds: string[]) => {
    const gone = new Set(itemIds);
    if (gone.size === 0) return;
    const nextItems = items.filter((item) => !gone.has(item.id));
    const remaining = new Set(nextItems.map((item) => item.id));
    const orphaned = (look: Outfit) => !look.itemIds.some((id) => remaining.has(id));
    const staleSaved = savedLooks.filter(orphaned);
    const staleMine = myLooks.filter(orphaned);

    setItems(nextItems);
    setMyLooks(myLooks.filter((look) => !orphaned(look)));
    setSavedLooks(savedLooks.filter((look) => !orphaned(look)));
    for (const look of staleMine) void deleteOutfit(look.id);
    if (staleSaved.length > 0) {
      const nextIds = new Set(savedLookIds);
      for (const look of staleSaved) {
        nextIds.delete(look.id);
        void deleteOutfit(look.id);
      }
      setSavedLookIds(nextIds);
      void writePreference(PREFERENCE_KEYS.savedLooks, JSON.stringify([...nextIds]));
    }
    if (itemIds.some((id) => favoriteIds.has(id))) {
      const nextFavorites = new Set([...favoriteIds].filter((id) => !gone.has(id)));
      setFavoriteIds(nextFavorites);
      void writePreference(PREFERENCE_KEYS.favorites, JSON.stringify([...nextFavorites]));
    }
    for (const id of gone) {
      const removed = items.find((item) => item.id === id);
      deleteItem(id, [removed?.displayAssetPath, removed?.originalAssetPath]);
    }
  }, [items, savedLooks, myLooks, savedLookIds, favoriteIds]);

  const removeItem = useCallback((itemId: string) => removeItems([itemId]), [removeItems]);

  const setAvailability = useCallback((itemIds: string[], status: Item["availabilityStatus"]) => {
    const targets = new Set(itemIds);
    const now = new Date().toISOString();
    const changed = items.filter((item) => targets.has(item.id) && item.availabilityStatus !== status).map((item) => ({ ...item, availabilityStatus: status, updatedAt: now }));
    if (changed.length === 0) return;
    const byId = new Map(changed.map((item) => [item.id, item]));
    setItems((prev) => prev.map((item) => byId.get(item.id) ?? item));
    for (const item of changed) void persistItem(item);
  }, [items]);

  const setFavorites = useCallback((itemIds: string[], favorite: boolean) => {
    const next = new Set(favoriteIds);
    for (const id of itemIds) {
      if (favorite) next.add(id);
      else next.delete(id);
    }
    setFavoriteIds(next);
    void writePreference(PREFERENCE_KEYS.favorites, JSON.stringify([...next]));
  }, [favoriteIds]);

  const logWear = useCallback((outfitId: string, itemIds: string[], localDate?: string) => {
    const now = new Date().toISOString();
    const date = localDate ?? now.slice(0, 10);
    const event: WearEvent = {
      id: `wear-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      localDate: date,
      timezone: "UTC",
      occurredAt: now,
      outfitId,
      itemIds,
      source: "manual",
      createdAt: now,
      updatedAt: now,
    };
    void recordWearEvent(event);
    setItems((prev) => {
      const updated = prev.map((item) => (
        itemIds.includes(item.id)
          ? { ...item, wearCount: item.wearCount + 1, lastWorn: date, updatedAt: now }
          : item
      ));
      for (const item of updated) {
        if (itemIds.includes(item.id)) void persistItem(item);
      }
      return updated;
    });
  }, []);

  const addMyLook = useCallback((outfit: Outfit) => {
    setMyLooks((prev) => [outfit, ...prev]);
    void persistOutfit(outfit);
  }, []);

  const removeMyLook = useCallback((outfitId: string) => {
    setMyLooks((prev) => prev.filter((look) => look.id !== outfitId));
    void deleteOutfit(outfitId);
  }, []);

  const toggleSavedLook = useCallback((outfitId: string, outfit?: Omit<Outfit, "source">) => {
    setSavedLookIds((prev) => {
      const next = new Set(prev);
      const removing = next.has(outfitId);
      if (removing) next.delete(outfitId);
      else next.add(outfitId);
      void writePreference(PREFERENCE_KEYS.savedLooks, JSON.stringify([...next]));
      if (outfit && !removing) {
        const persisted: Outfit = { ...outfit, source: "recommended" };
        setSavedLooks((current) => (current.some((entry) => entry.id === persisted.id) ? current : [persisted, ...current]));
        void persistOutfit(persisted);
      } else if (removing) {
        setSavedLooks((current) => current.filter((entry) => entry.id !== outfitId));
        void deleteOutfit(outfitId);
      }
      return next;
    });
  }, []);

  const isSavedLook = useCallback((outfitId: string) => savedLookIds.has(outfitId), [savedLookIds]);

  const toggleFavorite = useCallback((itemId: string) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      void writePreference(PREFERENCE_KEYS.favorites, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const isFavorite = useCallback((itemId: string) => favoriteIds.has(itemId), [favoriteIds]);

  const toggleFavoriteLook = useCallback((outfitId: string) => {
    setFavoriteLookIds((prev) => {
      const next = new Set(prev);
      if (next.has(outfitId)) next.delete(outfitId);
      else next.add(outfitId);
      void writePreference(PREFERENCE_KEYS.favoriteLooks, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const isFavoriteLook = useCallback((outfitId: string) => favoriteLookIds.has(outfitId), [favoriteLookIds]);

  const setStylePreferences = useCallback((prefs: string[]) => {
    setStylePreferencesState(prefs);
    void writePreference(PREFERENCE_KEYS.style, JSON.stringify(prefs));
  }, []);

  const updateProfile = useCallback((next: UserProfileMetadata) => {
    const presentationChanged = next.presentation !== profile.presentation;
    setProfile(next);
    void saveProfileMetadata(next);
    if (!presentationChanged) return;
    // A different wearer setting means different suitable vibes: re-tag pieces and looks for it.
    const filled = backfillVibes({ items, looks: [...myLooks, ...savedLooks], presentation: next.presentation, addDerived: true });
    if (filled.changedItems.length > 0) {
      const byId = new Map(filled.items.map((item) => [item.id, item]));
      setItems((prev) => prev.map((item) => byId.get(item.id) ?? item));
      for (const item of filled.changedItems) void persistItem(item);
    }
    if (filled.changedLooks.length > 0) {
      const byId = new Map(filled.looks.map((look) => [look.id, look]));
      setMyLooks((prev) => prev.map((look) => byId.get(look.id) ?? look));
      setSavedLooks((prev) => prev.map((look) => byId.get(look.id) ?? look));
      for (const look of filled.changedLooks) void persistOutfit(look);
    }
    void writePreference(PREFERENCE_KEYS.vibeBackfill, JSON.stringify({ presentation: next.presentation }));
  }, [profile.presentation, items, myLooks, savedLooks]);

  const value = useMemo<ClosetContextValue>(() => ({
    isHydrated,
    loadError,
    reload: () => hydrate(true),
    retryLoad: () => { setLoadError(undefined); return hydrate(false); },
    onboardingDone,
    completeOnboarding,
    items,
    addItem,
    updateItem,
    removeItem,
    removeItems,
    setAvailability,
    setFavorites,
    addedMessage,
    setAddedMessage,
    myLooks,
    addMyLook,
    removeMyLook,
    savedLooks,
    savedLookIds,
    toggleSavedLook,
    isSavedLook,
    favoriteIds,
    toggleFavorite,
    isFavorite,
    toggleFavoriteLook,
    isFavoriteLook,
    logWear,
    stylePreferences,
    setStylePreferences,
    profile,
    updateProfile,
  }), [isHydrated, loadError, hydrate, onboardingDone, completeOnboarding, items, addedMessage, myLooks, savedLooks, savedLookIds, favoriteIds, favoriteLookIds, stylePreferences, profile, addItem, updateItem, removeItem, removeItems, setAvailability, setFavorites, addMyLook, removeMyLook, toggleSavedLook, isSavedLook, toggleFavorite, isFavorite, toggleFavoriteLook, isFavoriteLook, logWear, setStylePreferences, updateProfile]);

  return <ClosetContext value={value}>{children}</ClosetContext>;
}

export function useCloset() {
  const context = use(ClosetContext);
  if (!context) throw new Error("useCloset must be used inside ClosetProvider");
  return context;
}
