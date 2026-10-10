import { adaptiveColors, radius, Card, ModalHeader, Screen } from "@/components/ui";
import { useCloset } from "@/state/closet-context";
import { generateOutfitsForToday } from "@/services/outfit-engine";
import { SymbolView } from "expo-symbols";
import { Pressable, Text, View } from "react-native";

const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CalendarScreen() {
  const { items, myLooks, savedLookIds } = useCloset();

  const today = new Date();
  const dayOfWeek = today.getDay();
  const adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const weekOutfits = daysOfWeek.map((day, i) => {
    const offset = i - adjustedDay;
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    const isToday = offset === 0;
    const savedIds = [...savedLookIds];
    const hasSaved = isToday && savedIds.length > 0;

    return {
      day,
      date: date.getDate(),
      month: date.toLocaleString("default", { month: "short" }),
      isToday,
      hasSaved,
      outfit: generateOutfitsForToday("all", items)[i % 2],
    };
  });

  return (
    <Screen contentContainerStyle={{ gap: 24, paddingTop: 20 }}>
      <ModalHeader title="Outfit plan" subtitle="See your looks for the week." />

      <View style={{ flexDirection: "row", gap: 4 }}>
        {weekOutfits.map((d) => (
          <View key={d.day} style={{ flex: 1, alignItems: "center", gap: 4, paddingVertical: 10, borderRadius: 14, backgroundColor: d.isToday ? adaptiveColors.label : "rgba(0,0,0,0.03)" }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: d.isToday ? adaptiveColors.onAccent : "rgba(0,0,0,0.35)" }}>{d.day}</Text>
            <Text style={{ fontSize: 17, fontWeight: "700", color: d.isToday ? adaptiveColors.onAccent : adaptiveColors.label }}>{d.date}</Text>
          </View>
        ))}
      </View>

      <Card className="gap-4">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 32, height: 32, borderRadius: radius.pill, backgroundColor: adaptiveColors.label, alignItems: "center", justifyContent: "center" }}>
            <SymbolView name="checkmark" tintColor={adaptiveColors.onAccent} style={{ width: 16, height: 16 }} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: adaptiveColors.label }}>Today's look</Text>
            <Text style={{ fontSize: 12, color: adaptiveColors.secondaryLabel }}>Auto-generated from your closet</Text>
          </View>
          <Text style={{ fontSize: 13, fontWeight: "600", color: adaptiveColors.secondaryLabel }}>{weekOutfits[adjustedDay]?.outfit.itemIds.length ?? 0} pieces</Text>
        </View>
      </Card>

      <Card className="gap-3">
        <Text style={{ fontSize: 17, fontWeight: "700", color: adaptiveColors.label }}>This week</Text>
        {weekOutfits.filter((d) => !d.isToday).map((d, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.06)" }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.04)", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 17, fontWeight: "700", color: adaptiveColors.label }}>{d.date}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: adaptiveColors.label }}>{d.outfit.label}</Text>
              <Text style={{ fontSize: 12, color: adaptiveColors.secondaryLabel }}>{d.outfit.itemIds.length} pieces planned</Text>
            </View>
            <SymbolView name="chevron.right" tintColor="rgba(0,0,0,0.25)" style={{ width: 16, height: 16 }} />
          </View>
        ))}
      </Card>
    </Screen>
  );
}
