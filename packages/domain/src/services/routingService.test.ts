import assert from "node:assert";
import {
  parseOsrmRoute,
  buildOsrmUrl,
  getDrivingRoute,
  fallbackRoute,
  haversineKm,
  routeToCoordinates,
} from "./routingService.ts";
import { buildNavigationLinks } from "./navigationLinks.ts";

const AIIMS = { latitude: 28.5672, longitude: 77.21 };
const NOIDA = { latitude: 28.5355, longitude: 77.391 };

console.log("Test 1: OSRM response parsing (metres/seconds -> km/min)...");
const ok = parseOsrmRoute({
  code: "Ok",
  routes: [{ distance: 21340, duration: 1510, geometry: { coordinates: [[77.21, 28.56], [77.39, 28.53]] } }],
});
assert.deepStrictEqual(ok, {
  distanceKm: 21.3,
  durationMin: 25,
  geometry: [[77.21, 28.56], [77.39, 28.53]],
  source: "osrm",
});
assert.strictEqual(parseOsrmRoute({ code: "NoRoute", routes: [] }), null);
assert.strictEqual(parseOsrmRoute({ code: "Ok", routes: [] }), null);
assert.strictEqual(parseOsrmRoute({ code: "Ok", routes: [{ distance: "x" }] }), null);
assert.strictEqual(parseOsrmRoute(null), null);
console.log("✓ parsed\n");

console.log("Test 2: OSRM URL uses lng,lat order...");
assert.strictEqual(
  buildOsrmUrl(AIIMS, NOIDA),
  "https://router.project-osrm.org/route/v1/driving/77.21,28.5672;77.391,28.5355?overview=full&geometries=geojson"
);
console.log("✓ url\n");

console.log("Test 3: getDrivingRoute uses OSRM when reachable, falls back otherwise...");
const okFetch = (async () => ({ ok: true, json: async () => ({ code: "Ok", routes: [{ distance: 5000, duration: 600 }] }) })) as unknown as typeof fetch;
const live = await getDrivingRoute(AIIMS, NOIDA, { fetchImpl: okFetch });
assert.strictEqual(live.source, "osrm");
assert.strictEqual(live.distanceKm, 5);
assert.strictEqual(live.durationMin, 10);

const failures: Array<typeof fetch> = [
  (async () => { throw new Error("java.net.UnknownHostException"); }) as unknown as typeof fetch,
  (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch,
  (async () => ({ ok: true, json: async () => ({ code: "NoRoute" }) })) as unknown as typeof fetch,
  ((_u: unknown, init?: { signal?: AbortSignal }) =>
    new Promise((_r, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as unknown as typeof fetch,
];
for (const fetchImpl of failures) {
  const r = await getDrivingRoute(AIIMS, NOIDA, { fetchImpl, timeoutMs: 20 });
  assert.strictEqual(r.source, "fallback");
  assert.deepStrictEqual(r, fallbackRoute(AIIMS, NOIDA));
}
console.log("✓ live + 4 failure modes (network, HTTP, NoRoute, timeout)\n");

console.log("Test 4: fallback = haversine x 1.3 winding factor...");
const straight = haversineKm(AIIMS, NOIDA);
assert.ok(straight > 17.5 && straight < 18.5, `AIIMS->Noida straight-line ~18km, got ${straight}`);
assert.ok(Math.abs(fallbackRoute(AIIMS, NOIDA).distanceKm - straight * 1.3) < 0.06);
assert.strictEqual(fallbackRoute(AIIMS, AIIMS).distanceKm, 0);
assert.ok(fallbackRoute(AIIMS, AIIMS).durationMin >= 1);
console.log("✓ fallback\n");

console.log("Test 5: Google Maps deep-link URIs...");
assert.deepStrictEqual(buildNavigationLinks({ latitude: 28.5672, longitude: 77.21 }), {
  android: "google.navigation:q=28.5672,77.21&mode=d",
  universal: "https://www.google.com/maps/dir/?api=1&destination=28.5672,77.21&travelmode=driving",
});
console.log("✓ links\n");

console.log("Test 6: GeoJSON [lng,lat] -> {latitude,longitude}...");
assert.deepStrictEqual(routeToCoordinates([[77.21, 28.5672], [77.365, 28.627]]), [
  { latitude: 28.5672, longitude: 77.21 },
  { latitude: 28.627, longitude: 77.365 },
]);
assert.deepStrictEqual(routeToCoordinates(fallbackRoute(AIIMS, NOIDA).geometry), [], "fallback route has no polyline");
console.log("✓ route coordinates\n");

console.log("ROUTING SERVICE TESTS PASSED (100% GREEN)");
