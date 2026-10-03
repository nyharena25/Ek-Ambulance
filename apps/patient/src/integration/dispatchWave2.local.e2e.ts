import assert from "node:assert";
import { randomInt, randomUUID } from "node:crypto";
import { registerHooks } from "node:module";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isUuid, type DispatchOffer, type DispatchOfferRevoked, type ParsedLifecycleMessage } from "@sahayak/domain";
import { buildCreateMissionParams, mapRpcError, parseCreateMissionResult } from "../lib/missionApi.core.ts";

/**
 * G4.6-B: wave-2 escalation on the LOCAL stack, driven only by the production scheduler. The patient books; wave 1
 * (dispatch_config radiiKm[0]) reaches driver A, who never answers; the offer TTL runs out, then the wave window; pg_cron's
 * `dispatch_tick` job (every 5 s since 20261003000000; a wave now expires with its offer) revokes wave 1 and opens wave 2 (radiiKm[1]), which reaches
 * driver B, who sits outside wave 1's radius; B accepts. Nothing here inserts a wave, offer or event, updates a status,
 * calls dispatch_tick / dispatch_next_wave, or publishes. The service key only creates the throwaway users and reads
 * dispatch_waves (a driver cannot read another driver's wave under RLS).
 *
 * Presence: both drivers heartbeat set_driver_presence every 10 s, as the driver app does (useServerSync HEARTBEAT_MS);
 * dispatch only asks drivers seen in the last 30 s and wave 2 opens up to ~105 s after booking.
 *
 * Not part of `pnpm test`. LOCAL only. Needs the local Vault secrets centrifugo_api_url/_api_key and the pg_cron job.
 * Takes 1-2 minutes (real scheduler cadence). Same env as missionLifecycle.local.e2e.ts:
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node --experimental-strip-types apps/patient/src/integration/dispatchWave2.local.e2e.ts
 */

const env = (k: string) => process.env[k] ?? assert.fail(`set ${k} (see the header of this file)`);
const URL_ = env("SUPABASE_URL");
const ANON = env("SUPABASE_ANON_KEY");
const GATEWAY = process.env.GATEWAY_URL ?? "http://127.0.0.1:8000";
const WS = process.env.CENTRIFUGO_WS_URL ?? "ws://127.0.0.1:8001/connection/websocket";
for (const u of [URL_, GATEWAY, WS]) {
  assert.ok(["127.0.0.1", "localhost"].includes(new URL(u).hostname), `refusing to run against a non-local host: ${u}`);
}
process.env.EXPO_PUBLIC_GATEWAY_URL = GATEWAY;
process.env.EXPO_PUBLIC_CENTRIFUGO_WS_URL = WS;
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
const { mountMissionChannel, fetchChannelToken } = await import("../services/missionChannel.service.ts");
const { mountOffersChannel } = await import("../../../driver/src/services/driverRealtime.ts");
const { buildServerCall } = await import("../../../driver/src/lib/driverServer.core.ts");

const admin = createClient(URL_, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const KYC_BUCKET = "driver-kyc-documents";
const tag = randomUUID().slice(0, 6).toUpperCase();
// Pickup inside NCT of Delhi. 0.009 deg of latitude is ~1 km: A is ~0.9 km out, B ~4.4 km out. The radii come from
// dispatch_config() and the positions are asserted against them, not assumed.
const PICKUP = { latitude: 28.5672, longitude: 77.21 };
const FIX_A = { latitude: 28.5752, longitude: 77.21 };
const FIX_B = { latitude: 28.6072, longitude: 77.21 };
const HEARTBEAT_MS = 10_000;

type Actor = { name: string; id: string; db: SupabaseClient; token: string };
const users: Record<string, string> = {};
const uploaded: string[] = [];
const teardowns: Array<() => void> = [];
const sessions: SupabaseClient[] = [];
const timeline: Array<[string, string]> = [];
const negatives: string[] = [];
const mark = (label: string, iso: string) => timeline.push([label, iso]);
const ms = (a: string, b: string) => Date.parse(b) - Date.parse(a);

async function user(label: string, role?: "driver" | "staff"): Promise<Actor> {
  const email = `g46b-${label.toLowerCase()}-${tag.toLowerCase()}@example.test`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email, password, phone: `91982${randomInt(1e6, 1e7 - 1)}`, email_confirm: true, phone_confirm: true,
    ...(role ? { app_metadata: { role } } : {}),
  });
  assert.ifError(error);
  users[label] = data.user!.id;
  const db = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await db.auth.signInWithPassword({ email, password });
  assert.ifError(signIn.error);
  sessions.push(db);
  return { name: label, id: data.user!.id, db, token: signIn.data.session!.access_token };
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
const sleepUntil = (epochMs: number) => new Promise((r) => setTimeout(r, Math.max(0, epochMs - Date.now())));

/** Application RPC, vehicle, three KYC PDFs, submit_kyc, staff_approve_kyc: the production verification path. */
async function verify(d: Actor, staff: Actor, suffix: string) {
  assert.ifError((await d.db.rpc("upsert_driver_application", { p_fields: { licenseNumber: `G46B-${tag}-${suffix}`, ais125Type: "TYPE_C_BLS", dlExpiry: "2031-01-01", emtLevel: "EMT_B" } })).error);
  assert.ifError((await d.db.from("driver_vehicles").insert({ driver_id: d.id, registration_number: `G46B${tag}${suffix}`, ais125_type: "TYPE_C_BLS" })).error);
  for (const slot of ["arai_certificate", "fitness_permit", "vehicle_rc"]) {
    const path = `${d.id}/${slot}/${randomUUID()}.pdf`;
    const bytes = new TextEncoder().encode(`%PDF-1.4 ${slot} ${d.id}`);
    assert.ifError((await d.db.storage.from(KYC_BUCKET).upload(path, bytes, { contentType: "application/pdf" })).error);
    uploaded.push(path);
    assert.ifError((await d.db.from("driver_documents").insert({ driver_id: d.id, slot, storage_path: path, file_name: `${slot}.pdf`, size_bytes: bytes.byteLength, mime_type: "application/pdf" })).error);
  }
  assert.ifError((await d.db.rpc("submit_kyc")).error);
  const ok = await staff.db.rpc("staff_approve_kyc", { p_driver_id: d.id });
  assert.ifError(ok.error);
  assert.strictEqual(ok.data?.kycStatus, "approved", `B DRIVER_FIXTURE_FAILURE ${d.name}`);
}

/** Offers and revocations a driver receives on driver:{id}:offers, with local receipt times. */
function offerInbox(d: Actor) {
  const offers: Array<{ o: DispatchOffer; at: string }> = [];
  const revoked: Array<{ r: DispatchOfferRevoked; at: string }> = [];
  const waiters: Array<() => void> = [];
  const ready = waitFor<void>(`E CHANNEL_AUTH_FAILURE (${d.name} offers)`, 10_000, (done) => {
    teardowns.push(mountOffersChannel(d.id, d.token, {
      onOffer: (o) => { offers.push({ o, at: new Date().toISOString() }); waiters.forEach((w) => w()); },
      onRevoked: (r) => { revoked.push({ r, at: new Date().toISOString() }); waiters.forEach((w) => w()); },
      onSubscribed: () => done(),
    }));
  });
  const until = <T>(label: string, timeoutMs: number, find: () => T | undefined): Promise<T> => {
    const hit = find();
    if (hit !== undefined) return Promise.resolve(hit);
    return waitFor<T>(label, timeoutMs, (done) => waiters.push(() => { const v = find(); if (v !== undefined) done(v); }));
  };
  return { offers, revoked, ready, until };
}

async function refuse(label: string, db: SupabaseClient, rpc: string, args: object, codes: string[]) {
  const r = await db.rpc(rpc, args);
  assert.ok(r.error, `${label}: expected a refusal, got ${JSON.stringify(r.data)}`);
  const code = mapRpcError(r.error).code;
  assert.ok(codes.includes(code) || codes.includes(r.error.code), `${label}: got ${code}/${r.error.code} ${r.error.message}`);
  negatives.push(`${label}: ${codes.includes(code) ? code : r.error.message} (${r.error.code})`);
}

const step = (s: string) => console.log(`\n${s}`);
let failure: unknown;
let missionId: string | undefined;
let patient!: Actor;
const heartbeats: Array<ReturnType<typeof setInterval>> = [];
const online: Actor[] = [];
try {
  step("1. Actors (real GoTrue sessions); both drivers verified through the production KYC path");
  patient = await user("patient");
  const other = await user("patient2");
  const staff = await user("staff", "staff");
  const A = await user("driverA", "driver");
  const B = await user("driverB", "driver");
  await verify(A, staff, "A");
  await verify(B, staff, "B");
  console.log(`✓ patient ${patient.id}; driver A ${A.id}; driver B ${B.id}; both approved`);

  step("2. Dispatch configuration (read from the server, not assumed)");
  const cfgRes = await patient.db.rpc("dispatch_config");
  assert.ifError(cfgRes.error);
  const cfg = cfgRes.data as { offerTtlSeconds: number; waveWindowSeconds: number; radiiKm: [number, number, ...number[]]; searchTtlSeconds: number };
  console.log(`  ${JSON.stringify(cfg)}`);
  assert.ok(cfg.radiiKm.length >= 2, "the configuration defines a second wave");
  const km = (p: { latitude: number; longitude: number }) => {
    const r = (x: number) => (x * Math.PI) / 180;
    const h = Math.sin(r(p.latitude - PICKUP.latitude) / 2) ** 2 + Math.cos(r(p.latitude)) * Math.cos(r(PICKUP.latitude)) * Math.sin(r(p.longitude - PICKUP.longitude) / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
  };
  assert.ok(km(FIX_A) < cfg.radiiKm[0] && km(FIX_B) > cfg.radiiKm[0] && km(FIX_B) < cfg.radiiKm[1], "fixture positions straddle the first radius");
  console.log(`  A ${km(FIX_A).toFixed(2)} km, B ${km(FIX_B).toFixed(2)} km from pickup`);

  step("3. Offer channels, then both drivers online with the app's 10 s presence heartbeat");
  const inboxA = offerInbox(A);
  const inboxB = offerInbox(B);
  await Promise.all([inboxA.ready, inboxB.ready]);
  for (const [d, fix] of [[A, FIX_A], [B, FIX_B]] as const) {
    const beat = async () => {
      const r = await d.db.rpc("set_driver_presence", { p_online: true, p_lat: fix.latitude, p_lng: fix.longitude });
      if (r.error) console.log(`  heartbeat ${d.name}: ${r.error.message}`);
    };
    await beat();
    online.push(d);
    heartbeats.push(setInterval(() => void beat(), HEARTBEAT_MS));
  }
  const tokRes = await fetch(`${GATEWAY}/realtime/token`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${B.token}` }, body: JSON.stringify({ scope: `driver:${A.id}:offers` }) });
  assert.strictEqual(tokRes.status, 403, "driver B cannot get driver A's offers channel");
  negatives.push(`driver B -> driver:{A}:offers token: HTTP ${tokRes.status}`);

  step("4. Patient books through create_mission (production params + parser; no jurisdiction from the client)");
  const created = await patient.db.rpc("create_mission", buildCreateMissionParams({
    idempotencyKey: randomUUID(), pickup: PICKUP, vehicleType: "TYPE_C_BLS", urgency: "CAT_1_IMMEDIATE",
    triage: { primary_complaint: "g46b-e2e" }, distanceKm: 4,
  }));
  assert.ifError(created.error);
  const mission = parseCreateMissionResult(created.data);
  assert.ok(mission && isUuid(mission.missionId), "F MISSION_CREATION_FAILURE");
  const MID = mission.missionId;
  missionId = MID;
  assert.ok(["DL", "UP"].includes(mission.jurisdiction), `G JURISDICTION_FAILURE: ${mission.jurisdiction}`);
  assert.strictEqual(mission.status, "requesting");
  const mrow = await patient.db.from("missions").select("patient_id,created_at,status,driver_id").eq("id", MID).single();
  assert.ifError(mrow.error);
  assert.deepStrictEqual([mrow.data.patient_id, mrow.data.status, mrow.data.driver_id], [patient.id, "requesting", null]);
  mark("mission created (missions.created_at)", mrow.data.created_at);
  console.log(`✓ mission ${MID} jurisdiction=${mission.jurisdiction} (server)`);

  step("5. Wave 1 reaches driver A only");
  const offer1 = await inboxA.until("J WAVE1_OFFER_REALTIME_FAILURE", 10_000, () => inboxA.offers.find((x) => x.o.missionId === MID));
  const wave1 = await admin.from("dispatch_waves").select("*").eq("id", offer1.o.offerId).single();
  assert.ifError(wave1.error);
  const w1 = wave1.data;
  assert.deepStrictEqual([w1.mission_id, w1.wave_number, Number(w1.radius_km), w1.status], [MID, 1, cfg.radiiKm[0], "broadcasting"], "H wave 1");
  assert.deepStrictEqual(w1.eligible_driver_ids, [A.id], "wave 1 asks A only (B is outside its radius)");
  assert.strictEqual(offer1.o.waveNumber, 1);
  assert.ok(Math.abs(ms(w1.created_at, offer1.o.issuedAt!)) < 1, "offer issuedAt is the wave's creation instant");
  assert.strictEqual(ms(offer1.o.issuedAt!, offer1.o.expiresAt), cfg.offerTtlSeconds * 1000, "offer TTL");
  assert.ok(Math.abs(ms(w1.created_at, w1.expires_at) - cfg.offerTtlSeconds * 1000) < 1, "a wave expires with its offer (no dead window, 20261003000000)");
  mark("wave 1 created (dispatch_waves.created_at)", w1.created_at);
  mark("wave 1 offer issuedAt", offer1.o.issuedAt!);
  mark("wave 1 offer received by A", offer1.at);
  mark("wave 1 offer expiresAt", offer1.o.expiresAt);
  mark("wave 1 expires_at (window closes)", w1.expires_at);
  assert.strictEqual(inboxB.offers.length, 0, "B got nothing from wave 1");
  console.log(`✓ wave ${w1.id} #1 ${w1.status} r=${w1.radius_km} km eligible=[A]; offer received by A ${offer1.at}`);

  step("6. Negative checks while wave 1 is live (A does NOT accept); patient subscribes");
  await assert.rejects(fetchChannelToken(MID, other.token), /Not authorized/);
  negatives.push("other patient -> mission:{id} token: Not authorized");
  await refuse("anon accept_offer(wave 1)", anon, "accept_offer", { p_offer_id: w1.id, p_client_event_id: randomUUID() }, ["unauthenticated", "42501"]);
  await refuse("driver B accept_offer(wave 1, not offered to B)", B.db, "accept_offer", { p_offer_id: w1.id, p_client_event_id: randomUUID() }, ["not_eligible"]);
  const lifecycle = new Map<string, { m: ParsedLifecycleMessage; at: string }>();
  let onLifecycle: (() => void) | null = null;
  await waitFor<void>("E CHANNEL_AUTH_FAILURE (patient mission)", 10_000, (done) => {
    teardowns.push(mountMissionChannel(MID, patient.token, {
      onStatusChange: () => {}, onTelemetry: () => {}, onLifecycleEvent: () => {},
      onSubscriptionStateChange: (s) => s && done(),
      onLifecycleMessage: (m) => { if (m.eventId) lifecycle.set(m.eventId, { m, at: new Date().toISOString() }); onLifecycle?.(); },
      onError: (e) => console.log(`  patient channel error: ${e.message}`),
    }));
  });

  step("7. Offer TTL passes: A's own offer can no longer be accepted (the wave expires with it)");
  await sleepUntil(Date.parse(offer1.o.expiresAt) + 1000);
  const w1Now = await admin.from("dispatch_waves").select("status").eq("id", w1.id).single();
  await refuse(`driver A accept_offer(own wave 1 after TTL, wave still ${w1Now.data?.status})`, A.db, "accept_offer", { p_offer_id: w1.id, p_client_event_id: randomUUID() }, ["offer_expired"]);

  step(`8. Waiting for the real pg_cron dispatch_tick (wave = offer TTL ${cfg.offerTtlSeconds} s, job every 5 s)`);
  const offer2 = await inboxB.until("WAVE2_OFFER_REALTIME_FAILURE (no escalation observed)", cfg.waveWindowSeconds * 1000 + 75_000, () => inboxB.offers.find((x) => x.o.missionId === MID));
  const revokedA = await inboxA.until("A_REVOKE_REALTIME_FAILURE", 10_000, () => inboxA.revoked.find((x) => x.r.offerId === w1.id));
  const waves = await admin.from("dispatch_waves").select("*").eq("mission_id", MID).order("wave_number");
  assert.ifError(waves.error);
  assert.strictEqual(waves.data.length, 2, "exactly one escalation");
  const [w1After, w2] = waves.data;
  assert.strictEqual(w1After.status, "expired", "wave 1 closed by the tick");
  assert.deepStrictEqual([w2.id, w2.wave_number, Number(w2.radius_km), w2.status], [offer2.o.offerId, 2, cfg.radiiKm[1], "broadcasting"], "wave 2");
  assert.deepStrictEqual(w2.eligible_driver_ids, [B.id], "wave 2 asks B; A (already asked) is excluded");
  assert.ok(Date.parse(w2.created_at) >= Date.parse(w1.expires_at), "wave 2 opened only after wave 1's window");
  assert.strictEqual(revokedA.r.reason, "expired");
  assert.deepStrictEqual([offer2.o.missionId, offer2.o.waveNumber], [MID, 2]);
  assert.ok(Math.abs(ms(w2.created_at, offer2.o.issuedAt!)) < 1, "wave 2 offer issuedAt is the wave's creation instant");
  assert.strictEqual(ms(offer2.o.issuedAt!, offer2.o.expiresAt), cfg.offerTtlSeconds * 1000, "wave 2 offer TTL");
  assert.ok(!inboxA.offers.some((x) => x.o.offerId === w2.id), "A never received wave 2");
  const still = await patient.db.from("missions").select("status,driver_id,state_version").eq("id", MID).single();
  assert.deepStrictEqual([still.data?.status, still.data?.driver_id, still.data?.state_version], ["requesting", null, 1], "escalation writes no mission event");
  mark("wave 2 created = dispatch_tick txn time (dispatch_waves.created_at)", w2.created_at);
  mark("wave 1 revoke (expired) received by A", revokedA.at);
  mark("wave 2 offer issuedAt", offer2.o.issuedAt!);
  mark("wave 2 offer received by B", offer2.at);
  mark("wave 2 offer expiresAt", offer2.o.expiresAt);
  console.log(`✓ wave ${w2.id} #2 ${w2.status} r=${w2.radius_km} km eligible=[B]; wave 1 ${w1After.status}; A revoked (${revokedA.r.reason})`);

  step("9. Negative checks against the escalated state (before B accepts, inside B's TTL)");
  await refuse("driver A accept_offer(wave 2, B's offer)", A.db, "accept_offer", { p_offer_id: w2.id, p_client_event_id: randomUUID() }, ["not_eligible"]);
  await refuse("driver B accept_offer(A's expired wave 1)", B.db, "accept_offer", { p_offer_id: w1.id, p_client_event_id: randomUUID() }, ["not_eligible"]);
  await refuse("driver A accept_offer(own wave 1, now status expired)", A.db, "accept_offer", { p_offer_id: w1.id, p_client_event_id: randomUUID() }, ["offer_expired"]);

  step("10. Driver B accepts wave 2 (driver app's buildServerCall, B's session)");
  const built = buildServerCall({ type: "ACCEPT_DISPATCH", payload: { missionId: MID, driverId: B.id, offerId: w2.id, acceptedAt: new Date().toISOString() } }, randomUUID());
  assert.ok(built.ok && built.call && built.call.rpc === "accept_offer");
  const acceptSent = new Date().toISOString();
  const acc = await B.db.rpc(built.call.rpc, built.call.args);
  assert.ifError(acc.error);
  assert.strictEqual(acc.data.status, "en_route", "K OFFER_ACCEPTANCE_FAILURE");
  const got = lifecycle.get(acc.data.eventId) ?? await waitFor<{ m: ParsedLifecycleMessage; at: string }>("N PATIENT_REALTIME_DELIVERY_FAILURE", 10_000, (done) => {
    onLifecycle = () => { const v = lifecycle.get(acc.data.eventId); if (v) done(v); };
  });
  const ev = await patient.db.from("mission_events").select("id,mission_id,seq,event_type,from_status,to_status,triggered_by,created_at").eq("mission_id", MID).order("seq");
  assert.ifError(ev.error);
  assert.deepStrictEqual(ev.data.map((e) => `${e.seq}:${e.event_type}`), ["1:MISSION_REQUESTED", "2:DRIVER_ACCEPTED"], "event log");
  const e = ev.data[1]!;
  assert.deepStrictEqual([e.id, e.seq, e.from_status, e.to_status, e.triggered_by], [acc.data.eventId, acc.data.seq, "requesting", "en_route", B.id]);
  assert.deepStrictEqual([got.m.eventId, got.m.seq, got.m.event, got.m.missionId, got.m.state, got.m.driverId], [e.id, e.seq, e.event_type, e.mission_id, e.to_status, B.id], "M realtime = persisted");
  assert.ok(Math.abs(ms(e.created_at, got.m.timestamp!)) < 1);
  const after = await patient.db.from("missions").select("status,driver_id,state_version").eq("id", MID).single();
  assert.deepStrictEqual([after.data?.status, after.data?.driver_id, after.data?.state_version], ["en_route", B.id, 2]);
  const w2After = await admin.from("dispatch_waves").select("status,accepted_by").eq("id", w2.id).single();
  assert.deepStrictEqual([w2After.data?.status, w2After.data?.accepted_by], ["accepted", B.id]);
  mark("accept_offer sent by B", acceptSent);
  mark("DRIVER_ACCEPTED persisted (mission_events.created_at)", e.created_at);
  mark("DRIVER_ACCEPTED received by patient", got.at);
  console.log(`✓ en_route, driver B assigned; DRIVER_ACCEPTED seq ${e.seq} ${e.id}; patient received it`);
  await refuse("driver A accept_offer(wave 1) after B took the mission", A.db, "accept_offer", { p_offer_id: w1.id, p_client_event_id: randomUUID() }, ["offer_taken", "offer_expired"]);

  const t = (label: string) => timeline.find(([l]) => l === label)![1];
  const TICK = "wave 2 created = dispatch_tick txn time (dispatch_waves.created_at)";
  console.log("\nDelays (ms):");
  console.log(`  create -> wave 1 offer at A:            ${ms(t("mission created (missions.created_at)"), t("wave 1 offer received by A"))}`);
  console.log(`  offer TTL expiry -> wave window close:  ${ms(t("wave 1 offer expiresAt"), t("wave 1 expires_at (window closes)"))} (offer dead, wave still open)`);
  console.log(`  wave window close -> dispatch_tick:     ${ms(t("wave 1 expires_at (window closes)"), t(TICK))} (scheduler delay)`);
  console.log(`  wave 1 offer expiry -> wave 2 offer:    ${ms(t("wave 1 offer expiresAt"), t("wave 2 offer received by B"))} (nobody can accept)`);
  console.log(`  dispatch_tick -> wave 2 offer at B:     ${ms(t(TICK), t("wave 2 offer received by B"))}`);
  console.log(`  create -> wave 2 offer at B:            ${ms(t("mission created (missions.created_at)"), t("wave 2 offer received by B"))}`);
  console.log(`  accept sent -> patient receipt:         ${ms(t("accept_offer sent by B"), t("DRIVER_ACCEPTED received by patient"))}`);
  console.log("\nG4.6-B WAVE-2 CHECKS PASSED");
} catch (e) {
  failure = e;
}

// Cleanup: stop heartbeats, take both drivers offline (the app's go-offline RPC), end the mission through the patient's own
// cancel (requesting/en_route are cancellable), close realtime, then remove exact ids.
for (const h of heartbeats) clearInterval(h);
for (const d of online) {
  const r = await d.db.rpc("set_driver_presence", { p_online: false });
  if (r.error) console.log(`offline ${d.name}: ${r.error.message}`);
}
if (missionId) {
  const s = await patient.db.from("missions").select("status").eq("id", missionId).single();
  if (s.data && !["completed", "cancelled"].includes(s.data.status)) {
    const r = await patient.db.rpc("cancel_mission", { p_mission_id: missionId, p_reason: "other", p_note: "G4.6-B cleanup" });
    console.log(`cleanup: mission ${s.data.status} -> ${r.error ? `FAILED ${r.error.message}` : r.data.status}`);
  }
}
for (const t of teardowns) t();
for (const s of sessions) await s.auth.signOut().catch(() => {});
if (uploaded.length) {
  const rm = await admin.storage.from(KYC_BUCKET).remove(uploaded);
  if (rm.error) console.log(`storage remove: ${rm.error.message}`);
}
const remaining: string[] = [];
for (const [label, id] of Object.entries(users)) {
  await admin.auth.admin.deleteUser(id);
  if ((await admin.auth.admin.getUserById(id)).data.user) remaining.push(`auth.users/profiles ${id} (${label}): referenced by append-only mission data`);
}
for (const p of uploaded) {
  const [dir, file] = [p.slice(0, p.lastIndexOf("/")), p.slice(p.lastIndexOf("/") + 1)];
  if ((await admin.storage.from(KYC_BUCKET).list(dir)).data?.some((o) => o.name === file)) remaining.push(`storage ${p}`);
}
if (missionId) remaining.push(`missions ${missionId} + its mission_events and dispatch_waves: append-only by design`);

console.log(`\nTimeline:\n  ${timeline.map(([l, iso]) => `${iso}  ${l}`).join("\n  ")}`);
console.log(`\nNegative checks (${negatives.length}):\n  ${negatives.join("\n  ")}`);
console.log(`IDs: ${JSON.stringify({ users, missionId })}`);
console.log(`Remaining after cleanup (supabase db reset clears it but also wipes the Vault secrets):\n  ${remaining.join("\n  ") || "none"}`);
if (failure) {
  console.log("G4.6-B FAILED");
  throw failure;
}
process.exit(0);
