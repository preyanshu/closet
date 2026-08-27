import { Button, Card, Screen, SectionHeader } from "@/components/ui";
import { useCloset } from "@/state/closet-context";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { SymbolView } from "expo-symbols";
import { router } from "expo-router";
import SegmentedControl from "@react-native-segmented-control/segmented-control";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, Switch, Text, TextInput, View } from "react-native";
import { type ClothingCategory } from "@/data/mock";

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
      name,
      category,
      color,
      aesthetics: selectedAesthetics,
      imageUrl: pickedImage ?? "mock://scanned",
      lastWorn: null,
      price: Math.max(0, parseFloat(price) || 0),
      wearCount: 0,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.dismiss();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#FFFDF3" }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <Screen>
        <SectionHeader eyebrow="Confirm item" title="Review details" />

        <Pressable onPress={pickImage} style={{ width: "100%", aspectRatio: 1, borderRadius: 20, backgroundColor: "#F6F1E4", overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
          {pickedImage ? (
            <Text style={{ fontSize: 13, color: "rgba(0,0,0,0.4)" }}>Image selected ✓</Text>
          ) : (
            <View style={{ alignItems: "center", gap: 8 }}>
              <SymbolView name="camera" tintColor="rgba(0,0,0,0.2)" style={{ width: 48, height: 48 }} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: "rgba(0,0,0,0.35)" }}>Tap to choose photo</Text>
            </View>
          )}
        </Pressable>

        <Card className="gap-4">
          <Field label="Name" value={name} onChangeText={setName} />

          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: "rgba(0,0,0,0.5)" }}>Price</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 16, borderWidth: 1, borderColor: "rgba(0,0,0,0.1)", backgroundColor: "#FFFFFA", paddingHorizontal: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: "rgba(0,0,0,0.35)" }}>$</Text>
              <TextInput value={price} onChangeText={setPrice} keyboardType="number-pad" placeholder="0" placeholderTextColor="rgba(0,0,0,0.3)" style={{ flex: 1, paddingVertical: 12, fontSize: 15, fontWeight: "500", color: "#000" }} />
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: "rgba(0,0,0,0.5)" }}>Category</Text>
            <SegmentedControl
              values={categories.map((c) => categoryShortLabels[c])}
              selectedIndex={categories.indexOf(category)}
              onChange={(event) => setCategory(categories[event.nativeEvent.selectedSegmentIndex])}
              tintColor="#000000"
              backgroundColor="rgba(0,0,0,0.05)"
              fontStyle={{ color: "rgba(0,0,0,0.5)", fontSize: 12, fontWeight: "600" }}
              activeFontStyle={{ color: "#FFFDF3", fontSize: 12, fontWeight: "700" }}
            />
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: "rgba(0,0,0,0.5)" }}>Color</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {colorOptions.map((c) => (
                <Pressable key={c} onPress={() => setColor(c)} style={{ width: 36, height: 36, borderRadius: 999, backgroundColor: c === "#000" ? "#000" : c, borderWidth: c === color ? 3 : 1, borderColor: c === color ? "#000" : "rgba(0,0,0,0.1)" }} />
              ))}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: "rgba(0,0,0,0.5)" }}>Aesthetics</Text>
            <View style={{ borderRadius: 20, borderCurve: "continuous", borderWidth: 1, borderColor: "rgba(0,0,0,0.06)", backgroundColor: "#FFFFFA", paddingHorizontal: 16 }}>
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
                    <Text style={{ fontSize: 15, fontWeight: "600", color: "#000", textTransform: "capitalize" }}>{aesthetic.replace("-", " ")}</Text>
                    <Switch
                      value={selected}
                      onValueChange={(value) => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        toggleAesthetic(aesthetic);
                      }}
                      trackColor={{ false: "#E4E4EA", true: "#000000" }}
                      thumbColor="#FFFFFF"
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

function Field({ label, value, onChangeText }: { label: string; value: string; onChangeText: (t: string) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: "rgba(0,0,0,0.5)" }}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} style={{ borderRadius: 16, borderWidth: 1, borderColor: "rgba(0,0,0,0.1)", backgroundColor: "#FFFFFA", paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, fontWeight: "500", color: "#000" }} placeholderTextColor="rgba(0,0,0,0.3)" />
    </View>
  );
}
