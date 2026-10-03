import assert from "node:assert";
import { useDriverStandbyStore } from "./driverStandby.store.ts";

const gps = (latitude: number, longitude: number) => ({
  latitude, longitude, accuracyMeters: 5, heading: 90, speedKmh: 30, altitudeMeters: 210,
});
const s = () => useDriverStandbyStore.getState();

console.log("Test 1: live fixes replace gps without touching presence...");
assert.strictEqual(s().isOnline, true);
s().setGps(gps(28.61, 77.23));
assert.deepStrictEqual([s().gps.latitude, s().gps.longitude, s().gps.speedKmh], [28.61, 77.23, 30]);
assert.strictEqual(s().isOnline, true, "location updates must not flip online state");
s().setGps(gps(28.62, 77.24));
assert.strictEqual(s().gps.latitude, 28.62, "each fix fully replaces the previous one");
console.log("✓ gps updates\n");

console.log("Test 2: going offline keeps the last real fix (no snap back to a preset)...");
s().confirmGoOffline();
assert.strictEqual(s().isOnline, false);
assert.deepStrictEqual([s().gps.latitude, s().gps.longitude], [28.62, 77.24]);
s().setGps(gps(28.63, 77.25));
assert.strictEqual(s().isOnline, false, "a stray late fix must not bring the driver online");
console.log("✓ offline keeps location\n");

console.log("Test 3: going back online announces from the latest fix and stays consistent...");
await s().toggleOnlineState();
assert.strictEqual(s().isOnline, true);
assert.strictEqual(s().isTogglingPresence, false);
assert.deepStrictEqual([s().gps.latitude, s().gps.longitude], [28.63, 77.25]);
console.log("✓ online again\n");
console.log("DRIVER LOCATION STATE TESTS PASSED (100% GREEN)");
