import { adaptiveColors, radius, spacing, Button, CircularGlassButton as GlassButton, GlassLayer, ItemImage, NativeSwitch, Screen, SelectionRow, Sheet, WardrobeIcon } from "@/components/ui";
import { aesthetics, categoryLabels, type ClothingCategory, type ClothingItem } from "@/data/mock";
import { useCloset } from "@/state/closet-context";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { type ComponentProps } from "react";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

type SymbolName = ComponentProps<typeof SymbolView>["name"];
type QuickFilter = "all" | "favorites" | "unworn";
type SortKey = "recent" | "costPerWear" | "mostWorn" | "price" | "name";
type LayoutMode = "cards" | "gallery";

const cardImagePadding = 12;

const categoryFilters: Array<ClothingCategory | "all"> = ["all", "top", "bottom", "outerwear", "shoes", "accessory"];
const colorOptions = ["black", "white", "navy", "gray", "brown", "cream", "blue", "camel"];
const seasonOptions = [
  { id: "spring", label: "Spring", icon: "leaf" },
  { id: "summer", label: "Summer", icon: "sun.max" },
  { id: "fall", label: "Fall", icon: "wind" },
  { id: "winter", label: "Winter", icon: "snowflake" },
] as const;

const sortOptions: Array<{ id: SortKey; label: string; subtitle: string; icon: SymbolName }> = [
  { id: "recent", label: "Recently worn", subtitle: "Latest wear first", icon: "clock" },
  { id: "costPerWear", label: "Cost per wear", subtitle: "Best value first", icon: "dollarsign.circle" },
  { id: "mostWorn", label: "Most worn", subtitle: "Your workhorses", icon: "flame" },
  { id: "price", label: "Price", subtitle: "Highest first", icon: "tag" },
  { id: "name", label: "Name", subtitle: "A to Z", icon: "textformat.abc" },
];

const swatchColor = (color: string) => {
  const map: Record<string, string> = { white: "#F5F1E8", ivory: "#F3EAD9", cream: "#EFE3CB", navy: "#1F2A44", charcoal: "#3A3A3A", camel: "#C08A4E", brown: "#6B4A2F", gray: "#8E8E93", blue: "#3B6EA8", black: "#0E0D0B" };
  return map[color] ?? color;
};

const seasonOf = (lastWorn: string | null): string | null => {
  if (!lastWorn) return null;
  const month = new Date(lastWorn).getMonth();
  if (month === 11 || month <= 1) return "winter";
  if (month <= 4) return "spring";
  if (month <= 7) return "summer";
  return "fall";
};

const costPerWearOf = (item: ClothingItem) => (item.wearCount > 0 ? item.price / item.wearCount : item.price);

const formatCostPerWear = (item: ClothingItem) => {
  const value = costPerWearOf(item);
  return `$${value < 10 ? value.toFixed(2) : Math.round(value).toString()}`;
};

export default function ClosetScreen() {
  const { items, isFavorite, toggleFavorite } = useCloset();
  const [category, setCategory] = useState<ClothingCategory | "all">("all");
  const [quick, setQuick] = useState<QuickFilter>("all");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [aestheticId, setAestheticId] = useState<string>("all");
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedSeasons, setSelectedSeasons] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [showSort, setShowSort] = useState(false);
  const [layout, setLayout] = useState<LayoutMode>("cards");
  const [galleryWidth, setGalleryWidth] = useState(0);
  const [pressedGalleryId, setPressedGalleryId] = useState<string | null>(null);
  const galleryGap = spacing.xs;
  const galleryColumnWidth = galleryWidth > 0
    ? Math.floor((galleryWidth - galleryGap * 2) / 3)
    : "31%";

  const favoritesCount = items.filter((item) => isFavorite(item.id)).length;
  const unwornCount = items.filter((item) => !item.lastWorn).length;
  const activeFilterCount = selectedColors.length + selectedSeasons.length + (aestheticId === "all" ? 0 : 1) + (quick === "all" ? 0 : 1);

  const categoryCounts = items.reduce<Record<string, number>>((counts, item) => {
    counts[item.category] = (counts[item.category] ?? 0) + 1;
    return counts;
  }, { all: items.length });

  const filteredItems = items.filter((item) => {
    const categoryMatches = category === "all" || item.category === category;
    const searchMatches =
      !search ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.color.toLowerCase().includes(search.toLowerCase()) ||
      categoryLabels[item.category].toLowerCase().includes(search.toLowerCase());
    const quickMatches = quick === "all" || (quick === "favorites" ? isFavorite(item.id) : !item.lastWorn);
    const colorMatches = selectedColors.length === 0 || selectedColors.includes(item.color);
    const seasonMatches = selectedSeasons.length === 0 || (seasonOf(item.lastWorn) != null && selectedSeasons.includes(seasonOf(item.lastWorn)!));
    const aestheticMatches = aestheticId === "all" || item.aesthetics.includes(aestheticId);
    return categoryMatches && searchMatches && quickMatches && colorMatches && seasonMatches && aestheticMatches;
  });

  const sortedItems = [...filteredItems].sort((a, b) => {
    switch (sortKey) {
      case "recent": {
        if (!a.lastWorn && !b.lastWorn) return 0;
        if (!a.lastWorn) return 1;
        if (!b.lastWorn) return -1;
        return new Date(b.lastWorn).getTime() - new Date(a.lastWorn).getTime();
      }
      case "costPerWear":
        return costPerWearOf(a) - costPerWearOf(b);
      case "mostWorn":
        return b.wearCount - a.wearCount;
      case "price":
        return b.price - a.price;
      case "name":
        return a.name.localeCompare(b.name);
    }
  });

  const activeSort = sortOptions.find((option) => option.id === sortKey)!;

  const clearAllFilters = () => {
    setCategory("all");
    setQuick("all");
    setSearch("");
    setAestheticId("all");
    setSelectedColors([]);
    setSelectedSeasons([]);
  };

  return (
    <Screen scroll={false}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ flexGrow: 1, gap: spacing.xl, paddingHorizontal: spacing.lg, paddingBottom: 160, paddingTop: spacing.xl }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <View style={{ gap: 3, flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 2, color: adaptiveColors.secondaryLabel, textTransform: "uppercase" }}>Digital wardrobe</Text>
            <Text style={{ fontSize: 36, fontWeight: "800", letterSpacing: -1.4, color: adaptiveColors.label, lineHeight: 40 }}>Closet</Text>
            <Text style={{ fontSize: 13, fontWeight: "600", color: adaptiveColors.secondaryLabel }}>
              {items.length === 0 ? "A little space for everything you wear." : `${items.length} ${items.length === 1 ? "piece" : "pieces"} · ${unwornCount} never worn`}
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: spacing.xs, marginTop: 4 }}>
            {items.length > 0 ? <GlassButton icon="chart.line.uptrend.xyaxis" label="Wardrobe analytics" onPress={() => router.push("/analytics")} /> : null}
            <GlassButton icon="plus" label="Scan clothes" onPress={() => router.push("/scan")} />
          </View>
        </View>

        {items.length > 0 ? <>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", height: 48, borderRadius: radius.pill, borderCurve: "continuous", overflow: "hidden", backgroundColor: adaptiveColors.surface, borderWidth: 1, borderColor: adaptiveColors.border, paddingLeft: 16, paddingRight: 6 }}>
            <GlassLayer />
            <WardrobeIcon name="magnifyingglass" color={adaptiveColors.tertiaryLabel} size={16} />
            <TextInput value={search} onChangeText={setSearch} placeholder="Search pieces" placeholderTextColor={adaptiveColors.tertiaryLabel} style={{ flex: 1, height: 48, paddingHorizontal: 11, fontSize: 15, fontWeight: "500", includeFontPadding: false, color: adaptiveColors.label }} returnKeyType="search" />
            {search.length > 0 ? (
              <GlassButton icon="xmark" size={36} label="Clear search" onPress={() => setSearch("")} />
            ) : null}
        </View>
        <GlassButton icon="slider.horizontal.3" label={`Filters${activeFilterCount ? `, ${activeFilterCount} active` : ""}`} badge={activeFilterCount > 0} tintColor={activeFilterCount ? adaptiveColors.accent : adaptiveColors.label} onPress={() => setShowFilters(true)} />
        </View>

        <View style={{ marginHorizontal: -spacing.lg }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: 2 }}>
            {categoryFilters.map((filter) => (
              <Chip
                key={filter}
                label={filter === "all" ? "All" : categoryLabels[filter]}
                count={categoryCounts[filter] ?? 0}
                selected={category === filter}
                onPress={() => setCategory(filter)}
              />
            ))}
          </ScrollView>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <Text style={{ fontSize: 13, lineHeight: 18, fontWeight: "700", color: adaptiveColors.secondaryLabel, fontVariant: ["tabular-nums"] }}>{sortedItems.length} pieces</Text>
          <View style={{ flexDirection: "row", gap: spacing.xs }}>
            <GlassButton
              icon={layout === "cards" ? "square.grid.2x2" : "rectangle.grid.1x2"}
              label={`Switch to ${layout === "cards" ? "gallery" : "card"} view`}
              onPress={() => setLayout((prev) => (prev === "cards" ? "gallery" : "cards"))}
            />
            <GlassButton icon="arrow.up.arrow.down" label={`Sort pieces, ${activeSort.label}`} onPress={() => setShowSort(true)} />
          </View>
        </View>

        </> : null}

        {items.length === 0 ? <NewClosetState /> : sortedItems.length === 0 ? (
          <EmptyState onClear={clearAllFilters} />
        ) : layout === "gallery" ? (
          <View
            onLayout={(event) => setGalleryWidth(event.nativeEvent.layout.width)}
            style={{ width: "100%", flexDirection: "row", flexWrap: "wrap", columnGap: galleryGap, rowGap: galleryGap }}
          >
            {sortedItems.map((item) => {
              const favorite = isFavorite(item.id);
              return (
                <Pressable
                  key={item.id}
                  accessibilityLabel={`Open ${item.name}`}
                  onPress={() => router.push(`/item/${item.id}`)}
                  onPressIn={() => setPressedGalleryId(item.id)}
                  onPressOut={() => setPressedGalleryId(null)}
                  style={{
                    width: galleryColumnWidth,
                    flexGrow: 0,
                    flexShrink: 0,
                    transform: [{ scale: pressedGalleryId === item.id ? 0.96 : 1 }],
                  }}
                >
                  <View style={{ position: "relative" }}>
                    <ItemImage imageUrl={item.imageUrl} label={item.name} style={{ aspectRatio: 1, borderRadius: 8 }} />
                    <View style={{ position: "absolute", top: 4, right: 4 }}>
                    <GlassButton
                      icon={favorite ? "heart.fill" : "heart"}
                      label={favorite ? "Remove from favorites" : "Add to favorites"}
                      selected={favorite}
                      size={36}
                      tintColor={favorite ? adaptiveColors.destructive : adaptiveColors.label}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        toggleFavorite(item.id);
                      }}
                    />
                    </View>
                    <View style={{ position: "absolute", left: 4, bottom: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: "rgba(0,0,0,0.55)" }}>
                      <Text style={{ fontSize: 9, fontWeight: "800", color: "#FFF", fontVariant: ["tabular-nums"] }}>
                        {item.wearCount === 0 ? "Unworn" : `${formatCostPerWear(item)}/wear`}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: spacing.sm }}>
            {sortedItems.map((item) => {
              const favorite = isFavorite(item.id);
              return (
                <Pressable
                  key={item.id}
                  accessibilityLabel={`Open ${item.name}`}
                  onPress={() => router.push(`/item/${item.id}`)}
                  style={{
                    width: "48%",
                    flexGrow: 0,
                    flexShrink: 0,
                    paddingTop: cardImagePadding,
                    paddingHorizontal: cardImagePadding,
                    paddingBottom: 8,
                    borderRadius: 22,
                    borderCurve: "continuous",
                    overflow: "hidden",
                    backgroundColor: adaptiveColors.surface,
                    borderWidth: 1,
                    borderColor: adaptiveColors.border,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.045)",
                  }}
                >
                  <View style={{ position: "relative" }}>
                    <ItemImage
                      imageUrl={item.imageUrl}
                      label={item.name}
                      style={{ width: "100%", aspectRatio: 1, borderRadius: 12 }}
                    />
                    <View style={{ position: "absolute", top: 4, right: 4 }}>
                      <GlassButton
                        icon={favorite ? "heart.fill" : "heart"}
                        label={favorite ? "Remove from favorites" : "Add to favorites"}
                        selected={favorite}
                        tintColor={favorite ? adaptiveColors.destructive : adaptiveColors.label}
                        size={36}
                        onPress={() => toggleFavorite(item.id)}
                      />
                    </View>
                  </View>
                  <View style={{ minHeight: 48, paddingHorizontal: 4, paddingTop: 10, justifyContent: "center", gap: 2 }}>
                    <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, fontWeight: "700", includeFontPadding: false, color: adaptiveColors.label, letterSpacing: -0.1 }}>{item.name}</Text>
                    <Text numberOfLines={1} style={{ fontSize: 11, lineHeight: 15, fontWeight: "500", includeFontPadding: false, color: adaptiveColors.secondaryLabel, fontVariant: ["tabular-nums"] }}>
                      {item.wearCount === 0 ? "Not worn yet" : `${formatCostPerWear(item)}/wear · ${item.wearCount} wears`}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Sheet visible={showFilters} onDismiss={() => setShowFilters(false)} snapPoints={[]} title="Filters" subtitle="Find the pieces you’re looking for." footer={
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Pressable accessibilityRole="button" onPress={clearAllFilters} style={{ minHeight: 50, flex: 1, borderRadius: 14, backgroundColor: adaptiveColors.surfaceMuted, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 15, fontWeight: "600", color: adaptiveColors.label }}>Reset</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => setShowFilters(false)} style={{ minHeight: 50, flex: 2, borderRadius: 14, backgroundColor: adaptiveColors.label, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 15, fontWeight: "600", color: adaptiveColors.onAccent }}>Show {sortedItems.length} {sortedItems.length === 1 ? "piece" : "pieces"}</Text></Pressable>
        </View>
      }>

            <View style={{ gap: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 1.2, color: adaptiveColors.secondaryLabel, textTransform: "uppercase" }}>Show</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Chip label="Everything" count={items.length} selected={quick === "all"} onPress={() => setQuick("all")} />
                <Chip label="Favorites" count={favoritesCount} selected={quick === "favorites"} onPress={() => setQuick("favorites")} />
                <Chip label="Unworn" count={unwornCount} selected={quick === "unworn"} onPress={() => setQuick("unworn")} />
              </View>
            </View>

            <View style={{ gap: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 1.2, color: adaptiveColors.secondaryLabel, textTransform: "uppercase" }}>Vibe</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Chip label="Every vibe" selected={aestheticId === "all"} onPress={() => setAestheticId("all")} />
                {aesthetics.map((aesthetic) => (
                  <Chip key={aesthetic.id} label={aesthetic.label} selected={aestheticId === aesthetic.id} onPress={() => setAestheticId(aesthetic.id)} />
                ))}
              </View>
            </View>

            <View style={{ gap: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 1.2, color: adaptiveColors.secondaryLabel, textTransform: "uppercase" }}>Color</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                {colorOptions.map((color) => {
                  const selected = selectedColors.includes(color);
                  const light = ["white", "ivory", "cream", "camel"].includes(color);
                  return (
                    <Pressable
                      key={color}
                      accessibilityRole="checkbox"
                      accessibilityLabel={`${color} color`}
                      accessibilityState={{ selected, checked: selected }}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedColors((prev) => (prev.includes(color) ? prev.filter((c) => c !== color) : [...prev, color]));
                      }}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: radius.pill,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: swatchColor(color),
                        borderWidth: selected ? 3 : 1,
                        borderColor: selected ? adaptiveColors.label : "rgba(0,0,0,0.1)",
                      }}
                    >
                      {selected ? <WardrobeIcon name="checkmark" color={light ? adaptiveColors.label : "#FFFFFF"} weight="bold" size={17} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 1.2, color: adaptiveColors.secondaryLabel, textTransform: "uppercase" }}>Season</Text>
              <View style={{ borderRadius: 20, borderCurve: "continuous", borderWidth: 1, borderColor: adaptiveColors.border, backgroundColor: adaptiveColors.surface, paddingHorizontal: 16 }}>
                {seasonOptions.map((season, index) => {
                  const selected = selectedSeasons.includes(season.id);
                  return (
                    <View
                      key={season.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingVertical: 13,
                        borderBottomWidth: index === seasonOptions.length - 1 ? 0 : 1,
                        borderBottomColor: "rgba(0,0,0,0.05)",
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <WardrobeIcon name={season.icon} color={adaptiveColors.secondaryLabel} size={18} />
                        <Text style={{ fontSize: 15, fontWeight: "600", color: adaptiveColors.label }}>{season.label}</Text>
                      </View>
                      <NativeSwitch
                        value={selected}
                        onValueChange={(value) => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setSelectedSeasons((prev) => (value ? [...prev, season.id] : prev.filter((s) => s !== season.id)));
                        }}
                      />
                    </View>
                  );
                })}
              </View>
            </View>

      </Sheet>

      <Sheet visible={showSort} onDismiss={() => setShowSort(false)} compact title="Sort by" subtitle="Choose how your pieces are ordered.">
            <View accessibilityRole="radiogroup" style={{ gap: 6 }}>
              {sortOptions.map((option) => {
                const selected = sortKey === option.id;
                return (
                  <SelectionRow
                    key={option.id}
                    title={option.label}
                    subtitle={option.subtitle}
                    icon={option.icon}
                    selected={selected}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSortKey(option.id);
                      setShowSort(false);
                    }}
                  />
                );
              })}
            </View>
      </Sheet>
    </Screen>
  );
}

function Chip({ label, icon, count, selected, onPress }: { label: string; icon?: SymbolName; count?: number; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        height: 44,
        paddingHorizontal: 14,
        borderRadius: radius.pill,
        backgroundColor: adaptiveColors.glass,
        borderWidth: 1,
        borderColor: selected ? adaptiveColors.accent : adaptiveColors.border,
      }}
    >
      {icon ? <WardrobeIcon name={icon} color={selected ? adaptiveColors.accent : adaptiveColors.secondaryLabel} size={15} /> : null}
      <Text style={{ fontSize: 13, lineHeight: 18, includeFontPadding: false, fontWeight: "700", color: selected ? adaptiveColors.accent : adaptiveColors.secondaryLabel, textTransform: "capitalize" }}>{label}</Text>
      {count != null ? <Text style={{ fontSize: 12, lineHeight: 17, includeFontPadding: false, fontWeight: "700", color: selected ? adaptiveColors.accent : adaptiveColors.tertiaryLabel, fontVariant: ["tabular-nums"] }}>{count}</Text> : null}
    </Pressable>
  );
}

function NewClosetState() {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: spacing.xxxl, gap: spacing.xl }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ alignItems: "center", justifyContent: "center", padding: spacing.sm }}>
        <WardrobeIcon name="tshirt" color={adaptiveColors.tertiaryLabel} size={32} />
      </View>
      <View style={{ gap: spacing.sm, alignItems: "center", maxWidth: 300 }}>
        <Text accessibilityRole="header" style={{ fontSize: 22, fontWeight: "600", letterSpacing: -0.5, color: adaptiveColors.label, textAlign: "center" }}>Room for your favorites</Text>
        <Text style={{ fontSize: 14, lineHeight: 21, color: adaptiveColors.secondaryLabel, textAlign: "center" }}>Start with your first piece.</Text>
      </View>
      <Button onPress={() => router.push("/scan")} style={{ minHeight: 48, paddingHorizontal: spacing.xl, borderRadius: radius.pill }}>Add a piece</Button>
    </View>
  );
}

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <View style={{ alignItems: "center", gap: 8, paddingVertical: 36, paddingHorizontal: 24 }}>
      <View style={{ width: 64, height: 64, borderRadius: 22, borderCurve: "continuous", backgroundColor: "rgba(0,0,0,0.04)", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
        <SymbolView name="rectangle.on.rectangle.slash" tintColor="rgba(0,0,0,0.35)" size={28} />
      </View>
      <Text style={{ fontSize: 17, fontWeight: "700", letterSpacing: -0.3, color: adaptiveColors.label }}>No pieces found</Text>
      <Text style={{ fontSize: 13, fontWeight: "600", color: adaptiveColors.secondaryLabel, textAlign: "center", lineHeight: 19 }}>Try a different filter, search, or add more items.</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Clear all filters"
        onPress={onClear}
        style={{
          minHeight: 48,
          marginTop: 14,
          paddingHorizontal: 22,
          borderRadius: radius.pill,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          backgroundColor: adaptiveColors.accent,
          boxShadow: "0 6px 18px rgba(164,94,42,0.22)",
        }}
      >
        <WardrobeIcon name="xmark" color={adaptiveColors.onAccent} size={15} weight="semibold" />
        <Text style={{ fontSize: 14, lineHeight: 19, fontWeight: "700", color: adaptiveColors.onAccent }}>Clear all filters</Text>
      </Pressable>
    </View>
  );
}

function findWardrobeGaps(items: { category: ClothingCategory }[]): ClothingCategory[] {
  const idealCounts: Record<ClothingCategory, number> = {
    top: 6,
    bottom: 4,
    outerwear: 3,
    shoes: 3,
    accessory: 4,
  };
  const currentCounts: Record<ClothingCategory, number> = { top: 0, bottom: 0, outerwear: 0, shoes: 0, accessory: 0 };
  items.forEach((item) => {
    currentCounts[item.category]++;
  });

  return (Object.keys(idealCounts) as ClothingCategory[]).filter((cat) => currentCounts[cat] < idealCounts[cat] * 0.6);
}
