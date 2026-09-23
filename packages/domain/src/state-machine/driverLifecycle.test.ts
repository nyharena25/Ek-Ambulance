import assert from "node:assert";
import { createActor } from "xstate";
import { driverLifecycleMachine } from "./driverLifecycle.ts";

console.log("=================================================");
console.log("Running Ek-Ambulance Driver Lifecycle Machine Tests");
console.log("=================================================\n");

const now = () => new Date().toISOString();

console.log("Test 1: offline -> standby on GO_ONLINE with a valid ais125CertPath...");
const actor = createActor(driverLifecycleMachine).start();
assert.strictEqual(actor.getSnapshot().value, "offline", "Machine starts in offline");
actor.send({
  type: "GO_ONLINE",
  payload: {
    driverId: "DRV-001",
    ambulanceId: "AMB-001",
    careLevel: "ALS",
    ais125CertPath: "storage/certs/drv-001.pdf",
    location: { latitude: 28.5355, longitude: 77.391 },
    wentOnlineAt: now(),
  },
});
assert.strictEqual(actor.getSnapshot().value, "standby", "GO_ONLINE -> standby");
assert.strictEqual(actor.getSnapshot().context.driverId, "DRV-001");
assert.strictEqual(actor.getSnapshot().context.careLevel, "ALS");
console.log("✓ Valid GO_ONLINE transitions offline -> standby and captures shift context.\n");

console.log("Test 2: offline rejects GO_ONLINE with an empty ais125CertPath...");
const rejectedActor = createActor(driverLifecycleMachine).start();
rejectedActor.send({
  type: "GO_ONLINE",
  payload: {
    driverId: "DRV-002",
    ambulanceId: "AMB-002",
    careLevel: "BLS",
    ais125CertPath: "   ",
    location: { latitude: 28.5355, longitude: 77.391 },
    wentOnlineAt: now(),
  },
});
assert.strictEqual(rejectedActor.getSnapshot().value, "offline", "Empty/whitespace-only cert path retains offline");
assert.strictEqual(rejectedActor.getSnapshot().context.driverId, null, "No driver context captured on rejected GO_ONLINE");
console.log("✓ An unverified AIS-125 cert path is rejected; driver stays offline.\n");

console.log("Test 3: standby -> offline on GO_OFFLINE...");
actor.send({ type: "GO_OFFLINE", payload: { driverId: "DRV-001", wentOfflineAt: now() } });
assert.strictEqual(actor.getSnapshot().value, "offline", "GO_OFFLINE -> offline");
console.log("✓ GO_OFFLINE returns the driver to offline.\n");

console.log("Test 4: standby -> offered on SERVER_OFFER_RECEIVED (dispatch wave)...");
// Re-enter standby for the rest of the offer-flow tests.
actor.send({
  type: "GO_ONLINE",
  payload: {
    driverId: "DRV-001",
    ambulanceId: "AMB-001",
    careLevel: "ALS",
    ais125CertPath: "storage/certs/drv-001.pdf",
    location: { latitude: 28.5355, longitude: 77.391 },
    wentOnlineAt: now(),
  },
});
actor.send({ type: "SERVER_OFFER_RECEIVED", payload: { offerId: "OFFER-001", missionId: "MSN-001" } });
assert.strictEqual(actor.getSnapshot().value, "offered", "SERVER_OFFER_RECEIVED -> offered");
assert.strictEqual(actor.getSnapshot().context.activeOfferId, "OFFER-001");
assert.strictEqual(actor.getSnapshot().context.activeMissionId, "MSN-001");
console.log("✓ A dispatch wave offer moves standby -> offered and records the offer/mission IDs.\n");

console.log("Test 5: offered -> enRouteToPatient on ACCEPT_DISPATCH...");
const acceptActor = createActor(driverLifecycleMachine).start();
acceptActor.send({
  type: "GO_ONLINE",
  payload: {
    driverId: "DRV-003",
    ambulanceId: "AMB-003",
    careLevel: "ALS",
    ais125CertPath: "storage/certs/drv-003.pdf",
    location: { latitude: 28.5355, longitude: 77.391 },
    wentOnlineAt: now(),
  },
});
acceptActor.send({ type: "SERVER_OFFER_RECEIVED", payload: { offerId: "OFFER-002", missionId: "MSN-002" } });
acceptActor.send({
  type: "ACCEPT_DISPATCH",
  payload: { missionId: "MSN-002", driverId: "DRV-003", offerId: "OFFER-002", acceptedAt: now() },
});
assert.strictEqual(acceptActor.getSnapshot().value, "enRouteToPatient", "ACCEPT_DISPATCH -> enRouteToPatient");
assert.strictEqual(acceptActor.getSnapshot().context.activeMissionId, "MSN-002", "Accepted mission ID is retained");
assert.strictEqual(acceptActor.getSnapshot().context.activeOfferId, null, "The now-resolved offer ID is cleared");
console.log("✓ Accepting a dispatch moves offered -> enRouteToPatient and clears the offer ID.\n");

console.log("Test 6: offered -> standby on DECLINE_DISPATCH (shift session untouched)...");
const declineActor = createActor(driverLifecycleMachine).start();
declineActor.send({
  type: "GO_ONLINE",
  payload: {
    driverId: "DRV-004",
    ambulanceId: "AMB-004",
    careLevel: "BLS",
    ais125CertPath: "storage/certs/drv-004.pdf",
    location: { latitude: 28.5672, longitude: 77.21 },
    wentOnlineAt: now(),
  },
});
declineActor.send({ type: "SERVER_OFFER_RECEIVED", payload: { offerId: "OFFER-003", missionId: "MSN-003" } });
declineActor.send({
  type: "DECLINE_DISPATCH",
  payload: {
    missionId: "MSN-003",
    driverId: "DRV-004",
    offerId: "OFFER-003",
    reason: "too_far",
    declinedAt: now(),
  },
});
assert.strictEqual(declineActor.getSnapshot().value, "standby", "DECLINE_DISPATCH -> standby");
assert.strictEqual(declineActor.getSnapshot().context.activeOfferId, null, "Declined offer ID is cleared");
assert.strictEqual(declineActor.getSnapshot().context.driverId, "DRV-004", "Shift session (driverId) is NOT dropped by a decline");
console.log("✓ Declining returns offered -> standby without dropping the active shift session.\n");

console.log("Test 7: offered -> standby on SERVER_OFFER_TIMEOUT (15s window expiry, shift session untouched)...");
const timeoutActor = createActor(driverLifecycleMachine).start();
timeoutActor.send({
  type: "GO_ONLINE",
  payload: {
    driverId: "DRV-005",
    ambulanceId: "AMB-005",
    careLevel: "PTA",
    ais125CertPath: "storage/certs/drv-005.pdf",
    location: { latitude: 28.5672, longitude: 77.21 },
    wentOnlineAt: now(),
  },
});
timeoutActor.send({ type: "SERVER_OFFER_RECEIVED", payload: { offerId: "OFFER-004", missionId: "MSN-004" } });
timeoutActor.send({ type: "SERVER_OFFER_TIMEOUT", payload: { offerId: "OFFER-004" } });
assert.strictEqual(timeoutActor.getSnapshot().value, "standby", "SERVER_OFFER_TIMEOUT -> standby");
assert.strictEqual(timeoutActor.getSnapshot().context.activeMissionId, null, "Expired offer's mission ID is cleared");
assert.strictEqual(timeoutActor.getSnapshot().context.driverId, "DRV-005", "Shift session (driverId) is NOT dropped by an expiry");
console.log("✓ An unactioned offer times out back to standby without dropping the active shift session.\n");

console.log("Test 8: enRouteToPatient -> onScene on CONFIRM_ARRIVAL_SCENE...");
acceptActor.send({
  type: "CONFIRM_ARRIVAL_SCENE",
  payload: { missionId: "MSN-002", driverId: "DRV-003", location: { latitude: 28.53, longitude: 77.39 }, arrivedAt: now() },
});
assert.strictEqual(acceptActor.getSnapshot().value, "onScene", "CONFIRM_ARRIVAL_SCENE -> onScene");
console.log("✓ Scene arrival moves enRouteToPatient -> onScene.\n");

console.log("Test 9: onScene -> transporting on CONFIRM_PATIENT_ONBOARD...");
acceptActor.send({
  type: "CONFIRM_PATIENT_ONBOARD",
  payload: { missionId: "MSN-002", driverId: "DRV-003", destination: { latitude: 28.56, longitude: 77.24 }, onboardAt: now() },
});
assert.strictEqual(acceptActor.getSnapshot().value, "transporting", "CONFIRM_PATIENT_ONBOARD -> transporting");
console.log("✓ Patient onboard moves onScene -> transporting.\n");

console.log("Test 10: transporting -> arrivedHospital on CONFIRM_ARRIVAL_HOSPITAL...");
acceptActor.send({
  type: "CONFIRM_ARRIVAL_HOSPITAL",
  payload: { missionId: "MSN-002", driverId: "DRV-003", location: { latitude: 28.56, longitude: 77.24 }, arrivedAt: now() },
});
assert.strictEqual(acceptActor.getSnapshot().value, "arrivedHospital", "CONFIRM_ARRIVAL_HOSPITAL -> arrivedHospital");
console.log("✓ Hospital arrival moves transporting -> arrivedHospital.\n");

console.log("Test 11: arrivedHospital -> standby on COMPLETE_MISSION (driver available again)...");
acceptActor.send({
  type: "COMPLETE_MISSION",
  payload: { missionId: "MSN-002", driverId: "DRV-003", finalFareInr: 585, completedAt: now() },
});
assert.strictEqual(acceptActor.getSnapshot().value, "standby", "COMPLETE_MISSION -> standby");
assert.strictEqual(acceptActor.getSnapshot().context.activeMissionId, null, "Completed mission ID is cleared");
console.log("✓ Mission completion returns the driver to standby, available for the next dispatch.\n");

console.log("Test 12b: Skip-state rejection - COMPLETE_MISSION cannot fire from transporting...");
const skipStateActor = createActor(driverLifecycleMachine).start();
skipStateActor.send({
  type: "GO_ONLINE",
  payload: {
    driverId: "DRV-006",
    ambulanceId: "AMB-006",
    careLevel: "ALS",
    ais125CertPath: "storage/certs/drv-006.pdf",
    location: { latitude: 28.5355, longitude: 77.391 },
    wentOnlineAt: now(),
  },
});
skipStateActor.send({ type: "SERVER_OFFER_RECEIVED", payload: { offerId: "OFFER-006", missionId: "MSN-006" } });
skipStateActor.send({
  type: "ACCEPT_DISPATCH",
  payload: { missionId: "MSN-006", driverId: "DRV-006", offerId: "OFFER-006", acceptedAt: now() },
});
skipStateActor.send({
  type: "CONFIRM_ARRIVAL_SCENE",
  payload: { missionId: "MSN-006", driverId: "DRV-006", location: { latitude: 28.53, longitude: 77.39 }, arrivedAt: now() },
});
skipStateActor.send({
  type: "CONFIRM_PATIENT_ONBOARD",
  payload: { missionId: "MSN-006", driverId: "DRV-006", destination: { latitude: 28.56, longitude: 77.24 }, onboardAt: now() },
});
assert.strictEqual(skipStateActor.getSnapshot().value, "transporting", "Actor is now in transporting, one step before hospital arrival");
// Attempt to complete the mission WITHOUT first confirming hospital arrival -
// the exact bug found in InTransitHospitalScreen.tsx's slider, which fired
// COMPLETE_MISSION directly from transporting, skipping CONFIRM_ARRIVAL_HOSPITAL.
skipStateActor.send({
  type: "COMPLETE_MISSION",
  payload: { missionId: "MSN-006", driverId: "DRV-006", finalFareInr: 585, completedAt: now() },
});
assert.strictEqual(
  skipStateActor.getSnapshot().value,
  "transporting",
  "COMPLETE_MISSION sent while still transporting is rejected - a mission cannot complete before arriving at the hospital"
);
assert.strictEqual(
  skipStateActor.getSnapshot().context.activeMissionId,
  "MSN-006",
  "The rejected event does not clear mission context either"
);
// The correct event does work from here.
skipStateActor.send({
  type: "CONFIRM_ARRIVAL_HOSPITAL",
  payload: { missionId: "MSN-006", driverId: "DRV-006", location: { latitude: 28.56, longitude: 77.24 }, arrivedAt: now() },
});
assert.strictEqual(skipStateActor.getSnapshot().value, "arrivedHospital", "The correctly-ordered event still works");
console.log("✓ Completing a mission before arriving at the hospital is rejected; the correct order still works.\n");

console.log("Test 12: Illegal transitions while offline are strictly rejected...");
const illegalActor = createActor(driverLifecycleMachine).start();
illegalActor.send({
  type: "ACCEPT_DISPATCH",
  payload: { missionId: "MSN-999", driverId: "DRV-999", offerId: "OFFER-999", acceptedAt: now() },
});
assert.strictEqual(illegalActor.getSnapshot().value, "offline", "ACCEPT_DISPATCH while offline is a no-op");
illegalActor.send({ type: "SERVER_OFFER_RECEIVED", payload: { offerId: "OFFER-999", missionId: "MSN-999" } });
assert.strictEqual(illegalActor.getSnapshot().value, "offline", "SERVER_OFFER_RECEIVED while offline is a no-op");
illegalActor.send({ type: "GO_OFFLINE", payload: { driverId: "DRV-999", wentOfflineAt: now() } });
assert.strictEqual(illegalActor.getSnapshot().value, "offline", "GO_OFFLINE while already offline is a no-op");
console.log("✓ Every non-GO_ONLINE event while offline is rejected; the machine stays offline.\n");

console.log("Test 14: ABORT_MISSION from any active-mission state returns to standby without dropping the shift session, and the driver actor accepts a new offer afterward...");
for (const abortFromState of ["enRouteToPatient", "onScene", "transporting", "arrivedHospital"] as const) {
  const abortActor = createActor(driverLifecycleMachine).start();
  abortActor.send({
    type: "GO_ONLINE",
    payload: {
      driverId: "DRV-007",
      ambulanceId: "AMB-007",
      careLevel: "ALS",
      ais125CertPath: "storage/certs/drv-007.pdf",
      location: { latitude: 28.5355, longitude: 77.391 },
      wentOnlineAt: now(),
    },
  });
  abortActor.send({ type: "SERVER_OFFER_RECEIVED", payload: { offerId: "OFFER-007", missionId: "MSN-007" } });
  abortActor.send({
    type: "ACCEPT_DISPATCH",
    payload: { missionId: "MSN-007", driverId: "DRV-007", offerId: "OFFER-007", acceptedAt: now() },
  });
  if (abortFromState !== "enRouteToPatient") {
    abortActor.send({
      type: "CONFIRM_ARRIVAL_SCENE",
      payload: { missionId: "MSN-007", driverId: "DRV-007", location: { latitude: 28.53, longitude: 77.39 }, arrivedAt: now() },
    });
  }
  if (abortFromState === "transporting" || abortFromState === "arrivedHospital") {
    abortActor.send({
      type: "CONFIRM_PATIENT_ONBOARD",
      payload: { missionId: "MSN-007", driverId: "DRV-007", destination: { latitude: 28.56, longitude: 77.24 }, onboardAt: now() },
    });
  }
  if (abortFromState === "arrivedHospital") {
    abortActor.send({
      type: "CONFIRM_ARRIVAL_HOSPITAL",
      payload: { missionId: "MSN-007", driverId: "DRV-007", location: { latitude: 28.56, longitude: 77.24 }, arrivedAt: now() },
    });
  }
  assert.strictEqual(abortActor.getSnapshot().value, abortFromState, `Actor reached ${abortFromState} before aborting`);

  abortActor.send({
    type: "ABORT_MISSION",
    payload: { missionId: "MSN-007", driverId: "DRV-007", reason: "driver_backed_out", abortedAt: now() },
  });
  assert.strictEqual(abortActor.getSnapshot().value, "standby", `ABORT_MISSION from ${abortFromState} returns to standby`);
  assert.strictEqual(abortActor.getSnapshot().context.activeMissionId, null, "Aborted mission ID is cleared");
  assert.strictEqual(abortActor.getSnapshot().context.driverId, "DRV-007", "Shift session (driverId) is NOT dropped by an abort");

  // The exact assertion the directive names: the actor must accept a new
  // dispatch wave afterward, not silently no-op because it's stuck
  // somewhere ABORT_MISSION didn't actually reach.
  abortActor.send({ type: "SERVER_OFFER_RECEIVED", payload: { offerId: "OFFER-008", missionId: "MSN-008" } });
  assert.strictEqual(
    abortActor.getSnapshot().value,
    "offered",
    `After aborting from ${abortFromState}, a new SERVER_OFFER_RECEIVED is accepted (offered), not rejected`
  );
}
console.log("✓ ABORT_MISSION works from every active-mission state and leaves the actor able to accept new offers.\n");

console.log("=================================================");
console.log("ALL DRIVER LIFECYCLE MACHINE TESTS PASSED (100% GREEN)");
console.log("=================================================");
