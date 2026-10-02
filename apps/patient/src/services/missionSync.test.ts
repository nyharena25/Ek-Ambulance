import assert from "node:assert";
import { parseLifecycleMessage, type ParsedLifecycleMessage } from "@sahayak/domain";
import { createMissionSync, type MissionSyncDeps } from "./missionSync.core.ts";
import {
  canSignOut,
  clearPersistedMission,
  loadPersistedMission,
  savePersistedMission,
  type KeyValueStorage,
} from "./missionSession.core.ts";
import {
  buildCreateMissionParams,
  cancelReasonForKey,
  contiguousFrom,
  mapRpcError,
  newIdempotencyKey,
  parseCreateMissionResult,
  assignedDriverOf,
  parseEventRow,
  parseMissionRow,
  parsePoint,
  type MissionSnapshot,
} from "../lib/missionApi.core.ts";

console.log("=================================================");
console.log("Running Patient Mission Sync Tests (7.5 reconciliation)");
console.log("=================================================\n");

const M = "6f0c1e9a-0000-4000-8000-000000000001";
const msg = (event: string, seq?: number, data: Record<string, unknown> = {}): ParsedLifecycleMessage => {
  const m = parseLifecycleMessage({ event, seq, data, missionId: M });
  assert.ok(m, `known event ${event}`);
  return m;
};
const tick = () => new Promise((r) => setTimeout(r, 0));

function harness(over: Partial<MissionSyncDeps> = {}) {
  const applied: Array<[string, number | undefined]> = [];
  const persisted: number[] = [];
  const hydrated: MissionSnapshot[] = [];
  const errors: unknown[] = [];
  const calls = { events: 0, snapshot: 0 };
  const deps: MissionSyncDeps = {
    lastSeq: 1,
    apply: (m) => applied.push([m.event, m.seq]),
    hydrate: (s) => void hydrated.push(s),
    fetchEventsAfter: async () => {
      calls.events += 1;
      return [];
    },
    fetchSnapshot: async () => {
      calls.snapshot += 1;
      return null;
    },
    persist: (n) => persisted.push(n),
    onError: (e) => errors.push(e),
    ...over,
  };
  return { sync: createMissionSync(deps), applied, persisted, hydrated, errors, calls };
}

console.log("Test 1: in-order messages apply, duplicates drop, legacy (no seq) messages apply...");
{
  const h = harness({ lastSeq: 1 });
  h.sync.handle(msg("DRIVER_ACCEPTED", 2));
  h.sync.handle(msg("DRIVER_ACCEPTED", 2));
  h.sync.handle(msg("DRIVER_ARRIVED", 3));
  h.sync.handle(msg("DRIVER_ARRIVED", 3));
  h.sync.handle(msg("DRIVER_ARRIVED", 1));
  assert.deepStrictEqual(h.applied, [["DRIVER_ACCEPTED", 2], ["DRIVER_ARRIVED", 3]], "each event applied exactly once");
  assert.deepStrictEqual(h.persisted, [2, 3], "lastSeq persisted on every applied event");
  assert.strictEqual(h.sync.getLastSeq(), 3);
  h.sync.handle(msg("TRANSPORT_STARTED"));
  assert.deepStrictEqual(h.applied[2], ["TRANSPORT_STARTED", undefined], "pre-v1 publisher: applied unconditionally");
  assert.strictEqual(h.sync.getLastSeq(), 3, "a legacy message does not move the baseline");
  assert.strictEqual(h.calls.events + h.calls.snapshot, 0, "no reconcile traffic in the happy path");
}
{
  const h = harness({ lastSeq: null });
  h.sync.handle(msg("DRIVER_ACCEPTED", 7));
  assert.deepStrictEqual(h.applied, [["DRIVER_ACCEPTED", 7]], "no baseline yet: the first message establishes it");
  assert.strictEqual(h.sync.getLastSeq(), 7);
}
console.log("✓ apply / duplicate / legacy\n");

console.log("Test 2: a gap replays the missed events in order (G-12: TRANSPORT_STARTED lost while offline)...");
{
  const h = harness({
    lastSeq: 2,
    fetchEventsAfter: async (seq) => {
      assert.strictEqual(seq, 2);
      return [msg("DRIVER_ARRIVED", 3), msg("TRANSPORT_STARTED", 4)];
    },
  });
  h.sync.handle(msg("MISSION_COMPLETED", 6));
  await tick();
  await tick();
  assert.deepStrictEqual(h.applied.map(([e]) => e), ["DRIVER_ARRIVED", "TRANSPORT_STARTED"], "missed events replayed in order");
  assert.strictEqual(h.sync.getLastSeq(), 4);
  assert.ok(!h.applied.some(([e]) => e === "MISSION_COMPLETED"), "an event still ahead of the baseline is not applied out of order");
  assert.strictEqual(h.calls.snapshot, 0, "no snapshot needed when the events could be replayed");
}
console.log("✓ gap -> replay\n");

console.log("Test 3: an unreadable or holed event list falls back to the server snapshot...");
{
  const snap: MissionSnapshot = { missionId: M, status: "completed", stateVersion: 6 };
  const h = harness({ lastSeq: 2, fetchEventsAfter: async () => null, fetchSnapshot: async () => snap });
  h.sync.handle(msg("MISSION_COMPLETED", 6));
  await tick();
  await tick();
  assert.deepStrictEqual(h.hydrated, [snap], "machine jumps to the authoritative snapshot");
  assert.strictEqual(h.sync.getLastSeq(), 6, "baseline = snapshot state_version");
  assert.deepStrictEqual(h.applied, [], "nothing replays over a hydrate");
}
{
  const snap: MissionSnapshot = { missionId: M, status: "on_scene", stateVersion: 3 };
  const h = harness({ lastSeq: 1, fetchEventsAfter: async () => [msg("TRANSPORT_STARTED", 4)], fetchSnapshot: async () => snap });
  h.sync.handle(msg("HOSPITAL_ARRIVED", 5));
  await tick();
  await tick();
  assert.strictEqual(h.hydrated.length, 1, "a hole in the replayed events (2-3 missing) is not applied");
  assert.strictEqual(h.sync.getLastSeq(), 3);
}
{
  let online = false;
  const snap: MissionSnapshot = { missionId: M, status: "en_route", stateVersion: 2 };
  const h = harness({
    lastSeq: 1,
    fetchEventsAfter: async () => (online ? [msg("DRIVER_ACCEPTED", 2)] : null),
    fetchSnapshot: async () => {
      if (!online) throw new Error("offline");
      return snap;
    },
  });
  h.sync.handle(msg("DRIVER_ARRIVED", 3));
  await tick();
  await tick();
  assert.strictEqual(h.errors.length, 1, "the failure is reported, not thrown");
  assert.strictEqual(h.sync.getLastSeq(), 1, "baseline unchanged while offline");
  online = true;
  h.sync.handle(msg("DRIVER_ARRIVED", 3));
  await tick();
  await tick();
  await tick();
  assert.deepStrictEqual(h.applied.map(([e]) => e), ["DRIVER_ACCEPTED", "DRIVER_ARRIVED"], "recovery applies the missed event, then the held one follows");
  assert.strictEqual(h.sync.getLastSeq(), 3);
}
console.log("✓ snapshot fallback\n");

console.log("Test 4: cold launch hydrates from the snapshot, never by replaying onto an idle machine (rule 9)...");
{
  const snap: MissionSnapshot = { missionId: M, status: "transporting", stateVersion: 4 };
  const h = harness({ lastSeq: 2, fetchEventsAfter: async () => assert.fail("replay must not run on a cold launch"), fetchSnapshot: async () => snap });
  await h.sync.reconcile("snapshot");
  assert.deepStrictEqual(h.hydrated, [snap]);
  assert.strictEqual(h.sync.getLastSeq(), 4);
  assert.deepStrictEqual(h.persisted, [4]);
}
{
  const h = harness({ lastSeq: 3, fetchEventsAfter: async () => [] });
  await h.sync.reconcile();
  assert.strictEqual(h.calls.snapshot, 0, "server is at our baseline: nothing to do");
  assert.deepStrictEqual(h.applied, []);
}
console.log("✓ cold launch\n");

console.log("Test 5: messages that arrive during a reconcile are ordered and de-duplicated afterwards...");
{
  let release: (m: ParsedLifecycleMessage[]) => void = () => {};
  const h = harness({
    lastSeq: 2,
    fetchEventsAfter: () => new Promise((resolve) => (release = resolve)),
  });
  h.sync.handle(msg("TRANSPORT_STARTED", 5));
  h.sync.handle(msg("HOSPITAL_ARRIVED", 6));
  h.sync.handle(msg("DRIVER_ARRIVED", 3));
  release([msg("DRIVER_ARRIVED", 3), msg("TRANSPORT_STARTED", 4)]);
  await tick();
  await tick();
  assert.deepStrictEqual(h.applied.slice(0, 2).map(([, s]) => s), [3, 4], "replayed events applied first, in order");
  assert.strictEqual(h.applied.filter(([, s]) => s === 3).length, 1, "seq 3 applied exactly once (late duplicate dropped)");
  assert.deepStrictEqual(h.applied.slice(2).map(([, s]) => s), [5, 6], "held messages that follow the replay apply in order");
}
{
  const h = harness({ lastSeq: 2, fetchEventsAfter: async () => { return [msg("DRIVER_ARRIVED", 3)]; } });
  let calls = 0;
  const inner = h.sync;
  inner.handle(msg("MISSION_COMPLETED", 9));
  inner.handle(msg("DRIVER_ARRIVED", 3));
  await tick();
  await tick();
  calls = h.applied.length;
  assert.strictEqual(calls, 1, "one reconcile serves every held message; only the replayed event applies");
}
{
  const h = harness({ lastSeq: 1, apply: () => { throw new Error("boom"); } });
  h.sync.handle(msg("DRIVER_ACCEPTED", 2));
  assert.strictEqual(h.errors.length, 1, "a throwing apply is contained");
  assert.strictEqual(h.sync.getLastSeq(), 2);
}
console.log("✓ concurrency\n");

console.log("Test 6: persisted mission session survives bad data...");
{
  const store = new Map<string, string>();
  const storage: KeyValueStorage = {
    getItem: async (k) => store.get(k) ?? null,
    setItem: async (k, v) => void store.set(k, v),
    removeItem: async (k) => void store.delete(k),
  };
  assert.strictEqual(await loadPersistedMission(storage), null);
  await savePersistedMission(storage, { missionId: M, lastSeq: 4 });
  assert.deepStrictEqual(await loadPersistedMission(storage), { missionId: M, lastSeq: 4 });
  await savePersistedMission(storage, { missionId: M, lastSeq: null });
  assert.deepStrictEqual(await loadPersistedMission(storage), { missionId: M, lastSeq: null });
  await clearPersistedMission(storage);
  assert.strictEqual(await loadPersistedMission(storage), null, "cleared on a terminal state (rule 8)");
  for (const bad of ["not json", "{}", '{"missionId":"MSN-1","lastSeq":1}', `{"missionId":"${M}","lastSeq":-1}`, `{"missionId":"${M}","lastSeq":1.5}`, `{"missionId":"${M}","lastSeq":"3"}`]) {
    store.set("sahayak.activeMission.v1", bad);
    assert.strictEqual(await loadPersistedMission(storage), null, `malformed record ignored: ${bad}`);
  }
  const broken: KeyValueStorage = {
    getItem: async () => { throw new Error("keystore"); },
    setItem: async () => { throw new Error("keystore"); },
    removeItem: async () => { throw new Error("keystore"); },
  };
  assert.strictEqual(await loadPersistedMission(broken), null);
  await savePersistedMission(broken, { missionId: M, lastSeq: 1 });
  await clearPersistedMission(broken);
}
// Sign-out / switch account is offered only with no mission in flight.
for (const st of ["idle", "triaged", "receiptConfirmed", "cancelled"] as const) assert.strictEqual(canSignOut(st), true, st);
for (const st of ["requesting", "tracking", "transporting", "awaitingReceipt"] as const) assert.strictEqual(canSignOut(st), false, st);
console.log("✓ session persistence\n");

console.log("Test 7: RPC errors map to actionable codes (PostgREST PTnnn)...");
assert.deepStrictEqual(mapRpcError({ message: "out_of_zone", code: "PT422" }), { code: "out_of_zone", status: 422, detail: undefined, retryable: false });
assert.deepStrictEqual(mapRpcError({ message: "invalid_transition", code: "PT409", details: "transporting" }), { code: "invalid_transition", status: 409, detail: "transporting", retryable: false });
assert.strictEqual(mapRpcError({ message: "jurisdictions_not_loaded", code: "PT503" }).status, 503);
assert.deepStrictEqual(mapRpcError({ message: "TypeError: Network request failed", code: "" }), { code: "network", status: 0, detail: "TypeError: Network request failed", retryable: true });
assert.strictEqual(mapRpcError(null).retryable, true);
assert.strictEqual(mapRpcError({ message: "permission denied for table x", code: "42501" }).code, "unknown");
console.log("✓ error mapping\n");

console.log("Test 8: create_mission request/response mapping...");
const params = buildCreateMissionParams({
  idempotencyKey: "00000000-0000-4000-8000-0000000000e1",
  pickup: { latitude: 28.5672, longitude: 77.21 },
  vehicleType: "TYPE_D_ALS",
  urgency: "CAT_1_IMMEDIATE",
  triage: { primary_complaint: "chest_pain" },
  distanceKm: 8.4,
  pickupAddress: "Hauz Khas Village",
});
assert.deepStrictEqual(Object.keys(params).sort(), ["p_distance_km", "p_idempotency_key", "p_pickup_address", "p_pickup_lat", "p_pickup_lng", "p_triage", "p_urgency", "p_vehicle_type"]);
assert.ok(!("p_district" in params) && !("p_duration_min" in params));
assert.strictEqual(params.p_pickup_lng, 77.21);
const created = parseCreateMissionResult({ replay: false, mission: { id: M, displayRef: "MSN-DL-2026-000123", status: "requesting", stateVersion: 1, jurisdiction: "DL", fareDetails: { estimatedTotalInr: 585 } } });
assert.deepStrictEqual(created && { id: created.missionId, v: created.stateVersion, replay: created.replay, j: created.jurisdiction }, { id: M, v: 1, replay: false, j: "DL" });
assert.strictEqual(parseCreateMissionResult({ replay: true, mission: { id: M, status: "requesting", stateVersion: 1, jurisdiction: "UP" } })?.replay, true);
for (const bad of [null, {}, { mission: null }, { mission: { id: M, status: "flying", stateVersion: 1 } }, { mission: { id: M, status: "requesting" } }, { mission: { id: M, status: "requesting", stateVersion: 1.5, jurisdiction: "DL" } }, { mission: { id: M, status: "requesting", stateVersion: 1 } }, { mission: { id: M, status: "requesting", stateVersion: 1, jurisdiction: "HR" } }]) {
  assert.strictEqual(parseCreateMissionResult(bad), null, `rejected ${JSON.stringify(bad)}`);
}
assert.match(newIdempotencyKey(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
assert.match(newIdempotencyKey(() => 0.5), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
assert.deepStrictEqual(cancelReasonForKey("alternative"), { reason: "found_alternative" });
assert.deepStrictEqual(cancelReasonForKey("resolved"), { reason: "changed_mind" });
assert.strictEqual(cancelReasonForKey("location").reason, "other");
assert.ok(cancelReasonForKey("location").note);
assert.deepStrictEqual(cancelReasonForKey("whatever"), { reason: "other" });
console.log("✓ create/cancel mapping\n");

console.log("Test 9: snapshot and event rows read through RLS...");
assert.deepStrictEqual(parsePoint({ type: "Point", coordinates: [77.21, 28.5672] }), { longitude: 77.21, latitude: 28.5672 });
const buf = new DataView(new ArrayBuffer(16));
buf.setFloat64(0, 77.21, true);
buf.setFloat64(8, 28.5672, true);
const hex = [...new Uint8Array(buf.buffer)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
assert.deepStrictEqual(parsePoint(`0101000020E6100000${hex}`), { longitude: 77.21, latitude: 28.5672 }, "EWKB hex decodes");
assert.strictEqual(parsePoint("garbage"), undefined);
assert.strictEqual(parsePoint({ coordinates: ["x", 1] }), undefined);
const row = parseMissionRow({ id: M, status: "en_route", state_version: 2, display_ref: "MSN-DL-2026-000123", vehicle_type: "TYPE_D_ALS", jurisdiction: "DL", pickup_location: { type: "Point", coordinates: [77.21, 28.5672] }, pickup_address: "Hauz Khas", fare_details: { estimatedTotalInr: 585 } });
assert.ok(row && row.status === "en_route" && row.stateVersion === 2 && row.pickup?.latitude === 28.5672 && row.jurisdiction === "DL");
for (const bad of [null, {}, { id: M, status: "en_route" }, { id: M, status: "nope", state_version: 1 }, { id: 5, status: "en_route", state_version: 1 }]) {
  assert.strictEqual(parseMissionRow(bad), null, `rejected ${JSON.stringify(bad)}`);
}
const ev = parseEventRow({ id: "0b6f4c3e-0000-4000-8000-000000000003", seq: 2, event_type: "DRIVER_ACCEPTED", to_status: "en_route", metadata: { driver: { vehicleRegistration: "[Vehicle Reg. Redacted]" } }, created_at: "2026-09-24T08:29:40.101Z" });
assert.ok(ev && ev.event === "DRIVER_ACCEPTED" && ev.seq === 2 && ev.state === "en_route");
assert.strictEqual(parseEventRow({ id: "x", seq: 1, event_type: "MISSION_REQUESTED", to_status: "requesting", metadata: {} }), null, "the creation event is not a wire event");
assert.strictEqual(parseEventRow(null), null);
assert.deepStrictEqual(contiguousFrom([], 2), []);
assert.strictEqual(contiguousFrom([msg("DRIVER_ARRIVED", 4)], 2), null, "a hole is not replayable");
assert.ok(contiguousFrom([msg("DRIVER_ARRIVED", 3), msg("TRANSPORT_STARTED", 4)], 2));
console.log("✓ row parsing\n");

console.log("Test: the crew is recovered from the stored DRIVER_ACCEPTED row (reopened app, no realtime replay)...");
{
  const stored = parseEventRow({
    id: "0b6f4c3e-0000-4000-8000-000000000004", seq: 2, event_type: "DRIVER_ACCEPTED", to_status: "en_route", created_at: "2026-09-24T08:29:40.101Z",
    metadata: { driver: { displayName: "Ravi K.", vehicleRegistration: "DL01AB1234", makeModel: "Force Traveller", color: "White", crewCount: 2, ais125Type: "TYPE_C_BLS" } },
  });
  assert.deepStrictEqual(assignedDriverOf(stored!.data ?? {}), {
    displayName: "Ravi K.", vehicleRegistration: "DL01AB1234", ais125Type: "TYPE_C_BLS", makeModel: "Force Traveller", color: "White", crewCount: 2,
  });
  assert.strictEqual(assignedDriverOf({}), undefined, "an event naming nobody recovers nobody - never a placeholder crew");
  assert.strictEqual(assignedDriverOf({ driver: { color: "White" } }), undefined, "a colour alone does not identify an ambulance");
}
console.log("✓ crew recovery\n");

console.log("Test: an async hydrate (crew read) keeps live messages after it, in order...");
{
  let release!: () => void;
  const order: string[] = [];
  const h2 = harness({
    lastSeq: null,
    fetchSnapshot: async () => ({ missionId: M, status: "en_route", stateVersion: 2 }),
    hydrate: () => new Promise<void>((r) => (release = () => { order.push("HYDRATE"); r(); })),
    apply: (m) => void order.push(m.event),
  });
  const done = h2.sync.reconcile("snapshot");
  await tick();
  h2.sync.handle(msg("DRIVER_ARRIVED", 3));
  assert.deepStrictEqual(order, [], "held while the hydrate is in flight");
  release();
  await done;
  assert.deepStrictEqual(order, ["HYDRATE", "DRIVER_ARRIVED"], "hydrate first, then the newer live event");
}
console.log("✓ async hydrate ordering\n");

console.log("PATIENT MISSION SYNC TESTS PASSED (100% GREEN)");
