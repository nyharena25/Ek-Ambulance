import assert from "node:assert";
import { createActor } from "xstate";
import { patientLifecycleMachine, DEFAULT_DISPATCH_DISTANCE_KM } from "./patientLifecycle.machine.ts";
import { computeTriageUrgency } from "../triage/index.ts";

console.log("=================================================");
console.log("Running Ek-Ambulance Patient Lifecycle Machine Tests");
console.log("=================================================\n");

// Test 1: Happy path, idle -> ... -> receiptConfirmed
console.log("Test 1: Validating full happy-path transition sequence...");

const triageResult = computeTriageUrgency({ primaryComplaint: "chest_pain" });
const actor = createActor(patientLifecycleMachine).start();

assert.strictEqual(actor.getSnapshot().value, "idle", "Machine starts in idle");

actor.send({
  type: "SUBMIT_TRIAGE",
  payload: {
    missionDraftId: "draft-001",
    symptoms: triageResult.symptomFlags,
    answeredAt: new Date().toISOString(),
    locale: "en",
    result: triageResult,
  },
});
assert.strictEqual(actor.getSnapshot().value, "triaged", "SUBMIT_TRIAGE -> triaged");
assert.strictEqual(
  actor.getSnapshot().context.triageResult?.tier,
  "CAT_1_IMMEDIATE",
  "Context carries the full TriageResult, not just a scalar tier"
);

actor.send({
  type: "REQUEST",
  payload: {
    patientId: "PAT-TEST-0001",
    pickup: { latitude: 28.5672, longitude: 77.21 },
    careLevel: "ALS",
    vehicleType: "TYPE_D_ALS",
    jurisdiction: "DL",
    requestedAt: new Date().toISOString(),
    idempotencyKey: "idem-001",
  },
});
assert.strictEqual(actor.getSnapshot().value, "requesting", "REQUEST -> requesting");
const fareDetails = actor.getSnapshot().context.fareDetails;
assert.ok(fareDetails, "REQUEST populates fareDetails from the pure pricing engine");
assert.strictEqual(fareDetails.vehicleType, "TYPE_D_ALS");
assert.strictEqual(
  fareDetails.totalDistanceKm,
  DEFAULT_DISPATCH_DISTANCE_KM,
  "Fare is computed against the single shared placeholder distance constant"
);
assert.strictEqual(fareDetails.estimatedTotalInr, 585, "TYPE_D_ALS @ 8.4km = base 500 + 85");

actor.send({ type: "SERVER_MISSION_ASSIGNED", payload: { missionId: "MSN-TEST-0001" } });
assert.strictEqual(actor.getSnapshot().value, "tracking", "SERVER_MISSION_ASSIGNED -> tracking");
assert.strictEqual(actor.getSnapshot().context.missionId, "MSN-TEST-0001");

actor.send({ type: "SERVER_TRANSPORT_STARTED", payload: { missionId: "MSN-TEST-0001" } });
assert.strictEqual(actor.getSnapshot().value, "transporting", "SERVER_TRANSPORT_STARTED -> transporting");

actor.send({ type: "SERVER_MISSION_COMPLETED", payload: { missionId: "MSN-TEST-0001" } });
assert.strictEqual(actor.getSnapshot().value, "awaitingReceipt", "SERVER_MISSION_COMPLETED -> awaitingReceipt");

actor.send({
  type: "CONFIRM_RECEIPT",
  payload: {
    missionId: "MSN-TEST-0001",
    receiptId: "receipts/PAT-TEST-0001/MSN-TEST-0001.pdf",
    confirmedAt: new Date().toISOString(),
    disputeFlag: false,
  },
});
assert.strictEqual(actor.getSnapshot().value, "receiptConfirmed", "CONFIRM_RECEIPT -> receiptConfirmed");
console.log("✓ Full happy-path sequence transitions through all 7 real states correctly.\n");

actor.stop();

// Test 2: Invalid transitions are no-ops, not crashes or silent state corruption
console.log("Test 2: Validating invalid transitions are no-ops...");

const guarded = createActor(patientLifecycleMachine).start();
assert.strictEqual(guarded.getSnapshot().value, "idle");

// REQUEST is only valid from `triaged`; sending it from `idle` must not move the machine.
guarded.send({
  type: "REQUEST",
  payload: {
    patientId: "PAT-TEST-0002",
    pickup: { latitude: 28.5672, longitude: 77.21 },
    careLevel: "ALS",
    vehicleType: "TYPE_D_ALS",
    jurisdiction: "DL",
    requestedAt: new Date().toISOString(),
    idempotencyKey: "idem-002",
  },
});
assert.strictEqual(guarded.getSnapshot().value, "idle", "REQUEST from idle is a no-op");
assert.strictEqual(guarded.getSnapshot().context.fareDetails, null, "No fare computed on a no-op transition");

// SERVER_MISSION_COMPLETED is only valid from `transporting`; sending it from idle is a no-op too.
guarded.send({ type: "SERVER_MISSION_COMPLETED", payload: { missionId: "MSN-TEST-0002" } });
assert.strictEqual(guarded.getSnapshot().value, "idle", "SERVER_MISSION_COMPLETED from idle is a no-op");

guarded.stop();
console.log("✓ Invalid transitions leave the machine's state and context untouched.\n");

// Test 3: Cancellation is reachable from the pre-transport states, and only those.
console.log("Test 3: Validating CANCEL is reachable before transport but not after...");

const cancellable = createActor(patientLifecycleMachine).start();
cancellable.send({
  type: "SUBMIT_TRIAGE",
  payload: {
    missionDraftId: "draft-003",
    symptoms: triageResult.symptomFlags,
    answeredAt: new Date().toISOString(),
    locale: "en",
    result: triageResult,
  },
});
cancellable.send({
  type: "CANCEL",
  payload: { missionId: "MSN-TEST-0003", reason: "changed_mind", cancelledAt: new Date().toISOString() },
});
assert.strictEqual(cancellable.getSnapshot().value, "cancelled", "CANCEL from triaged -> cancelled");
cancellable.stop();

const notCancellable = createActor(patientLifecycleMachine).start();
notCancellable.send({
  type: "SUBMIT_TRIAGE",
  payload: {
    missionDraftId: "draft-004",
    symptoms: triageResult.symptomFlags,
    answeredAt: new Date().toISOString(),
    locale: "en",
    result: triageResult,
  },
});
notCancellable.send({
  type: "REQUEST",
  payload: {
    patientId: "PAT-TEST-0004",
    pickup: { latitude: 28.5672, longitude: 77.21 },
    careLevel: "ALS",
    vehicleType: "TYPE_D_ALS",
    jurisdiction: "DL",
    requestedAt: new Date().toISOString(),
    idempotencyKey: "idem-004",
  },
});
notCancellable.send({ type: "SERVER_MISSION_ASSIGNED", payload: { missionId: "MSN-TEST-0004" } });
notCancellable.send({ type: "SERVER_TRANSPORT_STARTED", payload: { missionId: "MSN-TEST-0004" } });
notCancellable.send({
  type: "CANCEL",
  payload: { missionId: "MSN-TEST-0004", reason: "changed_mind", cancelledAt: new Date().toISOString() },
});
assert.strictEqual(
  notCancellable.getSnapshot().value,
  "transporting",
  "CANCEL from transporting is a no-op - once onboard, the patient cannot cancel"
);
notCancellable.stop();
console.log("✓ CANCEL is reachable pre-transport and correctly refused once transporting.\n");

// Test 4: SERVER_DRIVER_ARRIVED is a context-only update, not a state change.
console.log("Test 4: Validating SERVER_DRIVER_ARRIVED updates context without changing state...");

const arrived = createActor(patientLifecycleMachine).start();
arrived.send({
  type: "SUBMIT_TRIAGE",
  payload: {
    missionDraftId: "draft-005",
    symptoms: triageResult.symptomFlags,
    answeredAt: new Date().toISOString(),
    locale: "en",
    result: triageResult,
  },
});
arrived.send({
  type: "REQUEST",
  payload: {
    patientId: "PAT-TEST-0005",
    pickup: { latitude: 28.5672, longitude: 77.21 },
    careLevel: "ALS",
    vehicleType: "TYPE_D_ALS",
    jurisdiction: "DL",
    requestedAt: new Date().toISOString(),
    idempotencyKey: "idem-005",
  },
});
arrived.send({ type: "SERVER_MISSION_ASSIGNED", payload: { missionId: "MSN-TEST-0005" } });
assert.strictEqual(arrived.getSnapshot().value, "tracking");
assert.strictEqual(arrived.getSnapshot().context.driverHasArrived, false, "Starts false");

arrived.send({ type: "SERVER_DRIVER_ARRIVED", payload: { missionId: "MSN-TEST-0005" } });
assert.strictEqual(
  arrived.getSnapshot().value,
  "tracking",
  "SERVER_DRIVER_ARRIVED does not change state.value - same screen throughout"
);
assert.strictEqual(
  arrived.getSnapshot().context.driverHasArrived,
  true,
  "SERVER_DRIVER_ARRIVED does flip the context flag"
);

// Starting transport clears the flag (a fresh "has arrived at hospital"
// concept, if ever needed, would be its own field - this one is specifically
// about pickup arrival).
arrived.send({ type: "SERVER_TRANSPORT_STARTED", payload: { missionId: "MSN-TEST-0005" } });
assert.strictEqual(arrived.getSnapshot().value, "transporting");
assert.strictEqual(arrived.getSnapshot().context.driverHasArrived, false, "Cleared on transport start");

arrived.stop();
console.log("✓ SERVER_DRIVER_ARRIVED is context-only; transport start clears the flag.\n");

console.log("=================================================");
console.log("ALL PATIENT LIFECYCLE MACHINE TESTS PASSED (100% GREEN)");
console.log("=================================================");
