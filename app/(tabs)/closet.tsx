import { adaptiveColors, radius, spacing, Button, CircularGlassButton as GlassButton, EmptyState, FilterChip, PageHeader, GlassLayer, ItemImage, NativeSwitch, Screen, SelectionRow, Sheet, WardrobeIcon } from "@/components/ui";
import { categoryLabels, type ClothingCategory, type Item } from "@/data/mock";
import { vibesFor } from "@/services/vibes";
import { priceToNumber } from "@/types/domain";
import { availabilityLabels } from "@/types/taxonomy";
import { useCloset } from "@/state/closet-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { type ComponentProps } from "react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import Animated, { Easing, FadeIn, FadeInDown, FadeOut, FadeOutDown, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";

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

/** Which warmth bands suit each season. Pieces with no warmth data never match a season filter. */
const WARMTH_BY_SEASON: Record<string, string[]> = {
  spring: ["light", "medium"],
  summer: ["light"],
  fall: ["medium", "heavy"],
  winter: ["heavy", "medium"],
};

/** Cost per wear, or null when the price is unknown (never treated as free). */
const costPerWearOf = (item: Item): number | null => {
  const price = priceToNumber(item);
  if (price == null) return null;
  return item.wearCount > 0 ? price / item.wearCount : price;
};

const formatCostPerWear = (item: Item) => {
  const value = costPerWearOf(item);
  if (value == null) return "—";
  return `$${value < 10 ? value.toFixed(2) : Math.round(value).toString()}`;
};

const wearLine = (item: Item) => {
  if (item.wearCount === 0) return "Not worn yet";
  return costPerWearOf(item) == null ? `${item.wearCount} wears` : `${formatCostPerWear(item)}/wear · ${item.wearCount} wears`;
};

export default function ClosetScreen() {
  const insets = useSafeAreaInsets();
  const { items, favoriteIds, isFavorite, toggleFavorite, removeItems, setAvailability, setFavorites, profile } = useCloset();
  const aesthetics = vibesFor(profile.presentation);
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
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const galleryGap = spacing.xs;
  const galleryColumnWidth = galleryWidth > 0
    ? Math.floor((galleryWidth - galleryGap * 2) / 3)
    : "31%";

  const favoritesCount = useMemo(() => items.filter((item) => favoriteIds.has(item.id)).length, [items, favoriteIds]);
  const unwornCount = useMemo(() => items.filter((item) => !item.lastWorn).length, [items]);
  const activeFilterCount = selectedColors.length + selectedSeasons.length + (aestheticId === "all" ? 0 : 1) + (quick === "all" ? 0 : 1);

  const categoryCounts = useMemo(
    () => items.reduce<Record<string, number>>((counts, item) => {
      counts[item.category] = (counts[item.category] ?? 0) + 1;
      return counts;
    }, { all: items.length }),
    [items],
  );

  const sortedItems = useMemo(() => {
    const query = search.toLowerCase();
    const filtered = items.filter((item) => {
      const categoryMatches = category === "all" || item.category === category;
      const searchMatches =
        !query ||
        item.name.toLowerCase().includes(query) ||
        item.primaryColor.toLowerCase().includes(query) ||
        categoryLabels[item.category].toLowerCase().includes(query);
      const quickMatches = quick === "all" || (quick === "favorites" ? favoriteIds.has(item.id) : !item.lastWorn);
      const colorMatches = selectedColors.length === 0 || selectedColors.includes(item.primaryColor);
      const seasonMatches = selectedSeasons.length === 0 || (item.warmthBand != null && selectedSeasons.some((season) => WARMTH_BY_SEASON[season]?.includes(item.warmthBand!)));
      const aestheticMatches = aestheticId === "all" || item.styleTags.includes(aestheticId);
      return categoryMatches && searchMatches && quickMatches && colorMatches && seasonMatches && aestheticMatches;
    });
    return filtered.sort((a, b) => {
      switch (sortKey) {
        case "recent": {
          if (!a.lastWorn && !b.lastWorn) return 0;
          if (!a.lastWorn) return 1;
          if (!b.lastWorn) return -1;
          return new Date(b.lastWorn).getTime() - new Date(a.lastWorn).getTime();
        }
        case "costPerWear":
          return (costPerWearOf(a) ?? Infinity) - (costPerWearOf(b) ?? Infinity) || 0;
        case "mostWorn":
          return b.wearCount - a.wearCount;
        case "price":
          return (priceToNumber(b) ?? 0) - (priceToNumber(a) ?? 0);
        case "name":
          return a.name.localeCompare(b.name);
      }
    });
  }, [items, favoriteIds, category, quick, search, selectedColors, selectedSeasons, aestheticId, sortKey]);

  const exitSelecting = () => {
    setSelecting(false);
    setSelectedIds(new Set());
  };
  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  /** Tap selects while in selection mode; long-press starts it. Stable so memoised tiles skip re-renders. */
  const onTileTap = useCallback((id: string) => {
    if (selecting) toggleSelected(id);
    else router.push(`/item/${id}`);
  }, [selecting, toggleSelected]);
  const onTileLong = useCallback((id: string) => {
    if (selecting) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelecting(true);
    setSelectedIds(new Set([id]));
  }, [selecting]);
  const visibleIds = sortedItems.map((item) => item.id);
  const selectedItems = useMemo(() => items.filter((item) => selectedIds.has(item.id)), [items, selectedIds]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const allFavorite = selectedItems.length > 0 && selectedItems.every((item) => favoriteIds.has(item.id));
  const allLaundry = selectedItems.length > 0 && selectedItems.every((item) => item.availabilityStatus === "laundry");
  const confirmRemove = () => {
    const count = selectedItems.length;
    if (count === 0) return;
    Alert.alert(
      `Remove ${count} ${count === 1 ? "piece" : "pieces"}?`,
      "They'll be removed from your closet and from any looks that only use removed pieces. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            removeItems(selectedItems.map((item) => item.id));
            exitSelecting();
          },
        },
      ],
    );
  };

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
      <ScrollView contentInsetAdjustmentBehavior="never" contentContainerStyle={{ flexGrow: 1, gap: spacing.xl, paddingHorizontal: spacing.lg, paddingBottom: 160, paddingTop: insets.top + spacing.xl }}>
        <PageHeader
          eyebrow="Digital wardrobe"
          title="Closet"
          subtitle={items.length === 0 ? "A little space for everything you wear." : `${items.length} ${items.length === 1 ? "piece" : "pieces"} · ${unwornCount} never worn`}
          right={
            <View style={{ flexDirection: "row", gap: spacing.xs }}>
              {items.length > 0 ? <GlassButton icon="chart.line.uptrend.xyaxis" label="Wardrobe analytics" onPress={() => router.push("/analytics")} /> : null}
              <GlassButton icon="plus" label="Scan clothes" onPress={() => router.push("/scan")} />
            </View>
          }
        />

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
              <FilterChip
                key={filter}
                label={filter === "all" ? "All" : categoryLabels[filter]}
                count={categoryCounts[filter] ?? 0}
                selected={category === filter}
                onPress={() => setCategory(filter)}
              />
            ))}
          </ScrollView>
        </View>

        {selecting ? (
          <View key="select-header" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <Pressable accessibilityRole="button" onPress={exitSelecting} hitSlop={8}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: adaptiveColors.accent }}>Cancel</Text>
            </Pressable>
            <Text style={{ fontSize: 15, fontWeight: "700", color: adaptiveColors.label, fontVariant: ["tabular-nums"] }}>
              {selectedIds.size === 0 ? "Select pieces" : `${selectedIds.size} selected`}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => setSelectedIds(allVisibleSelected ? new Set() : new Set(visibleIds))} hitSlop={8}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: adaptiveColors.accent }}>{allVisibleSelected ? "Clear" : "Select all"}</Text>
            </Pressable>
          </View>
        ) : (
          <View key="default-header" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <Text style={{ fontSize: 13, lineHeight: 18, fontWeight: "700", color: adaptiveColors.secondaryLabel, fontVariant: ["tabular-nums"] }}>{sortedItems.length} {sortedItems.length === 1 ? "piece" : "pieces"}</Text>
            <View style={{ flexDirection: "row", gap: spacing.xs }}>
              <GlassButton icon="checkmark.circle" label="Select pieces" onPress={() => setSelecting(true)} />
              <GlassButton
                icon={layout === "cards" ? "square.grid.2x2" : "rectangle.grid.1x2"}
                label={`Switch to ${layout === "cards" ? "gallery" : "card"} view`}
                onPress={() => setLayout((prev) => (prev === "cards" ? "gallery" : "cards"))}
              />
              <GlassButton icon="arrow.up.arrow.down" label={`Sort pieces, ${activeSort.label}`} onPress={() => setShowSort(true)} />
            </View>
          </View>
        )}

        </> : null}

        {items.length === 0 ? (
          <EmptyState icon="tshirt" title="Room for your favorites" message="Start with your first piece." action={<Button onPress={() => router.push("/scan")}>Add a piece</Button>} />
        ) : sortedItems.length === 0 ? (
          <EmptyState icon="rectangle.on.rectangle.slash" title="No pieces found" message="Try a different filter or search." action={<Button variant="secondary" onPress={clearAllFilters}>Clear all filters</Button>} />
        ) : layout === "gallery" ? (
          <View
            onLayout={(event) => setGalleryWidth(event.nativeEvent.layout.width)}
            style={{ width: "100%", flexDirection: "row", flexWrap: "wrap", columnGap: galleryGap, rowGap: galleryGap }}
          >
            {sortedItems.map((item) => (
              <ClosetTile key={item.id} item={item} layout="gallery" width={galleryColumnWidth} favorite={favoriteIds.has(item.id)} selected={selectedIds.has(item.id)} selecting={selecting} onTap={onTileTap} onLong={onTileLong} onFavorite={toggleFavorite} />
            ))}
          </View>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: spacing.sm }}>
            {sortedItems.map((item) => (
              <ClosetTile key={item.id} item={item} layout="cards" width="48%" favorite={favoriteIds.has(item.id)} selected={selectedIds.has(item.id)} selecting={selecting} onTap={onTileTap} onLong={onTileLong} onFavorite={toggleFavorite} />
            ))}
          </View>
        )}
      </ScrollView>

      {selecting ? (
        <Animated.View entering={FadeInDown.duration(160).withInitialValues({ opacity: 0, transform: [{ translateY: 16 }] })} exiting={FadeOutDown.duration(120)} style={{ position: "absolute", left: spacing.lg, right: spacing.lg, bottom: 96, flexDirection: "row", gap: 8, padding: 8, borderRadius: 24, borderCurve: "continuous", backgroundColor: adaptiveColors.surfaceRaised, borderWidth: 1, borderColor: adaptiveColors.border, boxShadow: "0 10px 30px rgba(0,0,0,0.16)" }}>
          <BulkAction
            icon={allFavorite ? "heart.slash" : "heart"}
            label={allFavorite ? "Unfavorite" : "Favorite"}
            disabled={selectedIds.size === 0}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setFavorites(selectedItems.map((item) => item.id), !allFavorite); exitSelecting(); }}
          />
          <BulkAction
            icon="tray.full"
            label={allLaundry ? "Mark clean" : "Laundry"}
            disabled={selectedIds.size === 0}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setAvailability(selectedItems.map((item) => item.id), allLaundry ? "available" : "laundry"); exitSelecting(); }}
          />
          <BulkAction icon="trash" label="Remove" destructive disabled={selectedIds.size === 0} onPress={confirmRemove} />
        </Animated.View>
      ) : null}

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

type ClosetTileProps = {
  item: Item;
  layout: LayoutMode;
  width: number | string;
  favorite: boolean;
  selected: boolean;
  selecting: boolean;
  onTap: (id: string) => void;
  onLong: (id: string) => void;
  onFavorite: (id: string) => void;
};

/**
 * One grid tile. Memoised: toggling a single piece's availability or favorite
 * only re-renders that tile, not the whole closet grid.
 */
const ClosetTile = memo(function ClosetTile({ item, layout, width, favorite, selected, selecting, onTap, onLong, onFavorite }: ClosetTileProps) {
  const [pressed, setPressed] = useState(false);
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withTiming(selected ? 0.95 : pressed ? 0.97 : 1, { duration: 110, easing: Easing.out(Easing.quad) });
  }, [selected, pressed, scale]);
  const inner = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const gallery = layout === "gallery";
  const dim = item.availabilityStatus === "available" ? 1 : 0.5;
  const heart = selecting ? <SelectCheck selected={selected} /> : (
    <View style={{ position: "absolute", top: 4, right: 4 }}>
      <GlassButton
        icon={favorite ? "heart.fill" : "heart"}
        label={favorite ? "Remove from favorites" : "Add to favorites"}
        selected={favorite}
        size={36}
        tintColor={favorite ? adaptiveColors.destructive : adaptiveColors.label}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onFavorite(item.id);
        }}
      />
    </View>
  );

  return (
    <View style={{ width: width as number, flexGrow: 0, flexShrink: 0 }}>
      <Animated.View style={inner}>
        <Pressable
          accessibilityLabel={`Open ${item.name}`}
          onPress={() => onTap(item.id)}
          onLongPress={() => onLong(item.id)}
          delayLongPress={300}
          onPressIn={() => setPressed(true)}
          onPressOut={() => setPressed(false)}
          style={gallery ? undefined : {
            width: "100%",
            paddingTop: cardImagePadding,
            paddingHorizontal: cardImagePadding,
            paddingBottom: 8,
            borderRadius: 22,
            borderCurve: "continuous",
            overflow: "hidden",
            backgroundColor: adaptiveColors.surface,
            borderWidth: selected ? 2 : 1,
            borderColor: selected ? adaptiveColors.accent : adaptiveColors.border,
            boxShadow: "0 8px 24px rgba(0,0,0,0.045)",
          }}
        >
          <View style={{ position: "relative" }}>
            <ItemImage
              imageUrl={item.displayAssetUri}
              label={item.name}
              style={gallery
                ? { aspectRatio: 1, borderRadius: 8, opacity: dim, ...(selected ? { borderWidth: 3, borderColor: adaptiveColors.accent } : null) }
                : { width: "100%", aspectRatio: 1, borderRadius: 12, opacity: dim }}
            />
            <StatusPill status={item.availabilityStatus} />
            {heart}
            {gallery ? (
              <View style={{ position: "absolute", left: 4, bottom: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: "rgba(0,0,0,0.55)" }}>
                <Text style={{ fontSize: 9, fontWeight: "800", color: "#FFF", fontVariant: ["tabular-nums"] }}>
                  {item.wearCount === 0 ? "Unworn" : costPerWearOf(item) == null ? `${item.wearCount}×` : `${formatCostPerWear(item)}/wear`}
                </Text>
              </View>
            ) : null}
          </View>
          {gallery ? null : (
            <View style={{ minHeight: 48, paddingHorizontal: 4, paddingTop: 10, justifyContent: "center", gap: 2 }}>
              <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, fontWeight: "700", includeFontPadding: false, color: adaptiveColors.label, letterSpacing: -0.1 }}>{item.name}</Text>
              <Text numberOfLines={1} style={{ fontSize: 11, lineHeight: 15, fontWeight: "500", includeFontPadding: false, color: adaptiveColors.secondaryLabel, fontVariant: ["tabular-nums"] }}>{wearLine(item)}</Text>
            </View>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
});

function SelectCheck({ selected }: { selected: boolean }) {
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", top: 6, right: 6, width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.78)", borderWidth: 1.5, borderColor: "rgba(0,0,0,0.25)" }}
    >
      {selected ? (
        <Animated.View
          entering={FadeIn.duration(100)}
          exiting={FadeOut.duration(80)}
          style={{ position: "absolute", top: -1.5, left: -1.5, width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: adaptiveColors.accent }}
        >
          <WardrobeIcon name="checkmark" color={adaptiveColors.onAccent} size={14} weight="bold" />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Small tag for pieces that aren't ready to wear (laundry, packed…). */
function StatusPill({ status }: { status: Item["availabilityStatus"] }) {
  if (status === "available") return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 6, left: 6, paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: "rgba(0,0,0,0.6)" }}>
      <Text style={{ fontSize: 10, fontWeight: "800", color: "#FFF" }}>{availabilityLabels[status]}</Text>
    </View>
  );
}

function BulkAction({ icon, label, onPress, disabled, destructive }: { icon: SymbolName; label: string; onPress: () => void; disabled?: boolean; destructive?: boolean }) {
  const color = destructive ? adaptiveColors.destructive : adaptiveColors.label;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{ flex: 1, minHeight: 52, borderRadius: 18, borderCurve: "continuous", alignItems: "center", justifyContent: "center", gap: 3, opacity: disabled ? 0.35 : 1, backgroundColor: adaptiveColors.surfaceMuted }}
    >
      <WardrobeIcon name={icon} color={color} size={18} />
      <Text style={{ fontSize: 11, fontWeight: "700", color }}>{label}</Text>
    </Pressable>
  );
}

