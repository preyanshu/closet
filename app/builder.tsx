import { Card, Screen, SectionHeader } from "@/components/ui";
import { useCloset } from "@/state/closet-context";
import { categoryLabels, type ClothingCategory, type Outfit } from "@/data/mock";
import SegmentedControl from "@react-native-segmented-control/segmented-control";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";

const slots: { category: ClothingCategory; label: string }[] = [
  { category: "top", label: "Top" },
  { category: "bottom", label: "Bottom" },
  { category: "outerwear", label: "Outerwear" },
  { category: "shoes", label: "Shoes" },
  { category: "accessory", label: "Accessory" },
];

const lookGroups = ["Office", "Casual", "Summer", "Evening", "Travel"];

const lookNameOptions = [
  { label: "Auto", value: "" },
  { label: "Date night", value: "Date night" },
  { label: "Office", value: "Office basics" },
  { label: "Weekend", value: "Weekend" },
];

export default function BuilderScreen() {
  const { items, addMyLook } = useCloset();
  const [selectedIds, setSelectedIds] = useState<Record<ClothingCategory, string | null>>({
    top: null, bottom: null, outerwear: null, shoes: null, accessory: null,
  });
  const [lookName, setLookName] = useState("");
  const [selectedGroups, setSelectedGroups] = useState<string[]>(["Casual"]);

  const toggleItem = (category: ClothingCategory, itemId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedIds((prev) => ({
      ...prev,
      [category]: prev[category] === itemId ? null : itemId,
    }));
  };

  const filledCount = Object.values(selectedIds).filter(Boolean).length;

  const save = () => {
    if (filledCount === 0) return;
    const outfit: Outfit = {
      id: `my-look-${Date.now()}`,
      label: lookName || `My Look ${new Date().toLocaleTimeString()}`,
      itemIds: Object.values(selectedIds).filter((id): id is string => Boolean(id)),
      aestheticId: "custom",
      description: "Built by me",
      tags: selectedGroups.length > 0 ? selectedGroups : ["Casual"],
    };
    addMyLook(outfit);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  return (
    <Screen>
      <SectionHeader eyebrow="Outfit Builder" title="Build a look" />

      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 13, fontWeight: "600", color: "rgba(0,0,0,0.5)" }}>Look name</Text>
        <SegmentedControl
          values={lookNameOptions.map((option) => option.label)}
          selectedIndex={Math.max(0, lookNameOptions.findIndex((option) => option.value === lookName))}
          onChange={(event) => setLookName(lookNameOptions[event.nativeEvent.selectedSegmentIndex].value)}
          tintColor="#000000"
          backgroundColor="rgba(0,0,0,0.05)"
          fontStyle={{ color: "rgba(0,0,0,0.5)", fontSize: 13, fontWeight: "600" }}
          activeFontStyle={{ color: "#FFFDF3", fontSize: 13, fontWeight: "700" }}
        />
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: "600", color: "rgba(0,0,0,0.5)" }}>Groups</Text>
        <View style={{ borderRadius: 20, borderCurve: "continuous", borderWidth: 1, borderColor: "rgba(0,0,0,0.06)", backgroundColor: "#FFFFFA", paddingHorizontal: 16 }}>
          {lookGroups.map((group, index) => {
            const selected = selectedGroups.includes(group);
            return (
              <View
                key={group}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 13,
                  borderBottomWidth: index === lookGroups.length - 1 ? 0 : 1,
                  borderBottomColor: "rgba(0,0,0,0.05)",
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: "600", color: "#000" }}>{group}</Text>
                <Switch
                  value={selected}
                  onValueChange={(value) => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedGroups((current) => (value ? [...current, group] : current.filter((g) => g !== group)));
                  }}
                  trackColor={{ false: "#E4E4EA", true: "#000000" }}
                  thumbColor="#FFFFFF"
                />
              </View>
            );
          })}
        </View>
      </View>

      {slots.map(({ category, label }) => {
        const categoryItems = items.filter((item) => item.category === category);
        const selectedId = selectedIds[category];

        return (
          <View key={category} style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 28, height: 28, borderRadius: 999, backgroundColor: selectedId ? "#000" : "rgba(0,0,0,0.06)", alignItems: "center", justifyContent: "center" }}>
                {selectedId ? (
                  <SymbolView name="checkmark" tintColor="#FFFDF3" style={{ width: 14, height: 14 }} />
                ) : (
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "rgba(0,0,0,0.3)" }}>{label[0]}</Text>
                )}
              </View>
              <Text style={{ fontSize: 15, fontWeight: "700", color: "#000" }}>{label}</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {categoryItems.map((item) => {
                const selected = item.id === selectedId;
                return (
                  <Pressable key={item.id} onPress={() => toggleItem(category, item.id)} style={{ width: 110, gap: 6 }}>
                    <View style={{ width: 110, height: 110, borderRadius: 14, backgroundColor: "#F6F1E4", borderWidth: selected ? 3 : 0, borderColor: "#000", overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
                      <SymbolView name="bag" tintColor="rgba(0,0,0,0.1)" style={{ width: 32, height: 32 }} />
                    </View>
                    <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: "600", color: selected ? "#000" : "rgba(0,0,0,0.5)" }}>{item.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        );
      })}

      <Pressable
        onPress={save}
        disabled={filledCount === 0}
        style={{ minHeight: 52, borderRadius: 999, backgroundColor: filledCount > 0 ? "#000" : "rgba(0,0,0,0.06)", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, paddingHorizontal: 24 }}
      >
        <SymbolView name="plus" tintColor={filledCount > 0 ? "#FFFDF3" : "rgba(0,0,0,0.2)"} style={{ width: 20, height: 20 }} />
        <Text style={{ fontSize: 16, fontWeight: "700", color: filledCount > 0 ? "#FFFDF3" : "rgba(0,0,0,0.2)" }}>Save look ({filledCount} pieces)</Text>
      </Pressable>
    </Screen>
  );
}
