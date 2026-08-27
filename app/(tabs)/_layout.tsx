import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Icon } from "expo-router/unstable-native-tabs";

export default function TabsLayout() {
  return (
    <NativeTabs
      tintColor="#000000"
      backgroundColor={null}
      labelStyle={{ fontSize: 10, fontWeight: "600" }}
    >
      <NativeTabs.Trigger name="index" options={{ title: "Today" }}>
        <Icon sf={{ default: "house", selected: "house.fill" }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="closet" options={{ title: "Closet" }}>
        <Icon sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="outfits" options={{ title: "Outfits" }}>
        <Icon sf={{ default: "heart", selected: "heart.fill" }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="plan" options={{ title: "Plan" }}>
        <Icon sf={{ default: "calendar", selected: "calendar.badge.checkmark" }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile" options={{ title: "Profile" }}>
        <Icon sf={{ default: "person", selected: "person.fill" }} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
