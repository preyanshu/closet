import { WardrobeApiError, describeError } from "@/services/api/wardrobe-api";
import { supabase } from "@/services/supabase";
import type { Session, User } from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { createContext, type PropsWithChildren, use, useCallback, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";

export type AuthStatus = "loading" | "signedOut" | "signedIn";

type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  /** Runs the native Apple sheet, then signs in to Supabase. Resolves quietly if the user cancels. */
  signInWithApple: () => Promise<void>;
  /** Email + password. `signUp` creates the account (and signs in unless the project requires email confirmation). */
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  /** One button for everyone: signs in if the account exists, otherwise creates it. */
  continueWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>(supabase ? "loading" : "signedOut");

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setStatus(data.session ? "signedIn" : "signedOut");
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setStatus(next ? "signedIn" : "signedOut");
    });
    // Only refresh tokens while the app is in the foreground.
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void supabase!.auth.startAutoRefresh();
      else void supabase!.auth.stopAutoRefresh();
    });
    void supabase.auth.startAutoRefresh();
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
      appState.remove();
      void supabase!.auth.stopAutoRefresh();
    };
  }, []);

  const signInWithApple = useCallback(async () => {
    if (!supabase) throw new WardrobeApiError("Sign-in isn't available right now.", "not_configured", "Supabase is not configured");
    // Apple gets a hashed nonce; Supabase gets the raw one to verify the token against.
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
    let credential: AppleAuthentication.AppleAuthenticationCredential;
    try {
      credential = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
        nonce: hashedNonce,
      });
    } catch (error) {
      if ((error as { code?: string })?.code === "ERR_REQUEST_CANCELED") return;
      throw new WardrobeApiError("Couldn't sign in with Apple. Try again.", "server", describeError(error));
    }
    if (!credential.identityToken) throw new WardrobeApiError("Couldn't sign in with Apple. Try again.", "bad_response", "Apple returned no identity token");
    const { error } = await supabase.auth.signInWithIdToken({ provider: "apple", token: credential.identityToken, nonce: rawNonce });
    if (error) throw new WardrobeApiError("Couldn't sign in right now. Check your connection and try again.", "unreachable", error.message);
    // Apple only sends the name on the very first sign-in; keep it.
    const name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(" ");
    if (name) void supabase.auth.updateUser({ data: { full_name: name } });
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new WardrobeApiError("Sign-in isn't available right now.", "not_configured", "Supabase is not configured");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (!error) return;
    if (/invalid login credentials/i.test(error.message)) throw new WardrobeApiError("That email and password don't match. Try again.", "server", error.message);
    if (/email not confirmed/i.test(error.message)) throw new WardrobeApiError("Confirm your email first. We sent you a link.", "server", error.message);
    throw new WardrobeApiError("Couldn't sign in. Check your connection and try again.", "unreachable", error.message);
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new WardrobeApiError("Sign-in isn't available right now.", "not_configured", "Supabase is not configured");
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) {
      if (/already registered|already exists/i.test(error.message)) throw new WardrobeApiError("An account with this email already exists. Sign in instead.", "server", error.message);
      if (/password/i.test(error.message)) throw new WardrobeApiError("Choose a longer password (at least 6 characters).", "server", error.message);
      throw new WardrobeApiError("Couldn't create your account. Check your connection and try again.", "unreachable", error.message);
    }
    // With "Confirm email" on, there is no session until they tap the link.
    if (!data.session) throw new WardrobeApiError("Check your email and tap the link to confirm your account, then sign in.", "server", "email confirmation required");
  }, []);

  const continueWithEmail = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new WardrobeApiError("Sign-in isn't available right now.", "not_configured", "Supabase is not configured");
    const address = email.trim();
    const signedIn = await supabase.auth.signInWithPassword({ email: address, password });
    if (!signedIn.error) return;
    if (/email not confirmed/i.test(signedIn.error.message)) throw new WardrobeApiError("Confirm your email first. We sent you a link.", "server", signedIn.error.message);
    if (!/invalid login credentials/i.test(signedIn.error.message)) throw new WardrobeApiError("Couldn't sign in. Check your connection and try again.", "unreachable", signedIn.error.message);

    // Wrong password, or no account yet. Try creating one: if the email is taken, the password was wrong.
    const wrongPassword = new WardrobeApiError("An account with this email exists, but that password doesn't match. Try again.", "server", "wrong password for an existing account");
    const created = await supabase.auth.signUp({ email: address, password });
    if (created.error) {
      if (/already registered|already exists/i.test(created.error.message)) throw wrongPassword;
      if (/password/i.test(created.error.message)) throw new WardrobeApiError("Choose a longer password (at least 6 characters).", "server", created.error.message);
      throw new WardrobeApiError("Couldn't create your account. Check your connection and try again.", "unreachable", created.error.message);
    }
    if (created.data.session) return;
    // No session: either this email already had an account (Supabase hides that when confirmation is on), or a confirmation link was sent.
    if ((created.data.user?.identities ?? []).length === 0) throw wrongPassword;
    throw new WardrobeApiError("Check your email and tap the link to confirm your account, then sign in.", "server", "email confirmation required");
  }, []);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, session, user: session?.user ?? null, signInWithApple, signInWithEmail, signUpWithEmail, continueWithEmail, signOut }),
    [status, session, signInWithApple, signInWithEmail, signUpWithEmail, continueWithEmail, signOut],
  );
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const context = use(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
