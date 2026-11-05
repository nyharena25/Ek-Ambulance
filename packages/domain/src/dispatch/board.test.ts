import assert from "node:assert";
import {
  BOARD_PAGE_SIZE,
  boardBand,
  boardSecondsLeft,
  boardTimerTone,
  formatBoardTimer,
  offerWavesOver,
  paginate,
  parseBoardResponse,
  searchWaveAt,
  sortOldestFirst,
} from "./board.ts";
import { DISPATCH_CONFIG } from "./index.ts";

console.log("Test 1: board radii are 4 / 7 / 10 km and the designed time is one 45 s wave window...");
assert.deepStrictEqual([...DISPATCH_CONFIG.boardRadiiKm], [4, 7, 10]);
assert.strictEqual(DISPATCH_CONFIG.waveWindowSeconds, 45);

console.log("Test 2: green is any age within 4 km; red needs one designed time; fallback needs two and no free ambulance within 7 km...");
assert.strictEqual(boardBand(0.5, 0, false), "green", "brand new and close");
assert.strictEqual(boardBand(4, 0, false), "green", "4 km is inclusive");
assert.strictEqual(boardBand(3, 97, false), "green", "overdue inside the green radius still shows green (timer -00:52)");
assert.strictEqual(boardBand(5, 44, false), null, "4-7 km is hidden while the near wave is still open");
assert.strictEqual(boardBand(5, 45, false), "red");
assert.strictEqual(boardBand(7, 300, false), "red", "7 km is inclusive");
assert.strictEqual(boardBand(8, 89, false), null, "7-10 km is hidden before two designed times");
assert.strictEqual(boardBand(8, 90, false), "fallback");
assert.strictEqual(boardBand(8, 90, true), null, "a free ambulance within 7 km keeps it off the fallback");
assert.strictEqual(boardBand(10.1, 999, false), null, "beyond 10 km is never shown");

console.log("Test 3: signed seconds left reads negative once overdue...");
const due = "2026-09-24T08:30:00.000Z";
const t0 = Date.parse(due);
assert.strictEqual(boardSecondsLeft(due, t0 - 44_200), 45, "44.2 s left reads 45");
assert.strictEqual(boardSecondsLeft(due, t0), 0);
assert.strictEqual(boardSecondsLeft(due, t0 + 52_300), -52, "overdue by 52.3 s reads -52");
assert.strictEqual(boardSecondsLeft(due, t0 - 10_000, 10_000), 0, "phone 10 s behind the server: offset +10 s lands on the deadline");
assert.strictEqual(boardSecondsLeft("garbage", t0), 0);

console.log("Test 4: tone is green > half, yellow <= half, orange <= 10 s, red when negative...");
assert.strictEqual(boardTimerTone(45), "green");
assert.strictEqual(boardTimerTone(23), "green");
assert.strictEqual(boardTimerTone(22), "yellow", "22.5 is half of 45: at or below is yellow");
assert.strictEqual(boardTimerTone(11), "yellow");
assert.strictEqual(boardTimerTone(10), "orange");
assert.strictEqual(boardTimerTone(0), "orange", "00:00 is not yet minus");
assert.strictEqual(boardTimerTone(-1), "red");
assert.strictEqual(boardTimerTone(-52), "red");

console.log("Test 5: the label is mm:ss with an explicit minus...");
assert.strictEqual(formatBoardTimer(45), "00:45");
assert.strictEqual(formatBoardTimer(0), "00:00");
assert.strictEqual(formatBoardTimer(-52), "-00:52");
assert.strictEqual(formatBoardTimer(125), "02:05");
assert.strictEqual(formatBoardTimer(-61), "-01:01");

console.log("Test 6: oldest first, stable on ties, input untouched...");
const mk = (missionId: string, createdAt: string) => ({ missionId, createdAt });
const list = [mk("c", "2026-09-24T08:31:00Z"), mk("b", "2026-09-24T08:29:00Z"), mk("a", "2026-09-24T08:29:00Z")];
assert.deepStrictEqual(sortOldestFirst(list).map((e) => e.missionId), ["a", "b", "c"]);
assert.deepStrictEqual(list.map((e) => e.missionId), ["c", "b", "a"], "sort does not mutate");
assert.strictEqual(sortOldestFirst(list)[0], list[2], "returns the caller's own objects, not copies");
// An unparsable createdAt (NaN) compares as a tie, so it falls back to the id order, as before the parse-once change.
const odd = [mk("z", "not a date"), mk("y", "2026-09-24T08:29:00Z")];
assert.deepStrictEqual(sortOldestFirst(odd).map((e) => e.missionId), ["y", "z"]);
let parses = 0;
const realParse = Date.parse;
Date.parse = (s: string) => (parses++, realParse(s));
sortOldestFirst(Array.from({ length: 64 }, (_, i) => mk(`m${i}`, new Date(Date.UTC(2026, 8, 24, 8, i)).toISOString())));
Date.parse = realParse;
assert.strictEqual(parses, 64, "each timestamp is parsed exactly once");

console.log("Test 7: five per page, page clamped into range...");
assert.strictEqual(BOARD_PAGE_SIZE, 5);
const twelve = Array.from({ length: 12 }, (_, i) => i);
assert.deepStrictEqual(paginate(twelve, 0).items, [0, 1, 2, 3, 4]);
assert.deepStrictEqual(paginate(twelve, 2).items, [10, 11]);
assert.strictEqual(paginate(twelve, 2).pageCount, 3);
assert.strictEqual(paginate(twelve, 9).page, 2, "past the end clamps to the last page");
assert.strictEqual(paginate(twelve, -3).page, 0);
assert.deepStrictEqual(paginate([], 4), { items: [], page: 0, pageCount: 1, total: 0 });

console.log("Test 8: the wire parser keeps well-formed emergencies and drops the rest...");
const good = {
  missionId: "6f0c1e9a-0000-4000-8000-000000000001",
  createdAt: "2026-09-24T08:29:15.000Z",
  dueAt: "2026-09-24T08:30:00.000Z",
  distanceKm: 3.2,
  band: "green",
  urgency: "CAT_1_IMMEDIATE",
  requiredVehicleType: "TYPE_D_ALS",
  pickup: { latitude: 28.53, longitude: 77.39, address: "Sector 62, Noida" },
  patientSummary: { primaryComplaint: "chest pain", derivedFlags: ["cardiac", 7] },
};
const parsed = parseBoardResponse({
  serverNow: "2026-09-24T08:29:50.000Z",
  items: [good, { ...good, band: "purple" }, { ...good, pickup: {} }, { ...good, dueAt: "nope" }, null, "x"],
});
assert.strictEqual(parsed?.items.length, 1);
assert.strictEqual(parsed?.serverNow, "2026-09-24T08:29:50.000Z");
assert.deepStrictEqual(parsed?.items[0]?.patientSummary?.derivedFlags, ["cardiac"], "non-string flags dropped");
assert.strictEqual(parsed?.items[0]?.pickup.address, "Sector 62, Noida");
assert.strictEqual(parseBoardResponse(null), null);
assert.strictEqual(parseBoardResponse({ items: "no" }), null);

console.log("Test 9: the patient's wave follows elapsed time, one window each, the last one stays...");
assert.strictEqual(searchWaveAt(0), 1);
assert.strictEqual(searchWaveAt(44.9), 1);
assert.strictEqual(searchWaveAt(45), 2);
assert.strictEqual(searchWaveAt(89), 2);
assert.strictEqual(searchWaveAt(90), 3);
assert.strictEqual(searchWaveAt(9999), 3, "after the last wave the request stays on wave 3's radius");
assert.strictEqual(searchWaveAt(-5), 1, "a phone clock slightly behind the server never yields wave 0");
assert.strictEqual(offerWavesOver(134), false);
assert.strictEqual(offerWavesOver(135), true, "3 x 45 s");

console.log("\nAll driver board domain tests passed.");
