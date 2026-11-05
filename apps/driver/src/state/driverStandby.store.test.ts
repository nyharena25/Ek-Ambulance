import assert from "node:assert";
import { heartbeatLocation, useDriverStandbyStore } from "./driverStandby.store.ts";
import { setServerAdapter, type ServerAdapter } from "./driverLifecycle.store.ts";

console.log("=================================================");
console.log("Running Ek-Ambulance Driver Shift Standby Store Tests");
console.log("=================================================\n");

console.log("Test 1: Going offline while online opens a confirmation modal first (no immediate de-index)...");
useDriverStandbyStore.setState({ isOnline: true, isOfflineModalOpen: false });
await useDriverStandbyStore.getState().toggleOnlineState();
assert.strictEqual(useDriverStandbyStore.getState().isOnline, true, "Still online until confirmed");
assert.strictEqual(useDriverStandbyStore.getState().isOfflineModalOpen, true, "Opens the confirm-offline modal");
console.log("✓ Toggling off while online prompts for confirmation rather than de-indexing immediately.\n");

console.log("Test 2: Confirming go-offline takes the driver offline...");
useDriverStandbyStore.getState().confirmGoOffline();
assert.strictEqual(useDriverStandbyStore.getState().isOnline, false, "Driver is now offline");
assert.strictEqual(useDriverStandbyStore.getState().isOfflineModalOpen, false, "Modal closes on confirm");
console.log("✓ Confirming offline.\n");

console.log("Test 3: Going online from offline, and no fabricated shift clock or presence telemetry...");
await useDriverStandbyStore.getState().toggleOnlineState();
assert.strictEqual(useDriverStandbyStore.getState().isOnline, true, "Driver is now online");
for (const fabricated of ["shiftStartedAt", "redisPresence", "currentJurisdiction"]) {
  assert.ok(!(fabricated in useDriverStandbyStore.getState()), `${fabricated} no longer exists (it was invented client-side)`);
}
console.log("✓ Going online.\n");

console.log("Test 4: closeOfflineModal cancels without changing online state...");
useDriverStandbyStore.setState({ isOnline: true, isOfflineModalOpen: true });
useDriverStandbyStore.getState().closeOfflineModal();
assert.strictEqual(useDriverStandbyStore.getState().isOnline, true, "Cancelling the modal leaves the driver online");
assert.strictEqual(useDriverStandbyStore.getState().isOfflineModalOpen, false, "Modal is dismissed");
console.log("✓ Cancelling the offline confirmation leaves shift state untouched.\n");

console.log("Test 6: the registered AIS-125 type follows the profile...");
useDriverStandbyStore.getState().setAis125Type("TYPE_A_MFR");
assert.strictEqual(useDriverStandbyStore.getState().registeredAis125Type, "TYPE_A_MFR");
console.log("✓ AIS-125 tier.\n");

console.log("Test 7: before a real GPS fix nothing is sent as the driver's position, dev builds included (G4.7-C)...");
{
  const initial = useDriverStandbyStore.getInitialState();
  assert.strictEqual(initial.hasRealFix, false, "a fresh store has no real fix, even where __DEV__ is true");
  assert.strictEqual(heartbeatLocation(initial), null, "so the presence heartbeat sends nothing (the Noida preset is not a position)");

  const presenceCalls: unknown[] = [];
  setServerAdapter({
    userId: "00000000-0000-4000-8000-00000000d0d0",
    accessToken: "t",
    setPresence: async (...args: unknown[]) => { presenceCalls.push(args); return { ok: true, data: true }; },
  } as unknown as ServerAdapter);
  useDriverStandbyStore.setState({ ...initial, isOnline: false });
  useDriverStandbyStore.getState().recenterGps();
  assert.strictEqual(heartbeatLocation(useDriverStandbyStore.getState()), null, "recentering never makes a preset sendable");
  await useDriverStandbyStore.getState().toggleOnlineState();
  assert.strictEqual(useDriverStandbyStore.getState().presenceErrorCode, "no_gps_fix", "going online with a session and no fix is refused");
  assert.strictEqual(useDriverStandbyStore.getState().isOnline, false);
  assert.strictEqual(presenceCalls.length, 0, "set_driver_presence was never called with the preset");
  assert.strictEqual(useDriverStandbyStore.getState().locationRetryNonce, initial.locationRetryNonce + 1, "the refused tap asks the watcher to retry");

  useDriverStandbyStore.getState().setLocationIssue("location_permission_denied");
  await useDriverStandbyStore.getState().toggleOnlineState();
  assert.strictEqual(useDriverStandbyStore.getState().presenceErrorCode, "location_permission_denied", "the refusal names the real blocker");
  assert.strictEqual(useDriverStandbyStore.getState().locationRetryNonce, initial.locationRetryNonce + 2, "every refused tap retries");

  const fix = { latitude: 28.6012, longitude: 77.2271, accuracyMeters: 9, heading: 0, speedKmh: 0, altitudeMeters: 0, fixedAt: "2026-10-03T08:00:00.000Z" };
  useDriverStandbyStore.getState().setGps(fix);
  assert.deepStrictEqual(heartbeatLocation(useDriverStandbyStore.getState()), fix, "after a fix the heartbeat sends that fix");
  assert.strictEqual(useDriverStandbyStore.getState().locationIssue, null, "a real fix clears the location issue");
  await useDriverStandbyStore.getState().toggleOnlineState();
  assert.deepStrictEqual(presenceCalls, [[true, fix, fix.fixedAt]], "going online sends the real fix and when it was measured");
  setServerAdapter(null);
}
console.log("✓ The heartbeat and go-online send a real fix or nothing.\n");

console.log("Test: closing the go-online refusal notice is UI-only...");
{
  useDriverStandbyStore.setState({ isOnline: false, presenceErrorCode: "not_verified" });
  useDriverStandbyStore.getState().clearPresenceError();
  assert.strictEqual(useDriverStandbyStore.getState().presenceErrorCode, null, "the notice is gone");
  assert.strictEqual(useDriverStandbyStore.getState().isOnline, false, "presence is unchanged by dismissing the notice");
}
console.log("✓ notice dismissal\n");

console.log("=================================================");
console.log("ALL DRIVER SHIFT STANDBY STORE TESTS PASSED (100% GREEN)");
console.log("=================================================");
