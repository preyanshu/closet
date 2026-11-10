/**
 * Build-time configuration for the account, subscription and sync services.
 * Everything comes from EXPO_PUBLIC_* env vars (see .env.example). The anon key
 * and the RevenueCat public key are meant to ship in the app; secrets never go here.
 */
import { Platform } from "react-native";

const read = (value: string | undefined) => (value ?? "").trim();

export const SUPABASE_URL = read(process.env.EXPO_PUBLIC_SUPABASE_URL);
export const SUPABASE_ANON_KEY = read(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
const REVENUECAT_IOS_KEY = read(process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY);
const REVENUECAT_ANDROID_KEY = read(process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY);
/**
 * The RevenueCat public key for this platform. A RevenueCat Test Store key (`test_...`) can go in either
 * variable to try purchases without a store account.
 */
export const REVENUECAT_API_KEY = Platform.OS === "android" ? REVENUECAT_ANDROID_KEY || REVENUECAT_IOS_KEY : REVENUECAT_IOS_KEY;
/** The RevenueCat entitlement that unlocks the app. */
/** The RevenueCat offering to show. Leave empty to use the project's current offering. */
export const OFFERING_ID = read(process.env.EXPO_PUBLIC_REVENUECAT_OFFERING);
export const ENTITLEMENT_ID = read(process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT) || "pro";
export const TERMS_URL = read(process.env.EXPO_PUBLIC_TERMS_URL);
export const PRIVACY_URL = read(process.env.EXPO_PUBLIC_PRIVACY_URL);

/** Show the Apple button only once the Apple Developer setup exists (set EXPO_PUBLIC_ENABLE_APPLE_SIGNIN=1). */
export const appleSignInEnabled = read(process.env.EXPO_PUBLIC_ENABLE_APPLE_SIGNIN) === "1";

export const authConfigured = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
const isDev = typeof __DEV__ !== "undefined" && __DEV__;
/** A Test Store key must never ship: outside development it counts as "not configured" (and the paywall then refuses to open the app). */
export const paywallConfigured = REVENUECAT_API_KEY.length > 0 && (!REVENUECAT_API_KEY.startsWith("test_") || isDev);

/**
 * A gate is enforced when its service is configured. In production it is always
 * enforced (a build missing keys shows an error instead of opening the app free),
 * while a development build without keys skips it so the app stays usable.
 */
export const authEnforced = authConfigured || !isDev;
export const paywallEnforced = paywallConfigured || !isDev;
