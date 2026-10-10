import { type ClothingItem } from "@/data/mock";
import { itemImageSource } from "@/services/item-image";
export { adaptiveColors } from "@/theme/colors";
export { control, elevation, iconSize, motion, radius, spacing, touchTarget, type } from "@/theme/tokens";
import { control, elevation, iconSize, imageOutlineWidth, motion, radius, spacing, touchTarget, type as typeScale } from "@/theme/tokens";
import { useWardrobeTheme } from "@/theme/wardrobe-theme";
import {
  BottomSheet as ExpoBottomSheet,
  Host as ExpoHost,
  Picker as ExpoPicker,
  Switch as ExpoSwitch,
} from "@expo/ui";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useState, type ComponentProps, type PropsWithChildren, type ReactNode } from "react";
import {
  Pressable,
  Modal,
  ScrollView,
  Text,
  TextInput,
  View,
  type ColorValue,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";

type SymbolName = ComponentProps<typeof SymbolView>["name"];
type SymbolWeight = ComponentProps<typeof SymbolView>["weight"];

export const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

const horizontalIconOffset: Partial<Record<string, number>> = {
  "arrow.right": 0.75,
  "chevron.right": 0.75,
  "arrow.left": -0.75,
  "chevron.left": -0.75,
  play: 1,
};

export function WardrobeIcon({ name, color, size = iconSize.md, weight = "semibold", offsetX, offsetY = -0.25 }: {
  name: SymbolName;
  color: ColorValue;
  size?: number;
  weight?: SymbolWeight;
  offsetX?: number;
  offsetY?: number;
}) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
        transform: [{ translateX: offsetX ?? horizontalIconOffset[name as string] ?? 0 }, { translateY: offsetY }],
      }}
    >
      <SymbolView name={name} tintColor={color} weight={weight} resizeMode="scaleAspectFit" size={size} style={{ width: size, height: size }} />
    </View>
  );
}

export function GlassLayer({ tintColor }: { tintColor?: ColorValue }) {
  const { dark, colors } = useWardrobeTheme();
  const tint = tintColor ?? colors.glass;

  if (isLiquidGlassAvailable()) {
    return (
      <GlassView
        pointerEvents="none"
        glassEffectStyle={{ style: "regular", animate: true }}
        colorScheme={dark ? "dark" : "light"}
        tintColor={tint as string}
        style={{ position: "absolute", inset: 0 }}
      />
    );
  }

  return <BlurView pointerEvents="none" tint={dark ? "dark" : "systemThinMaterial"} intensity={44} style={{ position: "absolute", inset: 0, backgroundColor: tint }} />;
}

export function Screen({
  children,
  scroll = true,
  contentContainerStyle,
}: PropsWithChildren<{ scroll?: boolean; contentContainerStyle?: StyleProp<ViewStyle> }>) {
  const { colors } = useWardrobeTheme();

  if (!scroll) return <View style={{ flex: 1, backgroundColor: colors.canvas }}>{children}</View>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[{ gap: spacing.xl, paddingHorizontal: spacing.lg, paddingBottom: 160, paddingTop: spacing.xl }, contentContainerStyle]}
      >
        {children}
      </ScrollView>
    </View>
  );
}

export function Card({ children, className, style }: PropsWithChildren<{ className?: string; style?: StyleProp<ViewStyle> }>) {
  const { colors } = useWardrobeTheme();
  return (
    <View
      className={className}
      style={[
        {
          overflow: "hidden",
          borderRadius: radius.xl,
          borderCurve: "continuous",
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          padding: spacing.lg,
          boxShadow: elevation.card,
        },
        style,
      ]}
    >
      {isLiquidGlassAvailable() ? <GlassLayer tintColor={colors.glass} /> : null}
      {children}
    </View>
  );
}

export function GlassButton({ icon, onPress, label, value, size = touchTarget, variant = "light", tintColor, disabled = false }: {
  icon: SymbolName;
  onPress?: () => void;
  label?: string;
  value?: string;
  size?: number;
  variant?: "light" | "dark";
  tintColor?: ColorValue;
  disabled?: boolean;
}) {
  const { colors } = useWardrobeTheme();
  const dark = variant === "dark";
  const [pressed, setPressed] = useState(false);
  const foreground = tintColor ?? (dark ? colors.onAccent : colors.label);
  const nativeGlass = isLiquidGlassAvailable();
  const width = value ? size + 24 : size;

  const content = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={(event) => {
        event.stopPropagation();
        onPress?.();
      }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      hitSlop={Math.max(0, (44 - size) / 2)}
      style={{
        width,
        height: size,
        borderRadius: radius.pill,
        flexDirection: "row",
        gap: 6,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: nativeGlass ? "transparent" : dark ? colors.label : colors.surface,
        opacity: disabled ? 0.42 : !nativeGlass && pressed ? 0.68 : 1,
        transform: [{ scale: !nativeGlass && pressed ? motion.pressScale : 1 }],
      }}
    >
      {!nativeGlass ? <GlassLayer tintColor={dark ? colors.label : colors.glass} /> : null}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          flexDirection: "row",
          gap: 6,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <WardrobeIcon name={icon} color={foreground} size={size <= control.compact ? iconSize.sm : iconSize.md} />
        {value ? <Text style={{ ...typeScale.caption, color: foreground, ...typeScale.numeric, includeFontPadding: false, textAlignVertical: "center" }}>{value}</Text> : null}
      </View>
    </Pressable>
  );
  return nativeGlass ? (
    <GlassView
      isInteractive={!disabled}
      glassEffectStyle="regular"
      colorScheme={dark ? "dark" : "light"}
      tintColor={dark ? colors.label : undefined}
      style={{ width, height: size, minWidth: size, flexShrink: 0, borderRadius: radius.pill }}
    >
      {content}
    </GlassView>
  ) : (
    <View style={{ width, height: size, minWidth: size, flexShrink: 0, borderRadius: radius.pill, boxShadow: elevation.low }}>{content}</View>
  );
}

export const IconButton = GlassButton;

// Circular toolbar control using the same native glass material as iOS headers.
// Keep Pressable INSIDE touch-enabled GlassView; see docs/interactive-glass.md.
export function CircularGlassButton({ icon, label, onPress, size = 44, tintColor, selected, badge = false }: {
  icon: SymbolName;
  label: string;
  onPress: () => void;
  size?: number;
  tintColor?: ColorValue;
  selected?: boolean;
  badge?: boolean;
}) {
  const { colors, dark } = useWardrobeTheme();
  const [pressed, setPressed] = useState(false);
  const nativeGlass = isLiquidGlassAvailable();
  const content = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={(event) => { event.stopPropagation(); onPress(); }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      hitSlop={Math.max(0, (44 - size) / 2)}
      style={{ width: size, height: size, borderRadius: size / 2, opacity: !nativeGlass && pressed ? 0.7 : 1 }}
    >
      {!nativeGlass ? (
        <View pointerEvents="none" style={{ position: "absolute", inset: 0, borderRadius: size / 2, overflow: "hidden", backgroundColor: colors.surface }}>
          <BlurView intensity={44} tint={dark ? "dark" : "systemThinMaterial"} style={{ position: "absolute", inset: 0 }} />
        </View>
      ) : null}
      <View pointerEvents="none" style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
        <WardrobeIcon name={icon} color={tintColor ?? colors.label} size={size <= 36 ? 16 : 20} weight="medium" />
      </View>
      {badge ? <View pointerEvents="none" style={{ position: "absolute", top: 5, right: 5, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent }} /> : null}
    </Pressable>
  );
  return nativeGlass ? (
    <GlassView
      isInteractive
      glassEffectStyle="regular"
      colorScheme={dark ? "dark" : "light"}
      style={{ width: size, height: size, flexShrink: 0, borderRadius: size / 2 }}
    >
      {content}
    </GlassView>
  ) : (
    <View style={{ width: size, height: size, flexShrink: 0, borderRadius: size / 2, boxShadow: elevation.low }}>{content}</View>
  );
}

export function GlassPillButton({ label, accessibilityLabel = label, icon, onPress, width = 116 }: {
  label: string;
  accessibilityLabel?: string;
  icon?: SymbolName;
  onPress: () => void;
  width?: number;
}) {
  const { colors, dark } = useWardrobeTheme();
  const [pressed, setPressed] = useState(false);
  const nativeGlass = isLiquidGlassAvailable();
  const content = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={{ width, height: 44, borderRadius: radius.pill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, backgroundColor: nativeGlass ? "transparent" : colors.surface, opacity: !nativeGlass && pressed ? 0.7 : 1 }}
    >
      {!nativeGlass ? <GlassLayer tintColor={colors.glass} /> : null}
      <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 18, fontWeight: "700", includeFontPadding: false, color: colors.label }}>{label}</Text>
      {icon ? <WardrobeIcon name={icon} color={colors.secondaryLabel} size={12} weight="semibold" /> : null}
    </Pressable>
  );
  return nativeGlass ? (
    <GlassView isInteractive glassEffectStyle="regular" colorScheme={dark ? "dark" : "light"} style={{ width, height: 44, flexShrink: 0, borderRadius: radius.pill }}>{content}</GlassView>
  ) : (
    <View style={{ width, height: 44, flexShrink: 0, borderRadius: radius.pill, boxShadow: elevation.low }}>{content}</View>
  );
}

export function ModalHeader({ title, subtitle, onClose }: { title: string; subtitle?: string; onClose?: () => void }) {
  const { colors } = useWardrobeTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <Text accessibilityRole="header" style={{ ...typeScale.sectionTitle, color: colors.label }}>{title}</Text>
        {subtitle ? <Text style={{ ...typeScale.callout, fontWeight: "400", color: colors.secondaryLabel }}>{subtitle}</Text> : null}
      </View>
      <CircularGlassButton icon="xmark" label={`Close ${title.toLowerCase()}`} onPress={onClose ?? (() => router.back())} />
    </View>
  );
}

// Shared by the outfit library and builder so category selection stays consistent.
// NOTE: `style` must stay an object, not a function. NativeWind's native interop
// (react-native-css-interop/native-interop) spreads inline styles with `{ ...style }`
// to build its own props, which turns a function into `{}` and drops every style.
export function FilterChip({ label, count, selected, onPress }: { label: string; count?: number; selected: boolean; onPress: () => void }) {
  const { colors } = useWardrobeTheme();
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => { if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync(); onPress(); }}
      style={{
        minHeight: 44,
        paddingHorizontal: 14,
        borderRadius: radius.pill,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: selected ? colors.label : colors.surface,
        borderWidth: 1,
        borderColor: selected ? colors.label : colors.border,
        transform: [{ scale: pressed ? motion.pressScale : 1 }],
      }}
    >
      <Text style={{ ...typeScale.callout, fontWeight: "700", color: selected ? colors.onAccent : colors.secondaryLabel }}>{label}</Text>
      {count !== undefined ? <Text style={{ ...typeScale.caption, ...typeScale.numeric, color: selected ? colors.onAccent : colors.tertiaryLabel, opacity: selected ? 0.7 : 1 }}>{count}</Text> : null}
    </Pressable>
  );
}

export function ToolbarButton({ icon, label, accessibilityLabel, selected = false, onPress }: { icon: SymbolName; label?: string; accessibilityLabel?: string; selected?: boolean; onPress: () => void }) {
  const { colors } = useWardrobeTheme();
  const [pressed, setPressed] = useState(false);
  const foreground = selected ? colors.accent : colors.secondaryLabel;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={onPress}
      hitSlop={2}
      style={{
        minWidth: control.regular,
        height: control.regular,
        paddingHorizontal: label ? 14 : 0,
        borderRadius: radius.pill,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        borderWidth: 1,
        borderColor: selected ? colors.accent : colors.border,
        backgroundColor: selected ? colors.accentSoft : colors.glass,
        opacity: pressed ? 0.68 : 1,
        transform: [{ scale: pressed ? motion.pressScale : 1 }],
      }}
    >
      <WardrobeIcon name={icon} color={foreground} size={iconSize.sm} />
      {label ? <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 18, fontWeight: "600", includeFontPadding: false, color: foreground }}>{label}</Text> : null}
    </Pressable>
  );
}

export function Button({ children, onPress, icon, variant = "primary", disabled, style, ...props }: PropsWithChildren<PressableProps & { icon?: SymbolName; variant?: "primary" | "secondary" | "destructive" }>) {
  const { colors } = useWardrobeTheme();
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const primary = variant === "primary";
  const destructive = variant === "destructive";
  const backgroundColor = destructive ? colors.destructive : primary ? colors.label : colors.surfaceRaised;
  const foreground = primary || destructive ? colors.onAccent : colors.label;
  // NativeWind's native interop object-spreads inline styles, which erases a
  // callback. Resolve any function `style` here so Pressable always gets an array.
  const resolvedStyle = typeof style === "function" ? style({ pressed, hovered }) : style;

  return (
    <Pressable
      {...props}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={(event) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.(event);
      }}
      style={[
        {
          minHeight: control.button,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: control.labelGap,
          borderRadius: radius.md,
          borderCurve: "continuous",
          paddingHorizontal: spacing.lg,
          paddingVertical: 13,
          backgroundColor,
          borderWidth: primary || destructive ? 0 : 1,
          borderColor: colors.border,
          boxShadow: primary || destructive ? elevation.low : undefined,
          opacity: disabled ? 0.45 : pressed ? 0.78 : 1,
          transform: [{ scale: pressed ? motion.pressScale : 1 }],
        },
        resolvedStyle,
      ]}
    >
      {icon ? <WardrobeIcon name={icon} color={foreground} size={iconSize.md} /> : null}
      <Text style={{ ...typeScale.button, flexShrink: 1, fontSize: 15, color: foreground, includeFontPadding: false, textAlignVertical: "center", textAlign: "center" }}>{children}</Text>
    </Pressable>
  );
}

export function NativeSwitch({ value, onValueChange, label, disabled }: { value: boolean; onValueChange: (value: boolean) => void; label?: string; disabled?: boolean }) {
  const { colors } = useWardrobeTheme();
  return (
    <ExpoHost matchContents seedColor={colors.accent}>
      <ExpoSwitch value={value} onValueChange={onValueChange} label={label} disabled={disabled} />
    </ExpoHost>
  );
}

export function NativePicker<T extends string>({ value, onValueChange, options, label }: { value: T; onValueChange: (value: T) => void; options: readonly { label: string; value: T }[]; label?: string }) {
  const { colors } = useWardrobeTheme();
  return (
    <View accessibilityLabel={label} style={{ minHeight: touchTarget, justifyContent: "center" }}>
      <ExpoHost matchContents seedColor={colors.accent}>
        <ExpoPicker selectedValue={value} onValueChange={(next) => onValueChange(next as T)} appearance="menu">
          {options.map((option) => <ExpoPicker.Item key={option.value} label={option.label} value={option.value} />)}
        </ExpoPicker>
      </ExpoHost>
    </View>
  );
}

export function Sheet({ visible, onDismiss, children, snapPoints = ["half", "full"], contentContainerStyle, title, subtitle, footer, compact = false }: PropsWithChildren<{ visible: boolean; onDismiss: () => void; snapPoints?: Array<"half" | "full">; contentContainerStyle?: StyleProp<ViewStyle>; title?: string; subtitle?: string; footer?: ReactNode; compact?: boolean }>) {
  const { colors } = useWardrobeTheme();
  const insets = useSafeAreaInsets();

  if (title && compact) {
    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Close ${title.toLowerCase()}`} onPress={onDismiss} style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.28)" }} />
          <View accessibilityViewIsModal style={{ maxHeight: "85%", width: "100%", backgroundColor: colors.canvas, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderCurve: "continuous", overflow: "hidden", paddingTop: spacing.lg, paddingBottom: Math.max(insets.bottom, spacing.md) }}>
            <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.md }}><ModalHeader title={title} subtitle={subtitle} onClose={onDismiss} /></View>
            <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={[{ paddingHorizontal: spacing.xl, paddingBottom: spacing.md, gap: spacing.xs }, contentContainerStyle]}>
              {children}
            </ScrollView>
            {footer}
          </View>
        </View>
      </Modal>
    );
  }

  return (
      title ? (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" allowSwipeDismissal onRequestClose={onDismiss}>
        <SafeAreaProvider style={{ flex: 1, backgroundColor: colors.canvas }}>
        <SafeAreaView edges={["top", "bottom", "left", "right"]} style={{ flex: 1, backgroundColor: colors.canvas }}>
        <View style={{ flex: 1, minHeight: 0, width: "100%", backgroundColor: colors.canvas, paddingTop: spacing.lg, paddingBottom: footer ? 0 : spacing.lg }}>
          <View style={{ flexShrink: 0, paddingHorizontal: spacing.xl, paddingBottom: spacing.lg }}><ModalHeader title={title} subtitle={subtitle} onClose={onDismiss} /></View>
          <ScrollView style={{ flex: 1, minHeight: 0, width: "100%" }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, gap: spacing.xl }, contentContainerStyle]}>
            {children}
          </ScrollView>
          {footer ? <View style={{ flexShrink: 0, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, backgroundColor: colors.canvas, borderTopWidth: 1, borderTopColor: colors.separator }}>{footer}</View> : null}
        </View>
        </SafeAreaView>
        </SafeAreaProvider>
        </Modal>
      ) : <ExpoBottomSheet isPresented={visible} onDismiss={onDismiss} snapPoints={snapPoints} containerColor={colors.canvas} contentPadding={0}><View style={[{ paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxxl, gap: spacing.lg, backgroundColor: colors.canvas }, contentContainerStyle]}>{children}</View></ExpoBottomSheet>
  );
}

export function FormField({ label, error, style, ...props }: TextInputProps & { label: string; error?: string }) {
  const { colors } = useWardrobeTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ ...typeScale.callout, color: colors.secondaryLabel }}>{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor={colors.tertiaryLabel}
        accessibilityLabel={props.accessibilityLabel ?? label}
        accessibilityState={{ disabled: props.editable === false }}
        style={[{ minHeight: 48, borderRadius: radius.md, borderCurve: "continuous", borderWidth: 1, borderColor: error ? colors.destructive : colors.border, backgroundColor: colors.surface, color: colors.label, paddingHorizontal: spacing.md, ...typeScale.body }, style]}
      />
      {error ? <Text selectable accessibilityLiveRegion="polite" style={{ ...typeScale.caption, color: colors.destructive }}>{error}</Text> : null}
    </View>
  );
}

export function SelectionRow({ title, subtitle, selected, onPress, icon }: { title: string; subtitle?: string; selected?: boolean; onPress: () => void; icon?: SymbolName }) {
  const { colors } = useWardrobeTheme();
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: Boolean(selected), selected }} onPress={onPress} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} style={{ minHeight: 64, flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: selected ? colors.accentSoft : colors.surface, opacity: pressed ? 0.65 : 1 }}>
      {icon ? <View style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}><WardrobeIcon name={icon} color={selected ? colors.accent : colors.secondaryLabel} size={20} /></View> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ ...typeScale.body, color: colors.label }}>{title}</Text>
        {subtitle ? <Text style={{ ...typeScale.caption, color: colors.secondaryLabel }}>{subtitle}</Text> : null}
      </View>
      <WardrobeIcon name={selected ? "checkmark.circle.fill" : "circle"} color={selected ? colors.accent : colors.tertiaryLabel} size={22} />
    </Pressable>
  );
}

export function EmptyState({ icon = "rectangle.on.rectangle.slash", title, message, action }: { icon?: SymbolName; title: string; message: string; action?: ReactNode }) {
  const { colors } = useWardrobeTheme();
  return (
    <View style={{ alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.xxl, paddingVertical: spacing.xxxl }}>
      <View style={{ width: 64, height: 64, borderRadius: radius.lg + spacing.xs, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceMuted }}>
        <WardrobeIcon name={icon} color={colors.secondaryLabel} size={28} />
      </View>
      <Text style={{ ...typeScale.sectionTitle, color: colors.label, textAlign: "center" }}>{title}</Text>
      <Text style={{ ...typeScale.callout, color: colors.secondaryLabel, textAlign: "center" }}>{message}</Text>
      {action}
    </View>
  );
}

export function Avatar({ initials }: { initials: string }) {
  const { colors } = useWardrobeTheme();
  return <View style={{ height: 48, width: 48, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}><Text style={{ ...typeScale.body, color: colors.label }}>{initials}</Text></View>;
}

export function ItemImage({ imageUrl, label, size = "large", style, contentFit = "cover" }: { imageUrl: string; label: string; size?: "small" | "large"; style?: StyleProp<ViewStyle>; contentFit?: "cover" | "contain" }) {
  const { colors } = useWardrobeTheme();
  const source = itemImageSource(imageUrl);
  return (
    <View accessibilityLabel={label} style={[{ height: size === "small" ? 128 : undefined, flex: size === "small" ? 1 : undefined, aspectRatio: size === "large" ? 1 : undefined, width: size === "large" ? "100%" : undefined, overflow: "hidden", borderRadius: radius.sm + 2, backgroundColor: colors.surfaceMuted, borderWidth: imageOutlineWidth, borderColor: colors.imageOutline }, style]}>
      <Image source={source} contentFit={contentFit} style={{ height: "100%", width: "100%" }} />
    </View>
  );
}

export function OutfitPreviewCard({ title, subtitle, items, saved, badge, compact = false, primaryIcon = "calendar", primaryLabel = "Plan", onPrimaryPress, onSavePress }: { title: string; subtitle: string; items: ClothingItem[]; saved?: boolean; badge?: string; compact?: boolean; primaryIcon?: SymbolName; primaryLabel?: string; onPrimaryPress?: () => void; onSavePress?: () => void }) {
  const { colors } = useWardrobeTheme();
  return (
    <Card style={{ padding: 0, borderRadius: radius.lg }}>
      <View style={{ gap: compact ? spacing.sm : spacing.md, padding: compact ? 14 : spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm }}>
          <View style={{ flex: 1, gap: 3 }}><Text numberOfLines={compact ? 1 : undefined} style={{ fontSize: compact ? 13 : 17, fontWeight: "700", color: colors.label }}>{title}</Text><Text numberOfLines={compact ? 1 : undefined} style={{ ...typeScale.caption, fontSize: compact ? 10 : 12, color: colors.secondaryLabel }}>{subtitle}</Text></View>
          {badge ? <View style={{ borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, paddingHorizontal: 9, paddingVertical: 4 }}><Text style={{ ...typeScale.eyebrow, fontSize: compact ? 8 : 10, color: colors.secondaryLabel }}>{badge}</Text></View> : null}
        </View>
        <Image source={require("@/assets/look-preview.png")} contentFit="contain" style={{ width: "100%", height: compact ? 104 : 220, borderRadius: radius.sm, borderWidth: imageOutlineWidth, borderColor: colors.imageOutline }} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 4 }}>
          <Text style={{ ...typeScale.caption, color: colors.secondaryLabel, ...typeScale.numeric }}>{items.length} pieces</Text>
          <View style={{ flexDirection: "row", gap: spacing.xs }}>
            {onSavePress ? <GlassButton icon={saved ? "heart.fill" : "heart"} tintColor={saved ? colors.destructive : colors.label} label={saved ? "Unsave outfit" : "Save outfit"} onPress={onSavePress} size={compact ? 36 : touchTarget} /> : null}
            {onPrimaryPress ? <GlassButton icon={primaryIcon} label={primaryLabel} onPress={onPrimaryPress} size={compact ? 36 : touchTarget} /> : null}
          </View>
        </View>
      </View>
    </Card>
  );
}

export function SectionHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: string }) {
  const { colors } = useWardrobeTheme();
  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ gap: spacing.xs }}>
        {eyebrow ? <Text style={{ ...typeScale.eyebrow, color: colors.secondaryLabel }}>{eyebrow}</Text> : null}
        <Text style={{ ...typeScale.title, color: colors.label }}>{title}</Text>
      </View>
      {action ? <Text style={{ ...typeScale.callout, color: colors.secondaryLabel }}>{action}</Text> : null}
    </View>
  );
}
