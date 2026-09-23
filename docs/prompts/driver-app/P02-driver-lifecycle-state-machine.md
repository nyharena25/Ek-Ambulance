# P02: Implement Driver Lifecycle State Machine and Domain Contracts

## Scope
Implement the pure TypeScript `driverLifecycle` state machine and its event-payload contracts in `packages/domain/src/state-machine/` using XState v5. Ensure absolute isolation from React Native or UI libraries, implement the mandatory `ais125CertPath` guard on `GO_ONLINE`, and build comprehensive unit tests covering all valid transitions and illegal-transition rejections.

## Non-Goals
Do not import React Native, Expo, or React libraries into `packages/domain`. Do not wire the Zustand store in `apps/driver/src/state/` or build mobile UI screens (deferred to P06).

## Preconditions / Dependencies
P01 must be complete. Domain package structure and TypeScript compilation baseline must be active.

## Reference Contracts
Verbatim excerpt from architecture specification (§2):

```typescript
// packages/domain/src/state-machine/driverLifecycle.types.ts

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

export type DriverLifecycleEvent =
  | { type: "GO_ONLINE"; payload: GoOnlinePayload }
  | { type: "GO_OFFLINE"; payload: GoOfflinePayload }
  | { type: "ACCEPT_DISPATCH"; payload: AcceptDispatchPayload }
  | { type: "DECLINE_DISPATCH"; payload: DeclineDispatchPayload }
  | { type: "CONFIRM_ARRIVAL_SCENE"; payload: ConfirmArrivalScenePayload }
  | { type: "CONFIRM_PATIENT_ONBOARD"; payload: ConfirmPatientOnboardPayload }
  | { type: "CONFIRM_ARRIVAL_HOSPITAL"; payload: ConfirmArrivalHospitalPayload }
  | { type: "COMPLETE_MISSION"; payload: CompleteMissionPayload };
```

State Chart Specification:
```text
offline
  --GO_ONLINE [guard: ais125CertPath is set AND verified]--> standby
standby
  --GO_OFFLINE--> offline
  --[dispatch.offer received on driver:{id}:offers]--> offered
offered
  --ACCEPT_DISPATCH--> enRouteToPatient
  --DECLINE_DISPATCH--> standby
  --[offer timeout, server-driven]--> standby
enRouteToPatient
  --CONFIRM_ARRIVAL_SCENE--> onScene
onScene
  --CONFIRM_PATIENT_ONBOARD--> transporting
transporting
  --CONFIRM_ARRIVAL_HOSPITAL--> arrivedHospital
arrivedHospital
  --COMPLETE_MISSION--> standby   (mission closed, receipt issued, driver available again)
```

## Files to Create/Modify
- `packages/domain/src/state-machine/driverLifecycle.types.ts`
- `packages/domain/src/state-machine/driverLifecycle.ts`
- `packages/domain/src/state-machine/__tests__/driverLifecycle.test.ts`
- `packages/domain/src/index.ts`

## Acceptance Criteria
- `packages/domain/src/state-machine/driverLifecycle.types.ts` contains the exact fields and union types specified in §2 without renaming or addition.
- Machine implementation uses XState v5 and represents states: `offline`, `standby`, `offered`, `enRouteToPatient`, `onScene`, `transporting`, and `arrivedHospital`.
- Guard on `GO_ONLINE` checks that `payload.ais125CertPath.trim().length > 0`; invalid or empty paths prevent transition to `standby` and retain `offline`.
- Server-driven transitions from `standby -> offered` and `offered -> standby` are handled via typed internal events `{ type: "SERVER_OFFER_RECEIVED"; payload: { offerId: string; missionId: string } }` and `{ type: "SERVER_OFFER_TIMEOUT"; payload: { offerId: string } }`.
- Unit tests in `driverLifecycle.test.ts` verify:
  1. `offline` transitions to `standby` on `GO_ONLINE` with valid `ais125CertPath`.
  2. `offline` rejects `GO_ONLINE` with empty `ais125CertPath`.
  3. `standby` transitions to `offline` on `GO_OFFLINE`.
  4. `standby` transitions to `offered` on `SERVER_OFFER_RECEIVED`.
  5. `offered` transitions to `enRouteToPatient` on `ACCEPT_DISPATCH`.
  6. `offered` transitions to `standby` on `DECLINE_DISPATCH`.
  7. `offered` transitions to `standby` on `SERVER_OFFER_TIMEOUT`.
  8. `enRouteToPatient` transitions to `onScene` on `CONFIRM_ARRIVAL_SCENE`.
  9. `onScene` transitions to `transporting` on `CONFIRM_PATIENT_ONBOARD`.
  10. `transporting` transitions to `arrivedHospital` on `CONFIRM_ARRIVAL_HOSPITAL`.
  11. `arrivedHospital` transitions to `standby` on `COMPLETE_MISSION` (driver available again).
  12. Rejection of illegal transitions: any transition attempted while in `offline` (other than `GO_ONLINE`) is strictly rejected.
- File imports zero packages from `react-native`, `expo`, or DOM APIs.

## Out of Scope
- Zustand wrapper implementation (`apps/driver/src/state/driverLifecycle.store.ts`), deferred to P06.
- Centrifugo dispatch offer channel subscription, deferred to P05.
- Dispatch service machine implementation (`apps/dispatch-service/src/machine.ts`).

## Open Questions
- Missing driver-side abort event: The current contract has no driver-side abort event once a mission is `enRouteToPatient` or later (only the patient's `CANCEL` can end a mission after assignment, per `patientLifecycle.ts`). If real-world ambulance operations require handling vehicle breakdown, flat tire, or accident mid-mission, what explicit event (e.g. `ABORT_MISSION` or `REPORT_VEHICLE_BREAKDOWN`) should be introduced to transition the driver to `offline` and trigger dispatch re-routing?
