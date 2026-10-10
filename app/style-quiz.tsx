import { adaptiveColors, radius, Button, ModalHeader, NativeSwitch, Screen } from "@/components/ui";
import { aesthetics } from "@/data/mock";
import { useCloset } from "@/state/closet-context";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

const steps = [
  { title: "Pick your aesthetics", subtitle: "Select all that match your style" },
  { title: "Your fit priorities", subtitle: "What matters most to you?" },
  { title: "Colors you love", subtitle: "Pick your go-to palette" },
];

const priorities = [
  { id: "comfort", label: "Comfort first", icon: "sofa" as const },
  { id: "polish", label: "Always polished", icon: "sparkles" as const },
  { id: "trend", label: "On trend", icon: "flame" as const },
  { id: "versatile", label: "Versatile", icon: "arrow.triangle.2.circlepath" as const },
];

const paletteOptions = [
  { id: "neutrals", label: "Neutrals", colors: ["#000", "#FFF", "#888"] },
  { id: "earth", label: "Earth tones", colors: ["#8B6914", "#D2B48C", "#2F4F2F"] },
  { id: "bold", label: "Bold colors", colors: ["#FF3B30", "#007AFF", "#FFD60A"] },
  { id: "pastel", label: "Pastels", colors: ["#FFB6C1", "#B0E0E6", "#DDA0DD"] },
];

export default function StyleQuizScreen() {
  const { stylePreferences, setStylePreferences } = useCloset();
  const [step, setStep] = useState(0);
  const [selectedAesthetics, setSelectedAesthetics] = useState<string[]>(stylePreferences);
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>([]);
  const [selectedPalette, setSelectedPalette] = useState<string | null>(null);

  const toggleAesthetic = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedAesthetics((prev) => prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]);
  };

  const togglePriority = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPriorities((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);
  };

  const next = () => {
    if (step < steps.length - 1) setStep(step + 1);
    else {
      setStylePreferences(selectedAesthetics);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    }
  };

  return (
    <Screen contentContainerStyle={{ gap: 24, paddingTop: 20 }}>
      <ModalHeader title="Style profile" subtitle="Personalize your wardrobe suggestions." />
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", gap: 4 }}>
          {steps.map((_, i) => (
            <View key={i} style={{ flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: i <= step ? adaptiveColors.label : "rgba(0,0,0,0.1)" }} />
          ))}
        </View>
      </View>

      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 24, fontWeight: "700", color: adaptiveColors.label, letterSpacing: -0.5 }}>{steps[step].title}</Text>
        <Text style={{ fontSize: 15, color: adaptiveColors.secondaryLabel }}>{steps[step].subtitle}</Text>
      </View>

      {step === 0 && (
        <View style={{ borderRadius: 20, borderCurve: "continuous", borderWidth: 1, borderColor: adaptiveColors.border, backgroundColor: adaptiveColors.surface, paddingHorizontal: 16 }}>
          {aesthetics.map((a, index) => {
            const selected = selectedAesthetics.includes(a.id);
            return (
              <View
                key={a.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 13,
                  borderBottomWidth: index === aesthetics.length - 1 ? 0 : 1,
                  borderBottomColor: "rgba(0,0,0,0.05)",
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: "600", color: adaptiveColors.label }}>{a.label}</Text>
                <NativeSwitch
                  value={selected}
                  onValueChange={() => toggleAesthetic(a.id)}
                />
              </View>
            );
          })}
        </View>
      )}

      {step === 1 && (
        <View style={{ borderRadius: 20, borderCurve: "continuous", borderWidth: 1, borderColor: adaptiveColors.border, backgroundColor: adaptiveColors.surface, paddingHorizontal: 16 }}>
          {priorities.map((p, index) => {
            const selected = selectedPriorities.includes(p.id);
            return (
              <View
                key={p.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 14,
                  paddingVertical: 13,
                  borderBottomWidth: index === priorities.length - 1 ? 0 : 1,
                  borderBottomColor: "rgba(0,0,0,0.05)",
                }}
              >
                <View style={{ width: 36, height: 36, borderRadius: radius.pill, backgroundColor: "rgba(0,0,0,0.06)", alignItems: "center", justifyContent: "center" }}>
                  <SymbolView name={p.icon} tintColor="rgba(0,0,0,0.5)" style={{ width: 18, height: 18 }} />
                </View>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: "600", color: adaptiveColors.label }}>{p.label}</Text>
                <NativeSwitch
                  value={selected}
                  onValueChange={() => togglePriority(p.id)}
                />
              </View>
            );
          })}
        </View>
      )}

      {step === 2 && (
        <View style={{ gap: 12 }}>
          {paletteOptions.map((p) => {
            const selected = selectedPalette === p.id;
            return (
              <Pressable key={p.id} onPress={() => setSelectedPalette(selected ? null : p.id)} style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 18, backgroundColor: selected ? adaptiveColors.label : "rgba(0,0,0,0.03)", borderWidth: 1, borderColor: selected ? adaptiveColors.label : "rgba(0,0,0,0.06)" }}>
                <View style={{ flexDirection: "row", gap: 4 }}>
                  {p.colors.map((c, i) => (
                    <View key={i} style={{ width: 24, height: 24, borderRadius: radius.pill, backgroundColor: c, borderWidth: 1, borderColor: adaptiveColors.border }} />
                  ))}
                </View>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: "600", color: selected ? adaptiveColors.onAccent : adaptiveColors.label }}>{p.label}</Text>
                {selected && <SymbolView name="checkmark" tintColor={adaptiveColors.onAccent} style={{ width: 18, height: 18 }} />}
              </Pressable>
            );
          })}
        </View>
      )}

      <Button onPress={next} icon={step === steps.length - 1 ? "checkmark" : "arrow.right"}>
        {step === steps.length - 1 ? "Save preferences" : "Continue"}
      </Button>
    </Screen>
  );
}
