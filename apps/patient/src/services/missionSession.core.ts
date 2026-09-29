import { isUuid, type PatientLifecycleState } from "@sahayak/domain";

/**
 * The one piece of mission state that must outlive the process (7.5 rules 3, 8, 9): which mission is active and the last
 * sequence number applied to it. Everything else is re-derived from the server on launch. Storage is injected; the app
 * passes the expo-secure-store-backed adapter already used for the auth session.
 */
export interface KeyValueStorage {
  // Sync or async, like the Supabase SDK's storage contract that the secure-store adapter implements.
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<unknown> | unknown;
  removeItem(key: string): Promise<unknown> | unknown;
}

export interface PersistedMission {
  missionId: string;
  lastSeq: number | null;
}

const KEY = "sahayak.activeMission.v1";

/** Returns null for a missing, unreadable or malformed record: a bad record must never block a launch. */
export async function loadPersistedMission(storage: KeyValueStorage): Promise<PersistedMission | null> {
  try {
    const raw = await storage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { missionId?: unknown; lastSeq?: unknown };
    if (!isUuid(parsed.missionId)) return null;
    const lastSeq = parsed.lastSeq;
    if (lastSeq !== null && !(typeof lastSeq === "number" && Number.isInteger(lastSeq) && lastSeq >= 0)) return null;
    return { missionId: parsed.missionId, lastSeq };
  } catch {
    return null;
  }
}

export async function savePersistedMission(storage: KeyValueStorage, mission: PersistedMission): Promise<void> {
  try {
    await storage.setItem(KEY, JSON.stringify(mission));
  } catch {
    // Losing the baseline only costs one snapshot read on the next launch.
  }
}

/** Rule 8: on any terminal state the persisted baseline is cleared so it cannot leak into the next booking. */
export async function clearPersistedMission(storage: KeyValueStorage): Promise<void> {
  try {
    await storage.removeItem(KEY);
  } catch {
    // nothing to do
  }
}

/** Sign-out is offered only with no mission in flight: a request, a live mission or an unconfirmed receipt keeps the account. */
export function canSignOut(state: PatientLifecycleState): boolean {
  return state === "idle" || state === "triaged" || state === "receiptConfirmed" || state === "cancelled";
}
