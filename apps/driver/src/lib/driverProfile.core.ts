import type { AIS125VehicleType } from "@sahayak/domain";
import type { JurisdictionCode } from "../state/driverStandby.store.ts";

/**
 * Pure half of the driver Profile: the shape `get_driver_profile` returns, the minimal patch `update_driver_profile`
 * takes, and the same validation limits the SQL enforces (so a driver is told at the field, not after a round trip).
 * No I/O, so all of it is unit-tested.
 */

export type ServiceZone = "DL" | "UP";

/** The driver-app jurisdiction chips are finer-grained than the server's DL/UP zone; each zone maps to one. */
export const ZONE_TO_JURISDICTION: Record<ServiceZone, JurisdictionCode> = { DL: "DL_SOUTH", UP: "UP_NOIDA" };
export const JURISDICTION_TO_ZONE: Record<JurisdictionCode, ServiceZone> = { DL_SOUTH: "DL", UP_NOIDA: "UP" };

export interface DriverVehicleInfo {
  registrationNumber: string;
  makeModel: string;
  manufactureYear: number | null;
  color: string;
  crewCount: number | null;
}

export interface DriverProfile {
  fullName: string;
  phone: string;
  serviceZone: ServiceZone | null;
  hospitalId: string | null;
  hospitalName: string | null;
  ais125Type: AIS125VehicleType | null;
  kycStatus: string;
  /** Staff's reason, set by reject_kyc; only meaningful while kycStatus is "rejected". */
  kycRejectReason?: string | null;
  /** Plate and make/model come from the RC document: editable only while the KYC application is (draft or rejected). */
  regulatedEditable: boolean;
  vehicle: DriverVehicleInfo;
}

export const EMPTY_VEHICLE: DriverVehicleInfo = { registrationNumber: "", makeModel: "", manufactureYear: null, color: "", crewCount: null };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const int = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : null);
const TYPES: ReadonlySet<string> = new Set(["TYPE_A_MFR", "TYPE_B_PTA", "TYPE_C_BLS", "TYPE_D_ALS"]);

export function parseDriverProfile(data: unknown): DriverProfile | null {
  if (!isObject(data)) return null;
  const v = isObject(data.vehicle) ? data.vehicle : {};
  return {
    fullName: str(data.fullName) ?? "",
    phone: str(data.phone) ?? "",
    serviceZone: data.serviceZone === "DL" || data.serviceZone === "UP" ? data.serviceZone : null,
    hospitalId: str(data.hospitalId),
    hospitalName: str(data.hospitalName),
    ais125Type: TYPES.has(String(data.ais125Type)) ? (data.ais125Type as AIS125VehicleType) : null,
    kycStatus: str(data.kycStatus) ?? "draft",
    kycRejectReason: str(data.kycRejectReason),
    regulatedEditable: data.regulatedEditable === true,
    vehicle: {
      registrationNumber: str(v.registrationNumber) ?? "",
      makeModel: str(v.makeModel) ?? "",
      manufactureYear: int(v.manufactureYear),
      color: str(v.color) ?? "",
      crewCount: int(v.crewCount),
    },
  };
}

// ---------------------------------------------------------------------------
// Draft and patch
// ---------------------------------------------------------------------------

export interface ProfileDraft {
  fullName: string;
  serviceZone: ServiceZone | null;
  hospitalId: string | null;
  vehicle: Pick<DriverVehicleInfo, "registrationNumber" | "makeModel" | "color" | "crewCount">;
}

export interface DriverProfilePatch {
  fullName?: string;
  serviceZone?: ServiceZone;
  hospitalId?: string | null;
  vehicle?: Partial<Pick<DriverVehicleInfo, "registrationNumber" | "makeModel" | "color" | "crewCount">>;
}

export const draftFrom = (p: DriverProfile): ProfileDraft => ({
  fullName: p.fullName,
  serviceZone: p.serviceZone,
  hospitalId: p.hospitalId,
  vehicle: { registrationNumber: p.vehicle.registrationNumber, makeModel: p.vehicle.makeModel, color: p.vehicle.color, crewCount: p.vehicle.crewCount },
});

/** Spacing and case do not make two plates different ("dl 01  ab 0000" == "DL 01 AB 0000"). */
export const normalizePlate = (plate: string): string => plate.trim().replace(/\s+/g, " ").toUpperCase();

/** Only what changed, so an unchanged field is never re-sent (and a locked one never trips `kyc_locked`). Empty when nothing changed. */
export function diffProfile(saved: DriverProfile, draft: ProfileDraft): DriverProfilePatch {
  const patch: DriverProfilePatch = {};
  const name = draft.fullName.trim();
  if (name !== saved.fullName) patch.fullName = name;
  if (draft.serviceZone && draft.serviceZone !== saved.serviceZone) patch.serviceZone = draft.serviceZone;
  if (draft.hospitalId !== saved.hospitalId) patch.hospitalId = draft.hospitalId;

  const vehicle: NonNullable<DriverProfilePatch["vehicle"]> = {};
  const hasVehicle = saved.vehicle.registrationNumber !== "";
  const mayEditRegulated = saved.regulatedEditable || !hasVehicle;
  const plate = normalizePlate(draft.vehicle.registrationNumber);
  if (mayEditRegulated && plate !== saved.vehicle.registrationNumber) vehicle.registrationNumber = plate;
  if (mayEditRegulated && draft.vehicle.makeModel.trim() !== saved.vehicle.makeModel) vehicle.makeModel = draft.vehicle.makeModel.trim();
  if (draft.vehicle.color.trim() !== saved.vehicle.color) vehicle.color = draft.vehicle.color.trim();
  if (draft.vehicle.crewCount !== null && draft.vehicle.crewCount !== saved.vehicle.crewCount) vehicle.crewCount = draft.vehicle.crewCount;
  // A first-time vehicle needs its plate even when only the crew size was typed.
  if (Object.keys(vehicle).length > 0) patch.vehicle = !hasVehicle && !("registrationNumber" in vehicle) ? { ...vehicle, registrationNumber: plate } : vehicle;
  return patch;
}

export const isEmptyPatch = (p: DriverProfilePatch): boolean => Object.keys(p).length === 0;

// ---------------------------------------------------------------------------
// Validation: the same limits as update_driver_profile
// ---------------------------------------------------------------------------

export type ProfileFieldError = "name" | "plate" | "makeModel" | "color" | "crew";

const PLATE = /^[A-Z0-9][A-Z0-9 -]{3,14}$/;

export function validateProfileDraft(draft: ProfileDraft): ProfileFieldError[] {
  const errors: ProfileFieldError[] = [];
  const nameLength = draft.fullName.trim().length;
  if (nameLength < 2 || nameLength > 80) errors.push("name");
  const v = draft.vehicle;
  const anyVehicleField = v.registrationNumber.trim() !== "" || v.makeModel.trim() !== "" || v.color.trim() !== "" || v.crewCount !== null;
  if (anyVehicleField && !PLATE.test(normalizePlate(v.registrationNumber))) errors.push("plate");
  if (v.makeModel.trim().length > 80) errors.push("makeModel");
  if (v.color.trim().length > 30) errors.push("color");
  if (v.crewCount !== null && (!Number.isInteger(v.crewCount) || v.crewCount < 1 || v.crewCount > 12)) errors.push("crew");
  return errors;
}

export type PasswordError = "too_short" | "needs_letter_and_digit" | "mismatch";

export function validateNewPassword(password: string, confirm: string): PasswordError | null {
  if (password.length < 8) return "too_short";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "needs_letter_and_digit";
  if (password !== confirm) return "mismatch";
  return null;
}
