import { Color } from "expo-router";
import { Appearance, DynamicColorIOS, Platform, type ColorValue } from "react-native";

/** Native semantic colors for controls that should follow the host platform. */
export const nativeColors = {
  label: Platform.select({
    ios: Color.ios.label,
    android: Color.android.dynamic.onSurface,
    default: "#17140F",
  })!,
  secondaryLabel: Platform.select({
    ios: Color.ios.secondaryLabel,
    android: Color.android.dynamic.onSurfaceVariant,
    default: "#686158",
  })!,
  separator: Platform.select({
    ios: Color.ios.separator,
    android: Color.android.dynamic.outlineVariant,
    default: "rgba(23,20,15,0.12)",
  })!,
  systemBackground: Platform.select({
    ios: Color.ios.systemBackground,
    android: Color.android.dynamic.surface,
    default: "#FFFDF3",
  })!,
  accent: Platform.select({
    ios: Color.ios.systemOrange,
    android: Color.android.dynamic.primary,
    default: "#A45E2A",
  })!,
  destructive: Platform.select({
    ios: Color.ios.systemRed,
    android: Color.android.dynamic.error,
    default: "#D92D20",
  })!,
} satisfies Record<string, ColorValue>;

export const lightColors = {
  canvas: "#FFFDF3",
  surface: "#FFFFFA",
  surfaceRaised: "#FFFFFF",
  surfaceMuted: "#F6F1E4",
  label: "#17140F",
  secondaryLabel: "#686158",
  tertiaryLabel: "#938B80",
  border: "rgba(23,20,15,0.09)",
  separator: "rgba(23,20,15,0.07)",
  accent: "#A45E2A",
  accentSoft: "#F4E3D3",
  onAccent: "#FFFDF8",
  destructive: "#D92D20",
  success: "#208044",
  warning: "#C06B13",
  glass: "rgba(255,255,250,0.74)",
  glassBorder: "rgba(255,255,255,0.64)",
  imageOutline: "rgba(0,0,0,0.10)",
  scrim: "rgba(16,13,9,0.36)",
  chart: ["#A45E2A", "#D69C62", "#6F8060", "#7A6B88", "#C47B72"],
} as const;

export const darkColors = {
  canvas: "#15130F",
  surface: "#201D18",
  surfaceRaised: "#29251F",
  surfaceMuted: "#302B23",
  label: "#FFF9ED",
  secondaryLabel: "#C8BFB1",
  tertiaryLabel: "#948C80",
  border: "rgba(255,255,255,0.11)",
  separator: "rgba(255,255,255,0.08)",
  accent: "#E7A66E",
  accentSoft: "#4A3425",
  onAccent: "#24170E",
  destructive: "#FF8A80",
  success: "#72C991",
  warning: "#F2B567",
  glass: "rgba(31,28,23,0.78)",
  glassBorder: "rgba(255,255,255,0.12)",
  imageOutline: "rgba(255,255,255,0.10)",
  scrim: "rgba(0,0,0,0.58)",
  chart: ["#E7A66E", "#F0C28E", "#A6B795", "#B7A5C6", "#E1A19A"],
} as const;

export type WardrobeColors = typeof lightColors | typeof darkColors;

const adaptive = (light: string, dark: string, android: () => ColorValue): ColorValue => {
  return light;
};

/** Semantic values usable outside React components (including route option styles). */
export const adaptiveColors = {
  get canvas() { return adaptive(lightColors.canvas, darkColors.canvas, () => Color.android.dynamic.surface); },
  get surface() { return adaptive(lightColors.surface, darkColors.surface, () => Color.android.dynamic.surfaceContainerLow); },
  get surfaceRaised() { return adaptive(lightColors.surfaceRaised, darkColors.surfaceRaised, () => Color.android.dynamic.surfaceContainer); },
  get surfaceMuted() { return adaptive(lightColors.surfaceMuted, darkColors.surfaceMuted, () => Color.android.dynamic.surfaceContainerHigh); },
  get label() { return adaptive(lightColors.label, darkColors.label, () => Color.android.dynamic.onSurface); },
  get secondaryLabel() { return adaptive(lightColors.secondaryLabel, darkColors.secondaryLabel, () => Color.android.dynamic.onSurfaceVariant); },
  get tertiaryLabel() { return adaptive(lightColors.tertiaryLabel, darkColors.tertiaryLabel, () => Color.android.dynamic.outline); },
  get border() { return adaptive(lightColors.border, darkColors.border, () => Color.android.dynamic.outlineVariant); },
  get separator() { return adaptive(lightColors.separator, darkColors.separator, () => Color.android.dynamic.outlineVariant); },
  get accent() { return adaptive(lightColors.accent, darkColors.accent, () => Color.android.dynamic.primary); },
  get accentSoft() { return adaptive(lightColors.accentSoft, darkColors.accentSoft, () => Color.android.dynamic.primaryContainer); },
  get onAccent() { return adaptive(lightColors.onAccent, darkColors.onAccent, () => Color.android.dynamic.onPrimary); },
  get destructive() { return adaptive(lightColors.destructive, darkColors.destructive, () => Color.android.dynamic.error); },
  get imageOutline() { return adaptive(lightColors.imageOutline, darkColors.imageOutline, () => Color.android.dynamic.outlineVariant); },
  get glass() { return adaptive(lightColors.glass, darkColors.glass, () => Color.android.dynamic.surfaceContainer); },
  get glassBorder() { return adaptive(lightColors.glassBorder, darkColors.glassBorder, () => Color.android.dynamic.outlineVariant); },
} as const;

// Backwards-compatible semantic export. New components should use useWardrobeTheme().
export const colors = nativeColors;
