import assert from "node:assert";
import { locationToPing } from "./driverTelemetry.ts";

const at = new Date("2026-09-25T10:00:00.000Z");

console.log("Test 1: expo-location fix -> wire ping (m/s -> km/h, heading validity)...");
assert.deepStrictEqual(locationToPing({ latitude: 28.5672, longitude: 77.21, heading: 182.4, speed: 10 }, at), {
  latitude: 28.5672,
  longitude: 77.21,
  heading: 182,
  speed: 36,
  timestamp: "2026-09-25T10:00:00.000Z",
});
const stationary = locationToPing({ latitude: 1, longitude: 2, heading: -1, speed: -1 }, at);
assert.strictEqual(stationary.heading, undefined, "-1 heading means unknown, must not be published as 359");
assert.strictEqual(stationary.speed, undefined);
assert.strictEqual(locationToPing({ latitude: 1, longitude: 2, heading: null, speed: null }, at).heading, undefined);
assert.strictEqual(locationToPing({ latitude: 1, longitude: 2, heading: 360, speed: 0 }, at).heading, 0, "360 wraps to 0");
assert.strictEqual(locationToPing({ latitude: 1, longitude: 2, speed: 0 }, at).speed, 0, "standing still is a real 0 km/h");
assert.strictEqual(locationToPing({ latitude: 1, longitude: 2, speed: 2.78 }, at).speed, 10, "1-decimal km/h");
console.log("✓ ping mapping\n");

console.log("Test 2: the fix accuracy travels with the ping (the server bills only from fixes <= 50 m)...");
assert.strictEqual(locationToPing({ latitude: 1, longitude: 2, accuracy: 12.34 }, at).accuracy, 12.3);
assert.strictEqual(locationToPing({ latitude: 1, longitude: 2, accuracy: null }, at).accuracy, undefined, "unknown accuracy is omitted, never 0");
assert.strictEqual(locationToPing({ latitude: 1, longitude: 2, accuracy: -1 }, at).accuracy, undefined);
assert.ok(!("accuracy" in locationToPing({ latitude: 1, longitude: 2 }, at)), "no accuracy key without a value");
console.log("✓ accuracy\n");
console.log("LOCATION PING TESTS PASSED (100% GREEN)");
