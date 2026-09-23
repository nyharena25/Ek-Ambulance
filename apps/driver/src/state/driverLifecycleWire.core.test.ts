import assert from "node:assert";
import { createActor } from "xstate";
import { driverLifecycleMachine, type DriverLifecycleState } from "@sahayak/domain";
import { wireLifecycleEventFor, publishForTransition, type WireLifecyclePublisher } from "./driverLifecycleWire.core.ts";

console.log("=================================================");
console.log("Running Ek-Ambulance Driver Lifecycle Wire Event Tests");
console.log("=================================================\n");

function createFakePublisher() {
  const calls: { event: string; driverId: string }[] = [];
  const publisher: WireLifecyclePublisher = {
    publishLifecycleEvent: (event, driverId) => {
      calls.push({ event, driverId });
    },
  };
  return { publisher, calls };
}

const now = () => new Date().toISOString();
const missionId = "MSN-WIRE-TEST-0001";
const driverId = "DRV-WIRE-TEST-0001";

console.log("Test 1: Pure mapping - each of the 5 UI progression actions maps to its wire event...");
assert.strictEqual(wireLifecycleEventFor("ACCEPT_DISPATCH", "offered", "enRouteToPatient"), "DRIVER_ACCEPTED", "Swipe to Accept -> DRIVER_ACCEPTED");
assert.strictEqual(wireLifecycleEventFor("CONFIRM_ARRIVAL_SCENE", "enRouteToPatient", "onScene"), "DRIVER_ARRIVED", "Slide to confirm arrival -> DRIVER_ARRIVED");
assert.strictEqual(wireLifecycleEventFor("CONFIRM_PATIENT_ONBOARD", "onScene", "transporting"), "TRANSPORT_STARTED", "Slide to start transport -> TRANSPORT_STARTED");
assert.strictEqual(wireLifecycleEventFor("COMPLETE_MISSION", "arrivedHospital", "standby"), "MISSION_COMPLETED", "Hospital ER handoff confirmed -> MISSION_COMPLETED");
assert.strictEqual(wireLifecycleEventFor("ABORT_MISSION", "transporting", "standby"), "MISSION_CANCELLED", "Back-out/cancel -> MISSION_CANCELLED");
console.log("✓ All 5 UI progression actions map to their correct wire event.\n");

console.log("Test 2: Events with no patient-visible wire counterpart map to null despite a real transition...");
assert.strictEqual(wireLifecycleEventFor("GO_ONLINE", "offline", "standby"), null, "GO_ONLINE has no wire event");
assert.strictEqual(wireLifecycleEventFor("GO_OFFLINE", "standby", "offline"), null, "GO_OFFLINE has no wire event");
assert.strictEqual(wireLifecycleEventFor("DECLINE_DISPATCH", "offered", "standby"), null, "DECLINE_DISPATCH has no wire event (no DRIVER_DECLINED in the wire vocabulary)");
assert.strictEqual(wireLifecycleEventFor("SERVER_OFFER_TIMEOUT", "offered", "standby"), null, "SERVER_OFFER_TIMEOUT has no wire event");
assert.strictEqual(wireLifecycleEventFor("CONFIRM_ARRIVAL_HOSPITAL", "transporting", "arrivedHospital"), null, "CONFIRM_ARRIVAL_HOSPITAL has no distinct wire event (confirmed in the Cross-Client sweep's own test)");
console.log("✓ Unmapped events correctly publish nothing, even though the state genuinely changed.\n");

console.log("Test 3: Duplicate-call guard - an event that maps to a wire event still returns null if the transition was rejected...");
assert.strictEqual(
  wireLifecycleEventFor("COMPLETE_MISSION", "transporting", "transporting"),
  null,
  "COMPLETE_MISSION sent from transporting (rejected, no state change) must not publish MISSION_COMPLETED for something that didn't happen"
);
assert.strictEqual(
  wireLifecycleEventFor("ACCEPT_DISPATCH", "enRouteToPatient", "enRouteToPatient"),
  null,
  "A duplicate ACCEPT_DISPATCH while already enRouteToPatient (e.g. a re-rendered double-tap) must not re-publish DRIVER_ACCEPTED"
);
console.log("✓ Only a genuine state change triggers a wire publish, closing the 'duplicate network call' requirement.\n");

console.log("Test 4: publishForTransition drives a REAL driverLifecycleMachine actor through all 5 UI actions end-to-end, verifying the fake publisher receives exactly the right calls...");
const actor = createActor(driverLifecycleMachine).start();
const { publisher, calls } = createFakePublisher();

function sendAndPublish(event: Parameters<typeof actor.send>[0]) {
  const before = actor.getSnapshot();
  actor.send(event);
  const after = actor.getSnapshot();
  return publishForTransition(
    publisher,
    event.type,
    before.value as DriverLifecycleState,
    after.value as DriverLifecycleState,
    after.context.activeMissionId ?? before.context.activeMissionId,
    after.context.driverId ?? before.context.driverId
  );
}

sendAndPublish({
  type: "GO_ONLINE",
  payload: { driverId, ambulanceId: "AMB-WIRE-TEST", careLevel: "ALS", ais125CertPath: "storage/certs/wire-test.pdf", location: { latitude: 28.5355, longitude: 77.391 }, wentOnlineAt: now() },
});
assert.strictEqual(calls.length, 0, "GO_ONLINE publishes nothing");

sendAndPublish({ type: "SERVER_OFFER_RECEIVED", payload: { offerId: "OFFER-WIRE-TEST", missionId } });
assert.strictEqual(calls.length, 0, "SERVER_OFFER_RECEIVED publishes nothing (dispatch-service-originated, not a driver UI action)");

sendAndPublish({ type: "ACCEPT_DISPATCH", payload: { missionId, driverId, offerId: "OFFER-WIRE-TEST", acceptedAt: now() } });
assert.deepStrictEqual(calls[0], { event: "DRIVER_ACCEPTED", driverId }, "Swipe to Accept published DRIVER_ACCEPTED with the driver's ID");

sendAndPublish({ type: "CONFIRM_ARRIVAL_SCENE", payload: { missionId, driverId, location: { latitude: 28.53, longitude: 77.39 }, arrivedAt: now() } });
assert.deepStrictEqual(calls[1], { event: "DRIVER_ARRIVED", driverId }, "Slide to confirm arrival published DRIVER_ARRIVED");

sendAndPublish({ type: "CONFIRM_PATIENT_ONBOARD", payload: { missionId, driverId, destination: { latitude: 28.56, longitude: 77.24 }, onboardAt: now() } });
assert.deepStrictEqual(calls[2], { event: "TRANSPORT_STARTED", driverId }, "Slide to start transport published TRANSPORT_STARTED");

sendAndPublish({ type: "CONFIRM_ARRIVAL_HOSPITAL", payload: { missionId, driverId, location: { latitude: 28.56, longitude: 77.24 }, arrivedAt: now() } });
assert.strictEqual(calls.length, 3, "CONFIRM_ARRIVAL_HOSPITAL publishes nothing (no distinct wire event)");

sendAndPublish({ type: "COMPLETE_MISSION", payload: { missionId, driverId, finalFareInr: 585, completedAt: now() } });
assert.deepStrictEqual(calls[3], { event: "MISSION_COMPLETED", driverId }, "Hospital ER handoff confirmed published MISSION_COMPLETED");
assert.strictEqual(actor.getSnapshot().value, "standby", "Driver actor is back at standby after completion");

console.log("✓ All 5 UI progression actions drove the real actor and dispatched the correct wire event, in order, with no extras.\n");

console.log("Test 5: A second mission, aborted mid-route, dispatches MISSION_CANCELLED...");
const secondMissionId = "MSN-WIRE-TEST-0002";
sendAndPublish({ type: "SERVER_OFFER_RECEIVED", payload: { offerId: "OFFER-WIRE-TEST-2", missionId: secondMissionId } });
sendAndPublish({ type: "ACCEPT_DISPATCH", payload: { missionId: secondMissionId, driverId, offerId: "OFFER-WIRE-TEST-2", acceptedAt: now() } });
assert.strictEqual(actor.getSnapshot().value, "enRouteToPatient", "Actor accepted the second mission and is en route");

sendAndPublish({ type: "ABORT_MISSION", payload: { missionId: secondMissionId, driverId, reason: "driver_backed_out", abortedAt: now() } });
assert.strictEqual(actor.getSnapshot().value, "standby", "Actor is back at standby after the abort");
assert.deepStrictEqual(calls[5], { event: "MISSION_CANCELLED", driverId }, "Back-out/cancel published MISSION_CANCELLED");
console.log("✓ Aborting mid-mission dispatches MISSION_CANCELLED.\n");

console.log("Test 6: The 'safe no-op / warning fallback' - publishing without an active mission, driver identity, or publisher is a silent no-op, not a throw...");
assert.strictEqual(
  publishForTransition(publisher, "ACCEPT_DISPATCH", "offered", "enRouteToPatient", null, driverId),
  null,
  "No active missionId -> no-op"
);
assert.strictEqual(
  publishForTransition(publisher, "ACCEPT_DISPATCH", "offered", "enRouteToPatient", missionId, null),
  null,
  "No known driverId -> no-op"
);
assert.strictEqual(
  publishForTransition(null, "ACCEPT_DISPATCH", "offered", "enRouteToPatient", missionId, driverId),
  null,
  "No mounted publisher (e.g. channel not yet connected) -> no-op"
);
assert.strictEqual(calls.length, 6, "None of the three no-op cases above reached the publisher");
console.log("✓ Missing mission/driver/publisher state degrades to a warned no-op, never a thrown error or a blocked transition.\n");

console.log("=================================================");
console.log("ALL DRIVER LIFECYCLE WIRE EVENT TESTS PASSED (100% GREEN)");
console.log("=================================================");
