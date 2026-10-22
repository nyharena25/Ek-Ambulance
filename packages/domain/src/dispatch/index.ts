/**
 * Dispatch contract: offers on driver:{driverId}:offers, wave configuration, the Redis key convention, realtime
 * token scopes, and the status crosswalk (DATA_AND_SYNC_SPECIFICATION.md 6.3, 6.4.4, 6.5, 6.6, 7.1).
 * Pure: no I/O, no framework imports.
 */
import type { AIS125VehicleType, Jurisdiction } from "../types/index.ts";
import type { MissionStatus } from "../mission-channel/index.ts";

// ---------------------------------------------------------------------------
// Configuration (D-5). The server owns these; supabase/tests/data_sync_schema.test.ts fails if the SQL
// dispatch_config() drifts from this constant, so clients never hard-code waves.
// ---------------------------------------------------------------------------

export const DISPATCH_CONFIG = {
  offerTtlSeconds: 15,
  waveWindowSeconds: 45,
  radiiKm: [3, 6, 10],
  /**
   * What a driver's Booking board shows: green within 4 km, red within 7 km after one wave window, and the home-screen
   * fallback within 10 km after two. Wider than `radiiKm` (the offer pushes) on purpose: the board is a pull.
   */
  boardRadiiKm: [4, 7, 10],
  /**
   * How long a request nobody took stays open after the offer waves (3 x 45 s = 135 s) end. Drivers were asked and did not
   * answer, so it remains on their Booking board until this window closes; then dispatch_tick cancels it. Measured from the dispatch round's start (missions.search_started_at).
   * 345 = the 45 s designed time + 5 minutes overdue: the signed timer both sides show never reads past -05:00.
   */
  searchTtlSeconds: 345,
  /** A driver counts as present for 30 s after the last heartbeat (drivers.last_seen_at; SQL dispatch_config().presenceFreshSeconds). */
  presenceTtlSeconds: 30,
} as const;

// ---------------------------------------------------------------------------
// Redis (6.6): one naming convention. The vehicle type is part of the GEO key because eligibility is strict equality.
// ---------------------------------------------------------------------------

export const redisKeys = {
  driverGeo: (zone: Jurisdiction, vehicleType: AIS125VehicleType): string => `drivers:geo:${zone}:${vehicleType}`,
  driverPresence: (driverId: string): string => `driver:presence:${driverId}`,
};

// ---------------------------------------------------------------------------
// Identifiers and realtime scopes (6.5). UUID only: the dev minter used to accept any [\w-]+.
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function driverOffersChannelName(driverId: string): string {
  return `driver:${driverId}:offers`;
}

export type RealtimeScope =
  | { kind: "connect" }
  | { kind: "mission"; missionId: string }
  | { kind: "offers"; driverId: string };

/** `connect`, `mission:{uuid}` or `driver:{uuid}:offers`. Anything else (including a bare `driver:{id}`) is null. */
export function parseRealtimeScope(scope: unknown): RealtimeScope | null {
  if (typeof scope !== "string") return null;
  if (scope === "connect") return { kind: "connect" };
  const mission = /^mission:(.+)$/.exec(scope);
  if (mission && isUuid(mission[1])) return { kind: "mission", missionId: mission[1] };
  const offers = /^driver:(.+):offers$/.exec(scope);
  if (offers && isUuid(offers[1])) return { kind: "offers", driverId: offers[1] };
  return null;
}

// ---------------------------------------------------------------------------
// Offers (6.4.4)
// ---------------------------------------------------------------------------

export type UrgencyTierName = "CAT_1_IMMEDIATE" | "CAT_2_URGENT" | "CAT_3_DELAYED";

export interface DispatchOffer {
  offerId: string;
  missionId: string;
  waveNumber?: number;
  issuedAt?: string;
  /** Server time. The countdown is computed from this, never from a local counter of 15. */
  expiresAt: string;
  urgency?: UrgencyTierName;
  requiredVehicleType?: AIS125VehicleType;
  jurisdiction?: Jurisdiction;
  pickup?: { latitude: number; longitude: number; address?: string; landmark?: string };
  distanceKm?: number;
  etaMinutes?: number;
  /** The mission's statutory booking estimate (server fare_details); absent when the server sent none. */
  estimatedFareInr?: number;
  /** The only clinical content a driver sees. ageBand/sex depend on decision D-6 and are absent when not captured. */
  patientSummary?: { primaryComplaint?: string; derivedFlags?: string[]; ageBand?: string; sex?: string };
}

export interface DispatchOfferRevoked {
  offerId: string;
  reason: "taken" | "cancelled" | "expired";
}

const VEHICLE_TYPES: ReadonlySet<string> = new Set(["TYPE_A_MFR", "TYPE_B_PTA", "TYPE_C_BLS", "TYPE_D_ALS"]);
const URGENCIES: ReadonlySet<string> = new Set(["CAT_1_IMMEDIATE", "CAT_2_URGENT", "CAT_3_DELAYED"]);

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/**
 * Tolerant parse of an `offer` message. Requires only what the driver cannot act without (ids and an expiry);
 * everything else is read when well-formed and left absent otherwise, so the UI omits a field rather than invents it.
 */
export function parseDispatchOffer(data: unknown): DispatchOffer | null {
  if (!isObject(data) || (data.type !== undefined && data.type !== "offer")) return null;
  const offerId = str(data.offerId);
  const missionId = str(data.missionId);
  const expiresAt = str(data.expiresAt);
  if (!offerId || !missionId || !expiresAt || Number.isNaN(Date.parse(expiresAt))) return null;

  const pickup = isObject(data.pickup) ? data.pickup : undefined;
  const lat = pickup ? num(pickup.latitude) : undefined;
  const lng = pickup ? num(pickup.longitude) : undefined;
  const summary = isObject(data.patientSummary) ? data.patientSummary : undefined;

  return {
    offerId,
    missionId,
    waveNumber: num(data.waveNumber),
    issuedAt: str(data.issuedAt),
    expiresAt,
    urgency: URGENCIES.has(String(data.urgency)) ? (data.urgency as UrgencyTierName) : undefined,
    requiredVehicleType: VEHICLE_TYPES.has(String(data.requiredVehicleType))
      ? (data.requiredVehicleType as AIS125VehicleType)
      : undefined,
    jurisdiction: data.jurisdiction === "DL" || data.jurisdiction === "UP" ? data.jurisdiction : undefined,
    pickup:
      pickup && lat !== undefined && lng !== undefined
        ? { latitude: lat, longitude: lng, address: str(pickup.address), landmark: str(pickup.landmark) }
        : undefined,
    distanceKm: num(data.distanceKm),
    etaMinutes: num(data.etaMinutes),
    estimatedFareInr: num(data.estimatedFareInr),
    patientSummary: summary
      ? {
          primaryComplaint: str(summary.primaryComplaint),
          derivedFlags: Array.isArray(summary.derivedFlags)
            ? summary.derivedFlags.filter((f): f is string => typeof f === "string")
            : undefined,
          ageBand: str(summary.ageBand),
          sex: str(summary.sex),
        }
      : undefined,
  };
}

export function parseOfferRevoked(data: unknown): DispatchOfferRevoked | null {
  if (!isObject(data) || data.type !== "offer_revoked") return null;
  const offerId = str(data.offerId);
  const reason = data.reason;
  if (!offerId || (reason !== "taken" && reason !== "cancelled" && reason !== "expired")) return null;
  return { offerId, reason };
}

/**
 * Rule 11: the offer countdown derives from the server's `expiresAt`, corrected by a measured clock offset
 * (`serverNow - localNow`, taken from the offer's own `issuedAt` when it arrives).
 */
export function estimateClockOffsetMs(serverIso: string | undefined, localNowMs: number): number {
  if (!serverIso) return 0;
  const server = Date.parse(serverIso);
  return Number.isNaN(server) ? 0 : server - localNowMs;
}

export function offerSecondsLeft(expiresAt: string, localNowMs: number, clockOffsetMs = 0): number {
  const expires = Date.parse(expiresAt);
  if (Number.isNaN(expires)) return 0;
  return Math.max(0, Math.ceil((expires - (localNowMs + clockOffsetMs)) / 1000));
}

// ---------------------------------------------------------------------------
// Status crosswalk (7.1) and the transition table (the SQL public.transition_mission / cancel_mission /
// accept_offer implement exactly these rows; supabase/tests/data_sync_schema.test.ts fails on drift).
// ---------------------------------------------------------------------------

export interface MissionTransition {
  event: string;
  from: readonly MissionStatus[];
  to: MissionStatus;
}

export const MISSION_TRANSITIONS: readonly MissionTransition[] = [
  { event: "DRIVER_ACCEPTED", from: ["requesting"], to: "en_route" },
  { event: "DRIVER_ARRIVED", from: ["en_route"], to: "on_scene" },
  { event: "TRANSPORT_STARTED", from: ["on_scene"], to: "transporting" },
  { event: "HOSPITAL_ARRIVED", from: ["transporting"], to: "arrived_hospital" },
  { event: "MISSION_COMPLETED", from: ["arrived_hospital"], to: "completed" },
  { event: "DRIVER_RELEASED", from: ["en_route", "on_scene"], to: "requesting" },
  {
    event: "MISSION_CANCELLED",
    from: ["requesting", "en_route", "on_scene", "transporting", "arrived_hospital"],
    to: "cancelled",
  },
];

export function canTransition(from: MissionStatus, event: string): boolean {
  return MISSION_TRANSITIONS.some((t) => t.event === event && t.from.includes(from));
}

/** Patient machine state a server status maps to (used by HYDRATE). `matched` is unused in the target (D-4). */
export function patientStateForStatus(
  status: MissionStatus
): "requesting" | "tracking" | "transporting" | "awaitingReceipt" | "cancelled" {
  switch (status) {
    case "requesting":
      return "requesting";
    case "matched":
    case "en_route":
    case "on_scene":
      return "tracking";
    case "transporting":
    case "arrived_hospital":
      return "transporting";
    case "completed":
      return "awaitingReceipt";
    case "cancelled":
      return "cancelled";
  }
}

/** Driver machine state a server status maps to, or null when the driver has no mission state for it. */
export function driverStateForStatus(
  status: MissionStatus
): "enRouteToPatient" | "onScene" | "transporting" | "arrivedHospital" | null {
  switch (status) {
    case "matched":
    case "en_route":
      return "enRouteToPatient";
    case "on_scene":
      return "onScene";
    case "transporting":
      return "transporting";
    case "arrived_hospital":
      return "arrivedHospital";
    default:
      return null;
  }
}
