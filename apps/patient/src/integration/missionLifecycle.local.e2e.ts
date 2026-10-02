import assert from "node:assert";
import { randomInt, randomUUID } from "node:crypto";
import { registerHooks } from "node:module";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isUuid, readMissionCompleted, type DispatchOffer, type DriverLifecycleMachineEvent, type ParsedLifecycleMessage } from "@sahayak/domain";
import { assignedDriverOf, buildCreateMissionParams, mapRpcError, parseCreateMissionResult, parseEventRow } from "../lib/missionApi.core.ts";

/**
 * G4.5-A + G4.6-A: the real mission lifecycle against the LOCAL Supabase stack and the local data plane (Kong -> strict
 * token-mint, secure Centrifugo). Nothing is simulated: create_mission picks the jurisdiction and opens wave 1 itself, every
 * lifecycle event reaches the clients only through the mission_events trigger -> publish_realtime -> pg_net -> Centrifugo.
 * The test never publishes, never inserts a wave, offer or event, never updates missions.status, and never uses the service
 * key for a patient/driver/staff business call (the service key only creates the throwaway users and reads waves).
 *
 * Driver calls are built by the driver app's own buildServerCall (apps/driver/src/lib/driverServer.core.ts) and the
 * destination hospital is resolved the driver app's way (RLS read of hospitals -> parseHospitalRow -> matchHospitalId).
 *
 * Missions (each ends terminal before the next is booked, so the driver is free and wave 1 finds them):
 *   M1  accept -> ON_SCENE -> PATIENT_ON_BOARD -> ARRIVED_HOSPITAL -> COMPLETE, then confirm_receipt   (full lifecycle)
 *   M2  accept -> patient cancel_mission (en_route)                                                     (patient cancel)
 *   M3  accept -> ON_SCENE -> driver ABORT (DRIVER_RELEASED, back to requesting) -> patient cancel      (pre-pickup abort)
 *   M4  accept -> ON_SCENE -> PATIENT_ON_BOARD -> driver ABORT (MISSION_CANCELLED by driver)             (post-pickup abort)
 *
 * Identities follow apps/admin/src/kycAdmin.e2e.ts (local phone OTP is off): the service key creates throwaway users with a
 * server-set app_metadata.role, each signs in with a real GoTrue password session. The driver is verified the production
 * way: application RPC, vehicle, three KYC PDFs in Storage, submit_kyc, then a staff account's staff_approve_kyc.
 *
 * Not part of `pnpm test`. LOCAL only (refuses any other host). Needs the local Vault secrets centrifugo_api_url/_api_key
 * (HANDOVER.md ops step 3). A mission can never be deleted (mission_events is append-only, missions.patient_id is
 * ON DELETE RESTRICT): this script ends every mission through the real RPCs, removes what it can by exact id and reports
 * the rest. `supabase db reset` clears it, but also wipes the manually-set Vault secrets.
 *
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   [GATEWAY_URL=http://127.0.0.1:8000] [CENTRIFUGO_WS_URL=ws://127.0.0.1:8001/connection/websocket] \
 *   node --experimental-strip-types apps/patient/src/integration/missionLifecycle.local.e2e.ts
 */

const env = (k: string) => process.env[k] ?? assert.fail(`set ${k} (see the header of this file)`);
const URL_ = env("SUPABASE_URL");
const ANON = env("SUPABASE_ANON_KEY");
const GATEWAY = process.env.GATEWAY_URL ?? "http://127.0.0.1:8000";
const WS = process.env.CENTRIFUGO_WS_URL ?? "ws://127.0.0.1:8001/connection/websocket";
for (const u of [URL_, GATEWAY, WS]) {
  assert.ok(["127.0.0.1", "localhost"].includes(new URL(u).hostname), `refusing to run against a non-local host: ${u}`);
}
// The app realtime modules read these at import time.
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
const { mountOffersChannel, mountMissionWatch } = await import("../../../driver/src/services/driverRealtime.ts");
const { buildServerCall, matchHospitalId, parseHospitalRow } = await import("../../../driver/src/lib/driverServer.core.ts");

const admin = createClient(URL_, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const KYC_BUCKET = "driver-kyc-documents";
const tag = randomUUID().slice(0, 6).toUpperCase();
// Inside NCT of Delhi (the server decides that); the driver's presence fix is ~0.9 km north, inside wave 1's 3 km.
const PICKUP = { latitude: 28.5672, longitude: 77.21 };
const DRIVER_FIX = { latitude: 28.5752, longitude: 77.21 };
// Safdarjung Hospital's seeded position: the destination the crew picks, matched to a hospitals row like the driver app does.
const DESTINATION = { latitude: 28.5694, longitude: 77.2075 };
const HANDOFF = {
  physicianName: `Dr G46A ${tag}`, registrationNumber: `DMC-G46A-${tag}`, department: "Emergency", emtSigned: true,
  checklist: { bedReady: true, ventilatorReady: false, emrHanded: true },
};
const TERMINAL = new Set(["completed", "cancelled"]);

type Actor = { name: string; id: string; db: SupabaseClient; token: string; email: string; password: string };
const users: Record<string, string> = {};
const uploaded: string[] = [];
const teardowns: Array<() => void> = [];
const sessions: SupabaseClient[] = [];
const missions: Record<string, { id: string; offer: string }> = {};
const timing: Record<string, string> = {};
const ledger: string[] = [];
const negatives: string[] = [];
const since = (t: number) => `${Math.round(performance.now() - t)} ms`;

async function user(label: string, role?: "driver" | "staff"): Promise<Actor> {
  const email = `g46a-${label}-${tag.toLowerCase()}@example.test`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email, password, phone: `91981${randomInt(1e6, 1e7 - 1)}`, email_confirm: true, phone_confirm: true,
    ...(role ? { app_metadata: { role } } : {}),
  });
  assert.ifError(error);
  users[label] = data.user!.id;
  const db = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await db.auth.signInWithPassword({ email, password });
  assert.ifError(signIn.error);
  sessions.push(db);
  return { name: label, id: data.user!.id, db, token: signIn.data.session!.access_token, email, password };
}

/** Resolves with the first value `arm` delivers, or rejects after `timeoutMs` naming the failure class. */
function waitFor<T>(label: string, timeoutMs: number, arm: (resolve: (v: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label}: timed out after ${timeoutMs} ms`)), timeoutMs);
    arm((v) => {
      clearTimeout(t);
      resolve(v);
    });
  });
}

// Every lifecycle message the patient receives, keyed by eventId: a result is matched to its own persisted row, never to
// "some message of the same type".
type Received = { m: ParsedLifecycleMessage; at: number };
const received = new Map<string, Received>();
const receivedWaiters = new Map<string, (r: Received) => void>();
function onPatientMessage(m: ParsedLifecycleMessage) {
  if (!m.eventId) return;
  const r = { m, at: performance.now() };
  received.set(m.eventId, r);
  receivedWaiters.get(m.eventId)?.(r);
}
const patientReceived = (eventId: string, label: string): Promise<Received> =>
  received.has(eventId)
    ? Promise.resolve(received.get(eventId)!)
    : waitFor(`N PATIENT_REALTIME_DELIVERY_FAILURE ${label}`, 10_000, (done) => receivedWaiters.set(eventId, done));

// Offers the driver receives, matched by mission id.
const offers: DispatchOffer[] = [];
const offerWaiters: Array<(o: DispatchOffer) => void> = [];
function nextOffer(missionId: string): Promise<DispatchOffer> {
  const hit = offers.find((o) => o.missionId === missionId);
  if (hit) return Promise.resolve(hit);
  return waitFor("J DRIVER_OFFER_REALTIME_FAILURE", 10_000, (done) => offerWaiters.push((o) => o.missionId === missionId && done(o)));
}

// Assigned in step 1; a mission (the only thing cleanup acts on) cannot exist before both are.
let patient!: Actor;
let driver!: Actor;

/** The mission as its patient sees it under RLS, plus its event count: what every refusal must leave untouched. */
async function snap(missionId: string) {
  const m = await patient.db.from("missions").select("status,state_version,driver_id").eq("id", missionId).single();
  assert.ifError(m.error);
  const e = await patient.db.from("mission_events").select("id", { count: "exact", head: true }).eq("mission_id", missionId);
  assert.ifError(e.error);
  return { status: m.data.status as string, version: m.data.state_version as number, driver: m.data.driver_id as string | null, events: e.count ?? -1 };
}

/**
 * Runs one real mutation and proves it end to end: the RPC's result, the persisted mission_events row (patient RLS read),
 * the mission's status and state_version, and the patient's realtime message for exactly that eventId.
 */
async function mutate(
  label: string, missionId: string, actor: Actor, rpc: string, args: Record<string, unknown>,
  expect: { event: string; from: string; to: string },
) {
  const before = await snap(missionId);
  assert.strictEqual(before.status, expect.from, `${label}: precondition`);
  const t0 = performance.now();
  const res = await actor.db.rpc(rpc, args);
  const rpcMs = since(t0);
  assert.ifError(res.error);
  assert.strictEqual(res.data.status, expect.to, `${label}: RPC status`);
  assert.ok(isUuid(res.data.eventId), `${label}: RPC returns the new eventId`);
  const { m, at } = await patientReceived(res.data.eventId, label);
  const row = await patient.db.from("mission_events")
    .select("id,mission_id,seq,event_type,from_status,to_status,actor_role,triggered_by,created_at,metadata").eq("id", res.data.eventId).single();
  assert.ifError(row.error);
  const e = row.data;
  assert.deepStrictEqual([e.event_type, e.from_status, e.to_status], [expect.event, expect.from, expect.to], `L ${label}: persisted event`);
  assert.strictEqual(e.mission_id, missionId);
  assert.strictEqual(e.triggered_by, actor.id, `${label}: actor recorded`);
  assert.strictEqual(e.seq, before.version + 1, `${label}: seq is state_version + 1`);
  assert.strictEqual(e.seq, res.data.seq);
  // The realtime message IS the persisted row.
  assert.strictEqual(m.eventId, e.id, `M ${label}: eventId`);
  assert.strictEqual(m.seq, e.seq, `M ${label}: seq`);
  assert.strictEqual(m.event, e.event_type, `M ${label}: event type`);
  assert.strictEqual(m.missionId, e.mission_id, `M ${label}: missionId`);
  assert.strictEqual(m.state, e.to_status, `M ${label}: state`);
  assert.ok(Math.abs(Date.parse(m.timestamp!) - Date.parse(e.created_at)) < 1, `M ${label}: timestamp ${m.timestamp} vs ${e.created_at}`);
  for (const k of ["vitals", "handoff", "emergencyType", "bypass", "audit"]) assert.ok(!(k in m.data), `${label}: '${k}' never reaches the channel`);
  const after = await snap(missionId);
  assert.deepStrictEqual([after.status, after.version, after.events], [expect.to, e.seq, before.events + 1], `${label}: mission row`);
  const latency = Math.round(at - t0);
  ledger.push(`${label.padEnd(24)} ${actor.name.padEnd(7)} ${rpc}${args.p_event ? `(${args.p_event})` : ""}  ${expect.from} -> ${after.status}  v${after.version}  ${e.event_type} seq ${e.seq}  ${e.id}  ${e.created_at}  rpc ${rpcMs}, patient rx ${latency} ms`);
  console.log(`✓ ${label}: ${expect.from} -> ${after.status} ${e.event_type} seq ${e.seq} ${e.id} (rpc ${rpcMs}, realtime ${latency} ms)`);
  return { data: res.data, row: e, wire: m };
}

/** A driver machine event, sent exactly as the driver app sends it. */
function driverCall(ev: DriverLifecycleMachineEvent, clientEventId = randomUUID()) {
  const built = buildServerCall(ev, clientEventId);
  assert.ok(built.ok && built.call, `buildServerCall refused ${ev.type}: ${built.ok ? "local-only" : built.code}`);
  return built.call;
}
const now = () => new Date().toISOString();
const who = (missionId: string) => ({ missionId, driverId: driver.id });
const onScene = (missionId: string) => driverCall({ type: "CONFIRM_ARRIVAL_SCENE", payload: { ...who(missionId), location: PICKUP, arrivedAt: now() } });
const fresh = (call: { args: object }) => ({ ...call.args, p_client_event_id: randomUUID() });

/** A refused call: an expected error code, and neither the mission row nor its event log changed. */
async function refuse(label: string, missionId: string, db: SupabaseClient, rpc: string, args: object, codes: string[]) {
  const before = await snap(missionId);
  const r = await db.rpc(rpc, args);
  assert.ok(r.error, `${label}: expected a refusal, got ${JSON.stringify(r.data)}`);
  const mapped = mapRpcError(r.error);
  assert.ok(codes.includes(mapped.code) || codes.includes(r.error.code), `${label}: got ${mapped.code}/${r.error.code} ${r.error.message}`);
  assert.deepStrictEqual(await snap(missionId), before, `${label}: state/version/events unchanged`);
  negatives.push(`${label}: ${codes.includes(mapped.code) ? mapped.code : r.error.message} (${r.error.code}); ${before.status} v${before.version}, ${before.events} events unchanged`);
}

async function heldCapacity(hospitalId: string): Promise<number> {
  const h = await driver.db.from("hospitals").select("held_capacity").eq("id", hospitalId).single();
  assert.ifError(h.error);
  return h.data.held_capacity;
}

/** Fresh presence, create_mission (production params + parser), wave-1 offer on driver:{id}:offers, patient on mission:{id}. */
async function book(key: string) {
  const online = await driver.db.rpc("set_driver_presence", { p_online: true, p_lat: DRIVER_FIX.latitude, p_lng: DRIVER_FIX.longitude });
  assert.ifError(online.error);
  const t0 = performance.now();
  const created = await patient.db.rpc("create_mission", buildCreateMissionParams({
    idempotencyKey: randomUUID(), pickup: PICKUP, vehicleType: "TYPE_C_BLS", urgency: "CAT_1_IMMEDIATE",
    triage: { primary_complaint: `g46a-e2e ${key}` }, distanceKm: 4,
  }));
  timing[`${key} create_mission`] = since(t0);
  assert.ifError(created.error);
  const mission = parseCreateMissionResult(created.data);
  assert.ok(mission && isUuid(mission.missionId), "F MISSION_CREATION_FAILURE");
  // The server's pick is reported, never assumed here (serverJurisdiction.test.ts bans client-side zone defaults).
  assert.ok(["DL", "UP"].includes(mission.jurisdiction), `G JURISDICTION_FAILURE: server chose ${mission.jurisdiction}`);
  assert.strictEqual(mission.status, "requesting");
  const offer = await nextOffer(mission.missionId);
  timing[`${key} offer delivered (from create call)`] = since(t0);
  missions[key] = { id: mission.missionId, offer: offer.offerId };
  const wave = await admin.from("dispatch_waves").select("mission_id,wave_number,status,eligible_driver_ids").eq("id", offer.offerId).single();
  assert.ifError(wave.error);
  assert.strictEqual(wave.data.mission_id, mission.missionId, "H DISPATCH_WAVE_FAILURE");
  assert.deepStrictEqual([wave.data.wave_number, wave.data.status], [1, "broadcasting"], "I offer is live wave 1");
  assert.ok(wave.data.eligible_driver_ids.includes(driver.id), "I offer is for this driver");
  const ttlLeft = Date.parse(offer.expiresAt) - Date.now();
  assert.ok(ttlLeft > 0 && ttlLeft <= 15_000, `offer inside its 15 s window (${ttlLeft} ms left)`);
  const owned = await patient.db.from("missions").select("patient_id").eq("id", mission.missionId).single();
  assert.strictEqual(owned.data?.patient_id, patient.id, "mission belongs to the patient");
  const tPs = performance.now();
  await waitFor<void>(`E CHANNEL_AUTH_FAILURE (patient mission ${key})`, 10_000, (done) => {
    teardowns.push(mountMissionChannel(mission.missionId, patient.token, {
      onStatusChange: () => {},
      onSubscriptionStateChange: (s) => s && done(),
      onTelemetry: () => {},
      onLifecycleEvent: () => {},
      onLifecycleMessage: onPatientMessage,
      onError: (e) => console.log(`  patient channel error: ${e.message}`),
    }));
  });
  timing[`${key} patient mission subscribe`] = since(tPs);
  console.log(`✓ ${key} ${mission.missionId} requesting, jurisdiction=${mission.jurisdiction} (server); offer ${offer.offerId} wave 1 (${timing[`${key} offer delivered (from create call)`]})`);
  return { missionId: mission.missionId, offer };
}

async function accept(key: string, offer: DispatchOffer) {
  const call = driverCall({ type: "ACCEPT_DISPATCH", payload: { ...who(offer.missionId), offerId: offer.offerId, acceptedAt: now() } });
  assert.strictEqual(call.rpc, "accept_offer");
  const r = await mutate(`${key} accept`, offer.missionId, driver, call.rpc, call.args, { event: "DRIVER_ACCEPTED", from: "requesting", to: "en_route" });
  assert.strictEqual(r.wire.driverId, driver.id);
  assert.strictEqual((await snap(offer.missionId)).driver, driver.id, "K driver assigned");
  return r;
}

const step = (s: string) => console.log(`\n${s}`);
let failure: unknown;
try {
  step("1. Identities (real GoTrue sessions)");
  patient = await user("patient");
  const other = await user("patient2");
  const staff = await user("staff", "staff");
  driver = await user("driver", "driver");
  // A second, separate driver account (never verified, never assigned), used only to try another driver's mission.
  const driver2 = await user("driver2", "driver");
  assert.strictEqual((await patient.db.from("profiles").select("role").eq("id", patient.id).single()).data?.role, "patient", "A AUTH_FAILURE: patient profile");
  assert.strictEqual((await driver.db.from("profiles").select("role").eq("id", driver.id).single()).data?.role, "driver", "A AUTH_FAILURE: driver profile");
  console.log(`✓ patient ${patient.id}, driver ${driver.id}, driver2 ${driver2.id}`);

  step("2. Driver verified through the production KYC path");
  const fields = { licenseNumber: `G46-${tag}`, ais125Type: "TYPE_C_BLS", dlExpiry: "2031-01-01", emtLevel: "EMT_B" };
  assert.ifError((await driver.db.rpc("upsert_driver_application", { p_fields: fields })).error);
  assert.ifError((await driver.db.from("driver_vehicles").insert({ driver_id: driver.id, registration_number: `G46${tag}`, ais125_type: "TYPE_C_BLS" })).error);
  for (const slot of ["arai_certificate", "fitness_permit", "vehicle_rc"]) {
    const path = `${driver.id}/${slot}/${randomUUID()}.pdf`;
    const bytes = new TextEncoder().encode(`%PDF-1.4 ${slot} ${driver.id}`);
    const up = await driver.db.storage.from(KYC_BUCKET).upload(path, bytes, { contentType: "application/pdf" });
    assert.ifError(up.error);
    uploaded.push(path);
    assert.ifError((await driver.db.from("driver_documents").insert({ driver_id: driver.id, slot, storage_path: path, file_name: `${slot}.pdf`, size_bytes: bytes.byteLength, mime_type: "application/pdf" })).error);
  }
  const submitted = await driver.db.rpc("submit_kyc");
  assert.ifError(submitted.error);
  const approved = await staff.db.rpc("staff_approve_kyc", { p_driver_id: driver.id });
  assert.ifError(approved.error);
  assert.strictEqual(approved.data?.kycStatus, "approved", "B DRIVER_FIXTURE_FAILURE: approval");
  console.log(`✓ ${submitted.data.kycStatus} -> ${approved.data.kycStatus}`);

  step("3. Pre-booking negative checks");
  const anonBook = await anon.rpc("create_mission", buildCreateMissionParams({ idempotencyKey: randomUUID(), pickup: PICKUP, vehicleType: "TYPE_C_BLS", urgency: "CAT_1_IMMEDIATE", triage: {}, distanceKm: 1 }));
  assert.ok(anonBook.error, "unauthenticated create_mission refused");
  const tok = await fetch(`${GATEWAY}/realtime/token`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${patient.token}` }, body: JSON.stringify({ scope: `driver:${driver.id}:offers` }) });
  assert.strictEqual(tok.status, 403, "another identity cannot get the driver's offers channel");
  negatives.push(`anon create_mission: ${anonBook.error.message} (${anonBook.error.code})`, `patient -> driver:{id}:offers token: HTTP ${tok.status}`);
  console.log(`✓ anon create_mission ${anonBook.error.code}; patient -> driver offers channel HTTP ${tok.status}`);

  step("4. Driver on driver:{id}:offers (real token flow); hospitals read the driver app's way");
  const tSub = performance.now();
  await waitFor<void>("E CHANNEL_AUTH_FAILURE / D WSS_FAILURE (driver offers)", 10_000, (done) => {
    teardowns.push(mountOffersChannel(driver.id, driver.token, {
      onOffer: (o) => { offers.push(o); for (const w of offerWaiters) w(o); },
      onRevoked: () => {},
      onSubscribed: () => done(),
    }));
  });
  timing["driver offers subscribe"] = since(tSub);
  const hospRows = await driver.db.from("hospitals").select("id,location").eq("is_active", true);
  assert.ifError(hospRows.error);
  const hospitals = hospRows.data.map(parseHospitalRow).filter((h) => h !== null);
  assert.ok(hospitals.length > 0, `driver app cannot parse hospitals.location (${JSON.stringify(hospRows.data[0]?.location)})`);
  const hospitalId = matchHospitalId(DESTINATION, hospitals);
  assert.ok(hospitalId, "destination matches a registered hospital");
  const held0 = await heldCapacity(hospitalId);
  assert.ok((await fetchConnectionToken(patient.token)).length > 0, "D patient connection token");
  console.log(`✓ offers subscribed (${timing["driver offers subscribe"]}); ${hospitals.length} hospitals parsed, destination ${hospitalId} held_capacity ${held0}`);

  // ---------------------------------------------------------------------------------------------------------------------
  step("5. M1 booked; another patient can neither subscribe nor cancel");
  const m1 = await book("M1");
  const M1 = m1.missionId;
  await assert.rejects(fetchChannelToken(M1, other.token), /Not authorized/, "another patient cannot subscribe");
  negatives.push("other patient -> mission:{M1} token: Not authorized");
  await refuse("other patient cancel_mission", M1, other.db, "cancel_mission", { p_mission_id: M1, p_reason: "other" }, ["not_found"]);

  step("6. M1 accept_offer (driver session)");
  const acc = await accept("M1", m1.offer);

  step("7. M1 negative checks at en_route");
  const scene1 = onScene(M1);
  await refuse("patient transition_mission(ON_SCENE)", M1, patient.db, scene1.rpc, fresh(scene1), ["not_found"]);
  await refuse("driver2 transition_mission(ON_SCENE)", M1, driver2.db, scene1.rpc, fresh(scene1), ["not_found"]);
  await refuse("anon transition_mission(ON_SCENE)", M1, anon, scene1.rpc, fresh(scene1), ["unauthenticated", "42501"]);
  const skipHosp = driverCall({ type: "CONFIRM_ARRIVAL_HOSPITAL", payload: { ...who(M1), location: DESTINATION, arrivedAt: now() } });
  await refuse("driver ARRIVED_HOSPITAL from en_route", M1, driver.db, skipHosp.rpc, skipHosp.args, ["invalid_transition"]);
  const skipDone = driverCall({ type: "COMPLETE_MISSION", payload: { ...who(M1), completedAt: now(), handoff: HANDOFF } });
  await refuse("driver COMPLETE from en_route", M1, driver.db, skipDone.rpc, skipDone.args, ["invalid_transition"]);
  // The assigned driver re-accepting their own offer while en_route is an idempotent replay by design (accept_offer).
  const beforeReAccept = await snap(M1);
  const reAccept = await driver.db.rpc("accept_offer", { p_offer_id: m1.offer.offerId, p_client_event_id: randomUUID() });
  assert.ifError(reAccept.error);
  assert.deepStrictEqual([reAccept.data.replay, reAccept.data.seq], [true, acc.data.seq]);
  assert.deepStrictEqual(await snap(M1), beforeReAccept, "re-accept records nothing");
  negatives.push("driver accept_offer again while en_route (fresh client id): ok replay=true, no new event (idempotent by design)");

  step("8. M1 ON_SCENE (DRIVER_ARRIVED); a client-event-id replay records nothing new");
  const s1 = await mutate("M1 on_scene", M1, driver, scene1.rpc, scene1.args, { event: "DRIVER_ARRIVED", from: "en_route", to: "on_scene" });
  const beforeReplay = await snap(M1);
  const replay = await driver.db.rpc(scene1.rpc, scene1.args);
  assert.ifError(replay.error);
  assert.deepStrictEqual([replay.data.replay, replay.data.eventId, replay.data.seq], [true, s1.data.eventId, s1.data.seq], "replay returns the original event");
  assert.deepStrictEqual(await snap(M1), beforeReplay, "replay changes nothing");
  negatives.push(`driver ON_SCENE replay (same client_event_id): ok replay=true -> original event ${s1.data.eventId}, no new row`);

  step("9. M1 PATIENT_ON_BOARD (TRANSPORT_STARTED); bed hold taken by the server");
  const onboard = driverCall({ type: "CONFIRM_PATIENT_ONBOARD", payload: { ...who(M1), destination: DESTINATION, hospitalId, onboardAt: now(), vitals: { pulse: 96, spO2: 97 } } });
  const t1 = await mutate("M1 transporting", M1, driver, onboard.rpc, onboard.args, { event: "TRANSPORT_STARTED", from: "on_scene", to: "transporting" });
  assert.strictEqual((t1.wire.data.destination as { hospitalId?: string }).hospitalId, hospitalId);
  assert.deepStrictEqual((t1.row.metadata as { vitals?: unknown }).vitals, { pulse: 96, spO2: 97 }, "vitals persisted, not published");
  assert.strictEqual(await heldCapacity(hospitalId), held0 + 1, "bed hold taken");
  await refuse("patient cancel_mission while transporting", M1, patient.db, "cancel_mission", { p_mission_id: M1, p_reason: "other" }, ["invalid_transition"]);

  step("10. M1 ARRIVED_HOSPITAL (HOSPITAL_ARRIVED)");
  const arrive = driverCall({ type: "CONFIRM_ARRIVAL_HOSPITAL", payload: { ...who(M1), location: DESTINATION, arrivedAt: now() } });
  await mutate("M1 arrived_hospital", M1, driver, arrive.rpc, arrive.args, { event: "HOSPITAL_ARRIVED", from: "transporting", to: "arrived_hospital" });
  // buildServerCall refuses a blank sign-off locally; the server must refuse it on its own too.
  await refuse("driver COMPLETE with blank handoff (raw RPC)", M1, driver.db, "transition_mission",
    { p_mission_id: M1, p_event: "COMPLETE", p_payload: { handoff: { ...HANDOFF, physicianName: " " } }, p_client_event_id: randomUUID() }, ["handoff_incomplete"]);

  step("11. M1 COMPLETE (MISSION_COMPLETED); fare computed by the server, hold released");
  const complete = driverCall({ type: "COMPLETE_MISSION", payload: { ...who(M1), completedAt: now(), handoff: HANDOFF } });
  const done = await mutate("M1 completed", M1, driver, complete.rpc, complete.args, { event: "MISSION_COMPLETED", from: "arrived_hospital", to: "completed" });
  const meta = done.row.metadata as { finalFareInr: number; distanceKm: number; distanceSource: string; audit: { distanceSource: string }; handoff: { physicianName: string } };
  assert.ok(Number.isInteger(meta.finalFareInr) && meta.finalFareInr > 0, "server fare");
  assert.strictEqual(done.wire.data.finalFareInr, meta.finalFareInr);
  // The source of the billed distance reaches the patient on the wire (audit itself is stripped) and matches the record.
  assert.ok(["measured", "estimate"].includes(meta.distanceSource) && meta.distanceSource === meta.audit.distanceSource, "completion record names its source");
  assert.strictEqual(done.wire.data.distanceSource, meta.distanceSource, "wire MISSION_COMPLETED carries distanceSource");
  assert.strictEqual(readMissionCompleted(done.wire.data).distanceSource, meta.distanceSource, "and the patient parser reads it");
  assert.strictEqual(meta.handoff.physicianName, HANDOFF.physicianName, "handoff persisted, not published");
  const fin = await patient.db.from("missions").select("completed_at,final_fare_inr").eq("id", M1).single();
  assert.ok(fin.data?.completed_at && fin.data.final_fare_inr === meta.finalFareInr, "mission row carries the final fare");
  assert.strictEqual(await heldCapacity(hospitalId), held0, "bed hold released");
  console.log(`  fare INR ${meta.finalFareInr} for ${meta.distanceKm} km (distanceSource=${meta.distanceSource}, on the wire: ${done.wire.data.distanceSource})`);

  step("12. M1 completed: every further transition is refused");
  await refuse("driver ON_SCENE on completed", M1, driver.db, scene1.rpc, fresh(scene1), ["invalid_transition"]);
  await refuse("driver ARRIVED_HOSPITAL on completed", M1, driver.db, arrive.rpc, fresh(arrive), ["invalid_transition"]);
  await refuse("driver COMPLETE again on completed", M1, driver.db, complete.rpc, fresh(complete), ["invalid_transition"]);
  const abort1 = driverCall({ type: "ABORT_MISSION", payload: { ...who(M1), reason: "other", abortedAt: now() } });
  await refuse("driver ABORT on completed", M1, driver.db, abort1.rpc, abort1.args, ["invalid_transition"]);
  await refuse("driver accept_offer on completed", M1, driver.db, "accept_offer", { p_offer_id: m1.offer.offerId, p_client_event_id: randomUUID() }, ["offer_taken"]);
  await refuse("patient cancel_mission on completed", M1, patient.db, "cancel_mission", { p_mission_id: M1, p_reason: "other" }, ["invalid_transition"]);
  await refuse("driver confirm_receipt (patient-only)", M1, driver.db, "confirm_receipt", { p_mission_id: M1 }, ["not_found"]);

  step("13. M1 confirm_receipt (patient; stored as columns, not a lifecycle event)");
  const before13 = await snap(M1);
  const rc = await patient.db.rpc("confirm_receipt", { p_mission_id: M1, p_dispute: false });
  assert.ifError(rc.error);
  assert.ok(rc.data.ok && rc.data.receiptConfirmedAt && rc.data.disputeFlag === false);
  assert.deepStrictEqual(await snap(M1), before13, "no event, no version bump");
  const m1Events = await patient.db.from("mission_events").select("seq,event_type").eq("mission_id", M1).order("seq");
  assert.deepStrictEqual(m1Events.data!.map((e) => `${e.seq}:${e.event_type}`),
    ["1:MISSION_REQUESTED", "2:DRIVER_ACCEPTED", "3:DRIVER_ARRIVED", "4:TRANSPORT_STARTED", "5:HOSPITAL_ARRIVED", "6:MISSION_COMPLETED"], "M1 event log");
  assert.ok(received.has(acc.data.eventId));
  console.log(`✓ receipt confirmed ${rc.data.receiptConfirmedAt}; M1 log ${m1Events.data!.map((e) => `${e.seq}:${e.event_type}`).join(", ")}`);

  // ---------------------------------------------------------------------------------------------------------------------
  step("14. M2: accept, then the patient cancels en_route; the driver's mission watch hears it");
  const m2 = await book("M2");
  const M2 = m2.missionId;
  await accept("M2", m2.offer);
  {
    // The same account signing in again (a reopened app) still owns the active mission, read the app's way
    // (fetchActiveMission's RLS query), and recovers the crew from the stored DRIVER_ACCEPTED row (fetchAssignedDriver).
    const again = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const signedIn = await again.auth.signInWithPassword({ email: patient.email, password: patient.password });
    assert.ifError(signedIn.error);
    assert.strictEqual(signedIn.data.user!.id, patient.id, "same account");
    const active = await again.from("missions").select("id,patient_id").not("status", "in", "(completed,cancelled)");
    assert.deepStrictEqual(active.data, [{ id: M2, patient_id: patient.id }], "the active mission is still this patient's after signing in again");
    const accepted = await again
      .from("mission_events")
      .select("id,seq,event_type,to_status,metadata,created_at")
      .eq("mission_id", M2)
      .eq("event_type", "DRIVER_ACCEPTED")
      .order("seq", { ascending: false })
      .limit(1);
    const crew = assignedDriverOf(parseEventRow(accepted.data?.[0])?.data ?? {});
    assert.ok(crew?.vehicleRegistration && crew.ais125Type, `crew recovered without the realtime replay: ${JSON.stringify(crew)}`);
    await again.auth.signOut({ scope: "local" });
    console.log(`  re-sign-in: same patient, active mission ${M2} still owned; crew recovered (${crew.vehicleRegistration}, ${crew.ais125Type})`);
  }
  const driverHeard = new Map<number, { cancelledBy?: string; at: number }>();
  let onDriverCancel: (() => void) | null = null;
  await waitFor<void>("E CHANNEL_AUTH_FAILURE (driver mission watch)", 10_000, (ok) => {
    teardowns.push(mountMissionWatch(M2, driver.token, {
      onCancelled: (info) => { driverHeard.set(info.seq ?? -1, { cancelledBy: info.cancelledBy, at: performance.now() }); onDriverCancel?.(); },
      onSubscribed: () => ok(),
    }));
  });
  const driverRx = waitFor<void>("DRIVER_CANCEL_REALTIME_FAILURE", 10_000, (ok) => { onDriverCancel = ok; });
  const tc = performance.now();
  const c2 = await mutate("M2 cancelled (patient)", M2, patient, "cancel_mission", { p_mission_id: M2, p_reason: "changed_mind" }, { event: "MISSION_CANCELLED", from: "en_route", to: "cancelled" });
  await driverRx;
  // The driver watch handler exposes seq, not eventId: matched by seq.
  const dh = driverHeard.get(c2.row.seq);
  assert.ok(dh && dh.cancelledBy === "patient", "driver received MISSION_CANCELLED for this seq");
  assert.deepStrictEqual([c2.wire.data.cancelledBy, c2.wire.data.reason, c2.wire.data.fromState], ["patient", "changed_mind", "en_route"]);
  timing["M2 driver watch cancel (from cancel call)"] = `${Math.round(dh.at - tc)} ms`;
  console.log(`  driver mission watch: MISSION_CANCELLED seq ${c2.row.seq} cancelledBy=patient (${timing["M2 driver watch cancel (from cancel call)"]})`);

  step("15. M2 cancelled: completion and the rest are refused; a repeat cancel is an idempotent no-op");
  const c2Complete = driverCall({ type: "COMPLETE_MISSION", payload: { ...who(M2), completedAt: now(), handoff: HANDOFF } });
  await refuse("driver COMPLETE on cancelled", M2, driver.db, c2Complete.rpc, c2Complete.args, ["invalid_transition"]);
  const c2Scene = onScene(M2);
  await refuse("driver ON_SCENE on cancelled", M2, driver.db, c2Scene.rpc, c2Scene.args, ["invalid_transition"]);
  await refuse("driver accept_offer on cancelled", M2, driver.db, "accept_offer", { p_offer_id: m2.offer.offerId, p_client_event_id: randomUUID() }, ["offer_taken", "offer_expired"]);
  await refuse("patient confirm_receipt on cancelled", M2, patient.db, "confirm_receipt", { p_mission_id: M2 }, ["invalid_transition"]);
  const before15 = await snap(M2);
  const again = await patient.db.rpc("cancel_mission", { p_mission_id: M2, p_reason: "other" });
  assert.ifError(again.error);
  assert.deepStrictEqual([again.data.replay, again.data.status], [true, "cancelled"]);
  assert.deepStrictEqual(await snap(M2), before15, "repeat cancel records nothing");
  negatives.push("patient cancel_mission on cancelled: ok replay=true, no new event (idempotent by design)");

  // ---------------------------------------------------------------------------------------------------------------------
  step("16. M3: accept, ON_SCENE, driver ABORT before pickup -> DRIVER_RELEASED (requesting), then the patient cancels");
  const m3 = await book("M3");
  const M3 = m3.missionId;
  await accept("M3", m3.offer);
  const s3 = onScene(M3);
  await mutate("M3 on_scene", M3, driver, s3.rpc, s3.args, { event: "DRIVER_ARRIVED", from: "en_route", to: "on_scene" });
  const ab3 = driverCall({ type: "ABORT_MISSION", payload: { ...who(M3), reason: "driver_backed_out", abortedAt: now() } });
  const rel = await mutate("M3 released (driver)", M3, driver, ab3.rpc, ab3.args, { event: "DRIVER_RELEASED", from: "on_scene", to: "requesting" });
  assert.strictEqual(rel.wire.data.reason, "driver_backed_out");
  assert.strictEqual((await snap(M3)).driver, null, "driver unassigned");
  const waves3 = await admin.from("dispatch_waves").select("wave_number,status,eligible_driver_ids").eq("mission_id", M3).order("wave_number");
  assert.ifError(waves3.error);
  assert.ok(waves3.data.length > 1 && waves3.data.slice(1).every((w) => !w.eligible_driver_ids.includes(driver.id)), "re-dispatched without the releasing driver");
  console.log(`  re-dispatch waves: ${waves3.data.map((w) => `${w.wave_number}:${w.status}(${w.eligible_driver_ids.length} drivers)`).join(", ")}`);
  await refuse("released driver ON_SCENE", M3, driver.db, s3.rpc, fresh(s3), ["not_found"]);
  await mutate("M3 cancelled (patient)", M3, patient, "cancel_mission", { p_mission_id: M3, p_reason: "found_alternative" }, { event: "MISSION_CANCELLED", from: "requesting", to: "cancelled" });

  // ---------------------------------------------------------------------------------------------------------------------
  step("17. M4: accept, ON_SCENE, PATIENT_ON_BOARD, driver ABORT after pickup -> MISSION_CANCELLED by driver, hold released");
  const m4 = await book("M4");
  const M4 = m4.missionId;
  await accept("M4", m4.offer);
  const s4 = onScene(M4);
  await mutate("M4 on_scene", M4, driver, s4.rpc, s4.args, { event: "DRIVER_ARRIVED", from: "en_route", to: "on_scene" });
  const ob4 = driverCall({ type: "CONFIRM_PATIENT_ONBOARD", payload: { ...who(M4), destination: DESTINATION, hospitalId, onboardAt: now() } });
  await mutate("M4 transporting", M4, driver, ob4.rpc, ob4.args, { event: "TRANSPORT_STARTED", from: "on_scene", to: "transporting" });
  assert.strictEqual(await heldCapacity(hospitalId), held0 + 1, "bed hold taken");
  const ab4 = driverCall({ type: "ABORT_MISSION", payload: { ...who(M4), reason: "vehicle_breakdown", abortedAt: now() } });
  const c4 = await mutate("M4 cancelled (driver)", M4, driver, ab4.rpc, ab4.args, { event: "MISSION_CANCELLED", from: "transporting", to: "cancelled" });
  assert.deepStrictEqual([c4.wire.data.cancelledBy, c4.wire.data.reason, c4.wire.data.fromState], ["driver", "vehicle_breakdown", "transporting"]);
  assert.strictEqual(await heldCapacity(hospitalId), held0, "bed hold released on abort");
  const c4Arrive = driverCall({ type: "CONFIRM_ARRIVAL_HOSPITAL", payload: { ...who(M4), location: DESTINATION, arrivedAt: now() } });
  await refuse("driver ARRIVED_HOSPITAL on driver-cancelled", M4, driver.db, c4Arrive.rpc, c4Arrive.args, ["invalid_transition"]);
  const c4Complete = driverCall({ type: "COMPLETE_MISSION", payload: { ...who(M4), completedAt: now(), handoff: HANDOFF } });
  await refuse("driver COMPLETE on driver-cancelled", M4, driver.db, c4Complete.rpc, c4Complete.args, ["invalid_transition"]);

  console.log("\nG4.6-A LIFECYCLE CHECKS PASSED");
} catch (e) {
  failure = e;
}

// Cleanup. First end any mission this run left open, through the same RPCs a patient/driver would use (an open mission keeps
// dispatch_tick rebroadcasting and can hold a bed). Then close realtime, sign out, and remove exact ids.
for (const [key, m] of Object.entries(missions)) {
  const s = await snap(m.id).catch(() => null);
  if (!s || TERMINAL.has(s.status)) continue;
  const r = ["transporting", "arrived_hospital"].includes(s.status)
    ? await driver.db.rpc("transition_mission", { p_mission_id: m.id, p_event: "ABORT", p_payload: { reason: "other" } })
    : await patient.db.rpc("cancel_mission", { p_mission_id: m.id, p_reason: "other", p_note: "G4.6-A cleanup" });
  console.log(`cleanup: ${key} ${s.status} -> ${r.error ? `FAILED ${r.error.message}` : r.data.status}`);
}
const held = await admin.from("hospitals").select("name,held_capacity").gt("held_capacity", 0);
for (const t of teardowns) t();
for (const s of sessions) await s.auth.signOut().catch(() => {});
if (uploaded.length) {
  const rm = await admin.storage.from(KYC_BUCKET).remove(uploaded);
  if (rm.error) console.log(`storage remove: ${rm.error.message}`);
}
const remaining: string[] = [];
if (held.data?.length) remaining.push(`hospitals with a held bed: ${JSON.stringify(held.data)}`);
for (const [label, id] of Object.entries(users)) {
  await admin.auth.admin.deleteUser(id);
  if ((await admin.auth.admin.getUserById(id)).data.user) remaining.push(`auth.users/profiles ${id} (${label}): referenced by append-only mission data`);
}
for (const p of uploaded) {
  const [dir, file] = [p.slice(0, p.lastIndexOf("/")), p.slice(p.lastIndexOf("/") + 1)];
  if ((await admin.storage.from(KYC_BUCKET).list(dir)).data?.some((o) => o.name === file)) remaining.push(`storage ${p}`);
}
for (const [key, m] of Object.entries(missions)) remaining.push(`missions ${m.id} (${key}) + its mission_events and dispatch_waves: append-only by design`);

console.log(`\nTransitions (label, actor, rpc, from -> to, state_version, event, seq, eventId, persisted_at, latency):\n  ${ledger.join("\n  ")}`);
console.log(`\nNegative checks (${negatives.length}):\n  ${negatives.join("\n  ")}`);
console.log(`\nTiming: ${JSON.stringify(timing)}`);
console.log(`IDs: ${JSON.stringify({ users, missions })}`);
console.log(`Remaining after cleanup (clear with supabase db reset, which also wipes the Vault secrets):\n  ${remaining.join("\n  ") || "none"}`);
if (failure) {
  console.log("G4.6-A FAILED");
  throw failure;
}
process.exit(0);
