import { Button, Card, Screen, SectionHeader } from "@/components/ui";
import { useCloset } from "@/state/closet-context";
import { categoryLabels, type ClothingCategory } from "@/data/mock";
import SegmentedControl from "@react-native-segmented-control/segmented-control";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { Text, View } from "react-native";

const occasionIds = ["beach", "city", "business", "mountain"];
const occasionLabels = ["Beach", "City", "Business", "Mountain"];

const packingTemplate: Record<string, { category: ClothingCategory; count: number; note: string }[]> = {
  beach: [
    { category: "top", count: 3, note: "Light tees & tanks" },
    { category: "bottom", count: 2, note: "Shorts & swim trunks" },
    { category: "shoes", count: 2, note: "Sandals & sneakers" },
    { category: "accessory", count: 2, note: "Sunglasses & hat" },
  ],
  city: [
    { category: "top", count: 4, note: "Mix of casual & smart" },
    { category: "bottom", count: 3, note: "Jeans, chinos, trousers" },
    { category: "outerwear", count: 1, note: "Light jacket" },
    { category: "shoes", count: 2, note: "Sneakers & dress shoes" },
    { category: "accessory", count: 3, note: "Belt, bag, watch" },
  ],
  business: [
    { category: "top", count: 3, note: "Shirts & polos" },
    { category: "bottom", count: 2, note: "Tailored trousers" },
    { category: "outerwear", count: 1, note: "Blazer" },
    { category: "shoes", count: 1, note: "Loafers" },
    { category: "accessory", count: 2, note: "Belt & watch" },
  ],
  mountain: [
    { category: "top", count: 3, note: "Base layers & fleece" },
    { category: "bottom", count: 2, note: "Hiking pants" },
    { category: "outerwear", count: 2, note: "Rain shell & puffer" },
    { category: "shoes", count: 1, note: "Boots" },
    { category: "accessory", count: 2, note: "Beanie & gloves" },
  ],
};

export default function PackingScreen() {
  const { items } = useCloset();
  const [selectedOccasion, setSelectedOccasion] = useState<string | null>(null);

  const template = selectedOccasion ? packingTemplate[selectedOccasion] : null;

  return (
    <Screen>
      <SectionHeader eyebrow="Packing" title="Plan a trip" />

      <SegmentedControl
        values={occasionLabels}
        selectedIndex={selectedOccasion ? occasionIds.indexOf(selectedOccasion) : -1}
        onChange={(event) => setSelectedOccasion(occasionIds[event.nativeEvent.selectedSegmentIndex])}
        tintColor="#000000"
        backgroundColor="rgba(0,0,0,0.05)"
        fontStyle={{ color: "rgba(0,0,0,0.5)", fontSize: 13, fontWeight: "600" }}
        activeFontStyle={{ color: "#FFFDF3", fontSize: 13, fontWeight: "700" }}
      />

      {template && (
        <Card className="gap-3">
          <Text style={{ fontSize: 17, fontWeight: "700", color: "#000" }}>Packing list</Text>
          {template.map((entry, i) => {
            const available = items.filter((item) => item.category === entry.category).length;
            const hasEnough = available >= entry.count;
            return (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.06)" }}>
                <View style={{ width: 28, height: 28, borderRadius: 999, backgroundColor: hasEnough ? "#34C759" : "#FF3B30", alignItems: "center", justifyContent: "center" }}>
                  <SymbolView name={hasEnough ? "checkmark" : "xmark"} tintColor="#FFF" style={{ width: 14, height: 14 }} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#000" }}>{categoryLabels[entry.category]} ×{entry.count}</Text>
                  <Text style={{ fontSize: 12, color: "rgba(0,0,0,0.4)" }}>{entry.note}</Text>
                </View>
                <Text style={{ fontSize: 12, fontWeight: "600", color: hasEnough ? "#34C759" : "#FF3B30" }}>{available} in closet</Text>
              </View>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}
