// Regression (2026-10-03): missionLifecycle.hosted.e2e.ts aborted on "a test phone account already exists", then its
// cleanup looked both test numbers up and deleted the pre-existing hosted driver. No network: the decision is pure.
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { userIdsToDelete } from "./supabaseAuth.cleanup.ts";

const PATIENT = "c18c6333-0000-4000-8000-000000000001";
const DRIVER = "703c1e89-0000-4000-8000-000000000002";

console.log("Test: existing patient + existing driver + failed precondition => zero deletes...");
// Exactly what the old cleanup captured: both pre-existing ids, found by phone.
const captured = new Map([["patient", PATIENT], ["driver", DRIVER]]);
assert.deepStrictEqual(userIdsToDelete(captured, { preconditionPassed: false, preexisting: new Set([PATIENT, DRIVER]) }), []);
// Even if the pre-existing set were incomplete, a failed precondition deletes nothing.
assert.deepStrictEqual(userIdsToDelete(captured, { preconditionPassed: false, preexisting: new Set() }), []);
console.log("✓ zero deletes");

console.log("Test: after a passed precondition only this run's users go, never a pre-existing or retained one...");
const run = new Map([["patient", "p-new"], ["driver", "d-new"], ["staff", "s-new"], ["other", PATIENT]]);
assert.deepStrictEqual(
  userIdsToDelete(run, { preconditionPassed: true, preexisting: new Set([PATIENT]), retain: new Set(["patient"]) }),
  [["driver", "d-new"], ["staff", "s-new"]]
);
console.log("✓ only created, non-retained ids");

console.log("Test: the hosted harness deletes users only through userIdsToDelete...");
const src = readFileSync(new URL("./missionLifecycle.hosted.e2e.ts", import.meta.url), "utf8");
assert.strictEqual(src.match(/deleteUser\(/g)?.length, 1, "exactly one deleteUser call");
assert.match(src, /for \(const \[label, id\] of userIdsToDelete\(users, \{ preconditionPassed, preexisting,[^\n]*\n\s+const del = await admin\.auth\.admin\.deleteUser\(id\)/, "deleteUser sits in the userIdsToDelete loop");
assert.match(src, /preconditionPassed = true;/, "the flag is set only after the precondition assert");
console.log("✓ single guarded delete path");
console.log("\nCLEANUP REGRESSION TESTS PASSED");
