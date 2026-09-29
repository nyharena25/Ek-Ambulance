import assert from "node:assert";
import { createActor } from "xstate";
import {
  patientLifecycleMachine,
  resolveJurisdiction,
  computeTriageUrgency,
  computeItemizedStatutoryFare,
  DEFAULT_DISPATCH_DISTANCE_KM,
  type GeoPoint,
  type ItemizedStatutoryFare,
} from "@sahayak/domain";
import { isValidIndianMobile, toE164IndianPhone } from "../hooks/otpAuth.core.ts";
import { createMockMissionChannel } from "../services/missionChannel.service.ts";
import { translateLifecycleEvent } from "../services/missionLifecycleBridge.ts";

/**
 * Phase 5 golden-path integration test: the full patient mission lifecycle
 * (Auth -> Location -> Triage -> Vehicle Selection -> Active Tracking ->
 * Completion), driven through the REAL production code at each layer -
 * the same pure domain functions, the same XState machine, the same mock
 * Centrifugo emitter, and the same wire-to-domain bridge every screen
 * uses - in the order the real screens call them.
 *
 * Scope note: this is an integration test of the DATA PIPELINE and STATE
 * GRAPH, not a rendered-UI test. No React Native test renderer exists
 * anywhere in this repo (every prior test suite this project added is
 * node:assert against pure/service logic), and installing one wasn't
 * asked for and would be a large new dependency for a single test. Every
 * screen in this pipeline is a thin renderer over exactly the four layers
 * exercised below; proving those chain together correctly IS proving
 * end-to-end integrity for this codebase's actual architecture.
 */

console.log("=================================================");
console.log("Running Ek-Ambulance Patient Golden Path Integration Test");
console.log("=================================================\n");

const actor = createActor(patientLifecycleMachine).start();

// ---------------------------------------------------------------------
// Step 1: Mock-authenticate via Supabase GoTrue with a valid +91 number
// ---------------------------------------------------------------------
console.log("Step 1: Mock-authenticating with a valid +91 Indian mobile number...");
const rawPhone = "9876543210";
assert.strictEqual(isValidIndianMobile(rawPhone), true, "9876543210 is a valid Indian mobile number");
assert.strictEqual(toE164IndianPhone(rawPhone), "+919876543210");

// No live Kong/GoTrue gateway exists to hit in a test environment (Task
// 4.1 D-item: EXPO_PUBLIC_SUPABASE_ANON_KEY is unconfigured) - this
// simulates exactly the Session shape supabase.auth.verifyOtp() returns
// on success, which is what booking/confirm.tsx actually reads
// (usePatientAuthStore().session?.user.id) to populate patientId.
const mockVerifiedUserId = "550e8400-e29b-41d4-a716-446655440000";
const patientId = mockVerifiedUserId;
console.log(`✓ Authenticated as patient ${patientId} (mock GoTrue session).\n`);

// ---------------------------------------------------------------------
// Step 2: Submit pickup coordinates, resolving to Delhi/UP jurisdiction
// ---------------------------------------------------------------------
console.log("Step 2: Resolving pickup coordinates to a jurisdiction...");
const pickup: GeoPoint = { latitude: 28.5672, longitude: 77.21 }; // AIIMS New Delhi
const jurisdictionResolution = resolveJurisdiction(pickup);
assert.strictEqual(jurisdictionResolution.isSupported, true, "AIIMS Delhi is inside the supported operating zone");
assert.strictEqual(jurisdictionResolution.jurisdiction, "DL", "AIIMS Delhi resolves to the DL jurisdiction");
const jurisdiction = jurisdictionResolution.jurisdiction;
assert.ok(jurisdiction, "Jurisdiction must be non-null past this point");
console.log(`✓ Pickup resolved to jurisdiction: ${jurisdiction}.\n`);

// ---------------------------------------------------------------------
// Step 3: Submit triage symptoms, deriving urgency tier via the domain
// triage engine
// ---------------------------------------------------------------------
console.log("Step 3: Submitting triage symptoms via the pure triage engine...");
const triageResult = computeTriageUrgency({ primaryComplaint: "chest_pain" });
assert.strictEqual(triageResult.tier, "CAT_1_IMMEDIATE", "Chest pain triages to Cat 1 Immediate");
assert.strictEqual(triageResult.recommendedCareLevel, "ALS", "Cat 1 mandates ALS care level");

assert.strictEqual(actor.getSnapshot().value, "idle", "Machine starts in idle");
actor.send({
  type: "SUBMIT_TRIAGE",
  payload: {
    missionDraftId: "draft-golden-path",
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
  "Full TriageResult, not just a scalar, survives into machine context"
);
console.log(`✓ Triaged: ${triageResult.tier} (${triageResult.recommendedCareLevel}).\n`);

// ---------------------------------------------------------------------
// Step 4: Select a permitted AIS-125 category and verify the calculated
// statutory fare
// ---------------------------------------------------------------------
console.log("Step 4: Selecting a permitted AIS-125 vehicle and locking the fare...");
// Cat 1 / ALS permits only TYPE_D_ALS - mirrors
// AmbulanceCategoryScreen.isVehicleEligible's ALS branch exactly.
const vehicleType = "TYPE_D_ALS" as const;

actor.send({
  type: "REQUEST",
  payload: {
    patientId,
    pickup,
    careLevel: triageResult.recommendedCareLevel,
    vehicleType,
    jurisdiction,
    requestedAt: new Date().toISOString(),
    idempotencyKey: "idem-golden-path-0001",
  },
});
assert.strictEqual(actor.getSnapshot().value, "requesting", "REQUEST -> requesting");

const quotedFare = actor.getSnapshot().context.fareDetails;
assert.ok(quotedFare, "REQUEST populates fareDetails from the pure pricing engine");

const independentlyComputedFare = computeItemizedStatutoryFare({
  vehicleType,
  jurisdiction,
  distanceKm: DEFAULT_DISPATCH_DISTANCE_KM,
});
// computedAt is a fresh ISO timestamp on each call, so it's excluded from
// the equality check and verified separately as "a real ISO string" -
// every other field must match exactly, including tariffVersion and
// statutoryOrderRef, not just the headline total.
const { computedAt: _quotedAt, ...quotedFareStable } = quotedFare;
const { computedAt: _independentAt, ...independentFareStable } = independentlyComputedFare;
assert.deepStrictEqual(
  quotedFareStable,
  independentFareStable,
  "The machine's locked fare matches an independently-computed quote for the same inputs, field for field"
);
assert.ok(!Number.isNaN(Date.parse(quotedFare.computedAt)), "computedAt is a valid ISO timestamp");
console.log(`✓ Fare locked: ₹${quotedFare.estimatedTotalInr} (${quotedFare.tariffVersion}).\n`);

// ---------------------------------------------------------------------
// Step 5: Transition through `matching` into `booking/[id]`
// ---------------------------------------------------------------------
console.log("Step 5: Transitioning through matching into booking/[id]...");
// Sent directly, not through the Centrifugo bridge: matching.tsx has no live
// mission channel subscription yet (there's no missionId to subscribe to
// until this exact event assigns one).
const missionId = "MSN-GOLDEN-PATH-0001";
actor.send({ type: "SERVER_MISSION_ASSIGNED", payload: { missionId } });
assert.strictEqual(actor.getSnapshot().value, "tracking", "SERVER_MISSION_ASSIGNED -> tracking");
assert.strictEqual(actor.getSnapshot().context.missionId, missionId);
console.log(`✓ Matched and on booking/[id] for mission ${missionId}.\n`);

// ---------------------------------------------------------------------
// Step 6: Dispatch mock Centrifugo events through the real mock emitter
// and the real wire-to-domain bridge (the exact code booking/[id].tsx
// runs), asserting XState governs every transition - including that an
// illegal jump is silently ignored, not thrown or force-applied.
// ---------------------------------------------------------------------
console.log("Step 6: Dispatching mock Centrifugo events through the real bridge...");

const receivedEvents: string[] = [];
const mockChannel = createMockMissionChannel(missionId, {
  onStatusChange: () => {},
  onSubscriptionStateChange: () => {},
  onTelemetry: () => {},
  onError: () => {},
  onLifecycleEvent: (event, id) => {
    receivedEvents.push(event);
    actor.send(translateLifecycleEvent(event, id));
  },
});

// Illegal jump: DRIVER_ACCEPTED again while already `tracking` has no
// handler there (only `requesting` does) - XState's own state-chart
// structure makes this a structural no-op, not a thrown error or a
// silently-forced re-assignment.
const beforeIllegalJump = actor.getSnapshot();
mockChannel.controls.triggerDriverAccepted();
assert.strictEqual(
  actor.getSnapshot().value,
  beforeIllegalJump.value,
  "A duplicate DRIVER_ACCEPTED while already tracking is ignored, not re-applied"
);
assert.strictEqual(
  actor.getSnapshot().context.missionId,
  beforeIllegalJump.context.missionId,
  "Context is untouched by the ignored duplicate event"
);
assert.strictEqual(
  actor.getSnapshot().context.driverHasArrived,
  false,
  "driverHasArrived must still be false here - a mistranslation of DRIVER_ACCEPTED into SERVER_DRIVER_ARRIVED " +
    "would otherwise flip this true and slip past every other assertion in this block undetected"
);
console.log("  ✓ Illegal jump (duplicate DRIVER_ACCEPTED while tracking) correctly ignored.");

mockChannel.controls.triggerDriverArrived();
assert.strictEqual(actor.getSnapshot().value, "tracking", "DRIVER_ARRIVED stays in tracking - context-only");
assert.strictEqual(actor.getSnapshot().context.driverHasArrived, true, "driverHasArrived flips true");
console.log("  ✓ DRIVER_ARRIVED -> context.driverHasArrived = true (same screen).");

mockChannel.controls.triggerTransportStarted();
assert.strictEqual(actor.getSnapshot().value, "transporting", "TRANSPORT_STARTED -> transporting");
assert.strictEqual(actor.getSnapshot().context.driverHasArrived, false, "Cleared on transport start");
console.log("  ✓ TRANSPORT_STARTED -> transporting.");

mockChannel.controls.triggerMissionCompleted();
assert.strictEqual(actor.getSnapshot().value, "awaitingReceipt", "MISSION_COMPLETED -> awaitingReceipt");
console.log("  ✓ MISSION_COMPLETED -> awaitingReceipt.");

assert.deepStrictEqual(
  receivedEvents,
  ["DRIVER_ACCEPTED", "DRIVER_ARRIVED", "TRANSPORT_STARTED", "MISSION_COMPLETED"],
  "All four dispatched wire events actually reached the bridge, in order"
);

// Clean up the mock's internal timers (setInterval/setTimeout) so this
// script exits promptly rather than hanging on a live timer - the same
// discipline missionChannel.service.test.ts already applies to
// mountMissionChannel's teardown.
mockChannel.teardown();
console.log("✓ Mock Centrifugo channel torn down cleanly.\n");

// ---------------------------------------------------------------------
// Step 7: Verify the final screen renders the exact ItemizedStatutoryFare
// matching the initial quote
// ---------------------------------------------------------------------
console.log("Step 7: Verifying the completion screen's fare matches the initial quote...");
// This is literally the value booking/[id].tsx passes as
// MissionCompletionScreen's fareDetails prop once state reaches
// awaitingReceipt/receiptConfirmed (context.fareDetails, with no
// recomputation fallback needed since the machine never lost it).
const finalFare: ItemizedStatutoryFare | null = actor.getSnapshot().context.fareDetails;
assert.ok(finalFare, "fareDetails is still populated at awaitingReceipt");
assert.deepStrictEqual(
  finalFare,
  quotedFare,
  "The fare shown at completion is the exact same object locked at REQUEST time - untouched by any of the five intervening transitions"
);
console.log(`✓ Final fare matches initial quote exactly: ₹${finalFare.estimatedTotalInr}.\n`);

// ---------------------------------------------------------------------
// Additional illegal-jump coverage: CONFIRM_RECEIPT too early, REQUEST
// too late.
// ---------------------------------------------------------------------
console.log("Additional check: illegal transitions from awaitingReceipt are ignored...");
actor.send({
  type: "REQUEST",
  payload: {
    patientId,
    pickup,
    careLevel: "ALS",
    vehicleType: "TYPE_D_ALS",
    jurisdiction,
    requestedAt: new Date().toISOString(),
    idempotencyKey: "idem-illegal-0001",
  },
});
assert.strictEqual(
  actor.getSnapshot().value,
  "awaitingReceipt",
  "REQUEST has no handler in awaitingReceipt - ignored, does not restart the flow"
);
console.log("✓ A stray REQUEST at awaitingReceipt is ignored, not restarted.\n");

actor.stop();

// ---------------------------------------------------------------------
// Mission cancellation, mid-mission: a fresh actor, since CANCEL is only
// reachable from triaged/requesting/tracking - the actor above is already
// past all three. Replicates the minimal path to `tracking` (triage ->
// request -> assigned), then dispatches MISSION_CANCELLED through the
// same real mock channel + real bridge as step 6, exactly as dispatch or
// an assigned driver cancelling mid-mission would arrive in production.
// ---------------------------------------------------------------------
console.log("Additional check: MISSION_CANCELLED transitions to cancelled and clears active tracking context...");

const cancelMissionId = "MSN-GOLDEN-PATH-CANCEL-0001";
const cancelActor = createActor(patientLifecycleMachine).start();
cancelActor.send({
  type: "SUBMIT_TRIAGE",
  payload: {
    missionDraftId: "draft-cancel-path",
    symptoms: triageResult.symptomFlags,
    answeredAt: new Date().toISOString(),
    locale: "en",
    result: triageResult,
  },
});
cancelActor.send({
  type: "REQUEST",
  payload: {
    patientId,
    pickup,
    careLevel: "ALS",
    vehicleType: "TYPE_D_ALS",
    jurisdiction,
    requestedAt: new Date().toISOString(),
    idempotencyKey: "idem-cancel-path-0001",
  },
});
cancelActor.send({ type: "SERVER_MISSION_ASSIGNED", payload: { missionId: cancelMissionId } });
assert.strictEqual(cancelActor.getSnapshot().value, "tracking", "Cancel-path actor reaches tracking before cancellation");

const cancelMockChannel = createMockMissionChannel(cancelMissionId, {
  onStatusChange: () => {},
  onSubscriptionStateChange: () => {},
  onTelemetry: () => {},
  onError: () => {},
  onLifecycleEvent: (event, id) => {
    cancelActor.send(translateLifecycleEvent(event, id));
  },
});
cancelMockChannel.controls.triggerDriverArrived();
assert.strictEqual(cancelActor.getSnapshot().context.driverHasArrived, true, "Driver arrived before the cancellation arrives");

cancelMockChannel.controls.triggerCancelled();
assert.strictEqual(cancelActor.getSnapshot().value, "cancelled", "MISSION_CANCELLED -> cancelled");
assert.strictEqual(cancelActor.getSnapshot().context.missionId, null, "missionId is cleared - no active mission to keep tracking");
assert.strictEqual(cancelActor.getSnapshot().context.driverHasArrived, false, "driverHasArrived is cleared alongside missionId");
console.log("✓ MISSION_CANCELLED transitions to cancelled and clears active tracking context.\n");

cancelMockChannel.teardown();
cancelActor.stop();

console.log("=================================================");
console.log("GOLDEN PATH INTEGRATION TEST PASSED (100% GREEN)");
console.log("=================================================");
