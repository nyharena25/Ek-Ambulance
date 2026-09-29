/**
 * EXPO_PUBLIC_* vars must be accessed as literal `process.env.EXPO_PUBLIC_X`
 * property reads (not `process.env[name]`) - Expo's Babel plugin only
 * inlines statically-analyzable accesses like these into the native bundle.
 *
 * EXPO_PUBLIC_SUPABASE_URL is validated here but not yet read by
 * src/lib/supabaseClient.ts - that client deliberately routes through
 * EXPO_PUBLIC_GATEWAY_URL instead, same Kong-only routing the patient app
 * uses. Provisioned ahead of whatever eventually needs the raw project
 * URL, not wired into request routing.
 */
export const ENV = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  gatewayUrl: process.env.EXPO_PUBLIC_GATEWAY_URL,
  centrifugoWsUrl: process.env.EXPO_PUBLIC_CENTRIFUGO_WS_URL,
} as const;

/** `__DEV__` doesn't exist under the plain node test runner, so this is the one shared check every
 *  dev-only fallback (mock data, demo IDs) should import rather than re-declaring `typeof __DEV__ ...`. */
export const IS_DEV = typeof __DEV__ === "undefined" || __DEV__;

const REQUIRED_ENV_KEYS = ["supabaseUrl", "supabaseAnonKey", "gatewayUrl", "centrifugoWsUrl"] as const;

/**
 * Returns the required EXPO_PUBLIC_* keys that are missing or empty. Pure -
 * safe to import and call under bare `node` (no __DEV__, no RN globals).
 */
export function missingEnvKeys(): string[] {
  return REQUIRED_ENV_KEYS.filter((key) => !ENV[key]);
}

/**
 * Fails loudly in dev rather than letting the app boot unauthenticated or
 * disconnected, per the Pre-Flight directive. Never throws in production -
 * a missing var there degrades via each module's own existing fallback
 * (e.g. missionChannel.service.ts / driverRealtime.ts's
 * `GATEWAY_URL = ... || "http://localhost:8000"`), not a crash. That
 * fallback is real code reachable in a release build, not dev-only: a
 * release build with a missing EXPO_PUBLIC_GATEWAY_URL silently tries
 * localhost on the user's own phone instead of erroring loudly.
 */
export function assertEnvOrWarn(): void {
  const missing = missingEnvKeys();
  if (missing.length === 0) return;
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    const bar = "=".repeat(60);
    console.error(
      `\n${bar}\n[env] Missing required EXPO_PUBLIC_* variables: ${missing.join(", ")}.\nCopy apps/driver/.env.example to apps/driver/.env and fill them in.\n${bar}\n`
    );
  }
}
