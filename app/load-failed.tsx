import { ErrorNotice } from "@/components/error-notice";
import { adaptiveColors } from "@/components/ui";
import { useCloset } from "@/state/closet-context";
import { View } from "react-native";

/** The closet couldn't be loaded from the cloud (usually no connection). Never shows an empty closet instead. */
export default function LoadFailedScreen() {
  const { loadError, retryLoad } = useCloset();
  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: adaptiveColors.canvas }}>
      <ErrorNotice kind="unreachable" title="Can't load your closet" message={loadError ?? "Check your connection and try again."} onRetry={() => void retryLoad()} />
    </View>
  );
}
