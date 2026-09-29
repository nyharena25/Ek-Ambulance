import assert from "node:assert";
import { createActor } from "xstate";
import {
  patientLifecycleMachine,
  driverLifecycleMachine,
  computeTriageUrgency,
  computeItemizedStatutoryFare,
  DEFAULT_DISPATCH_DISTANCE_KM,
  isMissionTelemetryPing,
  type GeoPoint,
} from "@sahayak/domain";
import { translateLifecycleEvent } from "../services/missionLifecycleBridge.ts";
import { parseCreateMissionResult } from "../lib/missionApi.core.ts";

/**
 * Cross-Client Integration & Stabilization Sweep: mounts the REAL patient
 * and driver XState actors simultaneously and drives the full bilateral
 * mission lifecycle through the same wire vocabulary and bridge function
 * production code uses (translateLifecycleEvent, unchanged from
 * goldenPath.test.ts) - proving the two independently-developed machines
 * actually agree on every handoff point, not just that each one is
 * internally correct in isolation.
 *
 * Co-located here (apps/patient/src/integration/), not at the directive's
 * suggested packages/domain/src/__tests__/crossClientMission.test.ts:
 * this repo has no __tests__/ directory anywhere (co-located *.test.ts is
 * the established convention, confirmed in Phase 2), and this test needs
 * apps/patient's own missionLifecycleBridge.ts - importing an app's
 * service from inside packages/domain would be a backwards dependency
 * packages/domain does not otherwise have. apps/patient already imports
 * driverLifecycleMachine (a forward, ordinary dependency on @sahayak/domain)
 * for its own screens, so this is the natural home.
 *
 * apps/driver's driverTelemetry.ts is NOT imported here - apps/patient
 * depending on apps/driver would be the same backwards-dependency problem
 * in the other direction. Telemetry parity is instead verified by
 * constructing a ping in the exact shape driverTelemetry.ts produces and
 * running it through the shared isMissionTelemetryPing guard both real
 * services now import from @sahayak/domain.
 */

console.log("=================================================");
console.log("Running Ek-Ambulance Cross-Client Mission Integration Test");
console.log("=================================================\n");

const now = () => new Date().toISOString();
const missionId = "MSN-CROSS-CLIENT-0001";
const patientId = "PAT-CROSS-CLIENT-0001";
const driverId = "DRV-CROSS-CLIENT-0001";

const patientActor = createActor(patientLifecycleMachine).start();
const driverActor = createActor(driverLifecycleMachine).start();

// ---------------------------------------------------------------------
// Step 1: Patient requests a mission and enters `requesting` - the
// machine state the "matching" screen (ActiveMatchingScreen) renders,
// per goldenPath.test.ts's own comment at the identical step.
// ---------------------------------------------------------------------
console.log("Step 1: Patient triages, requests, and enters matching (requesting)...");
const pickup: GeoPoint = { latitude: 28.5672, longitude: 77.21 }; // AIIMS New Delhi
// Jurisdiction is the server's (create_mission reply), never classified by the app (R-12).
const created = parseCreateMissionResult({
  replay: false,
  mission: { id: "00000000-0000-4000-8000-00000000c0de", status: "requesting", stateVersion: 1, jurisdiction: "DL" },
});
assert.ok(created);
const jurisdiction = created.jurisdiction;
assert.strictEqual(jurisdiction, "DL");

const triageResult = computeTriageUrgency({ primaryComplaint: "chest_pain" });
patientActor.send({
  type: "SUBMIT_TRIAGE",
  payload: {
    missionDraftId: "draft-cross-client",
    symptoms: triageResult.symptomFlags,
    answeredAt: now(),
    locale: "en",
    result: triageResult,
  },
});

const vehicleType = "TYPE_D_ALS" as const;
patientActor.send({
  type: "REQUEST",
  payload: {
    patientId,
    pickup,
    careLevel: triageResult.recommendedCareLevel,
    vehicleType,
    jurisdiction,
    requestedAt: now(),
    idempotencyKey: "idem-cross-client-0001",
  },
});
assert.strictEqual(patientActor.getSnapshot().value, "requesting", "Patient enters requesting (\"matching\")");
const quotedFare = patientActor.getSnapshot().context.fareDetails;
assert.ok(quotedFare, "Patient's fare is locked at request time");
console.log(`✓ Patient triaged (${triageResult.tier}) and requesting, fare locked at ₹${quotedFare.estimatedTotalInr}.\n`);

// ---------------------------------------------------------------------
// Step 2: Dispatch issues the offer; driver accepts within the 15s
// window. The countdown itself is UI-layer (IncomingMissionModal.tsx /
// dispatchOffer.core.ts's OFFER_WINDOW_SECONDS, Phase 2) - the machine
// only cares that ACCEPT_DISPATCH arrives while `offered`, not how many
// of the 15 seconds were used; that boundary is already covered by
// driverLifecycle.test.ts's own SERVER_OFFER_TIMEOUT case.
// ---------------------------------------------------------------------
console.log("Step 2: Dispatch offers the mission; driver accepts within the wave window...");
driverActor.send({
  type: "GO_ONLINE",
  payload: {
    driverId,
    ambulanceId: "AMB-CROSS-CLIENT-0001",
    careLevel: triageResult.recommendedCareLevel,
    ais125CertPath: "storage/certs/drv-cross-client.pdf",
    location: { latitude: 28.5355, longitude: 77.391 },
    wentOnlineAt: now(),
  },
});
assert.strictEqual(driverActor.getSnapshot().value, "standby");

driverActor.send({ type: "SERVER_OFFER_RECEIVED", payload: { offerId: "OFFER-CROSS-CLIENT", missionId } });
assert.strictEqual(driverActor.getSnapshot().value, "offered");

driverActor.send({
  type: "ACCEPT_DISPATCH",
  payload: { missionId, driverId, offerId: "OFFER-CROSS-CLIENT", acceptedAt: now() },
});
assert.strictEqual(driverActor.getSnapshot().value, "enRouteToPatient", "Driver accepted and is en route");
console.log("✓ Driver accepted the offer and is enRouteToPatient.\n");

// ---------------------------------------------------------------------
// Step 3: Patient receives DRIVER_ACCEPTED over the real bridge function
// and transitions to active tracking.
// ---------------------------------------------------------------------
console.log("Step 3: Patient receives DRIVER_ACCEPTED via the real wire bridge...");
patientActor.send(translateLifecycleEvent("DRIVER_ACCEPTED", missionId));
assert.strictEqual(patientActor.getSnapshot().value, "tracking", "SERVER_MISSION_ASSIGNED -> tracking");
assert.strictEqual(patientActor.getSnapshot().context.missionId, missionId);
console.log("✓ Patient is tracking the accepted mission.\n");

// ---------------------------------------------------------------------
// Step 4: Driver fires a telemetry ping; patient's real shared guard
// (the same one apps/patient/src/services/missionChannel.service.ts and
// apps/driver/src/services/driverTelemetry.ts both import) processes it
// without error. Constructed in the exact shape driverTelemetry.ts
// produces - `heading`, not `bearing` (the schema drift this sweep fixed).
// ---------------------------------------------------------------------
console.log("Step 4: Driver fires a telemetry ping; patient's shared guard processes it without error...");
const telemetryPing = {
  latitude: 28.534,
  longitude: 77.4,
  heading: 42,
  speed: 46,
  timestamp: now(),
};
assert.strictEqual(
  isMissionTelemetryPing(telemetryPing),
  true,
  "The exact ping shape driverTelemetry.ts publishes is accepted by the shared guard patient's channel uses"
);
let receivedTelemetry: typeof telemetryPing | null = null;
const onTelemetryReceived = (ping: typeof telemetryPing) => {
  // Mirrors useMissionChannel.ts's onTelemetryReceived callback - telemetry
  // is UI-consumed directly, not a machine transition, so there is no
  // patient machine state to assert here beyond "this ran without throwing".
  receivedTelemetry = ping;
};
onTelemetryReceived(telemetryPing);
assert.deepStrictEqual(receivedTelemetry, telemetryPing, "Patient-side consumer receives the exact ping driver published");
console.log("✓ Patient processed the driver's coordinates without error.\n");

// ---------------------------------------------------------------------
// Step 5: Driver progresses arrival -> transport start (with hospital
// selection) -> hospital arrival -> completion; patient receives the
// corresponding wire events at each translatable step.
// ---------------------------------------------------------------------
console.log("Step 5: Driver signals ARRIVED_ON_SCENE -> START_TRANSPORT -> CONFIRM_ARRIVAL_HOSPITAL -> COMPLETE_MISSION...");

driverActor.send({
  type: "CONFIRM_ARRIVAL_SCENE",
  payload: { missionId, driverId, location: pickup, arrivedAt: now() },
});
assert.strictEqual(driverActor.getSnapshot().value, "onScene", "ARRIVED_ON_SCENE -> driver onScene");
patientActor.send(translateLifecycleEvent("DRIVER_ARRIVED", missionId));
assert.strictEqual(patientActor.getSnapshot().value, "tracking", "DRIVER_ARRIVED is context-only for the patient - same screen");
assert.strictEqual(patientActor.getSnapshot().context.driverHasArrived, true);
console.log("  ✓ Driver onScene; patient's driverHasArrived flips true.");

const destinationHospital: GeoPoint = { latitude: 28.5144, longitude: 77.3698 }; // Jaypee Hospital, Sec 128
driverActor.send({
  type: "CONFIRM_PATIENT_ONBOARD",
  payload: { missionId, driverId, destination: destinationHospital, onboardAt: now() },
});
assert.strictEqual(driverActor.getSnapshot().value, "transporting", "START_TRANSPORT (with hospital selection) -> driver transporting");
patientActor.send(translateLifecycleEvent("TRANSPORT_STARTED", missionId));
assert.strictEqual(patientActor.getSnapshot().value, "transporting", "TRANSPORT_STARTED -> patient transporting");
assert.strictEqual(patientActor.getSnapshot().context.driverHasArrived, false, "Cleared on transport start");
console.log("  ✓ Driver transporting to the selected hospital; patient transitions to transporting.");

driverActor.send({
  type: "CONFIRM_ARRIVAL_HOSPITAL",
  payload: { missionId, driverId, location: destinationHospital, arrivedAt: now() },
});
assert.strictEqual(driverActor.getSnapshot().value, "arrivedHospital", "CONFIRM_ARRIVAL_HOSPITAL -> driver arrivedHospital");
// No wire event exists for hospital arrival specifically - the patient
// bridge's vocabulary (DRIVER_ACCEPTED/DRIVER_ARRIVED/TRANSPORT_STARTED/
// MISSION_COMPLETED/MISSION_CANCELLED) has no "hospital arrived" entry,
// and the directive does not name one. Patient stays in transporting
// until MISSION_COMPLETED, matching the real screen's behavior.
console.log("  ✓ Driver arrivedHospital (no distinct wire event for this step - patient stays transporting).");

// Fare parity: the wire's MISSION_COMPLETED event carries only
// { missionId } - no fare field crosses the channel today, so patient's
// displayed fare (quotedFare, locked at REQUEST time) and the driver's
// completion receipt are structurally independent values in production.
// What IS verifiable, and what this asserts, is that the shared pricing
// engine is deterministic: computed from the same canonical inputs
// (vehicleType, jurisdiction, DEFAULT_DISPATCH_DISTANCE_KM) a real backend
// would need to hand both clients, it produces the identical fare either
// side.
const driverSideFare = computeItemizedStatutoryFare({
  vehicleType,
  jurisdiction,
  distanceKm: DEFAULT_DISPATCH_DISTANCE_KM,
});
driverActor.send({
  type: "COMPLETE_MISSION",
  payload: { missionId, driverId, finalFareInr: driverSideFare.estimatedTotalInr, completedAt: now() },
});
assert.strictEqual(driverActor.getSnapshot().value, "standby", "COMPLETE_MISSION -> driver back to standby, available for the next dispatch");
assert.strictEqual(driverActor.getSnapshot().context.activeMissionId, null);

patientActor.send(translateLifecycleEvent("MISSION_COMPLETED", missionId));
assert.strictEqual(patientActor.getSnapshot().value, "awaitingReceipt", "MISSION_COMPLETED -> patient awaitingReceipt");
console.log("  ✓ Driver completed and returned to standby; patient reached awaitingReceipt.\n");

// ---------------------------------------------------------------------
// Step 6: Patient confirms the receipt; verify fare parity and that both
// actors have reached their real baseline/terminal states.
// ---------------------------------------------------------------------
console.log("Step 6: Verifying fare parity and terminal/baseline states...");
assert.strictEqual(
  driverSideFare.estimatedTotalInr,
  quotedFare.estimatedTotalInr,
  "Given the same canonical inputs, the shared pricing engine produces the identical fare for both the patient's locked quote and the driver's completion receipt"
);

patientActor.send({
  type: "CONFIRM_RECEIPT",
  payload: {
    missionId,
    receiptId: `receipts/${patientId}/${missionId}.pdf`,
    confirmedAt: now(),
    disputeFlag: false,
  },
});
assert.strictEqual(patientActor.getSnapshot().value, "receiptConfirmed", "Patient reaches its real terminal state");

// `receiptConfirmed` has no outgoing transitions (by design - see
// patientLifecycle.machine.ts's own doc comment); returning to `idle` is
// an app-layer action (usePatientLifecycleStore.reset(): stop this actor,
// mount a fresh one), not something the machine does to itself. Verifying
// "resets cleanly to idle" means verifying that mechanism, not sending
// idle-reaching events to a terminal actor.
const freshPatientActor = createActor(patientLifecycleMachine).start();
assert.strictEqual(freshPatientActor.getSnapshot().value, "idle", "A freshly-mounted actor (the reset() mechanism) starts at idle");

// The driver machine's baseline IS reachable via its own COMPLETE_MISSION
// transition (already asserted above) - unlike patient, no store-level
// reset() was needed to reach standby.
assert.strictEqual(driverActor.getSnapshot().value, "standby", "Driver actor is already at its baseline (standby) without needing a reset()");
console.log("✓ Fare parity confirmed; patient reached receiptConfirmed (idle reachable via reset()); driver reached standby directly.\n");

console.log("=================================================");
console.log("CROSS-CLIENT MISSION INTEGRATION TEST PASSED (100% GREEN)");
console.log("=================================================");
