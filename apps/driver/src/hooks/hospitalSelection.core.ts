import type { GeoPoint } from "@sahayak/domain";
import type { CatalogHospital } from "../lib/driverServer.core.ts";

export type EmergencyType = "trauma" | "cardiac" | "stroke" | "burns" | "general";
export const EMERGENCY_TYPES: readonly EmergencyType[] = ["trauma", "cardiac", "stroke", "burns", "general"];

// Matched against each hospital's registered speciality tags. "general" accepts every hospital.
const KEYWORDS: Record<EmergencyType, RegExp> = {
  trauma: /trauma|orthop|surgery/i,
  cardiac: /cardiac/i,
  stroke: /stroke|neuro/i,
  burns: /burn/i,
  general: /./,
};

export interface NearbyHospital {
  hospital: CatalogHospital;
  /** Straight-line km from the pickup, computed from the registered position; Google Maps shows the road distance and ETA. */
  km: number;
}

export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/**
 * Registered hospitals for `emergency`, nearest to `from` first. A hospital with no specialities on record is kept: missing
 * data is not evidence it cannot treat the patient, and the crew decides.
 */
export function hospitalsFor(emergency: EmergencyType, from: GeoPoint, catalog: readonly CatalogHospital[]): NearbyHospital[] {
  return catalog
    .filter((h) => h.specialities.length === 0 || h.specialities.some((s) => KEYWORDS[emergency].test(s)))
    .map((hospital) => ({ hospital, km: distanceKm(from, hospital.coordinates) }))
    .sort((a, b) => a.km - b.km);
}

/** The server holds a bed only while available_capacity > 0 (else hospital_at_capacity). Unknown capacity is not "full". */
export function canHold(hospital: CatalogHospital): boolean {
  return hospital.availableCapacity !== 0;
}
