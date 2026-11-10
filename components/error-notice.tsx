import { adaptiveColors, spacing, Button } from "@/components/ui";
import { errorTitle } from "@/services/api/wardrobe-api";
import { SymbolView } from "expo-symbols";
import { Pressable, Text, View } from "react-native";

/**
 * Friendly error card: an icon, a plain headline, one sentence of what to do,
 * and a retry button. Never shows URLs, status codes or setup hints.
 */
export function ErrorNotice({ kind, title, message, onRetry, retryLabel = "Try again", busy = false }: {
  kind?: string;
  /** Overrides the headline derived from `kind`. */
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  busy?: boolean;
}) {
  const offline = kind === "unreachable";
  return (
    <View
      accessibilityRole="alert"
      style={{ flexDirection: "row", gap: 14, padding: 16, borderRadius: 20, borderCurve: "continuous", backgroundColor: adaptiveColors.surfaceRaised, borderWidth: 1, borderColor: adaptiveColors.border }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: adaptiveColors.accentSoft }}>
        <SymbolView name={offline ? "wifi.slash" : "exclamationmark.triangle"} tintColor={adaptiveColors.accent} style={{ width: 18, height: 18 }} />
      </View>
      <View style={{ flex: 1, gap: spacing.sm }}>
        <View style={{ gap: 3 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", letterSpacing: -0.2, color: adaptiveColors.label }}>{title ?? errorTitle(kind)}</Text>
          <Text style={{ fontSize: 14, lineHeight: 19, color: adaptiveColors.secondaryLabel }}>{message}</Text>
        </View>
        {onRetry ? (
          <Button size="compact" disabled={busy} onPress={onRetry} style={{ alignSelf: "flex-start" }}>{retryLabel}</Button>
        ) : null}
      </View>
    </View>
  );
}
