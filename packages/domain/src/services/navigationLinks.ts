import type { GeoPoint } from "../types/index.ts";

export interface NavigationLinks {
  /** Android-only intent; iOS has no handler for this scheme. */
  android: string;
  /** Opens Google Maps app or web on every platform. */
  universal: string;
}

/** With `origin` (e.g. the patient pickup) Google Maps plans from there instead of the phone's position; the Android intent can't take an origin, so it is omitted. */
export function buildNavigationLinks(dest: GeoPoint, origin?: GeoPoint): NavigationLinks {
  const { latitude: lat, longitude: lng } = dest;
  const from = origin ? `&origin=${origin.latitude},${origin.longitude}` : "";
  return {
    android: origin ? "" : `google.navigation:q=${lat},${lng}&mode=d`,
    universal: `https://www.google.com/maps/dir/?api=1${from}&destination=${lat},${lng}&travelmode=driving`,
  };
}
