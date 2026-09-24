import { isUuid, mapRpcError, parseBoardResponse, type ApiResult, type BoardSnapshot, type GeoPoint } from "@sahayak/domain";
import { supabase } from "./supabaseClient";
import { parseDriverProfile, type DriverProfile, type DriverProfilePatch, type ServiceZone } from "./driverProfile.core";
import {
  parseAssignedMissionRow,
  parseHospitalRow,
  toIngestPings,
  type AssignedMissionRow,
  type HospitalRow,
  type ServerCall,
} from "./driverServer.core";
import type { QueuedTelemetryPing } from "../types/driverConnection.types";

/**
 * Supabase-bound Mission API for the driver app (DATA_AND_SYNC_SPECIFICATION.md 6.4.5). Never throws: failures return
 * `{ ok: false, error }`. Everything here needs a session the server can verify; the `__DEV__` mock login does not qualify.
 */

export interface ServerSession {
  accessToken: string;
  userId: string;
}

/** The session, but only if the server can verify it. Mock dev sessions use non-UUID ids and are treated as "no server". */
export async function getServerSession(): Promise<ServerSession | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const s = data.session;
    return s && isUuid(s.user.id) ? { accessToken: s.access_token, userId: s.user.id } : null;
  } catch {
    return null;
  }
}

const fail = (e: unknown): { ok: false; error: ReturnType<typeof mapRpcError> } => ({
  ok: false,
  error: mapRpcError({ message: e instanceof Error ? e.message : String(e), code: "" }),
});

export async function callServer(call: ServerCall): Promise<ApiResult<{ status?: string; seq?: number }>> {
  try {
    const { data, error } = await supabase.rpc(call.rpc, call.args);
    if (error) return { ok: false, error: mapRpcError(error) };
    const d = (data ?? {}) as { ok?: boolean; status?: string; seq?: number };
    return d.ok ? { ok: true, data: { status: d.status, seq: d.seq } } : { ok: false, error: { code: "invalid_response", status: 0, retryable: false } };
  } catch (e) {
    return fail(e);
  }
}

/** Go online / heartbeat / go offline (R-05): the server validates verification and owns the position write. */
export async function setPresence(isOnline: boolean, location?: GeoPoint): Promise<ApiResult<true>> {
  try {
    const { data, error } = await supabase.rpc("set_driver_presence", {
      p_online: isOnline,
      ...(location ? { p_lat: location.latitude, p_lng: location.longitude } : {}),
    });
    if (error) return { ok: false, error: mapRpcError(error) };
    return (data as { ok?: boolean } | null)?.ok ? { ok: true, data: true } : { ok: false, error: { code: "invalid_response", status: 0, retryable: false } };
  } catch (e) {
    return fail(e);
  }
}

/** Acknowledged batch upload (7.7). The caller may drop pings only when the returned counts cover the batch. */
export async function ingestTelemetry(missionId: string, pings: QueuedTelemetryPing[]): Promise<ApiResult<{ acknowledged: number; rejected: number }>> {
  try {
    const { data, error } = await supabase.rpc("ingest_telemetry", { p_mission_id: missionId, p_pings: toIngestPings(pings) });
    if (error) return { ok: false, error: mapRpcError(error) };
    const d = data as { acknowledged?: unknown; rejected?: unknown } | null;
    return typeof d?.acknowledged === "number" && typeof d.rejected === "number"
      ? { ok: true, data: { acknowledged: d.acknowledged, rejected: d.rejected } }
      : { ok: false, error: { code: "invalid_response", status: 0, retryable: false } };
  } catch (e) {
    return fail(e);
  }
}

/** Rule 9 / 7.6: the mission assigned to this driver, so a killed process resumes it instead of orphaning it. */
export async function fetchAssignedMission(): Promise<ApiResult<AssignedMissionRow | null>> {
  try {
    const { data, error } = await supabase
      .from("missions")
      .select("id,status,pickup_location")
      .not("status", "in", "(completed,cancelled)")
      .order("created_at", { ascending: false })
      .limit(1);
    // A failed read is NOT "no mission": callers end a live mission only on `{ ok: true, data: null }`.
    if (error) return { ok: false, error: mapRpcError(error) };
    if (!data) return { ok: false, error: { code: "invalid_response", status: 0, retryable: true } };
    return { ok: true, data: data.length === 0 ? null : parseAssignedMissionRow(data[0]) };
  } catch (e) {
    return fail(e);
  }
}

const INVALID: { ok: false; error: ReturnType<typeof mapRpcError> } = { ok: false, error: { code: "invalid_response", status: 0, retryable: true } };

/** The caller's Booking board. A per-driver pull: the server decides which emergencies this driver may see (never a broadcast). */
export async function fetchBoard(): Promise<ApiResult<BoardSnapshot>> {
  try {
    const { data, error } = await supabase.rpc("list_nearby_emergencies");
    if (error) return { ok: false, error: mapRpcError(error) };
    const snapshot = parseBoardResponse(data);
    return snapshot ? { ok: true, data: snapshot } : INVALID;
  } catch (e) {
    return fail(e);
  }
}

export async function fetchDriverProfile(): Promise<ApiResult<DriverProfile>> {
  try {
    const { data, error } = await supabase.rpc("get_driver_profile");
    if (error) return { ok: false, error: mapRpcError(error) };
    const profile = parseDriverProfile(data);
    return profile ? { ok: true, data: profile } : INVALID;
  } catch (e) {
    return fail(e);
  }
}

/** Partial update; refused by the server while the driver holds a mission (`profile_locked`). Returns the saved profile. */
export async function saveDriverProfile(patch: DriverProfilePatch): Promise<ApiResult<DriverProfile>> {
  try {
    const { data, error } = await supabase.rpc("update_driver_profile", { p_profile: patch });
    if (error) return { ok: false, error: mapRpcError(error) };
    const profile = parseDriverProfile(data);
    return profile ? { ok: true, data: profile } : INVALID;
  } catch (e) {
    return fail(e);
  }
}

export interface HospitalOption {
  id: string;
  name: string;
  zone?: ServiceZone;
}

/** Active hospitals a driver can be affiliated with (RLS `hospitals_select_active`). */
export async function fetchHospitalOptions(): Promise<HospitalOption[]> {
  try {
    const { data, error } = await supabase.from("hospitals").select("id,name,zone").eq("is_active", true).order("name");
    if (error || !data) return [];
    return data.flatMap((h) => (isUuid(h.id) && typeof h.name === "string" && (h.zone === "DL" || h.zone === "UP") ? [{ id: h.id, name: h.name, zone: h.zone as ServiceZone }] : []));
  } catch {
    return [];
  }
}

// Phone and password belong to GoTrue, not the profile RPC: their errors are AuthErrors, so the readable message is kept as `detail`.
const authFail = (e: { code?: string; status?: number; message?: string } | null | undefined): { ok: false; error: ReturnType<typeof mapRpcError> } => ({
  ok: false,
  error: { code: e?.code ?? "unknown", status: e?.status ?? 0, detail: e?.message, retryable: false },
});

/** GoTrue texts a code to the new number; the account moves only when it is confirmed. */
export async function requestPhoneChange(phone: string): Promise<ApiResult<true>> {
  try {
    const { error } = await supabase.auth.updateUser({ phone });
    return error ? authFail(error) : { ok: true, data: true };
  } catch (e) {
    return fail(e);
  }
}

export async function confirmPhoneChange(phone: string, token: string): Promise<ApiResult<true>> {
  try {
    const { error } = await supabase.auth.verifyOtp({ phone, token, type: "phone_change" });
    return error ? authFail(error) : { ok: true, data: true };
  } catch (e) {
    return fail(e);
  }
}

export async function changePassword(password: string): Promise<ApiResult<true>> {
  try {
    const { error } = await supabase.auth.updateUser({ password });
    return error ? authFail(error) : { ok: true, data: true };
  } catch (e) {
    return fail(e);
  }
}

/** Active hospitals (RLS `hospitals_select_active`). */
export async function fetchHospitals(): Promise<HospitalRow[]> {
  try {
    const { data, error } = await supabase.from("hospitals").select("id,location").eq("is_active", true);
    if (error || !data) return [];
    return data.map(parseHospitalRow).filter((h): h is HospitalRow => h !== null);
  } catch {
    return [];
  }
}
