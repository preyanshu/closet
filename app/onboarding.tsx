import { adaptiveColors, spacing, Button, FilterChip } from "@/components/ui";
import { vibesFor } from "@/services/vibes";
import { useAppFlow } from "@/state/app-flow";
import { useCloset } from "@/state/closet-context";
import { WEARER_PRESENTATIONS, type WearerPresentation } from "@/types/domain";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

const STEPS = 3;
/** After the questions: a short "setting up" moment before the paywall. */
const SETUP_LINES = ["Tailoring looks to your style", "Reading today's weather", "Getting your closet ready"];
const SETUP_MS = 2400;

const FEATURES = [
  { icon: "camera" as const, title: "Scan what you own", body: "Snap a photo. Alta cleans it up and learns the details." },
  { icon: "sparkles" as const, title: "Styled for you, daily", body: "Fresh looks every morning, built from your own closet and the weather." },
  { icon: "icloud" as const, title: "Always with you", body: "Your closet syncs across your devices." },
];

const WEARERS: Record<WearerPresentation, { title: string; body: string }> = {
  male: { title: "Menswear", body: "Looks and vibes tailored to menswear." },
  female: { title: "Womenswear", body: "Looks and vibes tailored to womenswear." },
  unspecified: { title: "Everything", body: "A bit of everything, no filter." },
};

/** First run: what Alta does, who it's styling, and what vibes they like. Nothing here needs an account. */
export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { completeOnboarding, skipToSignIn } = useAppFlow();
  const { profile, updateProfile, stylePreferences, setStylePreferences } = useCloset();
  const [step, setStep] = useState(0);
  const [setupDone, setSetupDone] = useState(0);
  const settingUp = step === STEPS;
  const progress = useSharedValue(0);
  const progressStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  const presentation = profile.presentation ?? "male";
  const vibes = vibesFor(presentation);

  const next = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep(step + 1);
  };

  // The "setting up" screen ticks through its lines, then moves on (to the paywall).
  useEffect(() => {
    if (!settingUp) return;
    progress.value = withTiming(1, { duration: SETUP_MS, easing: Easing.linear });
    const timers = SETUP_LINES.map((_, index) => setTimeout(() => setSetupDone(index + 1), ((index + 1) * SETUP_MS) / SETUP_LINES.length));
    const finish = setTimeout(() => completeOnboarding(), SETUP_MS + 500);
    return () => { timers.forEach(clearTimeout); clearTimeout(finish); };
  }, [settingUp, completeOnboarding, progress]);

  return (
    <View style={{ flex: 1, backgroundColor: adaptiveColors.canvas, paddingTop: insets.top + spacing.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, height: 44 }}>
        {step > 0 && !settingUp ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => setStep(step - 1)} hitSlop={12}>
            <SymbolView name="chevron.left" tintColor={adaptiveColors.label} style={{ width: 18, height: 18 }} />
          </Pressable>
        ) : <View style={{ width: 18 }} />}
        <View style={{ flexDirection: "row", gap: 6, opacity: settingUp ? 0 : 1 }}>
          {Array.from({ length: STEPS }, (_, index) => (
            <View key={index} style={{ width: index === step ? 22 : 6, height: 6, borderRadius: 3, backgroundColor: index <= step ? adaptiveColors.label : adaptiveColors.border }} />
          ))}
        </View>
        <View style={{ width: 18 }} />
      </View>

      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: spacing.xl, paddingTop: spacing.xxl, gap: spacing.xl }} showsVerticalScrollIndicator={false}>
        {step === 0 ? (
          <>
            <View style={{ gap: 10 }}>
              <Text style={{ fontSize: 36, lineHeight: 41, fontWeight: "800", letterSpacing: -1.2, color: adaptiveColors.label }}>Your closet,{"\n"}styled every day.</Text>
              <Text style={{ fontSize: 16, lineHeight: 22, color: adaptiveColors.secondaryLabel }}>Meet Alta, a personal stylist that works with the clothes you already own.</Text>
            </View>
            <View style={{ gap: spacing.lg }}>
              {FEATURES.map((feature) => (
                <View key={feature.title} style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
                  <View style={{ width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: adaptiveColors.accentSoft }}>
                    <SymbolView name={feature.icon} tintColor={adaptiveColors.accent} style={{ width: 22, height: 22 }} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: adaptiveColors.label }}>{feature.title}</Text>
                    <Text style={{ fontSize: 14, lineHeight: 19, color: adaptiveColors.secondaryLabel }}>{feature.body}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <View style={{ gap: 10 }}>
              <Text style={{ fontSize: 32, lineHeight: 37, fontWeight: "800", letterSpacing: -1, color: adaptiveColors.label }}>Who are we styling?</Text>
              <Text style={{ fontSize: 16, lineHeight: 22, color: adaptiveColors.secondaryLabel }}>This shapes the looks and vibes Alta shows you. You can change it any time.</Text>
            </View>
            <View style={{ gap: spacing.sm }}>
              {WEARER_PRESENTATIONS.map((option) => {
                const selected = presentation === option;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      Haptics.selectionAsync();
                      updateProfile({ ...profile, presentation: option });
                    }}
                    style={{ padding: 18, gap: 3, borderRadius: 20, borderCurve: "continuous", borderWidth: selected ? 2 : 1, borderColor: selected ? adaptiveColors.label : adaptiveColors.border, backgroundColor: adaptiveColors.surfaceRaised }}
                  >
                    <Text style={{ fontSize: 17, fontWeight: "700", color: adaptiveColors.label }}>{WEARERS[option].title}</Text>
                    <Text style={{ fontSize: 14, color: adaptiveColors.secondaryLabel }}>{WEARERS[option].body}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <View style={{ gap: 10 }}>
              <Text style={{ fontSize: 32, lineHeight: 37, fontWeight: "800", letterSpacing: -1, color: adaptiveColors.label }}>Pick your vibes</Text>
              <Text style={{ fontSize: 16, lineHeight: 22, color: adaptiveColors.secondaryLabel }}>Choose any that feel like you. Alta leans into these.</Text>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
              {vibes.map((vibe) => {
                const selected = stylePreferences.includes(vibe.id);
                return (
                  <FilterChip
                    key={vibe.id}
                    label={vibe.label}
                    selected={selected}
                    onPress={() => setStylePreferences(selected ? stylePreferences.filter((id) => id !== vibe.id) : [...stylePreferences, vibe.id])}
                  />
                );
              })}
            </View>
          </>
        ) : null}
        {settingUp ? (
          <View style={{ flex: 1, justifyContent: "center", gap: spacing.xl }}>
            <View style={{ gap: 10 }}>
              <Text style={{ fontSize: 32, lineHeight: 37, fontWeight: "800", letterSpacing: -1, color: adaptiveColors.label }}>Setting things up for you</Text>
              <Text style={{ fontSize: 16, lineHeight: 22, color: adaptiveColors.secondaryLabel }}>Just a moment.</Text>
            </View>
            <View style={{ gap: spacing.md }}>
              {SETUP_LINES.map((line, index) => {
                const done = setupDone > index;
                return (
                  <View key={line} style={{ flexDirection: "row", alignItems: "center", gap: 12, opacity: done ? 1 : 0.45 }}>
                    <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: done ? adaptiveColors.label : adaptiveColors.surfaceMuted }}>
                      {done ? <SymbolView name="checkmark" tintColor={adaptiveColors.onAccent} style={{ width: 12, height: 12 }} /> : <ActivityIndicator size="small" color={adaptiveColors.tertiaryLabel} />}
                    </View>
                    <Text style={{ fontSize: 16, fontWeight: "600", color: adaptiveColors.label }}>{line}</Text>
                  </View>
                );
              })}
            </View>
            <View style={{ height: 5, borderRadius: 3, overflow: "hidden", backgroundColor: adaptiveColors.surfaceMuted }}>
              <Animated.View style={[{ height: "100%", backgroundColor: adaptiveColors.label }, progressStyle]} />
            </View>
          </View>
        ) : null}
      </ScrollView>

      {settingUp ? null : <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: Math.max(insets.bottom, spacing.lg), gap: spacing.sm }}>
        <Button onPress={next}>{step === STEPS - 1 ? "Finish" : "Continue"}</Button>
        {step === 0 ? (
          <Pressable accessibilityRole="button" onPress={skipToSignIn} hitSlop={8} style={{ alignItems: "center", paddingVertical: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: adaptiveColors.secondaryLabel }}>I already have an account</Text>
          </Pressable>
        ) : <View style={{ height: 36 }} />}
      </View>}
    </View>
  );
}
