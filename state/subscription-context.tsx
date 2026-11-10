import { WardrobeApiError, describeError } from "@/services/api/wardrobe-api";
import { ENTITLEMENT_ID, OFFERING_ID, REVENUECAT_API_KEY, paywallConfigured, paywallEnforced } from "@/services/config";
import { useAuth } from "@/state/auth-context";
import { createContext, type PropsWithChildren, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import Purchases, { LOG_LEVEL, type CustomerInfo, type PurchasesPackage } from "react-native-purchases";

export type SubscriptionStatus = "loading" | "inactive" | "active";

type SubscriptionContextValue = {
  status: SubscriptionStatus;
  /** True when the paywall doesn't apply (a development build without RevenueCat keys). */
  bypassed: boolean;
  packages: PurchasesPackage[];
  packagesError?: string;
  loadingPackages: boolean;
  reloadPackages: () => void;
  /** Resolves true when the purchase unlocked the app, false when the user cancelled. */
  purchase: (pkg: PurchasesPackage) => Promise<boolean>;
  restore: () => Promise<boolean>;
};

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

let purchasesConfigured = false;

const isActive = (info: CustomerInfo) => Boolean(info.entitlements.active[ENTITLEMENT_ID]);

export function SubscriptionProvider({ children }: PropsWithChildren) {
  const { user, status: authStatus } = useAuth();
  const [status, setStatus] = useState<SubscriptionStatus>(paywallEnforced ? "loading" : "active");
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [packagesError, setPackagesError] = useState<string | undefined>();
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const configuredRef = useRef(false);

  // Configure once, then tie purchases to the signed-in account so they follow it across devices.
  useEffect(() => {
    if (!paywallConfigured || Platform.OS === "web") return;
    if (!purchasesConfigured) {
      if (__DEV__) void Purchases.setLogLevel(LOG_LEVEL.WARN);
      Purchases.configure({ apiKey: REVENUECAT_API_KEY, appUserID: user?.id ?? null });
      purchasesConfigured = true;
    }
    configuredRef.current = true;
    const listener = (info: CustomerInfo) => setStatus(isActive(info) ? "active" : "inactive");
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => { Purchases.removeCustomerInfoUpdateListener(listener); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!paywallConfigured || Platform.OS === "web" || !configuredRef.current || authStatus === "loading") return;
    let cancelled = false;
    const sync = async () => {
      try {
        let info: CustomerInfo;
        if (user) info = (await Purchases.logIn(user.id)).customerInfo;
        else {
          // Signed out: drop the previous account's purchases so they can't unlock another.
          try { info = await Purchases.logOut(); } catch { info = await Purchases.getCustomerInfo(); }
        }
        if (!cancelled) setStatus(isActive(info) ? "active" : "inactive");
      } catch {
        if (!cancelled) setStatus("inactive");
      }
    };
    void sync();
    return () => { cancelled = true; };
  }, [user?.id, authStatus]);

  useEffect(() => {
    if (!paywallConfigured || Platform.OS === "web" || !configuredRef.current || status === "active") return;
    let cancelled = false;
    setLoadingPackages(true);
    setPackagesError(undefined);
    Purchases.getOfferings()
      .then((offerings) => {
        if (cancelled) return;
        // A shared RevenueCat project can have other apps' offerings; pick ours by id when one is set.
        const offering = (OFFERING_ID ? offerings.all[OFFERING_ID] : undefined) ?? offerings.current;
        const available = offering?.availablePackages ?? [];
        setPackages(available);
        if (available.length === 0) setPackagesError("Plans aren't available right now. Try again in a moment.");
      })
      .catch(() => { if (!cancelled) setPackagesError("Couldn't load plans. Check your connection and try again."); })
      .finally(() => { if (!cancelled) setLoadingPackages(false); });
    return () => { cancelled = true; };
  }, [status, reloadTick]);

  const purchase = useCallback(async (pkg: PurchasesPackage) => {
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const active = isActive(customerInfo);
      setStatus(active ? "active" : "inactive");
      return active;
    } catch (error) {
      if ((error as { userCancelled?: boolean })?.userCancelled) return false;
      throw new WardrobeApiError("The purchase didn't go through. You haven't been charged. Try again.", "server", describeError(error));
    }
  }, []);

  const restore = useCallback(async () => {
    try {
      const info = await Purchases.restorePurchases();
      const active = isActive(info);
      setStatus(active ? "active" : "inactive");
      return active;
    } catch (error) {
      throw new WardrobeApiError("Couldn't restore purchases. Check your connection and try again.", "unreachable", describeError(error));
    }
  }, []);

  const value = useMemo<SubscriptionContextValue>(
    () => ({ status, bypassed: !paywallEnforced, packages, packagesError, loadingPackages, reloadPackages: () => setReloadTick((tick) => tick + 1), purchase, restore }),
    [status, packages, packagesError, loadingPackages, purchase, restore],
  );
  return <SubscriptionContext value={value}>{children}</SubscriptionContext>;
}

export function useSubscription() {
  const context = use(SubscriptionContext);
  if (!context) throw new Error("useSubscription must be used inside SubscriptionProvider");
  return context;
}
