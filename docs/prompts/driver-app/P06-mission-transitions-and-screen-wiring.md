# P06: Implement Server-Authoritative Mission Transitions and Screen Wiring

## Scope
Wire `driverLifecycle.store.ts` (Zustand wrapper around the P02 XState machine) across the driver mobile screens (`(shift)/offer.tsx` and `mission/[id].tsx`). Implement `useMissionTransition.ts` with the explicit client-event-to-server-event mapping table. Enforce strict server-authoritative transitions with zero optimistic state changes: every button press disables immediately and awaits server confirmation (`{ ok: true }`) before advancing the local state machine.

## Non-Goals
Do NOT design or implement any client-side optimistic state transitions for mission milestones. Do not bypass the state machine transitions or invoke transitions out of sequence.

## Preconditions / Dependencies
Tasks P01, P02, P03, P04, and P05 must all be complete. State machine, presence manager, and Centrifugo channels must be active.

## Reference Contracts
Verbatim excerpt from architecture specification (§3.4):

```http
POST /missions/{id}/transition
Authorization: Bearer <supabase access_token>
Content-Type: application/json

{
  "event": "CONFIRM_ARRIVAL_SCENE"
}
```

"This is the **same route already implemented** in `apps/dispatch-service/src/routes/transition.ts` (Redis Redlock + Postgres advisory lock + XState `missionMachine` + `mission_audit_log` trigger). `useMissionTransition.ts` in the driver app is a thin client over this existing endpoint - it must not assume a new backend contract.

Success (200):
```json
{ "ok": true, "status": "on_scene" }
```

Error (409): invalid transition attempted:
```json
{ "error": "invalid_transition", "from": "requested" }
```

`useMissionTransition.ts` maps each `DriverLifecycleEvent` type (`CONFIRM_ARRIVAL_SCENE`, `CONFIRM_PATIENT_ONBOARD`, `CONFIRM_ARRIVAL_HOSPITAL`, `COMPLETE_MISSION`) to the corresponding server `event` string used by the existing `missionMachine` (`ON_SCENE`, `PATIENT_ON_BOARD`, `ARRIVED_HOSPITAL`, `COMPLETE` - note these server-side event names do NOT match the client `DriverLifecycleEvent.type` names one-to-one; the mapping table is part of the task spec deliverable, not an assumption to bake in silently)."

### Event Mapping Table (Client Event Type -> Server Event String)
| Client Event Type (`DriverLifecycleEvent`) | Server Event String (`POST /missions/:id/transition`) | Resulting Server Status |
| :--- | :--- | :--- |
| `CONFIRM_ARRIVAL_SCENE` | `"ON_SCENE"` | `on_scene` |
| `CONFIRM_PATIENT_ONBOARD` | `"PATIENT_ON_BOARD"` | `transporting` |
| `CONFIRM_ARRIVAL_HOSPITAL` | `"ARRIVED_HOSPITAL"` | `arrived_hospital` |
| `COMPLETE_MISSION` | `"COMPLETE"` | `completed` |

## Files to Create/Modify
- `apps/driver/src/state/driverLifecycle.store.ts`
- `apps/driver/src/hooks/useMissionTransition.ts`
- `apps/driver/app/(shift)/offer.tsx`
- `apps/driver/app/mission/[id].tsx`

## Acceptance Criteria
- `useMissionTransition.ts` implements the exact `CLIENT_TO_SERVER_EVENT_MAP` shown above.
- In `(shift)/offer.tsx`:
  - Tapping Accept disables button, posts to `/dispatch/offers/:offerId/accept`. Upon 200, sends `ACCEPT_DISPATCH` to store, transitions to `enRouteToPatient`, and routes to `/mission/[id]`.
  - Tapping Decline disables button, posts to `/dispatch/offers/:offerId/decline`, sends `DECLINE_DISPATCH`, transitions store back to `standby`, and dismisses modal.
- In `mission/[id].tsx`:
  - Renders a single primary action button corresponding to the current state:
    1. In `enRouteToPatient`: Button says "Confirm Arrival at Scene" (emits `CONFIRM_ARRIVAL_SCENE` -> `"ON_SCENE"`).
    2. In `onScene`: Button says "Confirm Patient Onboard" (emits `CONFIRM_PATIENT_ONBOARD` -> `"PATIENT_ON_BOARD"`).
    3. In `transporting`: Button says "Confirm Arrival at Hospital" (emits `CONFIRM_ARRIVAL_HOSPITAL` -> `"ARRIVED_HOSPITAL"`).
    4. In `arrivedHospital`: Button says "Complete Mission" (emits `COMPLETE_MISSION` -> `"COMPLETE"`).
  - Server-Authoritative Execution:
    - Button tap immediately enters loading state (`isTransitioning = true`) and disables interaction.
    - Local state does NOT change optimistically.
    - POST to `/missions/:id/transition` is executed.
    - Machine transitions ONLY upon receiving HTTP 200 `{ "ok": true }`.
    - If HTTP 409 (`invalid_transition`) is returned, the button re-enables, machine remains in current state, and an error dialog displays the mismatch.
  - Upon successful `COMPLETE_MISSION` transition, store state advances to `standby`, clearing active mission context and routing back to `/(shift)/standby`.

## Out of Scope
- Backend Redlock concurrency locks and PostgreSQL advisory lock implementation.
- Receipt PDF generation.

## Open Questions
- Network drop retry idempotency: If the mobile network disconnects after the driver taps a milestone button and before the HTTP 200 response is received, does `POST /missions/{id}/transition` accept an `Idempotency-Key` header to safely re-attempt the transition without risking duplicate transition rejections?
