import { flushNow, getCloudStatus } from "@/services/cloud/cloud-store";
import { authEnforced, paywallEnforced } from "@/services/config";
import { useAuth } from "@/state/auth-context";
import { useCloset } from "@/state/closet-context";
import { useSubscription } from "@/state/subscription-context";
import { createContext, type PropsWithChildren, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";

/**
 * Which screen the app is on, in order: first-run onboarding, the hard paywall, the
 * account step, then the app itself. Each stage unlocks the next; none can be skipped.
 * (Someone who already has an account jumps straight to sign-in; if that account has no
 * subscription they then meet the paywall.)
 * `loadFailed` is the closet failing to load from the cloud (it offers a retry).
 */
export type AppStage = "loading" | "loadFailed" | "onboarding" | "signIn" | "paywall" | "app";

type AppFlowValue = {
  stage: AppStage;
  completeOnboarding: () => void;
  /** "I already have an account": go straight to sign-in without the first-run setup. */
  skipToSignIn: () => void;
};

const AppFlowContext = createContext<AppFlowValue | null>(null);

/** Pick up changes from another device at most this often when returning to the app. */
const FOREGROUND_RELOAD_MS = 2 * 60 * 1000;

export function AppFlowProvider({ children }: PropsWithChildren) {
  const { isHydrated, loadError, onboardingDone, completeOnboarding, reload } = useCloset();
  const { status: authStatus } = useAuth();
  const { status: subscriptionStatus } = useSubscription();
  const [skipped, setSkipped] = useState(false);
  const lastReloadRef = useRef(Date.now());

  const stage = useMemo<AppStage>(() => {
    if (authStatus === "loading") return "loading";
    const paywallStage = (): AppStage | null => {
      if (!paywallEnforced) return null;
      if (subscriptionStatus === "loading") return "loading";
      return subscriptionStatus === "active" ? null : "paywall";
    };

    if (authStatus === "signedIn") {
      if (loadError) return "loadFailed";
      if (!isHydrated) return "loading";
      // The account has no finished onboarding yet (e.g. a new account that skipped it).
      if (!onboardingDone) return "onboarding";
      return paywallStage() ?? "app";
    }

    // Signed out: the usual order for a hard-paywall app. Questions first, then the paywall while the
    // purchase is still tied to an anonymous RevenueCat user, then the account (which takes that
    // purchase over when it signs in).
    if (!isHydrated) return "loading";
    if (skipped) return authEnforced ? "signIn" : paywallStage() ?? "app"; // "I already have an account"
    if (!onboardingDone) return "onboarding";
    const paywall = paywallStage();
    if (paywall) return paywall;
    if (authEnforced) return "signIn";
    return "app";
  }, [authStatus, isHydrated, loadError, onboardingDone, skipped, subscriptionStatus]);

  // Back in the foreground: send anything still waiting to save, and quietly pick up changes from other devices.
  useEffect(() => {
    if (authStatus !== "signedIn") return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void flushNow();
      const idle = getCloudStatus().pending === 0;
      if (idle && Date.now() - lastReloadRef.current > FOREGROUND_RELOAD_MS) {
        lastReloadRef.current = Date.now();
        void reload();
      }
    });
    return () => subscription.remove();
  }, [authStatus, reload]);

  const skipToSignIn = useCallback(() => setSkipped(true), []);
  const value = useMemo<AppFlowValue>(() => ({ stage, completeOnboarding, skipToSignIn }), [stage, completeOnboarding, skipToSignIn]);
  return <AppFlowContext value={value}>{children}</AppFlowContext>;
}

export function useAppFlow() {
  const context = use(AppFlowContext);
  if (!context) throw new Error("useAppFlow must be used inside AppFlowProvider");
  return context;
}
