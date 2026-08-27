import { useHeaderHeight } from "@react-navigation/elements";
import { Button } from "@/components/ui";
import { categoryLabels, type ClothingCategory } from "@/data/mock";
import { stageGarment } from "@/services/garment-staging";
import { detectGarment, suggestAesthetics } from "@/services/garment-detect";
import { useCloset } from "@/state/closet-context";
import SegmentedControl from "@react-native-segmented-control/segmented-control";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { type ComponentProps, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

type SymbolName = ComponentProps<typeof SymbolView>["name"];
type PendingItem = {
  id: string;
  name: string;
  category: ClothingCategory;
  color: string;
  price: number;
  aesthetics: string[];
  cleanUri: string | null;
};

const categoryShortLabels: Record<ClothingCategory, string> = {
  top: "Tops",
  bottom: "Bottoms",
  outerwear: "Outer",
  shoes: "Shoes",
  accessory: "Bags",
};
const categoryOrder: ClothingCategory[] = ["top", "bottom", "outerwear", "shoes", "accessory"];
const colorOptions = ["black", "white", "navy", "gray", "brown", "cream", "blue", "camel"];
const lightColors = ["white", "ivory", "cream", "camel"];
const swatchColor = (color: string) => {
  const map: Record<string, string> = { white: "#F5F1E8", ivory: "#F3EAD9", cream: "#EFE3CB", navy: "#1F2A44", charcoal: "#3A3A3A", camel: "#C08A4E", brown: "#6B4A2F", gray: "#8E8E93", blue: "#3B6EA8", black: "#0E0D0B" };
  return map[color] ?? color;
};

const mockDetectedItems: PendingItem[] = [
  { id: "detect-1", name: "Black wool coat", category: "outerwear", color: "black", price: 240, aesthetics: ["old-money", "office"], cleanUri: null },
  { id: "detect-2", name: "Beige pleated trousers", category: "bottom", color: "cream", price: 120, aesthetics: ["minimal", "office"], cleanUri: null },
  { id: "detect-3", name: "Tan leather boots", category: "shoes", color: "brown", price: 180, aesthetics: ["streetwear", "minimal"], cleanUri: null },
];

export default function ScanModal() {
  const { addItem } = useCloset();
  const cameraRef = useRef<CameraView>(null);
  const headerHeight = useHeaderHeight();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [flash, setFlash] = useState<"off" | "on">("off");
  const [mode, setMode] = useState<"camera" | "results">("camera");
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [includedIds, setIncludedIds] = useState<Set<string>>(new Set());
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<PendingItem | null>(null);

  const closeModal = () => {
    if (router.canDismiss()) { router.dismiss(); return; }
    if (router.canGoBack()) { router.back(); return; }
    router.replace("/");
  };

  const showResults = async (uri: string) => {
    setCapturedUri(uri);
    setAnalyzing(true);
    setError(null);
    try {
      const [staged, detected] = await Promise.all([stageGarment(uri), detectGarment(uri)]);
      const item: PendingItem = {
        id: `detect-${Date.now()}`,
        name: detected.name,
        category: detected.category,
        color: detected.primary_color,
        price: 0,
        aesthetics: suggestAesthetics(detected),
        cleanUri: staged.cleanUri,
      };
      setPendingItems([item]);
      setIncludedIds(new Set([item.id]));
      setMode("results");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setError(e?.message ?? "Could not create product photo.");
      setPendingItems(mockDetectedItems.map((item) => ({ ...item, cleanUri: uri })));
      setIncludedIds(new Set(mockDetectedItems.map((item) => item.id)));
      setMode("results");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleCapture = async () => {
    const camera = cameraRef.current;
    if (!camera) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const photo = await camera.takePictureAsync({ quality: 0.8 });
      showResults(photo.uri);
    } catch {}
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsEditing: true });
    if (!result.canceled) {
      const uri = result.assets[0]?.uri;
      if (uri) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        showResults(uri);
      }
    }
  };

  const toggleIncluded = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIncludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveEdit = (updated: PendingItem) => {
    setPendingItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    setDraft(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const scanMore = () => {
    setMode("camera");
    setCapturedUri(null);
    setPendingItems([]);
    setIncludedIds(new Set());
    setDraft(null);
  };

  const finalize = () => {
    const items = pendingItems.filter((item) => includedIds.has(item.id));
    if (items.length === 0) return;
    items.forEach((item) => {
      addItem({
        id: `scan-${Date.now()}-${item.id}`,
        name: item.name,
        category: item.category,
        color: item.color,
        aesthetics: item.aesthetics,
        imageUrl: item.cleanUri ?? capturedUri ?? "mock://scanned",
        lastWorn: null,
        price: item.price,
        wearCount: 0,
      });
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    closeModal();
  };

  const includedCount = pendingItems.filter((item) => includedIds.has(item.id)).length;

  return (
    <View style={{ flex: 1, backgroundColor: "#FFFDF3" }}>
      {mode === "camera" ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: headerHeight + 8, paddingHorizontal: 20, paddingBottom: 24, gap: 24 }}>
          <View style={{ aspectRatio: 3 / 4, borderRadius: 28, borderCurve: "continuous", overflow: "hidden", backgroundColor: "#000", boxShadow: "0 20px 50px rgba(0,0,0,0.16)" }}>
            {permission == null ? (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0E0D0B" }}>
                <ActivityIndicator color="#FFFDF3" />
              </View>
            ) : permission.granted ? (
              <CameraView ref={cameraRef} facing={facing} flash={flash} style={{ flex: 1 }} />
            ) : (
              <PermissionPlaceholder requestPermission={requestPermission} onPickImage={pickImage} />
            )}

            <Viewfinder />

            {analyzing ? (
              <View style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", gap: 10 }}>
                <ActivityIndicator color="#FFFDF3" size="large" />
                <Text style={{ fontSize: 15, fontWeight: "700", color: "#FFFDF3" }}>Creating product photo…</Text>
              </View>
            ) : null}
          </View>

          <View style={{ gap: 18, alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 44 }}>
              <CameraControlButton icon={flash === "on" ? "bolt.fill" : "bolt.slash"} label={flash === "on" ? "Turn flash off" : "Turn flash on"} active={flash === "on"} onPress={() => setFlash((f) => (f === "on" ? "off" : "on"))} />
              <ShutterButton onPress={handleCapture} />
              <CameraControlButton icon="arrow.triangle.2.circlepath.camera" label="Flip camera" onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))} />
            </View>

            <Pressable onPress={pickImage} hitSlop={10} className="active:opacity-60" style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
              <SymbolView name="photo" tintColor="rgba(0,0,0,0.4)" style={{ width: 15, height: 15 }} />
              <Text style={{ fontSize: 14, fontWeight: "600", color: "rgba(0,0,0,0.5)" }}>Choose from library</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 18, paddingHorizontal: 20, paddingTop: headerHeight + 8, paddingBottom: 180 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: error ? "#FDECEA" : "#E5F3EA" }}>
              <SymbolView name={error ? "exclamationmark" : "checkmark"} tintColor={error ? "#D32F2F" : "#1E9E47"} weight="bold" style={{ width: 17, height: 17 }} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 22, fontWeight: "800", letterSpacing: -0.6, color: "#000" }}>
                {pendingItems.length} {pendingItems.length === 1 ? "piece" : "pieces"} found
              </Text>
              <Text style={{ fontSize: 13, fontWeight: "600", color: error ? "#D32F2F" : "rgba(0,0,0,0.45)" }}>
                {error ? "Could not create a clean photo. Using original photo." : "Tap an item to review its details."}
              </Text>
            </View>
          </View>

          <View style={{ borderRadius: 24, borderCurve: "continuous", overflow: "hidden", backgroundColor: "#FFFFFA", boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 10px 28px rgba(0,0,0,0.06)" }}>
            {pendingItems.map((item, index) => (
              <DetectedItemRow
                key={item.id}
                item={item}
                included={includedIds.has(item.id)}
                showTopBorder={index > 0}
                onToggle={() => toggleIncluded(item.id)}
                onEdit={() => setDraft({ ...item })}
              />
            ))}
          </View>
        </ScrollView>
      )}

      {mode === "results" ? (
        <View style={{ position: "absolute", left: 20, right: 20, bottom: 0, paddingBottom: 26, gap: 12 }}>
          <Pressable onPress={scanMore} hitSlop={10} className="active:opacity-60" style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 4 }}>
            <SymbolView name="camera" tintColor="rgba(0,0,0,0.45)" style={{ width: 15, height: 15 }} />
            <Text style={{ fontSize: 14, fontWeight: "700", color: "rgba(0,0,0,0.5)" }}>Scan more</Text>
          </Pressable>
          <Button icon="bag" style={{ opacity: includedCount === 0 ? 0.45 : 1 }} onPress={finalize}>
            Add {includedCount} {includedCount === 1 ? "piece" : "pieces"} to closet
          </Button>
        </View>
      ) : null}

      <Modal visible={draft != null} transparent animationType="slide" onRequestClose={() => setDraft(null)}>
        {draft ? (
          <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.36)" }}>
            <Pressable style={{ flex: 1 }} onPress={() => setDraft(null)} accessibilityLabel="Close editor" />
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
              <EditSheet item={draft} onSave={saveEdit} onClose={() => setDraft(null)} />
            </KeyboardAvoidingView>
          </View>
        ) : null}
      </Modal>
    </View>
  );
}

function CameraControlButton({ icon, label, active, onPress }: { icon: SymbolName; label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      className="active:scale-95"
      style={{ width: 48, height: 48, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: active ? "#000" : "rgba(0,0,0,0.05)" }}
    >
      <SymbolView name={icon} tintColor={active ? "#FFFDF3" : "#000"} style={{ width: 20, height: 20 }} />
    </Pressable>
  );
}

function ShutterButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityLabel="Take photo" onPress={onPress} className="active:scale-95" style={{ width: 76, height: 76, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.06)" }}>
      <View style={{ width: 62, height: 62, borderRadius: 999, borderWidth: 4, borderColor: "rgba(0,0,0,0.1)", backgroundColor: "#000", boxShadow: "0 6px 16px rgba(0,0,0,0.2)" }} />
    </Pressable>
  );
}

function Viewfinder() {
  const size = 26;
  const thickness = 3;
  const cornerColor = "rgba(255,255,255,0.9)";
  return (
    <View pointerEvents="none" style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: "72%", height: "72%", borderRadius: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" }}>
        <View style={{ position: "absolute", top: -1, left: -1, width: size, height: size, borderTopWidth: thickness, borderLeftWidth: thickness, borderColor: cornerColor, borderTopLeftRadius: 12 }} />
        <View style={{ position: "absolute", top: -1, right: -1, width: size, height: size, borderTopWidth: thickness, borderRightWidth: thickness, borderColor: cornerColor, borderTopRightRadius: 12 }} />
        <View style={{ position: "absolute", bottom: -1, left: -1, width: size, height: size, borderBottomWidth: thickness, borderLeftWidth: thickness, borderColor: cornerColor, borderBottomLeftRadius: 12 }} />
        <View style={{ position: "absolute", bottom: -1, right: -1, width: size, height: size, borderBottomWidth: thickness, borderRightWidth: thickness, borderColor: cornerColor, borderBottomRightRadius: 12 }} />
      </View>
    </View>
  );
}

function PermissionPlaceholder({ requestPermission, onPickImage }: { requestPermission: () => void; onPickImage: () => void }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 28, backgroundColor: "#0E0D0B" }}>
      <View style={{ width: 56, height: 56, borderRadius: 18, borderCurve: "continuous", backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" }}>
        <SymbolView name="camera.fill" tintColor="rgba(255,255,255,0.85)" style={{ width: 24, height: 24 }} />
      </View>
      <View style={{ alignItems: "center", gap: 3 }}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: "#FFFDF3" }}>Camera access needed</Text>
        <Text style={{ fontSize: 13, fontWeight: "600", color: "rgba(255,253,243,0.55)", textAlign: "center", lineHeight: 19 }}>Allow camera access to scan your clothes.</Text>
      </View>
      <Pressable onPress={requestPermission} className="active:scale-95" style={{ marginTop: 2, paddingHorizontal: 22, paddingVertical: 11, borderRadius: 999, backgroundColor: "#FFFDF3" }}>
        <Text style={{ fontSize: 14, fontWeight: "800", color: "#000" }}>Allow camera</Text>
      </Pressable>
      <Pressable onPress={onPickImage} hitSlop={8}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: "rgba(255,253,243,0.6)" }}>Choose from library</Text>
      </Pressable>
    </View>
  );
}

function DetectedItemRow({ item, included, showTopBorder, onToggle, onEdit }: { item: PendingItem; included: boolean; showTopBorder: boolean; onToggle: () => void; onEdit: () => void }) {
  return (
    <Pressable
      accessibilityLabel={`Edit ${item.name}`}
      onPress={onEdit}
      className="active:bg-black/[0.04]"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 12,
        backgroundColor: "#FFFFFA",
        borderTopWidth: showTopBorder ? StyleSheet.hairlineWidth : 0,
        borderTopColor: "rgba(0,0,0,0.06)",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1, opacity: included ? 1 : 0.4 }}>
        <Image source={item.cleanUri ? { uri: item.cleanUri } : require("@/assets/item-1.png")} contentFit="cover" style={{ width: 54, height: 66, borderRadius: 14, backgroundColor: "#F6F1E4", borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" }} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "700", color: "#000", letterSpacing: -0.2 }}>{item.name}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: swatchColor(item.color), borderWidth: 1, borderColor: "rgba(0,0,0,0.12)" }} />
            <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: "600", color: "rgba(0,0,0,0.45)" }}>
              {categoryLabels[item.category]} · {item.color} · <Text style={{ color: "rgba(0,0,0,0.6)", fontWeight: "800", fontVariant: ["tabular-nums"] }}>${item.price}</Text>
            </Text>
          </View>
        </View>
      </View>
      <Pressable accessibilityLabel={included ? "Exclude item" : "Include item"} onPress={onToggle} hitSlop={8} className="active:scale-95">
        {included ? (
          <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#000" }}>
            <SymbolView name="checkmark" tintColor="#FFFDF3" weight="bold" style={{ width: 13, height: 13 }} />
          </View>
        ) : (
          <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: "rgba(0,0,0,0.18)" }} />
        )}
      </Pressable>
    </Pressable>
  );
}

function EditSheet({ item, onSave, onClose }: { item: PendingItem; onSave: (item: PendingItem) => void; onClose: () => void }) {
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(item.price > 0 ? String(item.price) : "");
  const [category, setCategory] = useState<ClothingCategory>(item.category);
  const [color, setColor] = useState(item.color);

  return (
    <View style={{ backgroundColor: "#FFFDF3", borderTopLeftRadius: 30, borderTopRightRadius: 30, borderCurve: "continuous", padding: 24, paddingBottom: 40, gap: 20, boxShadow: "0 -20px 50px rgba(0,0,0,0.2)" }}>
      <View style={{ width: 40, height: 4, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.12)", alignSelf: "center", marginBottom: 2 }} />

      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Image source={item.cleanUri ? { uri: item.cleanUri } : require("@/assets/item-1.png")} contentFit="cover" style={{ width: 54, height: 66, borderRadius: 12, backgroundColor: "#F6F1E4", borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" }} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 20, fontWeight: "800", letterSpacing: -0.4, color: "#000" }}>Review details</Text>
          <Text style={{ fontSize: 13, fontWeight: "600", color: "rgba(0,0,0,0.4)" }}>Make sure everything looks right.</Text>
        </View>
        <Pressable accessibilityLabel="Close editor" onPress={onClose} hitSlop={10} style={{ width: 36, height: 36, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.05)", alignItems: "center", justifyContent: "center" }}>
          <SymbolView name="xmark" tintColor="rgba(0,0,0,0.6)" style={{ width: 15, height: 15 }} />
        </Pressable>
      </View>

      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 13, fontWeight: "600", color: "rgba(0,0,0,0.5)" }}>Name</Text>
        <TextInput value={name} onChangeText={setName} style={{ borderRadius: 16, borderCurve: "continuous", borderWidth: 1, borderColor: "rgba(0,0,0,0.1)", backgroundColor: "#FFFFFA", paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, fontWeight: "500", color: "#000" }} placeholder="Item name" placeholderTextColor="rgba(0,0,0,0.3)" />
      </View>

      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 13, fontWeight: "600", color: "rgba(0,0,0,0.5)" }}>Price</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 16, borderCurve: "continuous", borderWidth: 1, borderColor: "rgba(0,0,0,0.1)", backgroundColor: "#FFFFFA", paddingHorizontal: 16 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: "rgba(0,0,0,0.35)" }}>$</Text>
          <TextInput value={price} onChangeText={setPrice} keyboardType="number-pad" placeholder="0" placeholderTextColor="rgba(0,0,0,0.3)" style={{ flex: 1, paddingVertical: 12, fontSize: 15, fontWeight: "500", color: "#000", fontVariant: ["tabular-nums"] }} />
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: "600", color: "rgba(0,0,0,0.5)" }}>Category</Text>
        <SegmentedControl
          values={categoryOrder.map((c) => categoryShortLabels[c])}
          selectedIndex={categoryOrder.indexOf(category)}
          onChange={(event) => setCategory(categoryOrder[event.nativeEvent.selectedSegmentIndex])}
          tintColor="#000000"
          backgroundColor="rgba(0,0,0,0.05)"
          fontStyle={{ color: "rgba(0,0,0,0.5)", fontSize: 12, fontWeight: "600" }}
          activeFontStyle={{ color: "#FFFDF3", fontSize: 12, fontWeight: "700" }}
        />
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: "600", color: "rgba(0,0,0,0.5)" }}>Color</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {colorOptions.map((c) => {
            const selected = c === color;
            const light = lightColors.includes(c);
            return (
              <Pressable
                key={c}
                accessibilityLabel={`${c} color`}
                accessibilityState={{ selected }}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setColor(c);
                }}
                className="active:scale-95"
                style={{ width: 38, height: 38, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: swatchColor(c), borderWidth: selected ? 3 : 1, borderColor: selected ? "#000" : "rgba(0,0,0,0.1)" }}
              >
                {selected ? <SymbolView name="checkmark" tintColor={light ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.92)"} weight="bold" style={{ width: 15, height: 15 }} /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 10, marginTop: 2 }}>
        <Button variant="secondary" style={{ flex: 1 }} onPress={onClose}>
          Cancel
        </Button>
        <Button icon="checkmark" style={{ flex: 1.2 }} onPress={() => onSave({ ...item, name: name.trim() || item.name, price: Math.max(0, parseFloat(price) || 0), category, color })}>
          Confirm
        </Button>
      </View>
    </View>
  );
}
