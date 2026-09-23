# P06: Wire Patient Lifecycle Store to Booking Screens with Optimistic Rollback

## Scope
Wire `patientLifecycle.store.ts` (Zustand store wrapping the P02 XState machine) across the booking screens (`triage.tsx`, `confirm.tsx`, and `[id].tsx`). Implement client-initiated event dispatches (`SUBMIT_TRIAGE`, `REQUEST`, `CONFIRM_RECEIPT`), server-driven status transitions via Supabase Postgres Changes, and optimistic cancellation with automatic rollback upon server rejection.

## Non-Goals
Do not duplicate server-side cancellation validation rules client-side beyond disabling the cancel button when driver status is `on_scene`. Do not process in-app credit card or UPI payments in this task.

## Preconditions / Dependencies
Tasks P01, P02, P03, P04, and P05 must all be complete. The state machine, Centrifugo tracking hook, and pricing estimates must be operational.

## Reference Contracts
Verbatim excerpt from architecture specification (§2):

```typescript
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
```

"Note for Claude Code task specs: `REQUEST`, `SUBMIT_TRIAGE`, and `CANCEL` are client-initiated transitions sent to the Dispatch Service. Transitions from `requesting -> tracking` and `tracking -> awaitingReceipt` are server-driven, observed via the existing Postgres Changes subscription on `missions.status` - the client machine must have `on` handlers for these external events but never assumes them optimistically without server confirmation, except `CANCEL`, which is allowed to update optimistically and roll back on server rejection."

## Files to Create/Modify
- `apps/patient/src/state/patientLifecycle.store.ts`
- `apps/patient/app/booking/triage.tsx`
- `apps/patient/app/booking/confirm.tsx`
- `apps/patient/app/booking/[id].tsx`

## Acceptance Criteria
- `patientLifecycle.store.ts` initializes and wraps the XState actor from `packages/domain/src/state-machine/patientLifecycle.ts`.
- `triage.tsx` captures symptoms (`TriageSymptomFlag[]`), emits `SUBMIT_TRIAGE` with client-generated `missionDraftId`, transitions store to `triaged`, and navigates to `confirm.tsx`.
- `confirm.tsx` generates a UUID v4 `idempotencyKey`, constructs `RequestEventPayload`, emits `REQUEST`, transitions store to `requesting`, sends `POST /missions` to the gateway, and routes to `booking/[id].tsx`.
- Connects to Supabase Postgres Changes subscription on `missions` where `id = eq.[id]`:
  - Upon receiving status `assigned`, dispatches `{ type: "SERVER_MISSION_ASSIGNED", payload: { missionId } }` to transition machine to `tracking`.
  - Upon receiving status `completed`, dispatches `{ type: "SERVER_MISSION_COMPLETED", payload: { missionId } }` to transition machine to `awaitingReceipt`.
- When patient taps Cancel on `booking/[id].tsx`:
  - Store immediately transitions to `cancelled` optimistically.
  - Submits `POST /missions/:id/cancel` with `CancelPayload`.
  - If the server rejects with 409 Conflict (e.g. driver status is already `on_scene`), the store restores previous state (`tracking` or `requesting`) and notifies user with error description.
- Cancel button is disabled in the UI when the local driver state reflects `on_scene`.
- In `awaitingReceipt` state, `[id].tsx` allows patient to dispute or confirm fare, sending `POST /missions/:id/receipt` with `ConfirmReceiptPayload` and transitioning machine to `receiptConfirmed` (final).

## Out of Scope
- Server-side Postgres Changes trigger configuration in Supabase.
- PDF generation of mission receipts (handled by backend storage pipeline).

## Open Questions
- `CANCEL`'s guard against post-`on_scene` cancellation is asserted server-side only in Dispatch Service. Confirm whether the client store should preserve the cancellation reason in error telemetry if rollback occurs.
