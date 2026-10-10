import { adaptiveColors, radius, Card, ModalHeader } from "@/components/ui";
import { categoryLabels, mockOutfitAlbums, type Item, type Outfit } from "@/data/mock";
import { generateOutfitsForToday } from "@/services/outfit-engine";
import { useCloset } from "@/state/closet-context";
import { roleLabels } from "@/types/taxonomy";
import type { ItemRole } from "@/types/domain";
import { Image } from "expo-image";
import { itemImageSource } from "@/services/item-image";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View } from "react-native";

type DetailOutfit = Omit<Outfit, "source"> & { source: "saved" | "mine" | "mock" };

type LookItemRef = { itemId: string; role?: ItemRole; layerOrder?: number };

export default function LookDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { items, myLooks, savedLookIds } = useCloset();

  const generatedLooks: DetailOutfit[] = generateOutfitsForToday("all", items)
    .filter((outfit) => savedLookIds.has(outfit.id))
    .map((outfit) => ({ ...outfit, source: "saved" }));
  const customLooks: DetailOutfit[] = myLooks.map((outfit) => ({ ...outfit, source: "mine" }));
  const demoLooks: DetailOutfit[] = mockOutfitAlbums.map((outfit) => ({ ...outfit, source: "mock" }));
  const outfit = [...generatedLooks, ...customLooks, ...demoLooks].find((look) => look.id === id);
  const outfitItems = resolveOutfitItems(outfit, items);

  if (!outfit) {
    return (
      <View style={{ flex: 1, backgroundColor: adaptiveColors.canvas, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ fontSize: 15, fontWeight: "600", color: adaptiveColors.secondaryLabel, textAlign: "center" }}>Look not found</Text>
      </View>
    );
  }

  const sourceLabel = outfit.source === "mine" ? "Custom" : outfit.source === "mock" ? "Demo" : "Saved";

  return (
    <ScrollView style={{ flex: 1, backgroundColor: adaptiveColors.canvas }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 24, paddingHorizontal: 24, paddingBottom: 88, paddingTop: 20 }}>
      <ModalHeader title="Look details" subtitle="Review the pieces in this outfit." />
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 28, fontWeight: "800", color: adaptiveColors.label, letterSpacing: -0.7 }}>{outfit.label}</Text>
        <Text style={{ fontSize: 14, fontWeight: "600", color: adaptiveColors.secondaryLabel }}>{outfitItems.length} pieces</Text>
      </View>

      <Card className="gap-4 rounded-[22px] p-4">
        <Image source={outfit.previewUri ? itemImageSource(outfit.previewUri) : require("@/assets/look-preview.png")} contentFit="contain" style={{ width: "100%", height: outfit.previewUri ? 420 : 280, borderRadius: 16, backgroundColor: adaptiveColors.surfaceRaised }} />
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <InfoChip label={sourceLabel} />
            <InfoChip label={formatTag(outfit.aestheticId)} />
            {(outfit.tags ?? []).map((tag) => <InfoChip key={tag} label={tag} />)}
          </View>
          <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "500", color: "rgba(0,0,0,0.58)" }}>{outfit.description}</Text>
        </View>
      </Card>

      <View style={{ gap: 12 }}>
        <Text style={{ fontSize: 17, fontWeight: "800", color: adaptiveColors.label }}>Items used</Text>
        {outfitItems.map(({ item, layerOrder }) => (
          <Card key={item.id} className="flex-row items-center gap-3 rounded-[18px] p-3">
            <View style={{ width: 68, height: 68, borderRadius: 12, overflow: "hidden", backgroundColor: adaptiveColors.surfaceMuted }}>
              <Image source={getItemImageSource(item.displayAssetUri)} contentFit="cover" style={{ width: "100%", height: "100%" }} />
            </View>
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={{ fontSize: 15, fontWeight: "800", color: adaptiveColors.label }}>{item.name}</Text>
              <Text style={{ fontSize: 12, fontWeight: "600", color: adaptiveColors.secondaryLabel }}>{categoryLabels[item.category]} · {formatTag(item.primaryColor)}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                <InfoChip label={roleLabels[item.role]} small />
                {item.styleTags.slice(0, 3).map((aesthetic) => <InfoChip key={aesthetic} label={formatTag(aesthetic)} small />)}
              </View>
            </View>
            {layerOrder != null && layerOrder > 1
              ? <Text style={{ fontSize: 11, fontWeight: "800", color: "rgba(0,0,0,0.35)" }}>L{layerOrder - 1}</Text>
              : null}
          </Card>
        ))}
      </View>
    </ScrollView>
  );
}

function InfoChip({ label, small = false }: { label: string; small?: boolean }) {
  return (
    <View style={{ borderRadius: radius.pill, backgroundColor: "rgba(0,0,0,0.06)", paddingHorizontal: small ? 8 : 10, paddingVertical: small ? 4 : 6 }}>
      <Text style={{ fontSize: small ? 10 : 11, fontWeight: "800", color: "rgba(0,0,0,0.44)" }}>{label}</Text>
    </View>
  );
}

function formatTag(value: string) {
  return value
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function resolveOutfitItems(outfit: DetailOutfit | undefined, items: Item[]): Array<{ item: Item; layerOrder?: number }> {
  if (!outfit) return [];
  const refs: LookItemRef[] = outfit.items?.length ? [...outfit.items] : outfit.itemIds.map((itemId) => ({ itemId }));
  refs.sort((a, b) => (a.layerOrder ?? 0) - (b.layerOrder ?? 0) || a.itemId.localeCompare(b.itemId));
  return refs
    .map((ref) => ({ ref, item: items.find((item) => item.id === ref.itemId) }))
    .filter((entry): entry is { ref: LookItemRef; item: Item } => Boolean(entry.item))
    .map(({ ref, item }) => ({ item, layerOrder: ref.layerOrder }));
}

function getItemImageSource(imageUrl: string) {
  if (imageUrl.includes("item-1")) return require("@/assets/item-1.png");
  if (imageUrl.includes("item-2")) return require("@/assets/item-2.png");
  if (imageUrl.includes("item-3")) return require("@/assets/item-3.png");
  if (imageUrl.includes("item-4")) return require("@/assets/item-4.png");
  return { uri: imageUrl };
}
