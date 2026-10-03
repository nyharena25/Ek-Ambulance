import { missionChannelName, type MissionTelemetryPing } from "@sahayak/domain";

/**
 * Driver GPS ping shape for mission:{missionId} (the patient app reads the same @sahayak/domain type; this file once
 * published `bearing` where the patient reads `heading`). GPS only: lifecycle events are server-published. Pings are sent
 * on the driver's one shared realtime session (driverRealtime.ts, publishDriverTelemetry), only while it is connected.
 */

export type { MissionTelemetryPing };

export { missionChannelName };

export interface LocationFix {
  latitude: number;
  longitude: number;
  /** Degrees; expo-location reports -1 / null when unknown. */
  heading?: number | null;
  /** Metres per second, as expo-location reports it; the wire ping carries km/h. */
  speed?: number | null;
}

export function locationToPing(fix: LocationFix, now: Date = new Date()): MissionTelemetryPing {
  const validHeading = typeof fix.heading === "number" && Number.isFinite(fix.heading) && fix.heading >= 0;
  const validSpeed = typeof fix.speed === "number" && Number.isFinite(fix.speed) && fix.speed >= 0;
  return {
    latitude: fix.latitude,
    longitude: fix.longitude,
    heading: validHeading ? Math.round(fix.heading as number) % 360 : undefined,
    speed: validSpeed ? Math.round((fix.speed as number) * 3.6 * 10) / 10 : undefined,
    timestamp: now.toISOString(),
  };
}
