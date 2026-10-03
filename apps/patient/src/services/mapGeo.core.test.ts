import assert from "node:assert";
import { DISPATCH_HUB, nearestDispatchHub, formatAddress, formatCoordinates, isFittable, parseCoordinate } from "./mapGeo.core.ts";

const FALLBACK = { latitude: 28.5672, longitude: 77.21 };

console.log("Test 1: route params -> coordinate, never NaN...");
assert.deepStrictEqual(parseCoordinate("28.6315", "77.2167", FALLBACK), { latitude: 28.6315, longitude: 77.2167 });
for (const [a, b] of [[undefined, "77.2"], ["28.6", undefined], ["abc", "77.2"], ["", ""]] as const) {
  assert.deepStrictEqual(parseCoordinate(a, b, FALLBACK), FALLBACK);
}
console.log("✓ parse\n");

console.log("Test 4: dispatch hubs cover both jurisdictions...");
assert.ok(DISPATCH_HUB.DL && DISPATCH_HUB.UP);
// Straight-line nearest hub, independent of any jurisdiction guess.
assert.deepStrictEqual(nearestDispatchHub({ latitude: 28.5672, longitude: 77.21 }), DISPATCH_HUB.DL);
assert.deepStrictEqual(nearestDispatchHub({ latitude: 28.5708, longitude: 77.3261 }), DISPATCH_HUB.UP);
console.log("✓ hubs\n");

console.log("Test 5: route fitting is skipped for coincident points...");
const AIIMS = { latitude: 28.5672, longitude: 77.21 };
assert.strictEqual(isFittable([AIIMS, AIIMS]), false, "AIIMS -> AIIMS demo route must not max-zoom");
assert.strictEqual(isFittable([AIIMS]), false);
assert.strictEqual(isFittable([]), false);
assert.strictEqual(isFittable([DISPATCH_HUB.DL, AIIMS]), true);
console.log("✓ fit guard\n");

console.log("Test 6: reverse-geocode formatting + coordinate fallback...");
assert.strictEqual(
  formatAddress({ street: "Ansari Nagar", district: "South Delhi", subregion: "South Delhi", city: "New Delhi", postalCode: "110029" }, FALLBACK),
  "Ansari Nagar, South Delhi, New Delhi, 110029",
  "repeated district/subregion collapses"
);
assert.strictEqual(formatAddress({ name: "AIIMS", city: "New Delhi" }, FALLBACK), "AIIMS, New Delhi", "name stands in for a missing street");
assert.strictEqual(formatAddress({ street: "  ", city: null }, FALLBACK), "28.5672° N, 77.2100° E");
assert.strictEqual(formatAddress(undefined, FALLBACK), formatCoordinates(FALLBACK));
console.log("✓ address\n");

console.log("MAP GEO TESTS PASSED (100% GREEN)");
