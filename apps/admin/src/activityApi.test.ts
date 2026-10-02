import assert from "node:assert";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  NOT_RECORDED,
  PAGE_SIZE,
  addDays,
  durationS,
  fmtDuration,
  getDriverActivity,
  istDate,
  listDriverMissions,
  missionDurations,
  presetRange,
  type DriverMission,
} from "./activityApi.ts";

// Aggregation, authorization and privacy are tested against Postgres (supabase/tests/driver_activity.behaviour.sql).
// This covers the client side: IST date filters, server-timestamp durations, and that the RPCs are called as designed.

// --- date filters: IST calendar days, as the server buckets them
const lateUtc = new Date("2026-10-01T19:00:00Z"); // 00:30 IST on 2 Oct
assert.strictEqual(istDate(lateUtc), "2026-10-02", "today is the IST date, not the UTC one");
assert.deepStrictEqual(presetRange("today", lateUtc), { from: "2026-10-02", to: "2026-10-02" });
assert.deepStrictEqual(presetRange("yesterday", lateUtc), { from: "2026-10-01", to: "2026-10-01" });
assert.deepStrictEqual(presetRange("last7", lateUtc), { from: "2026-09-26", to: "2026-10-02" }, "last 7 days includes today");
assert.deepStrictEqual(presetRange("last30", lateUtc), { from: "2026-09-03", to: "2026-10-02" });
assert.strictEqual(addDays("2026-03-01", -1), "2026-02-28", "month boundary");

// --- durations: a missing timestamp is never filled in
assert.strictEqual(durationS("2025-09-01T04:30:00Z", "2025-09-01T05:15:00Z"), 2700);
assert.strictEqual(durationS(null, "2025-09-01T05:15:00Z"), null);
assert.strictEqual(durationS("2025-09-01T05:15:00Z", "2025-09-01T04:30:00Z"), null, "out-of-order times are not a duration");
assert.strictEqual(fmtDuration(null), NOT_RECORDED);
assert.strictEqual(fmtDuration(2700), "45m 00s");
assert.strictEqual(fmtDuration(3900), "1h 05m");
assert.strictEqual(fmtDuration(0), "0s");

const base: DriverMission = {
  missionId: "m", displayRef: "MSN-DL-2025-000001", vehicleType: "TYPE_D_ALS", urgency: "CAT_1_IMMEDIATE", missionStatus: "completed",
  outcome: "completed", cancelledBy: null, endReason: null, pickupAddress: null, pickupLat: 0, pickupLng: 0, destination: null,
  requestedAt: "2025-09-01T04:29:00Z", offeredAt: "2025-09-01T04:29:30Z", acceptedAt: "2025-09-01T04:30:00Z",
  onSceneAt: "2025-09-01T04:40:00Z", transportAt: "2025-09-01T04:50:00Z", hospitalAt: "2025-09-01T05:10:00Z", endedAt: "2025-09-01T05:15:00Z",
  finalFareInr: 600, estimatedFareInr: 550, billedDistanceKm: 12.5, quotedDistanceKm: 10, distanceSource: "measured", events: [],
};
const secs = (m: DriverMission) => Object.fromEntries(missionDurations(m).map((d) => [d.label, d.seconds]));
assert.deepStrictEqual(secs(base), {
  "Offer received → accepted": 30,
  "Accepted → on scene": 600,
  "On scene → transport started": 600,
  "Transport started → hospital arrival": 1200,
  "Transport started → completed": 1500,
  "Hospital arrival → completed": 300,
  "Total (accepted → end of assignment)": 2700,
});
const claimNoArrival = secs({ ...base, offeredAt: null, onSceneAt: null });
assert.strictEqual(claimNoArrival["Offer received → accepted"], null, "board claim: no offer, not recorded");
assert.strictEqual(claimNoArrival["Accepted → on scene"], null, "missing arrival: not inferred from a later event");
assert.strictEqual(claimNoArrival["On scene → transport started"], null);
assert.strictEqual(claimNoArrival["Transport started → hospital arrival"], 1200, "other segments still shown");
const aborted = secs({ ...base, outcome: "cancelled", hospitalAt: null, transportAt: "2025-09-01T04:50:00Z", endedAt: "2025-09-01T05:00:00Z" });
assert.strictEqual(aborted["Transport started → completed"], null, "a cancellation is not a completion");
assert.strictEqual(aborted["Total (accepted → end of assignment)"], 1800, "the hold still has a total");
const open = secs({ ...base, outcome: "in_progress", endedAt: null, hospitalAt: null });
assert.strictEqual(open["Total (accepted → end of assignment)"], null, "an open task has no total yet");

// --- RPC wiring: staff RPCs only, filters forwarded, page size fixed, errors mapped
const calls: unknown[] = [];
const fakeDb = { rpc: async (fn: string, args: unknown) => (calls.push([fn, args]), { data: { total: 0, rows: [] }, error: null }) } as unknown as SupabaseClient;
await getDriverActivity(fakeDb, "d", "2025-09-01", "2025-09-02");
await listDriverMissions(fakeDb, "d", { from: "2025-09-01", to: "2025-09-02", outcome: "completed", vehicleType: "TYPE_D_ALS", offset: 50 });
await listDriverMissions(fakeDb, "d", { from: "2025-09-01", to: "2025-09-01" });
assert.deepStrictEqual(calls, [
  ["staff_driver_activity", { p_driver_id: "d", p_from: "2025-09-01", p_to: "2025-09-02" }],
  ["staff_driver_missions", { p_driver_id: "d", p_from: "2025-09-01", p_to: "2025-09-02", p_outcome: "completed", p_vehicle_type: "TYPE_D_ALS", p_limit: PAGE_SIZE, p_offset: 50 }],
  ["staff_driver_missions", { p_driver_id: "d", p_from: "2025-09-01", p_to: "2025-09-01", p_outcome: null, p_vehicle_type: null, p_limit: PAGE_SIZE, p_offset: 0 }],
], "one request per screen section, never one per mission or per day");
const denied = { rpc: async () => ({ data: null, error: { code: "PT403", message: "not_staff" } }) } as unknown as SupabaseClient;
assert.deepStrictEqual(await getDriverActivity(denied, "d", "2025-09-01", "2025-09-01"), { ok: false, error: "not_staff" });

console.log("ADMIN ACTIVITY API TESTS PASSED");
