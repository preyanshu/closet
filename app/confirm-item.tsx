import { adaptiveColors, radius, spacing, Button, Card, FormField, ModalHeader, NativePicker, NativeSwitch, Screen, WardrobeIcon } from "@/components/ui";
import { useCloset } from "@/state/closet-context";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { SymbolView } from "expo-symbols";
import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from "react-native";
import { type ClothingCategory } from "@/data/mock";
import { defaultRoleForCategory } from "@/types/taxonomy";

const categories: ClothingCategory[] = ["top", "bottom", "outerwear", "shoes", "accessory"];
const categoryShortLabels: Record<ClothingCategory, string> = {
  top: "Tops",
  bottom: "Bottoms",
  outerwear: "Outer",
  shoes: "Shoes",
  accessory: "Bags",
};
const colorOptions = ["black", "white", "navy", "gray", "brown", "cream", "blue", "camel"];
const aestheticOptions = ["old-money", "office", "streetwear", "clean-girl", "minimal", "evening"];
const categoryOptions = categories.map((value) => ({ label: categoryShortLabels[value], value }));
const swatchColor = (color: string) => {
  const map: Record<string, string> = { white: "#F5F1E8", navy: "#1F2A44", gray: "#8E8E93", brown: "#6B4A2F", cream: "#EFE3CB", blue: "#3B6EA8", camel: "#C08A4E", black: "#0E0D0B" };
  return map[color] ?? color;
};

export default function ConfirmItemScreen() {
  const { addItem } = useCloset();
  const [pickedImage, setPickedImage] = useState<string | null>(null);
  const [name, setName] = useState("Scanned black tee");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState<ClothingCategory>("top");
  const [color, setColor] = useState("black");
  const [selectedAesthetics, setSelectedAesthetics] = useState<string[]>(["minimal"]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsEditing: true });
    if (!result.canceled) {
      setPickedImage(result.assets[0]?.uri ?? null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const toggleAesthetic = (id: string) => {
    setSelectedAesthetics((prev) => prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]);
  };

  const save = () => {
    addItem({
      id: `scan-${Date.now()}`,
      ownerId: "local-demo",
      name,
      category,
      role: defaultRoleForCategory(category),
      primaryColor: color.toLowerCase(),
      secondaryColors: [],
      styleTags: selectedAesthetics,
      originalAssetUri: pickedImage ?? "mock://scanned",
      displayAssetUri: pickedImage ?? "mock://scanned",
      priceMinor: price.trim() === "" ? null : Math.round(Math.max(0, parseFloat(price)) * 100),
      priceCurrency: "USD",
      wearCount: 0,
      lastWorn: null,
      availabilityStatus: "available",
      lifecycleStatus: "owned",
      processingStatus: "ready",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      revision: 1,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.dismiss();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: adaptiveColors.canvas }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <Screen contentContainerStyle={{ gap: 24, paddingTop: 20 }}>
        <ModalHeader title="Review details" subtitle="Edit each detail before adding this piece." />

        <Pressable onPress={pickImage} style={{ width: "100%", aspectRatio: 1, borderRadius: 20, backgroundColor: adaptiveColors.surfaceMuted, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
          {pickedImage ? (
            <Text style={{ fontSize: 13, color: adaptiveColors.secondaryLabel }}>Image selected ✓</Text>
          ) : (
            <View style={{ alignItems: "center", gap: 8 }}>
              <WardrobeIcon name="camera" color={adaptiveColors.tertiaryLabel} size={42} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: adaptiveColors.secondaryLabel }}>Tap to choose photo</Text>
            </View>
          )}
        </Pressable>

        <Card className="gap-5">
          <FormField label="Name" value={name} onChangeText={setName} />
          <FormField label="Price" value={price} onChangeText={setPrice} keyboardType="number-pad" placeholder="0" accessibilityHint="Price in dollars" />

          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: adaptiveColors.secondaryLabel }}>Category</Text>
            <NativePicker value={category} onValueChange={setCategory} options={categoryOptions} label="Category" />
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: adaptiveColors.secondaryLabel }}>Color</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {colorOptions.map((c) => (
                <Pressable key={c} accessibilityRole="radio" accessibilityLabel={`${c} color`} accessibilityState={{ selected: c === color }} onPress={() => setColor(c)} style={{ width: 38, height: 38, borderRadius: radius.pill, backgroundColor: swatchColor(c), borderWidth: c === color ? 3 : 1, borderColor: c === color ? adaptiveColors.label : "rgba(0,0,0,0.1)", alignItems: "center", justifyContent: "center" }}>
                  {c === color ? <WardrobeIcon name="checkmark" color={c === "white" || c === "cream" ? adaptiveColors.label : "#FFF"} size={15} weight="bold" /> : null}
                </Pressable>
              ))}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: adaptiveColors.secondaryLabel }}>Aesthetics</Text>
            <View style={{ borderRadius: 20, borderCurve: "continuous", borderWidth: 1, borderColor: adaptiveColors.border, backgroundColor: adaptiveColors.surface, paddingHorizontal: 16 }}>
              {aestheticOptions.map((aesthetic, index) => {
                const selected = selectedAesthetics.includes(aesthetic);
                return (
                  <View
                    key={aesthetic}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingVertical: 13,
                      borderBottomWidth: index === aestheticOptions.length - 1 ? 0 : 1,
                      borderBottomColor: "rgba(0,0,0,0.05)",
                    }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: "600", color: adaptiveColors.label, textTransform: "capitalize" }}>{aesthetic.replace("-", " ")}</Text>
                    <NativeSwitch
                      value={selected}
                      onValueChange={(value) => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        toggleAesthetic(aesthetic);
                      }}
                    />
                  </View>
                );
              })}
            </View>
          </View>
        </Card>

        <Button onPress={save} icon="checkmark">Save to closet</Button>
      </Screen>
    </KeyboardAvoidingView>
  );
}
