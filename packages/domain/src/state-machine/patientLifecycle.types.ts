import type { AIS125VehicleType, CareLevel, GeoPoint, Jurisdiction, TriageSymptomFlag } from "../types/index.ts";
import type { TriageResult } from "../triage/index.ts";
import type { ItemizedStatutoryFare } from "../pricing/index.ts";
import type {
  AssignedDriverInfo,
  MaskedCallInfo,
  MissionCancelledData,
  MissionCompletedData,
  MissionStatus,
  TransportDestination,
} from "../mission-channel/index.ts";

export interface RequestEventPayload {
  patientId: string;                 // Supabase auth.users.id (uuid)
  pickup: GeoPoint;
  destination?: GeoPoint;            // optional at request time; may be set later
  careLevel: CareLevel;              // derived from triage, explicit at request time
  vehicleType: AIS125VehicleType;    // the specific AIS-125 tier selected; careLevel alone
                                      // is ambiguous (both TYPE_B_PTA and TYPE_A_MFR map to "PTA")
  jurisdiction: Jurisdiction;
  requestedAt: string;               // ISO 8601
  idempotencyKey: string;            // uuid v4; server dedupes mission creation on this key
  distanceKm?: number;               // the routed distance the patient was quoted; defaults to DEFAULT_DISPATCH_DISTANCE_KM
}

export interface SubmitTriagePayload {
  missionDraftId: string;            // client-generated uuid correlating triage -> REQUEST
  symptoms: TriageSymptomFlag[];     // 1..n flags, non-empty
  answeredAt: string;                // ISO 8601
  locale: "en" | "hi";
  result: TriageResult;              // full computeTriageUrgency() output; downstream steps
                                      // (vehicle eligibility, statutory fare) read this rather
                                      // than re-deriving it from the scalar fields above
}

export interface CancelPayload {
  missionId: string;
  reason?: "changed_mind" | "found_alternative" | "duplicate_request" | "other";
  reasonNote?: string;               // REQUIRED if reason === "other", else omitted
  cancelledAt: string;               // ISO 8601
}

export interface ConfirmReceiptPayload {
  missionId: string;
  receiptId: string;                 // Storage object path: receipts/{patientId}/{missionId}.pdf
  confirmedAt: string;               // ISO 8601
  disputeFlag: boolean;              // true if patient contests the fare shown
}

export type PatientLifecycleEvent =
  | { type: "SUBMIT_TRIAGE"; payload: SubmitTriagePayload }
  | { type: "REQUEST"; payload: RequestEventPayload }
  | { type: "CANCEL"; payload: CancelPayload }
  | { type: "CONFIRM_RECEIPT"; payload: ConfirmReceiptPayload };

/** Snapshot of a mission as the server holds it (RLS read of `missions`), used to jump a machine forward (7.5 rule 5). */
export interface PatientHydratePayload {
  missionId: string;
  status: MissionStatus;
  vehicleType?: AIS125VehicleType;
  jurisdiction?: Jurisdiction;
  pickup?: GeoPoint;
  fareDetails?: ItemizedStatutoryFare;
  /** The crew from the mission's stored DRIVER_ACCEPTED event, so a reopened app shows who is coming. */
  driver?: AssignedDriverInfo;
  /** The hospital from the stored TRANSPORT_STARTED event (written by the server from missions.destination_hospital_id). */
  destination?: TransportDestination;
  /** The server's final fare from the stored MISSION_COMPLETED event; absent until the mission completed. */
  completion?: MissionCompletedData;
  /** Who/why from the stored MISSION_CANCELLED event (e.g. reason no_ambulance_available), so a reopened app shows it. */
  cancellation?: MissionCancelledData;
}

/**
 * Every payload field beyond `missionId` is optional: a pre-v1 publisher sends none of them, and the UI then omits the
 * field instead of showing a made-up one (P-UX-05). The mission id is always the one the subscription is mounted for.
 */
export type PatientLifecycleMachineEvent =
  | PatientLifecycleEvent
  | { type: "SERVER_MISSION_CREATED"; payload: { missionId: string } }
  | { type: "SERVER_MISSION_ASSIGNED"; payload: { missionId: string; driver?: AssignedDriverInfo; maskedCall?: MaskedCallInfo; etaMinutes?: number } }
  | { type: "SERVER_DRIVER_ARRIVED"; payload: { missionId: string } }
  | { type: "SERVER_TRANSPORT_STARTED"; payload: { missionId: string; destination?: TransportDestination; etaMinutes?: number; wardStatus?: string } }
  | { type: "SERVER_HOSPITAL_ARRIVED"; payload: { missionId: string } }
  | { type: "SERVER_MISSION_COMPLETED"; payload: { missionId: string; completion?: MissionCompletedData } }
  | { type: "SERVER_DRIVER_RELEASED"; payload: { missionId: string } }
  | { type: "SERVER_MISSION_CANCELLED"; payload: { missionId: string } & MissionCancelledData }
  | { type: "HYDRATE"; payload: PatientHydratePayload };

export type PatientLifecycleState =
  | "idle"
  | "triaged"
  | "requesting"
  | "tracking"
  | "transporting"
  | "awaitingReceipt"
  | "receiptConfirmed"
  | "cancelled";
