import type { Item, Outfit } from "@/data/mock";
import type { WearEvent } from "@/types/domain";
import {
  PREFERENCE_KEYS,
  deleteItem,
  deleteOutfit,
  loadWardrobeSnapshot,
  persistItem,
  persistOutfit,
  recordWearEvent,
  writePreference,
} from "@/services/storage/wardrobe-repository";
import { createContext, type PropsWithChildren, use, useCallback, useEffect, useMemo, useState } from "react";

type ClosetContextValue = {
  isHydrated: boolean;
  items: Item[];
  addItem: (item: Item) => void;
  updateItem: (item: Item) => void;
  removeItem: (itemId: string) => void;
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
  stylePreferences: string[];
  setStylePreferences: (prefs: string[]) => void;
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
  const [stylePreferences, setStylePreferencesState] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    loadWardrobeSnapshot()
      .then((snapshot) => {
        if (!active) return;
        const nonDemo = snapshot.outfits.filter((outfit) => !outfit.isDemo);
        setItems(snapshot.items);
        setMyLooks(nonDemo.filter((outfit) => outfit.source !== "recommended"));
        setSavedLooks(nonDemo.filter((outfit) => outfit.source === "recommended"));
        setSavedLookIds(new Set(snapshot.savedLookIds));
        setFavoriteIds(new Set(snapshot.favoriteIds));
        setStylePreferencesState(snapshot.stylePreferences ?? []);
        setIsHydrated(true);
      })
      .catch((error) => {
        console.warn("[storage] failed to load wardrobe; starting empty.", error);
        if (active) setIsHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const addItem = useCallback((item: Item) => {
    setItems((prev) => [item, ...prev]);
    void persistItem(item);
  }, []);

  const updateItem = useCallback((item: Item) => {
    setItems((prev) => prev.map((entry) => (entry.id === item.id ? item : entry)));
    void persistItem(item);
  }, []);

  const removeItem = useCallback((itemId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== itemId));
    void deleteItem(itemId);
  }, []);

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

  const setStylePreferences = useCallback((prefs: string[]) => {
    setStylePreferencesState(prefs);
    void writePreference(PREFERENCE_KEYS.style, JSON.stringify(prefs));
  }, []);

  const value = useMemo<ClosetContextValue>(() => ({
    isHydrated,
    items,
    addItem,
    updateItem,
    removeItem,
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
    logWear,
    stylePreferences,
    setStylePreferences,
  }), [isHydrated, items, addedMessage, myLooks, savedLooks, savedLookIds, favoriteIds, stylePreferences, addItem, updateItem, removeItem, addMyLook, removeMyLook, toggleSavedLook, isSavedLook, toggleFavorite, isFavorite, logWear, setStylePreferences]);

  return <ClosetContext value={value}>{children}</ClosetContext>;
}

export function useCloset() {
  const context = use(ClosetContext);
  if (!context) throw new Error("useCloset must be used inside ClosetProvider");
  return context;
}
