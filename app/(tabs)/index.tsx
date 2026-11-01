import { adaptiveColors, Card, GlassButton, GlassLayer, NativePicker, Screen, WardrobeIcon } from "@/components/ui";
import { type Item } from "@/data/mock";
import { itemImageSource } from "@/services/item-image";
import { useCloset } from "@/state/closet-context";
import { useDailyLooks } from "@/state/use-daily-looks";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

const quickAestheticIds = ["all", "minimal", "clean-girl", "old-money", "office"];
const quickAestheticLabels = ["All", "Minimal", "Clean girl", "Old money", "Office"];

export default function HomeScreen() {
  const [selectedAestheticId, setSelectedAestheticId] = useState<string>("all");
  const { items, isSavedLook, toggleSavedLook } = useCloset();
  const { looks: outfits, status, error, refresh, refreshing, suggestions } = useDailyLooks({ aestheticId: selectedAestheticId, count: 3 });

  return (
    <Screen>
      <View className="gap-6">
        <HomeHeader />
        <AskCard />

        <NativePicker value={selectedAestheticId} onValueChange={setSelectedAestheticId} options={quickAestheticIds.map((value, index) => ({ value, label: quickAestheticLabels[index] }))} label="Outfit aesthetic" />
      </View>

      <View className="gap-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-xs font-bold uppercase tracking-[2px] text-black/40 dark:text-white/40">Alta looks</Text>
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                refresh();
              }}
              disabled={refreshing}
              className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/[0.04] active:scale-[0.96]"
            >
              {refreshing
                ? <ActivityIndicator size="small" color="rgba(0,0,0,0.4)" />
                : <SymbolView name="arrow.clockwise" tintColor="rgba(0,0,0,0.45)" style={{ width: 13, height: 13 }} />}
              <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: "600", includeFontPadding: false, color: adaptiveColors.secondaryLabel }}>
                {refreshing ? "Restyling" : "Refresh"}
              </Text>
            </Pressable>
            <Pressable onPress={() => router.push("/outfits")} className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/[0.04]">
              <WardrobeIcon name="heart" color={adaptiveColors.secondaryLabel} size={13} />
              <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: "600", includeFontPadding: false, color: adaptiveColors.secondaryLabel }}>Saved</Text>
            </Pressable>
          </View>
        </View>

        {error && status !== "loading" && (
          <View className="gap-2 rounded-[14px] bg-black/[0.04] px-4 py-3">
            <Text className="text-xs font-semibold text-black/60 dark:text-white/60">{error}</Text>
            <Pressable onPress={refresh} className="self-start rounded-full bg-black px-4 py-1.5 active:scale-[0.96]">
              <Text className="text-[11px] font-bold text-white">Retry styling</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View className="gap-6">
        {status === "loading" && outfits.length === 0 && (
          <Card className="items-center gap-3 rounded-[18px] py-8">
            <ActivityIndicator size="small" color="rgba(0,0,0,0.4)" />
            <Text className="text-xs font-semibold text-black/45 dark:text-white/45">Alta is styling your day…</Text>
          </Card>
        )}
        {status === "error" && outfits.length === 0 && !error && (
          <Card className="items-center gap-3 rounded-[18px] py-8">
            <Text className="text-xs font-semibold text-black/45 dark:text-white/45">Nothing to style yet — add a few pieces.</Text>
          </Card>
        )}

        {status !== "loading" && outfits.length === 0 && suggestions.length > 0 && (
          <Card className="gap-3 rounded-[18px] p-4">
            <Text className="text-[17px] font-bold tracking-[-0.3px] text-black dark:text-[#FFF9ED]">Not quite enough to style yet</Text>
            <Text className="text-xs font-medium text-black/45 dark:text-white/45">
              Alta needs a few more pieces before she can build a full look. Add any of these:
            </Text>
            <View className="gap-2 pt-1">
              {suggestions.map((suggestion) => (
                <View key={suggestion.role} className="flex-row items-start gap-2">
                  <SymbolView name="plus.circle" tintColor="rgba(0,0,0,0.35)" style={{ width: 15, height: 15, marginTop: 1 }} />
                  <Text className="flex-1 text-xs font-semibold text-black/60 dark:text-white/60">
                    {suggestion.label}
                    <Text className="font-medium text-black/40 dark:text-white/40"> — {suggestion.hint}</Text>
                  </Text>
                </View>
              ))}
            </View>
            <Pressable onPress={() => router.push("/scan")} className="mt-1 self-start rounded-full bg-black px-4 py-1.5 active:scale-[0.96]">
              <Text className="text-[11px] font-bold text-white">Add clothes</Text>
            </Pressable>
          </Card>
        )}

        {outfits.map((outfit) => {
          const outfitItems = outfit.itemIds
            .map((id) => items.find((item) => item.id === id))
            .filter((item): item is Item => Boolean(item));
          // Never render a stale/empty look (e.g. cached before its pieces
          // were deleted); a real look needs at least two resolvable pieces.
          if (outfitItems.length < 2) return null;
          const saved = isSavedLook(outfit.id);

          return (
            <Pressable
              key={outfit.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${outfit.label}`}
              onPress={() => router.push({ pathname: "/look/[id]", params: { id: outfit.id, look: JSON.stringify(outfit) } })}
              className="active:scale-[0.99]"
            >
              <Card className="gap-3 rounded-[18px] p-3">
                <View className="gap-0.5 px-0.5">
                  <Text className="text-[16px] font-bold tracking-[-0.2px] text-black dark:text-[#FFF9ED]">{outfit.label}</Text>
                  <Text numberOfLines={2} className="text-[11px] font-medium leading-4 text-black/45 dark:text-white/45">{outfit.description}</Text>
                </View>

                <LookCollage items={outfitItems} />

                <View className="flex-row items-center justify-between px-0.5">
                  <Text className="text-[10px] font-semibold uppercase tracking-[1.3px] text-black/38 dark:text-white/38">{outfitItems.length} pieces</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={saved ? "Remove from outfits" : "Add to outfits"}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      toggleSavedLook(outfit.id, outfit);
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 5,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 999,
                      backgroundColor: saved ? adaptiveColors.accentSoft : adaptiveColors.label,
                    }}
                    className="active:scale-[0.96]"
                  >
                    <WardrobeIcon name={saved ? "checkmark" : "plus"} color={saved ? adaptiveColors.accent : adaptiveColors.onAccent} size={12} />
                    <Text style={{ fontSize: 11, lineHeight: 15, fontWeight: "700", color: saved ? adaptiveColors.accent : adaptiveColors.onAccent }}>
                      {saved ? "Added to outfits" : "Add to outfits"}
                    </Text>
                  </Pressable>
                </View>
              </Card>
            </Pressable>
          );
        })}
      </View>

    </Screen>
  );
}

function HomeHeader() {
  return (
      <View className="gap-5">
      <View className="flex-row items-end justify-between gap-5">
        <View className="flex-1 gap-1.5">
          <Text className="text-xs font-bold uppercase tracking-[1.8px] text-black/35 dark:text-white/35">Today</Text>
          <Text className="text-[24px] font-bold leading-[28px] tracking-[-0.7px] text-black dark:text-[#FFF9ED]">Good afternoon, Preyanshu</Text>
        </View>
        <View className="items-end pb-1">
          <Text className="text-sm font-bold text-black dark:text-[#FFF9ED]">31°</Text>
          <Text className="text-xs font-medium text-black/35 dark:text-white/35">Clear</Text>
        </View>
      </View>
    </View>
  );
}

function AskCard() {
  return (
    <View className="flex-row items-center gap-2.5">
      <Pressable
        onPress={() => router.push("/chat")}
        className="flex-1 min-h-12 flex-row items-center gap-2.5 overflow-hidden rounded-full bg-black/[0.04] px-4 active:scale-[0.96]"
      >
        <GlassLayer />
        <WardrobeIcon name="sparkles" color={adaptiveColors.secondaryLabel} size={17} />
        <Text className="flex-1 text-xs font-semibold text-black/55 dark:text-white/55">Ask Alta what to wear tonight</Text>
        <View className="h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-black">
          <WardrobeIcon name="arrow.right" color={adaptiveColors.onAccent} size={15} />
        </View>
      </Pressable>
      <GlassButton icon="camera" label="Scan clothes" onPress={() => router.push("/scan")} size={44} />
      <GlassButton icon="plus" label="Build outfit" onPress={() => router.push("/builder")} size={44} variant="dark" />
    </View>
  );
}

function LookCollage({ items }: { items: Item[] }) {
  const previews = items.slice(0, 4);
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
      {previews.map((item) => (
        <View
          key={item.id}
          style={{
            width: "48.5%",
            height: 122,
            borderRadius: 12,
            overflow: "hidden",
            backgroundColor: adaptiveColors.surfaceMuted,
            borderWidth: 1,
            borderColor: adaptiveColors.imageOutline,
          }}
        >
          <Image source={itemImageSource(item.displayAssetUri)} contentFit="cover" style={{ width: "100%", height: "100%" }} />
        </View>
      ))}
    </View>
  );
}
