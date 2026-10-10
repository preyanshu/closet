import { adaptiveColors, radius, Card, ModalHeader, NativePicker, Screen } from "@/components/ui";
import { useCloset } from "@/state/closet-context";
import { categoryLabels, type ClothingCategory } from "@/data/mock";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { Text, View } from "react-native";

const occasionIds = ["beach", "city", "business", "mountain"];
const occasionOptions = [
  { label: "Choose a trip", value: "none" },
  { label: "Beach", value: "beach" },
  { label: "City", value: "city" },
  { label: "Business", value: "business" },
  { label: "Mountain", value: "mountain" },
] as const;

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
    <Screen contentContainerStyle={{ gap: 24, paddingTop: 20 }}>
      <ModalHeader title="Plan a trip" subtitle="Build a packing list from your closet." />

      <NativePicker value={selectedOccasion ?? "none"} onValueChange={(value) => setSelectedOccasion(value === "none" ? null : value)} options={occasionOptions} label="Trip type" />

      {template && (
        <Card className="gap-3">
          <Text style={{ fontSize: 17, fontWeight: "700", color: adaptiveColors.label }}>Packing list</Text>
          {template.map((entry, i) => {
            const available = items.filter((item) => item.category === entry.category).length;
            const hasEnough = available >= entry.count;
            return (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.06)" }}>
                <View style={{ width: 28, height: 28, borderRadius: radius.pill, backgroundColor: hasEnough ? "#34C759" : "#FF3B30", alignItems: "center", justifyContent: "center" }}>
                  <SymbolView name={hasEnough ? "checkmark" : "xmark"} tintColor="#FFF" style={{ width: 14, height: 14 }} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: adaptiveColors.label }}>{categoryLabels[entry.category]} ×{entry.count}</Text>
                  <Text style={{ fontSize: 12, color: adaptiveColors.secondaryLabel }}>{entry.note}</Text>
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
