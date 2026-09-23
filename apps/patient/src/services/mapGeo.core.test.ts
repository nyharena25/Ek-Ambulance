import assert from "node:assert";
import { DISPATCH_HUB, findHospital, isFittable, parseCoordinate, regionAround, scaleRegion } from "./mapGeo.core.ts";

const FALLBACK = { latitude: 28.5672, longitude: 77.21 };

console.log("Test 1: route params -> coordinate, never NaN...");
assert.deepStrictEqual(parseCoordinate("28.6315", "77.2167", FALLBACK), { latitude: 28.6315, longitude: 77.2167 });
for (const [a, b] of [[undefined, "77.2"], ["28.6", undefined], ["abc", "77.2"], ["", ""]] as const) {
  assert.deepStrictEqual(parseCoordinate(a, b, FALLBACK), FALLBACK);
}
console.log("✓ parse\n");

console.log("Test 2: default camera + zoom...");
assert.deepStrictEqual(regionAround(FALLBACK), { ...FALLBACK, latitudeDelta: 0.015, longitudeDelta: 0.015 });
assert.strictEqual(scaleRegion(regionAround(FALLBACK), 0.5).latitudeDelta, 0.0075);
assert.strictEqual(scaleRegion(regionAround(FALLBACK), 2).longitudeDelta, 0.03);
console.log("✓ region\n");

console.log("Test 3: hospital lookup uses the seeded coordinates...");
assert.deepStrictEqual(findHospital("Jai Prakash Narayan Apex Trauma Center, AIIMS").coordinate, { latitude: 28.5672, longitude: 77.21 });
assert.strictEqual(findHospital("Sharda Hospital Greater Noida").label, "Sharda Hospital");
assert.deepStrictEqual(findHospital("SHARDA").coordinate, { latitude: 28.4732, longitude: 77.482 });
const unknown = findHospital("Some Clinic");
assert.strictEqual(unknown.matched, false);
assert.strictEqual(unknown.label, "Some Clinic");
console.log("✓ hospitals\n");

console.log("Test 4: dispatch hubs cover both jurisdictions...");
assert.ok(DISPATCH_HUB.DL && DISPATCH_HUB.UP);
console.log("✓ hubs\n");

console.log("Test 5: route fitting is skipped for coincident points...");
const AIIMS = findHospital("AIIMS").coordinate;
assert.strictEqual(isFittable([AIIMS, AIIMS]), false, "AIIMS -> AIIMS demo route must not max-zoom");
assert.strictEqual(isFittable([AIIMS]), false);
assert.strictEqual(isFittable([]), false);
assert.strictEqual(isFittable([DISPATCH_HUB.DL, AIIMS]), true);
console.log("✓ fit guard\n");

console.log("MAP GEO TESTS PASSED (100% GREEN)");
