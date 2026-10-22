import { AppState, Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { createClient, type SupportedStorage } from "@supabase/supabase-js";
import { SUPABASE_URL } from "../config/env.ts";

/**
 * Auth, REST and Storage go straight to the Supabase project over HTTPS (EXPO_PUBLIC_SUPABASE_URL, the hosted
 * project). This used to be the Kong gateway (EXPO_PUBLIC_GATEWAY_URL), which only exists on the dev machine:
 * 10.0.2.2/localhost/LAN addresses are unreachable from a real phone, so sign-in never reached Supabase. Kong still
 * fronts /realtime/token (see the realtime services).
 */
/**
 * The project's anon (publishable) key comes from EXPO_PUBLIC_SUPABASE_ANON_KEY. Without it the
 * placeholder below is named rather than silently blank; every auth call then fails.
 */
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "unconfigured-anon-key";

/**
 * expo-secure-store-backed storage adapter, per Task 4.1's explicit ask
 * ("persistent secure storage adapter... rather than unencrypted
 * AsyncStorage"). Guards two edge cases where SecureStore is unavailable:
 *  - Web: SecureStore has no web implementation at all.
 *  - Bundle evaluation time: requiring expo-secure-store's native module
 *    before the app has actually mounted (SSR-style static analysis,
 *    Metro's initial module graph walk) can throw before any native
 *    bridge exists. Both fall back to an in-memory Map - sessions won't
 *    persist across an app restart on web/at eval time, but the client
 *    never throws just from being constructed.
 */
function createSecureStorageAdapter(): SupportedStorage {
  const memoryFallback = new Map<string, string>();
  // SecureStore has no web implementation, and calling it during bundle
  // evaluation (before any native bridge exists) can throw - the module
  // import itself is always safe (it's a real installed package Metro
  // resolves normally), only the actual native calls need guarding.
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

export const authStorage = createSecureStorageAdapter();

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No OAuth/magic-link deep-linking in this app (P03 non-goal: OAuth is
    // out of scope) - nothing to detect in a URL.
    detectSessionInUrl: false,
  },
});

// Session refresh (Supabase's React Native lifecycle, as in the driver app): the 30 s refresh ticker is suspended with the
// app's timers in the background, so a resumed app could use an expired access token for its first calls. Back in the
// foreground, restart it: it checks immediately.
AppState.addEventListener("change", (state) => {
  if (state === "active") void supabase.auth.startAutoRefresh();
});
