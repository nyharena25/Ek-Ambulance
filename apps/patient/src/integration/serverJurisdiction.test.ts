import assert from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as domain from "@sahayak/domain";
import { computeItemizedStatutoryFare } from "@sahayak/domain";
import { buildCreateMissionParams, createMissionErrorMessage, mapRpcError, parseCreateMissionResult } from "../lib/missionApi.core.ts";
import { isValidPickup } from "../services/mapGeo.core.ts";

/**
 * R-12: the server is the only authority on the service area. The app checks local input only (a real, finite,
 * in-range point) and sends it unchanged; create_mission decides DL / UP / out_of_zone against the shipped polygons
 * (supabase/tests/mission_api.behaviour.sql proves those server decisions on a migrated database).
 */

const AIIMS_DELHI = { latitude: 28.5672, longitude: 77.21 };
const GORAKHPUR_UP = { latitude: 26.7606, longitude: 83.3732 }; // UP, outside the old client 8-district list
const GURUGRAM_HR = { latitude: 28.4595, longitude: 77.0266 }; // Haryana: the old client Delhi box approved it
const FARIDABAD_HR = { latitude: 28.4089, longitude: 77.3178 }; // Haryana: the old client Delhi box approved it
const MUMBAI = { latitude: 19.0, longitude: 72.8 };

const request = (pickup: { latitude: number; longitude: number }) =>
  buildCreateMissionParams({
    idempotencyKey: "00000000-0000-4000-8000-0000000000f1",
    pickup,
    vehicleType: "TYPE_D_ALS",
    urgency: "CAT_1_IMMEDIATE",
    triage: {},
    distanceKm: 8.4,
  });
const serverReply = (jurisdiction: string) =>
  parseCreateMissionResult({ replay: false, mission: { id: "00000000-0000-4000-8000-0000000000f2", status: "requesting", stateVersion: 1, jurisdiction } });
const OUT_OF_ZONE_EN = createMissionErrorMessage("out_of_zone", "en");

console.log("Test 1: a Delhi pickup proceeds and takes DL from the server...");
assert.ok(isValidPickup(AIIMS_DELHI));
assert.deepStrictEqual([request(AIIMS_DELHI).p_pickup_lat, request(AIIMS_DELHI).p_pickup_lng], [28.5672, 77.21]);
assert.strictEqual(serverReply("DL")?.jurisdiction, "DL");
console.log("✓ Delhi\n");

console.log("Test 2: a UP pickup outside the old district list reaches server validation unchanged...");
assert.ok(isValidPickup(GORAKHPUR_UP), "no client-side district list blocks it");
assert.deepStrictEqual([request(GORAKHPUR_UP).p_pickup_lat, request(GORAKHPUR_UP).p_pickup_lng], [26.7606, 83.3732]);
assert.strictEqual(serverReply("UP")?.jurisdiction, "UP");
console.log("✓ Gorakhpur\n");

console.log("Tests 3-5: Gurugram, Faridabad and Mumbai are decided by the server's out_of_zone, not by the app...");
for (const p of [GURUGRAM_HR, FARIDABAD_HR, MUMBAI]) {
  assert.ok(isValidPickup(p), "the app neither approves nor rejects by geography");
  assert.deepStrictEqual([request(p).p_pickup_lat, request(p).p_pickup_lng], [p.latitude, p.longitude], "sent unchanged, never substituted");
}
// The exact error create_mission raises for these points (mission_api.behaviour.sql: PT422 out_of_zone).
const rejected = mapRpcError({ message: "out_of_zone", code: "PT422" });
assert.deepStrictEqual([rejected.code, rejected.retryable], ["out_of_zone", false], "not retried");
assert.strictEqual(createMissionErrorMessage(rejected.code, "en"), OUT_OF_ZONE_EN);
assert.match(OUT_OF_ZONE_EN, /outside our service area.*108/);
// A reply without a server jurisdiction (or with a non-DL/UP one) is not a booking.
assert.strictEqual(serverReply("HR"), null);
console.log("✓ server rejection surfaces as out_of_zone\n");

console.log("Test 5b: local input checks remain...");
for (const bad of [null, undefined, { latitude: NaN, longitude: 77.2 }, { latitude: 28.5, longitude: Infinity }, { latitude: 91, longitude: 77.2 }, { latitude: 28.5, longitude: -181 }]) {
  assert.strictEqual(isValidPickup(bad), false, `rejected ${JSON.stringify(bad)}`);
}
console.log("✓ invalid/missing location\n");

console.log("Test 5c: the pre-booking quote names no state; amounts equal the DL/UP fare...");
const quote = computeItemizedStatutoryFare({ vehicleType: "TYPE_D_ALS", jurisdiction: null, distanceKm: 8.4 });
assert.strictEqual(quote.statutoryOrderRef, "");
for (const j of ["DL", "UP"] as const) {
  assert.strictEqual(computeItemizedStatutoryFare({ vehicleType: "TYPE_D_ALS", jurisdiction: j, distanceKm: 8.4 }).estimatedTotalInr, quote.estimatedTotalInr);
}
console.log("✓ quote\n");

console.log("Test 6: no client-side geographic authority remains in the booking path...");
assert.ok(!("resolveJurisdiction" in domain), "@sahayak/domain no longer exports resolveJurisdiction");
const root = fileURLToPath(new URL("../../", import.meta.url));
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) && !n.endsWith(".test.ts") ? [p] : [];
  });
const banned = /resolveJurisdiction|JurisdictionResolution|UP_DISTRICTS|isSupported|OUT_OF_BOUNDS|expectedState|\|\| "DL"|= "DL",|DISPATCH_HUB\[/;
for (const f of [...files(join(root, "app")), ...files(join(root, "src"))]) {
  assert.doesNotMatch(readFileSync(f, "utf8"), banned, f);
}
const domainSrc = fileURLToPath(new URL("../../../../packages/domain/src/", import.meta.url));
for (const f of files(domainSrc)) assert.doesNotMatch(readFileSync(f, "utf8"), /UP_DISTRICTS|resolveJurisdiction|minLat/, f);
console.log("✓ no boxes, district lists or DL defaults\n");

console.log("SERVER JURISDICTION AUTHORITY TESTS PASSED (100% GREEN)");
