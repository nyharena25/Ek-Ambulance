import assert from "node:assert";
import { createActor } from "xstate";
import {
  DISPATCH_CONFIG,
  MISSION_LIFECYCLE_EVENTS,
  MISSION_TRANSITIONS,
  canTransition,
  decideSeq,
  driverOffersChannelName,
  driverStateForStatus,
  estimateClockOffsetMs,
  isMissionLifecyclePublication,
  isMissionTelemetryPing,
  isNewerPing,
  isUuid,
  offerSecondsLeft,
  parseDispatchOffer,
  parseLifecycleMessage,
  parseOfferRevoked,
  parseRealtimeScope,
  patientStateForStatus,
  readDriverAccepted,
  readMissionCancelled,
  readMissionCompleted,
  readTransportStarted,
  redisKeys,
  patientLifecycleMachine,
  driverLifecycleMachine,
  computeTriageUrgency,
  type MissionStatus,
} from "./index.ts";

console.log("=================================================");
console.log("Running Data & Sync Contract Tests (wire, dispatch, machines)");
console.log("=================================================\n");

const M = "6f0c1e9a-0000-4000-8000-000000000001";
const D = "b7d2a4c1-0000-4000-8000-000000000002";

// ---------------------------------------------------------------------------
console.log("Test 1: lifecycle guard accepts as-built and v1 shapes, rejects the rest without throwing...");
const asBuilt = { event: "DRIVER_ACCEPTED", missionId: M, driverId: D, timestamp: "2026-09-24T08:29:40.101Z" };
const v1 = {
  v: 1,
  type: "lifecycle",
  event: "DRIVER_ACCEPTED",
  eventId: "0b6f4c3e-0000-4000-8000-000000000003",
  seq: 2,
  missionId: M,
  driverId: D,
  state: "en_route",
  timestamp: "2026-09-24T08:29:40.101Z",
  data: { driver: { vehicleRegistration: "[Vehicle Reg. Redacted]", ais125Type: "TYPE_D_ALS" } },
};
assert.ok(isMissionLifecyclePublication(asBuilt), "as-built shape accepted");
assert.ok(isMissionLifecyclePublication(v1), "v1 shape accepted");
assert.strictEqual(parseLifecycleMessage(asBuilt)?.seq, undefined, "as-built has no seq");
assert.strictEqual(parseLifecycleMessage(v1)?.seq, 2);
assert.strictEqual(parseLifecycleMessage(v1)?.state, "en_route");
for (const hostile of [null, undefined, 5, "DRIVER_ACCEPTED", [], {}, { event: 5 }, { event: "TELEPORT" }, { event: "DRIVER_ACCEPTED", type: "telemetry" }]) {
  assert.strictEqual(parseLifecycleMessage(hostile), null, `rejected without throwing: ${JSON.stringify(hostile)}`);
  assert.strictEqual(isMissionLifecyclePublication(hostile), false);
}
assert.strictEqual(parseLifecycleMessage({ event: "DRIVER_ARRIVED", seq: 0 })?.seq, undefined, "seq must be >= 1");
assert.strictEqual(parseLifecycleMessage({ event: "DRIVER_ARRIVED", seq: 1.5 })?.seq, undefined, "seq must be an integer");
assert.strictEqual(parseLifecycleMessage({ event: "DRIVER_ARRIVED", state: "flying" })?.state, undefined, "unknown state dropped");
assert.strictEqual(parseLifecycleMessage({ event: "HOSPITAL_ARRIVED" })?.event, "HOSPITAL_ARRIVED", "new v1 event known");
assert.strictEqual(parseLifecycleMessage({ event: "DRIVER_RELEASED" })?.event, "DRIVER_RELEASED", "new v1 event known");
assert.strictEqual(MISSION_LIFECYCLE_EVENTS.length, 7);
console.log("✓ guard + parser\n");

// ---------------------------------------------------------------------------
console.log("Test 2: telemetry vs lifecycle discrimination stays shape-safe...");
assert.ok(isMissionTelemetryPing({ latitude: 28.5, longitude: 77.2, timestamp: "t" }));
assert.ok(isMissionTelemetryPing({ v: 1, type: "telemetry", latitude: 28.5, longitude: 77.2, timestamp: "t", deadZone: true }));
assert.strictEqual(isMissionTelemetryPing(v1), false, "a lifecycle envelope is not a ping (its coordinates are nested)");
assert.strictEqual(isMissionTelemetryPing({ type: "lifecycle", latitude: 1, longitude: 2 }), false, "explicit type wins over shape");
assert.strictEqual(isMissionTelemetryPing({ latitude: "1", longitude: 2 }), false);
console.log("✓ telemetry guard\n");

// ---------------------------------------------------------------------------
console.log("Test 3: per-event data readers never invent a value (P-UX-05, G-02)...");
const accepted = readDriverAccepted({});
assert.deepStrictEqual(accepted.driver, {
  displayName: undefined,
  vehicleRegistration: undefined,
  ais125Type: undefined,
  makeModel: undefined,
  color: undefined,
  crewCount: undefined,
});
assert.strictEqual(accepted.maskedCall, undefined, "no masked number in the payload => no call button");
assert.strictEqual(readDriverAccepted({ maskedCall: { extension: "1" } }).maskedCall, undefined, "an extension alone is not a number");
assert.deepStrictEqual(readDriverAccepted({ maskedCall: { number: "+91XXXXXXXXXX", extension: "000" } }).maskedCall, { number: "+91XXXXXXXXXX", extension: "000" });
assert.strictEqual(readDriverAccepted({ etaMinutes: "6" }).etaMinutes, undefined, "wrong-typed eta dropped");
assert.deepStrictEqual(
  readDriverAccepted({ driver: { displayName: "Asha V.", vehicleRegistration: "DL01AB1111", makeModel: "Force Traveller", color: "White", crewCount: 3, ais125Type: "TYPE_D_ALS" } }).driver,
  { displayName: "Asha V.", vehicleRegistration: "DL01AB1111", ais125Type: "TYPE_D_ALS", makeModel: "Force Traveller", color: "White", crewCount: 3 },
  "the crew details a driver enters on their Profile reach the patient"
);
assert.strictEqual(readDriverAccepted({ driver: { crewCount: "3", color: 5 } }).driver.crewCount, undefined, "wrong-typed crew size dropped");
assert.strictEqual(readDriverAccepted({ driver: { crewCount: "3", color: 5 } }).driver.color, undefined, "wrong-typed colour dropped");
assert.strictEqual(readTransportStarted({ destination: { name: "AIIMS New Delhi" } }).destination, undefined, "partial destination rejected");
assert.deepStrictEqual(
  readTransportStarted({ destination: { hospitalId: "h1", name: "AIIMS New Delhi", latitude: 28.5, longitude: 77.2 }, wardStatus: "Bed held" }).destination,
  { hospitalId: "h1", name: "AIIMS New Delhi", latitude: 28.5, longitude: 77.2 }
);
assert.strictEqual(readMissionCompleted({ receiptPath: null, finalFareInr: 585 }).receiptPath, undefined, "null receiptPath => still generating");
assert.strictEqual(readMissionCompleted({ finalFareInr: 585 }).finalFareInr, 585);
assert.strictEqual(readMissionCancelled({}).cancelledBy, undefined, "pre-v1 publisher: who cancelled is unknown, not invented");
assert.deepStrictEqual(readMissionCancelled({ cancelledBy: "driver", reason: "vehicle_breakdown", fromState: "transporting" }), {
  cancelledBy: "driver",
  reason: "vehicle_breakdown",
  note: undefined,
  fromState: "transporting",
});
assert.strictEqual(readMissionCancelled({ cancelledBy: "hacker" }).cancelledBy, undefined);
console.log("✓ readers\n");

// ---------------------------------------------------------------------------
console.log("Test 4: sequence and ping ordering rules (7.5 rules 3 and 10)...");
assert.strictEqual(decideSeq(1, 2), "apply");
assert.strictEqual(decideSeq(2, 2), "duplicate");
assert.strictEqual(decideSeq(5, 3), "duplicate");
assert.strictEqual(decideSeq(2, 4), "gap");
assert.strictEqual(decideSeq(2, undefined), "apply", "legacy publisher without seq");
assert.strictEqual(decideSeq(null, 7), "apply", "no baseline yet");
assert.ok(isNewerPing(null, { timestamp: "2026-09-24T08:00:00Z" }));
assert.ok(isNewerPing("2026-09-24T08:00:00Z", { timestamp: "2026-09-24T08:00:03Z" }));
assert.ok(!isNewerPing("2026-09-24T08:00:03Z", { timestamp: "2026-09-24T08:00:00Z" }), "older ping dropped");
assert.ok(!isNewerPing("2026-09-24T08:00:03Z", { timestamp: "2026-09-24T08:00:03Z" }), "equal timestamp dropped");
assert.ok(isNewerPing("garbage", { timestamp: "2026-09-24T08:00:00Z" }), "unparseable baseline never blocks");
console.log("✓ ordering\n");

// ---------------------------------------------------------------------------
console.log("Test 5: realtime scopes accept UUIDs only (R-16)...");
assert.ok(isUuid(M));
assert.ok(!isUuid("MSN-DL-2026-8921"));
assert.deepStrictEqual(parseRealtimeScope("connect"), { kind: "connect" });
assert.deepStrictEqual(parseRealtimeScope(`mission:${M}`), { kind: "mission", missionId: M });
assert.deepStrictEqual(parseRealtimeScope(driverOffersChannelName(D)), { kind: "offers", driverId: D });
for (const bad of ["mission:MSN-1", `driver:${D}`, "driver:x:offers", "mission:", "", `mission:${M}:x`, 5, null, undefined]) {
  assert.strictEqual(parseRealtimeScope(bad), null, `rejected: ${String(bad)}`);
}
assert.strictEqual(redisKeys.driverGeo("DL", "TYPE_D_ALS"), "drivers:geo:DL:TYPE_D_ALS");
assert.strictEqual(redisKeys.driverPresence(D), `driver:presence:${D}`);
console.log("✓ scopes + redis keys\n");

// ---------------------------------------------------------------------------
console.log("Test 6: offers parse from the spec example and never fabricate...");
const specOffer = {
  v: 1,
  type: "offer",
  offerId: "9a3e5d10-0000-4000-8000-000000000004",
  missionId: M,
  waveNumber: 1,
  issuedAt: "2026-09-24T08:29:10.000Z",
  expiresAt: "2026-09-24T08:29:25.000Z",
  urgency: "CAT_1_IMMEDIATE",
  requiredVehicleType: "TYPE_D_ALS",
  jurisdiction: "DL",
  pickup: { latitude: 28.5672, longitude: 77.21, address: "Hauz Khas Village, South Delhi", landmark: "Near Deer Park Main Gate" },
  distanceKm: 2.4,
  etaMinutes: 6,
  patientSummary: { primaryComplaint: "chest_pain", derivedFlags: ["chest_pain", "cardiac_arrest"], ageBand: "40-49", sex: "M" },
};
const offer = parseDispatchOffer(specOffer);
assert.ok(offer);
assert.strictEqual(offer.requiredVehicleType, "TYPE_D_ALS");
assert.deepStrictEqual(offer.patientSummary?.derivedFlags, ["chest_pain", "cardiac_arrest"]);
const bare = parseDispatchOffer({ offerId: "o", missionId: "m", expiresAt: "2026-09-24T08:29:25.000Z" });
assert.ok(bare && bare.pickup === undefined && bare.patientSummary === undefined, "absent fields stay absent (no '42, Male')");
assert.strictEqual(parseDispatchOffer({ offerId: "o", missionId: "m" }), null, "no expiry => not actionable");
assert.strictEqual(parseDispatchOffer({ offerId: "o", missionId: "m", expiresAt: "not a date" }), null);
assert.strictEqual(parseDispatchOffer({ ...specOffer, type: "lifecycle" }), null);
assert.strictEqual(parseDispatchOffer(null), null);
assert.strictEqual(parseDispatchOffer({ ...specOffer, requiredVehicleType: "TYPE_Z" })?.requiredVehicleType, undefined);
assert.deepStrictEqual(parseOfferRevoked({ v: 1, type: "offer_revoked", offerId: "o", reason: "taken" }), { offerId: "o", reason: "taken" });
assert.strictEqual(parseOfferRevoked({ type: "offer_revoked", offerId: "o", reason: "because" }), null);
console.log("✓ offers\n");

console.log("Test 7: offer countdown derives from server expiry and a measured clock offset (rule 11)...");
const localNow = Date.parse("2026-09-24T08:29:00.000Z");
// The local clock runs 4 s behind the server: the offer says it was issued at 08:29:14 server time.
const offset = estimateClockOffsetMs("2026-09-24T08:29:14.000Z", localNow + 10_000);
assert.strictEqual(offset, 4_000);
assert.strictEqual(offerSecondsLeft("2026-09-24T08:29:25.000Z", localNow + 10_000, offset), 11, "15 s TTL minus 4 s elapsed");
assert.strictEqual(offerSecondsLeft("2026-09-24T08:29:25.000Z", localNow + 60_000, offset), 0, "clamped at 0, never negative");
assert.strictEqual(estimateClockOffsetMs(undefined, localNow), 0);
assert.strictEqual(DISPATCH_CONFIG.offerTtlSeconds, 15);
assert.strictEqual(DISPATCH_CONFIG.waveWindowSeconds, 45);
assert.deepStrictEqual([...DISPATCH_CONFIG.radiiKm], [3, 6, 10]);
console.log("✓ countdown\n");

// ---------------------------------------------------------------------------
console.log("Test 8: transition table + crosswalk (7.1)...");
assert.ok(canTransition("requesting", "DRIVER_ACCEPTED"));
assert.ok(!canTransition("transporting", "DRIVER_ACCEPTED"));
assert.ok(canTransition("transporting", "MISSION_CANCELLED"), "driver abort after pickup is a cancellation");
assert.ok(!canTransition("completed", "MISSION_CANCELLED"));
assert.ok(canTransition("on_scene", "DRIVER_RELEASED"));
assert.ok(!canTransition("transporting", "DRIVER_RELEASED"), "no re-dispatch once the patient is on board (D-3)");
assert.strictEqual(MISSION_TRANSITIONS.length, 7);
const crosswalk: Array<[MissionStatus, string, string | null]> = [
  ["requesting", "requesting", null],
  ["matched", "tracking", "enRouteToPatient"],
  ["en_route", "tracking", "enRouteToPatient"],
  ["on_scene", "tracking", "onScene"],
  ["transporting", "transporting", "transporting"],
  ["arrived_hospital", "transporting", "arrivedHospital"],
  ["completed", "awaitingReceipt", null],
  ["cancelled", "cancelled", null],
];
for (const [status, patient, driver] of crosswalk) {
  assert.strictEqual(patientStateForStatus(status), patient, `patient ${status}`);
  assert.strictEqual(driverStateForStatus(status), driver, `driver ${status}`);
}
console.log("✓ table + crosswalk\n");

// ---------------------------------------------------------------------------
console.log("Test 9: patient machine - server data, release, cancel in transport, hydrate...");
const triage = computeTriageUrgency({ primaryComplaint: "chest_pain" });
function bookedPatient() {
  const a = createActor(patientLifecycleMachine).start();
  a.send({ type: "SUBMIT_TRIAGE", payload: { missionDraftId: "d", symptoms: triage.symptomFlags, answeredAt: "2026-09-24T08:00:00Z", locale: "hi", result: triage } });
  a.send({
    type: "REQUEST",
    payload: { patientId: "p", pickup: { latitude: 28.5, longitude: 77.2 }, careLevel: "ALS", vehicleType: "TYPE_D_ALS", jurisdiction: "DL", requestedAt: "2026-09-24T08:00:00Z", idempotencyKey: "k" },
  });
  return a;
}
{
  const a = bookedPatient();
  a.send({ type: "SERVER_MISSION_CREATED", payload: { missionId: M } });
  assert.strictEqual(a.getSnapshot().value, "requesting", "creation keeps matching on screen");
  assert.strictEqual(a.getSnapshot().context.missionId, M, "mission id known before any driver is assigned");
  a.send({ type: "SERVER_MISSION_ASSIGNED", payload: { missionId: "forged-other-id", driver: { vehicleRegistration: "[Vehicle Reg. Redacted]" }, etaMinutes: 6 } });
  assert.strictEqual(a.getSnapshot().value, "tracking");
  assert.strictEqual(a.getSnapshot().context.missionId, M, "rule 6: a payload cannot rewrite the mission id");
  assert.strictEqual(a.getSnapshot().context.assignedDriver?.vehicleRegistration, "[Vehicle Reg. Redacted]");
  assert.strictEqual(a.getSnapshot().context.maskedCall, null, "no number supplied => none shown");
  a.send({ type: "SERVER_DRIVER_ARRIVED", payload: { missionId: M } });
  assert.strictEqual(a.getSnapshot().context.driverHasArrived, true);
  a.send({ type: "SERVER_DRIVER_RELEASED", payload: { missionId: M } });
  assert.strictEqual(a.getSnapshot().value, "requesting", "D-3: pre-pickup abort returns to matching");
  assert.strictEqual(a.getSnapshot().context.assignedDriver, null);
  assert.strictEqual(a.getSnapshot().context.driverHasArrived, false);
  a.send({ type: "SERVER_MISSION_ASSIGNED", payload: { missionId: M } });
  a.send({
    type: "SERVER_TRANSPORT_STARTED",
    payload: { missionId: M, destination: { hospitalId: "h", name: "AIIMS New Delhi", latitude: 28.5, longitude: 77.2 }, wardStatus: "Bed held", etaMinutes: 11 },
  });
  assert.strictEqual(a.getSnapshot().value, "transporting");
  assert.strictEqual(a.getSnapshot().context.destination?.name, "AIIMS New Delhi", "hospital comes from the server, not a route param");
  a.send({ type: "SERVER_HOSPITAL_ARRIVED", payload: { missionId: M } });
  assert.strictEqual(a.getSnapshot().value, "transporting");
  assert.strictEqual(a.getSnapshot().context.hospitalArrived, true);
  a.send({ type: "SERVER_MISSION_COMPLETED", payload: { missionId: M, completion: { finalFareInr: 585, distanceKm: 8.4 } } });
  assert.strictEqual(a.getSnapshot().value, "awaitingReceipt");
  assert.strictEqual(a.getSnapshot().context.completion?.finalFareInr, 585);
  a.stop();
}
{
  const a = bookedPatient();
  a.send({ type: "SERVER_MISSION_ASSIGNED", payload: { missionId: M } });
  a.send({ type: "SERVER_TRANSPORT_STARTED", payload: { missionId: M } });
  a.send({ type: "SERVER_MISSION_CANCELLED", payload: { missionId: M, cancelledBy: "driver", reason: "vehicle_breakdown", fromState: "transporting" } });
  assert.strictEqual(a.getSnapshot().value, "cancelled", "G-05: a driver abort during transport no longer strands the patient");
  assert.strictEqual(a.getSnapshot().context.cancellation?.cancelledBy, "driver");
  assert.strictEqual(a.getSnapshot().context.cancellation?.fromState, "transporting");
  a.stop();
}
{
  const a = bookedPatient();
  a.send({ type: "SERVER_MISSION_CANCELLED", payload: { missionId: M, cancelledBy: "system", reason: "no_ambulance_available" } });
  assert.strictEqual(a.getSnapshot().value, "cancelled");
  assert.strictEqual(a.getSnapshot().context.cancellation?.reason, "no_ambulance_available", "P-UX-08: an end state for 'no ambulance'");
  a.stop();
}
{
  const a = bookedPatient();
  a.send({ type: "CANCEL", payload: { missionId: "pending", reason: "found_alternative", cancelledAt: "2026-09-24T08:01:00Z" } });
  assert.strictEqual(a.getSnapshot().context.cancellation?.cancelledBy, "patient");
  assert.strictEqual(a.getSnapshot().context.cancellation?.reason, "found_alternative", "the chosen reason is kept, not flattened");
  a.stop();
}
{
  // G-12: TRANSPORT_STARTED was missed while offline; strict replay would make MISSION_COMPLETED a permanent no-op.
  const a = bookedPatient();
  a.send({ type: "SERVER_MISSION_ASSIGNED", payload: { missionId: M } });
  a.send({ type: "SERVER_MISSION_COMPLETED", payload: { missionId: M } });
  assert.strictEqual(a.getSnapshot().value, "tracking", "out-of-order event is still ignored by the strict machine");
  a.send({ type: "HYDRATE", payload: { missionId: M, status: "completed" } });
  assert.strictEqual(a.getSnapshot().value, "awaitingReceipt", "HYDRATE jumps forward past the missed event");
  a.stop();
}
{
  const cold = createActor(patientLifecycleMachine).start();
  cold.send({ type: "HYDRATE", payload: { missionId: M, status: "on_scene", vehicleType: "TYPE_D_ALS", jurisdiction: "DL", pickup: { latitude: 28.5, longitude: 77.2 } } });
  assert.strictEqual(cold.getSnapshot().value, "tracking", "cold launch resumes an active mission");
  assert.strictEqual(cold.getSnapshot().context.driverHasArrived, true, "on_scene => arrived step");
  assert.strictEqual(cold.getSnapshot().context.vehicleType, "TYPE_D_ALS");
  cold.send({ type: "HYDRATE", payload: { missionId: M, status: "requesting" } });
  assert.strictEqual(cold.getSnapshot().value, "requesting", "the authoritative snapshot may also move backwards (missed DRIVER_RELEASED)");
  cold.send({ type: "HYDRATE", payload: { missionId: M, status: "cancelled" } });
  assert.strictEqual(cold.getSnapshot().value, "cancelled");
  cold.send({ type: "HYDRATE", payload: { missionId: M, status: "en_route" } });
  assert.strictEqual(cold.getSnapshot().value, "cancelled", "terminal states ignore HYDRATE");
  cold.stop();
}
console.log("✓ patient machine\n");

// ---------------------------------------------------------------------------
console.log("Test 10: driver machine - revoked offers, server cancel, hydrate...");
function onlineDriver() {
  const a = createActor(driverLifecycleMachine).start();
  a.send({ type: "GO_ONLINE", payload: { driverId: D, ambulanceId: "amb", careLevel: "ALS", ais125CertPath: `${D}/arai_certificate/x.pdf`, location: { latitude: 28.5, longitude: 77.2 }, wentOnlineAt: "2026-09-24T08:00:00Z" } });
  return a;
}
{
  const a = onlineDriver();
  a.send({ type: "SERVER_OFFER_RECEIVED", payload: { offerId: "o1", missionId: M } });
  a.send({ type: "SERVER_OFFER_REVOKED", payload: { offerId: "o1", reason: "taken" } });
  assert.strictEqual(a.getSnapshot().value, "standby");
  assert.deepStrictEqual(a.getSnapshot().context.missionEnd, { kind: "offer_revoked", reason: "taken", cancelledBy: null });
  assert.strictEqual(a.getSnapshot().context.activeMissionId, null);
  a.send({ type: "SERVER_OFFER_RECEIVED", payload: { offerId: "o2", missionId: M } });
  assert.strictEqual(a.getSnapshot().context.missionEnd, null, "the notice clears with the next offer");
  a.send({ type: "SERVER_OFFER_REVOKED", payload: { offerId: "o2", reason: "cancelled" } });
  a.send({ type: "SERVER_OFFER_REVOKED", payload: { offerId: "stale", reason: "taken" } });
  assert.strictEqual(a.getSnapshot().value, "standby", "a revoke while in standby is a no-op");
  a.stop();
}
{
  const a = onlineDriver();
  a.send({ type: "SERVER_OFFER_RECEIVED", payload: { offerId: "o1", missionId: M } });
  a.send({ type: "ACCEPT_DISPATCH", payload: { missionId: M, driverId: D, offerId: "o1", acceptedAt: "2026-09-24T08:00:00Z" } });
  a.send({ type: "SERVER_MISSION_CANCELLED", payload: { missionId: M, cancelledBy: "patient", reason: "changed_mind" } });
  assert.strictEqual(a.getSnapshot().value, "standby", "G-05: the driver stops driving when the patient cancels");
  assert.deepStrictEqual(a.getSnapshot().context.missionEnd, { kind: "mission_cancelled", reason: "changed_mind", cancelledBy: "patient" });
  assert.strictEqual(a.getSnapshot().context.activeMissionId, null);
  assert.strictEqual(a.getSnapshot().context.driverId, D, "shift session survives a server cancel");
  a.stop();
}
{
  const a = createActor(driverLifecycleMachine).start();
  a.send({ type: "HYDRATE", payload: { missionId: M, status: "on_scene", driverId: D } });
  assert.strictEqual(a.getSnapshot().value, "onScene", "killed process resumes the assigned mission");
  assert.strictEqual(a.getSnapshot().context.activeMissionId, M);
  assert.strictEqual(a.getSnapshot().context.driverId, D);
  a.send({ type: "HYDRATE", payload: { missionId: M, status: "completed" } });
  assert.strictEqual(a.getSnapshot().value, "onScene", "a status with no driver state is ignored");
  a.send({ type: "HYDRATE", payload: { missionId: M, status: "arrived_hospital" } });
  assert.strictEqual(a.getSnapshot().value, "arrivedHospital");
  a.stop();
}
console.log("✓ driver machine\n");

// G-07: the quote on the category screen equals the fare the server locks, for every tier and distance.
{
  const { computeVehiclePricingEstimate, computeItemizedStatutoryFare } = await import("./pricing/index.ts");
  for (const vehicleType of ["TYPE_A_MFR", "TYPE_B_PTA", "TYPE_C_BLS", "TYPE_D_ALS"] as const) {
    for (const distanceKm of [0.4, 5, 8.4, 23.7]) {
      const q = computeVehiclePricingEstimate({ vehicleType, jurisdiction: "DL", distanceKm });
      const l = computeItemizedStatutoryFare({ vehicleType, jurisdiction: "DL", distanceKm });
      assert.strictEqual(q.estimatedTotalInr, l.estimatedTotalInr, `${vehicleType} @ ${distanceKm} km`);
    }
  }
}
console.log("✓ quote equals locked fare\n");

console.log("DATA & SYNC CONTRACT TESTS PASSED (100% GREEN)");
