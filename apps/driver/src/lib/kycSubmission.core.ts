import type { DocumentSlotKey, DriverOnboardingFormData } from "../state/driverOnboarding.store.ts";

/**
 * Pure half of real KYC submission: maps the onboarding form to `upsert_driver_application`'s `p_fields`
 * shape, builds the storage path `submit_kyc`/`driver_documents`'s check constraints require, and mirrors
 * the RPC's own required-slot rule - all read directly from supabase/migrations/20260924000003_mission_api.sql
 * and 20260924000002_data_sync_schema.sql, not guessed. No I/O, so all of it is unit-tested.
 */

/** "14/08/2028" -> "2028-08-14". Returns null (never a guessed date) for anything that doesn't parse as a
 *  real calendar date - upsert_driver_application casts this straight to `::date` and would reject a bad one
 *  anyway, but failing here gives the field-level error before a round trip. */
export function parseFormDate(ddmmyyyy: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(ddmmyyyy.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m as unknown as [string, string, string, string];
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${yyyy}-${mm}-${dd}`;
}

export interface ApplicationFieldsResult {
  ok: true;
  fields: {
    licenseNumber: string;
    ais125Type: string;
    dlExpiry: string;
    dlState: string;
    psvBadgeNumber: string;
    emtLevel: string;
    emtNumber: string;
    emtCouncil: string;
    emtExpiry: string;
    aclsCertified: boolean;
    blsCertified: boolean;
  };
}
export interface ApplicationFieldsError {
  ok: false;
  /** Which onboarding step the bad field lives on, so the caller can route the driver back to it. */
  field: "dlExpiry" | "emtExpiry";
}

/** Maps the onboarding store's form (step 1-3) to upsert_driver_application's p_fields. The RPC itself
 *  re-validates every field server-side (PT422 application_incomplete); this only catches the one shape the
 *  server can't recover from - an unparseable date - before sending it. */
export function mapFormDataToApplicationFields(formData: DriverOnboardingFormData): ApplicationFieldsResult | ApplicationFieldsError {
  const dlExpiry = parseFormDate(formData.dlExpiry);
  if (!dlExpiry) return { ok: false, field: "dlExpiry" };
  // emtExpiry is optional in the RPC (only checked if not null); an empty/unparseable value here means "not
  // set", matching update_driver_profile's own null-means-absent convention, not a hard error.
  const emtExpiry = formData.emtExpiry.trim() ? parseFormDate(formData.emtExpiry) : "";
  if (formData.emtExpiry.trim() && !emtExpiry) return { ok: false, field: "emtExpiry" };
  return {
    ok: true,
    fields: {
      licenseNumber: formData.commercialDlNumber.trim(),
      ais125Type: formData.ais125VehicleType,
      dlExpiry,
      dlState: formData.dlState.trim(),
      psvBadgeNumber: formData.psvBadgeNumber.trim(),
      emtLevel: formData.emtLevel,
      emtNumber: formData.emtNumber.trim(),
      emtCouncil: formData.emtCouncil.trim(),
      emtExpiry: emtExpiry ?? "",
      aclsCertified: formData.isAclsCertified,
      blsCertified: formData.isBlsCertified,
    },
  };
}

/** driver_documents.storage_path check constraint: `like driver_id::text || '/' || slot || '/%'`. */
export function buildKycDocumentPath(driverId: string, slot: DocumentSlotKey, extension: string, uuid: string): string {
  return `${driverId}/${slot}/${uuid}.${extension}`;
}

const MIME_EXTENSIONS: Readonly<Record<string, string>> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/** Only the three MIME types the `driver-kyc-documents` bucket's `allowed_mime_types` permits
 *  (20260924000004_storage_buckets.sql); anything else is rejected client-side before an upload attempt. */
export function extensionForMimeType(mimeType: string | null | undefined): string | null {
  return mimeType ? (MIME_EXTENSIONS[mimeType] ?? null) : null;
}

/** submit_kyc's own rule (mission_api.sql): at least 3 of these 3 specific slots must be uploaded. The other
 *  4 valid slots (commercial_dl, emt_certificate, commercial_insurance, puc_certificate) are accepted by the
 *  table's check constraint but not required by the RPC. */
export const REQUIRED_KYC_SLOTS: readonly DocumentSlotKey[] = ["arai_certificate", "fitness_permit", "vehicle_rc"];

export function hasRequiredKycDocuments(uploadedSlots: ReadonlySet<DocumentSlotKey>): boolean {
  return REQUIRED_KYC_SLOTS.every((slot) => uploadedSlots.has(slot));
}
