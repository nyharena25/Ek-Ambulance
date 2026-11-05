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

/** Why the foreground watcher cannot produce a fix; shown instead of a bare "waiting for GPS" so the driver can act. */
export type LocationIssue = "location_permission_denied" | "location_services_off";

export interface LocationAccessApi {
  requestPermission: () => Promise<{ granted: boolean }>;
  servicesEnabled: () => Promise<boolean>;
  /** Android's system "turn on location" dialog; rejects when the driver declines it. */
  promptEnableServices: () => Promise<unknown>;
}

/** Permission, then location services. The system dialog is shown only for a driver-initiated retry (a Go online tap),
 *  never on launch or app resume, so declining it once cannot leave the app nagging. */
export async function checkLocationAccess(api: LocationAccessApi, userInitiated: boolean): Promise<LocationIssue | null> {
  if (!(await api.requestPermission()).granted) return "location_permission_denied";
  if (await api.servicesEnabled()) return null;
  if (userInitiated) {
    await api.promptEnableServices().catch(() => undefined);
    if (await api.servicesEnabled()) return null;
  }
  return "location_services_off";
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
    meta: { speed?: number; heading?: number; accuracy?: number; timestamp: string }
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
