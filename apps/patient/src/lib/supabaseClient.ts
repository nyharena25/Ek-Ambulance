import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { createClient, type SupportedStorage } from "@supabase/supabase-js";

/**
 * Persistent Supabase client for the patient app, per Task 4.1.
 *
 * Routed through the Kong API gateway, NOT a raw Supabase project URL -
 * this is an explicit non-goal in docs/prompts/patient-app/P03-otp-authentication-flow.md
 * ("Do not call the Supabase project URL directly; all requests must route
 * through the Kong API gateway"). Kong proxies the same GoTrue /auth/v1/*
 * paths useOtpAuth.ts already targets, so pointing the SDK's `supabaseUrl`
 * at the gateway satisfies both P03's routing constraint and this task's
 * ask for the real SDK (session auto-refresh, secure persistent storage) -
 * the two are not actually in conflict once the base URL is the gateway.
 */
const GATEWAY_URL =
  process.env.EXPO_PUBLIC_GATEWAY_URL || "http://localhost:8000"; // adb reverse tcp:8000 (pnpm adb:reverse) makes this reach the host

/**
 * No real anon/publishable key exists yet - Kong's GoTrue proxy issues its
 * own, and none has been provisioned. Placeholder, same pattern as Step 5's
 * `patientId: "PAT-DEMO-0001"`: named, documented, not silently blank.
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

export const supabase = createClient(GATEWAY_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No OAuth/magic-link deep-linking in this app (P03 non-goal: OAuth is
    // out of scope) - nothing to detect in a URL.
    detectSessionInUrl: false,
  },
});
