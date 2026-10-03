import assert from "node:assert";
import type { DriverLifecycleMachineEvent } from "@sahayak/domain";
import {
  batchFullyAcknowledged,
  buildServerCall,
  driverErrorMessage,
  parseAssignedMissionRow,
  parseCatalogHospital,
  routeMissionPublication,
  routeOfferPublication,
  sanitizeVitals,
  serverDeclineReason,
  toIngestPings,
} from "./driverServer.core.ts";

console.log("=================================================");
console.log("Running Driver Server Contract Tests (7.5 rule 1, 6.4.5)");
console.log("=================================================\n");

const M = "6f0c1e9a-0000-4000-8000-000000000001";
const D = "b7d2a4c1-0000-4000-8000-000000000002";
const O = "9a3e5d10-0000-4000-8000-000000000004";
const H = "c1a9e7f2-0000-4000-8000-000000000007";
const K = "0b6f4c3e-0000-4000-8000-000000000003";
const T = "2026-09-24T08:30:00.000Z";

const call = (e: DriverLifecycleMachineEvent) => buildServerCall(e, K);

console.log("Test 1: each machine event maps to exactly one server call...");
{
  const accept = call({ type: "ACCEPT_DISPATCH", payload: { missionId: M, driverId: D, offerId: O, acceptedAt: T } });
  assert.deepStrictEqual(accept, { ok: true, call: { rpc: "accept_offer", args: { p_offer_id: O, p_client_event_id: K } } });
  const arrive = call({ type: "CONFIRM_ARRIVAL_SCENE", payload: { missionId: M, driverId: D, location: { latitude: 28.5, longitude: 77.2 }, arrivedAt: T } }) as any;
  assert.strictEqual(arrive.call.rpc, "transition_mission");
  assert.strictEqual(arrive.call.args.p_event, "ON_SCENE");
  assert.deepStrictEqual(arrive.call.args.p_payload, { location: { latitude: 28.5, longitude: 77.2 }, arrivedAt: T });
  const hosp = call({ type: "CONFIRM_ARRIVAL_HOSPITAL", payload: { missionId: M, driverId: D, location: { latitude: 28.5, longitude: 77.2 }, arrivedAt: T } }) as any;
  assert.strictEqual(hosp.call.args.p_event, "ARRIVED_HOSPITAL", "hospital arrival is its own server event");
  const abort = call({ type: "ABORT_MISSION", payload: { missionId: M, driverId: D, reason: "vehicle_breakdown", abortedAt: T } }) as any;
  assert.deepStrictEqual(abort.call.args.p_payload, { reason: "vehicle_breakdown" });
  const abortDefault = call({ type: "ABORT_MISSION", payload: { missionId: M, driverId: D, abortedAt: T } }) as any;
  assert.deepStrictEqual(abortDefault.call.args.p_payload, { reason: "other" });
  for (const local of [
    { type: "GO_OFFLINE", payload: { driverId: D, wentOfflineAt: T } },
    { type: "SERVER_OFFER_TIMEOUT", payload: { offerId: O } },
    { type: "SERVER_MISSION_CANCELLED", payload: { missionId: M } },
  ] as DriverLifecycleMachineEvent[]) {
    assert.deepStrictEqual(call(local), { ok: true, call: null }, `${local.type} needs no server call`);
  }
  assert.deepStrictEqual(call({ type: "DECLINE_DISPATCH", payload: { missionId: M, driverId: D, offerId: "OFFER-1", declinedAt: T } }), { ok: true, call: null }, "declining a non-server (mock) offer is local");
  const decline = call({ type: "DECLINE_DISPATCH", payload: { missionId: M, driverId: D, offerId: O, reason: "too_far", declinedAt: T } }) as any;
  assert.deepStrictEqual(decline.call, { rpc: "decline_offer", args: { p_offer_id: O, p_reason: "too_far" } });
}
console.log("✓ mapping\n");

console.log("Test 1b: an accept from the Booking board claims by mission, never by offer...");
{
  const claim = call({ type: "ACCEPT_DISPATCH", payload: { missionId: M, driverId: D, offerId: M, acceptedAt: T, source: "board" } });
  assert.deepStrictEqual(claim, { ok: true, call: { rpc: "claim_emergency", args: { p_mission_id: M, p_client_event_id: K } } });
  assert.deepStrictEqual(
    call({ type: "ACCEPT_DISPATCH", payload: { missionId: "mock-emergency-1", driverId: D, offerId: "mock-emergency-1", acceptedAt: T, source: "board" } }),
    { ok: false, code: "invalid_mission" },
    "a dev mock emergency id is not a mission the server knows"
  );
  for (const code of ["already_on_mission", "not_in_range", "not_online", "profile_locked", "kyc_locked", "registration_in_use"]) {
    assert.notStrictEqual(driverErrorMessage(code), driverErrorMessage("unheard_of"), `${code} has its own message`);
  }
}
console.log("✓ board claim\n");

console.log("Test 2: an action the server cannot accept is refused BEFORE it is sent...");
{
  assert.deepStrictEqual(call({ type: "ACCEPT_DISPATCH", payload: { missionId: M, driverId: D, offerId: "OFFER-123456", acceptedAt: T } }), { ok: false, code: "invalid_offer" }, "a legacy mock offer id is not an offer");
  assert.deepStrictEqual(call({ type: "CONFIRM_ARRIVAL_SCENE", payload: { missionId: "MSN-2026-8819", driverId: D, location: { latitude: 1, longitude: 2 }, arrivedAt: T } }), { ok: false, code: "invalid_mission" });
  const onboard = (over: object) => call({ type: "CONFIRM_PATIENT_ONBOARD", payload: { missionId: M, driverId: D, destination: { latitude: 28.5, longitude: 77.2 }, onboardAt: T, ...over } });
  assert.deepStrictEqual(onboard({}), { ok: false, code: "hospital_required" }, "no hospital id => no transport start");
  assert.deepStrictEqual(onboard({ hospitalId: "AIIMS-fixture-1" }), { ok: false, code: "hospital_required" });
  assert.deepStrictEqual(onboard({ hospitalId: H, vitals: { spO2: 140 } }), { ok: false, code: "invalid_vitals" }, "out-of-range vitals are not silently accepted");
  const good = onboard({ hospitalId: H, vitals: { pulse: 88, spO2: undefined, gcs: 13 }, emergencyType: "trauma", bypass: false }) as any;
  assert.deepStrictEqual(good.call.args.p_payload, { hospitalId: H, onboardAt: T, vitals: { pulse: 88, gcs: 13 }, emergencyType: "trauma", bypass: false }, "only entered readings travel");
  const noVitals = onboard({ hospitalId: H }) as any;
  assert.ok(!("vitals" in noVitals.call.args.p_payload), "no vitals entered => no vitals sent (never zeros)");
  const complete = (handoff: any) => call({ type: "COMPLETE_MISSION", payload: { missionId: M, driverId: D, completedAt: T, handoff } });
  assert.deepStrictEqual(complete(undefined), { ok: false, code: "handoff_incomplete" }, "D-UX-03: no sign-off, no completion");
  assert.deepStrictEqual(complete({ physicianName: "  ", registrationNumber: "R1", department: "ER", emtSigned: true, checklist: { bedReady: true, ventilatorReady: true, emrHanded: true } }), { ok: false, code: "handoff_incomplete" });
  const signed = { physicianName: "Dr Test", registrationNumber: "REG-1", department: "Emergency", emtSigned: true, checklist: { bedReady: false, ventilatorReady: false, emrHanded: false } };
  const ok = complete(signed) as any;
  assert.strictEqual(ok.call.args.p_event, "COMPLETE");
  assert.ok(!("finalFareInr" in ok.call.args.p_payload), "the driver never sends the fare; the server computes it");
  assert.deepStrictEqual(ok.call.args.p_payload.handoff, signed, "unticked checklist items are sent as they are, not forced true");
}
console.log("✓ refusals\n");

console.log("Test 3: decline reasons and vitals sanitising...");
assert.strictEqual(serverDeclineReason("too_far"), "too_far");
assert.strictEqual(serverDeclineReason("break"), "break");
assert.strictEqual(serverDeclineReason("unavailable"), "vehicle_issue");
assert.strictEqual(serverDeclineReason("wrong_care_level"), "other");
assert.strictEqual(serverDeclineReason(undefined), "other");
assert.strictEqual(sanitizeVitals(undefined), undefined);
assert.strictEqual(sanitizeVitals({}), undefined);
assert.deepStrictEqual(sanitizeVitals({ pulse: 0 }), { pulse: 0 }, "a real 0 is kept: absent and zero are different");
assert.strictEqual(sanitizeVitals({ pulse: Number.NaN }), undefined, "NaN (an empty field) is absent, not 0");
assert.strictEqual(sanitizeVitals({ gcs: 2 }), null);
assert.strictEqual(sanitizeVitals({ systolic: 301 }), null);
for (const code of ["offer_taken", "offer_expired", "network", "hospital_at_capacity", "handoff_incomplete", "unheard_of"]) {
  assert.ok(driverErrorMessage(code).length > 10);
}
assert.match(driverErrorMessage("network"), /NOT recorded/, "a network failure never implies success");
console.log("✓ reasons + vitals\n");

console.log("Test 4: hospital catalog keeps the canonical id (never a name or a position match)...");
{
  // What a plain PostgREST select actually returns for geography: EWKB hex (little-endian, SRID 4326). Seeded AIIMS row.
  const aiims = "0101000020E61000003D0AD7A3704D53408C4AEA0434913C40";
  const row = { id: H, name: "AIIMS New Delhi", name_hi: null, zone: "DL", location: aiims, category: null, trauma_level: 1, specialities: [], available_capacity: 30 };
  assert.deepStrictEqual(parseCatalogHospital(row), {
    id: H, name: "AIIMS New Delhi", zone: "DL", coordinates: { longitude: 77.21, latitude: 28.5672 }, traumaLevel: 1, specialities: [], availableCapacity: 30,
  }, "id, name and position from the row; unknown fields are omitted, not defaulted");
  assert.deepStrictEqual(parseCatalogHospital({ ...row, location: { type: "Point", coordinates: [77.21, 28.5672] } })?.coordinates, { longitude: 77.21, latitude: 28.5672 }, "GeoJSON too");
  assert.strictEqual(parseCatalogHospital({ ...row, id: "hosp_sharda_gnoida" }), null, "a non-uuid (client preset) id is never a catalog entry");
  assert.strictEqual(parseCatalogHospital({ ...row, id: "AIIMS New Delhi" }), null, "a display name is never an id");
  assert.strictEqual(parseCatalogHospital({ ...row, name: " " }), null, "no name, not shown");
  assert.strictEqual(parseCatalogHospital({ ...row, location: "0102000020E61000003D0AD7A3704D53408C4AEA0434913C40" }), null, "not a point");
  assert.strictEqual(parseCatalogHospital({ ...row, location: null }), null, "no position, not shown");
  assert.strictEqual(parseCatalogHospital(null), null);
  assert.deepStrictEqual(parseAssignedMissionRow({ id: M, status: "en_route", pickup_location: aiims })?.pickup, { longitude: 77.21, latitude: 28.5672 });
  assert.deepStrictEqual(parseAssignedMissionRow({ id: M, status: "on_scene", pickup_location: { type: "Point", coordinates: [77.21, 28.5672] } }), { missionId: M, status: "on_scene", pickup: { longitude: 77.21, latitude: 28.5672 } });
  assert.deepStrictEqual(parseAssignedMissionRow({ id: M, status: "en_route", pickup_location: null }), { missionId: M, status: "en_route", pickup: undefined });
  assert.strictEqual(parseAssignedMissionRow({ id: M, status: "transporting", destination_hospital_id: H })?.destinationHospitalId, H, "resume reads the hospital foreign key");
  assert.strictEqual(parseAssignedMissionRow({ id: M, status: "transporting", destination_hospital_id: "Sharda" })?.destinationHospitalId, undefined);
  for (const bad of [null, {}, { id: M, status: "flying" }, { id: 5, status: "en_route" }]) assert.strictEqual(parseAssignedMissionRow(bad), null);
}
console.log("✓ hospitals\n");

console.log("Test 5: telemetry upload is acknowledged, never assumed (D-UX-08, G-10)...");
{
  const pings = [
    { id: "a", missionId: M, latitude: 28.5, longitude: 77.2, heading: 10, speed: 40, timestamp: T, syncStatus: "queued", retryCount: 0, recordedInDeadZone: true },
    { id: "b", missionId: M, latitude: 28.6, longitude: 77.2, timestamp: T, syncStatus: "queued", retryCount: 0 },
  ] as any;
  assert.deepStrictEqual(toIngestPings(pings), [
    { latitude: 28.5, longitude: 77.2, timestamp: T, heading: 10, speed: 40, deadZone: true },
    { latitude: 28.6, longitude: 77.2, timestamp: T },
  ]);
  assert.ok(batchFullyAcknowledged(2, { acknowledged: 2, rejected: 0 }));
  assert.ok(batchFullyAcknowledged(2, { acknowledged: 1, rejected: 1 }), "a permanently rejected ping is not retried forever");
  assert.ok(!batchFullyAcknowledged(2, { acknowledged: 1, rejected: 0 }), "a partial ack keeps the queue");
  assert.ok(!batchFullyAcknowledged(2, null));
  assert.ok(!batchFullyAcknowledged(2, { ok: true }), "a response without counts is not an acknowledgement");
}
console.log("✓ upload ack\n");

console.log("Test 6: channel routing never throws and never trusts unknown messages...");
{
  const seen: string[] = [];
  const handlers = { onOffer: (o: any, off: number) => seen.push(`offer:${o.offerId}:${off}`), onRevoked: (r: any) => seen.push(`revoked:${r.offerId}:${r.reason}`) };
  const now = Date.parse("2026-09-24T08:29:14.000Z") - 4000;
  routeOfferPublication({ v: 1, type: "offer", offerId: O, missionId: M, issuedAt: "2026-09-24T08:29:14.000Z", expiresAt: "2026-09-24T08:29:29.000Z" }, now, handlers);
  routeOfferPublication({ v: 1, type: "offer_revoked", offerId: O, reason: "taken" }, now, handlers);
  for (const junk of [null, undefined, 5, "x", [], {}, { type: "offer" }, { type: "offer_revoked", offerId: O, reason: "bored" }, { event: "DRIVER_ACCEPTED" }]) routeOfferPublication(junk, now, handlers);
  assert.deepStrictEqual(seen, [`offer:${O}:4000`, `revoked:${O}:taken`], "clock offset measured from issuedAt; junk ignored");
  routeOfferPublication({ type: "offer", offerId: O, missionId: M, expiresAt: T }, now, { onOffer: () => { throw new Error("boom"); }, onRevoked: () => {} });
  const cancels: any[] = [];
  const watch = { onCancelled: (i: any) => cancels.push(i) };
  routeMissionPublication({ v: 1, type: "lifecycle", event: "MISSION_CANCELLED", seq: 3, missionId: M, data: { cancelledBy: "patient", reason: "changed_mind" } }, watch);
  routeMissionPublication({ event: "MISSION_CANCELLED", missionId: M }, watch);
  for (const ignored of [{ event: "DRIVER_ARRIVED" }, { latitude: 1, longitude: 2, timestamp: T }, null, 7]) routeMissionPublication(ignored, watch);
  assert.deepStrictEqual(cancels, [
    { cancelledBy: "patient", reason: "changed_mind", note: undefined, fromState: undefined, seq: 3 },
    { cancelledBy: undefined, reason: undefined, note: undefined, fromState: undefined, seq: undefined },
  ]);
}
console.log("✓ routing\n");

console.log("DRIVER SERVER CONTRACT TESTS PASSED (100% GREEN)");
