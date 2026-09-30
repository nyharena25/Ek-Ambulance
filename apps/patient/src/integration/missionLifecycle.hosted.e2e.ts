import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { registerHooks } from "node:module";
import { createClient, type SupabaseClient, type SupportedStorage } from "@supabase/supabase-js";
import { isUuid, type DispatchOffer, type ParsedLifecycleMessage } from "@sahayak/domain";
import { mapAuthError } from "../hooks/otpAuth.core.ts";
import { buildCreateMissionParams, parseCreateMissionResult } from "../lib/missionApi.core.ts";
import { verifiedDriverSession } from "../../../driver/src/hooks/otpAuth.core.ts";
import { buildKycDocumentPath, extensionForMimeType, REQUIRED_KYC_SLOTS } from "../../../driver/src/lib/kycSubmission.core.ts";

/**
 * G4.5-C: ONE real hosted mission through the production gateway (Oracle PBL: Caddy -> Kong -> hosted Supabase, token-mint,
 * Centrifugo). Proves hosted mission_events/dispatch triggers -> publish_realtime -> pg_net -> Oracle /api/publish ->
 * Centrifugo -> the apps' own realtime clients. The test never publishes, never inserts a wave, offer or event.
 *
 * PERMANENT HOSTED DATA: a real run leaves one mission, its mission_events and dispatch_waves, and the booking patient
 * account (mission_events is append-only, missions.patient_id is ON DELETE RESTRICT). The mission is ended by the patient's
 * own cancel_mission so it is terminal, and is labelled "G4.5-C E2E TEST" in pickup_address and triage.
 *
 * Identities: patient and driver use the hosted Test Phone Numbers (real OTP verify). The driver's role is granted
 * server-side before sign-in (the staff step). Staff, a second patient and a second driver follow apps/admin/src/kycAdmin.e2e.ts:
 * provisioned with the service key, then a real email+password GoTrue session. The service key is used only for that
 * provisioning and for exact-id cleanup; every business call uses the caller's own session through the gateway.
 *
 *   set -a; . apps/patient/.env.e2e; set +a            # SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, TEST_PHONE_*, TEST_OTP*
 *   G45C_DRY_RUN=1 node --experimental-strip-types apps/patient/src/integration/missionLifecycle.hosted.e2e.ts   # stops before create_mission
 *   G45C_CREATE_PERMANENT_MISSION=1 node --experimental-strip-types apps/patient/src/integration/missionLifecycle.hosted.e2e.ts
 */

const env = (k: string) => process.env[k] || assert.fail(`set ${k} (see the header of this file)`);
const URL_ = env("SUPABASE_URL");
const ANON = env("SUPABASE_ANON_KEY");
const SERVICE = env("SUPABASE_SERVICE_ROLE_KEY");
const PATIENT_PHONE = env("TEST_PHONE_PATIENT");
const DRIVER_PHONE = env("TEST_PHONE_DRIVER");
const OTP = env("TEST_OTP");
const DRIVER_OTP = process.env.TEST_OTP_DRIVER || OTP;
const GATEWAY = process.env.GATEWAY_URL ?? "https://150-230-139-158.sslip.io";
const WS = process.env.CENTRIFUGO_WS_URL ?? "wss://150-230-139-158.sslip.io/connection/websocket";
const DRY = process.env.G45C_DRY_RUN === "1";
assert.ok(DRY || process.env.G45C_CREATE_PERMANENT_MISSION === "1", "set G45C_DRY_RUN=1, or G45C_CREATE_PERMANENT_MISSION=1 for the real run");
assert.strictEqual(new URL(URL_).hostname, "nzwbwuhbtqhhjwnopwmm.supabase.co", "hosted project only");
for (const u of [GATEWAY, WS]) assert.strictEqual(new URL(u).hostname, "150-230-139-158.sslip.io", "Oracle PBL gateway only");

process.env.EXPO_PUBLIC_GATEWAY_URL = GATEWAY;
process.env.EXPO_PUBLIC_CENTRIFUGO_WS_URL = WS;
// driverRealtime.ts imports "../lib/driverServer.core" without an extension (Metro resolves it); do the same here.
registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx);
    } catch (e) {
      if (spec.startsWith(".") && !/\.[cm]?[jt]s$/.test(spec)) return next(`${spec}.ts`, ctx);
      throw e;
    }
  },
});
const { mountMissionChannel, fetchChannelToken, fetchConnectionToken } = await import("../services/missionChannel.service.ts");
const { mountOffersChannel } = await import("../../../driver/src/services/driverRealtime.ts");

const KYC_BUCKET = "driver-kyc-documents";
const LABEL = "G4.5-C E2E TEST - not a real emergency";
// Inside NCT of Delhi (the server decides); the driver's declared presence fix is ~0.9 km north, inside wave 1's 3 km.
const PICKUP = { latitude: 28.5672, longitude: 77.21 };
const DRIVER_FIX = { latitude: 28.5752, longitude: 77.21 };
const tag = randomUUID().slice(0, 6).toUpperCase();

// Service key: provisioning and cleanup only, straight to the project (never through the app gateway).
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const memoryStorage = (): SupportedStorage => {
  const m = new Map<string, string>();
  return { getItem: async (k) => m.get(k) ?? null, setItem: async (k, v) => void m.set(k, v), removeItem: async (k) => void m.delete(k) };
};
// Same auth options as the apps, base URL = the gateway (as apps/*/src/lib/supabaseClient.ts).
const appClient = () => createClient(GATEWAY, ANON, { auth: { storage: memoryStorage(), autoRefreshToken: false, persistSession: true, detectSessionInUrl: false } });

type Actor = { label: string; id: string; db: SupabaseClient; token: string };
const users = new Map<string, string>(); // label -> id, everything this run created
const actors: Actor[] = [];
const uploaded: string[] = [];
const teardowns: Array<() => void> = [];
const out: Record<string, unknown> = { mode: DRY ? "dry-run" : "real" };
const at = () => new Date().toISOString();

async function findUserIdByPhone(phone: string): Promise<string | null> {
  const digits = phone.replace(/\D/g, "");
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((u) => u.phone === digits)?.id ?? null;
}

// Same calls as apps/*/src/hooks/useOtpAuth.ts; one wait-and-retry on the server-stated cooldown, as the apps do.
async function otpSession(label: string, phone: string, otp: string, check?: (s: { access_token: string; user: { id: string; app_metadata?: Record<string, unknown> } }) => void): Promise<Actor> {
  const db = appClient();
  const send = () => db.auth.signInWithOtp({ phone, options: { channel: "sms", shouldCreateUser: true } });
  let req = await send();
  const mapped = req.error ? mapAuthError(req.error, false) : null;
  if (mapped?.isRateLimited && mapped.cooldownSeconds !== undefined) {
    await new Promise((r) => setTimeout(r, (mapped.cooldownSeconds! + 2) * 1000));
    req = await send();
  }
  assert.strictEqual(req.error, null, `A HOSTED_AUTH_FAILURE: OTP request ${req.error?.message}`);
  const v = await db.auth.verifyOtp({ phone, token: otp, type: "sms" });
  assert.strictEqual(v.error, null, `A HOSTED_AUTH_FAILURE: verify ${v.error?.message}`);
  const s = v.data.session!;
  check?.(s);
  users.set(label, s.user.id);
  const a = { label, id: s.user.id, db, token: s.access_token };
  actors.push(a);
  return a;
}

async function passwordSession(label: string, role?: "staff" | "driver"): Promise<Actor> {
  const email = `g45c-${label}-${tag.toLowerCase()}@example.test`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, ...(role ? { app_metadata: { role } } : {}) });
  assert.ifError(error);
  users.set(label, data.user!.id);
  const db = appClient();
  const s = await db.auth.signInWithPassword({ email, password });
  assert.ifError(s.error);
  const a = { label, id: data.user!.id, db, token: s.data.session!.access_token };
  actors.push(a);
  return a;
}

function waitFor<T>(label: string, timeoutMs: number, arm: (resolve: (v: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label}: timed out after ${timeoutMs} ms`)), timeoutMs);
    arm((v) => {
      clearTimeout(t);
      resolve(v);
    });
  });
}

const tokenStatus = async (scope: string, bearer?: string) =>
  (await fetch(`${GATEWAY}/realtime/token`, { method: "POST", headers: { "Content-Type": "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, body: JSON.stringify({ scope }) })).status;

const step = (s: string) => console.log(`\n${s}`);
let failure: unknown;
try {
  // Accounts that already exist for the test numbers are never reused or deleted by a permanent-data run.
  for (const phone of [PATIENT_PHONE, DRIVER_PHONE]) {
    assert.strictEqual(await findUserIdByPhone(phone), null, "a test phone account already exists; refusing to reuse it");
  }

  step("1. Identities");
  const patient = await otpSession("patient", PATIENT_PHONE, OTP);
  const prof = await patient.db.from("profiles").select("id,role").eq("id", patient.id).single();
  assert.deepStrictEqual(prof.data, { id: patient.id, role: "patient" }, "A HOSTED_AUTH_FAILURE: patient profile");
  // Staff step before the driver signs in: the role lives in app_metadata, set only server-side.
  const pre = await admin.auth.admin.createUser({ phone: DRIVER_PHONE, phone_confirm: true, app_metadata: { role: "driver" } });
  assert.ifError(pre.error);
  users.set("driver", pre.data.user!.id);
  const driver = await otpSession("driver", DRIVER_PHONE, DRIVER_OTP, (s) => assert.ok(verifiedDriverSession(s), "A HOSTED_AUTH_FAILURE: driver app gate"));
  const dprof = await driver.db.from("profiles").select("role").eq("id", driver.id).single();
  assert.strictEqual(dprof.data?.role, "driver");
  const staff = await passwordSession("staff", "staff");
  const patient2 = await passwordSession("patient2");
  const driver2 = await passwordSession("driver2", "driver");
  console.log(`✓ patient ${patient.id} (OTP), driver ${driver.id} (OTP, role driver), staff ${staff.id}, patient2 ${patient2.id}, driver2 ${driver2.id}`);

  step("2. KYC through the gateway (driver app path format), staff approval");
  const fields = { licenseNumber: `G45C-${tag}`, ais125Type: "TYPE_C_BLS", dlExpiry: "2031-01-01", emtLevel: "EMT_B" };
  assert.ifError((await driver.db.rpc("upsert_driver_application", { p_fields: fields })).error);
  assert.ifError((await driver.db.from("driver_vehicles").insert({ driver_id: driver.id, registration_number: `G45C${tag}`, ais125_type: "TYPE_C_BLS" })).error);
  for (const slot of REQUIRED_KYC_SLOTS) {
    const path = buildKycDocumentPath(driver.id, slot, extensionForMimeType("application/pdf")!, randomUUID());
    const bytes = new TextEncoder().encode(`%PDF-1.4 ${LABEL} ${slot}`);
    const up = await driver.db.storage.from(KYC_BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: false });
    assert.ifError(up.error);
    uploaded.push(path);
    assert.ifError((await driver.db.from("driver_documents").insert({ driver_id: driver.id, slot, storage_path: path, file_name: `${slot}.pdf`, size_bytes: bytes.byteLength, mime_type: "application/pdf" })).error);
  }
  const submitted = await driver.db.rpc("submit_kyc");
  assert.ifError(submitted.error);
  const approved = await staff.db.rpc("staff_approve_kyc", { p_driver_id: driver.id });
  assert.ifError(approved.error);
  assert.strictEqual(approved.data?.kycStatus, "approved", "B KYC_FAILURE");
  console.log(`✓ ${uploaded.length} objects at {driverId}/{slot}/{uuid}.pdf; ${submitted.data.kycStatus} -> ${approved.data.kycStatus}`);

  step("3. Negative checks B, C (offers channel belongs to its driver)");
  const b = await tokenStatus(`driver:${driver.id}:offers`, patient.token);
  const c = await tokenStatus(`driver:${driver.id}:offers`, driver2.token);
  assert.strictEqual(b, 403, "M AUTHORIZATION_FAILURE: patient got the driver's offers channel");
  assert.strictEqual(c, 403, "M AUTHORIZATION_FAILURE: another driver got the driver's offers channel");
  out.negB = b;
  out.negC = c;
  console.log(`✓ B patient -> ${b}; C driver2 -> ${c}`);

  step("4. Driver subscribes to driver:{id}:offers over Oracle WSS");
  let onOffer: ((o: { offer: DispatchOffer; at: number; iso: string }) => void) | null = null;
  const t4 = performance.now();
  await waitFor<void>("G ORACLE_CONNECTION_FAILURE / H DRIVER_REALTIME_FAILURE (subscribe)", 15_000, (done) => {
    teardowns.push(mountOffersChannel(driver.id, driver.token, {
      onOffer: (offer) => onOffer?.({ offer, at: performance.now(), iso: at() }),
      onRevoked: (r) => console.log(`  driver channel: offer_revoked ${r.offerId} (${r.reason}) at ${at()}`),
      onSubscribed: () => done(),
    }));
  });
  console.log(`✓ subscribed in ${Math.round(performance.now() - t4)} ms`);
  assert.ok((await fetchConnectionToken(patient.token)).length > 0, "patient connection token");
  console.log("✓ patient connection token minted");

  if (DRY) {
    console.log("\nDRY RUN COMPLETE - stopped before create_mission; nothing permanent was created");
  } else {
    step("5. Presence, then ONE real create_mission (patient session, production params/parser)");
    const online = await driver.db.rpc("set_driver_presence", { p_online: true, p_lat: DRIVER_FIX.latitude, p_lng: DRIVER_FIX.longitude });
    assert.ifError(online.error);
    const offerArrived = waitFor<{ offer: DispatchOffer; at: number; iso: string }>("H DRIVER_REALTIME_FAILURE (no offer over Centrifugo)", 15_000, (done) => {
      onOffer = done;
    });
    out.createCalledAt = at();
    const t0 = performance.now();
    const created = await patient.db.rpc("create_mission", buildCreateMissionParams({
      idempotencyKey: randomUUID(), pickup: PICKUP, pickupAddress: LABEL, vehicleType: "TYPE_C_BLS", urgency: "CAT_3_DELAYED",
      triage: { primary_complaint: "g45c_e2e_test", note: LABEL }, distanceKm: 1,
    }));
    out.createMs = Math.round(performance.now() - t0);
    assert.ifError(created.error);
    const mission = parseCreateMissionResult(created.data);
    assert.ok(mission && isUuid(mission.missionId), "D MISSION_CREATION_FAILURE");
    out.missionId = mission.missionId;
    out.jurisdiction = mission.jurisdiction;
    out.initialStatus = mission.status;
    console.log(`✓ mission ${mission.missionId} ${mission.status}, server jurisdiction ${mission.jurisdiction} (${out.createMs} ms)`);

    step("6. Offer over Oracle Centrifugo (first hosted publish)");
    const { offer, at: offerAt, iso } = await offerArrived;
    out.offerId = offer.offerId;
    out.offerIssuedAt = offer.issuedAt;
    out.offerExpiresAt = offer.expiresAt;
    out.offerReceivedAt = iso;
    out.offerLatencyFromCreateMs = Math.round(offerAt - t0);
    assert.strictEqual(offer.missionId, mission.missionId, "F offer references the real mission");
    console.log(`✓ offer ${offer.offerId} wave ${offer.waveNumber} for mission ${offer.missionId}; issued ${offer.issuedAt}, received ${iso} (${out.offerLatencyFromCreateMs} ms after create call)`);

    step("7. Patient subscribes to mission:{id}, then the driver accepts");
    let onLifecycle: ((m: ParsedLifecycleMessage, iso: string, t: number) => void) | null = null;
    await waitFor<void>("L PATIENT_REALTIME_FAILURE (subscribe)", 10_000, (done) => {
      teardowns.push(mountMissionChannel(mission.missionId, patient.token, {
        onStatusChange: () => {},
        onSubscriptionStateChange: (s) => s && done(),
        onTelemetry: () => {},
        onLifecycleEvent: () => {},
        onLifecycleMessage: (m) => onLifecycle?.(m, at(), performance.now()),
        onError: (e) => console.log(`  patient channel error: ${e.message}`),
      }));
    });
    const acceptedEvt = waitFor<{ m: ParsedLifecycleMessage; iso: string; t: number }>("L PATIENT_REALTIME_FAILURE (no DRIVER_ACCEPTED over Centrifugo)", 15_000, (done) => {
      onLifecycle = (m, iso, t) => m.event === "DRIVER_ACCEPTED" && done({ m, iso, t });
    });
    const tA = performance.now();
    const acc = await driver.db.rpc("accept_offer", { p_offer_id: offer.offerId, p_client_event_id: randomUUID() });
    out.acceptMs = Math.round(performance.now() - tA);
    out.acceptedWithinOfferTtl = Date.now() < Date.parse(offer.expiresAt);
    assert.ifError(acc.error);
    assert.strictEqual(acc.data.status, "en_route", "K DRIVER_ACCEPTANCE_FAILURE");
    out.acceptEventId = acc.data.eventId;
    console.log(`✓ accept_offer -> ${acc.data.status} seq ${acc.data.seq} event ${acc.data.eventId} (${out.acceptMs} ms)`);

    step("8. Patient receives DRIVER_ACCEPTED over Oracle Centrifugo (second hosted publish)");
    const { m: msg, iso: recvIso, t: recvT } = await acceptedEvt;
    out.patientEventReceivedAt = recvIso;
    out.patientEventLatencyFromAcceptMs = Math.round(recvT - tA);
    assert.strictEqual(msg.missionId, mission.missionId);
    assert.strictEqual(msg.driverId, driver.id);
    assert.strictEqual(msg.state, "en_route");
    assert.strictEqual(msg.eventId, acc.data.eventId, "realtime event is the event accept_offer persisted");
    assert.strictEqual(msg.seq, acc.data.seq);
    console.log(`✓ ${msg.event} seq ${msg.seq} eventId ${msg.eventId} received ${recvIso} (${out.patientEventLatencyFromAcceptMs} ms after accept call)`);

    step("9. Correlation after receipt (patient RLS reads) and negative check A");
    const ev = await patient.db.from("mission_events").select("id,seq,event_type,to_status,created_at").eq("mission_id", mission.missionId).order("seq");
    assert.ifError(ev.error);
    const persisted = ev.data.find((e) => e.event_type === "DRIVER_ACCEPTED");
    assert.ok(persisted && persisted.id === msg.eventId && persisted.seq === msg.seq, "M persisted DRIVER_ACCEPTED matches the realtime event");
    out.events = ev.data.map((e) => ({ id: e.id, seq: e.seq, type: e.event_type, created_at: e.created_at }));
    const row = await patient.db.from("missions").select("status,driver_id").eq("id", mission.missionId).single();
    assert.deepStrictEqual(row.data, { status: "en_route", driver_id: driver.id });
    await assert.rejects(fetchChannelToken(mission.missionId, patient2.token), /Not authorized/, "M AUTHORIZATION_FAILURE: another patient got mission:{id}");
    out.negA = 403;
    console.log(`✓ events ${ev.data.map((e) => `${e.seq}:${e.event_type}`).join(", ")}; mission en_route with the driver; A patient2 -> 403`);
    console.log("\nG4.5-C CRITICAL REALTIME CHECKS PASSED");

    step("10. Patient cancels (terminal state for the retained audit record)");
    const cancelledEvt = waitFor<{ m: ParsedLifecycleMessage; iso: string }>("cancel event", 15_000, (done) => {
      onLifecycle = (m, iso) => m.event === "MISSION_CANCELLED" && done({ m, iso });
    });
    const cancel = await patient.db.rpc("cancel_mission", { p_mission_id: mission.missionId, p_reason: "other", p_note: LABEL });
    assert.ifError(cancel.error);
    out.cancelEventId = cancel.data.eventId;
    try {
      const c2 = await cancelledEvt;
      out.cancelReceivedAt = c2.iso;
      console.log(`✓ cancelled seq ${cancel.data.seq}; patient received MISSION_CANCELLED ${c2.m.eventId} at ${c2.iso}`);
    } catch (e) {
      console.log(`✓ cancelled seq ${cancel.data.seq}; MISSION_CANCELLED not seen on the channel: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 1500)); // let the offer_revoked publish land on the still-open driver channel
  }

  step("11. Negative check D (no token / signed-out token)");
  const none = await tokenStatus("connect");
  const oldToken = patient2.token;
  await patient2.db.auth.signOut();
  const signedOut = await tokenStatus("connect", oldToken);
  assert.ok([401, 403].includes(none) && [401, 403].includes(signedOut), `M AUTHORIZATION_FAILURE: D none=${none} signedOut=${signedOut}`);
  out.negD = { noToken: none, signedOutToken: signedOut };
  console.log(`✓ D no token -> ${none}; signed-out token -> ${signedOut}`);
} catch (e) {
  failure = e;
}

// Cleanup (always): close realtime, sign out, exact ids. Retained by design: the mission, its events and waves, the patient.
for (const t of teardowns) t();
for (const a of actors) await a.db.auth.signOut().catch(() => {});
const remaining: string[] = [];
if (uploaded.length) {
  const rm = await admin.storage.from(KYC_BUCKET).remove(uploaded);
  if (rm.error) remaining.push(`storage remove failed: ${rm.error.message}`);
}
for (const p of uploaded) {
  const dir = p.slice(0, p.lastIndexOf("/"));
  if ((await admin.storage.from(KYC_BUCKET).list(dir)).data?.some((o) => p.endsWith(o.name))) remaining.push(`storage ${p}`);
}
// signInWithOtp creates the user before verify: an id not captured from a session is found by the exact test number.
for (const [label, phone] of [["patient", PATIENT_PHONE], ["driver", DRIVER_PHONE]] as const) {
  if (!users.has(label)) {
    const id = await findUserIdByPhone(phone);
    if (id) users.set(label, id);
  }
}
for (const [label, id] of users) {
  if (label === "patient" && out.missionId) {
    remaining.push(`RETAINED BY DESIGN auth.users/profiles ${id} (patient; missions.patient_id ON DELETE RESTRICT)`);
    continue;
  }
  const del = await admin.auth.admin.deleteUser(id);
  if ((await admin.auth.admin.getUserById(id)).data.user) remaining.push(`auth.users ${id} (${label}): ${del.error?.message ?? "still present"}`);
}
if (out.missionId) remaining.push(`RETAINED BY DESIGN mission ${out.missionId} + its mission_events + dispatch_waves ${out.offerId ?? "?"} (append-only audit)`);
console.log(`\nRESULT ${JSON.stringify({ users: Object.fromEntries(users), ...out })}`);
console.log(`Cleanup:\n  ${remaining.join("\n  ") || "all fixture records removed"}`);
if (remaining.some((r) => !r.startsWith("RETAINED BY DESIGN"))) process.exitCode = 1;
if (failure) {
  console.log("G4.5-C FAILED");
  throw failure;
}
process.exit(process.exitCode ?? 0);
