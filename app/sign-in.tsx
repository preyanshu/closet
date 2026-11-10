import { ErrorNotice } from "@/components/error-notice";
import { adaptiveColors, spacing, Button, FormField } from "@/components/ui";
import { errorMessage } from "@/services/api/wardrobe-api";
import { PRIVACY_URL, TERMS_URL, appleSignInEnabled, authConfigured } from "@/services/config";
import { useAuth } from "@/state/auth-context";
import * as AppleAuthentication from "expo-apple-authentication";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** The account step: email and password (and Sign in with Apple once it's set up). Your closet saves to this account. */
export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const { signInWithApple, continueWithEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause, "Couldn't sign in. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    if (!email.trim() || !password) {
      setError("Enter your email and a password.");
      return;
    }
    void run(() => continueWithEmail(email, password));
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: adaptiveColors.canvas }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + spacing.xl, paddingBottom: Math.max(insets.bottom, spacing.lg), paddingHorizontal: spacing.xl, gap: spacing.xl }}
      >
        <View style={{ flex: 1, justifyContent: "center", gap: spacing.xl }}>
          <View style={{ width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: adaptiveColors.label }}>
            <SymbolView name="sparkles" tintColor={adaptiveColors.onAccent} style={{ width: 28, height: 28 }} />
          </View>
          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: 34, lineHeight: 39, fontWeight: "800", letterSpacing: -1.1, color: adaptiveColors.label }}>Save your closet</Text>
            <Text style={{ fontSize: 16, lineHeight: 22, color: adaptiveColors.secondaryLabel }}>
              Last step: enter your email and a password. We'll create your account, or sign you in if you already have one, and your closet saves to it. Your subscription comes with you.
            </Text>
          </View>

          <View style={{ gap: spacing.md }}>
            <FormField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" autoComplete="email" returnKeyType="next" />
            <FormField label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" textContentType="password" autoComplete="current-password" returnKeyType="go" onSubmitEditing={submit} />
          </View>

          {error ? <ErrorNotice title="Couldn't continue" message={error} /> : null}
          {!authConfigured ? <ErrorNotice title="Sign-in isn't available" message="This build isn't set up for accounts yet. Please update the app and try again." /> : null}
        </View>

        <View style={{ gap: spacing.md }}>
          <Button onPress={submit} loading={busy}>Continue</Button>

          {appleSignInEnabled ? (
            <View style={{ opacity: busy ? 0.5 : 1 }} pointerEvents={busy ? "none" : "auto"}>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={26}
                style={{ height: 52, width: "100%" }}
                onPress={() => void run(signInWithApple)}
              />
            </View>
          ) : null}

          <Text style={{ fontSize: 12, lineHeight: 17, textAlign: "center", color: adaptiveColors.tertiaryLabel }}>
            By continuing you agree to our{" "}
            <Text onPress={TERMS_URL ? () => Linking.openURL(TERMS_URL) : undefined} style={{ fontWeight: "700", color: adaptiveColors.secondaryLabel }}>Terms</Text>
            {" "}and{" "}
            <Text onPress={PRIVACY_URL ? () => Linking.openURL(PRIVACY_URL) : undefined} style={{ fontWeight: "700", color: adaptiveColors.secondaryLabel }}>Privacy Policy</Text>.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
