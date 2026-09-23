import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { createClient, type SupportedStorage } from "@supabase/supabase-js";

// Routed through the Kong API gateway, never the raw Supabase project URL -
// Kong proxies GoTrue's /auth/v1/* paths, same contract useOtpAuth.ts targets.
const GATEWAY_URL =
  process.env.EXPO_PUBLIC_GATEWAY_URL || "https://api.sahayak.in";

// No anon key provisioned yet for Kong's GoTrue proxy - named placeholder,
// not silently blank.
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "unconfigured-anon-key";

// SecureStore has no web implementation, and calling it during bundle
// evaluation (before any native bridge exists) can throw - fall back to an
// in-memory map in both cases rather than letting client construction throw.
function createSecureStorageAdapter(): SupportedStorage {
  const memoryFallback = new Map<string, string>();
  const nativeAvailable = Platform.OS !== "web";

  return {
    getItem: async (key: string) => {
      if (!nativeAvailable) return memoryFallback.get(key) ?? null;
      try {
        return await SecureStore.getItemAsync(key);
      } catch {
        return memoryFallback.get(key) ?? null;
      }
    },
    setItem: async (key: string, value: string) => {
      if (!nativeAvailable) {
        memoryFallback.set(key, value);
        return;
      }
      try {
        await SecureStore.setItemAsync(key, value);
      } catch {
        memoryFallback.set(key, value);
      }
    },
    removeItem: async (key: string) => {
      if (!nativeAvailable) {
        memoryFallback.delete(key);
        return;
      }
      try {
        await SecureStore.deleteItemAsync(key);
      } catch {
        memoryFallback.delete(key);
      }
    },
  };
}

export const supabase = createClient(GATEWAY_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: createSecureStorageAdapter(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
