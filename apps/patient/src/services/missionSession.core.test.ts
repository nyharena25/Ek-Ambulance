import assert from "node:assert";
import type { PatientLifecycleState } from "@sahayak/domain";
import { loadPersistedMission, resumeRoute, savePersistedMission, shortMissionRef, signOutPatient, type KeyValueStorage } from "./missionSession.core.ts";

// Sign-out and active-mission restoration (the pure parts of patientAuth.store.signOut and useResumeActiveMission).

const memory = (): KeyValueStorage & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
};
const MISSION = { missionId: "4f0c2a1e-8b7d-4c3a-9e2f-1a2b3c4d5e6f", lastSeq: 3 };

async function run(state: PatientLifecycleState, signOutError: unknown = null) {
  const storage = memory();
  await savePersistedMission(storage, MISSION);
  const log: string[] = [];
  const result = await signOutPatient({
    state,
    signOut: async () => (log.push("supabase.signOut"), { error: signOutError }),
    storage,
    resetLifecycle: () => void log.push("reset"),
  });
  return { result, log, persisted: await loadPersistedMission(storage) };
}

// Sign out with no mission: Supabase session ended, then app state cleared, so no stale mission reaches the next account.
const idle = await run("idle");
assert.deepStrictEqual(idle.result, { ok: true });
assert.deepStrictEqual(idle.log, ["supabase.signOut", "reset"], "session ended before app state is cleared");
assert.strictEqual(idle.persisted, null, "resume baseline cleared");

// A mission in flight is never corrupted by a sign-out: refused before Supabase is touched, nothing cleared.
for (const state of ["requesting", "tracking", "transporting", "awaitingReceipt"] as PatientLifecycleState[]) {
  const busy = await run(state);
  assert.deepStrictEqual(busy.result, { ok: false, code: "mission_in_progress" }, `${state}: refused`);
  assert.deepStrictEqual(busy.log, [], `${state}: no signOut, no reset`);
  assert.deepStrictEqual(busy.persisted, MISSION, `${state}: mission baseline kept`);
}

// A failed Supabase sign-out keeps the patient signed in with their state intact.
const failed = await run("idle", new Error("network"));
assert.deepStrictEqual(failed.result, { ok: false, code: "sign_out_failed" });
assert.deepStrictEqual(failed.log, ["supabase.signOut"]);
assert.deepStrictEqual(failed.persisted, MISSION);

// Active mission + session restoration: the mission found on launch/sign-in reopens the right screen.
assert.strictEqual(resumeRoute("requesting"), "/booking/matching", "still searching -> matching");
for (const s of ["en_route", "on_scene", "transporting", "arrived_hospital"]) assert.strictEqual(resumeRoute(s), "/booking/[id]", `${s} -> tracking`);

// Header reference: short enough for a phone header, a prefix of the real id.
assert.strictEqual(shortMissionRef("8ad937f1-7329-400c-9ca7-f9bdaad912b3"), "#8AD937F1", "uuid -> # + first 8 hex, upper-cased");
assert.strictEqual(shortMissionRef("not-a-uuid"), "not-a-uuid", "non-uuid passes through unchanged");

console.log("PATIENT SESSION (SIGN-OUT / RESUME) TESTS PASSED");
