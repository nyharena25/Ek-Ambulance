# P02: Implement Patient Lifecycle State Machine and Domain Contracts

## Scope
Implement the pure TypeScript `patientLifecycle` state machine and its event-payload contracts in `packages/domain/src/state-machine/` using XState v5. Ensure absolute isolation from React Native or UI libraries, and implement comprehensive unit tests covering all legal transitions and illegal-transition rejections.

## Non-Goals
Do not import React Native, Expo, or React libraries into `packages/domain`. Do not wire the Zustand store in `apps/patient/src/state/` or build mobile UI screens (deferred to P06).

## Preconditions / Dependencies
P01 must be complete. Domain package structure and TypeScript compilation baseline must be active.

## Reference Contracts
Verbatim excerpt from architecture specification (§2):

```typescript
// packages/domain/src/state-machine/patientLifecycle.types.ts

export interface RequestEventPayload {
  patientId: string;                 // Supabase auth.users.id (uuid)
  pickup: GeoPoint;
  destination?: GeoPoint;            // optional at request time; may be set later
  careLevel: CareLevel;              // derived from triage, explicit at request time
  jurisdiction: Jurisdiction;
  requestedAt: string;               // ISO 8601
  idempotencyKey: string;            // uuid v4; server dedupes mission creation on this key
}

export interface SubmitTriagePayload {
  missionDraftId: string;            // client-generated uuid correlating triage -> REQUEST
  symptoms: TriageSymptomFlag[];     // 1..n flags, non-empty
  answeredAt: string;                // ISO 8601
  locale: "en" | "hi";
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
```

State Chart Specification:
```text
idle
  --SUBMIT_TRIAGE--> triaged
triaged
  --REQUEST--> requesting
  --CANCEL--> cancelled
requesting
  --CANCEL--> cancelled
  (server-driven, via mission-status Postgres Changes subscription:)
  --[mission.assigned]--> tracking
tracking
  --CANCEL--> cancelled            (guard: only allowed pre "on_scene", enforce server-side too)
  --[mission.completed]--> awaitingReceipt
awaitingReceipt
  --CONFIRM_RECEIPT--> receiptConfirmed (final)
cancelled (final)
```

## Files to Create/Modify
- `packages/domain/src/state-machine/patientLifecycle.types.ts`
- `packages/domain/src/state-machine/patientLifecycle.ts`
- `packages/domain/src/state-machine/__tests__/patientLifecycle.test.ts`
- `packages/domain/src/index.ts`

## Acceptance Criteria
- `packages/domain/src/state-machine/patientLifecycle.types.ts` contains the exact fields and union types specified in §2 without renaming or addition.
- Machine implementation uses XState v5 and represents states: `idle`, `triaged`, `requesting`, `tracking`, `awaitingReceipt`, `receiptConfirmed` (final), and `cancelled` (final).
- Server-driven transitions from `requesting -> tracking` and `tracking -> awaitingReceipt` are handled cleanly via `{ type: "SERVER_MISSION_ASSIGNED"; payload: { missionId: string } }` and `{ type: "SERVER_MISSION_COMPLETED"; payload: { missionId: string } }`.
- Unit tests in `patientLifecycle.test.ts` verify:
  1. `idle` transitions to `triaged` on `SUBMIT_TRIAGE`.
  2. `triaged` transitions to `requesting` on `REQUEST`.
  3. `triaged` transitions to `cancelled` on `CANCEL`.
  4. `requesting` transitions to `cancelled` on `CANCEL`.
  5. `requesting` transitions to `tracking` on `SERVER_MISSION_ASSIGNED`.
  6. `tracking` transitions to `cancelled` on `CANCEL`.
  7. `tracking` transitions to `awaitingReceipt` on `SERVER_MISSION_COMPLETED`.
  8. `awaitingReceipt` transitions to `receiptConfirmed` on `CONFIRM_RECEIPT`.
  9. Illegal transitions (e.g. `idle` receiving `REQUEST` or `CONFIRM_RECEIPT`, `cancelled` receiving any transition) are strictly rejected without state mutation.
- File imports zero packages from `react-native`, `expo`, or DOM APIs.

## Out of Scope
- Zustand wrapper implementation (`apps/patient/src/state/patientLifecycle.store.ts`), deferred to P06.
- Supabase Postgres Changes client subscription wiring, deferred to P06.
- Dispatch service machine implementation (`apps/dispatch-service/src/machine.ts`).

## Open Questions
- Client-side pre-`on_scene` check: Since `missions.status` is tracked server-side, the client state machine permits `CANCEL` while in `tracking`, relying on the dispatch service HTTP endpoint (`POST /missions/:id/cancel`) to return a 409/403 if the driver is already `on_scene`. Does the client machine require a specific rollback event (`CANCEL_REJECTED`) when optimistic cancellation fails?
