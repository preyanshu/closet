import { adaptiveColors, radius, Card, Screen, SectionHeader, WardrobeIcon } from "@/components/ui";
import { aesthetics, categoryLabels, type ClothingCategory } from "@/data/mock";
import { useCloset } from "@/state/closet-context";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";

const occasionPresets = [
  { id: "wedding", label: "Wedding guest", icon: "gift" as const },
  { id: "interview", label: "Job interview", icon: "briefcase" as const },
  { id: "date", label: "Date night", icon: "heart" as const },
  { id: "brunch", label: "Brunch", icon: "cup.and.saucer" as const },
];

export default function StyleScreen() {
  const { items } = useCloset();

  const gaps = findWardrobeGaps(items);

  return (
    <Screen>
      <SectionHeader eyebrow="Style" title="Level up" />

      <Card className="gap-4">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 36, height: 36, borderRadius: radius.pill, backgroundColor: "rgba(255,149,0,0.12)", alignItems: "center", justifyContent: "center" }}>
            <SymbolView name="exclamationmark.triangle" tintColor="#FF9500" style={{ width: 18, height: 18 }} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: adaptiveColors.label }}>Wardrobe Gaps</Text>
            <Text style={{ fontSize: 13, color: adaptiveColors.secondaryLabel }}>What's missing from your closet</Text>
          </View>
        </View>
        {gaps.length === 0 ? (
          <Text style={{ fontSize: 14, color: adaptiveColors.secondaryLabel }}>Your wardrobe is well covered!</Text>
        ) : (
          <View style={{ gap: 8 }}>
            {gaps.map((gap) => (
              <View key={gap.category} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.06)" }}>
                <View style={{ width: 28, height: 28, borderRadius: radius.pill, backgroundColor: "rgba(0,0,0,0.04)", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "rgba(0,0,0,0.3)" }}>{gap.count}</Text>
                </View>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: adaptiveColors.label }}>{categoryLabels[gap.category]}</Text>
                <Text style={{ fontSize: 12, color: adaptiveColors.secondaryLabel }}>{gap.suggestion}</Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      <Pressable onPress={() => router.push("/packing")}>
        <Card className="gap-4">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: radius.pill, backgroundColor: "rgba(0,122,255,0.12)", alignItems: "center", justifyContent: "center" }}>
              <WardrobeIcon name="suitcase" color="#007AFF" size={18} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: "700", color: adaptiveColors.label }}>Plan a Trip</Text>
              <Text style={{ fontSize: 13, color: adaptiveColors.secondaryLabel }}>Packing list from your closet</Text>
            </View>
            <SymbolView name="chevron.right" tintColor="rgba(0,0,0,0.25)" style={{ width: 16, height: 16 }} />
          </View>
        </Card>
      </Pressable>

      <View style={{ gap: 10 }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: adaptiveColors.secondaryLabel, textTransform: "uppercase", letterSpacing: 1.5 }}>Quick outfits for</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {occasionPresets.map((preset) => (
            <Pressable
              key={preset.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/builder");
              }}
              style={{ width: "47%", padding: 16, borderRadius: 18, gap: 10, backgroundColor: "rgba(0,0,0,0.03)", borderWidth: 1, borderColor: adaptiveColors.border }}
            >
              <WardrobeIcon name={preset.icon} color={adaptiveColors.secondaryLabel} size={22} />
              <Text style={{ fontSize: 15, fontWeight: "700", color: adaptiveColors.label }}>{preset.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: adaptiveColors.secondaryLabel, textTransform: "uppercase", letterSpacing: 1.5 }}>Style directions</Text>
        {aesthetics.map((aesthetic) => {
          const count = items.filter((i) => i.styleTags.includes(aesthetic.id)).length;
          return (
            <Card key={aesthetic.id} className="gap-3">
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: adaptiveColors.label }}>{aesthetic.label}</Text>
                  <Text style={{ fontSize: 12, color: adaptiveColors.secondaryLabel }}>{count} pieces in closet</Text>
                </View>
                <Text style={{ fontSize: 20, fontWeight: "700", color: adaptiveColors.label }}>{aesthetic.coveragePercent}%</Text>
              </View>
              <View style={{ height: 4, borderRadius: radius.pill, backgroundColor: "rgba(0,0,0,0.06)" }}>
                <View style={{ height: "100%", width: `${aesthetic.coveragePercent}%`, borderRadius: radius.pill, backgroundColor: adaptiveColors.label }} />
              </View>
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}

function findWardrobeGaps(items: { category: ClothingCategory }[]): { category: ClothingCategory; count: number; suggestion: string }[] {
  const idealCounts: Record<ClothingCategory, number> = {
    top: 6, bottom: 4, outerwear: 3, shoes: 3, accessory: 4,
  };
  const currentCounts: Record<ClothingCategory, number> = { top: 0, bottom: 0, outerwear: 0, shoes: 0, accessory: 0 };
  items.forEach((i) => { currentCounts[i.category]++; });

  const suggestions: Record<ClothingCategory, string> = {
    top: "Add more versatile shirts or tees",
    bottom: "Need more pants or skirts",
    outerwear: "Layer options are thin",
    shoes: "Add dress shoes or boots",
    accessory: "Bags, belts, or jewelry missing",
  };

  return (Object.keys(idealCounts) as ClothingCategory[])
    .filter((cat) => currentCounts[cat] < idealCounts[cat] * 0.6)
    .map((cat) => ({
      category: cat,
      count: idealCounts[cat] - currentCounts[cat],
      suggestion: suggestions[cat],
    }));
}
