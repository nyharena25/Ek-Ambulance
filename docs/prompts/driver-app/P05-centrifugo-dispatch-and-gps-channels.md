# P05: Implement Centrifugo Dispatch Offer Channel and Throttled GPS Publisher

## Scope
Implement `useDispatchOfferChannel.ts` for receiving real-time wave dispatch offers and `useGpsPublisher.ts` for publishing throttled driver telemetry to Centrifugo. Build the `(shift)/offer.tsx` modal screen to accept or decline incoming mission offers. Enforce the two distinct channel scopes, token renewal on reconnect, and strict 1 message / 3 seconds GPS throttling during active mission states.

## Non-Goals
Do not publish GPS coordinates when the driver is offline or in `standby`. Do not invent undocumented fields for the incoming dispatch offer payload.

## Preconditions / Dependencies
Tasks P01, P02, P03, and P04 must be complete. Centrifugo client library and verified driver session must be operational.

## Reference Contracts
Verbatim excerpt from architecture specification (§3.2):

**(a) Dispatch offer channel: driver SUBSCRIBES**
```http
POST /realtime/token
Authorization: Bearer <supabase access_token>
Content-Type: application/json

{
  "scope": "driver:{driverId}:offers"
}
```

Success (200):
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "channel": "driver:9f2c...-uuid:offers"
}
```

"The gateway MUST reject (403) if the caller's `sub` does not equal `{driverId}` in the scope. This channel receives `dispatch.offer` events pushed by the Dispatch Service when a wave includes this driver; the payload shape for that push is out of scope here - it belongs to a Dispatch Service task spec, not this one. Flag it as an Open Question if `useDispatchOfferChannel.ts` needs it and it is not yet documented."

**(b) Mission GPS channel: driver PUBLISHES**
```http
POST /realtime/token
Authorization: Bearer <supabase access_token>
Content-Type: application/json

{
  "scope": "mission:{missionId}",
  "role": "publisher"
}
```

Success (200):
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "channel": "mission:9f2c...-uuid",
  "publish": true
}
```

"The gateway MUST reject (403) unless the caller's `sub` equals `missions.driver_id` for that mission AND the mission's `status` is one of `assigned`, `en_route`, `on_scene`, `transporting` (no GPS publishing before acceptance or after completion). The signed JWT claims carry an additional `publish: true` claim so the Centrifugo channel-permission config can distinguish this token (publish-allowed) from the patient's read-only token on the same channel name.

`useGpsPublisher.ts` throttles publishes to ~1 message / 3 seconds, matching the throttle already used server-side in the mission-channel design, and MUST request a fresh token on reconnect exactly like `useMissionChannel.ts` in the patient app."

## Files to Create/Modify
- `apps/driver/src/hooks/useDispatchOfferChannel.ts`
- `apps/driver/src/hooks/useGpsPublisher.ts`
- `apps/driver/app/(shift)/offer.tsx`

## Acceptance Criteria
- `useDispatchOfferChannel.ts`:
  - Connects to Centrifugo and subscribes to channel `driver:{driverId}:offers` using signed token from `/realtime/token`.
  - Configures `getToken` callback so any reconnect acquires a fresh channel token.
  - Emits `SERVER_OFFER_RECEIVED` when an offer arrives, transitioning store to `offered` and presenting `(shift)/offer.tsx`.
  - Cleans up subscriptions and closes client upon unmount.
- `(shift)/offer.tsx`:
  - Displays offer details, countdown timer (e.g. 15-30s wave window), care level, and distance.
  - If countdown expires before action, emits `SERVER_OFFER_TIMEOUT` and dismisses back to `standby`.
- `useGpsPublisher.ts`:
  - Requests token with `"role": "publisher"` for scope `mission:{missionId}`.
  - Verifies presence of `publish: true` in response.
  - Uses `expo-location` to capture position.
  - Throttles telemetry publishes to Centrifugo channel `mission:{missionId}` to no more than 1 publish every 3 seconds.
  - Active only when `isPublishingActive === true` (mission states: `enRouteToPatient`, `onScene`, `transporting`).
  - Completely halts location capture and closes publication channel upon mission completion or component unmount.

## Out of Scope
- Backend dispatch wave generation and driver ranking logic.
- Post-arrival hospital receipt signing.

## Open Questions
- Undocumented offer push schema: What is the exact TypeScript interface for the `dispatch.offer` event payload emitted by the Dispatch Service over Centrifugo (e.g. `offerId`, `missionId`, `expiresAt`, `pickupLocation`, `careLevel`, `patientAgeGender`, `chiefComplaint`)?
