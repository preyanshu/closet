import type { Item, Outfit } from "@/data/mock";
import {
  PREFERENCE_KEYS,
  deleteOutfit,
  loadWardrobeSnapshot,
  persistItem,
  persistOutfit,
  writePreference,
} from "@/services/storage/wardrobe-repository";
import { createContext, type PropsWithChildren, use, useCallback, useEffect, useMemo, useState } from "react";

type ClosetContextValue = {
  isHydrated: boolean;
  items: Item[];
  addItem: (item: Item) => void;
  addedMessage: string | null;
  setAddedMessage: (message: string | null) => void;
  myLooks: Outfit[];
  addMyLook: (outfit: Outfit) => void;
  removeMyLook: (outfitId: string) => void;
  savedLookIds: Set<string>;
  toggleSavedLook: (outfitId: string) => void;
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
  const [savedLookIds, setSavedLookIds] = useState<Set<string>>(() => new Set());
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set());
  const [stylePreferences, setStylePreferencesState] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    loadWardrobeSnapshot()
      .then((snapshot) => {
        if (!active) return;
        setItems(snapshot.items);
        setMyLooks(snapshot.outfits.filter((outfit) => !outfit.isDemo));
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

  const addMyLook = useCallback((outfit: Outfit) => {
    setMyLooks((prev) => [outfit, ...prev]);
    void persistOutfit(outfit);
  }, []);

  const removeMyLook = useCallback((outfitId: string) => {
    setMyLooks((prev) => prev.filter((look) => look.id !== outfitId));
    void deleteOutfit(outfitId);
  }, []);

  const toggleSavedLook = useCallback((outfitId: string) => {
    setSavedLookIds((prev) => {
      const next = new Set(prev);
      if (next.has(outfitId)) next.delete(outfitId);
      else next.add(outfitId);
      void writePreference(PREFERENCE_KEYS.savedLooks, JSON.stringify([...next]));
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
    addedMessage,
    setAddedMessage,
    myLooks,
    addMyLook,
    removeMyLook,
    savedLookIds,
    toggleSavedLook,
    isSavedLook,
    favoriteIds,
    toggleFavorite,
    isFavorite,
    stylePreferences,
    setStylePreferences,
  }), [isHydrated, items, addedMessage, myLooks, savedLookIds, favoriteIds, stylePreferences, addItem, addMyLook, removeMyLook, toggleSavedLook, isSavedLook, toggleFavorite, isFavorite, setStylePreferences]);

  return <ClosetContext value={value}>{children}</ClosetContext>;
}

export function useCloset() {
  const context = use(ClosetContext);
  if (!context) throw new Error("useCloset must be used inside ClosetProvider");
  return context;
}
