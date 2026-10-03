import { isUuid, mapRpcError, newIdempotencyKey, parseBoardResponse, type ApiResult, type BoardSnapshot, type DispatchOffer, type GeoPoint } from "@sahayak/domain";
import { supabase } from "./supabaseClient";
import { parseDriverProfile, type DriverProfile, type DriverProfilePatch, type ServiceZone } from "./driverProfile.core";
import {
  ASSIGNED_MISSION_COLUMNS,
  readAssignedMissions,
  HOSPITAL_CATALOG_COLUMNS,
  parseCatalogHospital,
  parseOpenOffers,
  toIngestPings,
  type AssignedMissionRow,
  type CatalogHospital,
  type ServerCall,
} from "./driverServer.core";
import type { QueuedTelemetryPing } from "../types/driverConnection.types";
import { DRIVER_CONSENT_PURPOSES, type ConsentRecordRow } from "../hooks/otpAuth.core";
import { buildKycDocumentPath, extensionForMimeType, type ApplicationFields, type DraftApplicationFields } from "./kycSubmission.core";
import type { DocumentSlotKey } from "../state/driverOnboarding.store";

/**
 * Supabase-bound Mission API for the driver app (DATA_AND_SYNC_SPECIFICATION.md 6.4.5). Never throws: failures return
 * `{ ok: false, error }`. Everything here needs a verified driver session (Supabase phone OTP, app_metadata.role = driver).
 */

export interface ServerSession {
  accessToken: string;
  userId: string;
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

/** Go online / heartbeat / go offline (R-05): the server validates verification and owns the position write. `fixAt` is when
 *  the device measured `location`; its AGE is sent (device clock on both ends, so clock skew cancels) and the server judges
 *  GPS freshness from it, so an old fix re-sent by a heartbeat stays old. */
export async function setPresence(isOnline: boolean, location?: GeoPoint, fixAt?: string): Promise<ApiResult<true>> {
  const fixAgeMs = fixAt && !Number.isNaN(Date.parse(fixAt)) ? Math.max(0, Date.now() - Date.parse(fixAt)) : undefined;
  const base = { p_online: isOnline, ...(location ? { p_lat: location.latitude, p_lng: location.longitude } : {}) };
  try {
    let { data, error } = await supabase.rpc("set_driver_presence", {
      ...base,
      ...(location && fixAgeMs !== undefined ? { p_fix_age_ms: fixAgeMs } : {}),
    });
    // PGRST202: a database that has not run 20261003000000 yet has no p_fix_age_ms. Presence must keep working across that
    // deploy gap, so retry once with the old signature (the server then treats the fix as measured now, as before).
    if (error?.code === "PGRST202" && fixAgeMs !== undefined) ({ data, error } = await supabase.rpc("set_driver_presence", base));
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

/** Rule 9 / 7.6: the mission assigned to this driver, so a killed process resumes it instead of orphaning it. Scoped to
 *  driver_id explicitly: RLS also lets an account read missions it booked as a patient. Two rows are fetched so a broken
 *  one-active-mission invariant is reported, not hidden behind `limit(1)`. */
export async function fetchAssignedMission(driverId: string): Promise<ApiResult<AssignedMissionRow | null>> {
  try {
    const { data, error } = await supabase
      .from("missions")
      .select(ASSIGNED_MISSION_COLUMNS)
      .eq("driver_id", driverId)
      .not("status", "in", "(completed,cancelled)")
      .order("created_at", { ascending: false })
      .limit(2);
    // A failed read is NOT "no mission": callers end a live mission only on `{ ok: true, data: null }`.
    if (error) return { ok: false, error: mapRpcError(error) };
    return readAssignedMissions(data);
  } catch (e) {
    return fail(e);
  }
}

const INVALID: { ok: false; error: ReturnType<typeof mapRpcError> } = { ok: false, error: { code: "invalid_response", status: 0, retryable: true } };

/** Offers still open for this driver (a reconnect may have missed their push). A failed read is an error, not "none". */
export async function fetchOpenOffers(): Promise<ApiResult<{ offers: DispatchOffer[]; clockOffsetMs: number }>> {
  try {
    const { data, error } = await supabase.rpc("list_open_offers");
    if (error) return { ok: false, error: mapRpcError(error) };
    const parsed = parseOpenOffers(data, Date.now());
    return parsed ? { ok: true, data: parsed } : INVALID;
  } catch (e) {
    return fail(e);
  }
}

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

/** Supabase signOut. The SDK clears the stored session; useServerSync (onAuthStateChange) drops the server adapter and the
 *  root layout's route gate returns to phone entry. */
/** "global" (default) revokes the refresh token on the server. "local" only forgets it on this device: the way out of a
 *  session that cannot be refreshed while offline, where a global sign-out cannot reach the server. */
export async function signOut(scope: "global" | "local" = "global"): Promise<ApiResult<true>> {
  try {
    const { error } = await supabase.auth.signOut({ scope });
    return error ? authFail(error) : { ok: true, data: true };
  } catch (e) {
    return fail(e);
  }
}

/** The account's own consent history (RLS consent_records_select_own). A failed read is an error, never "no consent". */
export async function fetchDriverConsents(userId: string): Promise<ApiResult<ConsentRecordRow[]>> {
  try {
    const { data, error } = await supabase
      .from("consent_records")
      .select("purpose,granted,notice_version,granted_at,withdrawn_at")
      .eq("user_id", userId)
      .in("purpose", [...DRIVER_CONSENT_PURPOSES]);
    if (error) return { ok: false, error: mapRpcError(error) };
    if (!data) return { ok: false, error: { code: "invalid_response", status: 0, retryable: true } };
    return { ok: true, data: data as ConsentRecordRow[] };
  } catch (e) {
    return fail(e);
  }
}

/** Consent evidence is written by the server (record_consent): user from the JWT, server timestamp (DPDP, 5.3.9). */
export async function recordDriverConsent(purpose: string, noticeVersion: string, granted: boolean, locale: "en" | "hi"): Promise<ApiResult<true>> {
  try {
    const { data, error } = await supabase.rpc("record_consent", { p_purpose: purpose, p_notice_version: noticeVersion, p_granted: granted, p_locale: locale });
    if (error) return { ok: false, error: mapRpcError(error) };
    return (data as { ok?: boolean } | null)?.ok ? { ok: true, data: true } : { ok: false, error: { code: "invalid_response", status: 0, retryable: false } };
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

/** The registered hospital catalog (RLS `hospitals_select_active`), canonical ids included. A failed read is an error, not "no hospitals". */
export async function fetchHospitalCatalog(): Promise<ApiResult<CatalogHospital[]>> {
  try {
    const { data, error } = await supabase.from("hospitals").select(HOSPITAL_CATALOG_COLUMNS).eq("is_active", true).order("name");
    if (error) return { ok: false, error: mapRpcError(error) };
    if (!data) return { ok: false, error: { code: "invalid_response", status: 0, retryable: true } };
    return { ok: true, data: data.map(parseCatalogHospital).filter((h): h is CatalogHospital => h !== null) };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// KYC (5.4, mission_api.sql). `apps/driver/src/lib/kycSubmission.core.ts` holds the pure field/path mapping.
// ---------------------------------------------------------------------------

/** License, EMT and vehicle-tier fields (drivers row), or the Step 1 subset that creates the draft before the first upload. Server-validated (PT422 application_incomplete on a
 *  missing required field); the RPC upserts by id, so a second call before submission just updates the draft. */
export async function submitDriverApplication(fields: ApplicationFields | DraftApplicationFields): Promise<ApiResult<{ kycStatus: string }>> {
  try {
    const { data, error } = await supabase.rpc("upsert_driver_application", { p_fields: fields });
    if (error) return { ok: false, error: mapRpcError(error) };
    const d = data as { ok?: boolean; kycStatus?: unknown } | null;
    return d?.ok && typeof d.kycStatus === "string" ? { ok: true, data: { kycStatus: d.kycStatus } } : { ok: false, error: { code: "invalid_response", status: 0, retryable: false } };
  } catch (e) {
    return fail(e);
  }
}

/** Moves the application from draft/rejected to pending_verification. The server re-checks everything
 *  (expiry dates, ACLS for TYPE_D_ALS, an active vehicle, the 3 required document slots) - this call either
 *  succeeds for real or fails with the specific PT422 reason, never a client-invented "approved". */
export async function submitKyc(): Promise<ApiResult<{ kycStatus: string; kycReference?: string; submittedAt?: string }>> {
  try {
    const { data, error } = await supabase.rpc("submit_kyc");
    if (error) return { ok: false, error: mapRpcError(error) };
    const d = data as { ok?: boolean; kycStatus?: unknown; kycReference?: unknown; submittedAt?: unknown } | null;
    return d?.ok && typeof d.kycStatus === "string"
      ? { ok: true, data: { kycStatus: d.kycStatus, kycReference: typeof d.kycReference === "string" ? d.kycReference : undefined, submittedAt: typeof d.submittedAt === "string" ? d.submittedAt : undefined } }
      : { ok: false, error: { code: "invalid_response", status: 0, retryable: false } };
  } catch (e) {
    return fail(e);
  }
}

/** Records this device's Expo push token for real dispatch delivery (G-21). `ignoreDuplicates` -> `ON
 *  CONFLICT (driver_id, token) DO NOTHING`, matching the column-scoped update grant (token, platform only,
 *  not driver_id): an upsert's `DO UPDATE` would try to also SET driver_id, which that grant does not allow. */
export async function registerPushToken(driverId: string, token: string, platform: "android" | "ios" | "web"): Promise<ApiResult<true>> {
  try {
    const { error } = await supabase
      .from("driver_push_tokens")
      .upsert({ driver_id: driverId, token, platform }, { onConflict: "driver_id,token", ignoreDuplicates: true });
    if (error) return { ok: false, error: mapRpcError(error) };
    return { ok: true, data: true };
  } catch (e) {
    return fail(e);
  }
}

export interface UploadedKycDocument {
  slot: DocumentSlotKey;
  storagePath: string;
  sizeBytes: number;
}

/** Uploads one document to the `driver-kyc-documents` bucket, then records it in `driver_documents`.
 *  Update-then-insert (not `.upsert()`): the update-grant is column-scoped to
 *  (storage_path, file_name, size_bytes, mime_type) - an upsert's DO UPDATE would try to also SET
 *  driver_id/slot, which the grant does not permit and Postgres would refuse. */
export async function uploadKycDocument(
  driverId: string,
  slot: DocumentSlotKey,
  asset: { uri: string; name: string; mimeType: string | null | undefined }
): Promise<ApiResult<UploadedKycDocument>> {
  const extension = extensionForMimeType(asset.mimeType);
  if (!extension) return { ok: false, error: { code: "unsupported_file_type", status: 0, retryable: false } };
  try {
    const response = await fetch(asset.uri);
    const bytes = await response.arrayBuffer();
    // A known RN gotcha: a file-URI-to-bytes read can silently produce zero bytes. Caught here, not left for
    // the review step to discover a document that is present but empty.
    if (bytes.byteLength === 0) return { ok: false, error: { code: "empty_file", status: 0, retryable: true } };
    const storagePath = buildKycDocumentPath(driverId, slot, extension, newIdempotencyKey());
    const { error: uploadError } = await supabase.storage
      .from("driver-kyc-documents")
      .upload(storagePath, bytes, { contentType: asset.mimeType ?? undefined, upsert: false });
    if (uploadError) return { ok: false, error: { code: "upload_failed", status: 0, retryable: true, detail: uploadError.message } };

    const row = { storage_path: storagePath, file_name: asset.name, size_bytes: bytes.byteLength, mime_type: asset.mimeType };
    const { data: updated, error: updateError } = await supabase
      .from("driver_documents")
      .update(row)
      .eq("driver_id", driverId)
      .eq("slot", slot)
      .select("id");
    if (updateError) return { ok: false, error: mapRpcError(updateError) };
    if (!updated || updated.length === 0) {
      const { error: insertError } = await supabase.from("driver_documents").insert({ driver_id: driverId, slot, ...row });
      if (insertError) return { ok: false, error: mapRpcError(insertError) };
    }
    return { ok: true, data: { slot, storagePath, sizeBytes: bytes.byteLength } };
  } catch (e) {
    return fail(e);
  }
}
