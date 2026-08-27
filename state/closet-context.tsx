import { clothingItems, type ClothingItem, type Outfit } from "@/data/mock";
import { createContext, type PropsWithChildren, use, useCallback, useMemo, useState } from "react";

type ClosetContextValue = {
  items: ClothingItem[];
  addMockItem: () => ClothingItem;
  addItem: (item: ClothingItem) => void;
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
  const [items, setItems] = useState<ClothingItem[]>(clothingItems);
  const [myLooks, setMyLooks] = useState<Outfit[]>([]);
  const [savedLookIds, setSavedLookIds] = useState<Set<string>>(new Set());
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [stylePreferences, setStylePreferences] = useState<string[]>(["minimal", "old-money"]);

  const addMockItem = useCallback((): ClothingItem => {
    const newItem: ClothingItem = {
      id: `mock-scan-${Date.now()}`,
      name: "Scanned black tee",
      category: "top",
      color: "black",
      aesthetics: ["minimal", "streetwear"],
      imageUrl: "mock://scanned-black-tee",
      lastWorn: null,
      price: 49,
      wearCount: 0,
    };
    setItems((prev) => [newItem, ...prev]);
    return newItem;
  }, []);

  const addItem = useCallback((item: ClothingItem) => {
    setItems((prev) => [item, ...prev]);
  }, []);

  const addMyLook = useCallback((outfit: Outfit) => {
    setMyLooks((prev) => [outfit, ...prev]);
  }, []);

  const removeMyLook = useCallback((outfitId: string) => {
    setMyLooks((prev) => prev.filter((l) => l.id !== outfitId));
  }, []);

  const toggleSavedLook = useCallback((outfitId: string) => {
    setSavedLookIds((prev) => {
      const next = new Set(prev);
      if (next.has(outfitId)) next.delete(outfitId);
      else next.add(outfitId);
      return next;
    });
  }, []);

  const isSavedLook = useCallback((outfitId: string) => savedLookIds.has(outfitId), [savedLookIds]);

  const toggleFavorite = useCallback((itemId: string) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  const isFavorite = useCallback((itemId: string) => favoriteIds.has(itemId), [favoriteIds]);

  const value = useMemo<ClosetContextValue>(() => ({
    items,
    addMockItem,
    addItem,
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
  }), [items, myLooks, savedLookIds, favoriteIds, stylePreferences, addMockItem, addItem, addMyLook, removeMyLook, toggleSavedLook, isSavedLook, toggleFavorite, isFavorite]);

  return <ClosetContext value={value}>{children}</ClosetContext>;
}

export function useCloset() {
  const context = use(ClosetContext);
  if (!context) throw new Error("useCloset must be used inside ClosetProvider");
  return context;
}
