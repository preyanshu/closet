import { Button, GlassButton, ItemImage } from "@/components/ui";
import { aesthetics, categoryLabels, type ClothingCategory, type ClothingItem } from "@/data/mock";
import { useCloset } from "@/state/closet-context";
import SegmentedControl from "@react-native-segmented-control/segmented-control";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { type ComponentProps } from "react";
import { useState } from "react";
import { Modal, Pressable, ScrollView, Switch, Text, TextInput, useWindowDimensions, View } from "react-native";

type SymbolName = ComponentProps<typeof SymbolView>["name"];
type QuickFilter = "all" | "favorites" | "unworn";
type SortKey = "recent" | "costPerWear" | "mostWorn" | "price" | "name";
type LayoutMode = "cards" | "gallery";

const cardImagePadding = 23;

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

const categoryIcons: Record<ClothingCategory, SymbolName> = {
  top: "tshirt",
  bottom: "rectangle.split.2x1",
  outerwear: "jacket",
  shoes: "shoe",
  accessory: "bag",
};

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
  const { width } = useWindowDimensions();
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

  const itemWidth = Math.floor((width - 40 - 10) / 2);
  const galleryItemWidth = Math.floor((width - 40 - 6) / 3);
  const favoritesCount = items.filter((item) => isFavorite(item.id)).length;
  const unwornCount = items.filter((item) => !item.lastWorn).length;
  const activeFilterCount = selectedColors.length + selectedSeasons.length + (aestheticId === "all" ? 0 : 1);

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
    <View style={{ flex: 1, backgroundColor: "#FFFDF3" }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 24, paddingHorizontal: 20, paddingBottom: 160, paddingTop: 28 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <View style={{ gap: 3, flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 2, color: "rgba(0,0,0,0.4)", textTransform: "uppercase" }}>Digital wardrobe</Text>
            <Text style={{ fontSize: 36, fontWeight: "800", letterSpacing: -1.4, color: "#000", lineHeight: 40 }}>Closet</Text>
            <Text style={{ fontSize: 13, fontWeight: "600", color: "rgba(0,0,0,0.45)" }}>
              {items.length} {items.length === 1 ? "piece" : "pieces"} · {unwornCount} never worn
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
            <GlassButton icon="chart.line.uptrend.xyaxis" label="Wardrobe analytics" onPress={() => router.push("/analytics")} />
            <GlassButton icon="plus" label="Scan clothes" variant="dark" onPress={() => router.push("/scan")} />
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, height: 44, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.045)", borderWidth: 1, borderColor: "rgba(0,0,0,0.05)", paddingHorizontal: 16 }}>
            <SymbolView name="magnifyingglass" tintColor="rgba(0,0,0,0.3)" size={16} />
            <TextInput value={search} onChangeText={setSearch} placeholder="Search pieces..." placeholderTextColor="rgba(0,0,0,0.3)" style={{ flex: 1, fontSize: 15, fontWeight: "500", color: "#000" }} returnKeyType="search" />
            {search.length > 0 ? (
              <Pressable onPress={() => setSearch("")} hitSlop={8} accessibilityLabel="Clear search">
                <SymbolView name="xmark.circle.fill" tintColor="rgba(0,0,0,0.25)" size={16} />
              </Pressable>
            ) : null}
          </View>
          <GlassButton
            icon="slider.horizontal.3"
            label="Filters"
            variant={activeFilterCount > 0 ? "dark" : "light"}
            onPress={() => setShowFilters(true)}
          />
        </View>

        <SegmentedControl
          values={["All", "Favorites", "Unworn"]}
          selectedIndex={quick === "all" ? 0 : quick === "favorites" ? 1 : 2}
          onChange={(event) => {
            const index = event.nativeEvent.selectedSegmentIndex;
            setQuick(index === 0 ? "all" : index === 1 ? "favorites" : "unworn");
          }}
          tintColor="#000000"
          backgroundColor="rgba(0,0,0,0.05)"
          fontStyle={{ color: "rgba(0,0,0,0.5)", fontSize: 13, fontWeight: "600" }}
          activeFontStyle={{ color: "#FFFDF3", fontSize: 13, fontWeight: "700" }}
        />

        <View style={{ marginHorizontal: -20 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
            {categoryFilters.map((filter) => (
              <Chip
                key={filter}
                label={filter === "all" ? "All" : categoryLabels[filter]}
                icon={filter === "all" ? undefined : categoryIcons[filter]}
                count={categoryCounts[filter] ?? 0}
                selected={category === filter}
                onPress={() => setCategory(filter)}
              />
            ))}
          </ScrollView>
        </View>

        <ClosetInsights items={items} />

        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
          <Chip
            label={layout === "cards" ? "Cards" : "Gallery"}
            icon={layout === "cards" ? "square.grid.2x2" : "rectangle.grid.1x2"}
            selected
            onPress={() => setLayout((prev) => (prev === "cards" ? "gallery" : "cards"))}
          />
          <Chip label={activeSort.label} icon="arrow.up.arrow.down" selected={sortKey !== "recent"} onPress={() => setShowSort(true)} />
        </View>

        {sortedItems.length === 0 ? (
          <EmptyState onClear={clearAllFilters} />
        ) : layout === "gallery" ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 3 }}>
            {sortedItems.map((item) => {
              const favorite = isFavorite(item.id);
              return (
                <Pressable key={item.id} accessibilityLabel={`Open ${item.name}`} onPress={() => router.push(`/item/${item.id}`)} style={{ width: galleryItemWidth }}>
                  <View style={{ position: "relative" }}>
                    <ItemImage imageUrl={item.imageUrl} label={item.name} style={{ aspectRatio: 1, borderRadius: 8 }} />
                    <Pressable
                      accessibilityLabel={favorite ? "Remove from favorites" : "Add to favorites"}
                      hitSlop={8}
                      onPress={(event) => {
                        event.stopPropagation();
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        toggleFavorite(item.id);
                      }}
                      style={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        width: 26,
                        height: 26,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <SymbolView name={favorite ? "heart.fill" : "heart"} tintColor={favorite ? "#FF3B30" : "#000000"} size={13} />
                    </Pressable>
                    <View style={{ position: "absolute", left: 4, bottom: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.55)" }}>
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
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {sortedItems.map((item) => {
              const favorite = isFavorite(item.id);
              return (
                <Pressable
                  key={item.id}
                  accessibilityLabel={`Open ${item.name}`}
                  onPress={() => router.push(`/item/${item.id}`)}
                  style={{
                    width: itemWidth,
                    paddingTop: cardImagePadding,
                    paddingHorizontal: cardImagePadding,
                    borderRadius: 20,
                    borderCurve: "continuous",
                    overflow: "hidden",
                    backgroundColor: "#FFFFFA",
                    borderWidth: 1,
                    borderColor: "rgba(0,0,0,0.06)",
                    boxShadow: "0 8px 20px rgba(0,0,0,0.05)",
                  }}
                >
                  <View style={{ flex: 1, position: "relative" }}>
                    <ItemImage
                      imageUrl={item.imageUrl}
                      label={item.name}
                      style={{ width: "100%", height: "100%", borderRadius: 12 }}
                    />
                    <Pressable
                      accessibilityLabel={favorite ? "Remove from favorites" : "Add to favorites"}
                      hitSlop={8}
                      onPress={(event) => {
                        event.stopPropagation();
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        toggleFavorite(item.id);
                      }}
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        width: 28,
                        height: 28,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <SymbolView name={favorite ? "heart.fill" : "heart"} tintColor={favorite ? "#FF3B30" : "#000000"} size={15} />
                    </Pressable>
                  </View>
                  <View style={{ height: 46, paddingHorizontal: 10, justifyContent: "center", gap: 1 }}>
                    <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: "800", color: "#000", letterSpacing: -0.2 }}>{item.name}</Text>
                    <Text numberOfLines={1} style={{ fontSize: 10, fontWeight: "600", color: "rgba(0,0,0,0.45)", fontVariant: ["tabular-nums"] }}>
                      {item.wearCount === 0 ? "Not worn yet" : `${formatCostPerWear(item)}/wear · ${item.wearCount} wears`}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Modal visible={showFilters} transparent animationType="slide" onRequestClose={() => setShowFilters(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.32)" }}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowFilters(false)} accessibilityLabel="Close filters" />
          <View style={{ backgroundColor: "#FFFDF3", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, gap: 22 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ gap: 2 }}>
                <Text style={{ fontSize: 20, fontWeight: "800", letterSpacing: -0.4, color: "#000" }}>Filters</Text>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "rgba(0,0,0,0.4)" }}>Narrow your closet in a few taps.</Text>
              </View>
              <GlassButton icon="xmark" label="Close filters" onPress={() => setShowFilters(false)} size={36} />
            </View>

            <View style={{ gap: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 1.2, color: "rgba(0,0,0,0.45)", textTransform: "uppercase" }}>Vibe</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Chip label="Every vibe" selected={aestheticId === "all"} onPress={() => setAestheticId("all")} />
                {aesthetics.map((aesthetic) => (
                  <Chip key={aesthetic.id} label={aesthetic.label} selected={aesthetic.id === aestheticId} onPress={() => setAestheticId(aesthetic.id)} />
                ))}
              </View>
            </View>

            <View style={{ gap: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 1.2, color: "rgba(0,0,0,0.45)", textTransform: "uppercase" }}>Color</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                {colorOptions.map((color) => {
                  const selected = selectedColors.includes(color);
                  const light = ["white", "ivory", "cream", "camel"].includes(color);
                  return (
                    <Pressable
                      key={color}
                      accessibilityLabel={`${color} color`}
                      accessibilityState={{ selected }}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedColors((prev) => (prev.includes(color) ? prev.filter((c) => c !== color) : [...prev, color]));
                      }}
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 999,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: swatchColor(color),
                        borderWidth: selected ? 3 : 1,
                        borderColor: selected ? "#000" : "rgba(0,0,0,0.1)",
                      }}
                    >
                      {selected ? <SymbolView name="checkmark" tintColor={light ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.92)"} weight="bold" size={17} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 1.2, color: "rgba(0,0,0,0.45)", textTransform: "uppercase" }}>Season</Text>
              <View style={{ borderRadius: 20, borderCurve: "continuous", borderWidth: 1, borderColor: "rgba(0,0,0,0.06)", backgroundColor: "#FFFFFA", paddingHorizontal: 16 }}>
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
                        <SymbolView name={season.icon} tintColor="rgba(0,0,0,0.5)" size={17} />
                        <Text style={{ fontSize: 15, fontWeight: "600", color: "#000" }}>{season.label}</Text>
                      </View>
                      <Switch
                        value={selected}
                        onValueChange={(value) => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setSelectedSeasons((prev) => (value ? [...prev, season.id] : prev.filter((s) => s !== season.id)));
                        }}
                        trackColor={{ false: "#E4E4EA", true: "#000000" }}
                        thumbColor="#FFFFFF"
                      />
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button variant="secondary" icon="trash" style={{ flex: 1 }} onPress={clearAllFilters}>
                Clear
              </Button>
              <Button icon="checkmark" style={{ flex: 1 }} onPress={() => setShowFilters(false)}>
                Done
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showSort} transparent animationType="slide" onRequestClose={() => setShowSort(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.32)" }}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowSort(false)} accessibilityLabel="Close sort options" />
          <View style={{ backgroundColor: "#FFFDF3", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, gap: 18 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ gap: 2 }}>
                <Text style={{ fontSize: 20, fontWeight: "800", letterSpacing: -0.4, color: "#000" }}>Sort by</Text>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "rgba(0,0,0,0.4)" }}>Order your closet the way you think.</Text>
              </View>
              <GlassButton icon="xmark" label="Close sort options" onPress={() => setShowSort(false)} size={36} />
            </View>

            <View style={{ borderRadius: 20, borderCurve: "continuous", borderWidth: 1, borderColor: "rgba(0,0,0,0.06)", backgroundColor: "#FFFFFA", paddingHorizontal: 16 }}>
              {sortOptions.map((option, index) => {
                const selected = sortKey === option.id;
                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSortKey(option.id);
                      setShowSort(false);
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      paddingVertical: 13,
                      borderBottomWidth: index === sortOptions.length - 1 ? 0 : 1,
                      borderBottomColor: "rgba(0,0,0,0.05)",
                    }}
                  >
                    <View style={{ width: 34, height: 34, borderRadius: 999, backgroundColor: selected ? "#000" : "rgba(0,0,0,0.05)", alignItems: "center", justifyContent: "center" }}>
                      <SymbolView name={option.icon} tintColor={selected ? "#FFFDF3" : "rgba(0,0,0,0.55)"} size={16} />
                    </View>
                    <View style={{ flex: 1, gap: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: "#000" }}>{option.label}</Text>
                      <Text style={{ fontSize: 12, fontWeight: "500", color: "rgba(0,0,0,0.4)" }}>{option.subtitle}</Text>
                    </View>
                    {selected ? <SymbolView name="checkmark" tintColor="#000" weight="bold" size={15} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </View>
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
        height: 38,
        paddingHorizontal: 14,
        borderRadius: 999,
        backgroundColor: selected ? "#000" : "rgba(0,0,0,0.04)",
        borderWidth: 1,
        borderColor: selected ? "#000" : "rgba(0,0,0,0.06)",
      }}
    >
      {icon ? <SymbolView name={icon} tintColor={selected ? "#FFFDF3" : "rgba(0,0,0,0.55)"} size={15} /> : null}
      <Text style={{ fontSize: 13, fontWeight: "700", color: selected ? "#FFFDF3" : "rgba(0,0,0,0.55)", textTransform: "capitalize" }}>{label}</Text>
      {count != null ? <Text style={{ fontSize: 12, fontWeight: "800", color: selected ? "rgba(255,253,243,0.6)" : "rgba(0,0,0,0.3)", fontVariant: ["tabular-nums"] }}>{count}</Text> : null}
    </Pressable>
  );
}

function ClosetInsights({ items }: { items: ReturnType<typeof useCloset>["items"] }) {
  const neverWorn = items.filter((item) => !item.lastWorn).length;
  const gaps = findWardrobeGaps(items);
  const stats = [
    { icon: "square.grid.2x2" as SymbolName, label: "Total pieces", value: items.length, accent: false },
    { icon: "clock.badge.exclamationmark" as SymbolName, label: "Never worn", value: neverWorn, accent: true },
  ];

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {stats.map((stat) => (
          <Pressable
            key={stat.label}
            accessibilityRole="button"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/analytics");
            }}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              borderRadius: 22,
              borderCurve: "continuous",
              backgroundColor: "#FFFFFA",
              paddingHorizontal: 14,
              paddingVertical: 13,
              boxShadow: "0 10px 24px rgba(0,0,0,0.045)",
            }}
          >
            <View style={{ width: 38, height: 38, borderRadius: 999, backgroundColor: stat.accent ? "rgba(255,149,0,0.12)" : "rgba(0,0,0,0.05)", alignItems: "center", justifyContent: "center" }}>
              <SymbolView name={stat.icon} tintColor={stat.accent ? "#FF9500" : "rgba(0,0,0,0.5)"} size={17} />
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: "600", color: "rgba(0,0,0,0.4)" }}>{stat.label}</Text>
              <Text style={{ fontSize: 22, fontWeight: "800", letterSpacing: -0.5, color: "#000", fontVariant: ["tabular-nums"], lineHeight: 24 }}>{stat.value}</Text>
            </View>
          </Pressable>
        ))}
      </View>
      {gaps.length > 0 ? (
        <Pressable
          onPress={() => router.push("/analytics")}
          style={{ flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 20, borderCurve: "continuous", backgroundColor: "#FFF4E0", paddingHorizontal: 16, paddingVertical: 12 }}
        >
          <SymbolView name="exclamationmark.triangle.fill" tintColor="#FF9500" size={15} />
          <Text style={{ flex: 1, fontSize: 13, fontWeight: "700", color: "rgba(0,0,0,0.7)" }}>
            Low on {gaps.map((cat) => categoryLabels[cat].toLowerCase()).join(" · ")} — see what to add.
          </Text>
          <SymbolView name="chevron.right" tintColor="rgba(0,0,0,0.25)" size={14} />
        </Pressable>
      ) : null}
    </View>
  );
}

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <View style={{ alignItems: "center", gap: 8, paddingVertical: 36, paddingHorizontal: 24 }}>
      <View style={{ width: 64, height: 64, borderRadius: 22, borderCurve: "continuous", backgroundColor: "rgba(0,0,0,0.04)", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
        <SymbolView name="rectangle.on.rectangle.slash" tintColor="rgba(0,0,0,0.35)" size={28} />
      </View>
      <Text style={{ fontSize: 17, fontWeight: "700", letterSpacing: -0.3, color: "#000" }}>No pieces found</Text>
      <Text style={{ fontSize: 13, fontWeight: "600", color: "rgba(0,0,0,0.4)", textAlign: "center", lineHeight: 19 }}>Try a different filter, search, or add more items.</Text>
      <Button variant="secondary" onPress={onClear} style={{ marginTop: 12 }}>
        Clear all filters
      </Button>
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
