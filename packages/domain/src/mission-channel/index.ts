/**
 * Shared wire contract for the mission:{missionId} Centrifugo channel,
 * used by both apps/driver (GPS publisher) and apps/patient (subscriber).
 * Specification: DATA_AND_SYNC_SPECIFICATION.md section 6.4.
 *
 * Two generations of lifecycle publication exist and BOTH must parse:
 *   - as built: { event, missionId, driverId, timestamp } (the driver app's dev shortcut, "Design B")
 *   - v1 (server-published): the same plus { v, type, eventId, seq, state, data } ("Design A")
 * Every v1 field is optional here, receivers ignore unknown events and unknown fields, and
 * nothing in this module throws on hostile input (G-18): it runs inside a socket callback.
 *
 * The type guards live here, not just the types: a shared *type* can't stop a divergent *guard*
 * from silently rejecting or misreading a field (the `bearing` vs `heading` drift that first
 * motivated this module).
 *
 * No React Native/Expo/centrifuge imports here - packages/domain stays pure.
 */

export interface MissionTelemetryPing {
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  /** Metres (the fix's horizontal accuracy). The server ignores fixes worse than 50 m when it measures the billed leg. */
  accuracy?: number;
  timestamp: string;
  /** v1: pings flushed from the offline buffer. */
  deadZone?: boolean;
}

export type MissionStatus =
  | "requesting"
  | "matched"
  | "en_route"
  | "on_scene"
  | "transporting"
  | "arrived_hospital"
  | "completed"
  | "cancelled";

const MISSION_STATUSES: ReadonlySet<string> = new Set<MissionStatus>([
  "requesting",
  "matched",
  "en_route",
  "on_scene",
  "transporting",
  "arrived_hospital",
  "completed",
  "cancelled",
]);

export function isMissionStatus(value: unknown): value is MissionStatus {
  return typeof value === "string" && MISSION_STATUSES.has(value);
}

export const MISSION_LIFECYCLE_EVENTS = [
  "DRIVER_ACCEPTED",
  "DRIVER_ARRIVED",
  "TRANSPORT_STARTED",
  "HOSPITAL_ARRIVED",
  "MISSION_COMPLETED",
  "MISSION_CANCELLED",
  "DRIVER_RELEASED",
] as const;

export type MissionLifecycleEventType = (typeof MISSION_LIFECYCLE_EVENTS)[number];

const KNOWN_LIFECYCLE_EVENTS: ReadonlySet<string> = new Set(MISSION_LIFECYCLE_EVENTS);

export function isMissionLifecycleEventType(value: unknown): value is MissionLifecycleEventType {
  return typeof value === "string" && KNOWN_LIFECYCLE_EVENTS.has(value);
}

export interface MissionLifecyclePublication {
  event: MissionLifecycleEventType;
  missionId?: string;
  driverId?: string;
  timestamp?: string;
  /** v1 envelope (server-published). */
  v?: number;
  type?: "lifecycle";
  eventId?: string;
  seq?: number;
  state?: MissionStatus;
  data?: Record<string, unknown>;
}

export function missionChannelName(missionId: string): string {
  return `mission:${missionId}`;
}

export function isMissionTelemetryPing(data: unknown): data is MissionTelemetryPing {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  if (d.type !== undefined && d.type !== "telemetry") return false;
  return typeof d.latitude === "number" && typeof d.longitude === "number";
}

/** Known event names only: an unknown `event` string is not a publication this build understands. */
export function isMissionLifecyclePublication(data: unknown): data is MissionLifecyclePublication {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  if (d.type !== undefined && d.type !== "lifecycle") return false;
  return isMissionLifecycleEventType(d.event);
}

// ---------------------------------------------------------------------------
// Normalised lifecycle message + per-event `data` readers
// ---------------------------------------------------------------------------

export interface ParsedLifecycleMessage {
  event: MissionLifecycleEventType;
  eventId?: string;
  /** Integer >= 1 when present and valid; otherwise undefined (a legacy publisher). */
  seq?: number;
  missionId?: string;
  driverId?: string;
  state?: MissionStatus;
  timestamp?: string;
  data: Record<string, unknown>;
}

const asString = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);
const asNumber = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const asObject = (v: unknown): Record<string, unknown> | undefined =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;

/**
 * Tolerant parse of a channel publication. Returns null for anything that is not a lifecycle
 * message this build understands. Malformed optional fields are dropped, never thrown on.
 */
export function parseLifecycleMessage(data: unknown): ParsedLifecycleMessage | null {
  if (!isMissionLifecyclePublication(data)) return null;
  const d = data as unknown as Record<string, unknown>;
  const seq = asNumber(d.seq);
  return {
    event: data.event,
    eventId: asString(d.eventId),
    seq: seq !== undefined && Number.isInteger(seq) && seq >= 1 ? seq : undefined,
    missionId: asString(d.missionId),
    driverId: asString(d.driverId),
    state: isMissionStatus(d.state) ? d.state : undefined,
    timestamp: asString(d.timestamp),
    data: asObject(d.data) ?? {},
  };
}

export interface AssignedDriverInfo {
  displayName?: string;
  vehicleRegistration?: string;
  ais125Type?: string;
  /** What the crew entered on their Profile: shown to the patient so they can recognise the ambulance. */
  makeModel?: string;
  color?: string;
  crewCount?: number;
}
export interface MaskedCallInfo {
  number: string;
  extension?: string;
}
export interface DriverAcceptedData {
  driver: AssignedDriverInfo;
  maskedCall?: MaskedCallInfo;
  etaMinutes?: number;
}
export function readDriverAccepted(data: Record<string, unknown>): DriverAcceptedData {
  const driver = asObject(data.driver) ?? {};
  const call = asObject(data.maskedCall);
  const callNumber = call ? asString(call.number) : undefined;
  return {
    driver: {
      displayName: asString(driver.displayName),
      vehicleRegistration: asString(driver.vehicleRegistration),
      ais125Type: asString(driver.ais125Type),
      makeModel: asString(driver.makeModel),
      color: asString(driver.color),
      crewCount: asNumber(driver.crewCount),
    },
    // No number, no call button: never a fixed placeholder number (P-UX-05).
    maskedCall: callNumber ? { number: callNumber, extension: asString(call?.extension) } : undefined,
    etaMinutes: asNumber(data.etaMinutes),
  };
}

export interface TransportDestination {
  hospitalId: string;
  name: string;
  latitude: number;
  longitude: number;
}
export interface TransportStartedData {
  destination?: TransportDestination;
  etaMinutes?: number;
  wardStatus?: string;
  onboardAt?: string;
}
export function readTransportStarted(data: Record<string, unknown>): TransportStartedData {
  const dest = asObject(data.destination);
  const hospitalId = dest ? asString(dest.hospitalId) : undefined;
  const name = dest ? asString(dest.name) : undefined;
  const latitude = dest ? asNumber(dest.latitude) : undefined;
  const longitude = dest ? asNumber(dest.longitude) : undefined;
  return {
    destination:
      hospitalId && name && latitude !== undefined && longitude !== undefined
        ? { hospitalId, name, latitude, longitude }
        : undefined,
    etaMinutes: asNumber(data.etaMinutes),
    wardStatus: asString(data.wardStatus),
    onboardAt: asString(data.onboardAt),
  };
}

export interface MissionCompletedData {
  completedAt?: string;
  distanceKm?: number;
  finalFareInr?: number;
  fareDetails?: Record<string, unknown>;
  /** Where distanceKm (and so the fare) came from: `measured` from the transport-leg GPS track, `estimate` when the server
   *  billed the quoted distance for want of a track (D-2). Absent from an older publisher: treat that as not measured. */
  distanceSource?: "measured" | "estimate";
  /** null/absent while receipt generation is still running. */
  receiptPath?: string;
}
const asDistanceSource = (v: unknown): "measured" | "estimate" | undefined => (v === "measured" || v === "estimate" ? v : undefined);
export function readMissionCompleted(data: Record<string, unknown>): MissionCompletedData {
  return {
    completedAt: asString(data.completedAt),
    distanceKm: asNumber(data.distanceKm),
    finalFareInr: asNumber(data.finalFareInr),
    fareDetails: asObject(data.fareDetails),
    // Stored rows written before the field existed carry it only under audit (the wire strips audit).
    distanceSource: asDistanceSource(data.distanceSource) ?? asDistanceSource(asObject(data.audit)?.distanceSource),
    receiptPath: asString(data.receiptPath),
  };
}

export type CancelledBy = "patient" | "driver" | "system";
export interface MissionCancelledData {
  /** Absent only from a pre-v1 publisher, which never said who cancelled. */
  cancelledBy?: CancelledBy;
  reason?: string;
  note?: string;
  fromState?: MissionStatus;
}
export function readMissionCancelled(data: Record<string, unknown>): MissionCancelledData {
  const by = data.cancelledBy;
  return {
    cancelledBy: by === "patient" || by === "driver" || by === "system" ? by : undefined,
    reason: asString(data.reason),
    note: asString(data.note),
    fromState: isMissionStatus(data.fromState) ? data.fromState : undefined,
  };
}

// ---------------------------------------------------------------------------
// Ordering and de-duplication (section 7.5, rules 3 and 10)
// ---------------------------------------------------------------------------

export type SeqDecision = "apply" | "duplicate" | "gap";

/**
 * Rule 3. `seq === lastSeq + 1` applies; `seq <= lastSeq` is a duplicate; anything further ahead is a gap
 * (fetch the snapshot, then apply). No `seq` (a pre-v1 publisher) or no baseline yet applies unconditionally.
 */
export function decideSeq(lastSeq: number | null, seq: number | undefined): SeqDecision {
  if (seq === undefined || lastSeq === null) return "apply";
  if (seq <= lastSeq) return "duplicate";
  return seq === lastSeq + 1 ? "apply" : "gap";
}

/** Rule 10: a flushed or recovered ping must never move the marker backwards. */
export function isNewerPing(lastTimestamp: string | null, ping: { timestamp?: string }): boolean {
  if (lastTimestamp === null || !ping.timestamp) return true;
  const last = Date.parse(lastTimestamp);
  const next = Date.parse(ping.timestamp);
  if (Number.isNaN(last) || Number.isNaN(next)) return true;
  return next > last;
}
