import { adaptiveColors, radius, spacing, Button, CircularGlassButton, FilterChip, ItemImage, WardrobeIcon } from "@/components/ui";
import { ItemEditorSheet } from "@/components/item-editor";
import { swatchColor } from "@/services/item-options";
import { effectiveAlternateRoles } from "@/services/item-roles";
import { router, useLocalSearchParams } from "expo-router";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useState, type ReactNode } from "react";
import { useCloset } from "@/state/closet-context";
import { categoryLabels } from "@/data/mock";
import { formatPrice, priceToNumber, type AvailabilityStatus } from "@/types/domain";
import { availabilityLabels, AVAILABILITY_STATUSES, lifecycleLabels, processingLabels, roleLabels, warmthLabels } from "@/types/taxonomy";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

const SHORT_AVAILABILITY: Record<AvailabilityStatus, string> = { available: "Available", laundry: "Laundry", packed: "Packed", unavailable: "Away" };
const cardStyle = {
  borderRadius: 20,
  borderCurve: "continuous" as const,
  overflow: "hidden" as const,
  backgroundColor: adaptiveColors.surface,
  borderWidth: 1,
  borderColor: adaptiveColors.border,
};

const titleCase = (value: string) => value.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

function formatDay(value?: string | null): string {
  if (!value) return "Never";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { items, isFavorite, toggleFavorite, updateItem, removeItem } = useCloset();
  const insets = useSafeAreaInsets();
  const item = items.find((i) => i.id === id);
  const [editing, setEditing] = useState(false);

  if (!item) {
    return (
      <View style={{ flex: 1, backgroundColor: adaptiveColors.canvas, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 15, color: adaptiveColors.secondaryLabel }}>Item not found</Text>
      </View>
    );
  }

  const fav = isFavorite(item.id);
  const price = priceToNumber(item);
  const costPerWear = price != null && item.wearCount > 0 ? `$${(price / item.wearCount).toFixed(2)}` : "—";
  const unavailable = item.availabilityStatus !== "available";

  const confirmRemove = () => {
    Alert.alert("Remove this piece?", `${item.name} will be removed from your closet and from any look that only uses it. This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          removeItem(item.id);
          router.back();
        },
      },
    ]);
  };

  type Cell = { label: string; value: string; colors?: string[] };
  const cells = ([
    { label: "Color", value: titleCase(item.primaryColor), colors: [item.primaryColor, ...item.secondaryColors] },
    { label: "Works as", value: [...new Set([item.role, ...effectiveAlternateRoles(item)])].map((role) => roleLabels[role]).join(" + ") },
    item.fit ? { label: "Fit", value: titleCase(item.fit) } : null,
    item.sleeveLength ? { label: "Sleeve", value: titleCase(item.sleeveLength) } : null,
    item.pattern ? { label: "Pattern", value: titleCase(item.pattern) } : null,
    item.visibleTexture ? { label: "Texture", value: titleCase(item.visibleTexture) } : null,
    item.warmthBand ? { label: "Warmth", value: warmthLabels[item.warmthBand] } : null,
    item.formality ? { label: "Formality", value: titleCase(item.formality) } : null,
    item.brand ? { label: "Brand", value: item.brand } : null,
  ] as Array<Cell | null>).filter((cell): cell is Cell => cell !== null);
  // Pairs per row; an odd last cell takes the full width.
  const rows: Cell[][] = [];
  for (let index = 0; index < cells.length; index += 2) rows.push(cells.slice(index, index + 2));
  const subtitle = [categoryLabels[item.category], item.subcategory ? titleCase(item.subcategory) : null, price != null ? formatPrice(item) : null].filter(Boolean).join(" · ");

  const notes = [
    item.lifecycleStatus !== "owned" ? `Lifecycle: ${lifecycleLabels[item.lifecycleStatus]}` : null,
    item.processingStatus !== "ready" ? `Photo: ${processingLabels[item.processingStatus]}` : null,
  ].filter((note): note is string => note !== null);

  return (
    <View style={{ flex: 1, backgroundColor: adaptiveColors.canvas }}>
    <ScrollView style={{ flex: 1 }} contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.lg }}>
        {/* Hero */}
        <View style={{ borderRadius: 28, borderCurve: "continuous", overflow: "hidden", backgroundColor: adaptiveColors.surfaceMuted, borderWidth: 1, borderColor: adaptiveColors.border }}>
          <ItemImage
            imageUrl={item.displayAssetUri}
            label={item.name}
            contentFit="contain"
            style={{ width: "100%", height: 300, aspectRatio: undefined, borderRadius: 0, borderWidth: 0, backgroundColor: "transparent", opacity: unavailable ? 0.6 : 1 }}
          />
          <View style={{ position: "absolute", top: 12, right: 12, flexDirection: "row", gap: 8 }}>
            <CircularGlassButton icon="pencil" label="Edit piece" tintColor={adaptiveColors.label} onPress={() => setEditing(true)} />
            <CircularGlassButton
              icon={fav ? "heart.fill" : "heart"}
              label={fav ? "Remove favorite" : "Add favorite"}
              tintColor={fav ? adaptiveColors.destructive : adaptiveColors.label}
              selected={fav}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                toggleFavorite(item.id);
              }}
            />
          </View>
          {unavailable ? (
            <View style={{ position: "absolute", top: 16, left: 16, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: "rgba(0,0,0,0.65)" }}>
              <Text style={{ fontSize: 11, fontWeight: "800", color: "#FFF" }}>{availabilityLabels[item.availabilityStatus]}</Text>
            </View>
          ) : null}
        </View>

        {/* Title */}
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 28, lineHeight: 34, fontWeight: "800", letterSpacing: -0.8, color: adaptiveColors.label }}>{item.name}</Text>
          <Text style={{ fontSize: 14, fontWeight: "600", color: adaptiveColors.secondaryLabel }}>{subtitle}</Text>
          {item.styleTags.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {item.styleTags.map((tag) => (
                <View key={tag} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: adaptiveColors.accentSoft }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: adaptiveColors.accent }}>{titleCase(tag)}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {/* Stats: one card, three columns */}
        <View style={{ ...cardStyle, flexDirection: "row", paddingVertical: 14 }}>
          <Stat label="Wears" value={String(item.wearCount)} />
          <View style={{ width: 1, backgroundColor: adaptiveColors.separator }} />
          <Stat label="Per wear" value={costPerWear} />
          <View style={{ width: 1, backgroundColor: adaptiveColors.separator }} />
          <Stat label="Last worn" value={item.lastWorn ? formatDay(item.lastWorn) : "—"} />
        </View>

        {/* Details: an aligned two-column table in one card */}
        <Section title="Details">
          <View style={cardStyle}>
            {rows.map((pair, rowIndex) => (
              <View key={pair[0].label} style={{ flexDirection: "row", borderTopWidth: rowIndex === 0 ? 0 : 1, borderTopColor: adaptiveColors.separator }}>
                {pair.map((cell, cellIndex) => (
                  <View key={cell.label} style={{ flex: 1, gap: 3, paddingVertical: 12, paddingHorizontal: 16, borderLeftWidth: cellIndex === 0 ? 0 : 1, borderLeftColor: adaptiveColors.separator }}>
                    <Text style={{ fontSize: 12, fontWeight: "500", color: adaptiveColors.tertiaryLabel }}>{cell.label}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      {cell.colors?.map((color, index) => (
                        <View key={`${color}-${index}`} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: swatchColor(color), borderWidth: 1, borderColor: "rgba(0,0,0,0.15)" }} />
                      ))}
                      <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 15, fontWeight: "600", color: adaptiveColors.label }}>{cell.value}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </View>
          {notes.length > 0 ? <Text style={{ fontSize: 12, color: adaptiveColors.tertiaryLabel }}>{notes.join(" · ")}</Text> : null}
        </Section>

        {/* Availability */}
        <Section title="Availability">
          <View style={{ flexDirection: "row", gap: 6 }}>
              {AVAILABILITY_STATUSES.map((status: AvailabilityStatus) => (
                <FilterChip
                  key={status}
                  fill
                  label={SHORT_AVAILABILITY[status]}
                  selected={item.availabilityStatus === status}
                  onPress={() => {
                    if (item.availabilityStatus === status) return;
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    updateItem({ ...item, availabilityStatus: status, updatedAt: new Date().toISOString() });
                  }}
                />
              ))}
          </View>
        </Section>

      </View>
    </ScrollView>
    <ItemEditorSheet item={item} visible={editing} onDismiss={() => setEditing(false)} onSave={updateItem} />
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: Math.max(insets.bottom, spacing.lg), backgroundColor: adaptiveColors.canvas, borderTopWidth: 1, borderTopColor: adaptiveColors.separator }}>
        <Button variant="destructive" icon="trash" accessibilityLabel="Remove item from closet" onPress={confirmRemove}>Remove from closet</Button>
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: adaptiveColors.secondaryLabel, paddingHorizontal: 4 }}>{title}</Text>
      {children}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", gap: 2, paddingHorizontal: 8 }}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 20, fontWeight: "700", letterSpacing: -0.3, color: adaptiveColors.label, fontVariant: ["tabular-nums"] }}>{value}</Text>
      <Text style={{ fontSize: 12, fontWeight: "500", color: adaptiveColors.tertiaryLabel }}>{label}</Text>
    </View>
  );
}
