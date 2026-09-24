import assert from "node:assert";
import { mockBoardSnapshot, seedMockEmergencies } from "./mockBoardFeed.ts";

const ORIGIN = { latitude: 28.5355, longitude: 77.391 };
const T0 = Date.parse("2026-09-24T08:30:00.000Z");
const seeded = seedMockEmergencies(ORIGIN, T0);
const snap = (nowMs: number, taken: string[] = [], gps = ORIGIN) => mockBoardSnapshot(gps, seeded, new Set(taken), "TYPE_D_ALS", nowMs);
const ids = (s: ReturnType<typeof snap>, band: string) => s.items.filter((i) => i.band === band).map((i) => i.missionId);

console.log("Test 1: at the start the near ones are green (one overdue) and the far ones are hidden or red by age...");
{
  const s = snap(T0);
  assert.deepStrictEqual(ids(s, "green"), ["mock-emergency-1", "mock-emergency-2", "mock-emergency-3"]);
  assert.deepStrictEqual(ids(s, "red"), ["mock-emergency-4", "mock-emergency-5"], "4-7 km and older than 45 s");
  assert.deepStrictEqual(ids(s, "fallback"), ["mock-emergency-7"], "8.3 km at 100 s: two windows have passed");
  assert.ok(!s.items.some((i) => i.missionId === "mock-emergency-6"), "6.6 km at 20 s is still hidden");
}

console.log("Test 2: an emergency escalates as it ages...");
assert.deepStrictEqual(ids(snap(T0 + 24_000), "red").includes("mock-emergency-6"), false, "20 s + 24 s = 44 s: not yet");
assert.deepStrictEqual(ids(snap(T0 + 26_000), "red").includes("mock-emergency-6"), true, "20 s + 26 s = 46 s: red");
assert.deepStrictEqual(ids(snap(T0 + 50_000), "fallback").includes("mock-emergency-8"), true, "8.9 km reaches 90 s");

console.log("Test 3: a claimed emergency leaves the board; the list keeps the server's shape...");
assert.ok(!snap(T0, ["mock-emergency-1"]).items.some((i) => i.missionId === "mock-emergency-1"));
const first = snap(T0).items[0]!;
assert.strictEqual(Date.parse(first.dueAt) - Date.parse(first.createdAt), 45_000, "dueAt is one designed time after createdAt");
assert.strictEqual(first.requiredVehicleType, "TYPE_D_ALS");

console.log("Test 4: a driver who moves away sees fewer emergencies...");
assert.strictEqual(snap(T0, [], { latitude: 28.9, longitude: 77.8 }).items.length, 0, "far from every pickup");

console.log("\nMock board feed tests passed.");
