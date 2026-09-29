import { haversineKm, type GeoPoint, type Jurisdiction } from "@sahayak/domain";

export const DEFAULT_PICKUP: GeoPoint = { latitude: 28.5672, longitude: 77.21 };

/** fitToCoordinates on (near-)coincident points zooms to the maximum level; only fit when the route really spans distance. */
export function isFittable(points: readonly GeoPoint[], minSpanDeg = 0.005): boolean {
  if (points.length < 2) return false;
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  return Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lngs) - Math.min(...lngs)) >= minSpanDeg;
}

/** Route params arrive as strings; anything non-finite falls back so the map never centres on NaN. */
export function parseCoordinate(lat: string | undefined, lon: string | undefined, fallback: GeoPoint): GeoPoint {
  const latitude = Number(lat);
  const longitude = Number(lon);
  return lat && lon && Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : fallback;
}

/**
 * Local input check only: a pickup the patient actually set (GPS fix, map drag, landmark) with finite, in-range
 * coordinates. Whether the point is inside the service area is decided by the server (create_mission, R-12), never here.
 */
export function isValidPickup(point: GeoPoint | null | undefined): point is GeoPoint {
  return (
    !!point &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180
  );
}

// ponytail: fixed per-jurisdiction dispatch hubs stand in for the nearest available
// ambulance until live driver positions reach the patient app.
export const DISPATCH_HUB: Record<Jurisdiction, GeoPoint> = {
  DL: { latitude: 28.641, longitude: 77.24 },
  UP: { latitude: 28.627, longitude: 77.365 },
};

// ponytail: nearest fixed hub by straight line, NOT a jurisdiction decision. Pickups far from both hubs
// (e.g. Lucknow) get a long route estimate; replace with live driver positions.
export function nearestDispatchHub(pickup: GeoPoint): GeoPoint {
  const hubs = Object.values(DISPATCH_HUB);
  return hubs.reduce((best, hub) => (haversineKm(hub, pickup) < haversineKm(best, pickup) ? hub : best), hubs[0]!);
}

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

export const formatCoordinates = (p: GeoPoint) => `${p.latitude.toFixed(4)}° N, ${p.longitude.toFixed(4)}° E`;

export interface GeocodedPlace {
  name?: string | null;
  street?: string | null;
  district?: string | null;
  subregion?: string | null;
  city?: string | null;
  postalCode?: string | null;
}

/** street, district, subregion, city, postalCode; blanks and repeats dropped. Falls back to the coordinates when empty. */
export function formatAddress(place: GeocodedPlace | undefined, fallback: GeoPoint): string {
  const seen = new Set<string>();
  const parts = [place?.street ?? place?.name, place?.district, place?.subregion, place?.city, place?.postalCode].filter(
    (part): part is string => {
      const v = part?.trim();
      if (!v || seen.has(v.toLowerCase())) return false;
      seen.add(v.toLowerCase());
      return true;
    }
  );
  return parts.length ? parts.map((v) => v.trim()).join(", ") : formatCoordinates(fallback);
}
