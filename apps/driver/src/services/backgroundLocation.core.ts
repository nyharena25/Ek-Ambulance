import type { DriverLifecycleState } from "@sahayak/domain";
import { locationToPing, type MissionTelemetryPing } from "./driverTelemetry.ts";

export const BACKGROUND_LOCATION_TASK = "SAHAYAK_BACKGROUND_LOCATION_TASK";

// Started at enRouteToPatient, kept through onScene, stopped at arrivedHospital (completed/cancelled land in standby/offline).
const BACKGROUND_TRACKING_STATES: readonly DriverLifecycleState[] = ["enRouteToPatient", "onScene", "transporting"];

export function shouldTrackInBackground(state: DriverLifecycleState): boolean {
  return BACKGROUND_TRACKING_STATES.includes(state);
}

/** Foreground watcher gate. Must include a signed-in but offline driver: going online needs a real fix first
 *  (driverStandby.store `no_gps_fix`), so gating on isOnline alone means a driver can never get online. While offline the
 *  fix only stays local - the presence heartbeat (useServerSync) is gated on isOnline. */
export function shouldWatchLocation(signedIn: boolean, isOnline: boolean, missionActive: boolean): boolean {
  return signedIn || isOnline || missionActive;
}

export interface BackgroundTrackingApi {
  isRunning: () => Promise<boolean>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

/** Idempotent: starts only when wanted and not running, stops only when running and not wanted. */
export async function syncBackgroundTracking(state: DriverLifecycleState, api: BackgroundTrackingApi): Promise<void> {
  const running = await api.isRunning();
  const wanted = shouldTrackInBackground(state);
  if (wanted && !running) await api.start();
  else if (!wanted && running) await api.stop();
}

export interface LocationObjectLike {
  coords: {
    latitude: number;
    longitude: number;
    heading?: number | null;
    speed?: number | null;
    accuracy?: number | null;
    altitude?: number | null;
  };
  timestamp: number;
}

export interface LocationFixDeps {
  setGps: (gps: {
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    heading: number;
    speedKmh: number;
    altitudeMeters: number;
    fixedAt: string;
  }) => void;
  getActiveMissionId: () => string | null;
  isFallbackActive: () => boolean;
  enqueuePing: (
    missionId: string,
    coords: { latitude: number; longitude: number },
    meta: { speed?: number; heading?: number; timestamp: string }
  ) => void;
  publish: (ping: MissionTelemetryPing) => void;
}

/** Shared by the foreground watcher and the background task so both ship an identical payload. */
export function handleLocationFix(loc: LocationObjectLike, deps: LocationFixDeps, publishToMission = true): void {
  const { coords } = loc;
  const ping = locationToPing(coords, new Date(loc.timestamp));
  deps.setGps({
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracyMeters: coords.accuracy ?? 0,
    heading: ping.heading ?? 0,
    speedKmh: ping.speed ?? 0,
    altitudeMeters: coords.altitude ?? 0,
    fixedAt: ping.timestamp,
  });

  const missionId = deps.getActiveMissionId();
  if (!publishToMission || !missionId) return;
  if (deps.isFallbackActive()) {
    deps.enqueuePing(missionId, { latitude: coords.latitude, longitude: coords.longitude }, ping);
  } else {
    deps.publish(ping);
  }
}
