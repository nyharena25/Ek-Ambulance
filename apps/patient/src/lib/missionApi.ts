import type { ParsedLifecycleMessage } from "@sahayak/domain";
import { supabase } from "./supabaseClient";
import {
  buildCreateMissionParams,
  mapRpcError,
  parseCreateMissionResult,
  parseEventRow,
  parseMissionRow,
  type ApiResult,
  type CreatedMission,
  type CreateMissionInput,
  type MissionSnapshot,
  type ServerCancelReason,
} from "./missionApi.core";

/**
 * Supabase-bound Mission API for the patient app (DATA_AND_SYNC_SPECIFICATION.md 6.4.5). Every call goes through Kong
 * (the client's base URL) and never throws: failures come back as `{ ok: false, error }` with a machine code.
 */

const MISSION_COLUMNS = "id,status,state_version,display_ref,vehicle_type,jurisdiction,pickup_location,pickup_address,fare_details";

/**
 * When the server created the mission, in ms (RLS: a patient reads their own). The search countdown counts from it so it agrees
 * with the drivers' Booking card for the same emergency, and survives leaving and re-entering the screen. Null if unreadable.
 */
export async function fetchMissionCreatedAt(missionId: string): Promise<number | null> {
  try {
    const { data, error } = await supabase.from("missions").select("created_at").eq("id", missionId).maybeSingle();
    if (error || !data) return null;
    const ms = Date.parse(String((data as { created_at?: unknown }).created_at));
    return Number.isNaN(ms) ? null : ms;
  } catch {
    return null;
  }
}

async function rpc<T>(name: string, args: Record<string, unknown>, parse: (data: unknown) => T | null): Promise<ApiResult<T>> {
  try {
    const { data, error } = await supabase.rpc(name, args);
    if (error) return { ok: false, error: mapRpcError(error) };
    const parsed = parse(data);
    return parsed === null ? { ok: false, error: { code: "invalid_response", status: 0, retryable: false } } : { ok: true, data: parsed };
  } catch (e) {
    return { ok: false, error: mapRpcError({ message: e instanceof Error ? e.message : String(e), code: "" }) };
  }
}

const okTrue = (d: unknown) => ((d as { ok?: boolean } | null)?.ok ? (true as const) : null);

export const createMission = (input: CreateMissionInput): Promise<ApiResult<CreatedMission>> =>
  rpc("create_mission", buildCreateMissionParams(input), parseCreateMissionResult);

export const cancelMission = (missionId: string, reason: ServerCancelReason, note?: string): Promise<ApiResult<true>> =>
  rpc("cancel_mission", { p_mission_id: missionId, p_reason: reason, ...(note ? { p_note: note } : {}) }, okTrue);

export const confirmReceipt = (missionId: string, dispute: boolean): Promise<ApiResult<true>> =>
  rpc("confirm_receipt", { p_mission_id: missionId, p_dispute: dispute }, okTrue);

/** Consent evidence is written server-side with a server timestamp (DPDP, 5.3.9). */
export const recordConsent = (purpose: string, noticeVersion: string, granted: boolean, locale?: "en" | "hi", appVersion?: string): Promise<ApiResult<true>> =>
  rpc(
    "record_consent",
    { p_purpose: purpose, p_notice_version: noticeVersion, p_granted: granted, ...(locale ? { p_locale: locale } : {}), ...(appVersion ? { p_app_version: appVersion } : {}) },
    okTrue
  );

export const requestErasure = (missionId?: string): Promise<ApiResult<{ dueAt: string }>> =>
  rpc("request_erasure", missionId ? { p_mission_id: missionId } : {}, (d) => {
    const dueAt = (d as { dueAt?: unknown } | null)?.dueAt;
    return typeof dueAt === "string" ? { dueAt } : null;
  });

/** Rule 9: the caller's newest non-terminal mission (backed by the partial index), or null. */
export async function fetchActiveMission(): Promise<ApiResult<MissionSnapshot | null>> {
  try {
    const { data, error } = await supabase
      .from("missions")
      .select(MISSION_COLUMNS)
      .not("status", "in", "(completed,cancelled)")
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return { ok: false, error: mapRpcError(error) };
    return { ok: true, data: data && data.length > 0 ? parseMissionRow(data[0]) : null };
  } catch (e) {
    return { ok: false, error: mapRpcError({ message: e instanceof Error ? e.message : String(e), code: "" }) };
  }
}

export async function fetchMissionSnapshot(missionId: string): Promise<MissionSnapshot | null> {
  const { data, error } = await supabase.from("missions").select(MISSION_COLUMNS).eq("id", missionId).maybeSingle();
  return error || !data ? null : parseMissionRow(data);
}

/** Events after `seq`, in order; null if any row could not be read or is unknown to this build (caller falls back to the snapshot). */
export async function fetchEventsAfter(missionId: string, seq: number): Promise<ParsedLifecycleMessage[] | null> {
  const { data, error } = await supabase
    .from("mission_events")
    .select("id,seq,event_type,to_status,metadata,created_at")
    .eq("mission_id", missionId)
    .gt("seq", seq)
    .order("seq", { ascending: true });
  if (error || !data) return null;
  const parsed = data.map(parseEventRow);
  return parsed.some((m) => m === null) ? null : (parsed as ParsedLifecycleMessage[]);
}
