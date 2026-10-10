import { Button, CircularGlassButton, EmptyState, ItemImage, Screen, WardrobeIcon, motion, radius, spacing, type as typography } from "@/components/ui";
import { itemImageSource } from "@/services/item-image";
import { Image } from "expo-image";
import { aesthetics, categoryLabels, type ClothingCategory, type Item, type Outfit } from "@/data/mock";
import { useCloset } from "@/state/closet-context";
import { useWardrobeTheme } from "@/theme/wardrobe-theme";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { useSafeAreaInsets } from "react-native-safe-area-context";

const slots: { category: ClothingCategory; label: string }[] = [
  { category: "top", label: "Top" }, { category: "outerwear", label: "Layers" },
  { category: "bottom", label: "Bottom" }, { category: "shoes", label: "Shoes" },
  { category: "accessory", label: "Extras" },
];
const emptySelection: Record<ClothingCategory, string[]> = { top: [], outerwear: [], bottom: [], shoes: [], accessory: [] };
const aestheticLabel = (id: string) => aesthetics.find((aesthetic) => aesthetic.id === id)?.label ?? id;
const demoDetails = {
  label: "Everyday, elevated",
  description: "Easy proportions and warm neutrals create a relaxed, polished look. A considered mix of texture and small finishing touches takes it from a coffee run to a casual dinner.",
  tags: ["Minimal", "Casual", "Everyday", "Warm neutrals"],
  metadata: { occasion: "Coffee & casual dinners", season: "Spring / Autumn", palette: "Cream · camel · charcoal", stylingNote: "Keep the base simple. Add a loose outer layer and let one accessory be the focal point.", demo: true },
};

export default function BuilderScreen() {
  const { items, addMyLook } = useCloset();
  const { colors } = useWardrobeTheme();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const [selectedIds, setSelectedIds] = useState({ ...emptySelection });
  const [activeCategory, setActiveCategory] = useState<ClothingCategory>("top");
  const tabLayouts = useRef<Partial<Record<ClothingCategory, { x: number; width: number }>>>({});
  const tabRail = useRef<ScrollView>(null);
  const underlineX = useSharedValue(0);
  const underlineWidth = useSharedValue(0);
  const contentOpacity = useSharedValue(1);
  const contentOffset = useSharedValue(0);
  const underlineStyle = useAnimatedStyle(() => ({
    opacity: underlineWidth.value > 0 ? 1 : 0,
    transform: [{ translateX: underlineX.value }, { scaleX: underlineWidth.value }],
  }));
  const categoryStyle = useAnimatedStyle(() => ({ opacity: contentOpacity.value, transform: [{ translateX: contentOffset.value }] }));
  const animateTab = (category: ClothingCategory, immediate = false) => {
    const layout = tabLayouts.current[category];
    if (!layout) return;
    const config = { duration: immediate ? 0 : 240, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System };
    underlineX.value = withTiming(layout.x + layout.width / 2 - 0.5, config);
    underlineWidth.value = withTiming(layout.width, config);
  };
  const [pressedId, setPressedId] = useState<string | null>(null);
  const saving = useRef(false);
  const request = useRef<AbortController | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [phase, setPhase] = useState<"select" | "generating" | "preview">("select");
  const [previewUri, setPreviewUri] = useState<string>();
  const [error, setError] = useState<string>();
  const progress = "Putting the finishing touches on your preview…";
  useEffect(() => () => request.current?.abort(), []);
  const chosen = useMemo(() => slots.flatMap(({ category }) => selectedIds[category].map(id => items.find(item => item.id === id))).filter((item): item is Item => Boolean(item)), [items, selectedIds]);
  const categoryItems = useMemo(() => items.filter((item) => item.category === activeCategory), [items, activeCategory]);
  const multiple = activeCategory === "outerwear" || activeCategory === "accessory";
  const columnCount = width >= 560 && fontScale < 1.5 ? 3 : 2;
  const itemWidth = Math.floor((Math.min(width, 640) - spacing.lg * 2 - spacing.sm * (columnCount - 1)) / columnCount);
  const taste = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of chosen) for (const id of item.styleTags) counts.set(id, (counts.get(id) ?? 0) + 1);
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return { aestheticId: ranked[0]?.[0] ?? "custom", tags: ranked.slice(0, 3).map(([id]) => aestheticLabel(id)) };
  }, [chosen]);
  const lookLabel = chosen.length ? `${aestheticLabel(taste.aestheticId)} look` : "New outfit";
  const stacked = fontScale > 1.5;
  const feedback = () => { if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync(); };
  const selectCategory = (category: ClothingCategory) => {
    if (category === activeCategory) return;
    feedback();
    const direction = slots.findIndex(slot => slot.category === category) > slots.findIndex(slot => slot.category === activeCategory) ? 1 : -1;
    animateTab(category);
    tabRail.current?.scrollTo({ x: Math.max(0, (tabLayouts.current[category]?.x ?? 0) - 100), animated: true });
    contentOpacity.value = 0;
    contentOffset.value = 12 * direction;
    setActiveCategory(category);
    const config = { duration: 220, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System };
    contentOpacity.value = withTiming(1, config);
    contentOffset.value = withTiming(0, config);
  };
  const equip = (item: Item) => {
    feedback(); setPreviewUri(undefined); setError(undefined);
    setSelectedIds(current => {
      const ids = current[item.category];
      const next = ids.includes(item.id) ? ids.filter(id => id !== item.id) : item.category === "outerwear" || item.category === "accessory" ? [...ids, item.id] : [item.id];
      return { ...current, [item.category]: next };
    });
  };
  const close = () => { request.current?.abort(); if (router.canGoBack()) router.back(); else router.replace("/(tabs)/outfits"); };
  const generate = async () => {
    if (!chosen.length || request.current) return;
    const controller = new AbortController(); request.current = controller;
    setError(undefined); setPhase("generating"); scrollRef.current?.scrollTo({ y: 0, animated: true });
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { controller.signal.removeEventListener("abort", cancel); resolve(); }, 1400);
        const cancel = () => { clearTimeout(timer); reject(new Error("Cancelled")); };
        controller.signal.addEventListener("abort", cancel, { once: true });
      });
      if (!controller.signal.aborted) { setPreviewUri("@/assets/look-preview.png"); setPhase("preview"); }
    } catch (cause) {
      setPhase("select");
      setError(controller.signal.aborted ? "Generation stopped. Your pieces are kept; you can try again." : cause instanceof Error ? cause.message : "Couldn't generate your avatar. Try again.");
    } finally { request.current = null; }
  };
  const save = () => {
    if (!chosen.length || !previewUri || phase !== "preview" || saving.current) return;
    saving.current = true;
    const outfit: Outfit = { id: `my-look-${Date.now()}`, source: "manual", isDemo: false, previewUri, ...demoDetails, itemIds: chosen.map((item) => item.id), aestheticId: taste.aestheticId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    addMyLook(outfit);
    if (process.env.EXPO_OS === "ios") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    close();
  };

  return (
    <Screen scroll={false}>
      <ScrollView
        ref={scrollRef}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, phase === "generating" && { flexGrow: 1, paddingBottom: Math.max(insets.bottom, spacing.xl) }]}
      >
        <View style={styles.header}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.label }]}>
              {phase === "preview" ? "The finished look." : phase === "generating" ? "Coming together." : "Make it yours."}
            </Text>
            <Text style={{ ...typography.callout, fontWeight: "400", color: colors.secondaryLabel }}>
              {phase === "preview" ? "Styled for your everyday." : phase === "generating" ? "A little time for the final details." : "Your wardrobe. A new combination."}
            </Text>
          </View>
          <CircularGlassButton icon="xmark" label="Close outfit builder" onPress={close} />
        </View>

        {phase === "select" ? (
          <View style={{ gap: spacing.md }}>
            <ScrollView ref={tabRail} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
              <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, bottom: 0, width: 1, height: 2, borderRadius: 1, backgroundColor: colors.label }, underlineStyle]} />
              {slots.map(({ category, label }) => {
                const active = category === activeCategory;
                return (
                  <Pressable
                    key={category}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    onPress={() => selectCategory(category)}
                    onLayout={({ nativeEvent: { layout } }) => {
                      const firstLayout = !tabLayouts.current[category];
                      tabLayouts.current[category] = { x: layout.x, width: layout.width };
                      if (category === activeCategory) animateTab(category, firstLayout);
                    }}
                    style={[styles.tab, { borderBottomColor: "transparent" }]}
                  >
                    <Text style={{ ...typography.body, fontWeight: "600", color: active ? colors.label : colors.secondaryLabel }}>
                      {label}
                    </Text>
                    {selectedIds[category].length > 0 ? (
                      <Text style={{ ...typography.caption, ...typography.numeric, color: colors.accent }}>{selectedIds[category].length}</Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>

            <Animated.View style={[{ gap: spacing.md }, categoryStyle]}>
            <View style={styles.browseHint}>
              <Text style={{ ...typography.caption, fontWeight: "400", color: colors.secondaryLabel, flex: 1 }}>
                {multiple ? activeCategory === "accessory" ? "Jewellery, glasses, socks & finishing touches" : "Layer from the inside out" : "Choose one piece"}
              </Text>
              <Text style={{ ...typography.caption, ...typography.numeric, color: colors.secondaryLabel }}>{categoryItems.length} pieces</Text>
            </View>

            {categoryItems.length ? (
              <View style={styles.itemGrid}>
                {categoryItems.map(item => {
                  const selected = selectedIds[item.category].includes(item.id);
                  const id = `item:${item.id}`;
                  return (
                    <Pressable
                      key={item.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${selected ? "Remove" : "Select"} ${item.name}`}
                      accessibilityState={{ selected }}
                      onPress={() => equip(item)}
                      onPressIn={() => setPressedId(id)}
                      onPressOut={() => setPressedId(null)}
                      style={{ width: itemWidth, gap: 8, transform: [{ scale: pressedId === id ? motion.pressScale : 1 }] }}
                    >
                      <View style={[styles.itemArt, { height: itemWidth * 1.15, backgroundColor: colors.surfaceMuted, borderColor: selected ? colors.label : "transparent" }]}>
                        <ItemImage imageUrl={item.displayAssetUri} label={item.name} contentFit="contain" style={{ width: "100%", height: "100%", aspectRatio: undefined, borderWidth: 0, borderRadius: 0, backgroundColor: "transparent" }} />
                        <View style={[styles.badge, { backgroundColor: selected ? colors.label : colors.surface, borderColor: selected ? colors.label : colors.border }]}>
                          <WardrobeIcon name={selected ? "checkmark" : "plus"} color={selected ? colors.onAccent : colors.secondaryLabel} size={12} />
                        </View>
                        {selected && item.category === "outerwear" ? (
                          <View style={[styles.layerTag, { backgroundColor: colors.surface }]}>
                            <Text style={{ ...typography.caption, color: colors.label }}>Layer {selectedIds.outerwear.indexOf(item.id) + 1}</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text numberOfLines={2} style={{ ...typography.callout, fontWeight: selected ? "600" : "400", color: colors.label }}>{item.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <EmptyState icon="tshirt" title={`No ${categoryLabels[activeCategory].toLowerCase()} yet`} message="Add a piece to your wardrobe to start styling." action={<Button variant="secondary" onPress={() => router.push("/scan")}>Add clothes</Button>} />
            )}
            </Animated.View>
          </View>
        ) : phase === "generating" ? (
          <View style={styles.generation}>
            <View style={styles.generationPieces}>
              {chosen.slice(0, 3).map(item => <ItemImage key={item.id} imageUrl={item.displayAssetUri} label={item.name} contentFit="contain" style={{ width: 72, height: 92, aspectRatio: undefined, borderWidth: 0, borderRadius: radius.sm, backgroundColor: colors.surface }} />)}
            </View>
            <ActivityIndicator color={colors.accent} />
            <Text style={{ ...typography.sectionTitle, color: colors.label, textAlign: "center" }}>Creating your outfit avatar</Text>
            <Text accessibilityLiveRegion="polite" style={{ ...typography.callout, fontWeight: "400", color: colors.secondaryLabel, textAlign: "center" }}>{progress}</Text>
            <Pressable accessibilityRole="button" onPress={() => request.current?.abort()} style={styles.textButton}>
              <Text style={{ ...typography.callout, color: colors.label }}>Cancel</Text>
            </Pressable>
          </View>
        ) : previewUri ? (
          <View style={{ gap: spacing.sm }}>
            <Image source={itemImageSource(previewUri)} accessibilityLabel="Sample outfit preview" contentFit="contain" style={{ width: "100%", aspectRatio: 0.9, borderRadius: radius.lg, backgroundColor: colors.surfaceMuted }} />
            <View style={styles.previewCaption}>
              <Text style={{ ...typography.caption, fontWeight: "400", color: colors.secondaryLabel, flex: 1 }}>Demo preview · sample AI styling</Text>
              <Pressable accessibilityRole="button" onPress={() => { setPhase("select"); setPreviewUri(undefined); }} style={styles.textButton}>
                <Text style={{ ...typography.callout, color: colors.label }}>Edit pieces</Text>
              </Pressable>
            </View>
            <View style={{ gap: spacing.md }}>
              <Text style={{ ...typography.sectionTitle, color: colors.label }}>{demoDetails.label}</Text>
              <Text style={{ ...typography.body, fontWeight: "400", color: colors.secondaryLabel }}>{demoDetails.description}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
                {demoDetails.tags.map(tag => <View key={tag} style={{ backgroundColor: colors.surfaceMuted, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill }}><Text style={{ ...typography.caption, color: colors.label }}>{tag}</Text></View>)}
              </View>
              <View style={{ gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator, paddingTop: spacing.md }}>
                {[["Wear it to", demoDetails.metadata.occasion], ["Season", demoDetails.metadata.season], ["Palette", demoDetails.metadata.palette]].map(([label, value]) => <View key={label} style={{ flexDirection: "row", gap: 16 }}><Text style={{ ...typography.callout, color: colors.secondaryLabel, width: 80 }}>{label}</Text><Text style={{ ...typography.callout, color: colors.label, flex: 1 }}>{value}</Text></View>)}
              </View>
              <View style={{ padding: spacing.md, gap: spacing.xs, backgroundColor: colors.surfaceMuted, borderRadius: radius.md }}>
                <Text style={{ ...typography.callout, color: colors.label }}>Styling note</Text>
                <Text style={{ ...typography.body, fontWeight: "400", color: colors.secondaryLabel }}>{demoDetails.metadata.stylingNote}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {error ? <Text accessibilityRole="alert" style={{ ...typography.body, color: colors.destructive }}>{error}</Text> : null}
      </ScrollView>

      {phase !== "generating" ? <View style={[styles.footer, { backgroundColor: colors.canvas, borderTopColor: colors.separator, paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <View style={styles.footerContent}>
          {phase === "select" && chosen.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectionTray}>
              {chosen.map(item => (
                <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Remove ${item.name}`} onPress={() => equip(item)} style={{ width: 52, height: 58, justifyContent: "flex-end" }}>
                  <ItemImage imageUrl={item.displayAssetUri} label={item.name} contentFit="contain" style={{ width: 48, height: 48, aspectRatio: undefined, borderWidth: 0, borderRadius: radius.sm }} />
                  <View style={[styles.removeBadge, { backgroundColor: colors.label }]}><WardrobeIcon name="xmark" color={colors.onAccent} size={8} /></View>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          <View style={[styles.footerInner, stacked && { flexDirection: "column", alignItems: "stretch" }]}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text accessibilityLiveRegion="polite" style={{ ...typography.callout, ...typography.numeric, color: colors.label }}>
                {chosen.length ? `${chosen.length} ${chosen.length === 1 ? "piece" : "pieces"} selected` : "Start with a piece"}
              </Text>
              <Text style={{ ...typography.caption, fontWeight: "400", color: colors.secondaryLabel }}>
                {phase === "preview" ? "Keep this combination" : "See it on an avatar"}
              </Text>
            </View>
            <Button onPress={phase === "preview" ? save : generate} disabled={!chosen.length} style={[styles.primaryButton, stacked ? undefined : { minWidth: 148 }]}>
              {phase === "preview" ? "Save look" : "Generate"}
            </Button>
          </View>
        </View>
      </View> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { width: "100%", maxWidth: 640, alignSelf: "center", gap: spacing.xl, paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.xl },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  title: { fontSize: 30, lineHeight: 36, fontWeight: "700", letterSpacing: -1.1 },
  tabs: { gap: 24 },
  tab: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 5, borderBottomWidth: 2, paddingBottom: 3 },
  browseHint: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  itemGrid: { flexDirection: "row", flexWrap: "wrap", columnGap: spacing.sm, rowGap: spacing.lg },
  itemArt: { width: "100%", padding: 10, borderRadius: radius.md, borderCurve: "continuous", borderWidth: 1, overflow: "hidden" },
  badge: { position: "absolute", top: 10, right: 10, width: 26, height: 26, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, borderWidth: 1 },
  layerTag: { position: "absolute", bottom: 8, left: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill },
  generation: { flexGrow: 1, minHeight: 320, alignItems: "center", justifyContent: "center", paddingVertical: spacing.xl, gap: spacing.lg },
  generationPieces: { flexDirection: "row", gap: spacing.xs, marginBottom: spacing.md },
  previewCaption: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  textButton: { minHeight: 44, minWidth: 44, justifyContent: "center", alignItems: "center", paddingHorizontal: 4 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  footerContent: { width: "100%", maxWidth: 600, alignSelf: "center", gap: spacing.sm },
  selectionTray: { gap: spacing.xs, paddingRight: spacing.xs },
  removeBadge: { position: "absolute", top: 2, right: 0, width: 18, height: 18, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  footerInner: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  primaryButton: { borderRadius: radius.pill },
});
