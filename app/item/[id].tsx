import { adaptiveColors, radius, spacing, CircularGlassButton, ItemImage, WardrobeIcon } from "@/components/ui";
import { SymbolView } from "expo-symbols";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { useCloset } from "@/state/closet-context";
import { categoryLabels } from "@/data/mock";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { items, isFavorite, toggleFavorite } = useCloset();
  const insets = useSafeAreaInsets();
  const item = items.find((i) => i.id === id);

  if (!item) {
    return (
      <View style={{ flex: 1, backgroundColor: adaptiveColors.canvas, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 15, color: adaptiveColors.secondaryLabel }}>Item not found</Text>
      </View>
    );
  }

  const fav = isFavorite(item.id);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: adaptiveColors.canvas }} contentInsetAdjustmentBehavior="automatic">
      <View style={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl, gap: spacing.xl }}>
        <ItemImage imageUrl={item.imageUrl} label={item.name} contentFit="contain" style={{ borderRadius: radius.lg, width: "100%", height: 240, aspectRatio: undefined, borderColor: adaptiveColors.border }} />

        <View style={{ gap: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontSize: 24, fontWeight: "600", color: adaptiveColors.label, letterSpacing: -0.6 }}>{item.name}</Text>
              <Text style={{ fontSize: 14, color: adaptiveColors.secondaryLabel }}>{categoryLabels[item.category]} · {item.wearCount === 0 ? "Not worn yet" : `${item.wearCount} wears`}</Text>
            </View>
            <CircularGlassButton
              icon={fav ? "heart.fill" : "heart"}
              label={fav ? "Remove favorite" : "Add favorite"}
              tintColor={fav ? adaptiveColors.destructive : adaptiveColors.secondaryLabel}
              selected={fav}
              onPress={() => toggleFavorite(item.id)}
            />
          </View>

          {item.aesthetics.length > 0 ? <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: adaptiveColors.label }}>Vibes</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
            {item.aesthetics.map((a) => (
              <View key={a} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: adaptiveColors.border, backgroundColor: adaptiveColors.surface }}>
                <Text style={{ fontSize: 13, fontWeight: "500", color: adaptiveColors.secondaryLabel, textTransform: "capitalize" }}>{a.replace(/-/g, " ")}</Text>
              </View>
            ))}
          </View>
          </View> : null}

          <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: adaptiveColors.label }}>Piece details</Text>
          <View style={{ borderRadius: radius.lg, backgroundColor: adaptiveColors.surface, borderWidth: 1, borderColor: adaptiveColors.border, paddingHorizontal: spacing.md }}>
            <InfoRow icon="dollarsign.circle" label="Price" value={`$${item.price.toLocaleString()}`} />
            <InfoRow icon="tag" label="Category" value={categoryLabels[item.category]} />
            <InfoRow icon="paintpalette" label="Color" value={item.color} last />
          </View>
          </View>
          <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: adaptiveColors.label }}>Wear history</Text>
          <View style={{ borderRadius: radius.lg, backgroundColor: adaptiveColors.surface, borderWidth: 1, borderColor: adaptiveColors.border, paddingHorizontal: spacing.md }}>
            <InfoRow icon="clock" label="Worn" value={item.wearCount > 0 ? `${item.wearCount} times` : "Never"} />
            <InfoRow icon="chart.line.downtrend.xyaxis" label="Cost per wear" value={item.wearCount > 0 ? `$${(item.price / item.wearCount).toFixed(2)}` : "—"} />
            <InfoRow icon="clock" label="Last worn" value={item.lastWorn ?? "Never"} last />
          </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function InfoRow({ icon, label, value, last = false }: { icon: React.ComponentProps<typeof SymbolView>["name"]; label: string; value: string; last?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", minHeight: 54, paddingVertical: spacing.md, borderBottomWidth: last ? 0 : 1, borderBottomColor: adaptiveColors.separator, gap: spacing.sm }}>
      <WardrobeIcon name={icon} color={adaptiveColors.tertiaryLabel} size={18} />
      <Text style={{ flex: 1, fontSize: 15, fontWeight: "500", color: adaptiveColors.secondaryLabel }}>{label}</Text>
      <Text style={{ flexShrink: 1, maxWidth: "55%", textAlign: "right", fontSize: 15, fontWeight: "500", color: adaptiveColors.label, textTransform: "capitalize", fontVariant: ["tabular-nums"] }}>{value}</Text>
    </View>
  );
}
