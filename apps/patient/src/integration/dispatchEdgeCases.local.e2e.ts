import assert from "node:assert";
import { randomInt, randomUUID } from "node:crypto";
import { registerHooks } from "node:module";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isUuid, type DispatchOffer, type DispatchOfferRevoked, type ParsedLifecycleMessage } from "@sahayak/domain";
import { buildCreateMissionParams, mapRpcError, parseCreateMissionResult } from "../lib/missionApi.core.ts";

/**
 * G4.7-A: dispatch edge cases on the LOCAL stack, driven only by the production scheduler and RPCs.
 *
 *   M1 (site 1): A (wave 1 only), B (wave 2 only), C (wave 3 only). Nobody accepts; A declines wave 1. pg_cron's
 *       dispatch_tick opens waves 2 and 3, then marks wave 3 `exhausted` with the request still `requesting` (-2), then
 *       closes the search window (searchTtlSeconds from creation) with the system cancel (no_ambulance_available).
 *   M4 (site 3): nobody within the last radius (F is online ~11 km out): create_mission itself exhausts and cancels.
 *   M2 (site 2): X declines, then accepts the same offer (decline is not binding).
 *   M3 (site 2): created while X is en_route on M2 with a live heartbeat: X is not asked and cannot accept (G4.7-B
 *       busy-driver guard, migration 20261001000000); Y is asked and takes it.
 *   MB/MA (site 2): MB is offered to X while free; X takes MA; X's accept of MB is refused (already_on_mission); Y takes MB.
 *   MC1/MC2 (site 2): X accepts both concurrently; exactly one wins.
 *
 * Nothing here inserts a wave, offer or event, updates a status, calls dispatch_tick / dispatch_next_wave, or publishes.
 * The service key only creates the throwaway users and reads rows a caller's RLS hides (dispatch_waves, drivers).
 *
 * Not part of `pnpm test`. LOCAL only. Needs the local Vault secrets centrifugo_api_url/_api_key and the pg_cron job.
 * Takes ~8 minutes (the search window is 345 s and the job runs every minute). Same env as dispatchWave2.local.e2e.ts:
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node --experimental-strip-types apps/patient/src/integration/dispatchEdgeCases.local.e2e.ts
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
type Pt = { latitude: number; longitude: number };
// All three pickups are inside DL. 0.009 deg of latitude is ~1 km. Sites are >16 km apart so no driver is in range of
// another site's pickup; every position is asserted against dispatch_config() below, not assumed.
const SITE1: Pt = { latitude: 28.5672, longitude: 77.21 };
const SITE2: Pt = { latitude: 28.59, longitude: 77.04 };
const SITE3: Pt = { latitude: 28.85, longitude: 77.1 };
const FIX: Record<"A" | "B" | "C" | "X" | "Y" | "F", Pt> = {
  A: { latitude: 28.5752, longitude: 77.21 }, // ~0.9 km from site 1
  B: { latitude: 28.6072, longitude: 77.21 }, // ~4.4 km
  C: { latitude: 28.6392, longitude: 77.21 }, // ~8.0 km
  X: { latitude: 28.595, longitude: 77.04 }, // ~0.6 km from site 2
  Y: { latitude: 28.59, longitude: 77.05 }, // ~1.0 km from site 2
  F: { latitude: 28.751, longitude: 77.1 }, // ~11.0 km from site 3
};
const HEARTBEAT_MS = 10_000;

type Actor = { name: string; id: string; db: SupabaseClient; token: string };
type Wave = { id: string; mission_id: string; wave_number: number; radius_km: number; eligible_driver_ids: string[]; status: string; created_at: string; expires_at: string; accepted_by: string | null };
const users: Record<string, string> = {};
const names = new Map<string, string>();
const uploaded: string[] = [];
const teardowns: Array<() => void> = [];
const sessions: SupabaseClient[] = [];
const negatives: string[] = [];
const findings: string[] = [];
const missions: Array<{ label: string; id: string; patient: Actor; createdAt: string }> = [];
const ms = (a: string, b: string) => Date.parse(b) - Date.parse(a);
const now = () => new Date().toISOString();
const km = (p: Pt, q: Pt) => {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(q.latitude - p.latitude) / 2) ** 2 + Math.cos(r(p.latitude)) * Math.cos(r(q.latitude)) * Math.sin(r(q.longitude - p.longitude) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};
const who = (ids: string[]) => ids.map((id) => names.get(id) ?? id);

async function user(label: string, role?: "driver" | "staff"): Promise<Actor> {
  const email = `g47a-${label.toLowerCase()}-${tag.toLowerCase()}@example.test`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email, password, phone: `91983${randomInt(1e6, 1e7 - 1)}`, email_confirm: true, phone_confirm: true,
    ...(role ? { app_metadata: { role } } : {}),
  });
  assert.ifError(error);
  users[label] = data.user!.id;
  names.set(data.user!.id, label);
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
const sleep = (n: number) => new Promise((r) => setTimeout(r, n));
const sleepUntil = (epochMs: number) => sleep(Math.max(0, epochMs - Date.now()));

/** Application RPC, vehicle, three KYC PDFs, submit_kyc, staff_approve_kyc: the production verification path. */
async function verify(d: Actor, staff: Actor) {
  const suffix = d.name;
  assert.ifError((await d.db.rpc("upsert_driver_application", { p_fields: { licenseNumber: `G47A-${tag}-${suffix}`, ais125Type: "TYPE_C_BLS", dlExpiry: "2031-01-01", emtLevel: "EMT_B" } })).error);
  assert.ifError((await d.db.from("driver_vehicles").insert({ driver_id: d.id, registration_number: `G47A${tag}${suffix}`, ais125_type: "TYPE_C_BLS" })).error);
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
  assert.strictEqual(ok.data?.kycStatus, "approved", `DRIVER_FIXTURE_FAILURE ${d.name}`);
}

/** Offers and revocations a driver receives on driver:{id}:offers, with local receipt times. */
function offerInbox(d: Actor) {
  const offers: Array<{ o: DispatchOffer; at: string }> = [];
  const revoked: Array<{ r: DispatchOfferRevoked; at: string }> = [];
  const waiters: Array<() => void> = [];
  const ready = waitFor<void>(`CHANNEL_AUTH_FAILURE (${d.name} offers)`, 10_000, (done) => {
    teardowns.push(mountOffersChannel(d.id, d.token, {
      onOffer: (o) => { offers.push({ o, at: now() }); waiters.forEach((w) => w()); },
      onRevoked: (r) => { revoked.push({ r, at: now() }); waiters.forEach((w) => w()); },
      onSubscribed: () => done(),
    }));
  });
  const until = <T>(label: string, timeoutMs: number, find: () => T | undefined): Promise<T> => {
    const hit = find();
    if (hit !== undefined) return Promise.resolve(hit);
    return waitFor<T>(label, timeoutMs, (done) => waiters.push(() => { const v = find(); if (v !== undefined) done(v); }));
  };
  const offerFor = (missionId: string, timeoutMs: number) => until(`${d.name}: no offer for ${missionId}`, timeoutMs, () => offers.find((x) => x.o.missionId === missionId));
  return { d, offers, revoked, ready, until, offerFor };
}
type Inbox = ReturnType<typeof offerInbox>;

/** Lifecycle messages a patient receives on mission:{id}. */
async function missionFeed(missionId: string, p: Actor) {
  const got: Array<{ m: ParsedLifecycleMessage; at: string }> = [];
  const waiters: Array<() => void> = [];
  await waitFor<void>(`CHANNEL_AUTH_FAILURE (${p.name} mission)`, 10_000, (done) => {
    teardowns.push(mountMissionChannel(missionId, p.token, {
      onStatusChange: () => {}, onTelemetry: () => {}, onLifecycleEvent: () => {},
      onSubscriptionStateChange: (s) => s && done(),
      onLifecycleMessage: (m) => { got.push({ m, at: now() }); waiters.forEach((w) => w()); },
      onError: (e) => console.log(`  ${p.name} channel error: ${e.message}`),
    }));
  });
  const event = (type: string, timeoutMs: number) => {
    const find = () => got.find((x) => x.m.event === type);
    const hit = find();
    if (hit) return Promise.resolve(hit);
    return waitFor<{ m: ParsedLifecycleMessage; at: string }>(`PATIENT_REALTIME ${type} on ${missionId}`, timeoutMs, (done) => waiters.push(() => { const v = find(); if (v) done(v); }));
  };
  return { got, event };
}

async function refuse(label: string, db: SupabaseClient, rpc: string, args: object, codes: string[]) {
  const r = await db.rpc(rpc, args);
  assert.ok(r.error, `${label}: expected a refusal, got ${JSON.stringify(r.data)}`);
  const code = mapRpcError(r.error).code;
  const hit = codes.find((c) => c === code || c === r.error.code || r.error.message.includes(c));
  assert.ok(hit, `${label}: got ${code}/${r.error.code} ${r.error.message}`);
  negatives.push(`${label}: ${hit} (${r.error.code})`);
}

async function wavesOf(missionId: string): Promise<Wave[]> {
  const r = await admin.from("dispatch_waves").select("*").eq("mission_id", missionId).order("wave_number");
  assert.ifError(r.error);
  return r.data as Wave[];
}
async function eventsOf(missionId: string, db: SupabaseClient) {
  const r = await db.from("mission_events").select("id,mission_id,seq,event_type,from_status,to_status,triggered_by,actor_role,metadata,created_at").eq("mission_id", missionId).order("seq");
  assert.ifError(r.error);
  return r.data;
}
async function missionRow(missionId: string, db: SupabaseClient) {
  const r = await db.from("missions").select("id,status,driver_id,state_version,created_at,cancelled_at,cancelled_by,cancel_reason,cancel_note").eq("id", missionId).single();
  assert.ifError(r.error);
  return r.data;
}

async function book(label: string, p: Actor, pickup: Pt) {
  const created = await p.db.rpc("create_mission", buildCreateMissionParams({
    idempotencyKey: randomUUID(), pickup, vehicleType: "TYPE_C_BLS", urgency: "CAT_1_IMMEDIATE",
    triage: { primary_complaint: `g47a-${label}` }, distanceKm: 4,
  }));
  assert.ifError(created.error);
  const parsed = parseCreateMissionResult(created.data);
  assert.ok(parsed && isUuid(parsed.missionId), `MISSION_CREATION_FAILURE ${label}: ${JSON.stringify(created.data)}`);
  const row = await missionRow(parsed.missionId, p.db);
  missions.push({ label, id: parsed.missionId, patient: p, createdAt: row.created_at });
  return { parsed, row };
}

/** A driver-app call through the app's own mapper (buildServerCall), on the driver's session. */
async function driverCall(d: Actor, event: Parameters<typeof buildServerCall>[0]) {
  const built = buildServerCall(event, randomUUID());
  assert.ok(built.ok && built.call, `buildServerCall ${event.type}`);
  return d.db.rpc(built.call.rpc, built.call.args);
}
const accept = (d: Actor, missionId: string, offerId: string) =>
  driverCall(d, { type: "ACCEPT_DISPATCH", payload: { missionId, driverId: d.id, offerId, acceptedAt: now() } });
const decline = (d: Actor, missionId: string, offerId: string) =>
  driverCall(d, { type: "DECLINE_DISPATCH", payload: { missionId, driverId: d.id, offerId, reason: "too_far", declinedAt: now() } });

const step = (s: string) => console.log(`\n${s}`);
let failure: unknown;
const heartbeats: Array<ReturnType<typeof setInterval>> = [];
const online: Actor[] = [];
const inboxes: Inbox[] = [];
try {
  step("1. Actors (real GoTrue sessions); six drivers verified through the production KYC path");
  const patient = await user("patient1");
  const patient2 = await user("patient2");
  const patient3 = await user("patient3");
  const patient4 = await user("patient4");
  const other = await user("otherPatient");
  const staff = await user("staff", "staff");
  const D = {} as Record<keyof typeof FIX, Actor>;
  for (const k of Object.keys(FIX) as Array<keyof typeof FIX>) {
    D[k] = await user(k, "driver");
    await verify(D[k], staff);
  }
  const { A, B, C, X, Y, F } = D;
  console.log(`✓ ${JSON.stringify(users)}`);

  step("2. Dispatch configuration (from the server) and fixture geometry against it");
  const cfgRes = await patient.db.rpc("dispatch_config");
  assert.ifError(cfgRes.error);
  const cfg = cfgRes.data as { offerTtlSeconds: number; waveWindowSeconds: number; radiiKm: number[]; boardRadiiKm: number[]; searchTtlSeconds: number };
  console.log(`  dispatch_config() = ${JSON.stringify(cfg)}`);
  assert.strictEqual(cfg.radiiKm.length, 3, "three waves configured");
  const [r1, r2, r3] = cfg.radiiKm as [number, number, number];
  const inBand = (p: Pt, s: Pt, lo: number, hi: number) => km(p, s) > lo && km(p, s) < hi;
  assert.ok(inBand(FIX.A, SITE1, 0, r1) && inBand(FIX.B, SITE1, r1, r2) && inBand(FIX.C, SITE1, r2, r3), "A/B/C straddle the three radii");
  assert.ok(inBand(FIX.X, SITE2, 0, r1) && inBand(FIX.Y, SITE2, 0, r1), "X/Y inside site 2's first radius");
  assert.ok(inBand(FIX.F, SITE3, r3 + 0.5, r3 + 2), "F just outside site 3's last radius");
  const home: Record<string, Pt> = { A: SITE1, B: SITE1, C: SITE1, X: SITE2, Y: SITE2, F: SITE3 };
  for (const [k, p] of Object.entries(FIX)) for (const s of [SITE1, SITE2, SITE3]) {
    if (s !== home[k]) assert.ok(km(p, s) > r3 + 1, `${k} is out of range of every other site`);
    if (s === SITE3) assert.ok(km(p, s) > r3, `${k} is out of range of site 3`);
  }
  for (const k of Object.keys(FIX)) console.log(`  ${k} ${km(FIX[k as keyof typeof FIX], home[k]!).toFixed(3)} km from its site (haversine)`);

  step("3. Offer channels, then all six drivers online with the app's 10 s presence heartbeat");
  for (const d of Object.values(D)) inboxes.push(offerInbox(d));
  await Promise.all(inboxes.map((i) => i.ready));
  const inbox = Object.fromEntries(inboxes.map((i) => [i.d.name, i])) as Record<keyof typeof FIX, Inbox>;
  for (const d of Object.values(D)) {
    const fix = FIX[d.name as keyof typeof FIX];
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

  // ------------------------------------------------------------------ M1: waves 1-3, exhaustion, search window
  step("4. M1 (site 1): patient books; wave 1 reaches A only");
  const m1 = await book("M1", patient, SITE1);
  const M1 = m1.parsed.missionId;
  assert.deepStrictEqual([m1.row.status, m1.row.driver_id, m1.row.state_version], ["requesting", null, 1]);
  const feed1 = await missionFeed(M1, patient);
  const o1 = await inbox.A.offerFor(M1, 10_000);
  const w1 = (await wavesOf(M1))[0]!;
  assert.deepStrictEqual([w1.id, w1.wave_number, Number(w1.radius_km), w1.status, w1.eligible_driver_ids], [o1.o.offerId, 1, r1, "broadcasting", [A.id]], "wave 1");
  assert.ok(Math.abs(o1.o.distanceKm! - km(FIX.A, SITE1)) < 0.06, `server distance A ${o1.o.distanceKm} vs ${km(FIX.A, SITE1)}`);
  console.log(`✓ M1 ${M1}; wave 1 ${w1.id} r=${w1.radius_km} eligible=[A]; server distanceKm A=${o1.o.distanceKm}`);

  step("5. Negative checks on M1 wave 1");
  await assert.rejects(fetchChannelToken(M1, other.token), /Not authorized/);
  negatives.push("other patient -> mission:{M1} token: Not authorized");
  await refuse("anon accept_offer(M1 wave 1)", anon, "accept_offer", { p_offer_id: w1.id, p_client_event_id: randomUUID() }, ["unauthenticated", "42501"]);
  await refuse("driver C (outside wave 1 radius) accept_offer(M1 wave 1)", C.db, "accept_offer", { p_offer_id: w1.id, p_client_event_id: randomUUID() }, ["not_eligible"]);

  step("6. decline_offer on M1 wave 1 by A (driver app DECLINE_DISPATCH mapping)");
  const w1Before = (await wavesOf(M1))[0]!;
  const dec1 = await decline(A, M1, w1.id);
  assert.ifError(dec1.error);
  assert.deepStrictEqual(dec1.data, { ok: true }, "decline_offer returns {ok:true}");
  await sleep(2000);
  assert.deepStrictEqual((await wavesOf(M1))[0], w1Before, "decline leaves the wave row untouched (still broadcasting)");
  const m1AfterDecline = await missionRow(M1, patient.db);
  assert.deepStrictEqual([m1AfterDecline.status, m1AfterDecline.state_version], ["requesting", 1], "decline writes no mission state");
  assert.deepStrictEqual((await eventsOf(M1, patient.db)).map((e) => e.event_type), ["MISSION_REQUESTED"], "decline persists no event");
  assert.ok(!inbox.A.revoked.some((x) => x.r.offerId === w1.id), "decline sends no offer_revoked");
  assert.strictEqual(feed1.got.length, 0, "decline publishes nothing to the patient");
  findings.push(`decline_offer(M1 wave 1, A) -> ${JSON.stringify(dec1.data)}; wave row identical (status ${w1Before.status}), state_version 1, no event, no revoke, no patient publish`);

  // ------------------------------------------------------------------ M4: nobody in range anywhere
  step("7. M4 (site 3): no driver within the last radius (F online at ~11 km)");
  const fRow = await admin.from("drivers").select("is_online,is_verified,ais125_type,last_seen_at").eq("id", F.id).single();
  assert.ifError(fRow.error);
  assert.ok(fRow.data.is_online && fRow.data.is_verified && fRow.data.ais125_type === "TYPE_C_BLS" && ms(fRow.data.last_seen_at, now()) < 30_000, "F is present to dispatch (online, verified, fresh)");
  const m4 = await book("M4", patient4, SITE3);
  const M4 = m4.parsed.missionId;
  const feed4 = await missionFeed(M4, patient4);
  const w4 = await wavesOf(M4);
  const ev4 = await eventsOf(M4, patient4.db);
  const row4 = await missionRow(M4, patient4.db);
  console.log(`  create_mission -> status=${m4.parsed.status} stateVersion=${m4.parsed.stateVersion}`);
  console.log(`  waves: ${w4.map((w) => `#${w.wave_number} r=${w.radius_km} ${w.status} eligible=${w.eligible_driver_ids.length} created=${w.created_at} expires=${w.expires_at}`).join("; ")}`);
  console.log(`  events: ${ev4.map((e) => `${e.seq}:${e.event_type} ${e.from_status}->${e.to_status} by=${e.triggered_by} role=${e.actor_role} ${JSON.stringify(e.metadata)}`).join("; ")}`);
  console.log(`  mission: ${JSON.stringify(row4)}`);
  assert.strictEqual(m4.parsed.status, "cancelled", "create_mission returns the mission already cancelled");
  assert.deepStrictEqual(w4.map((w) => [w.wave_number, Number(w.radius_km), w.status, w.eligible_driver_ids.length]), [[1, r1, "expired", 0], [2, r2, "expired", 0], [3, r3, "exhausted", 0]]);
  assert.ok(w4.every((w) => w.created_at === row4.created_at), "all three waves were written in the create_mission transaction (no scheduler)");
  assert.deepStrictEqual(ev4.map((e) => [e.seq, e.event_type, e.from_status, e.to_status, e.triggered_by, e.actor_role]), [[1, "MISSION_REQUESTED", "requesting", "requesting", patient4.id, "patient"], [2, "MISSION_CANCELLED", "requesting", "cancelled", null, "system"]]);
  assert.deepStrictEqual(ev4[1]!.metadata, { cancelledBy: "system", reason: "no_ambulance_available", fromState: "requesting" });
  assert.deepStrictEqual([row4.status, row4.driver_id, row4.state_version, row4.cancelled_by, row4.cancel_reason, row4.cancel_note], ["cancelled", null, 2, "system", "other", "no_ambulance_available"]);
  assert.ok(!inbox.F.offers.some((x) => x.o.missionId === M4), "F (~11 km) was not offered M4");
  await sleep(3000);
  const rc4 = await patient4.db.rpc("cancel_mission", { p_mission_id: M4, p_reason: "other" });
  negatives.push(`patient4 cancel_mission(M4, already system-cancelled): ${JSON.stringify(rc4.data ?? rc4.error)}`);
  findings.push(`M4 exhausted inside create_mission: waves [expired, expired, exhausted], 0 eligible each, created_at == missions.created_at; MISSION_CANCELLED seq 2 (system). Patient subscribed right after creation received ${feed4.got.length} lifecycle message(s)`);

  // ------------------------------------------------------------------ M2: decline then accept the same offer
  step("8. M2 (site 2): X declines, then accepts the same offer inside its TTL");
  const m2 = await book("M2", patient2, SITE2);
  const M2 = m2.parsed.missionId;
  const ox2 = await inbox.X.offerFor(M2, 10_000);
  await inbox.Y.offerFor(M2, 10_000);
  const w2m2 = (await wavesOf(M2))[0]!;
  assert.deepStrictEqual([w2m2.wave_number, w2m2.status, [...w2m2.eligible_driver_ids].sort()], [1, "broadcasting", [X.id, Y.id].sort()]);
  const dec2 = await decline(X, M2, w2m2.id);
  assert.ifError(dec2.error);
  assert.deepStrictEqual(dec2.data, { ok: true });
  await refuse("X decline_offer(M2, invalid reason)", X.db, "decline_offer", { p_offer_id: w2m2.id, p_reason: "nope" }, ["invalid_reason"]);
  await refuse("C decline_offer(M2, not offered to C)", C.db, "decline_offer", { p_offer_id: w2m2.id, p_reason: "other" }, ["offer_not_found"]);
  await refuse("anon decline_offer(M2)", anon, "decline_offer", { p_offer_id: w2m2.id, p_reason: "other" }, ["unauthenticated", "42501"]);
  assert.deepStrictEqual((await wavesOf(M2))[0], w2m2, "M2 wave untouched by the decline");
  assert.ok(Date.now() < Date.parse(ox2.o.expiresAt) - 500, "still inside X's offer TTL");
  const acc2 = await accept(X, M2, w2m2.id);
  assert.ifError(acc2.error);
  assert.strictEqual(acc2.data.status, "en_route", "X accepts the offer it declined");
  const yRev = await inbox.Y.until("Y revoke (taken)", 10_000, () => inbox.Y.revoked.find((x) => x.r.offerId === w2m2.id));
  assert.strictEqual(yRev.r.reason, "taken");
  await refuse("driver Y accept_offer(M2, taken by X)", Y.db, "accept_offer", { p_offer_id: w2m2.id, p_client_event_id: randomUUID() }, ["offer_taken"]);
  findings.push(`decline_offer(M2, X) -> {ok:true}; X then accept_offer(same offer) -> en_route seq ${acc2.data.seq}: a decline is not binding`);
  console.log(`✓ M2 ${M2} en_route with X after X declined`);

  // ------------------------------------------------------------------ M3: X is busy on M2 (G4.7-B busy-driver guard)
  const activeOf = async (d: Actor) => {
    const r = await admin.from("missions").select("id").eq("driver_id", d.id).not("status", "in", "(completed,cancelled)");
    assert.ifError(r.error);
    return r.data.map((x) => x.id as string);
  };
  /** A refused accept must leave the mission, its wave and its event log exactly as they were, and publish nothing. */
  const unchanged = async (label: string, missionId: string, p: Actor, feed: Awaited<ReturnType<typeof missionFeed>>, wave: Wave) => {
    const row = await missionRow(missionId, p.db);
    assert.deepStrictEqual([row.status, row.driver_id, row.state_version], ["requesting", null, 1], `${label}: mission unchanged`);
    assert.deepStrictEqual((await eventsOf(missionId, p.db)).map((e) => e.event_type), ["MISSION_REQUESTED"], `${label}: no event`);
    assert.deepStrictEqual((await wavesOf(missionId))[0], wave, `${label}: wave row unchanged (broadcasting, accepted_by null)`);
    await sleep(1500);
    assert.strictEqual(feed.got.length, 0, `${label}: nothing published to the patient`);
  };
  /** The patient receives the persisted DRIVER_ACCEPTED, exactly once, naming the driver who took it. */
  const acceptedBy = async (label: string, missionId: string, p: Actor, feed: Awaited<ReturnType<typeof missionFeed>>, d: Actor, eventId: string) => {
    const got = await feed.event("DRIVER_ACCEPTED", 10_000);
    const ev = await eventsOf(missionId, p.db);
    assert.deepStrictEqual(ev.map((e) => [e.seq, e.event_type, e.triggered_by]), [[1, "MISSION_REQUESTED", p.id], [2, "DRIVER_ACCEPTED", d.id]], `${label}: event log`);
    assert.deepStrictEqual([got.m.eventId, got.m.seq, got.m.state, got.m.driverId, got.m.missionId], [eventId, 2, "en_route", d.id, missionId], `${label}: realtime = persisted`);
    assert.ok(Math.abs(ms(ev[1]!.created_at, got.m.timestamp!)) < 1);
    await sleep(1000);
    assert.strictEqual(feed.got.length, 1, `${label}: exactly one lifecycle message`);
  };

  step("9. M3 (site 2) while X is en_route on M2 with a live heartbeat: X is not asked; Y is");
  const m3 = await book("M3", patient3, SITE2);
  const M3 = m3.parsed.missionId;
  const feed3 = await missionFeed(M3, patient3);
  const oy3 = await inbox.Y.offerFor(M3, 10_000);
  const w1m3 = (await wavesOf(M3))[0]!;
  assert.deepStrictEqual([w1m3.wave_number, w1m3.status, w1m3.eligible_driver_ids], [1, "broadcasting", [Y.id]], "busy X is not in M3 wave 1; free Y is");
  await sleep(2000);
  assert.ok(!inbox.X.offers.some((x) => x.o.missionId === M3), "busy X received no M3 offer");
  await refuse("busy X accept_offer(M3 wave 1, not offered to X)", X.db, "accept_offer", { p_offer_id: w1m3.id, p_client_event_id: randomUUID() }, ["already_on_mission"]);
  await refuse("busy X claim_emergency(M3)", X.db, "claim_emergency", { p_mission_id: M3, p_client_event_id: randomUUID() }, ["already_on_mission"]);
  await refuse("busy X accept_offer(M1 wave 1, another mission's offer)", X.db, "accept_offer", { p_offer_id: w1.id, p_client_event_id: randomUUID() }, ["already_on_mission"]);
  await unchanged("M3 after X's refused accept", M3, patient3, feed3, w1m3);
  assert.ok(Date.now() < Date.parse(oy3.o.expiresAt) - 500, "still inside Y's offer TTL");
  const acc3 = await accept(Y, M3, w1m3.id);
  assert.ifError(acc3.error);
  assert.strictEqual(acc3.data.status, "en_route", "Y takes M3");
  await acceptedBy("M3", M3, patient3, feed3, Y, acc3.data.eventId);
  assert.deepStrictEqual(await activeOf(X), [M2], "X still holds M2 only");
  findings.push(`busy X (en_route on M2): not in M3 wave 1 (eligible=${JSON.stringify(who(w1m3.eligible_driver_ids))}), no realtime offer; accept_offer -> already_on_mission; M3 unchanged; Y accepted M3 (seq ${acc3.data.seq}) and patient3 received DRIVER_ACCEPTED driverId=Y once`);

  step("9b. Free X and Y through the patients' own cancel_mission");
  for (const [p, id] of [[patient2, M2], [patient3, M3]] as const) {
    const r = await p.db.rpc("cancel_mission", { p_mission_id: id, p_reason: "other", p_note: "G4.7-B free the crew" });
    assert.ifError(r.error);
  }
  assert.deepStrictEqual([await activeOf(X), await activeOf(Y)], [[], []], "X and Y are free");

  // ------------------------------------------------------------------ R: X becomes busy after MB's offer was sent
  step("9c. Race: MB offered to free X and Y; X takes MA first; X's accept of MB is refused; Y takes MB");
  const mb = await book("MB", patient2, SITE2);
  const MB = mb.parsed.missionId;
  const feedB = await missionFeed(MB, patient2);
  const ma = await book("MA", patient3, SITE2);
  const MA = ma.parsed.missionId;
  const oxB = await inbox.X.offerFor(MB, 10_000);
  await inbox.X.offerFor(MA, 10_000);
  await inbox.Y.offerFor(MB, 10_000);
  const wB = (await wavesOf(MB))[0]!;
  const wA = (await wavesOf(MA))[0]!;
  assert.deepStrictEqual([[...wB.eligible_driver_ids].sort(), [...wA.eligible_driver_ids].sort()], [[X.id, Y.id].sort(), [X.id, Y.id].sort()], "both offers went to free X and Y");
  const accA = await accept(X, MA, wA.id);
  assert.ifError(accA.error);
  assert.strictEqual(accA.data.status, "en_route", "X takes MA");
  assert.ok(Date.now() < Date.parse(oxB.o.expiresAt) - 500, "X's MB offer is still inside its TTL: only the busy check can refuse it");
  const refusedB = await accept(X, MB, wB.id);
  assert.ok(refusedB.error, `X accept_offer(MB) after taking MA must be refused, got ${JSON.stringify(refusedB.data)}`);
  assert.strictEqual(refusedB.error.message, "already_on_mission");
  assert.strictEqual(refusedB.error.code, "PT409");
  negatives.push(`X accept_offer(MB, offered while free, X now on MA): ${refusedB.error.message} (${refusedB.error.code})`);
  await unchanged("MB after X's refused accept", MB, patient2, feedB, wB);
  const accB = await accept(Y, MB, wB.id);
  assert.ifError(accB.error);
  assert.strictEqual(accB.data.status, "en_route", "Y still takes MB");
  await acceptedBy("MB", MB, patient2, feedB, Y, accB.data.eventId);
  const xRevB = await inbox.X.until("X revoke MB (taken)", 10_000, () => inbox.X.revoked.find((x) => x.r.offerId === wB.id));
  assert.strictEqual(xRevB.r.reason, "taken");
  assert.deepStrictEqual([await activeOf(X), await activeOf(Y)], [[MA], [MB]], "one active mission each");
  findings.push(`race: MB offered to X while free; X accepted MA; X accept_offer(MB) inside its TTL -> already_on_mission PT409; MB unchanged (requesting v1, wave broadcasting, no event, no publish); Y accepted MB; patient2 got one DRIVER_ACCEPTED driverId=Y; X got offer_revoked/taken`);

  step("9d. Concurrent double-accept (Promise.all; does not prove the calls overlapped, the psql two-session harness does)");
  for (const [p, id] of [[patient3, MA], [patient2, MB]] as const) {
    const r = await p.db.rpc("cancel_mission", { p_mission_id: id, p_reason: "other", p_note: "G4.7-B free the crew" });
    assert.ifError(r.error);
  }
  const mc1 = (await book("MC1", patient2, SITE2)).parsed.missionId;
  const mc2 = (await book("MC2", patient3, SITE2)).parsed.missionId;
  await inbox.X.offerFor(mc1, 10_000);
  await inbox.X.offerFor(mc2, 10_000);
  const [wc1, wc2] = [(await wavesOf(mc1))[0]!, (await wavesOf(mc2))[0]!];
  const both = await Promise.all([accept(X, mc1, wc1.id), accept(X, mc2, wc2.id)]);
  const outcomes = both.map((r) => (r.error ? r.error.message : r.data.status));
  assert.deepStrictEqual([...outcomes].sort(), ["already_on_mission", "en_route"], `exactly one concurrent accept wins: ${outcomes}`);
  assert.strictEqual((await activeOf(X)).length, 1, "X holds one mission");
  findings.push(`Promise.all double-accept by X on MC1/MC2 -> ${JSON.stringify(outcomes)}; X holds 1 active mission`);

  // ------------------------------------------------------------------ M1 escalation, driven by pg_cron
  step("10. M1: A's offer TTL passes; A can no longer accept (wave still open)");
  await sleepUntil(Date.parse(o1.o.expiresAt) + 1000);
  await refuse("driver A accept_offer(own M1 wave 1 after TTL)", A.db, "accept_offer", { p_offer_id: w1.id, p_client_event_id: randomUUID() }, ["offer_expired"]);

  step(`11. M1 wave 2 (waiting for pg_cron dispatch_tick; window ${cfg.waveWindowSeconds} s, job every minute)`);
  const o2 = await inbox.B.offerFor(M1, cfg.waveWindowSeconds * 1000 + 80_000);
  let ws1 = await wavesOf(M1);
  const w2 = ws1[1]!;
  assert.deepStrictEqual([ws1.length, ws1[0]!.status], [2, "expired"]);
  assert.deepStrictEqual([w2.id, w2.wave_number, Number(w2.radius_km), w2.status, w2.eligible_driver_ids], [o2.o.offerId, 2, r2, "broadcasting", [B.id]], "wave 2 asks B only; A (asked, declined, heartbeat alive) excluded");
  assert.ok(Date.parse(w2.created_at) >= Date.parse(w1.expires_at), "the decline did not speed escalation: wave 2 opened after wave 1's full window");
  assert.ok(Math.abs(o2.o.distanceKm! - km(FIX.B, SITE1)) < 0.06, `server distance B ${o2.o.distanceKm}`);
  await refuse("driver A accept_offer(M1 wave 2, B's offer)", A.db, "accept_offer", { p_offer_id: w2.id, p_client_event_id: randomUUID() }, ["not_eligible"]);
  console.log(`✓ wave 2 ${w2.id} r=${w2.radius_km} eligible=[B] created ${w2.created_at}; server distanceKm B=${o2.o.distanceKm}`);

  step("12. M1 wave 3 (next tick after wave 2's window)");
  const o3 = await inbox.C.offerFor(M1, cfg.waveWindowSeconds * 1000 + 80_000);
  ws1 = await wavesOf(M1);
  const w3 = ws1[2]!;
  assert.deepStrictEqual(ws1.map((w) => w.status), ["expired", "expired", "broadcasting"]);
  assert.deepStrictEqual([w3.id, w3.wave_number, Number(w3.radius_km), w3.eligible_driver_ids], [o3.o.offerId, 3, r3, [C.id]], "wave 3 = third radius, asks C only");
  assert.ok(Math.abs(o3.o.distanceKm! - km(FIX.C, SITE1)) < 0.06, `server distance C ${o3.o.distanceKm}`);
  assert.ok(o3.o.distanceKm! > r2 && o3.o.distanceKm! <= r3, "C sits in the third band by the server's own distance");
  assert.strictEqual(ms(o3.o.issuedAt!, o3.o.expiresAt), cfg.offerTtlSeconds * 1000, "wave 3 offer TTL");
  assert.ok(Math.abs(ms(w3.created_at, o3.o.issuedAt!)) < 1, "offer issuedAt = wave created_at");
  assert.ok(Math.abs(ms(w3.created_at, w3.expires_at) - cfg.waveWindowSeconds * 1000) < 1, "wave 3 window");
  assert.deepStrictEqual([o3.o.missionId, o3.o.waveNumber, o3.o.requiredVehicleType], [M1, 3, "TYPE_C_BLS"]);
  assert.ok(Date.parse(w3.created_at) >= Date.parse(w2.expires_at), "wave 3 after wave 2's window");
  assert.ok(![inbox.A, inbox.B].some((i) => i.offers.some((x) => x.o.offerId === w3.id)), "A and B never received wave 3");
  const m1w3 = await missionRow(M1, patient.db);
  assert.deepStrictEqual([m1w3.status, m1w3.driver_id, m1w3.state_version], ["requesting", null, 1], "escalation writes no mission event");
  await refuse("driver B accept_offer(M1 wave 3, C's offer)", B.db, "accept_offer", { p_offer_id: w3.id, p_client_event_id: randomUUID() }, ["not_eligible"]);
  console.log(`✓ wave 3 ${w3.id} r=${w3.radius_km} eligible=[C] created ${w3.created_at}; server distanceKm C=${o3.o.distanceKm}`);

  step("13. M1 waves used up: the next tick marks wave 3 exhausted, request stays open (search window)");
  let exhaustedSeenAt = "";
  for (const deadline = Date.parse(w3.expires_at) + 80_000; Date.now() < deadline; await sleep(1000)) {
    if ((await wavesOf(M1))[2]!.status !== "broadcasting") { exhaustedSeenAt = now(); break; }
  }
  assert.ok(exhaustedSeenAt, "EXHAUSTION tick not observed");
  ws1 = await wavesOf(M1);
  assert.deepStrictEqual(ws1.map((w) => w.status), ["expired", "expired", "exhausted"], "no wave 4; wave 3 exhausted");
  const m1ex = await missionRow(M1, patient.db);
  assert.deepStrictEqual([m1ex.status, m1ex.driver_id, m1ex.state_version], ["requesting", null, 1], "-2: still requesting inside the search window");
  assert.deepStrictEqual((await eventsOf(M1, patient.db)).map((e) => e.event_type), ["MISSION_REQUESTED"]);
  await refuse("driver C accept_offer(M1 wave 3, exhausted, mission still requesting)", C.db, "accept_offer", { p_offer_id: w3.id, p_client_event_id: randomUUID() }, ["offer_expired"]);
  const board = await C.db.rpc("list_nearby_emergencies");
  assert.ifError(board.error);
  const onBoard = (board.data.items as Array<{ missionId: string }>).find((i) => i.missionId === M1);
  findings.push(`M1 exhausted (wave 3 -> exhausted, seen ${exhaustedSeenAt}); mission stays requesting v1; C's list_nearby_emergencies ${onBoard ? `lists M1 ${JSON.stringify(onBoard)}` : "does not list M1"}`);

  step(`14. M1 search window (${cfg.searchTtlSeconds} s from creation) closed by the scheduler`);
  const cancelMsg = await feed1.event("MISSION_CANCELLED", Math.max(0, Date.parse(m1.row.created_at) + (cfg.searchTtlSeconds + 60) * 1000 + 20_000 - Date.now()));
  const ev1 = await eventsOf(M1, patient.db);
  const m1End = await missionRow(M1, patient.db);
  const ce = ev1[1]!;
  assert.deepStrictEqual(ev1.map((e) => [e.seq, e.event_type]), [[1, "MISSION_REQUESTED"], [2, "MISSION_CANCELLED"]]);
  assert.deepStrictEqual([ce.from_status, ce.to_status, ce.triggered_by, ce.actor_role, ce.metadata], ["requesting", "cancelled", null, "system", { cancelledBy: "system", reason: "no_ambulance_available", fromState: "requesting" }]);
  assert.deepStrictEqual([m1End.status, m1End.driver_id, m1End.state_version, m1End.cancelled_by, m1End.cancel_reason, m1End.cancel_note], ["cancelled", null, 2, "system", "other", "no_ambulance_available"]);
  const age = ms(m1.row.created_at, ce.created_at);
  assert.ok(age >= cfg.searchTtlSeconds * 1000 && age < (cfg.searchTtlSeconds + 60) * 1000 + 2000, `search window closed ${age} ms after creation`);
  assert.deepStrictEqual([cancelMsg.m.eventId, cancelMsg.m.seq, cancelMsg.m.state, cancelMsg.m.missionId, cancelMsg.m.driverId, cancelMsg.m.data], [ce.id, 2, "cancelled", M1, undefined, ce.metadata], "realtime = persisted");
  assert.ok(Math.abs(ms(ce.created_at, cancelMsg.m.timestamp!)) < 1);
  await refuse("driver C accept_offer(M1 wave 3) after system cancel", C.db, "accept_offer", { p_offer_id: w3.id, p_client_event_id: randomUUID() }, ["offer_expired"]);
  console.log(`✓ MISSION_CANCELLED seq 2 ${ce.id} at +${age} ms; patient received it ${cancelMsg.at}`);

  step("15. One more tick: nothing reopens");
  await sleepUntil(Math.ceil((Date.parse(ce.created_at) + 1) / 60_000) * 60_000 + 5000);
  assert.deepStrictEqual((await wavesOf(M1)).map((w) => w.status), ["expired", "expired", "exhausted"], "M1: no wave after the cancel");
  assert.strictEqual((await wavesOf(M4)).length, 3, "M4: no wave after the cancel");
  assert.strictEqual((await eventsOf(M1, patient.db)).length, 2);
  assert.strictEqual(feed1.got.length, 1, "patient received exactly one lifecycle message on M1");

  console.log("\nWave timing (server timestamps; rx = local receipt):");
  for (const m of missions) {
    console.log(`  ${m.label} ${m.id} created ${m.createdAt}`);
    let prev: Wave | undefined;
    for (const w of await wavesOf(m.id)) {
      const rx = inboxes.flatMap((i) => i.offers.filter((x) => x.o.offerId === w.id).map((x) => ({ d: i.d.name, ...x })));
      const o = rx[0]?.o;
      console.log(`    #${w.wave_number} ${w.id} r=${w.radius_km} ${w.status} eligible=${JSON.stringify(who(w.eligible_driver_ids))}`
        + ` created=${w.created_at} expires=${w.expires_at} waveTTL=${ms(w.created_at, w.expires_at)}ms +${ms(m.createdAt, w.created_at)}ms`
        + (prev ? ` prevClose->this=${ms(prev.expires_at, w.created_at)}ms` : "")
        + (o ? ` offer issued=${o.issuedAt} expires=${o.expiresAt} offerTTL=${ms(o.issuedAt!, o.expiresAt)}ms` : "")
        + rx.map((x) => ` rx:${x.d}@${x.at}(+${ms(w.created_at, x.at)}ms)`).join(""));
      prev = w;
    }
  }
  console.log("\nRevocations received:");
  for (const i of inboxes) if (i.revoked.length) console.log(`  ${i.d.name}: ${i.revoked.map((x) => `${x.r.offerId.slice(0, 8)}/${x.r.reason}@${x.at}`).join(", ")}`);
  console.log(`\nM1 exhaustion observed ${exhaustedSeenAt}; M1 cancel event ${ce.created_at} (+${age} ms); patient rx ${cancelMsg.at}`);
  console.log("\nG4.7-A DISPATCH EDGE CASE CHECKS PASSED");
} catch (e) {
  failure = e;
}

// Cleanup: stop heartbeats, take every driver offline (the app's go-offline RPC), end open missions through each patient's
// own cancel, close realtime, then remove exact ids.
for (const h of heartbeats) clearInterval(h);
for (const d of online) {
  const r = await d.db.rpc("set_driver_presence", { p_online: false });
  if (r.error) console.log(`offline ${d.name}: ${r.error.message}`);
}
for (const m of missions) {
  const s = await m.patient.db.from("missions").select("status").eq("id", m.id).single();
  if (s.data && !["completed", "cancelled"].includes(s.data.status)) {
    const r = await m.patient.db.rpc("cancel_mission", { p_mission_id: m.id, p_reason: "other", p_note: "G4.7-A cleanup" });
    console.log(`cleanup: ${m.label} ${s.data.status} -> ${r.error ? `FAILED ${r.error.message}` : r.data.status}`);
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
for (const m of missions) remaining.push(`missions ${m.label} ${m.id} + its mission_events and dispatch_waves: append-only by design`);

console.log(`\nFindings:\n  ${findings.join("\n  ")}`);
console.log(`\nNegative checks (${negatives.length}):\n  ${negatives.join("\n  ")}`);
console.log(`IDs: ${JSON.stringify({ users, missions: missions.map((m) => [m.label, m.id]) })}`);
console.log(`Remaining after cleanup (supabase db reset clears it but also wipes the Vault secrets):\n  ${remaining.join("\n  ") || "none"}`);
if (failure) {
  console.log("G4.7-A FAILED");
  throw failure;
}
process.exit(0);
