import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Exact-ID cleanup for supabaseAuth.e2e.ts. Only ids this run created are touched; a user that already existed before
 * the run is never deleted. Needs a service-role client (Node only, never an app bundle).
 *
 * Order follows the foreign keys: missions (patient_id -> profiles ON DELETE RESTRICT) first, then the auth users, whose
 * delete cascades to profiles, drivers, driver_push_tokens, consent_records and erasure_requests.
 * A mission normally cannot be deleted: mission_events is append-only (R-08 statutory trail) and the missions ->
 * mission_events cascade trips that trigger, so the mission, its events and the patient account are reported as remaining.
 */
export type E2ECreated = { patientUserId?: string; driverUserId?: string; missionIds: string[] };

/** GoTrue stores phones as digits without "+". */
export async function findUserIdByPhone(admin: SupabaseClient, phone: string): Promise<string | null> {
  const digits = phone.replace(/\D/g, "");
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const hit = data.users.find((u) => u.phone === digits);
    if (hit) return hit.id;
    if (data.users.length < 1000) return null;
  }
}

/**
 * Which captured users a hosted run may delete. Nothing unless the run's "no account exists for the test phones"
 * precondition passed (before that, nothing was created, so any id is someone else's), never an id that existed before
 * the run, never a retained label (the booking patient behind a permanent mission).
 */
export function userIdsToDelete(
  captured: ReadonlyMap<string, string>,
  { preconditionPassed, preexisting, retain = new Set() }: { preconditionPassed: boolean; preexisting: ReadonlySet<string>; retain?: ReadonlySet<string> }
): Array<[label: string, id: string]> {
  if (!preconditionPassed) return [];
  return [...captured].filter(([label, id]) => !preexisting.has(id) && !retain.has(label));
}

export async function cleanupE2E(admin: SupabaseClient, created: E2ECreated, preexisting: Set<string>): Promise<string[]> {
  const remaining: string[] = [];
  const userGone = async (id: string) => (await admin.auth.admin.getUserById(id)).data.user == null;

  for (const id of created.missionIds) {
    const del = await admin.from("missions").delete().eq("id", id);
    const left = await admin.from("missions").select("id").eq("id", id);
    if (left.data?.length) remaining.push(`missions ${id} (+ mission_events, dispatch_waves): ${del.error?.message ?? "still present"}`);
  }
  for (const [label, id] of [["driver", created.driverUserId], ["patient", created.patientUserId]] as const) {
    if (!id || preexisting.has(id)) continue;
    const owns = await admin.from("missions").select("id").eq("patient_id", id);
    if (owns.data?.length) {
      remaining.push(`auth.users + profiles ${id} (${label}): kept, missions.patient_id references it (ON DELETE RESTRICT)`);
      continue;
    }
    const del = await admin.auth.admin.deleteUser(id);
    if (!(await userGone(id))) remaining.push(`auth.users ${id} (${label}): ${del.error?.message ?? "still present"}`);
    const prof = await admin.from("profiles").select("id").eq("id", id);
    if (prof.data?.length) remaining.push(`profiles ${id} (${label}): still present`);
  }
  return remaining;
}
