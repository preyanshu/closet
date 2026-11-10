import { adaptiveColors } from "@/components/ui";
import { ActivityIndicator, Text, View } from "react-native";

/** Shown while the saved session and the closet are loading. A real route, so the navigator is never unmounted. */
export default function LoadingScreen() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: adaptiveColors.canvas, gap: 14 }}>
      <ActivityIndicator color={adaptiveColors.secondaryLabel} />
      <Text style={{ fontSize: 13, fontWeight: "600", color: adaptiveColors.secondaryLabel }}>Opening your closet…</Text>
    </View>
  );
}
