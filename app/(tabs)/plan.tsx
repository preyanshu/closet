import { adaptiveColors, radius, GlassButton, Screen, SectionHeader, Sheet, WardrobeIcon } from "@/components/ui";
import { clothingItems, mockOutfitAlbums, type Item, type Outfit } from "@/data/mock";
import { useCloset } from "@/state/closet-context";
import { Image } from "expo-image";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";

const calendarColumns = 7;
const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function PlanScreen() {
  const { items, myLooks, savedLooks, logWear } = useCloset();
  const today = new Date();
  const [visibleDate, setVisibleDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [pickerDay, setPickerDay] = useState<number | null>(null);
  const [plannedLooks, setPlannedLooks] = useState<Record<string, string>>({});
  const [wornDays, setWornDays] = useState<Set<string>>(() => new Set());
  const { width } = useWindowDimensions();

  const monthCells = useMemo(() => getMonthCells(visibleDate), [visibleDate]);
  const outfitOptions = useMemo<Outfit[]>(() => [...myLooks, ...savedLooks, ...mockOutfitAlbums], [myLooks, savedLooks]);
  const selectedMonth = visibleDate.getMonth() === today.getMonth() && visibleDate.getFullYear() === today.getFullYear();
  const monthLabel = `${monthNames[visibleDate.getMonth()]} ${visibleDate.getFullYear()}`;
  const cellWidth = (width - 64) / calendarColumns;
  const cellHeight = Math.max(96, Math.min(118, cellWidth * 1.2));
  const pickerDateLabel = pickerDay ? `${monthNames[visibleDate.getMonth()]} ${pickerDay}` : "";

  const selectedPlanKey = getDateKey(visibleDate, selectedDay);
  const selectedPlanOutfit = outfitOptions.find((outfit) => outfit.id === plannedLooks[selectedPlanKey]) ?? null;
  const selectedDateObj = new Date(visibleDate.getFullYear(), visibleDate.getMonth(), selectedDay);
  const isPastDay = selectedDateObj < new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const isSelectedWorn = wornDays.has(selectedPlanKey);

  const moveMonth = (direction: -1 | 1) => {
    setVisibleDate((current) => {
      const next = new Date(current.getFullYear(), current.getMonth() + direction, 1);
      const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      setSelectedDay((day) => Math.min(day, maxDay));
      return next;
    });
  };

  return (
    <Screen scroll={false}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 24, paddingHorizontal: 24, paddingBottom: 140, paddingTop: 28 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <SectionHeader eyebrow="Plan" title="Style calendar" />
          <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
            <GlassButton icon="flame.fill" label="Style streak" value="0" onPress={() => {}} />
            <GlassButton icon="square.and.arrow.up" label="Share plan" onPress={() => router.push("/outfits")} />
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 28, borderBottomWidth: 1, borderColor: adaptiveColors.border, paddingBottom: 18 }}>
          <MiniInsight title="Most worn" value="Cream knit polo" imageUrl={clothingItems[2].displayAssetUri} />
          <MiniInsight title="Closet usage" value="0%" />
        </View>

        <View style={{ gap: 18 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ gap: 2 }}>
              <Text style={{ fontSize: 18, fontWeight: "800", color: adaptiveColors.label }}>{monthLabel}</Text>
              <Text style={{ fontSize: 12, fontWeight: "600", color: adaptiveColors.secondaryLabel }}>Tap a day to plan a look</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <GlassButton icon="chevron.left" label="Previous month" onPress={() => moveMonth(-1)} size={36} />
              <GlassButton icon="chevron.right" label="Next month" onPress={() => moveMonth(1)} size={36} />
            </View>
          </View>

          <View
            style={{
              gap: 12,
              backgroundColor: adaptiveColors.surface,
              borderRadius: 28,
              borderCurve: "continuous",
              borderWidth: 1,
              borderColor: adaptiveColors.border,
              paddingVertical: 14,
              paddingHorizontal: 6,
              boxShadow: "0 14px 36px rgba(0,0,0,0.045)",
            }}
          >
            <View style={{ flexDirection: "row" }}>
              {weekDays.map((day) => (
                <Text key={day} style={{ width: `${100 / calendarColumns}%`, textAlign: "center", fontSize: 10, fontWeight: "800", letterSpacing: 0.8, color: "rgba(0,0,0,0.3)" }}>
                  {day.toUpperCase()}
                </Text>
              ))}
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {monthCells.map((cell, index) => {
                const isSelected = Boolean(cell.day && cell.day === selectedDay);
                const isToday = Boolean(cell.day && selectedMonth && cell.day === today.getDate());
                const dateKey = cell.day ? getDateKey(visibleDate, cell.day) : null;
                const plannedOutfit = dateKey ? outfitOptions.find((outfit) => outfit.id === plannedLooks[dateKey]) : null;

                return (
                  <View
                    key={`${cell.day ?? "blank"}-${index}`}
                    style={{ width: `${100 / calendarColumns}%`, height: cellHeight, padding: 2 }}
                  >
                    <View
                      style={{
                        flex: 1,
                        alignItems: "center",
                        borderRadius: 16,
                        paddingTop: 5,
                        paddingBottom: 5,
                        backgroundColor: isSelected ? "rgba(0,0,0,0.045)" : "transparent",
                      }}
                    >
                      <Pressable
                        disabled={!cell.day}
                        accessibilityLabel={cell.day ? `Select ${monthLabel} ${cell.day}` : undefined}
                        onPress={() => cell.day && setSelectedDay(cell.day)}
                        style={{ height: 26, alignItems: "center", justifyContent: "center" }}
                      >
                        <View style={{ width: 26, height: 26, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: isToday ? adaptiveColors.label : "transparent" }}>
                          <Text style={{ fontSize: 11, fontWeight: "800", fontVariant: ["tabular-nums"], color: isToday ? adaptiveColors.onAccent : isSelected ? adaptiveColors.label : "rgba(0,0,0,0.38)" }}>
                            {cell.day ?? ""}
                          </Text>
                        </View>
                      </Pressable>

                      {cell.day ? (
                        plannedOutfit ? (
                          <Pressable
                            accessibilityLabel={`Select ${monthLabel} ${cell.day}`}
                            onPress={() => cell.day && setSelectedDay(cell.day)}
                            style={{ flex: 1, width: "86%", marginTop: 6, borderRadius: 10, overflow: "hidden", backgroundColor: adaptiveColors.surfaceRaised, borderWidth: 1, borderColor: adaptiveColors.border }}
                          >
                            <Image source={require("@/assets/look-preview.png")} contentFit="contain" style={{ width: "100%", height: "100%" }} />
                          </Pressable>
                        ) : (
                          <Pressable
                            accessibilityLabel={`Choose outfit for ${monthLabel} ${cell.day}`}
                            onPress={() => {
                              setSelectedDay(cell.day!);
                              setPickerDay(cell.day);
                            }}
                            style={{ flex: 1, width: "86%", marginTop: 6, borderRadius: 10, borderWidth: 1, borderStyle: "dashed", borderColor: adaptiveColors.border, alignItems: "center", justifyContent: "center" }}
                          >
                            <WardrobeIcon name="plus" color={adaptiveColors.tertiaryLabel} size={12} />
                          </Pressable>
                        )
                      ) : (
                        <View style={{ flex: 1 }} />
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {selectedPlanOutfit && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              backgroundColor: adaptiveColors.surface,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: adaptiveColors.border,
              paddingHorizontal: 16,
              paddingVertical: 14,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "800", color: adaptiveColors.label }}>
                {selectedPlanOutfit.label}
              </Text>
              <Text style={{ fontSize: 11, fontWeight: "700", color: adaptiveColors.secondaryLabel }}>
                {monthNames[visibleDate.getMonth()]} {selectedDay} · {selectedPlanOutfit.itemIds.length} pieces
              </Text>
            </View>
            <GlassButton
              icon={isSelectedWorn ? "checkmark.circle.fill" : "checkmark.circle"}
              label={isSelectedWorn ? "Worn" : "I wore this"}
              tintColor={isSelectedWorn ? "#34C759" : "rgba(0,0,0,0.6)"}
              onPress={() => {
                if (isSelectedWorn || !isPastDay) return;
                const date = new Date(visibleDate.getFullYear(), visibleDate.getMonth(), selectedDay);
                const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                logWear(selectedPlanOutfit.id, selectedPlanOutfit.itemIds, localDate);
                setWornDays((current) => new Set(current).add(selectedPlanKey));
              }}
              variant={isPastDay && !isSelectedWorn ? "dark" : undefined}
            />
          </View>
        )}

      </ScrollView>

      <OutfitPickerSheet
        visible={pickerDay !== null}
        dateLabel={pickerDateLabel}
        outfits={outfitOptions}
        items={items}
        onClose={() => setPickerDay(null)}
        onSelect={(outfit) => {
          if (pickerDay) {
            setPlannedLooks((current) => ({ ...current, [getDateKey(visibleDate, pickerDay)]: outfit.id }));
          }
          setPickerDay(null);
        }}
      />
    </Screen>
  );
}

function OutfitPickerSheet({
  visible,
  dateLabel,
  outfits,
  items,
  onClose,
  onSelect,
}: {
  visible: boolean;
  dateLabel: string;
  outfits: Outfit[];
  items: Item[];
  onClose: () => void;
  onSelect: (outfit: Outfit) => void;
}) {
  return (
    <Sheet visible={visible} onDismiss={onClose} title="Choose outfit" subtitle={dateLabel}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
            {outfits.map((outfit) => {
              const outfitItems = outfit.itemIds
                .map((id) => items.find((item) => item.id === id))
                .filter((item): item is Item => Boolean(item));

              return (
                <Pressable key={outfit.id} accessibilityLabel={`Select ${outfit.label}`} onPress={() => onSelect(outfit)} style={{ width: "47%", gap: 8 }}>
                  <View style={{ aspectRatio: 1, borderRadius: 18, backgroundColor: adaptiveColors.surfaceRaised, overflow: "hidden", borderWidth: 1, borderColor: adaptiveColors.border }}>
                    <Image source={require("@/assets/look-preview.png")} contentFit="contain" style={{ width: "100%", height: "100%" }} />
                  </View>
                  <View style={{ gap: 3, paddingHorizontal: 2 }}>
                    <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "800", color: adaptiveColors.label }}>{outfit.label}</Text>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: adaptiveColors.secondaryLabel }}>{outfitItems.length} pieces</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
    </Sheet>
  );
}

function MiniInsight({ title, value, imageUrl }: { title: string; value: string; imageUrl?: string }) {
  return (
    <View style={{ flex: 1, gap: 8 }}>
      <Text style={{ fontSize: 11, fontWeight: "800", color: "rgba(0,0,0,0.34)", textTransform: "uppercase" }}>{title}</Text>
      {imageUrl ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Image source={getItemImageSource(imageUrl)} contentFit="contain" style={{ width: 34, height: 34 }} />
          <Text numberOfLines={2} style={{ flex: 1, fontSize: 13, fontWeight: "800", color: adaptiveColors.label }}>{value}</Text>
        </View>
      ) : (
        <Text style={{ fontSize: 22, fontWeight: "800", color: adaptiveColors.label }}>{value}</Text>
      )}
    </View>
  );
}

function getMonthCells(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ day: number | null }> = [];

  for (let i = 0; i < firstDay; i += 1) {
    cells.push({ day: null });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ day });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ day: null });
  }

  return cells;
}

function getDateKey(date: Date, day: number) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${day}`;
}

function getItemImageSource(imageUrl: string) {
  if (imageUrl.includes("item-1")) return require("@/assets/item-1.png");
  if (imageUrl.includes("item-2")) return require("@/assets/item-2.png");
  if (imageUrl.includes("item-3")) return require("@/assets/item-3.png");
  if (imageUrl.includes("item-4")) return require("@/assets/item-4.png");
  return { uri: imageUrl };
}
