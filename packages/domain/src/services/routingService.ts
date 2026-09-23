import type { GeoPoint } from "../types/index.ts";

export interface DrivingRoute {
  distanceKm: number;
  durationMin: number;
  /** GeoJSON [lng, lat] pairs; empty for the offline fallback. */
  geometry: Array<[number, number]>;
  source: "osrm" | "fallback";
}

const OSRM_BASE_URL = "https://router.project-osrm.org";
const URBAN_WINDING_FACTOR = 1.3;
// ponytail: flat 30 km/h Delhi-NCR urban average, no time-of-day model; swap for OSRM's own duration once online.
const FALLBACK_URBAN_SPEED_KMH = 30;
const ROUTE_TIMEOUT_MS = 4000;

/** GeoJSON [lng, lat] pairs -> the {latitude, longitude} points map polylines take. */
export function routeToCoordinates(geometry: ReadonlyArray<readonly [number, number]>): GeoPoint[] {
  return geometry.map(([longitude, latitude]) => ({ latitude, longitude }));
}

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function fallbackRoute(origin: GeoPoint, dest: GeoPoint): DrivingRoute {
  const distanceKm = haversineKm(origin, dest) * URBAN_WINDING_FACTOR;
  return {
    distanceKm: round1(distanceKm),
    durationMin: Math.max(1, Math.round((distanceKm / FALLBACK_URBAN_SPEED_KMH) * 60)),
    geometry: [],
    source: "fallback",
  };
}

/** OSRM reports metres and seconds; returns null for anything but a usable route. */
export function parseOsrmRoute(json: unknown): DrivingRoute | null {
  const body = json as {
    code?: string;
    routes?: Array<{ distance?: number; duration?: number; geometry?: { coordinates?: Array<[number, number]> } }>;
  } | null;
  const route = body?.code === "Ok" ? body.routes?.[0] : undefined;
  if (!route || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)) return null;
  return {
    distanceKm: round1((route.distance as number) / 1000),
    durationMin: Math.max(1, Math.round((route.duration as number) / 60)),
    geometry: route.geometry?.coordinates ?? [],
    source: "osrm",
  };
}

/** OSRM takes lng,lat order. */
export function buildOsrmUrl(origin: GeoPoint, dest: GeoPoint, baseUrl = OSRM_BASE_URL): string {
  return `${baseUrl}/route/v1/driving/${origin.longitude},${origin.latitude};${dest.longitude},${dest.latitude}?overview=full&geometries=geojson`;
}

/** Never rejects: any network/HTTP/parse failure degrades to the haversine estimate. */
export async function getDrivingRoute(
  origin: GeoPoint,
  dest: GeoPoint,
  opts: { fetchImpl?: typeof fetch; baseUrl?: string; timeoutMs?: number } = {}
): Promise<DrivingRoute> {
  const { fetchImpl = fetch, baseUrl, timeoutMs = ROUTE_TIMEOUT_MS } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(buildOsrmUrl(origin, dest, baseUrl), { signal: controller.signal });
    if (!res.ok) return fallbackRoute(origin, dest);
    return parseOsrmRoute(await res.json()) ?? fallbackRoute(origin, dest);
  } catch {
    return fallbackRoute(origin, dest);
  } finally {
    clearTimeout(timer);
  }
}
