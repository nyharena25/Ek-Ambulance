import * as Location from "expo-location";
import type { GeoPoint } from "@sahayak/domain";
import { formatCoordinates } from "./mapGeo.core";
import { fromGoogle, fromNominatim, fromPlace, type ResolvedAddress } from "./geocoding.core";

const TIMEOUT_MS = 6000;

async function getJson(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "Accept-Language": "en" } });
  if (!res.ok) throw new Error(`geocode ${res.status}`);
  return res.json();
}

/** Google (when keyed) -> device geocoder -> OSM Nominatim -> raw coordinates. Never throws. */
export async function resolveAddress({ latitude, longitude }: GeoPoint): Promise<ResolvedAddress> {
  const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  const attempts: (() => Promise<ResolvedAddress | null>)[] = [
    ...(key
      ? [async () => fromGoogle(await getJson(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${key}`))]
      : []),
    async () => fromPlace((await Location.reverseGeocodeAsync({ latitude, longitude }))[0]),
    async () => fromNominatim(await getJson(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`)),
  ];
  for (const attempt of attempts) {
    try {
      const hit = await attempt();
      if (hit) return hit;
    } catch {
      // fall through to the next provider
    }
  }
  return { primary: formatCoordinates({ latitude, longitude }), secondary: "" };
}
