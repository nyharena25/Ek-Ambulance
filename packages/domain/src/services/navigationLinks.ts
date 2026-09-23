import type { GeoPoint } from "../types/index.ts";

export interface NavigationLinks {
  /** Android-only intent; iOS has no handler for this scheme. */
  android: string;
  /** Opens Google Maps app or web on every platform. */
  universal: string;
}

export function buildNavigationLinks(dest: GeoPoint): NavigationLinks {
  const { latitude: lat, longitude: lng } = dest;
  return {
    android: `google.navigation:q=${lat},${lng}&mode=d`,
    universal: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
  };
}
