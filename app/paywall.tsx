import { ErrorNotice } from "@/components/error-notice";
import { adaptiveColors, radius, spacing, Button } from "@/components/ui";
import { errorMessage } from "@/services/api/wardrobe-api";
import { PRIVACY_URL, TERMS_URL } from "@/services/config";
import { useAppFlow } from "@/state/app-flow";
import { useAuth } from "@/state/auth-context";
import { useSubscription } from "@/state/subscription-context";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { PACKAGE_TYPE, type PurchasesPackage } from "react-native-purchases";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BENEFITS = [
  "Unlimited scanning of your closet",
  "Fresh, weather-aware looks daily",
  "Chat with Alta, your stylist",
  "Your closet synced everywhere",
];

const periodLabel = (pkg: PurchasesPackage) => {
  switch (pkg.packageType) {
    case PACKAGE_TYPE.ANNUAL: return "Yearly";
    case PACKAGE_TYPE.MONTHLY: return "Monthly";
    case PACKAGE_TYPE.WEEKLY: return "Weekly";
    case PACKAGE_TYPE.LIFETIME: return "Lifetime";
    default: return pkg.product.title;
  }
};

const priceNote = (pkg: PurchasesPackage) => {
  if (pkg.packageType === PACKAGE_TYPE.ANNUAL) return pkg.product.pricePerMonthString ? `${pkg.product.pricePerMonthString} / month` : "per year";
  if (pkg.packageType === PACKAGE_TYPE.MONTHLY) return "per month";
  if (pkg.packageType === PACKAGE_TYPE.WEEKLY) return "per week";
  return "one time";
};

/**
 * The hard paywall: no close button and no way past it except a purchase or a
 * restore. Signing out is offered so a wrong account can be swapped.
 */
export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const { skipToSignIn } = useAppFlow();
  const { packages, packagesError, loadingPackages, reloadPackages, purchase, restore } = useSubscription();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preselect the yearly plan (best value), else the first one.
  useEffect(() => {
    if (selectedId || packages.length === 0) return;
    const preferred = packages.find((pkg) => pkg.packageType === PACKAGE_TYPE.ANNUAL) ?? packages[0];
    setSelectedId(preferred.identifier);
  }, [packages, selectedId]);

  const selected = packages.find((pkg) => pkg.identifier === selectedId);
  const trial = selected?.product.introPrice;

  const run = async (action: () => Promise<boolean>, emptyMessage?: string) => {
    setBusy(true);
    setError(null);
    try {
      const unlocked = await action();
      if (!unlocked && emptyMessage) setError(emptyMessage);
      if (unlocked) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (cause) {
      setError(errorMessage(cause, "Something went wrong. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: adaptiveColors.canvas, paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.xxl, gap: spacing.xl }} showsVerticalScrollIndicator={false}>
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 34, lineHeight: 39, fontWeight: "800", letterSpacing: -1.1, color: adaptiveColors.label }}>Unlock Alta</Text>
          <Text style={{ fontSize: 16, lineHeight: 22, color: adaptiveColors.secondaryLabel }}>Your personal stylist, working with the clothes you already own.</Text>
        </View>

        <View style={{ gap: 12 }}>
          {BENEFITS.map((benefit) => (
            <View key={benefit} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: adaptiveColors.label }}>
                <SymbolView name="checkmark" tintColor={adaptiveColors.onAccent} style={{ width: 12, height: 12 }} />
              </View>
              <Text style={{ flex: 1, fontSize: 15, fontWeight: "600", color: adaptiveColors.label }}>{benefit}</Text>
            </View>
          ))}
        </View>

        {loadingPackages && packages.length === 0 ? <ActivityIndicator color={adaptiveColors.secondaryLabel} style={{ paddingVertical: 24 }} /> : null}
        {packagesError && packages.length === 0 ? <ErrorNotice kind="unreachable" title="Can't load plans" message={packagesError} onRetry={reloadPackages} /> : null}

        <View style={{ gap: spacing.sm }}>
          {packages.map((pkg) => {
            const active = pkg.identifier === selectedId;
            const best = pkg.packageType === PACKAGE_TYPE.ANNUAL;
            return (
              <Pressable
                key={pkg.identifier}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                onPress={() => { Haptics.selectionAsync(); setSelectedId(pkg.identifier); }}
                style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 20, borderCurve: "continuous", borderWidth: active ? 2 : 1, borderColor: active ? adaptiveColors.label : adaptiveColors.border, backgroundColor: adaptiveColors.surfaceRaised }}
              >
                <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: active ? adaptiveColors.label : adaptiveColors.border, backgroundColor: active ? adaptiveColors.label : "transparent" }}>
                  {active ? <SymbolView name="checkmark" tintColor={adaptiveColors.onAccent} style={{ width: 10, height: 10 }} /> : null}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: adaptiveColors.label }}>{periodLabel(pkg)}</Text>
                    {best ? (
                      <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: adaptiveColors.accentSoft }}>
                        <Text style={{ fontSize: 10, fontWeight: "800", letterSpacing: 0.4, color: adaptiveColors.accent }}>BEST VALUE</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={{ fontSize: 13, color: adaptiveColors.secondaryLabel }}>{priceNote(pkg)}</Text>
                </View>
                <Text style={{ fontSize: 17, fontWeight: "800", color: adaptiveColors.label }}>{pkg.product.priceString}</Text>
              </Pressable>
            );
          })}
        </View>

        {error ? <ErrorNotice title="Couldn't complete that" message={error} /> : null}
      </ScrollView>

      <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: Math.max(insets.bottom, spacing.lg), gap: spacing.sm, borderTopWidth: 1, borderTopColor: adaptiveColors.separator, backgroundColor: adaptiveColors.canvas }}>
        <Button disabled={!selected} loading={busy} onPress={() => selected && void run(() => purchase(selected))}>{trial ? "Start free trial" : "Continue"}</Button>
        <Text style={{ fontSize: 12, lineHeight: 16, textAlign: "center", color: adaptiveColors.tertiaryLabel }}>
          {selected ? `${trial ? "Then " : ""}${selected.product.priceString} ${priceNote(selected).replace(/^.* \/ /, "per ")}. ` : ""}Cancel anytime in Settings.
        </Text>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 18 }}>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void run(restore, "We couldn't find an active subscription for this account.")} hitSlop={8}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: adaptiveColors.secondaryLabel }}>Restore</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => TERMS_URL && Linking.openURL(TERMS_URL)} hitSlop={8}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: adaptiveColors.secondaryLabel }}>Terms</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => PRIVACY_URL && Linking.openURL(PRIVACY_URL)} hitSlop={8}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: adaptiveColors.secondaryLabel }}>Privacy</Text>
          </Pressable>
          {user ? (
            <Pressable accessibilityRole="button" onPress={() => void signOut()} hitSlop={8}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: adaptiveColors.secondaryLabel }}>Sign out</Text>
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" onPress={skipToSignIn} hitSlop={8}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: adaptiveColors.secondaryLabel }}>Sign in</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}
