import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useWardrobeTheme } from "@/theme/wardrobe-theme";

export default function TabsLayout() {
  const { colors } = useWardrobeTheme();
  return (
    <NativeTabs
      tintColor={colors.accent}
      backgroundColor={colors.glass}
      labelStyle={{ fontSize: 10, fontWeight: "600" }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} md={{ default: "home", selected: "home" }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="closet">
        <NativeTabs.Trigger.Label>Closet</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }} md={{ default: "grid_view", selected: "grid_view" }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="outfits">
        <NativeTabs.Trigger.Label>Outfits</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "heart", selected: "heart.fill" }} md={{ default: "favorite", selected: "favorite" }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="plan">
        <NativeTabs.Trigger.Label>Plan</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "calendar", selected: "calendar.badge.checkmark" }} md={{ default: "calendar_month", selected: "calendar_month" }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "person", selected: "person.fill" }} md={{ default: "person", selected: "person" }} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
