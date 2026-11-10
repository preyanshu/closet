import { adaptiveColors, radius, spacing, FilterChip, PageHeader, Screen, SectionTitle } from "@/components/ui";
import { displayName } from "@/services/display-name";
import { PRIVACY_URL, TERMS_URL } from "@/services/config";
import { vibesFor } from "@/services/vibes";
import { useAuth } from "@/state/auth-context";
import { useCloset } from "@/state/closet-context";
import { useSubscription } from "@/state/subscription-context";
import { WEARER_PRESENTATIONS, type WearerPresentation } from "@/types/domain";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { type ReactNode } from "react";
import { Linking, Pressable, Text, View } from "react-native";

const WEARER_LABEL: Record<WearerPresentation, string> = { male: "Menswear", female: "Womenswear", unspecified: "Everything" };
const MANAGE_SUBSCRIPTION_URL = "https://apps.apple.com/account/subscriptions";

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "A";

export default function ProfileScreen() {
  const { items, myLooks, savedLooks, profile, updateProfile, stylePreferences, setStylePreferences } = useCloset();
  const { user, signOut } = useAuth();
  const { status: subscription, bypassed } = useSubscription();

  const email = user?.email ?? undefined;
  const name = displayName(user?.user_metadata?.full_name as string | undefined, email) || "Your account";
  const presentation = profile.presentation ?? "male";
  const vibes = vibesFor(presentation);
  // Vibes picked under another wearer setting are kept but not shown here.
  const shownVibeIds = new Set(vibes.map((vibe) => vibe.id));

  const pieces = items.length;
  const looks = myLooks.length + savedLooks.length;
  const wears = items.reduce((total, item) => total + item.wearCount, 0);
  const pro = subscription === "active" && !bypassed;


  return (
    <Screen contentContainerStyle={{ gap: spacing.xl }}>
      <PageHeader eyebrow="Account" title="Profile" />

      {/* Who */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", backgroundColor: adaptiveColors.label }}>
          <Text style={{ fontSize: 22, fontWeight: "800", color: adaptiveColors.onAccent }}>{initialsOf(name)}</Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text numberOfLines={1} style={{ fontSize: 24, lineHeight: 29, fontWeight: "800", letterSpacing: -0.7, color: adaptiveColors.label }}>{name}</Text>
          {email ? <Text numberOfLines={1} style={{ fontSize: 14, color: adaptiveColors.secondaryLabel }}>{email}</Text> : null}
          {pro ? (
            <View style={{ alignSelf: "flex-start", marginTop: 2, paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: adaptiveColors.accentSoft }}>
              <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 0.4, color: adaptiveColors.accent }}>ALTA PRO</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Real numbers from the closet */}
      <View style={{ flexDirection: "row", borderRadius: 20, borderCurve: "continuous", backgroundColor: adaptiveColors.surfaceRaised, borderWidth: 1, borderColor: adaptiveColors.border, paddingVertical: 16 }}>
        <Stat value={pieces} label={pieces === 1 ? "Piece" : "Pieces"} />
        <View style={{ width: 1, backgroundColor: adaptiveColors.separator }} />
        <Stat value={looks} label={looks === 1 ? "Saved look" : "Saved looks"} />
        <View style={{ width: 1, backgroundColor: adaptiveColors.separator }} />
        <Stat value={wears} label={wears === 1 ? "Wear" : "Wears"} />
      </View>

      {/* The answers from onboarding, editable here */}
      <Section title="Styled for" hint="Decides which vibes and looks Alta shows you.">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
          {WEARER_PRESENTATIONS.map((option) => (
            <FilterChip
              key={option}
              label={WEARER_LABEL[option]}
              selected={presentation === option}
              onPress={() => {
                if (presentation === option) return;
                Haptics.selectionAsync();
                updateProfile({ ...profile, presentation: option });
              }}
            />
          ))}
        </View>
      </Section>

      <Section title="Your vibes" hint="Alta leans into these when it styles you.">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
          {vibes.map((vibe) => {
            const selected = stylePreferences.includes(vibe.id);
            return (
              <FilterChip
                key={vibe.id}
                label={vibe.label}
                selected={selected}
                onPress={() => {
                  Haptics.selectionAsync();
                  const others = stylePreferences.filter((id) => !shownVibeIds.has(id));
                  const current = stylePreferences.filter((id) => shownVibeIds.has(id));
                  setStylePreferences([...others, ...(selected ? current.filter((id) => id !== vibe.id) : [...current, vibe.id])]);
                }}
              />
            );
          })}
        </View>
      </Section>

      {/* Account */}
      <Section title="Account">
        <View style={{ borderRadius: 20, borderCurve: "continuous", backgroundColor: adaptiveColors.surfaceRaised, borderWidth: 1, borderColor: adaptiveColors.border, overflow: "hidden" }}>
          {pro ? <Row label="Manage subscription" icon="chevron.right" onPress={() => void Linking.openURL(MANAGE_SUBSCRIPTION_URL)} /> : null}
          {TERMS_URL ? <Row label="Terms of Service" icon="chevron.right" onPress={() => void Linking.openURL(TERMS_URL)} /> : null}
          {PRIVACY_URL ? <Row label="Privacy Policy" icon="chevron.right" onPress={() => void Linking.openURL(PRIVACY_URL)} /> : null}
          {user ? <Row label="Sign out" destructive last onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); void signOut(); }} /> : null}
        </View>
      </Section>

      <Text style={{ textAlign: "center", fontSize: 12, color: adaptiveColors.tertiaryLabel }}>
        Alta {Constants.expoConfig?.version ? `v${Constants.expoConfig.version}` : ""}
      </Text>
    </Screen>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ gap: 2 }}>
        <SectionTitle>{title}</SectionTitle>
        {hint ? <Text style={{ fontSize: 13, fontWeight: "600", color: adaptiveColors.secondaryLabel }}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", gap: 2 }}>
      <Text style={{ fontSize: 24, fontWeight: "800", letterSpacing: -0.5, color: adaptiveColors.label, fontVariant: ["tabular-nums"] }}>{value}</Text>
      <Text style={{ fontSize: 12, fontWeight: "500", color: adaptiveColors.tertiaryLabel }}>{label}</Text>
    </View>
  );
}

function Row({ label, icon, destructive, last, onPress }: { label: string; icon?: "chevron.right"; destructive?: boolean; last?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : "text"}
      disabled={!onPress}
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: adaptiveColors.separator }}
    >
      <Text style={{ fontSize: 15, fontWeight: "600", color: destructive ? adaptiveColors.destructive : adaptiveColors.label }}>{label}</Text>
      <View style={{ flex: 1 }} />
      {icon ? <SymbolView name={icon} tintColor={adaptiveColors.tertiaryLabel} style={{ width: 14, height: 14 }} /> : null}
    </Pressable>
  );
}
