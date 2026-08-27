import { Card, GlassButton, GlassLayer, ItemImage, Screen } from "@/components/ui";
import { type ClothingItem, type Outfit } from "@/data/mock";
import { generateOutfitsForToday } from "@/services/outfit-engine";
import { useCloset } from "@/state/closet-context";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { Image } from "expo-image";
import { router } from "expo-router";
import SegmentedControlIOS from "@react-native-segmented-control/segmented-control";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

type OutfitViewMode = "look" | "items";

const outfitMeta = [
  { title: "Client presentation", occasion: "Business casual" },
  { title: "Dinner after work", occasion: "Polished minimal" },
];

const quickAestheticIds = ["all", "minimal", "clean-girl", "old-money", "office"];
const quickAestheticLabels = ["All", "Minimal", "Clean girl", "Old money", "Office"];

export default function HomeScreen() {
  const [selectedAestheticId, setSelectedAestheticId] = useState<string>("all");
  const [viewModes, setViewModes] = useState<Record<string, OutfitViewMode>>({});
  const { items, myLooks, isSavedLook, toggleSavedLook } = useCloset();
  const outfits = generateOutfitsForToday(selectedAestheticId, items);

  const setMode = (outfitId: string, mode: OutfitViewMode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewModes((current) => ({ ...current, [outfitId]: mode }));
  };

  return (
    <Screen>
      <View className="gap-7">
        <HomeHeader />
        <AskCard />

        <SegmentedControlIOS
          values={quickAestheticLabels}
          selectedIndex={Math.max(0, quickAestheticIds.indexOf(selectedAestheticId))}
          onChange={(event) => setSelectedAestheticId(quickAestheticIds[event.nativeEvent.selectedSegmentIndex])}
          tintColor="#000000"
          backgroundColor="rgba(0,0,0,0.05)"
          fontStyle={{ color: "rgba(0,0,0,0.5)", fontSize: 12, fontWeight: "600" }}
          activeFontStyle={{ color: "#FFFDF3", fontSize: 12, fontWeight: "700" }}
        />
      </View>

      <View className="gap-3">
        <View className="flex-row items-center justify-between">
          <Text className="text-xs font-bold uppercase tracking-[2px] text-black/40">Alta looks</Text>
          <Pressable onPress={() => router.push("/outfits")} className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/[0.04]">
            <SymbolView name="heart" tintColor="rgba(0,0,0,0.4)" style={{ width: 13, height: 13 }} />
            <Text className="text-xs font-semibold text-black/50">Saved</Text>
          </Pressable>
        </View>
      </View>

      <View className="gap-8">
        {outfits.map((outfit, index) => {
          const outfitItems = outfit.itemIds
            .map((id) => items.find((item) => item.id === id))
            .filter((item): item is ClothingItem => Boolean(item));
          const mode = viewModes[outfit.id] ?? "look";
          const meta = outfitMeta[index] ?? { title: outfit.label, occasion: "Curated" };

          return (
            <Card key={outfit.id} className="gap-4 rounded-[18px] p-4">
              <View className="flex-row items-start justify-between gap-4">
                <View className="flex-1 gap-1">
                  <Text className="text-[17px] font-bold tracking-[-0.3px] text-black">{meta.title}</Text>
                  <Text className="text-xs font-medium text-black/45">{meta.occasion}</Text>
                </View>
                <SegmentedControl mode={mode} onChange={(nextMode) => setMode(outfit.id, nextMode)} />
              </View>

              {mode === "look" ? <LookPreview items={outfitItems} /> : <ItemGrid items={outfitItems} />}

              <View className="flex-row items-center justify-between pt-1">
                <View className="flex-row items-center gap-1.5">
                  <SymbolView name="sparkles" tintColor="rgba(0,0,0,0.38)" style={{ width: 14, height: 14 }} />
                  <Text className="text-xs font-semibold uppercase tracking-[1.3px] text-black/38">{outfitItems.length} pieces</Text>
                </View>
                <View className="flex-row items-center gap-2">
                  <LikeButton saved={isSavedLook(outfit.id)} onToggle={() => toggleSavedLook(outfit.id)} />
                  <IconButton name="arrow.up" label="Share outfit" />
                </View>
              </View>
            </Card>
          );
        })}
      </View>

      {myLooks.length > 0 && (
        <View className="gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-bold uppercase tracking-[2px] text-black/40">My looks</Text>
            <View className="px-2.5 py-1 rounded-full bg-black/[0.06]">
              <Text className="text-[11px] font-bold uppercase tracking-[1px] text-black/40">Custom</Text>
            </View>
          </View>

          <View className="gap-4">
            {myLooks.map((look) => (
              <Card key={look.id} className="gap-3 rounded-[18px] p-4">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 gap-1">
                    <Text className="text-[15px] font-bold text-black">{look.label}</Text>
                    <Text className="text-xs text-black/45">{look.itemIds.length} pieces · {look.description}</Text>
                  </View>
                  <View className="px-2 py-1 rounded-full bg-black/[0.06]">
                    <Text className="text-[10px] font-bold uppercase tracking-[1px] text-black/35">Custom</Text>
                  </View>
                </View>
              </Card>
            ))}
          </View>
        </View>
      )}
    </Screen>
  );
}

function HomeHeader() {
  return (
    <View className="gap-6">
      <View className="flex-row items-end justify-between gap-5">
        <View className="flex-1 gap-1.5">
          <Text className="text-xs font-bold uppercase tracking-[1.8px] text-black/35">Today</Text>
          <Text className="text-[24px] font-bold leading-[28px] tracking-[-0.7px] text-black">Good afternoon, Preyanshu</Text>
        </View>
        <View className="items-end pb-1">
          <Text className="text-sm font-bold text-black">31°</Text>
          <Text className="text-xs font-medium text-black/35">Clear</Text>
        </View>
      </View>
    </View>
  );
}

function AskCard() {
  return (
    <View className="flex-row items-center gap-3">
      <Pressable
        onPress={() => router.push("/chat")}
        className="flex-1 min-h-12 flex-row items-center gap-3 overflow-hidden rounded-full bg-black/[0.04] px-4 active:scale-[0.98]"
      >
        <GlassLayer />
        <SymbolView name="sparkles" tintColor="rgba(0,0,0,0.58)" style={{ width: 17, height: 17 }} />
        <Text className="flex-1 text-xs font-semibold text-black/55">Ask Alta what to wear tonight</Text>
        <View className="h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-black">
          <SymbolView name="arrow.right" tintColor="#FFFDF3" style={{ width: 15, height: 15 }} />
        </View>
      </Pressable>
      <Pressable
        accessibilityLabel="Scan clothes"
        onPress={() => router.push("/scan")}
        className="h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-black/[0.04] active:scale-[0.96]"
      >
        <GlassLayer />
        <SymbolView name="camera" tintColor="rgba(0,0,0,0.58)" style={{ width: 18, height: 18 }} />
      </Pressable>
      <Pressable
        accessibilityLabel="Build outfit"
        onPress={() => router.push("/builder")}
        className="h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-black active:scale-[0.96]"
      >
        <GlassLayer tintColor="#000000" />
        <SymbolView name="plus" tintColor="#FFFDF3" style={{ width: 18, height: 18 }} />
      </Pressable>
    </View>
  );
}

function SegmentedControl({ mode, onChange }: { mode: OutfitViewMode; onChange: (mode: OutfitViewMode) => void }) {
  return (
    <View className="overflow-hidden rounded-full border border-black/10 bg-black/[0.06]" style={{ width: 128, height: 32 }}>
      <SegmentedControlIOS values={["Look", "Items"]} selectedIndex={mode === "look" ? 0 : 1} onChange={(event) => onChange(event.nativeEvent.selectedSegmentIndex === 0 ? "look" : "items")} tintColor="#000000" backgroundColor="rgba(0,0,0,0.06)" fontStyle={{ color: "rgba(0,0,0,0.48)", fontSize: 12, fontWeight: "600" }} activeFontStyle={{ color: "#FFFFFF", fontSize: 12, fontWeight: "700" }} style={{ width: "100%", height: "100%" }} />
    </View>
  );
}

function LookPreview({ items }: { items: ClothingItem[] }) {
  return <Image source={require("@/assets/look-preview.png")} contentFit="contain" style={{ width: "100%", height: 240, borderRadius: 12 }} />;
}

function ItemGrid({ items }: { items: ClothingItem[] }) {
  return (
    <View className="flex-row flex-wrap gap-3">
      {items.slice(0, 4).map((item) => (
        <ItemTile key={item.id} item={item} />
      ))}
    </View>
  );
}

function ItemTile({ item }: { item: ClothingItem }) {
  return (
    <Pressable onPress={() => router.push(`/item/${item.id}`)} className="w-[48%] gap-2 rounded-[16px] p-3 active:scale-[0.97]">
      <ItemImage imageUrl={item.imageUrl} label={item.name} size="small" />
      <View className="gap-1">
        <Text numberOfLines={1} className="text-xs font-bold text-black">{item.name}</Text>
        <Text className="text-xs font-medium capitalize text-black/42">{item.color}</Text>
      </View>
    </Pressable>
  );
}

function LikeButton({ saved, onToggle }: { saved: boolean; onToggle: () => void }) {
  return (
    <GlassButton
      icon={saved ? "heart.fill" : "heart"}
      label={saved ? "Unlike outfit" : "Save outfit"}
      tintColor={saved ? "#FF3B30" : "rgba(0,0,0,0.6)"}
      onPress={onToggle}
      size={40}
    />
  );
}

function IconButton({ name, label }: { name: React.ComponentProps<typeof SymbolView>["name"]; label: string }) {
  return <GlassButton icon={name} label={label} size={40} />;
}
