import type { CareLevel, GeoPoint } from "../types/index.ts";
import type { CancelledBy, MissionStatus } from "../mission-channel/index.ts";

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
  /** "board": taken from the Booking list, where no wave offered it, so the server claims by mission rather than by offer. */
  source?: "board";
}

export interface DeclineDispatchPayload {
  missionId: string;
  driverId: string;
  offerId: string;
  reason?: "too_far" | "vehicle_issue" | "patient_onboard" | "break" | "unavailable" | "wrong_care_level" | "other";
  declinedAt: string;                // ISO 8601
}

export interface ConfirmArrivalScenePayload {
  missionId: string;
  driverId: string;
  location: GeoPoint;
  arrivedAt: string;                 // ISO 8601
}

/** Clinical readings the crew actually entered. A reading left blank is absent, never coerced to 0 (D-UX-05). */
export interface OnboardVitals {
  pulse?: number;                    // 0-300
  spO2?: number;                     // 0-100
  systolic?: number;                 // 40-300
  diastolic?: number;                // 20-200
  gcs?: number;                      // 3-15
}

export interface ConfirmPatientOnboardPayload {
  missionId: string;
  driverId: string;
  destination: GeoPoint;             // hospital confirmed at this step
  /** `hospitals.id` of the destination. Required by the server, which takes the bed hold (G-22). */
  hospitalId?: string;
  onboardAt: string;                 // ISO 8601
  vitals?: OnboardVitals;
  emergencyType?: string;
  bypass?: boolean;
}

export interface ConfirmArrivalHospitalPayload {
  missionId: string;
  driverId: string;
  location: GeoPoint;
  arrivedAt: string;                 // ISO 8601
}

/** The receiving physician's sign-off (5.6). Free text and booleans entered by the crew; never pre-filled (D-UX-03). */
export interface HandoffSignOff {
  physicianName: string;
  registrationNumber: string;
  department: string;
  emtSigned: boolean;
  checklist: { bedReady: boolean; ventilatorReady: boolean; emrHanded: boolean };
}

export interface CompleteMissionPayload {
  missionId: string;
  driverId: string;
  /** Computed by the server at completion and never taken from the driver (6.4.3); only echoed to the receipt view. */
  finalFareInr?: number;
  completedAt: string;               // ISO 8601
  handoff?: HandoffSignOff;
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

/** Snapshot of the driver's assigned mission (RLS read of `missions`), used to resume after a process kill (7.6). */
export interface DriverHydratePayload {
  missionId: string;
  status: MissionStatus;
  driverId?: string;
}

export type DriverLifecycleMachineEvent =
  | DriverLifecycleEvent
  | { type: "SERVER_OFFER_RECEIVED"; payload: { offerId: string; missionId: string } }
  | { type: "SERVER_OFFER_TIMEOUT"; payload: { offerId: string } }
  /** Another driver took the mission, the patient cancelled, or the wave expired (6.4.4). */
  | { type: "SERVER_OFFER_REVOKED"; payload: { offerId: string; reason: "taken" | "cancelled" | "expired" } }
  /** The mission ended on the server while this driver held it (patient cancel, system cancel). Was unmodelled (7.2). */
  | { type: "SERVER_MISSION_CANCELLED"; payload: { missionId: string; cancelledBy?: CancelledBy; reason?: string } }
  | { type: "HYDRATE"; payload: DriverHydratePayload };

export type DriverLifecycleState =
  | "offline"
  | "standby"
  | "offered"
  | "enRouteToPatient"
  | "onScene"
  | "transporting"
  | "arrivedHospital";
