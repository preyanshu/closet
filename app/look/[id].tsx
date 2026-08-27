import { Card } from "@/components/ui";
import { categoryLabels, mockOutfitAlbums, type ClothingItem, type Outfit } from "@/data/mock";
import { generateOutfitsForToday } from "@/services/outfit-engine";
import { useCloset } from "@/state/closet-context";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View } from "react-native";

type DetailOutfit = Outfit & { source: "saved" | "mine" | "mock" };

export default function LookDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { items, myLooks, savedLookIds } = useCloset();

  const generatedLooks: DetailOutfit[] = generateOutfitsForToday("all", items)
    .filter((outfit) => savedLookIds.has(outfit.id))
    .map((outfit) => ({ ...outfit, source: "saved" }));
  const customLooks: DetailOutfit[] = myLooks.map((outfit) => ({ ...outfit, source: "mine" }));
  const demoLooks: DetailOutfit[] = mockOutfitAlbums.map((outfit) => ({ ...outfit, source: "mock" }));
  const outfit = [...generatedLooks, ...customLooks, ...demoLooks].find((look) => look.id === id);
  const outfitItems = outfit?.itemIds
    .map((itemId) => items.find((item) => item.id === itemId))
    .filter((item): item is ClothingItem => Boolean(item)) ?? [];

  if (!outfit) {
    return (
      <View style={{ flex: 1, backgroundColor: "#FFFDF3", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ fontSize: 15, fontWeight: "600", color: "rgba(0,0,0,0.42)", textAlign: "center" }}>Look not found</Text>
      </View>
    );
  }

  const sourceLabel = outfit.source === "mine" ? "Custom" : outfit.source === "mock" ? "Demo" : "Saved";

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#FFFDF3" }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 20, paddingHorizontal: 24, paddingBottom: 88, paddingTop: 18 }}>
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 28, fontWeight: "800", color: "#000", letterSpacing: -0.7 }}>{outfit.label}</Text>
        <Text style={{ fontSize: 14, fontWeight: "600", color: "rgba(0,0,0,0.45)" }}>{outfitItems.length} pieces</Text>
      </View>

      <Card className="gap-4 rounded-[22px] p-4">
        <Image source={require("@/assets/look-preview.png")} contentFit="contain" style={{ width: "100%", height: 280, borderRadius: 16, backgroundColor: "#FFFFFF" }} />
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
        <Text style={{ fontSize: 17, fontWeight: "800", color: "#000" }}>Items used</Text>
        {outfitItems.map((item) => (
          <Card key={item.id} className="flex-row items-center gap-3 rounded-[18px] p-3">
            <View style={{ width: 68, height: 68, borderRadius: 12, overflow: "hidden", backgroundColor: "#F6F1E4" }}>
              <Image source={getItemImageSource(item.imageUrl)} contentFit="cover" style={{ width: "100%", height: "100%" }} />
            </View>
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={{ fontSize: 15, fontWeight: "800", color: "#000" }}>{item.name}</Text>
              <Text style={{ fontSize: 12, fontWeight: "600", color: "rgba(0,0,0,0.45)" }}>{categoryLabels[item.category]} · {formatTag(item.color)}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {item.aesthetics.slice(0, 3).map((aesthetic) => <InfoChip key={aesthetic} label={formatTag(aesthetic)} small />)}
              </View>
            </View>
          </Card>
        ))}
      </View>
    </ScrollView>
  );
}

function InfoChip({ label, small = false }: { label: string; small?: boolean }) {
  return (
    <View style={{ borderRadius: 999, backgroundColor: "rgba(0,0,0,0.06)", paddingHorizontal: small ? 8 : 10, paddingVertical: small ? 4 : 6 }}>
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

function getItemImageSource(imageUrl: string) {
  if (imageUrl.includes("item-1")) return require("@/assets/item-1.png");
  if (imageUrl.includes("item-2")) return require("@/assets/item-2.png");
  if (imageUrl.includes("item-3")) return require("@/assets/item-3.png");
  if (imageUrl.includes("item-4")) return require("@/assets/item-4.png");
  return { uri: imageUrl };
}
