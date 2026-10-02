import assert from "node:assert";

console.log("=================================================");
console.log("Running Ek-Ambulance Patient Env Config Tests");
console.log("=================================================\n");

console.log("Test 1: Validating missingEnvKeys() reports all 4 keys when none are set...");
process.env.EXPO_PUBLIC_SUPABASE_URL = "";
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "";
process.env.EXPO_PUBLIC_GATEWAY_URL = "";
process.env.EXPO_PUBLIC_CENTRIFUGO_WS_URL = "";
const { missingEnvKeys: missingAllUnset } = await import(`./env.ts?t=${Date.now()}A`);
assert.deepStrictEqual(
  missingAllUnset(),
  ["supabaseUrl", "supabaseAnonKey", "gatewayUrl", "centrifugoWsUrl"],
  "All 4 required keys reported missing when every EXPO_PUBLIC_* var is empty"
);
console.log("✓ All 4 required keys correctly reported missing.\n");

console.log("Test 2: Validating missingEnvKeys() is empty once every var is set...");
process.env.EXPO_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
process.env.EXPO_PUBLIC_GATEWAY_URL = "https://api.example.in";
process.env.EXPO_PUBLIC_CENTRIFUGO_WS_URL = "wss://realtime.example.in/connection/websocket";
const { missingEnvKeys: missingAllSet } = await import(`./env.ts?t=${Date.now()}B`);
assert.deepStrictEqual(missingAllSet(), [], "No missing keys once every EXPO_PUBLIC_* var is populated");
console.log("✓ No keys reported missing once all 4 vars are set.\n");

console.log("Test 3: Validating a partially-configured environment reports only the gaps...");
process.env.EXPO_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "";
process.env.EXPO_PUBLIC_GATEWAY_URL = "https://api.example.in";
process.env.EXPO_PUBLIC_CENTRIFUGO_WS_URL = "";
const { missingEnvKeys: missingPartial } = await import(`./env.ts?t=${Date.now()}C`);
assert.deepStrictEqual(
  missingPartial(),
  ["supabaseAnonKey", "centrifugoWsUrl"],
  "Only the actually-empty keys are reported, not the ones already set"
);
console.log("✓ Partial configuration reports exactly the missing keys.\n");

console.log("Test 4: The Supabase client URL is EXPO_PUBLIC_SUPABASE_URL, never a localhost fallback...");
process.env.EXPO_PUBLIC_SUPABASE_URL = "https://nzwbwuhbtqhhjwnopwmm.supabase.co";
const { SUPABASE_URL: hostedUrl } = await import(`./env.ts?t=${Date.now()}D`);
assert.strictEqual(hostedUrl, "https://nzwbwuhbtqhhjwnopwmm.supabase.co");
process.env.EXPO_PUBLIC_SUPABASE_URL = "";
const { SUPABASE_URL: unsetUrl } = await import(`./env.ts?t=${Date.now()}E`);
assert.ok(unsetUrl.startsWith("https://") && !/localhost|127\.0\.0\.1|10\.0\.2\.2/.test(unsetUrl), "unset URL fails loudly, not localhost");
console.log("✓ Hosted URL used as-is; unset URL is a non-localhost placeholder.\n");

console.log("=================================================");
console.log("ALL PATIENT ENV CONFIG TESTS PASSED (100% GREEN)");
console.log("=================================================");
