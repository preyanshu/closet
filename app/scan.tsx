import { categoryLabels, type ClothingCategory } from "@/data/mock";
import { vibeLabel, vibesFor } from "@/services/vibes";
import { defaultRoleForCategory } from "@/types/taxonomy";
import { adaptiveColors, radius, Button, GlassPillButton, ModalHeader, WardrobeIcon } from "@/components/ui";
import { errorMessage } from "@/services/api/wardrobe-api";
import { AUTO_CONFIRM_THRESHOLD, detectGarment, detectItemPresence, suggestAesthetics, toAiAttributes, type GarmentAttributes } from "@/services/garment-detect";
import { stageGarment } from "@/services/garment-staging";
import { useCloset } from "@/state/closet-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, useNavigation } from "expo-router";
import { SymbolView } from "expo-symbols";
import ColorPicker, { HueSlider, Panel1, Preview } from "reanimated-color-picker";
import { type ComponentProps, type ReactNode, useEffect, useRef, useState } from "react";
import Animated, { Easing, FadeInUp, FadeOut, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";

type SymbolName = ComponentProps<typeof SymbolView>["name"];
type ItemStatus = "processing" | "ready" | "error";

const CAMERA_MARGIN = 14;
const CAMERA_CORNER = 30;
const CAMERA_PADDING = 16;
const ICON_SIZE = 40;
const TOOLBAR_HEIGHT = 86;
const SHUTTER_SIZE = 70;
// Warm-cream design tokens (match the rest of the app)
const CREAM = "#FFFDF3";
const INK = "#0E0D0B";
const HAIRLINE = "rgba(255,255,255,0.14)"; // hairline on dark glass

type PendingItem = {
  id: string;
  originalUri: string;
  cleanUri: string | null;
  status: ItemStatus;
  progress: number;
  name: string;
  category: ClothingCategory;
  color: string;
  price: number | null;
  aesthetics: string[];
  error: string | null;
  /** Bounded-attribute extraction (Clef-flash) with per-field confidence. */
  attrs: GarmentAttributes | null;
  /** Fields the user confirmed via chips (or implicitly by editing). */
  confirmedFields: string[];
};

type DetailKey = "subcategory" | "fit" | "sleeve_length" | "pattern" | "material" | "formality" | "warmth";

const DETAIL_FIELD_LABELS: Record<DetailKey, string> = {
  subcategory: "Type",
  fit: "Fit",
  sleeve_length: "Sleeve",
  pattern: "Pattern",
  material: "Fabric",
  formality: "Occasion",
  warmth: "Warmth",
};

const DETAIL_FIELD_OPTIONS: Partial<Record<DetailKey, string[]>> = {
  fit: ["slim", "regular", "relaxed", "oversized", "wide"],
  sleeve_length: ["sleeveless", "short", "three-quarter", "long"],
  pattern: ["solid", "striped", "plaid", "floral", "graphic", "other"],
  material: ["smooth", "knit", "denim", "woven", "fleece", "leather-like", "satin-like"],
  formality: ["casual", "smart-casual", "formal"],
  warmth: ["light", "medium", "heavy"],
};

const DETAIL_VALUE_LABELS: Record<string, string> = {
  "leather-like": "Leather",
  "satin-like": "Satin",
  "t-shirt": "T-shirt",
  "three-quarter": "3/4 sleeve",
  "smart-casual": "Smart casual",
};

function detailText(value: string | undefined) {
  if (!value) return "";
  return DETAIL_VALUE_LABELS[value] ?? beautify(value);
}

/** The extraction question for fabric is named "texture" (confidence key). */
function confirmKey(field: DetailKey) {
  return field === "material" ? "texture" : field;
}

/** Which detected details are meaningful for this category. */
function visibleDetailRows(attrs: GarmentAttributes): DetailKey[] {
  const rows: DetailKey[] = [];
  if (attrs.subcategory) rows.push("subcategory");
  if ((attrs.category === "top" || attrs.category === "bottom" || attrs.category === "outerwear") && attrs.fit) rows.push("fit");
  if ((attrs.category === "top" || attrs.category === "outerwear") && attrs.sleeve_length) rows.push("sleeve_length");
  if (attrs.pattern) rows.push("pattern");
  if (attrs.material) rows.push("material");
  if (attrs.formality) rows.push("formality");
  if (attrs.warmth) rows.push("warmth");
  return rows;
}

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
const isLightSwatch = (color: string) => {
  if (lightColors.includes(color)) return true;
  const hex = swatchColor(color).replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return false;
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 > 170;
};
const beautify = (id: string) => id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const resolveStagedSource = (uri: string | null) => uri ? { uri } : null;

export default function ScanModal() {
  const { addItem, setAddedMessage, profile } = useCloset();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [flash, setFlash] = useState<"off" | "on">("off");
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [includedIds, setIncludedIds] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<PendingItem | null>(null);
  const [batchReview, setBatchReview] = useState(false);
  const [saveComplete, setSaveComplete] = useState(false);
  useEffect(() => {
    // iOS waits for the native review sheet's onDismiss before closing its parent.
    if (saveComplete && process.env.EXPO_OS !== "ios") dismissModal();
  }, [saveComplete]);

  const queueRef = useRef<Array<() => Promise<void>>>([]);
  const activeRef = useRef(0);
  const MAX_CONCURRENCY = 4;

  const updatePending = (id: string, updater: (item: PendingItem) => PendingItem) => {
    setPendingItems((prev) => (prev.some((i) => i.id === id) ? prev.map((i) => (i.id === id ? updater(i) : i)) : prev));
  };

  const pump = () => {
    if (activeRef.current >= MAX_CONCURRENCY) return;
    const job = queueRef.current.shift();
    if (!job) return;
    activeRef.current += 1;
    job().finally(() => {
      activeRef.current -= 1;
      pump();
    });
  };

  const enqueue = (id: string, uri: string) => {
    queueRef.current.push(() => processItem(id, uri));
    pump();
  };

  const processItem = async (id: string, uri: string) => {
    try {
      updatePending(id, (it) => ({ ...it, status: "processing" as ItemStatus, error: null, progress: 0 }));
      updatePending(id, (it) => ({ ...it, progress: 10 }));

      // Cheap Clef gate: skip Flux staging + vision extraction for non-items.
      const presence = await detectItemPresence(uri).catch(() => ({ present: true, confidence: 0 }));
      if (!presence.present) {
        // A wrong "no" shouldn't trap the user: keep a manual draft that can
        // still be reviewed and saved without detection or staging.
        updatePending(id, (it) => ({
          ...it,
          status: "ready" as ItemStatus,
          name: "New piece",
          cleanUri: null,
          error: "No item detected. Add the details manually, or retake the photo.",
          attrs: null,
          confirmedFields: [],
          progress: 100,
        }));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
      updatePending(id, (it) => ({ ...it, progress: 20 }));

      // Identify first, then stage: the extraction result tells Flux exactly
      // which item to isolate so background fabric (bedsheets, etc.) is dropped.
      const detected = await detectGarment(uri);
      const confirmedFields = Object.entries(detected.confidences)
        .filter(([, confidence]) => confidence >= AUTO_CONFIRM_THRESHOLD)
        .map(([field]) => field);
      updatePending(id, (it) => ({
        ...it,
        name: detected.name,
        category: detected.category,
        color: detected.primary_color,
        attrs: detected,
        confirmedFields,
        progress: 45,
      }));

      // Staging is best-effort: if image cleanup fails, keep the detected
      // details and save the original photo instead of blocking the piece.
      let cleanUri: string | null = null;
      let cleaningFailed = false;
      try {
        const staged = await stageGarment(uri, {
          name: detected.name,
          subcategory: detected.subcategory,
          category: detected.category,
          primaryColor: detected.primary_color,
          material: detected.material,
        });
        cleanUri = staged.cleanUri;
      } catch {
        cleaningFailed = true;
      }
      updatePending(id, (it) => ({ ...it, cleanUri, progress: 90 }));

      updatePending(id, (it) => ({
        ...it,
        status: "ready" as ItemStatus,
        cleanUri,
        name: detected.name,
        category: detected.category,
        color: detected.primary_color,
        price: null,
        aesthetics: suggestAesthetics(detected, profile.presentation),
        attrs: detected,
        confirmedFields,
        progress: 100,
        error: cleaningFailed ? "Image cleanup couldn't run, so we kept your original photo. You can save this piece as-is." : null,
      }));
      Haptics.notificationAsync(cleaningFailed ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      updatePending(id, (it) => ({
        ...it,
        status: "error" as ItemStatus,
        name: it.name === "Scanning…" ? "Scanned piece" : it.name,
        error: errorMessage(e, "Couldn't analyze this piece. Try again, or add the details yourself."),
      }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const addPending = (uri: string) => {
    const id = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const item: PendingItem = {
      id,
      originalUri: uri,
      cleanUri: null,
      status: "processing",
      progress: 0,
      name: "Scanning…",
      category: "top",
      color: "black",
      price: null,
      aesthetics: [],
      error: null,
      attrs: null,
      confirmedFields: [],
    };
    setPendingItems((prev) => [...prev, item]);
    setIncludedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    enqueue(id, uri);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsEditing: true });
    if (!result.canceled) {
      const uri = result.assets[0]?.uri;
      if (uri) addPending(uri);
    }
  };

  const openReview = (item: PendingItem) => {
    if (item.status === "processing") return;
    setBatchReview(false);
    setDraft({ ...item });
  };

  const commitEdit = (updated: PendingItem) => {
    setPendingItems((prev) => prev.map((item) => (item.id === updated.id ? { ...updated, status: "ready" as ItemStatus, error: null } : item)));
    setIncludedIds((prev) => {
      const next = new Set(prev);
      next.add(updated.id);
      return next;
    });
  };

  const saveEdit = (updated: PendingItem) => {
    commitEdit(updated);
    setDraft(null);
    setBatchReview(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const retryProcess = (id: string) => {
    const item = pendingItems.find((i) => i.id === id);
    if (!item) return;
    updatePending(id, (it) => ({ ...it, status: "processing" as ItemStatus, error: null }));
    enqueue(id, item.originalUri);
    setDraft(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const removePending = (id: string) => {
    setPendingItems((prev) => prev.filter((i) => i.id !== id));
    setIncludedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setDraft(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
  };

  const readyIncluded = pendingItems.filter((i) => includedIds.has(i.id) && i.status === "ready");
  const analyzingCount = pendingItems.filter((i) => i.status === "processing").length;
  const needsReviewCount = pendingItems.filter((i) => i.status === "error").length;
  const totalCount = pendingItems.length;
  const reviewItems = pendingItems.filter((i) => includedIds.has(i.id) && i.status !== "processing");
  const batchIndex = draft ? reviewItems.findIndex((item) => item.id === draft.id) : -1;

  const openBatchReview = () => {
    const first = reviewItems[0];
    if (!first) return;
    setBatchReview(true);
    setDraft({ ...first });
  };

  const finalize = (override?: PendingItem) => {
    const source = override ? pendingItems.map((item) => item.id === override.id ? { ...override, status: "ready" as ItemStatus, error: null } : item) : pendingItems;
    const itemsToSave = source.filter((item) => includedIds.has(item.id) && item.status === "ready");
    if (itemsToSave.length === 0) return;
    const savedIds = new Set(itemsToSave.map((i) => i.id));
    const now = new Date().toISOString();
    itemsToSave.forEach((item) => {
      const attrs = item.attrs;
      const categoryEdited = Boolean(attrs) && item.category !== attrs!.category;
      const colorEdited = Boolean(attrs) && item.color !== attrs!.primary_color;
      const aiAttributes = attrs
        ? toAiAttributes(attrs).map((attr) => {
            if (attr.field === "category" && categoryEdited) {
              return { ...attr, value: item.category, source: "user" as const, reviewStatus: "confirmed" as const, updatedAt: now };
            }
            if (attr.field === "primary_color" && colorEdited) {
              return { ...attr, value: item.color, source: "user" as const, reviewStatus: "confirmed" as const, updatedAt: now };
            }
            if (item.confirmedFields.includes(attr.field)) {
              return { ...attr, reviewStatus: "confirmed" as const, updatedAt: now };
            }
            return attr;
          })
        : undefined;

      // A category the user changed in review no longer matches the detected
      // type/role; re-derive the role so the stylist sees what they chose.
      const keepDetected = Boolean(attrs) && !categoryEdited;
      addItem({
        id: `scan-${Date.now()}-${item.id}`,
        ownerId: "local-demo",
        name: item.name,
        category: item.category,
        role: keepDetected ? attrs!.role : defaultRoleForCategory(item.category),
        alternateRoles: keepDetected ? attrs!.alternate_roles : undefined,
        subcategory: keepDetected ? attrs!.subcategory || undefined : undefined,
        primaryColor: item.color.toLowerCase(),
        secondaryColors: attrs?.secondary_colors ?? [],
        styleTags: item.aesthetics,
        pattern: attrs?.pattern || undefined,
        fit: attrs?.fit || undefined,
        sleeveLength: attrs?.sleeve_length || undefined,
        visibleTexture: attrs?.material || undefined,
        formality: attrs?.formality,
        warmthBand: attrs?.warmth,
        originalAssetUri: item.originalUri,
        displayAssetUri: item.cleanUri ?? item.originalUri,
        priceMinor: item.price == null ? null : Math.round(item.price * 100),
        priceCurrency: "USD",
        wearCount: 0,
        lastWorn: null,
        availabilityStatus: "available",
        lifecycleStatus: "owned",
        processingStatus: item.progress >= 100 ? "ready" : "partial",
        aiAttributes,
        createdAt: now,
        updatedAt: now,
        revision: 1,
      });
    });
    setPendingItems((prev) => prev.filter((i) => !savedIds.has(i.id)));
    setIncludedIds((prev) => {
      const next = new Set(prev);
      savedIds.forEach((id) => next.delete(id));
      return next;
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setAddedMessage(`${itemsToSave.length} ${itemsToSave.length === 1 ? "piece" : "pieces"} added`);
    // Follow the sheet dismissal with a brief fade instead of an abrupt cut.
    navigation.setOptions({ animation: "fade", animationDuration: 200 });
    setSaveComplete(true);
  };

  const saveAndContinue = (updated: PendingItem) => {
    commitEdit(updated);
    const next = reviewItems[batchIndex + 1];
    if (next) {
      setDraft({ ...next });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }
    finalize(updated);
    setDraft(null);
    setBatchReview(false);
  };

  const hasItems = totalCount > 0;
  const trayHeight = hasItems ? insets.bottom + 200 : 0;
  const cameraHeight = hasItems
    ? Math.max(400, Math.min(Math.round(height * 0.62), Math.round(height - insets.top - trayHeight - 8)))
    : Math.max(440, Math.min(Math.round(height * 0.68), Math.round(height - insets.top - insets.bottom - 150)));
  const trayThumbWidth = Math.max(62, Math.min(78, Math.floor((width - 178) / 3)));

  return (
    <View style={{ flex: 1, backgroundColor: adaptiveColors.canvas }}>
      <CameraCard
        height={cameraHeight}
        facing={facing}
        flash={flash}
        onToggleFlash={() => setFlash((f) => (f === "on" ? "off" : "on"))}
        onFlip={() => setFacing((f) => (f === "back" ? "front" : "back"))}
        onCapture={addPending}
        onPickImage={pickImage}
        onClose={dismissModal}
      />

      {hasItems ? (
        <CaptureTray
          items={pendingItems}
          readyIncludedCount={readyIncluded.length}
          analyzingCount={analyzingCount}
          needsReviewCount={needsReviewCount}
          canReview={reviewItems.length > 0}
          height={trayHeight}
          columnWidth={trayThumbWidth}
          onReview={openReview}
          onReviewAll={openBatchReview}
          onRemove={removePending}
        />
      ) : (
        <IdleDetails />
      )}

      <Modal
        visible={draft != null}
        presentationStyle="pageSheet"
        animationType="slide"
        allowSwipeDismissal
        onDismiss={() => { if (saveComplete) dismissModal(); }}
        onRequestClose={() => { setDraft(null); setBatchReview(false); }}
      >
        <SafeAreaProvider><SafeAreaView style={{ flex: 1, backgroundColor: adaptiveColors.canvas }}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: adaptiveColors.canvas }} behavior={process.env.EXPO_OS === "ios" ? "padding" : "height"}>
          {draft ? <ReviewSheet key={draft.id} item={draft} batchMode={batchReview} position={Math.max(0, batchIndex)} total={reviewItems.length} onSave={batchReview ? saveAndContinue : saveEdit} onRetry={retryProcess} onRemove={removePending} onClose={() => { setDraft(null); setBatchReview(false); }} /> : null}
        </KeyboardAvoidingView>
        </SafeAreaView></SafeAreaProvider>
      </Modal>
    </View>
  );
}

function dismissModal() {
  if (router.canDismiss()) { router.dismiss(); return; }
  if (router.canGoBack()) { router.back(); return; }
  router.replace("/");
}

function CameraCard({ height, facing, flash, onToggleFlash, onFlip, onCapture, onPickImage, onClose }: {
  height: number;
  facing: "back" | "front";
  flash: "off" | "on";
  onToggleFlash: () => void;
  onFlip: () => void;
  onCapture: (uri: string) => void;
  onPickImage: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const capturingRef = useRef(false);
  const previewFlash = useSharedValue(0);
  const previewFlashStyle = useAnimatedStyle(() => ({ opacity: previewFlash.value }));
  const animatedHeight = useSharedValue(height);
  const cameraSizeStyle = useAnimatedStyle(() => ({ height: animatedHeight.value }));

  useEffect(() => {
    animatedHeight.value = withTiming(height, { duration: 320, easing: Easing.bezier(0.2, 0, 0, 1) });
  }, [animatedHeight, height]);

  const takePhoto = async () => {
    const camera = cameraRef.current;
    if (!camera || capturingRef.current) return;
    capturingRef.current = true;
    previewFlash.value = withSequence(withTiming(0.9, { duration: 45 }), withTiming(0, { duration: 140 }));
    try {
      const photo = await camera.takePictureAsync({ quality: 0.8 });
      onCapture(photo.uri);
    } catch {}
    finally {
      capturingRef.current = false;
    }
  };

  return (
    <Animated.View style={[{ marginTop: insets.top + 8, marginHorizontal: CAMERA_MARGIN, borderRadius: CAMERA_CORNER, borderCurve: "continuous", overflow: "hidden", backgroundColor: INK, boxShadow: "0 18px 44px rgba(0,0,0,0.16)" }, cameraSizeStyle]}>
      {permission == null ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: INK }}>
          <ActivityIndicator color={CREAM} />
        </View>
      ) : permission.granted ? (
        <CameraView ref={cameraRef} facing={facing} flash={flash} style={{ flex: 1 }} />
      ) : (
        <PermissionPlaceholder requestPermission={requestPermission} onPickImage={onPickImage} />
      )}

      <Animated.View pointerEvents="none" style={[{ position: "absolute", inset: 0, backgroundColor: adaptiveColors.surfaceRaised }, previewFlashStyle]} />

      <View style={{ position: "absolute", top: CAMERA_PADDING, left: CAMERA_PADDING }}>
        <CameraControlButton icon="xmark" label="Close" onPress={onClose} />
      </View>

      <View style={{ position: "absolute", top: CAMERA_PADDING, right: CAMERA_PADDING }}>
        <CameraControlButton icon={flash === "on" ? "bolt.fill" : "bolt.slash"} label={flash === "on" ? "Turn flash off" : "Turn flash on"} active={flash === "on"} onPress={onToggleFlash} />
      </View>

      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: TOOLBAR_HEIGHT, overflow: "hidden", backgroundColor: "rgba(0,0,0,0.3)", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: HAIRLINE, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: CAMERA_PADDING + 2 }}>
        <CameraControlButton icon="photo.on.rectangle" label="Choose from library" onPress={onPickImage} />
        <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" }} pointerEvents="box-none">
          <ShutterButton onPress={takePhoto} />
        </View>
        <CameraControlButton icon="arrow.triangle.2.circlepath.camera" label="Flip camera" onPress={onFlip} />
      </View>
    </Animated.View>
  );
}

function CameraControlButton({ icon, label, active, onPress, size = ICON_SIZE }: { icon: SymbolName; label: string; active?: boolean; onPress: () => void; size?: number }) {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={handlePress}
      hitSlop={8}
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
    >
      <WardrobeIcon name={icon} color={active ? "#FFD60A" : CREAM} weight="medium" size={Math.round(size * 0.46)} />
    </Pressable>
  );
}

function ShutterButton({ onPress }: { onPress: () => void }) {
  const inner = SHUTTER_SIZE - 14;
  const scale = useSharedValue(1);
  const pulse = useSharedValue(0);
  const buttonStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const pulseStyle = useAnimatedStyle(() => ({ opacity: 0.55 * pulse.value, transform: [{ scale: 0.72 + pulse.value * 0.5 }] }));

  const capture = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    pulse.value = 0;
    pulse.value = withSequence(withTiming(1, { duration: 90 }), withTiming(0, { duration: 150 }));
    onPress();
  };

  return (
    <Animated.View style={[{ width: SHUTTER_SIZE, height: SHUTTER_SIZE, borderRadius: radius.pill }, buttonStyle]}>
      <Pressable
        accessibilityLabel="Take photo"
        accessibilityRole="button"
        onPress={capture}
        onPressIn={() => { scale.value = withTiming(0.96, { duration: 70 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 18, stiffness: 320, mass: 0.45 }); }}
        hitSlop={6}
        style={{ flex: 1, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 2.5, borderColor: CREAM, backgroundColor: "transparent" }}
      >
        <View style={{ width: inner, height: inner, borderRadius: radius.pill, backgroundColor: "#E1E1DC" }} />
        <Animated.View pointerEvents="none" style={[{ position: "absolute", width: inner, height: inner, borderRadius: radius.pill, borderWidth: 3, borderColor: INK }, pulseStyle]} />
      </Pressable>
    </Animated.View>
  );
}

function PermissionPlaceholder({ requestPermission, onPickImage }: { requestPermission: () => void; onPickImage: () => void }) {
  // Object/array styles only: NativeWind's native interop spreads a callback
  // style with `{ ...declaration }`, which silently erases it to `{}`.
  const [pressedId, setPressedId] = useState<string | null>(null);
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 28, backgroundColor: "#0E0D0B" }}>
      <View style={{ width: 52, height: 52, borderRadius: 18, borderCurve: "continuous", backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" }}>
        <WardrobeIcon name="camera.fill" color="rgba(255,255,255,0.85)" size={22} />
      </View>
      <Text style={{ fontSize: 16, fontWeight: "700", color: adaptiveColors.onAccent }}>Camera access needed</Text>
      <Text style={{ fontSize: 13, fontWeight: "600", color: "rgba(255,253,243,0.55)", textAlign: "center", lineHeight: 19 }}>Allow camera access to scan your clothes.</Text>
      <Pressable
        onPress={requestPermission}
        onPressIn={() => setPressedId("allow")}
        onPressOut={() => setPressedId(null)}
        style={[
          { marginTop: 4, paddingHorizontal: 22, paddingVertical: 11, borderRadius: radius.pill, backgroundColor: adaptiveColors.canvas },
          { transform: [{ scale: pressedId === "allow" ? 0.96 : 1 }] },
        ]}
      >
        <Text style={{ fontSize: 14, fontWeight: "800", color: adaptiveColors.label }}>Allow camera</Text>
      </Pressable>
      <Pressable
        onPress={onPickImage}
        hitSlop={8}
        onPressIn={() => setPressedId("library")}
        onPressOut={() => setPressedId(null)}
        style={[
          { paddingVertical: 6 },
          { opacity: pressedId === "library" ? 0.6 : 1 },
        ]}
      >
        <Text style={{ fontSize: 13, fontWeight: "700", color: "rgba(255,253,243,0.6)" }}>Choose from library</Text>
      </Pressable>
    </View>
  );
}

function IdleDetails() {
  return (
    <Animated.View exiting={FadeOut.duration(140)} style={{ flex: 1, paddingHorizontal: 30, paddingBottom: 18, justifyContent: "center", alignItems: "center" }}>
      <View style={{ width: "100%", maxWidth: 330, gap: 20, transform: [{ translateY: -2 }] }}>
        <View style={{ alignItems: "center", gap: 4 }}>
          <Text numberOfLines={1} style={{ fontSize: 19, fontWeight: "800", color: adaptiveColors.label }}>Scan one piece</Text>
          <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 18, fontWeight: "600", color: adaptiveColors.secondaryLabel }}>A clean setup gives a cleaner result.</Text>
        </View>
        <View style={{ position: "relative", flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <View pointerEvents="none" style={{ position: "absolute", left: "16.5%", right: "16.5%", top: 15.5, height: StyleSheet.hairlineWidth, backgroundColor: "rgba(0,0,0,0.11)" }} />
          <ScanCue icon="tshirt" label="Lay flat" />
          <ScanCue icon="viewfinder" label="Fill frame" />
          <ScanCue icon="sun.max" label="Even light" />
        </View>
      </View>
    </Animated.View>
  );
}

function ScanCue({ icon, label }: { icon: SymbolName; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", gap: 8 }}>
      <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: CREAM, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,0.09)", zIndex: 1 }}>
        <SymbolView name={icon} tintColor="rgba(0,0,0,0.42)" weight="regular" style={{ width: 15, height: 15 }} />
      </View>
      <Text numberOfLines={1} style={{ fontSize: 11.5, fontWeight: "700", color: "rgba(0,0,0,0.46)" }}>{label}</Text>
    </View>
  );
}

function CaptureTray({
  items,
  readyIncludedCount,
  analyzingCount,
  needsReviewCount,
  canReview,
  height,
  columnWidth,
  onReview,
  onReviewAll,
  onRemove,
}: {
  items: PendingItem[];
  readyIncludedCount: number;
  analyzingCount: number;
  needsReviewCount: number;
  canReview: boolean;
  height: number;
  columnWidth: number;
  onReview: (item: PendingItem) => void;
  onReviewAll: () => void;
  onRemove: (id: string) => void;
}) {
  const statusText = needsReviewCount > 0
    ? `${readyIncludedCount} ready · ${needsReviewCount} review`
    : analyzingCount > 0
      ? `${readyIncludedCount} ready · ${analyzingCount} analyzing`
      : `${readyIncludedCount} ready`;
  return (
    <Animated.View entering={FadeInUp.duration(260).delay(80)} style={{ height, marginTop: 10, backgroundColor: adaptiveColors.canvas, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderCurve: "continuous", paddingTop: 18, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: 20, fontWeight: "900", letterSpacing: -0.2, color: adaptiveColors.label }}>Scanned pieces</Text>
          <Text numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: 12, fontWeight: "800", color: adaptiveColors.secondaryLabel, fontVariant: ["tabular-nums"] }}>{items.length} scanned · {statusText}</Text>
        </View>
        <View style={{ flexShrink: 0, alignSelf: "center" }}>
          {canReview ? (
            <GlassPillButton label="Review all" icon="chevron.right" accessibilityLabel="Review all scanned pieces" onPress={onReviewAll} />
          ) : null}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        alwaysBounceHorizontal={items.length > 3}
        decelerationRate="fast"
        snapToAlignment="start"
        snapToInterval={columnWidth + 10}
        disableIntervalMomentum
        style={{ marginTop: 4, flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 10, alignItems: "center" }}
      >
        {items.slice().reverse().map((item) => (
          <TrayCard
            key={item.id}
            item={item}
            width={columnWidth}
            onPress={() => onReview(item)}
            onRemove={(event) => {
              event.stopPropagation();
              onRemove(item.id);
            }}
          />
        ))}
      </ScrollView>
    </Animated.View>
  );
}

function TrayCard({ item, width, onPress, onRemove }: { item: PendingItem; width: number; onPress: () => void; onRemove: (event: any) => void }) {
  const processing = item.status === "processing";
  const errored = item.status === "error";
  const warned = !errored && Boolean(item.error);
  const [pressed, setPressed] = useState(false);
  return (
    <View style={{ width }}>
      <Pressable
        accessibilityLabel={processing ? `${item.name} — analyzing` : `Review ${item.name}`}
        onPress={onPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        style={[{ transform: [{ scale: !processing && pressed ? 0.96 : 1 }] }]}
      >
        <View style={{ width, borderRadius: 16, borderCurve: "continuous", borderWidth: 1.5, borderColor: errored ? "#D32F2F" : adaptiveColors.label, backgroundColor: adaptiveColors.surface, overflow: "hidden", padding: 6 }}>
        <View style={{ borderRadius: 10, borderCurve: "continuous", overflow: "hidden", backgroundColor: "#EFE9D8", height: 70 }}>
          <Image source={resolveStagedSource(item.cleanUri) ?? { uri: item.originalUri }} contentFit="cover" transition={250} style={{ flex: 1, opacity: processing ? 0.54 : 1 }} />

          {processing ? (
            <View pointerEvents="none" style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", gap: 7 }}>
              <ActivityIndicator color="#FFFDF3" size="small" />
              <Text style={{ fontSize: 10, fontWeight: "800", color: adaptiveColors.onAccent }}>{item.progress}%</Text>
            </View>
          ) : null}

          {processing ? (
            <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 4, backgroundColor: "rgba(0,0,0,0.12)" }}>
              <View style={{ width: `${item.progress}%`, height: 4, backgroundColor: adaptiveColors.canvas }} />
            </View>
          ) : null}

          {errored || warned ? (
            <View style={{ position: "absolute", top: 7, left: 7, width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: errored ? "#D32F2F" : adaptiveColors.warning }}>
              <WardrobeIcon name="exclamationmark" color={adaptiveColors.onAccent} weight="bold" size={10} />
            </View>
          ) : null}

        </View>

        <Text numberOfLines={1} ellipsizeMode="tail" style={{ marginTop: 6, fontSize: 10.5, fontWeight: "900", color: processing ? "rgba(0,0,0,0.35)" : adaptiveColors.label }}>
          {processing ? "Analyzing..." : item.name}
        </Text>
        </View>
      </Pressable>

      <View style={{ position: "absolute", zIndex: 20, elevation: 20, top: -4, right: -4, width: 20, height: 20, borderRadius: 10, overflow: "hidden", backgroundColor: "#9F2D27", borderWidth: 1, borderColor: "rgba(255,255,255,0.72)", boxShadow: "0 2px 5px rgba(0,0,0,0.16)" }}>
        <Pressable
          accessibilityLabel={`Remove ${item.name} from tray`}
          onPress={onRemove}
          hitSlop={10}
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center" }}
        >
          <View pointerEvents="none" style={{ position: "absolute", width: 8, height: 1.5, borderRadius: 1, backgroundColor: "#FFFFFF", transform: [{ rotate: "45deg" }] }} />
          <View pointerEvents="none" style={{ position: "absolute", width: 8, height: 1.5, borderRadius: 1, backgroundColor: "#FFFFFF", transform: [{ rotate: "-45deg" }] }} />
        </Pressable>
      </View>
    </View>
  );
}

function ReviewSheet({ item, batchMode, position, total, onSave, onRetry, onRemove, onClose }: { item: PendingItem; batchMode: boolean; position: number; total: number; onSave: (item: PendingItem) => void; onRetry: (id: string) => void; onRemove: (id: string) => void; onClose: () => void }) {
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(item.price != null && item.price > 0 ? String(item.price) : "");
  const [category, setCategory] = useState<ClothingCategory>(item.category);
  const [color, setColor] = useState(item.color);
  const [customColor, setCustomColor] = useState(swatchColor(item.color));
  const [customColors, setCustomColors] = useState<string[]>(colorOptions.includes(item.color) ? [] : [item.color.toUpperCase()]);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const aestheticOptions = vibesFor(useCloset().profile.presentation).map((vibe) => vibe.id);
  const [selectedAesthetics, setSelectedAesthetics] = useState(item.aesthetics);
  const [confirmed, setConfirmed] = useState<Set<string>>(() => new Set(item.confirmedFields));
  const [attrs, setAttrs] = useState<GarmentAttributes | null>(item.attrs);
  const [expandedDetail, setExpandedDetail] = useState<DetailKey | null>(null);
  const [error, setError] = useState("");
  const previewSource = resolveStagedSource(item.cleanUri) ?? { uri: item.originalUri };
  const detailRows = attrs ? visibleDetailRows(attrs) : [];
  const needsCheck = detailRows.filter((field) => !confirmed.has(confirmKey(field))).length;
  const save = () => {
    const amount = price.trim() === "" ? null : Number(price.replace(",", "."));
    if (!name.trim()) { setError("Enter a name for this piece."); return; }
    if (amount != null && (!Number.isFinite(amount) || amount < 0)) { setError("Enter a valid price of zero or more."); return; }
    setError("");
    onSave({
      ...item,
      name: name.trim(),
      price: amount,
      category,
      color,
      aesthetics: selectedAesthetics,
      attrs: attrs ?? item.attrs,
      confirmedFields: [...new Set([...confirmed, "category", "primary_color"])],
      error: null,
      progress: 100,
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: adaptiveColors.canvas }}>
      <View style={{ flexShrink: 0, padding: 20 }}><ModalHeader title="Review piece" subtitle={batchMode ? `${position + 1} of ${total} pieces` : "Make it yours before adding to your closet."} onClose={onClose} /></View>
      <ScrollView style={{ flex: 1, minHeight: 0 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 24 }}>
        <View style={{ height: 200, borderRadius: 20, borderCurve: "continuous", overflow: "hidden", backgroundColor: adaptiveColors.surfaceMuted, borderWidth: 1, borderColor: adaptiveColors.border }}>
          <Image source={previewSource} accessibilityLabel="Scanned piece" contentFit="contain" style={{ width: "100%", height: "100%" }} />
        </View>
        {item.error ? (
          <View style={{
            gap: 8,
            padding: 14,
            borderRadius: 16,
            borderCurve: "continuous",
            borderWidth: 1,
            backgroundColor: item.status === "error" ? "#FBEDEA" : adaptiveColors.accentSoft,
            borderColor: item.status === "error" ? "#EED3CD" : adaptiveColors.border,
          }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
              <WardrobeIcon name={item.status === "error" ? "exclamationmark.triangle" : "sparkles"} color={item.status === "error" ? adaptiveColors.destructive : adaptiveColors.warning} size={16} />
              <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: item.status === "error" ? adaptiveColors.destructive : adaptiveColors.secondaryLabel }}>
                {item.error}
              </Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => onRetry(item.id)} style={{ minHeight: 40, justifyContent: "center", alignSelf: "flex-start" }}>
              <Text style={{ color: adaptiveColors.accent, fontWeight: "600", fontSize: 13 }}>{item.status === "error" ? "Analyze again" : "Try again"}</Text>
            </Pressable>
          </View>
        ) : null}
        {attrs && detailRows.length > 0 ? (
          <View style={{ borderRadius: 20, borderCurve: "continuous", borderWidth: 1, borderColor: adaptiveColors.border, backgroundColor: adaptiveColors.surface, overflow: "hidden" }}>
            <View style={{ padding: 16, gap: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: adaptiveColors.label }}>Detected details</Text>
                {needsCheck > 0 ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 4, paddingHorizontal: 9, borderRadius: radius.pill, backgroundColor: adaptiveColors.canvas }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: adaptiveColors.warning }} />
                    <Text style={{ fontSize: 11, fontWeight: "700", color: adaptiveColors.warning, fontVariant: ["tabular-nums"] }}>{needsCheck} to check</Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 4, paddingHorizontal: 9, borderRadius: radius.pill, backgroundColor: adaptiveColors.accentSoft }}>
                    <WardrobeIcon name="checkmark.circle.fill" color={adaptiveColors.accent} size={13} />
                    <Text style={{ fontSize: 11, fontWeight: "700", color: adaptiveColors.accent }}>All set</Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: 13, lineHeight: 18, color: adaptiveColors.secondaryLabel }}>
                {needsCheck > 0 ? "Confirm what Alta found, or tap a row to adjust it." : "Tap any row if something looks off."}
              </Text>
            </View>
            {detailRows.map((field) => {
              if (!attrs) return null;
              const value = field === "material" ? attrs.material : String(attrs[field as keyof GarmentAttributes] ?? "");
              const isConfirmed = confirmed.has(confirmKey(field));
              const isOpen = expandedDetail === field;
              const options = DETAIL_FIELD_OPTIONS[field];
              return (
                <View key={field}>
                  <View style={{ height: 1, marginLeft: 16, backgroundColor: adaptiveColors.separator }} />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isOpen }}
                    accessibilityLabel={`${DETAIL_FIELD_LABELS[field]}: ${detailText(value)}${isConfirmed ? ", confirmed" : ", needs a check"}`}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      if (!options) {
                        setConfirmed((prev) => new Set(prev).add(confirmKey(field)));
                        return;
                      }
                      setExpandedDetail((prev) => (prev === field ? null : field));
                    }}
                    style={{ minHeight: 56, paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 12 }}
                  >
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: adaptiveColors.secondaryLabel }}>{DETAIL_FIELD_LABELS[field]}</Text>
                      <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "600", color: adaptiveColors.label }}>{detailText(value)}</Text>
                    </View>
                    {isConfirmed ? (
                      <WardrobeIcon name="checkmark.circle.fill" color={adaptiveColors.accent} size={18} />
                    ) : (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: adaptiveColors.warning }} />
                        <Text style={{ fontSize: 12, fontWeight: "700", color: adaptiveColors.warning }}>Check</Text>
                      </View>
                    )}
                    {options ? <WardrobeIcon name={isOpen ? "chevron.up" : "chevron.down"} color={adaptiveColors.tertiaryLabel} size={13} /> : null}
                  </Pressable>
                  {isOpen && options ? (
                    <View style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 10 }}>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        {options.map((option) => (
                          <ReviewChoice
                            key={option}
                            label={detailText(option)}
                            selected={value === option}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setAttrs((prev) => (prev ? ({ ...prev, [field]: option } as GarmentAttributes) : prev));
                              setConfirmed((prev) => new Set(prev).add(confirmKey(field)));
                              setExpandedDetail(null);
                            }}
                          />
                        ))}
                      </View>
                      {!isConfirmed ? (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setConfirmed((prev) => new Set(prev).add(confirmKey(field)));
                            setExpandedDetail(null);
                          }}
                          style={{ alignSelf: "flex-start", minHeight: 40, justifyContent: "center" }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: "600", color: adaptiveColors.accent }}>Looks right</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}
        <ReviewField label="Name">
          <TextInput accessibilityLabel="Item name" value={name} onChangeText={setName} placeholder="Name your piece" placeholderTextColor={adaptiveColors.tertiaryLabel} style={reviewInputStyle} returnKeyType="done" />
        </ReviewField>
        <ReviewField label="Price ($)">
          <TextInput accessibilityLabel="Price in dollars" value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="Optional" placeholderTextColor={adaptiveColors.tertiaryLabel} style={reviewInputStyle} />
        </ReviewField>
        <ReviewField label="Category">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {categoryOrder.map((option) => <ReviewChoice key={option} label={categoryLabels[option]} selected={category === option} onPress={() => setCategory(option)} />)}
          </View>
        </ReviewField>
        <ReviewField label={`Color · ${beautify(color)}`}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {[...colorOptions, ...customColors].map((option) => <Pressable key={option} accessibilityRole="button" accessibilityLabel={`${beautify(option)} color`} accessibilityState={{ selected: color === option }} onPress={() => setColor(option)} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: swatchColor(option), borderWidth: color === option ? 2 : 1, borderColor: color === option ? adaptiveColors.accent : adaptiveColors.border, alignItems: "center", justifyContent: "center" }}>
              {color === option ? <WardrobeIcon name="checkmark" color={isLightSwatch(option) ? adaptiveColors.label : "#FFFFFF"} size={18} /> : null}
            </Pressable>)}
            <ReviewChoice label="Add color" selected={false} onPress={() => { setCustomColor(swatchColor(color)); setShowColorPicker(true); }} />
          </View>
        </ReviewField>
        <ReviewField label="Vibes">
          <Text style={{ fontSize: 13, color: adaptiveColors.secondaryLabel }}>Choose any that fit.</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {aestheticOptions.map((option) => <ReviewChoice key={option} label={vibeLabel(option)} selected={selectedAesthetics.includes(option)} onPress={() => setSelectedAesthetics((prev) => prev.includes(option) ? prev.filter((id) => id !== option) : [...prev, option])} />)}
          </View>
        </ReviewField>
      </ScrollView>
      <View style={{ flexShrink: 0, padding: 20, gap: 12, borderTopWidth: 1, borderTopColor: adaptiveColors.separator, backgroundColor: adaptiveColors.canvas }}>
        {error ? <Text accessibilityLiveRegion="polite" style={{ color: adaptiveColors.destructive, fontSize: 13 }}>{error}</Text> : null}
        <View style={{ flexDirection: "row", gap: 12 }}>
          {!batchMode ? <ReviewSecondaryButton icon="trash" label="Remove piece" onPress={() => onRemove(item.id)} /> : null}
          <SheetPrimaryButton label={batchMode ? position < total - 1 ? "Next piece" : `Add ${total} pieces` : "Save changes"} icon="checkmark" accessibilityLabel="Save reviewed piece" onPress={save} />
        </View>
      </View>
      <Modal visible={showColorPicker} presentationStyle="pageSheet" animationType="slide" allowSwipeDismissal onRequestClose={() => setShowColorPicker(false)}>
        <GestureHandlerRootView style={{ flex: 1 }}><SafeAreaProvider><SafeAreaView style={{ flex: 1, backgroundColor: adaptiveColors.canvas }}>
          <ColorPickerSheet initialColor={customColor} onChange={setCustomColor} onCancel={() => setShowColorPicker(false)} onDone={() => { const next = customColor.toUpperCase(); setCustomColors((current) => current.includes(next) ? current : [...current, next]); setColor(next); setShowColorPicker(false); }} />
        </SafeAreaView></SafeAreaProvider></GestureHandlerRootView>
      </Modal>
    </View>
  );
}

const reviewInputStyle = {
  minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: adaptiveColors.border,
  backgroundColor: adaptiveColors.surface, paddingHorizontal: 14, paddingVertical: 12,
  fontSize: 16, color: adaptiveColors.label,
};

function ReviewField({ label, children }: { label: string; children: ReactNode }) {
  return <View style={{ gap: 10 }}><Text style={{ fontSize: 14, fontWeight: "600", color: adaptiveColors.label }}>{label}</Text>{children}</View>;
}

function ReviewChoice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={{ minHeight: 44, paddingVertical: 11, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: selected ? adaptiveColors.accent : adaptiveColors.border, backgroundColor: selected ? adaptiveColors.accentSoft : adaptiveColors.surface, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 14, fontWeight: "600", color: selected ? adaptiveColors.accent : adaptiveColors.secondaryLabel }}>{label}</Text></Pressable>;
}

function ColorPickerSheet({ initialColor, onChange, onCancel, onDone }: { initialColor: string; onChange: (color: string) => void; onCancel: () => void; onDone: () => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: adaptiveColors.canvas, padding: 20 }}>
      <View style={{ paddingBottom: 22 }}><ModalHeader title="Custom color" subtitle="Choose the closest shade." onClose={onCancel} /></View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
      <ColorPicker value={initialColor} onChangeJS={({ hex }) => onChange(hex)} sliderThickness={24} thumbSize={26} boundedThumb>
        <View style={{ gap: 18 }}>
          <Panel1 style={{ height: 240, borderRadius: 18 }} />
          <HueSlider style={{ borderRadius: radius.pill }} />
          <Preview colorFormat="hex" style={{ height: 54, borderRadius: 14 }} textStyle={{ fontSize: 14, fontWeight: "700" }} />
        </View>
      </ColorPicker>
      </ScrollView>
      <View style={{ flexDirection: "row", flexShrink: 0, paddingTop: 16 }}><SheetPrimaryButton label="Use color" accessibilityLabel="Use selected color" icon="checkmark" onPress={onDone} /></View>
    </View>
  );
}


function SheetPrimaryButton({ label, icon, accessibilityLabel, onPress }: { label: string; icon: SymbolName; accessibilityLabel: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={{ flex: 1, minHeight: 50, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 16, borderCurve: "continuous", backgroundColor: adaptiveColors.label, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}><WardrobeIcon name={icon} color={adaptiveColors.onAccent} size={17} /><Text style={{ fontSize: 15, fontWeight: "600", color: adaptiveColors.onAccent, flexShrink: 1 }}>{label}</Text></Pressable>;
}

function ReviewSecondaryButton({ label, icon, onPress }: { label: string; icon: SymbolName; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ flex: 1, minHeight: 50, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 16, borderCurve: "continuous", backgroundColor: "#FBEDEA", borderWidth: 1, borderColor: "#EED3CD", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}><WardrobeIcon name={icon} color={adaptiveColors.destructive} size={17} /><Text style={{ fontSize: 15, fontWeight: "600", color: adaptiveColors.destructive, flexShrink: 1 }}>{label}</Text></Pressable>;
}
