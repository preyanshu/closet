import { Card, GlassLayer, OutfitPreviewCard, SectionHeader } from "@/components/ui";
import { mockOutfitAlbums, type ClothingItem, type Outfit } from "@/data/mock";
import { generateOutfitsForToday } from "@/services/outfit-engine";
import { useCloset } from "@/state/closet-context";
import { Image } from "expo-image";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, ScrollView, Text, View } from "react-native";

const outfitGroups = ["All", "Favorites", "Office", "Casual", "Summer", "Evening", "Travel"];

type LibraryOutfit = Outfit & { source: "saved" | "mine" | "mock" };

export default function OutfitsScreen() {
  const { items, myLooks, savedLookIds, toggleSavedLook, isSavedLook } = useCloset();
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [returningGroup, setReturningGroup] = useState<string | null>(null);
  const pageProgress = useRef(new Animated.Value(1)).current;
  const cardReturnProgress = useRef(new Animated.Value(1)).current;

  const altaOutfits = useMemo(() => generateOutfitsForToday("all", items), [items]);
  const outfits: LibraryOutfit[] = [
    ...altaOutfits.filter((outfit) => savedLookIds.has(outfit.id)).map((outfit) => ({ ...outfit, source: "saved" as const })),
    ...myLooks.map((outfit) => ({ ...outfit, source: "mine" as const })),
    ...mockOutfitAlbums.map((outfit) => ({ ...outfit, source: "mock" as const })),
  ];

  const groups = outfitGroups.map((group) => ({
    name: group,
    outfits: group === "All"
      ? outfits
      : group === "Favorites"
        ? outfits.filter((outfit) => outfit.source === "saved" && savedLookIds.has(outfit.id))
        : outfits.filter((outfit) => (outfit.tags ?? []).includes(group)),
  }));
  const activeGroup = groups.find((group) => group.name === selectedGroup);

  const animateOpen = (groupName: string) => {
    setSelectedGroup(groupName);
    pageProgress.setValue(0);
    Animated.timing(pageProgress, {
      toValue: 1,
      duration: 260,
      easing: Easing.bezier(0.2, 0, 0, 1),
      useNativeDriver: true,
    }).start();
  };

  const closeAlbum = () => {
    const closingGroup = selectedGroup;
    setSelectedGroup(null);
    setReturningGroup(closingGroup);
    cardReturnProgress.setValue(0);
    Animated.timing(cardReturnProgress, {
      toValue: 1,
      duration: 240,
      easing: Easing.bezier(0.2, 0, 0, 1),
      useNativeDriver: true,
    }).start(() => setReturningGroup(null));
  };

  const albumScale = pageProgress.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });
  const albumTranslateY = pageProgress.interpolate({ inputRange: [0, 1], outputRange: [22, 0] });
  const pageOpacity = pageProgress.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });

  return (
    <View style={{ flex: 1, backgroundColor: "#FFFDF3" }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 28, paddingHorizontal: 24, paddingBottom: 160, paddingTop: 28 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <SectionHeader eyebrow="Outfits" title={selectedGroup ?? "Albums"} />
          <Pressable
            accessibilityLabel={selectedGroup ? "Back to albums" : "Build outfit"}
            onPress={() => selectedGroup ? closeAlbum() : router.push("/builder")}
            style={{ width: 44, height: 44, borderRadius: 999, backgroundColor: selectedGroup ? "rgba(0,0,0,0.04)" : "#000", alignItems: "center", justifyContent: "center", marginTop: 4, overflow: "hidden" }}
          >
            {selectedGroup ? <GlassLayer /> : null}
            <SymbolView name={selectedGroup ? "chevron.left" : "plus"} tintColor={selectedGroup ? "#000" : "#FFFDF3"} style={{ width: selectedGroup ? 17 : 19, height: selectedGroup ? 17 : 19 }} />
          </Pressable>
        </View>

        {selectedGroup ? (
          <Animated.View style={{ opacity: pageOpacity, transform: [{ translateY: albumTranslateY }, { scale: albumScale }] }}>
            <AlbumFullPage
              groupName={selectedGroup}
              outfits={activeGroup?.outfits ?? []}
              items={items}
              isSavedLook={isSavedLook}
              toggleSavedLook={toggleSavedLook}
            />
          </Animated.View>
        ) : (
          <AlbumGrid groups={groups} onSelect={animateOpen} onBuild={() => router.push("/builder")} returningGroup={returningGroup} returnProgress={cardReturnProgress} />
        )}
      </ScrollView>
    </View>
  );
}

function AlbumGrid({
  groups,
  onSelect,
  onBuild,
  returningGroup,
  returnProgress,
}: {
  groups: { name: string; outfits: LibraryOutfit[] }[];
  onSelect: (groupName: string) => void;
  onBuild: () => void;
  returningGroup: string | null;
  returnProgress: Animated.Value;
}) {
  const hasLooks = groups[0]?.outfits.length > 0;

  return (
    <View style={{ gap: 22 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
        {groups.map((group) => (
          <AlbumCard key={group.name} group={group} onPress={() => onSelect(group.name)} returning={group.name === returningGroup} returnProgress={returnProgress} />
        ))}
      </View>

      {!hasLooks ? (
        <Card className="items-center gap-3 py-10">
          <SymbolView name="photo.on.rectangle.angled" tintColor="rgba(0,0,0,0.15)" style={{ width: 42, height: 42 }} />
          <View style={{ gap: 4, alignItems: "center" }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "rgba(0,0,0,0.48)", textAlign: "center" }}>No outfit albums yet</Text>
            <Text style={{ fontSize: 13, color: "rgba(0,0,0,0.35)", textAlign: "center" }}>Save Alta looks or build your own.</Text>
          </View>
          <Pressable onPress={onBuild} style={{ minHeight: 44, borderRadius: 999, backgroundColor: "#000", paddingHorizontal: 18, alignItems: "center", justifyContent: "center", marginTop: 4 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFFDF3" }}>Build a look</Text>
          </Pressable>
        </Card>
      ) : null}
    </View>
  );
}

function AlbumCard({ group, onPress, returning, returnProgress }: { group: { name: string; outfits: LibraryOutfit[] }; onPress: () => void; returning: boolean; returnProgress: Animated.Value }) {
  const previewCount = Math.min(group.outfits.length, 4);
  const returnScale = returnProgress.interpolate({ inputRange: [0, 1], outputRange: [1.18, 1] });
  const returnTranslateY = returnProgress.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] });
  const animatedStyle = returning ? { transform: [{ translateY: returnTranslateY }, { scale: returnScale }] } : undefined;

  return (
    <Animated.View style={[{ width: "47%" }, animatedStyle]}>
      <Pressable onPress={onPress} accessibilityLabel={`${group.name} outfits`} style={{ gap: 8 }}>
        <View
          style={{
            aspectRatio: 1,
            borderRadius: 20,
            backgroundColor: "#FFFFFF",
            overflow: "hidden",
            padding: previewCount <= 1 ? 0 : 5,
            borderWidth: 1,
            borderColor: "rgba(0,0,0,0.06)",
            boxShadow: "0 12px 28px rgba(0, 0, 0, 0.055)",
          }}
        >
          <AlbumArtwork count={previewCount} />
        </View>
        <View style={{ gap: 2, paddingHorizontal: 4 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: "#000" }}>{group.name}</Text>
          <Text style={{ fontSize: 12, fontWeight: "600", color: "rgba(0,0,0,0.46)" }}>{group.outfits.length} {group.outfits.length === 1 ? "look" : "looks"}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function AlbumFullPage({
  groupName,
  outfits,
  items,
  isSavedLook,
  toggleSavedLook,
}: {
  groupName: string;
  outfits: LibraryOutfit[];
  items: ClothingItem[];
  isSavedLook: (outfitId: string) => boolean;
  toggleSavedLook: (outfitId: string) => void;
}) {
  return (
    <View style={{ gap: 22 }}>
      {outfits.length === 0 ? (
        <View style={{ alignItems: "center", gap: 10, paddingHorizontal: 18, paddingVertical: 36 }}>
          <SymbolView name="photo" tintColor="rgba(0,0,0,0.15)" style={{ width: 42, height: 42 }} />
          <View style={{ gap: 4, alignItems: "center" }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "rgba(0,0,0,0.48)", textAlign: "center" }}>No {groupName.toLowerCase()} looks</Text>
            <Text style={{ fontSize: 13, color: "rgba(0,0,0,0.35)", textAlign: "center" }}>{groupName === "Favorites" ? "Heart outfits to collect them here." : "Assign this group when saving a custom outfit."}</Text>
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16, paddingHorizontal: 8 }}>
          {outfits.map((outfit) => {
            const outfitItems = outfit.itemIds
              .map((id) => items.find((item) => item.id === id))
              .filter((item): item is ClothingItem => Boolean(item));

            return (
              <Pressable
                key={outfit.id}
                accessibilityLabel={`Open ${outfit.label} details`}
                onPress={() => router.push(`/look/${outfit.id}`)}
                style={{ width: "46%" }}
              >
                <OutfitPreviewCard
                  title={outfit.label}
                  subtitle={outfit.description}
                  items={outfitItems}
                  saved={outfit.source === "saved" ? isSavedLook(outfit.id) : true}
                  badge={outfit.source === "mine" ? "Custom" : outfit.source === "mock" ? "Demo" : undefined}
                  compact
                  onSavePress={outfit.source === "saved" && groupName !== "Favorites" ? () => toggleSavedLook(outfit.id) : undefined}
                />
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

function AlbumArtwork({ count }: { count: number }) {
  return (
    <View style={{ flex: 1, padding: count <= 1 ? 0 : 5 }}>
      {count > 0 ? (
        <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", gap: count <= 1 ? 0 : 5 }}>
          {Array.from({ length: count }).map((_, index) => (
            <View key={index} style={getThumbnailStyle(count)}>
              <Image source={require("@/assets/look-preview.png")} contentFit="contain" style={{ width: "100%", height: "100%" }} />
            </View>
          ))}
        </View>
      ) : (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <SymbolView name="photo" tintColor="rgba(0,0,0,0.14)" style={{ width: 36, height: 36 }} />
        </View>
      )}
    </View>
  );
}

function getThumbnailStyle(count: number) {
  if (count === 1) {
    return {
      width: "100%" as const,
      height: "100%" as const,
      borderRadius: 20,
      backgroundColor: "#FFFFFF",
      overflow: "hidden" as const,
    };
  }

  if (count === 2) {
    return {
      width: "48%" as const,
      height: "100%" as const,
      borderRadius: 14,
      backgroundColor: "#FFFFFF",
      overflow: "hidden" as const,
    };
  }

  return {
    width: "48%" as const,
    height: "48%" as const,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    overflow: "hidden" as const,
  };
}
