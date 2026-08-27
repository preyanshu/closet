import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { type ClothingItem } from "@/data/mock";
import { type ComponentProps, type PropsWithChildren } from "react";
import { Pressable, ScrollView, Text, View, type PressableProps, type StyleProp, type ViewStyle } from "react-native";


type SymbolName = ComponentProps<typeof SymbolView>["name"];

export const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

export function GlassLayer({ tintColor = "#FFFFFF" }: { tintColor?: string }) {
  if (isLiquidGlassAvailable()) {
    return (
      <GlassView
        pointerEvents="none"
        glassEffectStyle={{ style: "regular", animate: true }}
        colorScheme="light"
        tintColor={tintColor}
        style={{ position: "absolute", inset: 0 }}
      />
    );
  }

  return <BlurView pointerEvents="none" tint="systemThinMaterial" intensity={40} style={{ position: "absolute", inset: 0 }} />;
}

export function Screen({ children, scroll = true }: PropsWithChildren<{ scroll?: boolean }>) {
  const className = "flex-1 bg-[#FFFDF3]";

  if (!scroll) {
    return <View className={className}>{children}</View>;
  }

  return (
    <View className={className}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="gap-7 px-6 pb-40 pt-7">
        {children}
      </ScrollView>
    </View>
  );
}

export function Card({ children, className, style }: PropsWithChildren<{ className?: string; style?: StyleProp<ViewStyle> }>) {
  const glassAvailable = isLiquidGlassAvailable();

  return (
    <View
      className={cx("overflow-hidden rounded-[30px] border border-black/[0.07] bg-[#FFFFFA] p-6", className)}
      style={[{ borderCurve: "continuous", boxShadow: "0 14px 36px rgba(0, 0, 0, 0.045)" }, style]}
    >
      {glassAvailable ? (
        <GlassView
          pointerEvents="none"
          glassEffectStyle={{ style: "clear", animate: true }}
          colorScheme="light"
          tintColor="#FFFFFF"
          style={{ position: "absolute", inset: 0 }}
        />
      ) : null}
      {children}
    </View>
  );
}

export function GlassButton({
  icon,
  onPress,
  label,
  value,
  size = 44,
  variant = "light",
  tintColor,
}: {
  icon: ComponentProps<typeof SymbolView>["name"];
  onPress?: () => void;
  label?: string;
  value?: string;
  size?: number;
  variant?: "light" | "dark";
  tintColor?: string;
}) {
  const dark = variant === "dark";
  const glassAvailable = isLiquidGlassAvailable();

  const content = (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={{ height: size, minWidth: size, paddingHorizontal: label || value ? 14 : 0, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" }}
    >
      <SymbolView name={icon} tintColor={tintColor ?? (dark ? "#FFFDF3" : "rgba(0,0,0,0.55)")} style={{ width: Math.round(size * 0.4), height: Math.round(size * 0.4) }} />
      {value ? <Text style={{ fontSize: 12, fontWeight: "800", color: tintColor ?? (dark ? "rgba(255,253,243,0.7)" : "rgba(0,0,0,0.5)"), fontVariant: ["tabular-nums"] }}>{value}</Text> : null}
    </Pressable>
  );

  if (glassAvailable) {
    return (
      <GlassView isInteractive glassEffectStyle="regular" colorScheme="light" tintColor={dark ? "#000000" : "#FFFFFF"} style={{ borderRadius: 999 }}>
        {content}
      </GlassView>
    );
  }

  return (
    <View style={{ borderRadius: 999, overflow: "hidden", backgroundColor: dark ? "#000000" : "rgba(0,0,0,0.04)" }}>
      <GlassLayer tintColor={dark ? "#000000" : "#FFFFFF"} />
      {content}
    </View>
  );
}

export function Button({ children, onPress, icon, variant = "primary", ...props }: PropsWithChildren<PressableProps & { icon?: SymbolName; variant?: "primary" | "secondary" }>) {
  const primary = variant === "primary";

  return (
    <Pressable
      {...props}
      onPress={(event) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.(event);
      }}
      className={cx(
        "min-h-12 flex-row items-center justify-center gap-2 rounded-full px-5 py-4 active:scale-[0.96]",
        primary ? "bg-black" : "border border-black/10 bg-[#FFFFFA]"
      )}
    >
      {icon ? <SymbolView name={icon} tintColor={primary ? "#FFFDF3" : "#4A4436"} style={{ width: 20, height: 20 }} /> : null}
      <Text className={cx("text-base font-semibold", primary ? "text-[#FFFDF3]" : "text-black/75")}>{children}</Text>
    </Pressable>
  );
}

export function Avatar({ initials }: { initials: string }) {
  return (
    <View className="h-12 w-12 items-center justify-center rounded-full border border-black/10 bg-[#FFFFFA]">
      <Text className="text-base font-semibold text-black">{initials}</Text>
    </View>
  );
}

export function ItemImage({ imageUrl, label, size = "large", style }: { imageUrl: string; label: string; size?: "small" | "large"; style?: StyleProp<ViewStyle> }) {
  const imageClass = size === "small" ? "h-32 flex-1" : "aspect-square w-full";

  const getImageSource = () => {
    if (imageUrl.includes("item-1")) return require("@/assets/item-1.png");
    if (imageUrl.includes("item-2")) return require("@/assets/item-2.png");
    if (imageUrl.includes("item-3")) return require("@/assets/item-3.png");
    if (imageUrl.includes("item-4")) return require("@/assets/item-4.png");
    return { uri: imageUrl };
  };

  return (
    <View className={cx("overflow-hidden rounded-[12px] bg-[#F6F1E4]", imageClass)} style={style}>
      <Image source={getImageSource()} contentFit="cover" style={{ height: "100%", width: "100%" }} />
    </View>
  );
}

export function OutfitPreviewCard({
  title,
  subtitle,
  items,
  saved,
  badge,
  compact = false,
  primaryIcon = "calendar",
  primaryLabel = "Plan",
  onPrimaryPress,
  onSavePress,
}: {
  title: string;
  subtitle: string;
  items: ClothingItem[];
  saved?: boolean;
  badge?: string;
  compact?: boolean;
  primaryIcon?: SymbolName;
  primaryLabel?: string;
  onPrimaryPress?: () => void;
  onSavePress?: () => void;
}) {
  return (
    <Card className="rounded-[18px] p-0" style={{ padding: 0 }}>
      <View style={{ gap: compact ? 12 : 16, padding: compact ? 14 : 16 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: compact ? 10 : 16 }}>
          <View className="flex-1 gap-1">
            <Text numberOfLines={compact ? 1 : undefined} className={cx("font-bold text-black", compact ? "text-[13px]" : "text-[17px] tracking-[-0.3px]")}>{title}</Text>
            <Text numberOfLines={compact ? 1 : undefined} className={cx("font-medium text-black/45", compact ? "text-[10px]" : "text-xs")}>{subtitle}</Text>
          </View>
          {badge ? (
            <View className={cx("rounded-full bg-black/[0.06]", compact ? "px-1.5 py-0.5" : "px-2.5 py-1")}>
              <Text className={cx("font-bold uppercase text-black/35", compact ? "text-[8px]" : "text-[10px] tracking-[1px]")}>{badge}</Text>
            </View>
          ) : null}
        </View>

        <Image
          source={require("@/assets/look-preview.png")}
          contentFit="contain"
          style={{ width: "100%", height: compact ? 104 : 220, borderRadius: compact ? 10 : 12 }}
        />

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: compact ? 5 : 6 }}>
            <SymbolView name="sparkles" tintColor="rgba(0,0,0,0.34)" style={{ width: compact ? 12 : 14, height: compact ? 12 : 14 }} />
            <Text className={cx("font-semibold uppercase text-black/38", compact ? "text-[9px]" : "text-xs tracking-[1.3px]")}>{items.length} pieces</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: compact ? 5 : 8 }}>
            {onSavePress ? (
              <Pressable accessibilityLabel={saved ? "Unsave outfit" : "Save outfit"} onPress={onSavePress} className={cx("items-center justify-center rounded-full bg-black/[0.04] active:scale-[0.96]", compact ? "h-8 w-8" : "h-10 w-10")}>
                <SymbolView name={saved ? "heart.fill" : "heart"} tintColor={saved ? "#FF3B30" : "#000000"} style={{ width: compact ? 15 : 18, height: compact ? 15 : 18 }} />
              </Pressable>
            ) : null}
            {onPrimaryPress ? (
              <Pressable accessibilityLabel={primaryLabel} onPress={onPrimaryPress} className={cx("flex-row items-center justify-center rounded-full bg-black/[0.04] active:scale-[0.96]", compact ? "h-8 min-w-8 px-2" : "h-10 min-w-10 gap-1.5 px-3")}>
                <SymbolView name={primaryIcon} tintColor="#000000" style={{ width: compact ? 14 : 17, height: compact ? 14 : 17 }} />
                {compact ? null : <Text className="text-xs font-bold text-black/55">{primaryLabel}</Text>}
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Card>
  );
}

export function SectionHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: string }) {
  return (
    <View className="gap-4">
      <View className="gap-2.5">
        {eyebrow ? <Text className="text-xs font-bold uppercase tracking-[2.4px] text-black/45">{eyebrow}</Text> : null}
        <Text className="text-[36px] font-bold leading-[39px] tracking-[-1.4px] text-black">{title}</Text>
      </View>
      {action ? <Text className="text-sm font-semibold text-black/50">{action}</Text> : null}
    </View>
  );
}
