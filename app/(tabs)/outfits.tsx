import { adaptiveColors, radius, spacing, CircularGlassButton, FilterChip, ItemImage, WardrobeIcon } from "@/components/ui";
import { mockOutfitAlbums, type Item, type Outfit } from "@/data/mock";
import { useCloset } from "@/state/closet-context";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { itemImageSource } from "@/services/item-image";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

const filters = ["All", "Favorites", "Office", "Casual", "Summer", "Evening", "Travel"] as const;
type Filter = (typeof filters)[number];
type LibraryOutfit = Omit<Outfit, "source"> & { source: "saved" | "mine" | "mock" };

export default function OutfitsScreen() {
  const { items, myLooks, savedLooks, toggleSavedLook, isSavedLook } = useCloset();
  const [filter, setFilter] = useState<Filter>("All");
  const [gridWidth, setGridWidth] = useState(0);
  const [pressedId, setPressedId] = useState<string | null>(null);

  const outfits = useMemo<LibraryOutfit[]>(() => {
    const altaLooks = savedLooks.map((outfit) => ({ ...outfit, source: "saved" as const }));
    return [
      ...altaLooks,
      ...myLooks.map((outfit) => ({ ...outfit, source: "mine" as const })),
      ...mockOutfitAlbums.map((outfit) => ({ ...outfit, source: "mock" as const })),
    ];
  }, [myLooks, savedLooks]);

  const filteredOutfits = outfits.filter((outfit) => {
    if (filter === "All") return true;
    if (filter === "Favorites") return isSavedLook(outfit.id);
    return (outfit.tags ?? []).includes(filter);
  });

  const countFor = (nextFilter: Filter) => {
    if (nextFilter === "All") return outfits.length;
    if (nextFilter === "Favorites") return outfits.filter((outfit) => isSavedLook(outfit.id)).length;
    return outfits.filter((outfit) => (outfit.tags ?? []).includes(nextFilter)).length;
  };
  const gap = spacing.sm;
  const columnWidth = gridWidth > 0 ? Math.floor((gridWidth - gap) / 2) : "48%";

  return (
    <View style={{ flex: 1, backgroundColor: adaptiveColors.canvas }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xl, paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: 160 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md }}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 2, color: adaptiveColors.secondaryLabel, textTransform: "uppercase" }}>Outfit library</Text>
            <Text style={{ fontSize: 36, lineHeight: 40, fontWeight: "800", letterSpacing: -1.4, color: adaptiveColors.label }}>Outfits</Text>
            <Text style={{ fontSize: 13, lineHeight: 18, fontWeight: "600", color: adaptiveColors.secondaryLabel }}>{outfits.length} {outfits.length === 1 ? "look" : "looks"} ready to wear</Text>
          </View>
          <CircularGlassButton icon="plus" label="Build outfit" onPress={() => router.push("/builder")} />
        </View>

        <View style={{ marginHorizontal: -spacing.lg }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: 2 }}>
            {filters.map((option) => <FilterChip key={option} label={option} count={countFor(option)} selected={filter === option} onPress={() => setFilter(option)} />)}
          </ScrollView>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 13, lineHeight: 18, fontWeight: "700", color: adaptiveColors.secondaryLabel, fontVariant: ["tabular-nums"] }}>{filteredOutfits.length} {filteredOutfits.length === 1 ? "look" : "looks"}</Text>
          {filter !== "All" ? <Pressable accessibilityRole="button" onPress={() => setFilter("All")} hitSlop={8}><Text style={{ fontSize: 13, lineHeight: 18, fontWeight: "700", color: adaptiveColors.accent }}>Clear filter</Text></Pressable> : null}
        </View>

        {filteredOutfits.length > 0 ? (
          <View onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)} style={{ width: "100%", flexDirection: "row", flexWrap: "wrap", columnGap: gap, rowGap: spacing.xl }}>
            {filteredOutfits.map((outfit) => {
              const outfitItems = outfit.itemIds.map((id) => items.find((item) => item.id === id)).filter((item): item is Item => Boolean(item));
              const favorite = isSavedLook(outfit.id);
              const key = `${outfit.source}-${outfit.id}`;
              return <OutfitCard key={key} outfit={outfit} items={outfitItems} favorite={favorite} width={columnWidth} pressed={pressedId === key} onPressIn={() => setPressedId(key)} onPressOut={() => setPressedId(null)} onPress={() => router.push(`/look/${outfit.id}`)} onFavorite={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleSavedLook(outfit.id, outfit); }} />;
            })}
          </View>
        ) : <EmptyLooks filter={filter} onClear={() => setFilter("All")} onBuild={() => router.push("/builder")} />}
      </ScrollView>
    </View>
  );
}

function OutfitCard({ outfit, items, favorite, width, pressed, onPress, onPressIn, onPressOut, onFavorite }: { outfit: LibraryOutfit; items: Item[]; favorite: boolean; width: number | string; pressed: boolean; onPress: () => void; onPressIn: () => void; onPressOut: () => void; onFavorite: () => void }) {
  return (
    <View style={{ width: width as number, gap: spacing.xs }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open ${outfit.label}`} onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} style={{ transform: [{ scale: pressed ? 0.96 : 1 }] }}>
        <View style={{ aspectRatio: 0.92, padding: 7, borderRadius: radius.lg, borderCurve: "continuous", overflow: "hidden", backgroundColor: adaptiveColors.surface, borderWidth: 1, borderColor: adaptiveColors.imageOutline, boxShadow: "0 8px 24px rgba(0,0,0,0.045)" }}>
          {outfit.previewUri ? <Image source={itemImageSource(outfit.previewUri)} contentFit="cover" style={{ width: "100%", height: "100%", borderRadius: 14 }} /> : <OutfitArtwork items={items} />}
          <View style={{ position: "absolute", top: 10, right: 10 }}>
            <CircularGlassButton icon={favorite ? "heart.fill" : "heart"} label={favorite ? "Remove saved outfit" : "Save outfit"} size={36} selected={favorite} tintColor={favorite ? adaptiveColors.destructive : adaptiveColors.label} onPress={onFavorite} />
          </View>
          {outfit.source === "mine" ? <View style={{ position: "absolute", left: 12, bottom: 12, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: "rgba(23,20,15,0.72)" }}><Text style={{ fontSize: 9, lineHeight: 12, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase", color: "#FFFFFF" }}>Custom</Text></View> : null}
        </View>
      </Pressable>
      <View style={{ paddingHorizontal: 3, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontSize: 14, lineHeight: 19, fontWeight: "700", color: adaptiveColors.label }}>{outfit.label}</Text>
        <Text numberOfLines={1} style={{ fontSize: 11, lineHeight: 15, fontWeight: "500", color: adaptiveColors.secondaryLabel }}>{outfit.description}</Text>
      </View>
    </View>
  );
}

function OutfitArtwork({ items }: { items: Item[] }) {
  const previews = items.slice(0, 4);
  if (previews.length === 0) return <Image source={require("@/assets/look-preview.png")} contentFit="contain" style={{ width: "100%", height: "100%", borderRadius: 14, backgroundColor: adaptiveColors.surfaceMuted }} />;
  const single = previews.length === 1;
  const pair = previews.length === 2;
  return (
    <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
      {previews.map((item) => <ItemImage key={item.id} imageUrl={item.displayAssetUri} label={item.name} contentFit="contain" style={{ width: single ? "100%" : "49%", height: single || pair ? "100%" : "49%", aspectRatio: undefined, borderRadius: 12 }} />)}
    </View>
  );
}

function EmptyLooks({ filter, onClear, onBuild }: { filter: Filter; onClear: () => void; onBuild: () => void }) {
  const filtered = filter !== "All";
  return (
    <View style={{ alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.xxxl }}>
      <View style={{ width: 60, height: 60, borderRadius: 20, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: adaptiveColors.surfaceMuted }}><WardrobeIcon name="photo.on.rectangle.angled" color={adaptiveColors.tertiaryLabel} size={26} /></View>
      <Text style={{ fontSize: 18, lineHeight: 23, fontWeight: "700", color: adaptiveColors.label, textAlign: "center" }}>{filtered ? `No ${filter.toLowerCase()} looks` : "No outfits yet"}</Text>
      <Text style={{ maxWidth: 280, fontSize: 13, lineHeight: 19, fontWeight: "500", color: adaptiveColors.secondaryLabel, textAlign: "center" }}>{filtered ? "Try another filter or browse your full outfit library." : "Build your first outfit from pieces in your closet."}</Text>
      <Pressable accessibilityRole="button" onPress={filtered ? onClear : onBuild} style={{ minHeight: 48, marginTop: spacing.xs, paddingHorizontal: 22, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: adaptiveColors.accent }}><Text style={{ fontSize: 14, lineHeight: 19, fontWeight: "700", color: adaptiveColors.onAccent }}>{filtered ? "View all outfits" : "Build an outfit"}</Text></Pressable>
    </View>
  );
}
