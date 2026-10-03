import {
  estimateClockOffsetMs,
  isMissionStatus,
  isUuid,
  parseDispatchOffer,
  parseLifecycleMessage,
  parseOfferRevoked,
  readMissionCancelled,
  type DispatchOffer,
  type DispatchOfferRevoked,
  type DriverLifecycleMachineEvent,
  type GeoPoint,
  type MissionCancelledData,
  type MissionStatus,
  type OnboardVitals,
} from "@sahayak/domain";
import type { QueuedTelemetryPing } from "../types/driverConnection.types.ts";

/**
 * Pure half of the driver's server contract (DATA_AND_SYNC_SPECIFICATION.md 6.4.5, 7.5): which server call a machine event
 * needs, whether it may be sent at all, and how channel publications are routed. No I/O, so every refusal below is unit-tested.
 * The rule these enforce (7.5 rule 1): the machine advances on the server's 200, never on the driver's tap.
 */

export type ServerCall =
  | { rpc: "accept_offer"; args: { p_offer_id: string; p_client_event_id: string } }
  | { rpc: "claim_emergency"; args: { p_mission_id: string; p_client_event_id: string } }
  | { rpc: "decline_offer"; args: { p_offer_id: string; p_reason: string } }
  | { rpc: "transition_mission"; args: { p_mission_id: string; p_event: string; p_payload: Record<string, unknown>; p_client_event_id: string } };

/** `call: null` means the event is local only (go online/offline, server-originated events). `ok: false` means do NOT send. */
export type CallBuild = { ok: true; call: ServerCall | null } | { ok: false; code: string };

const DECLINE_REASONS = new Set(["too_far", "vehicle_issue", "patient_onboard", "break", "other"]);

/** The UI's reasons and the older domain values map onto the server's set; anything unknown becomes `other`. */
export function serverDeclineReason(reason: string | undefined): string {
  if (reason && DECLINE_REASONS.has(reason)) return reason;
  if (reason === "unavailable") return "vehicle_issue";
  return "other";
}

const RANGES: Record<keyof OnboardVitals, [number, number]> = {
  pulse: [0, 300],
  spO2: [0, 100],
  systolic: [40, 300],
  diastolic: [20, 200],
  gcs: [3, 15],
};

/** Keeps only readings that were entered and are finite; blank stays absent (never 0). Null when a value is out of range. */
export function sanitizeVitals(vitals: OnboardVitals | undefined): OnboardVitals | undefined | null {
  if (!vitals) return undefined;
  const out: OnboardVitals = {};
  for (const key of Object.keys(RANGES) as Array<keyof OnboardVitals>) {
    const value = vitals[key];
    if (value === undefined || value === null || !Number.isFinite(value)) continue;
    const [lo, hi] = RANGES[key];
    if (value < lo || value > hi) return null;
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function buildServerCall(event: DriverLifecycleMachineEvent, clientEventId: string): CallBuild {
  switch (event.type) {
    case "ACCEPT_DISPATCH":
      // From the Booking board no wave offered the mission, so the server claims it by mission id rather than by offer id.
      if (event.payload.source === "board") {
        if (!isUuid(event.payload.missionId)) return { ok: false, code: "invalid_mission" };
        return { ok: true, call: { rpc: "claim_emergency", args: { p_mission_id: event.payload.missionId, p_client_event_id: clientEventId } } };
      }
      if (!isUuid(event.payload.offerId)) return { ok: false, code: "invalid_offer" };
      return { ok: true, call: { rpc: "accept_offer", args: { p_offer_id: event.payload.offerId, p_client_event_id: clientEventId } } };

    case "DECLINE_DISPATCH":
      if (!isUuid(event.payload.offerId)) return { ok: true, call: null };
      return { ok: true, call: { rpc: "decline_offer", args: { p_offer_id: event.payload.offerId, p_reason: serverDeclineReason(event.payload.reason) } } };

    case "CONFIRM_ARRIVAL_SCENE":
      return transition(event.payload.missionId, "ON_SCENE", { location: event.payload.location, arrivedAt: event.payload.arrivedAt }, clientEventId);

    case "CONFIRM_PATIENT_ONBOARD": {
      const p = event.payload;
      // Missing and malformed are different failures: a non-uuid here is a stale client list (a display name or preset id), never a choice.
      if (typeof p.hospitalId !== "string" || p.hospitalId.trim() === "") return { ok: false, code: "hospital_required" };
      if (!isUuid(p.hospitalId)) return { ok: false, code: "invalid_hospital_id" };
      const vitals = sanitizeVitals(p.vitals);
      if (vitals === null) return { ok: false, code: "invalid_vitals" };
      return transition(
        p.missionId,
        "PATIENT_ON_BOARD",
        { hospitalId: p.hospitalId, onboardAt: p.onboardAt, ...(vitals ? { vitals } : {}), ...(p.emergencyType ? { emergencyType: p.emergencyType } : {}), ...(p.bypass !== undefined ? { bypass: p.bypass } : {}) },
        clientEventId
      );
    }

    case "CONFIRM_ARRIVAL_HOSPITAL":
      return transition(event.payload.missionId, "ARRIVED_HOSPITAL", { arrivedAt: event.payload.arrivedAt, location: event.payload.location }, clientEventId);

    case "COMPLETE_MISSION": {
      const h = event.payload.handoff;
      // D-UX-03: a statutory sign-off is never completed with blank physician details.
      if (!h || !h.physicianName.trim() || !h.registrationNumber.trim() || !h.department.trim()) return { ok: false, code: "handoff_incomplete" };
      return transition(event.payload.missionId, "COMPLETE", { completedAt: event.payload.completedAt, handoff: h }, clientEventId);
    }

    case "ABORT_MISSION":
      return transition(event.payload.missionId, "ABORT", { reason: event.payload.reason ?? "other" }, clientEventId);

    default:
      return { ok: true, call: null };
  }
}

function transition(missionId: string, event: string, payload: Record<string, unknown>, clientEventId: string): CallBuild {
  if (!isUuid(missionId)) return { ok: false, code: "invalid_mission" };
  return { ok: true, call: { rpc: "transition_mission", args: { p_mission_id: missionId, p_event: event, p_payload: payload, p_client_event_id: clientEventId } } };
}

/**
 * What the driver is told when the server refused a call. Never implies the action happened. `status` splits the server's
 * `invalid_hospital`: PT422 = the id is not a uuid, PT409 = no active registered hospital has that id (unknown or deactivated).
 */
export function driverErrorMessage(code: string, status?: number): string {
  if (code === "invalid_hospital" && status === 422) code = "invalid_hospital_id";
  if (code === "invalid_hospital" && status === 409) code = "hospital_unavailable";
  const messages: Record<string, string> = {
    offer_taken: "Another crew accepted this mission first.",
    offer_expired: "This offer has expired.",
    offer_declined: "You declined this offer.",
    mission_cancelled: "This request was cancelled.",
    profile_loading: "Your profile is still loading. Try again in a moment.",
    not_eligible: "You were not offered this mission.",
    not_verified: "Your KYC is not approved yet. You can go online once it is approved.",
    driver_profile_missing: "Finish your driver application first (Profile → Complete driver application).",
    invalid_location: "Your GPS location is not valid yet. Wait a moment and try again.",
    unauthenticated: "Your session has ended. Sign in again.",
    already_on_mission: "You already have an active mission.",
    not_in_range: "This emergency is no longer within your range.",
    not_online: "Go online and wait for your location to update before taking an emergency.",
    profile_locked: "Your profile cannot be changed during an emergency.",
    kyc_locked: "Plate and vehicle model are verified documents. Contact support to change them.",
    registration_in_use: "That registration number belongs to another vehicle.",
    invalid_name: "Enter your full name (2 to 80 characters).",
    invalid_registration: "Enter a valid registration number.",
    invalid_crew_count: "Crew size must be between 1 and 12.",
    invalid_hospital: "That hospital is not available. Choose another.",
    invalid_transition: "The mission is no longer in that state. Refreshing.",
    not_found: "This mission is no longer assigned to you.",
    hospital_required: "Choose a destination hospital before starting transport.",
    invalid_hospital_id: "This hospital entry has no valid registered ID, so nothing was sent. Reload the hospital list; if this keeps happening, update the app.",
    hospital_unavailable: "That hospital is no longer registered or active. The list has been refreshed - choose another.",
    forbidden: "You are not allowed to do this for this mission.",
    hospital_at_capacity: "That hospital has no capacity. Choose another.",
    invalid_vitals: "A vital sign is outside the allowed range. Check the values.",
    handoff_incomplete: "Enter the receiving physician's name, registration number and department.",
    network: "No connection. The action was NOT recorded. Try again.",
    multiple_active_missions: "Your account shows more than one active mission. Contact dispatch before continuing.",
  };
  return messages[code] ?? "The server could not record that action. Try again.";
}

// ---------------------------------------------------------------------------
// Hospitals: the registered catalog (`hospitals`, RLS hospitals_select_active). The canonical `id` is what the server takes
// for the handoff; the name and position are for display and distance only.
// ---------------------------------------------------------------------------

export interface CatalogHospital {
  id: string;
  name: string;
  nameHi?: string;
  zone?: "DL" | "UP";
  coordinates: GeoPoint;
  category?: "GOVERNMENT" | "PRIVATE";
  /** 1-3 as registered; absent when unknown. */
  traumaLevel?: number;
  /** As registered; empty means not recorded, never "treats nothing". */
  specialities: string[];
  /** Server-computed total - held beds. */
  availableCapacity?: number;
}

export const HOSPITAL_CATALOG_COLUMNS = "id,name,name_hi,zone,location,category,trauma_level,specialities,available_capacity";

/**
 * A geography POINT as PostgREST returns it: EWKB hex by default (what a plain `select` gets), GeoJSON when asked for.
 * Anything else (another geometry type, bad hex) is null.
 */
export function readPoint(value: unknown): GeoPoint | null {
  if (typeof value === "string") {
    if (value.length < 42 || !/^([0-9a-fA-F]{2})+$/.test(value)) return null;
    const bytes = new Uint8Array(value.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(value.slice(i * 2, i * 2 + 2), 16);
    const view = new DataView(bytes.buffer);
    const le = bytes[0] === 1;
    const type = view.getUint32(1, le);
    const at = type & 0x20000000 ? 9 : 5; // EWKB SRID flag: 4 SRID bytes sit before the coordinates
    if ((type & 0xffff) !== 1 || bytes.length < at + 16) return null;
    const longitude = view.getFloat64(at, le);
    const latitude = view.getFloat64(at + 8, le);
    return Number.isFinite(longitude) && Number.isFinite(latitude) ? { longitude, latitude } : null;
  }
  const c = (value as { coordinates?: unknown } | null)?.coordinates;
  return Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number" ? { longitude: c[0], latitude: c[1] } : null;
}

/** One catalog row, or null when it has no canonical id, name or position (never shown, so never submitted). */
export function parseCatalogHospital(row: unknown): CatalogHospital | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  const coordinates = readPoint(r.location);
  if (!isUuid(r.id) || typeof r.name !== "string" || r.name.trim() === "" || !coordinates) return null;
  return {
    id: r.id,
    name: r.name,
    ...(typeof r.name_hi === "string" && r.name_hi.trim() !== "" ? { nameHi: r.name_hi } : {}),
    ...(r.zone === "DL" || r.zone === "UP" ? { zone: r.zone } : {}),
    coordinates,
    ...(r.category === "GOVERNMENT" || r.category === "PRIVATE" ? { category: r.category } : {}),
    ...(typeof r.trauma_level === "number" ? { traumaLevel: r.trauma_level } : {}),
    specialities: Array.isArray(r.specialities) ? r.specialities.filter((x): x is string => typeof x === "string") : [],
    ...(typeof r.available_capacity === "number" ? { availableCapacity: r.available_capacity } : {}),
  };
}

export interface AssignedMissionRow {
  missionId: string;
  status: MissionStatus;
  pickup?: GeoPoint;
  /** missions.destination_hospital_id once transport started: the hospital is reloaded from this, never from a name. */
  destinationHospitalId?: string;
  /** The mission's public reference (missions.display_ref), never the patient's identity. */
  displayRef?: string;
  pickupAddress?: string;
  /** The registered hospital's name, read through the foreign key (null when it is no longer active). */
  destinationName?: string;
}

/** The driver's own active missions: same rule as public._driver_on_mission and missions_one_active_per_driver. */
export const ASSIGNED_MISSION_COLUMNS = "id,status,display_ref,pickup_address,pickup_location,destination_hospital_id,destination:hospitals(name)";

/** A `missions` row read through RLS (`missions_select_driver`: only the caller's own assigned mission). */
export function parseAssignedMissionRow(row: unknown): AssignedMissionRow | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as { id?: unknown; status?: unknown; pickup_location?: unknown; destination_hospital_id?: unknown; display_ref?: unknown; pickup_address?: unknown; destination?: { name?: unknown } | null };
  if (typeof r.id !== "string" || !isMissionStatus(r.status)) return null;
  const text = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v : undefined);
  const displayRef = text(r.display_ref);
  const pickupAddress = text(r.pickup_address);
  const destinationName = text(r.destination?.name);
  return {
    missionId: r.id,
    status: r.status,
    pickup: readPoint(r.pickup_location) ?? undefined,
    ...(isUuid(r.destination_hospital_id) ? { destinationHospitalId: r.destination_hospital_id } : {}),
    ...(displayRef ? { displayRef } : {}),
    ...(pickupAddress ? { pickupAddress } : {}),
    ...(destinationName ? { destinationName } : {}),
  };
}

/**
 * The answer to "which mission is this driver on?". `data: null` is reserved for a real "none": a row that cannot be read is
 * an error (it must never end a live mission), and more than one is an integrity error - never silently one of them.
 */
export function readAssignedMissions(rows: unknown): { ok: true; data: AssignedMissionRow | null } | { ok: false; error: { code: string; status: number; detail?: string; retryable: boolean } } {
  if (!Array.isArray(rows)) return { ok: false, error: { code: "invalid_response", status: 0, retryable: true } };
  if (rows.length > 1) {
    const ids = rows.map((r) => (r as { id?: unknown } | null)?.id).filter((id): id is string => typeof id === "string");
    return { ok: false, error: { code: "multiple_active_missions", status: 0, detail: ids.join(","), retryable: false } };
  }
  if (rows.length === 0) return { ok: true, data: null };
  const row = parseAssignedMissionRow(rows[0]);
  return row ? { ok: true, data: row } : { ok: false, error: { code: "invalid_response", status: 0, retryable: true } };
}

// ---------------------------------------------------------------------------
// Telemetry upload (7.7): the acknowledged batch, deduplicated server-side by (mission, driver, recorded_at).
// ---------------------------------------------------------------------------

export function toIngestPings(pings: QueuedTelemetryPing[]): Array<Record<string, unknown>> {
  return pings.map((p) => ({
    latitude: p.latitude,
    longitude: p.longitude,
    timestamp: p.timestamp,
    ...(p.heading !== undefined ? { heading: p.heading } : {}),
    ...(p.speed !== undefined ? { speed: p.speed } : {}),
    ...(p.accuracy !== undefined ? { accuracy: p.accuracy } : {}),
    ...(p.recordedInDeadZone ? { deadZone: true } : {}),
  }));
}

/** True only when the server acknowledged (or permanently rejected) every ping sent, so the queue may drop them (D-UX-08). */
export function batchFullyAcknowledged(sent: number, result: unknown): boolean {
  const r = result as { acknowledged?: unknown; rejected?: unknown } | null;
  if (!r || typeof r.acknowledged !== "number" || typeof r.rejected !== "number") return false;
  return r.acknowledged + r.rejected >= sent;
}

// ---------------------------------------------------------------------------
// Channel routing. Both run inside a socket callback: nothing here throws, unknown messages are ignored (G-18).
// ---------------------------------------------------------------------------

export interface OfferHandlers {
  onOffer: (offer: DispatchOffer, clockOffsetMs: number) => void;
  onRevoked: (revoked: DispatchOfferRevoked) => void;
}

/** Rule 11: the clock offset is measured from the offer's own `issuedAt` at the moment it arrives. */
export function routeOfferPublication(data: unknown, nowMs: number, handlers: OfferHandlers): void {
  try {
    const revoked = parseOfferRevoked(data);
    if (revoked) return handlers.onRevoked(revoked);
    const offer = parseDispatchOffer(data);
    if (offer) handlers.onOffer(offer, estimateClockOffsetMs(offer.issuedAt, nowMs));
  } catch {
    // ignored by design
  }
}

/** list_open_offers(): the offers still open for this driver, plus the server/device clock offset to count them down with. */
export function parseOpenOffers(data: unknown, nowMs: number): { offers: DispatchOffer[]; clockOffsetMs: number } | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as { ok?: unknown; serverNow?: unknown; items?: unknown };
  if (d.ok !== true || !Array.isArray(d.items)) return null;
  const serverNow = typeof d.serverNow === "string" ? Date.parse(d.serverNow) : NaN;
  return {
    offers: d.items.map(parseDispatchOffer).filter((o): o is DispatchOffer => o !== null),
    clockOffsetMs: Number.isNaN(serverNow) ? 0 : serverNow - nowMs,
  };
}

export interface MissionWatchHandlers {
  onCancelled: (info: MissionCancelledData & { seq?: number }) => void;
}

/** The driver only needs one thing from mission:{id}: that the server ended the mission under them (G-05). */
export function routeMissionPublication(data: unknown, handlers: MissionWatchHandlers): void {
  try {
    const message = parseLifecycleMessage(data);
    if (message?.event === "MISSION_CANCELLED") handlers.onCancelled({ ...readMissionCancelled(message.data), seq: message.seq });
  } catch {
    // ignored by design
  }
}
