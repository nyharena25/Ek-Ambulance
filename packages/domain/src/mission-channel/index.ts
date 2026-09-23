/**
 * Shared wire contract for the mission:{missionId} Centrifugo channel,
 * used by both apps/driver (publisher) and apps/patient (subscriber).
 *
 * Before this module existed, each app defined its own copy of this shape
 * independently: apps/patient/src/services/missionChannel.service.ts's
 * `DriverTelemetry` used `heading`, apps/driver/src/services/driverTelemetry.ts
 * used `bearing` for the identical field - a silent, type-checked-on-neither-side
 * schema drift that would have dropped every heading value patient-side.
 * The type guard lives here too, not just the type: a shared *type* can't
 * stop a divergent *guard* from silently rejecting or misreading a field,
 * which is exactly the failure mode that produced the drift above.
 *
 * No React Native/Expo/centrifuge imports here - packages/domain stays
 * pure per P02's non-goal; this module only describes the wire shape.
 */

export interface MissionTelemetryPing {
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  timestamp: string;
}

export type MissionLifecycleEventType =
  | "DRIVER_ACCEPTED"
  | "DRIVER_ARRIVED"
  | "TRANSPORT_STARTED"
  | "MISSION_COMPLETED"
  | "MISSION_CANCELLED";

export interface MissionLifecyclePublication {
  event: MissionLifecycleEventType;
  missionId: string;
  /** Added for the Wire Event Publishing Closure sweep (driver-side audit
   *  trail / future staleness checks) - not yet read by
   *  translateLifecycleEvent, which still only needs event+missionId.
   *  isMissionLifecyclePublication below deliberately does NOT require
   *  these two, so a publication from a producer that hasn't caught up to
   *  them yet is still accepted. */
  driverId: string;
  timestamp: string;
}

export function missionChannelName(missionId: string): string {
  return `mission:${missionId}`;
}

export function isMissionTelemetryPing(data: unknown): data is MissionTelemetryPing {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof (data as MissionTelemetryPing).latitude === "number" &&
    typeof (data as MissionTelemetryPing).longitude === "number"
  );
}

export function isMissionLifecyclePublication(data: unknown): data is MissionLifecyclePublication {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof (data as MissionLifecyclePublication).event === "string"
  );
}
