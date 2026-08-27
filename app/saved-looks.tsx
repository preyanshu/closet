import { Card, Screen, SectionHeader } from "@/components/ui";
import { useCloset } from "@/state/closet-context";
import { generateOutfitsForToday } from "@/services/outfit-engine";
import SegmentedControl from "@react-native-segmented-control/segmented-control";
import { SymbolView } from "expo-symbols";
import { Pressable, Text, View } from "react-native";
import { useState } from "react";

type Tab = "alta" | "mine";

export default function SavedLooksScreen() {
  const { items, myLooks, savedLookIds, toggleSavedLook, isSavedLook } = useCloset();
  const [tab, setTab] = useState<Tab>("alta");

  const allOutfits = [...generateOutfitsForToday("all", items), ...myLooks];
  const savedOutfits = allOutfits.filter((o) => savedLookIds.has(o.id));

  const displayList = tab === "alta"
    ? savedOutfits.filter((o) => o.aestheticId !== "custom")
    : myLooks;

  return (
    <Screen>
      <SectionHeader eyebrow="Saved" title="Your looks" />

      <SegmentedControl
        values={["Alta Looks", "My Looks"]}
        selectedIndex={tab === "alta" ? 0 : 1}
        onChange={(event) => setTab(event.nativeEvent.selectedSegmentIndex === 0 ? "alta" : "mine")}
        tintColor="#000000"
        backgroundColor="rgba(0,0,0,0.05)"
        fontStyle={{ color: "rgba(0,0,0,0.5)", fontSize: 14, fontWeight: "600" }}
        activeFontStyle={{ color: "#FFFDF3", fontSize: 14, fontWeight: "700" }}
      />

      {displayList.length === 0 ? (
        <Card className="items-center gap-2 py-10">
          <SymbolView name={tab === "alta" ? "heart" : "plus.circle"} tintColor="rgba(0,0,0,0.15)" style={{ width: 40, height: 40 }} />
          <Text style={{ fontSize: 15, fontWeight: "600", color: "rgba(0,0,0,0.4)" }}>
            {tab === "alta" ? "Heart outfits on Today to save them" : "Build an outfit in the Closet tab"}
          </Text>
        </Card>
      ) : (
        <View style={{ gap: 12 }}>
          {displayList.map((outfit) => {
            const saved = tab === "alta" ? isSavedLook(outfit.id) : true;
            return (
              <Card key={outfit.id} className="gap-3">
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: "#000" }}>{outfit.label}</Text>
                    <Text style={{ fontSize: 12, color: "rgba(0,0,0,0.4)" }}>{outfit.itemIds.length} pieces · {outfit.description}</Text>
                  </View>
                  {tab === "alta" && (
                    <Pressable onPress={() => toggleSavedLook(outfit.id)} style={{ width: 36, height: 36, borderRadius: 999, alignItems: "center", justifyContent: "center" }}>
                      <SymbolView name={saved ? "heart.fill" : "heart"} tintColor={saved ? "#FF3B30" : "rgba(0,0,0,0.25)"} style={{ width: 18, height: 18 }} />
                    </Pressable>
                  )}
                </View>
                {outfit.aestheticId === "custom" && (
                  <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.06)", alignSelf: "flex-start" }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: "rgba(0,0,0,0.4)", textTransform: "uppercase", letterSpacing: 1 }}>Custom</Text>
                  </View>
                )}
              </Card>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
