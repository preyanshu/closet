import { adaptiveColors, radius, Card, EmptyState, GlassButton, ModalHeader, FilterChip, Screen } from "@/components/ui";
import { useCloset } from "@/state/closet-context";
import { SymbolView } from "expo-symbols";
import { Pressable, Text, View } from "react-native";
import { useState } from "react";

type Tab = "alta" | "mine";

export default function SavedLooksScreen() {
  const { myLooks, savedLooks, toggleSavedLook, isSavedLook } = useCloset();
  const [tab, setTab] = useState<Tab>("alta");

  const savedOutfits = savedLooks;
  const displayList = tab === "alta" ? savedOutfits : myLooks;

  return (
    <Screen modal>
      <ModalHeader title="Saved looks" subtitle="Your favorite and custom outfits." />

      <View style={{ flexDirection: "row", gap: 8 }}>
        <FilterChip label="Alta Looks" selected={tab === "alta"} onPress={() => setTab("alta")} />
        <FilterChip label="My Looks" selected={tab === "mine"} onPress={() => setTab("mine")} />
      </View>

      {displayList.length === 0 ? (
        <EmptyState
          icon={tab === "alta" ? "heart" : "plus.circle"}
          title={tab === "alta" ? "No saved looks yet" : "No looks of your own yet"}
          message={tab === "alta" ? "Tap the plus on a look in Today to save it here." : "Build an outfit from your closet and it will show up here."}
        />
      ) : (
        <View style={{ gap: 12 }}>
          {displayList.map((outfit) => {
            const saved = tab === "alta" ? isSavedLook(outfit.id) : true;
            return (
              <Card key={outfit.id} className="gap-3">
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: adaptiveColors.label }}>{outfit.label}</Text>
                    <Text style={{ fontSize: 12, color: adaptiveColors.secondaryLabel }}>{outfit.itemIds.length} pieces · {outfit.description}</Text>
                  </View>
                  {tab === "alta" && (
                    <GlassButton icon={saved ? "heart.fill" : "heart"} label={saved ? "Remove saved look" : "Save look"} tintColor={saved ? "#FF3B30" : adaptiveColors.secondaryLabel} onPress={() => toggleSavedLook(outfit.id, outfit)} size={36} />
                  )}
                </View>
                {outfit.aestheticId === "custom" && (
                  <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: "rgba(0,0,0,0.06)", alignSelf: "flex-start" }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: adaptiveColors.secondaryLabel, textTransform: "uppercase", letterSpacing: 1 }}>Custom</Text>
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
