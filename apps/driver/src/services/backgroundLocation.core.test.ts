import assert from "node:assert";
import type { DriverLifecycleState } from "@sahayak/domain";
import {
  BACKGROUND_LOCATION_TASK,
  handleLocationFix,
  shouldTrackInBackground,
  shouldWatchLocation,
  syncBackgroundTracking,
  type LocationFixDeps,
} from "./backgroundLocation.core.ts";

console.log("Test 1: task name + which states track...");
assert.strictEqual(BACKGROUND_LOCATION_TASK, "SAHAYAK_BACKGROUND_LOCATION_TASK");
const track = (["enRouteToPatient", "onScene", "transporting"] as DriverLifecycleState[]);
const stop = (["arrivedHospital", "standby", "offered", "offline"] as DriverLifecycleState[]);
for (const s of track) assert.strictEqual(shouldTrackInBackground(s), true, s);
for (const s of stop) assert.strictEqual(shouldTrackInBackground(s), false, s);
console.log("✓ states\n");

console.log("Test 2: start/stop lifecycle is idempotent...");
let running = false;
const calls: string[] = [];
const api = {
  isRunning: async () => running,
  start: async () => { calls.push("start"); running = true; },
  stop: async () => { calls.push("stop"); running = false; },
};
await syncBackgroundTracking("enRouteToPatient", api);
await syncBackgroundTracking("onScene", api);
await syncBackgroundTracking("transporting", api);
assert.deepStrictEqual(calls, ["start"], "one start across the whole trip");
await syncBackgroundTracking("arrivedHospital", api);
await syncBackgroundTracking("standby", api);
assert.deepStrictEqual(calls, ["start", "stop"], "stops once at arrivedHospital");
await syncBackgroundTracking("offline", api);
assert.deepStrictEqual(calls, ["start", "stop"], "never stops what is not running");
running = true;
await syncBackgroundTracking("offline", api);
assert.deepStrictEqual(calls, ["start", "stop", "stop"], "stale task from a previous session is stopped");
console.log("✓ lifecycle\n");

console.log("Test 3: payload formatting + routing...");
const published: unknown[] = [];
const queued: unknown[] = [];
const gps: unknown[] = [];
let missionId: string | null = "m1";
let fallback = false;
const deps: LocationFixDeps = {
  setGps: (g) => gps.push(g),
  getActiveMissionId: () => missionId,
  isFallbackActive: () => fallback,
  enqueuePing: (id, c, meta) => queued.push({ id, c, meta }),
  publish: (p) => published.push(p),
};
const loc = { coords: { latitude: 28.5, longitude: 77.4, heading: 90.4, speed: 10, accuracy: 4, altitude: 200 }, timestamp: Date.UTC(2026, 8, 24) };
handleLocationFix(loc, deps);
assert.deepStrictEqual(published[0], {
  latitude: 28.5, longitude: 77.4, heading: 90, speed: 36, timestamp: "2026-09-24T00:00:00.000Z",
});
assert.deepStrictEqual(gps[0], { latitude: 28.5, longitude: 77.4, accuracyMeters: 4, heading: 90, speedKmh: 36, altitudeMeters: 200 });

handleLocationFix({ ...loc, coords: { ...loc.coords, heading: -1, speed: null } }, deps);
const unknown = published[1] as Record<string, unknown>;
assert.strictEqual(unknown.heading, undefined);
assert.strictEqual(unknown.speed, undefined);

fallback = true;
handleLocationFix(loc, deps);
assert.strictEqual(published.length, 2, "fallback mode queues instead of publishing");
assert.strictEqual(queued.length, 1);

fallback = false;
missionId = null;
handleLocationFix(loc, deps);
assert.strictEqual(published.length, 2, "no active mission -> nothing published");
handleLocationFix(loc, deps, false);
assert.strictEqual(gps.length, 5, "gps store still updated every time");
console.log("✓ payload\n");

console.log("Test: a signed-in offline driver is watched (no fix -> can never go online)...");
assert.strictEqual(shouldWatchLocation(true, false, false), true, "signed in, offline: must watch or Go online deadlocks on no_gps_fix");
assert.strictEqual(shouldWatchLocation(false, false, false), false, "signed out: no GPS");
assert.strictEqual(shouldWatchLocation(false, false, true), true);
assert.strictEqual(shouldWatchLocation(true, true, false), true);
console.log("✓ watch gate\n");

console.log("BACKGROUND LOCATION TESTS PASSED (100% GREEN)");
