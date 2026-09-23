import type { CareLevel, GeoPoint } from "../types/index.ts";

export interface GoOnlinePayload {
  driverId: string;
  ambulanceId: string;
  careLevel: CareLevel;
  ais125CertPath: string;          // Storage path; must be non-empty AND verified server-side
  location: GeoPoint;               // position at shift start
  wentOnlineAt: string;              // ISO 8601
}

export interface GoOfflinePayload {
  driverId: string;
  reason?: "shift_end" | "break" | "vehicle_issue" | "other";
  wentOfflineAt: string;             // ISO 8601
}

export interface AcceptDispatchPayload {
  missionId: string;
  driverId: string;
  offerId: string;                   // correlates to the specific wave that offered this mission
  acceptedAt: string;                // ISO 8601
}

export interface DeclineDispatchPayload {
  missionId: string;
  driverId: string;
  offerId: string;
  reason?: "too_far" | "unavailable" | "wrong_care_level" | "other";
  declinedAt: string;                // ISO 8601
}

export interface ConfirmArrivalScenePayload {
  missionId: string;
  driverId: string;
  location: GeoPoint;
  arrivedAt: string;                 // ISO 8601
}

export interface ConfirmPatientOnboardPayload {
  missionId: string;
  driverId: string;
  destination: GeoPoint;             // hospital confirmed at this step
  onboardAt: string;                 // ISO 8601
}

export interface ConfirmArrivalHospitalPayload {
  missionId: string;
  driverId: string;
  location: GeoPoint;
  arrivedAt: string;                 // ISO 8601
}

export interface CompleteMissionPayload {
  missionId: string;
  driverId: string;
  finalFareInr: number;              // server-recomputed at completion; echoed for the receipt
  completedAt: string;               // ISO 8601
}

/**
 * Closes P02's own "Open Questions" gap: no driver-side event existed to
 * abort a mission already enRouteToPatient or later (e.g. the driver
 * backing out mid-mission via the UI, a vehicle breakdown). Returns the
 * driver to `standby`, not `offline` - aborting a mission is not the same
 * as ending the shift, and must not drop the driver's active shift session.
 */
export interface AbortMissionPayload {
  missionId: string;
  driverId: string;
  reason?: "driver_backed_out" | "vehicle_breakdown" | "other";
  abortedAt: string;                 // ISO 8601
}

export type DriverLifecycleEvent =
  | { type: "GO_ONLINE"; payload: GoOnlinePayload }
  | { type: "GO_OFFLINE"; payload: GoOfflinePayload }
  | { type: "ACCEPT_DISPATCH"; payload: AcceptDispatchPayload }
  | { type: "DECLINE_DISPATCH"; payload: DeclineDispatchPayload }
  | { type: "CONFIRM_ARRIVAL_SCENE"; payload: ConfirmArrivalScenePayload }
  | { type: "CONFIRM_PATIENT_ONBOARD"; payload: ConfirmPatientOnboardPayload }
  | { type: "CONFIRM_ARRIVAL_HOSPITAL"; payload: ConfirmArrivalHospitalPayload }
  | { type: "COMPLETE_MISSION"; payload: CompleteMissionPayload }
  | { type: "ABORT_MISSION"; payload: AbortMissionPayload };

export type DriverLifecycleMachineEvent =
  | DriverLifecycleEvent
  | { type: "SERVER_OFFER_RECEIVED"; payload: { offerId: string; missionId: string } }
  | { type: "SERVER_OFFER_TIMEOUT"; payload: { offerId: string } };

export type DriverLifecycleState =
  | "offline"
  | "standby"
  | "offered"
  | "enRouteToPatient"
  | "onScene"
  | "transporting"
  | "arrivedHospital";
