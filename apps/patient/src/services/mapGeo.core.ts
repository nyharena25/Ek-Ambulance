import type { GeoPoint, Jurisdiction } from "@sahayak/domain";

export const DEFAULT_MAP_DELTA = 0.015;
export const DEFAULT_PICKUP: GeoPoint = { latitude: 28.5672, longitude: 77.21 };

/** fitToCoordinates on (near-)coincident points zooms to the maximum level; only fit when the route really spans distance. */
export function isFittable(points: readonly GeoPoint[], minSpanDeg = 0.005): boolean {
  if (points.length < 2) return false;
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  return Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lngs) - Math.min(...lngs)) >= minSpanDeg;
}

export function regionAround(center: GeoPoint, delta = DEFAULT_MAP_DELTA) {
  return { ...center, latitudeDelta: delta, longitudeDelta: delta };
}

/** Scales a region about its centre; factor < 1 zooms in. */
export function scaleRegion<R extends GeoPoint & { latitudeDelta: number; longitudeDelta: number }>(region: R, factor: number): R {
  return { ...region, latitudeDelta: region.latitudeDelta * factor, longitudeDelta: region.longitudeDelta * factor };
}

/** Route params arrive as strings; anything non-finite falls back so the map never centres on NaN. */
export function parseCoordinate(lat: string | undefined, lon: string | undefined, fallback: GeoPoint): GeoPoint {
  const latitude = Number(lat);
  const longitude = Number(lon);
  return lat && lon && Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : fallback;
}

// ponytail: fixed per-jurisdiction dispatch hubs stand in for the nearest available
// ambulance until live driver positions reach the patient app.
export const DISPATCH_HUB: Record<Jurisdiction, GeoPoint> = {
  DL: { latitude: 28.641, longitude: 77.24 },
  UP: { latitude: 28.627, longitude: 77.365 },
};

// Coordinates are the four trauma centres seeded in supabase/migrations/20260924000000_core_ems_schema.sql.
const HOSPITALS: ReadonlyArray<{ keyword: string; label: string; coordinate: GeoPoint }> = [
  { keyword: "aiims", label: "AIIMS New Delhi", coordinate: { latitude: 28.5672, longitude: 77.21 } },
  { keyword: "safdarjung", label: "Safdarjung Hospital", coordinate: { latitude: 28.5694, longitude: 77.2075 } },
  { keyword: "sharda", label: "Sharda Hospital", coordinate: { latitude: 28.4732, longitude: 77.482 } },
  { keyword: "fortis", label: "Fortis Hospital Noida", coordinate: { latitude: 28.6189, longitude: 77.3732 } },
];

/** ponytail: keyword match on the display name until missions carry a hospital id; unknown names fall back to AIIMS coordinates. */
export function findHospital(name: string): { label: string; coordinate: GeoPoint; matched: boolean } {
  const lower = name.toLowerCase();
  const hit = HOSPITALS.find((h) => lower.includes(h.keyword));
  return hit ? { label: hit.label, coordinate: hit.coordinate, matched: true } : { label: name, coordinate: HOSPITALS[0]!.coordinate, matched: false };
}
