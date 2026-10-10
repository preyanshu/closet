import { adaptiveColors, radius, spacing, CircularGlassButton, ItemImage, WardrobeIcon } from "@/components/ui";
import { SymbolView } from "expo-symbols";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { useCloset } from "@/state/closet-context";
import { categoryLabels } from "@/data/mock";
import { formatPrice, priceToNumber } from "@/types/domain";
import { availabilityLabels, lifecycleLabels, processingLabels, roleLabels, warmthLabels } from "@/types/taxonomy";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type SymbolName = React.ComponentProps<typeof SymbolView>["name"];
type DetailRow = { icon: SymbolName; label: string; value: string };

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
  const price = priceToNumber(item);

  const detailRows: DetailRow[] = [
    { icon: "dollarsign.circle", label: "Price", value: formatPrice(item) },
    { icon: "tag", label: "Category", value: item.subcategory ? `${categoryLabels[item.category]} · ${item.subcategory}` : categoryLabels[item.category] },
    { icon: "paintpalette", label: "Color", value: item.secondaryColors.length > 0 ? `${item.primaryColor}, ${item.secondaryColors.join(", ")}` : item.primaryColor },
  ];
  if (item.brand) detailRows.push({ icon: "bag", label: "Brand", value: item.brand });

  const fabricRows = ([
    { icon: "square.stack.3d.up", label: "Role", value: roleLabels[item.role] },
    item.fit ? { icon: "ruler", label: "Fit", value: item.fit } : null,
    item.sleeveLength ? { icon: "tshirt", label: "Sleeve", value: item.sleeveLength } : null,
    item.pattern ? { icon: "square.grid.3x3", label: "Pattern", value: item.pattern } : null,
    item.visibleTexture ? { icon: "paintbrush", label: "Texture", value: item.visibleTexture } : null,
    item.warmthBand ? { icon: "thermometer.medium", label: "Warmth", value: warmthLabels[item.warmthBand] } : null,
    item.formality ? { icon: "sparkles", label: "Formality", value: item.formality } : null,
  ] as Array<DetailRow | null>).filter((row): row is DetailRow => row !== null);

  const statusRows = ([
    item.availabilityStatus !== "available" ? { icon: "tray.full", label: "Availability", value: availabilityLabels[item.availabilityStatus] } : null,
    item.lifecycleStatus !== "owned" ? { icon: "archivebox", label: "Lifecycle", value: lifecycleLabels[item.lifecycleStatus] } : null,
    item.processingStatus !== "ready" ? { icon: "hourglass", label: "Processing", value: processingLabels[item.processingStatus] } : null,
  ] as Array<DetailRow | null>).filter((row): row is DetailRow => row !== null);

  const wearRows: DetailRow[] = [
    { icon: "clock", label: "Worn", value: item.wearCount > 0 ? `${item.wearCount} times` : "Never" },
    { icon: "chart.line.downtrend.xyaxis", label: "Cost per wear", value: price != null && item.wearCount > 0 ? `$${(price / item.wearCount).toFixed(2)}` : "—" },
    { icon: "clock", label: "Last worn", value: item.lastWorn ?? "Never" },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: adaptiveColors.canvas }} contentInsetAdjustmentBehavior="automatic">
      <View style={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl, gap: spacing.xl }}>
        <ItemImage imageUrl={item.displayAssetUri} label={item.name} contentFit="contain" style={{ borderRadius: radius.lg, width: "100%", height: 240, aspectRatio: undefined, borderColor: adaptiveColors.border }} />

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

          {item.styleTags.length > 0 ? <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: adaptiveColors.label }}>Vibes</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
            {item.styleTags.map((a) => (
              <View key={a} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: adaptiveColors.border, backgroundColor: adaptiveColors.surface }}>
                <Text style={{ fontSize: 13, fontWeight: "500", color: adaptiveColors.secondaryLabel, textTransform: "capitalize" }}>{a.replace(/-/g, " ")}</Text>
              </View>
            ))}
          </View>
          </View> : null}

          <DetailSection title="Piece details" rows={detailRows} />
          <DetailSection title="Fabric & fit" rows={fabricRows} />
          {statusRows.length > 0 ? <DetailSection title="Status" rows={statusRows} /> : null}
          <DetailSection title="Wear history" rows={wearRows} />
        </View>
      </View>
    </ScrollView>
  );
}

function DetailSection({ title, rows }: { title: string; rows: DetailRow[] }) {
  if (rows.length === 0) return null;
  return (
    <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
      <Text style={{ fontSize: 14, fontWeight: "600", color: adaptiveColors.label }}>{title}</Text>
      <View style={{ borderRadius: radius.lg, backgroundColor: adaptiveColors.surface, borderWidth: 1, borderColor: adaptiveColors.border, paddingHorizontal: spacing.md }}>
        {rows.map((row, index) => <InfoRow key={row.label} icon={row.icon} label={row.label} value={row.value} last={index === rows.length - 1} />)}
      </View>
    </View>
  );
}

function InfoRow({ icon, label, value, last = false }: { icon: SymbolName; label: string; value: string; last?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", minHeight: 54, paddingVertical: spacing.md, borderBottomWidth: last ? 0 : 1, borderBottomColor: adaptiveColors.separator, gap: spacing.sm }}>
      <WardrobeIcon name={icon} color={adaptiveColors.tertiaryLabel} size={18} />
      <Text style={{ flex: 1, fontSize: 15, fontWeight: "500", color: adaptiveColors.secondaryLabel }}>{label}</Text>
      <Text style={{ flexShrink: 1, maxWidth: "55%", textAlign: "right", fontSize: 15, fontWeight: "500", color: adaptiveColors.label, textTransform: "capitalize", fontVariant: ["tabular-nums"] }}>{value}</Text>
    </View>
  );
}