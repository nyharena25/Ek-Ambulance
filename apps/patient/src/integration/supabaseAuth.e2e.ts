import assert from "node:assert";
import { createClient, type SupabaseClient, type SupportedStorage } from "@supabase/supabase-js";
import { isUuid } from "@sahayak/domain";
import { mapAuthError } from "../hooks/otpAuth.core.ts";
import { buildCreateMissionParams, mapRpcError, parseCreateMissionResult } from "../lib/missionApi.core.ts";
import { authRedirectTarget, verifiedDriverSession } from "../../../driver/src/hooks/otpAuth.core.ts";

/**
 * End-to-end check of the REAL Supabase phone-OTP path both apps use, against a Supabase Auth instance that has
 * Supabase Test Phone Numbers configured. Nothing here accepts an OTP: GoTrue does. Not part of `pnpm test` (needs a
 * running stack), same as supabase/tests/*.behaviour.sql.
 *
 * Local stack (supabase/config.toml, local only - never `supabase config push` this):
 *   [auth.sms]            enable_signup = true
 *   [auth.sms.twilio]     enabled = true  (any placeholder sid; test numbers never send an SMS)
 *   [auth.sms.test_otp]   <patient number> = "<otp>", <driver number> = "<otp>"
 * Hosted project: Authentication > Sign In / Providers > Phone enabled, with the same Test Phone Numbers.
 *
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... TEST_PHONE_PATIENT=+91... TEST_PHONE_DRIVER=+91... TEST_OTP=... \
 *   [SUPABASE_SERVICE_ROLE_KEY=... local only: promotes the driver number the way staff do] \
 *   node --experimental-strip-types apps/patient/src/integration/supabaseAuth.e2e.ts
 * Without the service key the driver number must already have app_metadata.role = "driver".
 */

const env = (k: string, required = true): string => {
  const v = process.env[k];
  if (required && !v) throw new Error(`set ${k} (see the header of this file)`);
  return v ?? "";
};
const URL_ = env("SUPABASE_URL");
const ANON = env("SUPABASE_ANON_KEY");
const PATIENT_PHONE = env("TEST_PHONE_PATIENT");
const DRIVER_PHONE = env("TEST_PHONE_DRIVER");
const OTP = env("TEST_OTP");
const SERVICE = env("SUPABASE_SERVICE_ROLE_KEY", false);
// A code that is guaranteed not to be the configured one (same length).
const WRONG_OTP = OTP.replace(/^./, (d) => String((Number(d) + 1) % 10));

/** Same shape as the apps' SecureStore adapter, in memory: two clients on one store = an app restart. */
function memoryStorage(): SupportedStorage {
  const m = new Map<string, string>();
  return { getItem: async (k) => m.get(k) ?? null, setItem: async (k, v) => void m.set(k, v), removeItem: async (k) => void m.delete(k) };
}
// Same auth options as apps/*/src/lib/supabaseClient.ts (auto-refresh off only so the script can exit).
const client = (storage: SupportedStorage): SupabaseClient =>
  createClient(URL_, ANON, { auth: { storage, autoRefreshToken: false, persistSession: true, detectSessionInUrl: false } });

// Same calls and options as apps/*/src/hooks/useOtpAuth.ts. A resend inside Supabase's max_frequency window is refused
// with 429; like the apps' cooldown UI, wait the server-stated seconds (parsed by the app's own mapAuthError) and retry once.
async function requestOtp(c: SupabaseClient, phone: string) {
  const send = () => c.auth.signInWithOtp({ phone, options: { channel: "sms", shouldCreateUser: true } });
  const first = await send();
  if (!first.error) return first;
  const mapped = mapAuthError(first.error, false);
  if (!mapped.isRateLimited || !mapped.cooldownSeconds) return first;
  await new Promise((r) => setTimeout(r, (mapped.cooldownSeconds! + 1) * 1000));
  return send();
}
async function verifyOtp(c: SupabaseClient, phone: string, token: string) {
  return c.auth.verifyOtp({ phone, token, type: "sms" });
}

console.log("1. OTP request goes to Supabase Auth...");
const storage = memoryStorage();
const patient = client(storage);
const req = await requestOtp(patient, PATIENT_PHONE);
assert.strictEqual(req.error, null, `OTP request refused: ${req.error?.message}`);
console.log(`✓ accepted (messageId ${req.data.messageId ?? "n/a"})\n`);

console.log("2. A wrong code is rejected by Supabase and shown as invalid_otp...");
const wrong = await verifyOtp(patient, PATIENT_PHONE, WRONG_OTP);
assert.ok(wrong.error && !wrong.data.session, "no session for a wrong code");
assert.strictEqual(mapAuthError(wrong.error, true).error, "invalid_otp");
assert.strictEqual((await patient.auth.getSession()).data.session, null, "nothing stored after a failed verify");
console.log(`✓ ${wrong.error.status} ${wrong.error.code}\n`);

console.log("3. The configured Test OTP creates a real Supabase session...");
const ok = await verifyOtp(patient, PATIENT_PHONE, OTP);
assert.strictEqual(ok.error, null, ok.error?.message);
const session = ok.data.session!;
assert.ok(isUuid(session.user.id) && session.access_token && session.refresh_token, "UUID user + tokens (patientAuth realAccessToken rule)");
console.log(`✓ user ${session.user.id}\n`);

console.log("4. Profile provisioned server-side (handle_new_user) and readable under RLS...");
const profile = await patient.from("profiles").select("id,role").eq("id", session.user.id).single();
assert.strictEqual(profile.error, null, profile.error?.message);
assert.deepStrictEqual(profile.data, { id: session.user.id, role: "patient" });
console.log("✓ role patient\n");

console.log("5. The session authenticates a real backend call (create_mission at AIIMS Delhi)...");
const created = await patient.rpc(
  "create_mission",
  buildCreateMissionParams({
    idempotencyKey: crypto.randomUUID(),
    pickup: { latitude: 28.5672, longitude: 77.21 },
    vehicleType: "TYPE_D_ALS",
    urgency: "CAT_1_IMMEDIATE",
    triage: { engine_version: "e2e" },
    distanceKm: 8.4,
  })
);
assert.strictEqual(created.error, null, created.error?.message);
assert.strictEqual(parseCreateMissionResult(created.data)?.jurisdiction, "DL");
const missionId = parseCreateMissionResult(created.data)!.missionId;
console.log(`✓ mission ${missionId}\n`);

console.log("6. Restart: a new client on the same storage restores the session; refresh yields a working token...");
const restarted = client(storage);
const restored = (await restarted.auth.getSession()).data.session;
assert.strictEqual(restored?.user.id, session.user.id, "session survives the restart");
const refreshed = await restarted.auth.refreshSession();
assert.strictEqual(refreshed.error, null, refreshed.error?.message);
assert.notStrictEqual(refreshed.data.session!.access_token, session.access_token, "a new access token");
const again = await restarted.from("missions").select("id").eq("id", missionId);
assert.deepStrictEqual(again.data, [{ id: missionId }], "refreshed token reads the patient's own mission");
console.log("✓ restored + refreshed\n");

console.log("7. No session: the backend refuses...");
const anon = await client(memoryStorage()).rpc("create_mission", { p_idempotency_key: crypto.randomUUID(), p_pickup_lat: 28.5672, p_pickup_lng: 77.21, p_vehicle_type: "TYPE_D_ALS", p_urgency: "CAT_1_IMMEDIATE", p_triage: {}, p_distance_km: 1 });
assert.ok(anon.error, "anon cannot create a mission");
console.log(`✓ ${anon.error.code} ${mapRpcError(anon.error).code}\n`);

console.log("8. A patient account signing in to the DRIVER app is not a driver (client gate + server)...");
const inDriverApp = client(memoryStorage());
assert.strictEqual((await requestOtp(inDriverApp, PATIENT_PHONE)).error, null);
const pv = await verifyOtp(inDriverApp, PATIENT_PHONE, OTP);
assert.strictEqual(pv.error, null, pv.error?.message);
assert.strictEqual(verifiedDriverSession(pv.data.session), null, "driver app refuses the session");
const asDriver = await inDriverApp.rpc("upsert_driver_application", { p_fields: {} });
assert.strictEqual(mapRpcError(asDriver.error).code, "not_a_driver", "server refuses it too");
console.log("✓ not_a_driver\n");

console.log("9. A driver number (app_metadata.role = driver, set server-side only) passes both checks...");
const driverApp = client(memoryStorage());
assert.strictEqual((await requestOtp(driverApp, DRIVER_PHONE)).error, null);
let dv = await verifyOtp(driverApp, DRIVER_PHONE, OTP);
assert.strictEqual(dv.error, null, dv.error?.message);
if (SERVICE && !verifiedDriverSession(dv.data.session)) {
  // Staff action (never client code): grant the role, then the driver signs in again.
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const grant = await admin.auth.admin.updateUserById(dv.data.session!.user.id, { app_metadata: { role: "driver" } });
  assert.strictEqual(grant.error, null, grant.error?.message);
  assert.strictEqual((await requestOtp(driverApp, DRIVER_PHONE)).error, null);
  dv = await verifyOtp(driverApp, DRIVER_PHONE, OTP);
}
const driver = verifiedDriverSession(dv.data.session);
assert.ok(driver, "driver number has app_metadata.role = driver");
const driverProfile = await driverApp.from("profiles").select("role").eq("id", driver.userId).single();
assert.strictEqual(driverProfile.data?.role, "driver", "profile role follows app_metadata");
const drvCall = await driverApp.rpc("upsert_driver_application", { p_fields: {} });
assert.notStrictEqual(mapRpcError(drvCall.error).code, "not_a_driver", "driver RPCs accept the driver");
const drvBook = await driverApp.rpc("create_mission", buildCreateMissionParams({ idempotencyKey: crypto.randomUUID(), pickup: { latitude: 28.5672, longitude: 77.21 }, vehicleType: "TYPE_D_ALS", urgency: "CAT_1_IMMEDIATE", triage: {}, distanceKm: 1 }));
assert.strictEqual(mapRpcError(drvBook.error).code, "not_a_patient", "a driver cannot book as a patient");
console.log("✓ driver\n");

console.log("10. Patient sign-out: session cleared, booking refused, another account can sign in on the same device...");
await restarted.auth.signOut();
assert.strictEqual((await client(storage).auth.getSession()).data.session, null, "stored session removed by the SDK");
const afterOut = await restarted.rpc("create_mission", buildCreateMissionParams({ idempotencyKey: crypto.randomUUID(), pickup: { latitude: 28.5672, longitude: 77.21 }, vehicleType: "TYPE_D_ALS", urgency: "CAT_1_IMMEDIATE", triage: {}, distanceKm: 1 }));
assert.ok(afterOut.error, "booking is unavailable after sign-out");
const oldToken = await client(memoryStorage()).auth.getUser(session.access_token);
assert.ok(oldToken.error, "the signed-out access token is no longer accepted by Supabase Auth");
const switched = client(storage);
assert.strictEqual((await requestOtp(switched, DRIVER_PHONE)).error, null);
const sw = await verifyOtp(switched, DRIVER_PHONE, OTP);
assert.ok(sw.data.session && sw.data.session.user.id !== session.user.id, "a different account signs in on the same storage");
console.log("✓ patient signed out, account switched\n");

console.log("11. Driver sign-out: session cleared, the driver gate reads signed-out, driver RPCs refused...");
await driverApp.auth.signOut();
const gone = (await driverApp.auth.getSession()).data.session;
assert.strictEqual(verifiedDriverSession(gone), null);
assert.strictEqual(authRedirectTarget("signedOut", "(shift)"), "/(auth)/phone-entry", "shift screens send the signed-out driver to phone entry");
const drvAfter = await driverApp.rpc("upsert_driver_application", { p_fields: {} });
assert.ok(drvAfter.error, "driver RPCs refuse a signed-out client");
console.log("✓ driver signed out\n");

console.log("SUPABASE TEST-PHONE AUTH E2E PASSED");
