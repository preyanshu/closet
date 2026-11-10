import { SUPABASE_ANON_KEY, SUPABASE_URL, authConfigured } from "@/services/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Session storage in the iOS keychain. A Supabase session is bigger than
 * SecureStore's per-value limit (~2 KB), so it is split into chunks.
 */
const CHUNK_SIZE = 1800;

const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = Number(await SecureStore.getItemAsync(`${key}.n`));
    if (!Number.isFinite(count) || count <= 0) return null;
    const parts: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const part = await SecureStore.getItemAsync(`${key}.${index}`);
      if (part == null) return null;
      parts.push(part);
    }
    return parts.join("");
  },
  async setItem(key: string, value: string): Promise<void> {
    const chunks = value.match(new RegExp(`.{1,${CHUNK_SIZE}}`, "gs")) ?? [""];
    await secureStorage.removeItem(key);
    for (let index = 0; index < chunks.length; index += 1) {
      await SecureStore.setItemAsync(`${key}.${index}`, chunks[index]);
    }
    await SecureStore.setItemAsync(`${key}.n`, String(chunks.length));
  },
  async removeItem(key: string): Promise<void> {
    const count = Number(await SecureStore.getItemAsync(`${key}.n`));
    for (let index = 0; index < (Number.isFinite(count) ? count : 0); index += 1) {
      await SecureStore.deleteItemAsync(`${key}.${index}`);
    }
    await SecureStore.deleteItemAsync(`${key}.n`);
  },
};

/** The shared client, or null when Supabase isn't configured (e.g. a dev build without keys). */
export const supabase: SupabaseClient | null = authConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: Platform.OS === "web" ? undefined : secureStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;
