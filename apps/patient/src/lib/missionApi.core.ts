import {
  isMissionStatus,
  parseLifecycleMessage,
  type AIS125VehicleType,
  type GeoPoint,
  type ItemizedStatutoryFare,
  type Jurisdiction,
  type MissionStatus,
  type ParsedLifecycleMessage,
} from "@sahayak/domain";

/**
 * Pure mapping between the Mission API (public.create_mission / cancel_mission / ... RPCs and RLS reads of
 * `missions` / `mission_events`, DATA_AND_SYNC_SPECIFICATION.md 6.4.5) and app types. No network here: the
 * supabase-bound calls live in missionApi.ts so these mappings can run under the node test runner.
 */

// One implementation for both apps (packages/domain/src/api).
export { mapRpcError, newIdempotencyKey, type ApiError, type ApiResult } from "@sahayak/domain";

/**
 * What the patient is told when a request could not be created. Every message ends the same way: 108 is one tap away
 * (D-1) and the request was NOT sent, so the patient is never left believing help is coming.
 */
export function createMissionErrorMessage(code: string, language: "en" | "hi" = "en"): string {
  const en: Record<string, string> = {
    out_of_zone: "This pickup location is outside our service area. Please call 108.",
    jurisdictions_not_loaded: "Ambulance booking is temporarily unavailable. Please call 108.",
    not_a_patient: "This account cannot request an ambulance. Please call 108.",
    unauthenticated: "Please sign in again to request an ambulance, or call 108.",
    network: "No connection. Your request was not sent. Check your network and try again, or call 108.",
  };
  const hi: Record<string, string> = {
    out_of_zone: "यह पिकअप स्थान हमारे सेवा क्षेत्र से बाहर है। कृपया 108 पर कॉल करें।",
    jurisdictions_not_loaded: "एम्बुलेंस बुकिंग अभी उपलब्ध नहीं है। कृपया 108 पर कॉल करें।",
    not_a_patient: "इस खाते से एम्बुलेंस अनुरोध नहीं किया जा सकता। कृपया 108 पर कॉल करें।",
    unauthenticated: "एम्बुलेंस के लिए कृपया फिर से साइन इन करें, या 108 पर कॉल करें।",
    network: "कनेक्शन नहीं है। आपका अनुरोध भेजा नहीं गया। नेटवर्क जाँचकर फिर कोशिश करें, या 108 पर कॉल करें।",
  };
  const fallback = language === "hi" ? "आपका अनुरोध भेजा नहीं जा सका। फिर कोशिश करें, या 108 पर कॉल करें।" : "Your request could not be sent. Try again, or call 108.";
  return (language === "hi" ? hi : en)[code] ?? fallback;
}

// ---------------------------------------------------------------------------
// Cancellation reasons (P-UX-07): the UI's reason keys map onto the server's enum instead of being flattened.
// ---------------------------------------------------------------------------

export type ServerCancelReason = "changed_mind" | "found_alternative" | "duplicate_request" | "other";

export function cancelReasonForKey(key: string): { reason: ServerCancelReason; note?: string } {
  switch (key) {
    case "alternative":
      return { reason: "found_alternative" };
    case "resolved":
      return { reason: "changed_mind" };
    case "location":
      return { reason: "other", note: "Incorrect pickup location entered" };
    default:
      return { reason: "other" };
  }
}

// ---------------------------------------------------------------------------
// create_mission
// ---------------------------------------------------------------------------

export interface CreateMissionInput {
  idempotencyKey: string;
  pickup: GeoPoint;
  pickupAddress?: string;
  vehicleType: AIS125VehicleType;
  urgency: "CAT_1_IMMEDIATE" | "CAT_2_URGENT" | "CAT_3_DELAYED";
  triage: Record<string, unknown>;
  distanceKm: number;
  district?: string;
  durationMin?: number;
}

/** RPC parameter object (names are the SQL parameter names). Optional values are omitted rather than sent as null. */
export function buildCreateMissionParams(input: CreateMissionInput): Record<string, unknown> {
  const params: Record<string, unknown> = {
    p_idempotency_key: input.idempotencyKey,
    p_pickup_lat: input.pickup.latitude,
    p_pickup_lng: input.pickup.longitude,
    p_vehicle_type: input.vehicleType,
    p_urgency: input.urgency,
    p_triage: input.triage,
    p_distance_km: input.distanceKm,
  };
  if (input.pickupAddress) params.p_pickup_address = input.pickupAddress;
  if (input.district) params.p_district = input.district;
  if (input.durationMin !== undefined) params.p_duration_min = input.durationMin;
  return params;
}

export interface CreatedMission {
  missionId: string;
  displayRef?: string;
  stateVersion: number;
  status: MissionStatus;
  /** Decided by the server from the jurisdiction polygons (R-12); the app never guesses it. */
  jurisdiction: Jurisdiction;
  fareDetails?: ItemizedStatutoryFare;
  replay: boolean;
}

export function parseCreateMissionResult(data: unknown): CreatedMission | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  const m = d.mission;
  if (typeof m !== "object" || m === null) return null;
  const mission = m as Record<string, unknown>;
  if (typeof mission.id !== "string" || !isMissionStatus(mission.status)) return null;
  const stateVersion = typeof mission.stateVersion === "number" ? mission.stateVersion : NaN;
  if (!Number.isInteger(stateVersion)) return null;
  if (mission.jurisdiction !== "DL" && mission.jurisdiction !== "UP") return null;
  return {
    missionId: mission.id,
    displayRef: typeof mission.displayRef === "string" ? mission.displayRef : undefined,
    stateVersion,
    status: mission.status,
    jurisdiction: mission.jurisdiction,
    fareDetails: typeof mission.fareDetails === "object" && mission.fareDetails !== null ? (mission.fareDetails as ItemizedStatutoryFare) : undefined,
    replay: d.replay === true,
  };
}

// ---------------------------------------------------------------------------
// Snapshot reads (RLS): a mission row and the events after a sequence number
// ---------------------------------------------------------------------------

export interface MissionSnapshot {
  missionId: string;
  status: MissionStatus;
  stateVersion: number;
  displayRef?: string;
  vehicleType?: AIS125VehicleType;
  jurisdiction?: Jurisdiction;
  pickup?: GeoPoint;
  pickupAddress?: string;
  fareDetails?: ItemizedStatutoryFare;
}

/** A geography column comes back as GeoJSON or as EWKB hex depending on PostgREST config; accept both. */
export function parsePoint(value: unknown): GeoPoint | undefined {
  if (typeof value === "object" && value !== null) {
    const c = (value as { coordinates?: unknown }).coordinates;
    if (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number") return { longitude: c[0], latitude: c[1] };
    return undefined;
  }
  // EWKB point with SRID, little endian: 01 | 01000020 | E6100000 | x (8 bytes) | y (8 bytes)
  if (typeof value === "string" && /^0101000020E6100000[0-9a-fA-F]{32}$/.test(value)) {
    const read = (hex: string) => {
      const buf = new DataView(new ArrayBuffer(8));
      for (let i = 0; i < 8; i++) buf.setUint8(i, parseInt(hex.slice(i * 2, i * 2 + 2), 16));
      return buf.getFloat64(0, true);
    };
    return { longitude: read(value.slice(18, 34)), latitude: read(value.slice(34, 50)) };
  }
  return undefined;
}

export function parseMissionRow(row: unknown): MissionSnapshot | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  const version = r.state_version;
  if (typeof r.id !== "string" || !isMissionStatus(r.status) || typeof version !== "number" || !Number.isInteger(version)) return null;
  return {
    missionId: r.id,
    status: r.status,
    stateVersion: version,
    displayRef: typeof r.display_ref === "string" ? r.display_ref : undefined,
    vehicleType: typeof r.vehicle_type === "string" ? (r.vehicle_type as AIS125VehicleType) : undefined,
    jurisdiction: r.jurisdiction === "DL" || r.jurisdiction === "UP" ? r.jurisdiction : undefined,
    pickup: parsePoint(r.pickup_location),
    pickupAddress: typeof r.pickup_address === "string" ? r.pickup_address : undefined,
    fareDetails: typeof r.fare_details === "object" && r.fare_details !== null ? (r.fare_details as ItemizedStatutoryFare) : undefined,
  };
}

/** A `mission_events` row read through RLS, shaped as the wire message it was published as (so one translator serves both). */
export function parseEventRow(row: unknown): ParsedLifecycleMessage | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  return parseLifecycleMessage({
    event: r.event_type,
    seq: r.seq,
    state: r.to_status,
    data: r.metadata,
    eventId: r.id,
    timestamp: r.created_at,
  });
}

/** Rows in `seq` order with no hole: what "apply in order" (7.5 rule 3) may safely replay. */
export function contiguousFrom(messages: ParsedLifecycleMessage[], baseline: number): ParsedLifecycleMessage[] | null {
  let expected = baseline + 1;
  for (const m of messages) {
    if (m.seq !== expected) return null;
    expected += 1;
  }
  return messages;
}
