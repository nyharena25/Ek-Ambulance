import assert from "node:assert";
import { useDriverStandbyStore } from "./driverStandby.store.ts";

console.log("=================================================");
console.log("Running Ek-Ambulance Driver Shift Standby Store Tests");
console.log("=================================================\n");

console.log("Test 1: Going offline while online opens a confirmation modal first (no immediate de-index)...");
useDriverStandbyStore.setState({ isOnline: true, isOfflineModalOpen: false });
await useDriverStandbyStore.getState().toggleOnlineState();
assert.strictEqual(useDriverStandbyStore.getState().isOnline, true, "Still online until confirmed");
assert.strictEqual(useDriverStandbyStore.getState().isOfflineModalOpen, true, "Opens the confirm-offline modal");
console.log("✓ Toggling off while online prompts for confirmation rather than de-indexing immediately.\n");

console.log("Test 2: Confirming go-offline de-indexes from the Redis geospatial set...");
useDriverStandbyStore.getState().confirmGoOffline();
assert.strictEqual(useDriverStandbyStore.getState().isOnline, false, "Driver is now offline");
assert.strictEqual(useDriverStandbyStore.getState().isOfflineModalOpen, false, "Modal closes on confirm");
assert.strictEqual(
  useDriverStandbyStore.getState().redisPresence.isIndexed,
  false,
  "Redis GEOADD presence is torn down (isIndexed: false) once offline"
);
console.log("✓ Confirming offline removes Redis geo-index presence.\n");

console.log("Test 3: Going online from offline re-indexes into Redis and marks a shift start...");
useDriverStandbyStore.setState({ shiftStartedAt: null });
await useDriverStandbyStore.getState().toggleOnlineState();
assert.strictEqual(useDriverStandbyStore.getState().isOnline, true, "Driver is now online");
assert.strictEqual(useDriverStandbyStore.getState().redisPresence.isIndexed, true, "Redis GEOADD presence restored");
assert.strictEqual(useDriverStandbyStore.getState().shiftStartedAt, "Just now", "A fresh shift start time is recorded");
console.log("✓ Going online re-establishes Redis presence and starts the shift clock.\n");

console.log("Test 4: closeOfflineModal cancels without changing online state...");
useDriverStandbyStore.setState({ isOnline: true, isOfflineModalOpen: true });
useDriverStandbyStore.getState().closeOfflineModal();
assert.strictEqual(useDriverStandbyStore.getState().isOnline, true, "Cancelling the modal leaves the driver online");
assert.strictEqual(useDriverStandbyStore.getState().isOfflineModalOpen, false, "Modal is dismissed");
console.log("✓ Cancelling the offline confirmation leaves shift state untouched.\n");

console.log("Test 5: Switching jurisdiction updates GPS coordinates to the matching corridor...");
useDriverStandbyStore.getState().setJurisdiction("DL_SOUTH");
assert.strictEqual(useDriverStandbyStore.getState().currentJurisdiction, "DL_SOUTH");
assert.strictEqual(useDriverStandbyStore.getState().gps.latitude, 28.5672, "South Delhi (AIIMS corridor) coordinates applied");
useDriverStandbyStore.getState().setJurisdiction("UP_NOIDA");
assert.strictEqual(useDriverStandbyStore.getState().gps.latitude, 28.5355, "Noida (Sector 62/Fortis corridor) coordinates applied");
console.log("✓ Jurisdiction switch resolves to the correct GPS corridor.\n");

console.log("Test 6: Registering a new AIS-125 type re-keys the Redis geo index namespace...");
useDriverStandbyStore.getState().setAis125Type("TYPE_A_MFR");
assert.strictEqual(useDriverStandbyStore.getState().registeredAis125Type, "TYPE_A_MFR");
assert.strictEqual(
  useDriverStandbyStore.getState().redisPresence.geoKey,
  "ambulances:geo:type_a_mfr",
  "Redis geo key is namespaced by the registered AIS-125 tier"
);
console.log("✓ AIS-125 tier changes re-key the Redis presence namespace.\n");

console.log("=================================================");
console.log("ALL DRIVER SHIFT STANDBY STORE TESTS PASSED (100% GREEN)");
console.log("=================================================");
