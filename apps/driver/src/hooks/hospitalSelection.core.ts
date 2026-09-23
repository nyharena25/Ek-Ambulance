import type { GeoPoint } from "@sahayak/domain";
import { RANKED_TRAUMA_CENTRES, type TraumaCentreItem } from "../i18n/driverOnSceneStrings.ts";

export type EmergencyType = "trauma" | "cardiac" | "stroke" | "burns" | "general";
export const EMERGENCY_TYPES: readonly EmergencyType[] = ["trauma", "cardiac", "stroke", "burns", "general"];

// Matched against each centre's English speciality tags. "general" accepts every centre.
const KEYWORDS: Record<EmergencyType, RegExp> = {
  trauma: /trauma|orthop|surgery/i,
  cardiac: /cardiac/i,
  stroke: /stroke|neuro/i,
  burns: /burn/i,
  general: /./,
};

export interface NearbyHospital {
  hospital: TraumaCentreItem;
  /** Straight-line km from the pickup; Google Maps shows the road distance and ETA. */
  km: number;
}

export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Centres that treat `emergency`, nearest to `from` first. */
export function hospitalsFor(emergency: EmergencyType, from: GeoPoint, centres: readonly TraumaCentreItem[] = RANKED_TRAUMA_CENTRES): NearbyHospital[] {
  return centres
    .filter((h) => h.specialities.some((s) => KEYWORDS[emergency].test(s)))
    .map((hospital) => ({ hospital, km: distanceKm(from, hospital.coordinates) }))
    .sort((a, b) => a.km - b.km);
}
