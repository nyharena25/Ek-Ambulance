import type { AIS125VehicleType, CareLevel, GeoPoint, Jurisdiction, TriageSymptomFlag } from "../types/index.ts";
import type { TriageResult } from "../triage/index.ts";

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

export type PatientLifecycleMachineEvent =
  | PatientLifecycleEvent
  | { type: "SERVER_MISSION_ASSIGNED"; payload: { missionId: string } }
  | { type: "SERVER_DRIVER_ARRIVED"; payload: { missionId: string } }
  | { type: "SERVER_TRANSPORT_STARTED"; payload: { missionId: string } }
  | { type: "SERVER_MISSION_COMPLETED"; payload: { missionId: string } };

export type PatientLifecycleState =
  | "idle"
  | "triaged"
  | "requesting"
  | "tracking"
  | "transporting"
  | "awaitingReceipt"
  | "receiptConfirmed"
  | "cancelled";
