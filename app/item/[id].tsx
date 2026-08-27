import { GlassButton, ItemImage } from "@/components/ui";
import { SymbolView } from "expo-symbols";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { useCloset } from "@/state/closet-context";
import { categoryLabels } from "@/data/mock";

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { items, isFavorite, toggleFavorite } = useCloset();
  const item = items.find((i) => i.id === id);

  if (!item) {
    return (
      <View style={{ flex: 1, backgroundColor: "#FFFDF3", alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 15, color: "rgba(0,0,0,0.4)" }}>Item not found</Text>
      </View>
    );
  }

  const fav = isFavorite(item.id);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#FFFDF3" }} contentInsetAdjustmentBehavior="automatic">
      <View style={{ padding: 24, gap: 24 }}>
        <View style={{ width: "100%", aspectRatio: 1, borderRadius: 20, backgroundColor: "#F6F1E4", overflow: "hidden" }}>
          <ItemImage imageUrl={item.imageUrl} label={item.name} style={{ borderRadius: 20, width: "100%", height: "100%" }} />
        </View>

        <View style={{ gap: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontSize: 28, fontWeight: "700", color: "#000", letterSpacing: -0.7 }}>{item.name}</Text>
              <Text style={{ fontSize: 15, color: "rgba(0,0,0,0.45)" }}>{item.color} · {categoryLabels[item.category]}</Text>
            </View>
            <GlassButton
              icon={fav ? "heart.fill" : "heart"}
              label={fav ? "Remove favorite" : "Add favorite"}
              tintColor={fav ? "#FF3B30" : "rgba(0,0,0,0.6)"}
              onPress={() => toggleFavorite(item.id)}
            />
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            {item.aesthetics.map((a) => (
              <View key={a} style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.04)" }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "rgba(0,0,0,0.5)" }}>{a}</Text>
              </View>
            ))}
          </View>

          <View style={{ gap: 12 }}>
            <InfoRow icon="dollarsign.circle" label="Price" value={`$${item.price.toLocaleString()}`} />
            <InfoRow icon="clock" label="Worn" value={item.wearCount > 0 ? `${item.wearCount} times` : "Never"} />
            <InfoRow icon="chart.line.downtrend.xyaxis" label="Cost per wear" value={item.wearCount > 0 ? `$${(item.price / item.wearCount).toFixed(2)}` : "—"} />
            <InfoRow icon="clock" label="Last worn" value={item.lastWorn ?? "Never"} />
            <InfoRow icon="tag" label="Category" value={categoryLabels[item.category]} />
            <InfoRow icon="paintpalette" label="Color" value={item.color} />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ComponentProps<typeof SymbolView>["name"]; label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.06)", gap: 12 }}>
      <View style={{ width: 36, height: 36, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.04)", alignItems: "center", justifyContent: "center" }}>
        <SymbolView name={icon} tintColor="rgba(0,0,0,0.4)" style={{ width: 18, height: 18 }} />
      </View>
      <Text style={{ flex: 1, fontSize: 15, fontWeight: "500", color: "rgba(0,0,0,0.5)" }}>{label}</Text>
      <Text style={{ fontSize: 15, fontWeight: "600", color: "#000", textTransform: "capitalize" }}>{value}</Text>
    </View>
  );
}
