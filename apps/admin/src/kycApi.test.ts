import assert from "node:assert";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canDecide, errorCode, isStaff, missingRequiredSlots, rejectApplication, approveApplication } from "./kycApi.ts";

// Authorization itself is tested against Postgres (supabase/tests/kyc_admin.behaviour.sql) and over HTTP
// (src/kycAdmin.e2e.ts). This covers the client-side mapping only.

assert.strictEqual(errorCode({ code: "PT403", message: "not_staff" }), "not_staff", "_fail code surfaces as the message");
assert.strictEqual(errorCode({ code: "42501", message: "permission denied for function approve_kyc" }), "forbidden");
assert.strictEqual(errorCode(null), "unknown_error");

assert.deepStrictEqual(
  missingRequiredSlots({ requiredSlots: ["arai_certificate", "fitness_permit", "vehicle_rc"], documents: [{ slot: "vehicle_rc" }, { slot: "puc_certificate" }] as never }),
  ["arai_certificate", "fitness_permit"],
  "only required slots count as missing; extra slots are not required",
);

assert.strictEqual(canDecide("pending_verification"), true);
for (const s of ["draft", "approved", "rejected"]) assert.strictEqual(canDecide(s), false, `${s} cannot be decided`);

const calls: unknown[] = [];
const fakeDb = { rpc: async (fn: string, args: unknown) => (calls.push([fn, args]), { data: { kycStatus: "x" }, error: null }) } as unknown as SupabaseClient;
assert.deepStrictEqual(await rejectApplication(fakeDb, "d", "   "), { ok: false, error: "reason_required" });
assert.strictEqual(calls.length, 0, "blank reason never reaches the server");
await rejectApplication(fakeDb, "d", "  blurry RC ");
await approveApplication(fakeDb, "d");
assert.deepStrictEqual(calls, [
  ["staff_reject_kyc", { p_driver_id: "d", p_reason: "blurry RC" }],
  ["staff_approve_kyc", { p_driver_id: "d" }],
], "decisions go only through the staff wrappers, never approve_kyc / reject_kyc or a table write");

const failing = { rpc: async () => ({ data: null, error: { message: "TypeError: Failed to fetch" } }) } as unknown as SupabaseClient;
assert.deepStrictEqual(await isStaff(failing), { ok: false, error: "TypeError: Failed to fetch" }, "a failed staff check is an error, never 'not staff'");

console.log("ADMIN KYC API TESTS PASSED");
