import { Platform, PlatformColor } from "react-native";

export const colors = {
  label: Platform.OS === "ios"
    ? PlatformColor("label")
    : Platform.OS === "android"
      ? PlatformColor("@android:color/primary_text_light")
      : "#000000",
  secondaryLabel: Platform.OS === "ios"
    ? PlatformColor("secondaryLabel")
    : Platform.OS === "android"
      ? PlatformColor("@android:color/secondary_text_light")
      : "#3c3c43",
  separator: Platform.OS === "ios"
    ? PlatformColor("separator")
    : Platform.OS === "android"
      ? PlatformColor("@android:color/darker_gray")
      : "#c6c6c8",
  systemBackground: Platform.OS === "ios"
    ? PlatformColor("systemBackground")
    : Platform.OS === "android"
      ? PlatformColor("@android:color/background_light")
      : "#ffffff",
  systemBlue: Platform.OS === "ios"
    ? PlatformColor("systemBlue")
    : Platform.OS === "android"
      ? PlatformColor("@android:color/holo_blue_light")
      : "#007aff",
  tertiarySystemBackground: Platform.OS === "ios"
    ? PlatformColor("tertiarySystemBackground")
    : Platform.OS === "android"
      ? PlatformColor("@android:color/background_light")
      : "#f2f2f7",
  quaternarySystemBackground: Platform.OS === "ios"
    ? PlatformColor("quaternarySystemBackground")
    : Platform.OS === "android"
      ? PlatformColor("@android:color/background_light")
      : "#ffffff",
  systemGroupedBackground: Platform.OS === "ios"
    ? PlatformColor("systemGroupedBackground")
    : Platform.OS === "android"
      ? PlatformColor("@android:color/background_light")
      : "#f2f2f7",
  placeholder: Platform.OS === "ios"
    ? PlatformColor("placeholderText")
    : Platform.OS === "android"
      ? PlatformColor("@android:color/secondary_text_light")
      : "#3c3c4399",
} as const;
