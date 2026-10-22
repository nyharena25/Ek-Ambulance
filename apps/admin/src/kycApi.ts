import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Staff KYC review service. Every call runs with the signed-in staff member's own JWT; authorization is decided in
 * Postgres (public._require_staff / is_staff, migration 20260929000001), never here. Approval and rejection go
 * through staff_approve_kyc / staff_reject_kyc, which delegate to the existing approve_kyc / reject_kyc.
 */

export const KYC_BUCKET = "driver-kyc-documents";
export const KYC_STATUSES = ["pending_verification", "rejected", "approved", "draft"] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];

export interface KycApplicationSummary {
  driverId: string;
  phone: string | null;
  fullName: string | null;
  kycStatus: KycStatus;
  kycReference: string | null;
  ais125Type: string;
  serviceZone: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  requiredUploaded: number;
  requiredTotal: number;
  documentCount: number;
}

export interface KycDocument {
  slot: string;
  storagePath: string;
  fileName: string | null;
  sizeBytes: number | null;
  mimeType: string | null;
  status: "uploaded" | "accepted" | "rejected";
  rejectionReason: string | null;
  uploadedAt: string | null;
  reviewedAt: string | null;
}

export interface KycApplication extends Omit<KycApplicationSummary, "requiredUploaded" | "requiredTotal" | "documentCount"> {
  kycRejectReason: string | null;
  isVerified: boolean;
  licenseNumber: string;
  dlExpiry: string | null;
  dlState: string | null;
  psvBadgeNumber: string | null;
  emtLevel: string | null;
  emtCertId: string | null;
  emtCouncil: string | null;
  emtExpiry: string | null;
  aclsCertified: boolean;
  blsCertified: boolean;
  vehicle: {
    registrationNumber: string;
    makeModel: string | null;
    manufactureYear: number | null;
    vin: string | null;
    ais125Type: string;
    equipmentAttested: unknown;
  } | null;
  requiredSlots: string[];
  documents: KycDocument[];
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

type PgError = { code?: string; message?: string } | null;

/** PostgREST surfaces public._fail(code, 'PTxxx') as { code: 'PTxxx', message: code }. */
export function errorCode(error: PgError): string {
  if (!error) return "unknown_error";
  if (error.code === "42501") return "forbidden";
  return error.message || error.code || "unknown_error";
}

const wrap = <T>(data: unknown, error: PgError): Result<T> => (error ? { ok: false, error: errorCode(error) } : { ok: true, data: data as T });

/** A failed check is an error, not "not staff" - otherwise a network/CORS failure reads as an authorization decision. */
export async function isStaff(db: SupabaseClient): Promise<Result<boolean>> {
  const { data, error } = await db.rpc("is_staff");
  return error ? { ok: false, error: errorCode(error) } : { ok: true, data: data === true };
}

/** status null lists every application. */
export async function listApplications(db: SupabaseClient, status: KycStatus | null): Promise<Result<KycApplicationSummary[]>> {
  const { data, error } = await db.rpc("staff_list_kyc_applications", { p_status: status });
  return wrap(data, error);
}

export async function getApplication(db: SupabaseClient, driverId: string): Promise<Result<KycApplication>> {
  const { data, error } = await db.rpc("staff_get_kyc_application", { p_driver_id: driverId });
  return wrap(data, error);
}

export async function approveApplication(db: SupabaseClient, driverId: string): Promise<Result<{ kycStatus: string }>> {
  const { data, error } = await db.rpc("staff_approve_kyc", { p_driver_id: driverId });
  return wrap(data, error);
}

export async function rejectApplication(db: SupabaseClient, driverId: string, reason: string): Promise<Result<{ kycStatus: string }>> {
  if (!reason.trim()) return { ok: false, error: "reason_required" };
  const { data, error } = await db.rpc("staff_reject_kyc", { p_driver_id: driverId, p_reason: reason.trim() });
  return wrap(data, error);
}

/** Short-lived signed URL, issued by Storage only if the staff read policy (kyc_docs_select_staff) allows it. */
export async function documentUrl(db: SupabaseClient, storagePath: string, expiresInSeconds = 60): Promise<Result<string>> {
  const { data, error } = await db.storage.from(KYC_BUCKET).createSignedUrl(storagePath, expiresInSeconds);
  return error || !data?.signedUrl ? { ok: false, error: error?.message ?? "signed_url_failed" } : { ok: true, data: data.signedUrl };
}

/** Required slots (what submit_kyc enforces) with no uploaded document. */
export function missingRequiredSlots(app: Pick<KycApplication, "requiredSlots" | "documents">): string[] {
  const have = new Set(app.documents.map((d) => d.slot));
  return app.requiredSlots.filter((s) => !have.has(s));
}

/** Only a pending application can be decided; approve_kyc / reject_kyc refuse anything else (PT409). */
export const canDecide = (status: string): boolean => status === "pending_verification";

const MESSAGES: Record<string, string> = {
  not_staff: "Your account is not authorised for KYC review.",
  forbidden: "Not permitted.",
  unauthenticated: "Your session has ended. Sign in again.",
  driver_not_found: "Application not found.",
  not_pending_verification: "This application is no longer pending; reload to see its current state.",
  reason_required: "A rejection reason is required.",
  reason_too_long: "The rejection reason is too long (500 characters at most).",
  cannot_review_own_application: "You cannot review your own application.",
  staff_check_failed: "Could not verify staff access (network or gateway error). Try again.",
  documents_invalid: "Cannot approve: a required document is rejected or its file is missing. Reject the application so the driver can replace it.",
  invalid_range: "Choose a date range of at most 366 days, with the start on or before the end.",
  invalid_outcome: "Unknown status filter.",
};
export const describeError = (code: string): string => MESSAGES[code] ?? `Request failed (${code}).`;
