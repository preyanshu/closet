import { adaptiveColors, Button, EmptyState, FilterChip, PageHeader, Screen, SectionTitle, spacing } from "@/components/ui";
import { type Item } from "@/data/mock";
import { ErrorNotice } from "@/components/error-notice";
import { itemImageSource } from "@/services/item-image";
import { canComposeOutfit, isEligible } from "@/services/outfit-engine";
import { homeChipVibes } from "@/services/vibes";
import { displayName, firstName } from "@/services/display-name";
import { useAuth } from "@/state/auth-context";
import { useCloset } from "@/state/closet-context";
import { useDailyLooks } from "@/state/use-daily-looks";
import { useWeather } from "@/state/use-weather";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View, type PressableProps, type ViewStyle } from "react-native";


/** Pressable with an object style (NativeWind drops function styles) and a pressed fade. */
function Tap({ style, children, ...rest }: { style: ViewStyle; children: ReactNode } & Omit<PressableProps, "style" | "children">) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      {...rest}
      onPressIn={(e) => { setPressed(true); rest.onPressIn?.(e); }}
      onPressOut={(e) => { setPressed(false); rest.onPressOut?.(e); }}
      style={{ ...style, opacity: rest.disabled ? 0.5 : pressed ? 0.65 : 1 }}
    >
      {children}
    </Pressable>
  );
}

export default function HomeScreen() {
  const [selectedAestheticId, setSelectedAestheticId] = useState<string>("all");
  const { items, isSavedLook, toggleSavedLook, setAddedMessage, stylePreferences, profile } = useCloset();
  const canStyle = useMemo(() => canComposeOutfit(items), [items]);
  const { looks: allLooks, status, error, errorKind, refresh, refreshing, generatingVibe, generateFor, toggleDislike, isDisliked } = useDailyLooks();
  // Chips are filters over the one daily pool, by the vibes the stylist labelled each look with.
  // The set is the generic chips + the user's quiz picks + whatever vibes today's looks carry,
  // limited to vibes that suit the wearer.
  const chips = useMemo(
    () => homeChipVibes({ presentation: profile.presentation, preferred: stylePreferences, inPool: allLooks.flatMap((look) => look.metadata?.vibes ?? []) }),
    [profile.presentation, stylePreferences, allLooks],
  );
  const activeVibe = selectedAestheticId === "all" || chips.some((chip) => chip.id === selectedAestheticId) ? selectedAestheticId : "all";
  const outfits = useMemo(
    () => (activeVibe === "all" ? allLooks : allLooks.filter((look) => look.metadata?.vibes?.includes(activeVibe))),
    [allLooks, activeVibe],
  );
  const selectedLabel = chips.find((chip) => chip.id === activeVibe)?.label ?? "";

  return (
    <Screen contentContainerStyle={{ gap: spacing.lg }}>
      <HomeHeader />
      <AskPill />

      <View style={{ gap: 14, marginTop: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <SectionTitle>Today&apos;s looks</SectionTitle>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <IconButton
              label="Refresh looks"
              disabled={refreshing}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                refresh();
              }}
            >
              {refreshing
                ? <ActivityIndicator size="small" color={adaptiveColors.secondaryLabel} />
                : <SymbolView name="arrow.clockwise" tintColor={adaptiveColors.secondaryLabel} style={{ width: 14, height: 14 }} />}
            </IconButton>
            <IconButton label="My outfits" onPress={() => router.push("/outfits")}>
              <SymbolView name="square.stack" tintColor={adaptiveColors.secondaryLabel} style={{ width: 14, height: 14 }} />
            </IconButton>
          </View>
        </View>

        <View style={{ marginHorizontal: -spacing.lg }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: 2 }}>
            <FilterChip label="All" selected={activeVibe === "all"} onPress={() => setSelectedAestheticId("all")} />
            {chips.map((chip) => (
              <FilterChip key={chip.id} label={chip.label} selected={activeVibe === chip.id} onPress={() => setSelectedAestheticId(chip.id)} />
            ))}
          </ScrollView>
        </View>
      </View>

      {error && status !== "loading" ? (
        <ErrorNotice kind={errorKind} title={errorKind ? undefined : "Couldn't style your looks"} message={error} onRetry={refresh} retryLabel="Try again" busy={refreshing} />
      ) : null}

      <View style={{ gap: 14 }}>
        {status === "loading" && allLooks.length === 0 && (
          <View style={{ alignItems: "center", gap: 12, paddingVertical: 40 }}>
            <ActivityIndicator size="small" color={adaptiveColors.secondaryLabel} />
            <Text style={{ fontSize: 13, color: adaptiveColors.tertiaryLabel }}>Alta is styling your day…</Text>
          </View>
        )}
        {status === "error" && allLooks.length === 0 && !error && (
          <Text style={{ textAlign: "center", paddingVertical: 40, fontSize: 13, color: adaptiveColors.tertiaryLabel }}>
            Nothing to style yet. Add a few pieces to your closet.
          </Text>
        )}

        {/* Not enough pieces yet. */}
        {status !== "loading" && allLooks.length === 0 && !canStyle && (
          <EmptyState
            icon="tshirt"
            title="Your outfit ideas will show up here"
            message={items.length === 0 ? "Scan a few of your clothes and Alta will style your day." : "Add a few more pieces and Alta will style your day."}
            action={<Button icon="camera" onPress={() => router.push("/scan")}>Scan clothes</Button>}
          />
        )}

        {/* The closet can style but nothing has arrived yet. */}
        {status !== "loading" && allLooks.length === 0 && canStyle && !error && (
          <EmptyState icon="sparkles" title="Your outfit ideas are coming soon" message="Alta is putting today's looks together. They'll show up here." />
        )}

        {/* A chip with no matching looks today. */}
        {allLooks.length > 0 && outfits.length === 0 && activeVibe !== "all" && (
          <EmptyState
            icon="sparkles"
            title={`No ${selectedLabel} looks today`}
            message={`Today's looks lean other ways. Alta can style a few ${selectedLabel.toLowerCase()} ones for you.`}
            action={<Button icon="sparkles" loading={generatingVibe === activeVibe} disabled={generatingVibe !== null} onPress={() => generateFor(activeVibe)}>{generatingVibe === activeVibe ? "Styling…" : `Style ${selectedLabel} looks`}</Button>}
          />
        )}

        {outfits.map((outfit) => {
          const outfitItems = outfit.itemIds
            .map((id) => items.find((item) => item.id === id))
            .filter((item): item is Item => Boolean(item));
          // Never render a stale/empty look (e.g. cached before its pieces
          // were deleted); a real look needs at least two resolvable pieces.
          if (outfitItems.length < 2) return null;
          const saved = isSavedLook(outfit.id);
          const disliked = isDisliked(outfit);

          return (
            <Tap
              key={outfit.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${outfit.label}`}
              onPress={() => router.push({ pathname: "/look/[id]", params: { id: outfit.id, look: JSON.stringify(outfit) } })}
              style={{
                borderRadius: 20,
                backgroundColor: adaptiveColors.surfaceRaised,
                borderWidth: 1,
                borderColor: adaptiveColors.border,
                padding: 12,
                gap: 12,
              }}
            >
              <View style={{ gap: 12, opacity: disliked ? 0.45 : 1 }}>
              <LookStrip items={outfitItems} />
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 2 }}>
                <View style={{ flex: 1, gap: 2, opacity: disliked ? 0.45 : 1 }}>
                  <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: "700", letterSpacing: -0.2, color: adaptiveColors.label }}>{outfit.label}</Text>
                  {outfit.description ? (
                    <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 18, color: adaptiveColors.secondaryLabel }}>{outfit.description}</Text>
                  ) : null}
                </View>
                <IconButton
                  label={disliked ? "Undo not for me" : "Not for me"}
                  tone={disliked ? "accent" : "muted"}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    toggleDislike(outfit);
                  }}
                >
                  <SymbolView
                    name={disliked ? "hand.thumbsdown.fill" : "hand.thumbsdown"}
                    tintColor={disliked ? adaptiveColors.accent : adaptiveColors.secondaryLabel}
                    style={{ width: 14, height: 14 }}
                  />
                </IconButton>
                {!disliked && (
                  <IconButton
                    label={saved ? "Added to wardrobe" : "Add to wardrobe"}
                    tone={saved ? "accent" : "muted"}
                    onPress={() => {
                      Haptics.notificationAsync(saved ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success);
                      toggleSavedLook(outfit.id, outfit);
                      if (!saved) setAddedMessage("Added to wardrobe");
                    }}
                  >
                    <SymbolView
                      name={saved ? "checkmark" : "plus"}
                      tintColor={saved ? adaptiveColors.accent : adaptiveColors.secondaryLabel}
                      style={{ width: 14, height: 14 }}
                    />
                  </IconButton>
                )}
              </View>
            </Tap>
          );
        })}
      </View>
    </Screen>
  );
}

function greeting(hour: number) {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function HomeHeader() {
  const { weather } = useWeather();
  const { user } = useAuth();
  const name = firstName(displayName(user?.user_metadata?.full_name as string | undefined, user?.email));
  const weatherLine = weather ? `${Math.round(weather.tempC)}° · ${weather.condition}` : null;
  const subtitle = [`${greeting(new Date().getHours())}${name ? `, ${name}` : ""}`, weatherLine].filter(Boolean).join(" · ");
  return <PageHeader eyebrow="Daily styling" title="Today" subtitle={subtitle} />;
}

function AskPill() {
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel="Ask Alta what to wear"
      onPress={() => router.push("/chat")}
      style={{
        minHeight: 52,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingLeft: 16,
        paddingRight: 8,
        borderRadius: 999,
        backgroundColor: adaptiveColors.surfaceRaised,
        borderWidth: 1,
        borderColor: adaptiveColors.border,
      }}
    >
      <SymbolView name="sparkles" tintColor={adaptiveColors.accent} style={{ width: 16, height: 16 }} />
      <Text style={{ flex: 1, fontSize: 15, color: adaptiveColors.tertiaryLabel }}>Ask Alta what to wear</Text>
      <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: adaptiveColors.label }}>
        <SymbolView name="arrow.up" tintColor={adaptiveColors.onAccent} style={{ width: 14, height: 14 }} />
      </View>
    </Tap>
  );
}

function IconButton({ label, onPress, disabled, tone = "muted", children }: { label: string; onPress?: () => void; disabled?: boolean; tone?: "muted" | "accent"; children: ReactNode }) {
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: tone === "accent" ? adaptiveColors.accentSoft : adaptiveColors.surfaceMuted }}
    >
      {children}
    </Tap>
  );
}

/** One even row of square thumbnails; far shorter than the old 2x2 collage. */
function LookStrip({ items }: { items: Item[] }) {
  const previews = items.slice(0, 4);
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {previews.map((item) => (
        <View
          key={item.id}
          style={{
            flex: 1,
            aspectRatio: 1,
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
