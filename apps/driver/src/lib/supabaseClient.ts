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

// The project's anon (publishable) key; a named placeholder when unset, not silently blank.
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

export const authStorage = createSecureStorageAdapter();

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Session refresh (Supabase's React Native lifecycle): auth-js refreshes the access token on a 30 s ticker, which the OS
// suspends with the app's timers in the background. Back in the foreground, restart it: it checks immediately, so an
// access token that expired meanwhile is refreshed before anything uses it (a success emits TOKEN_REFRESHED). Never
// stopped on background: during a mission the process stays alive behind Google Maps, and its uploads and realtime
// token requests need the refresh to keep running.
AppState.addEventListener("change", (state) => {
  if (state === "active") void supabase.auth.startAutoRefresh();
});
