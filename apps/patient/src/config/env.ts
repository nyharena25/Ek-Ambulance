/**
 * EXPO_PUBLIC_* vars must be accessed as literal `process.env.EXPO_PUBLIC_X`
 * property reads (not `process.env[name]`) - Expo's Babel plugin only
 * inlines statically-analyzable accesses like these into the native bundle.
 *
 * EXPO_PUBLIC_SUPABASE_URL is what src/lib/supabaseClient.ts talks to (Auth, REST, Storage): the hosted
 * project's https URL, or a local `supabase start` URL when deliberately developing against the local stack.
 * EXPO_PUBLIC_GATEWAY_URL (Kong) still carries /realtime/token and /triage/extract.
 */
export const ENV = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  gatewayUrl: process.env.EXPO_PUBLIC_GATEWAY_URL,
  centrifugoWsUrl: process.env.EXPO_PUBLIC_CENTRIFUGO_WS_URL,
} as const;

/** The Supabase URL the app client uses. No localhost fallback: an unset var fails every auth call loudly instead of
 *  silently aiming a phone at itself. */
export const SUPABASE_URL = ENV.supabaseUrl || "https://supabase-url-not-set.invalid";

/** True only under the plain node test runner, where the React Native `__DEV__` global does not exist. A development
 *  build on a phone is NOT this: it must show the same real data as a release build, never demo identities,
 *  coordinates or seeded forms. The one shared check for test-only fallbacks. */
export const IS_TEST_RUNNER = typeof __DEV__ === "undefined";

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
 * (e.g. missionChannel.service.ts's `GATEWAY_URL = ... || "http://localhost:8000"`),
 * not a crash. That fallback is real code reachable in a release build,
 * not dev-only: a release build with a missing EXPO_PUBLIC_GATEWAY_URL
 * silently tries localhost on the user's own phone instead of erroring loudly.
 */
export function assertEnvOrWarn(): void {
  const missing = missingEnvKeys();
  if (missing.length === 0) return;
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    const bar = "=".repeat(60);
    console.error(
      `\n${bar}\n[env] Missing required EXPO_PUBLIC_* variables: ${missing.join(", ")}.\nCopy apps/patient/.env.example to apps/patient/.env and fill them in.\n${bar}\n`
    );
  }
}
