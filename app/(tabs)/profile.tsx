import { adaptiveColors, radius, Avatar, Card, GlassButton, Screen, SectionHeader } from "@/components/ui";
import { useCloset } from "@/state/closet-context";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";

const settingsGroups = [
  {
    title: "Preferences",
    rows: [
      { id: "style-quiz", label: "Edit Style Preferences", icon: "sparkles" as const, action: "push" as const, route: "/style-quiz" },
      { id: "measurements", label: "Measurements & Avatar", icon: "person.crop.circle" as const, action: "info" as const },
      { id: "notifications", label: "Notifications", icon: "bell" as const, action: "info" as const },
    ],
  },
  {
    title: "Account",
    rows: [
      { id: "retailers", label: "Connected retailers", icon: "bag" as const, action: "info" as const },
      { id: "privacy", label: "Privacy", icon: "lock.shield" as const, action: "info" as const },
      { id: "about", label: "About Alta MVP", icon: "info.circle" as const, action: "info" as const },
    ],
  },
];

export default function ProfileScreen() {
  const { stylePreferences } = useCloset();

  return (
    <Screen>
      <SectionHeader eyebrow="Profile" title="Your account" />

      <Card className="flex-row items-center gap-4">
        <Avatar initials="PW" />
        <View className="flex-1 gap-1">
          <Text className="text-xl font-bold text-black dark:text-[#FFF9ED]">Preyanshu</Text>
          <Text className="text-sm text-black/58 dark:text-white/58">{stylePreferences.length} styles selected</Text>
        </View>
        <GlassButton icon="pencil" label="Edit profile" size={36} onPress={() => {}} />
      </Card>

      {stylePreferences.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {stylePreferences.map((pref) => (
            <View key={pref} style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: adaptiveColors.label }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: adaptiveColors.onAccent, textTransform: "capitalize" }}>{pref}</Text>
            </View>
          ))}
        </View>
      )}

      <Card className="gap-3">
        <View style={{ gap: 3 }}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: adaptiveColors.secondaryLabel, textTransform: "uppercase", letterSpacing: 1.5 }}>Appearance</Text>
          <Text style={{ fontSize: 13, color: adaptiveColors.secondaryLabel }}>Light</Text>
        </View>
      </Card>

      {settingsGroups.map((group) => (
        <Card key={group.title} className="gap-1">
          <Text style={{ fontSize: 12, fontWeight: "700", color: adaptiveColors.secondaryLabel, textTransform: "uppercase", letterSpacing: 1.5, paddingVertical: 8, paddingHorizontal: 4 }}>{group.title}</Text>
          {group.rows.map((row) => (
            <Pressable
              key={row.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if ("route" in row && row.route) router.push(row.route as any);
              }}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.06)" }}
            >
              <View style={{ width: 32, height: 32, borderRadius: radius.pill, backgroundColor: "rgba(0,0,0,0.04)", alignItems: "center", justifyContent: "center" }}>
                <SymbolView name={row.icon} tintColor="rgba(0,0,0,0.4)" style={{ width: 16, height: 16 }} />
              </View>
              <Text style={{ flex: 1, fontSize: 15, fontWeight: "500", color: adaptiveColors.label }}>{row.label}</Text>
              <SymbolView name="chevron.right" tintColor="rgba(0,0,0,0.25)" style={{ width: 16, height: 16 }} />
            </Pressable>
          ))}
        </Card>
      ))}

      <Card>
        <Text style={{ fontSize: 13, lineHeight: 20, color: adaptiveColors.secondaryLabel }}>
          Scanned pieces are analyzed and staged with AI. Account sync and persistent cloud storage are not connected yet, so closet changes remain on this device session.
        </Text>
      </Card>
    </Screen>
  );
}
