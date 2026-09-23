# P04: Implement Centrifugo Signed Mission Channel Subscription

## Scope
Implement `useMissionChannel.ts` to connect the patient mobile client to Centrifugo for live driver GPS telemetry. Execute the two-step authorization flow (obtaining a mission-scoped signed token from the Kong gateway before establishing the Centrifugo channel subscription), enforce automatic token renewal on reconnect, and ensure strict teardown cleanup on unmount.

## Non-Goals
Do not subscribe to Supabase Broadcast channels (Centrifugo replaced Supabase Broadcast for GPS because Broadcast is not RLS-filtered). Do not implement driver telemetry publishing (driver application responsibility). Do not render map markers or UI components in this task.

## Preconditions / Dependencies
P01 and P03 must be complete. The patient session must have an active Supabase `access_token` to authenticate against the Kong gateway `/realtime/token` endpoint.

## Reference Contracts
Verbatim excerpt from architecture specification (§3.2):

**Step 1: request a channel token**
```http
POST /realtime/token
Authorization: Bearer <supabase access_token>
Content-Type: application/json

{
  "scope": "mission:{missionId}"
}
```

Success (200):
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "channel": "mission:9f2c...-uuid"
}
```

"The gateway MUST reject (403) if the caller's `sub` is neither `missions.patient_id` nor `missions.driver_id` for that mission - this is the RLS-equivalent check for a channel that Supabase RLS itself cannot protect (Broadcast is not RLS-filtered, which is why Centrifugo replaced it for GPS)."

**Step 2: JWT claims signed by the gateway (HS256, `CENTRIFUGO_TOKEN_HMAC_SECRET_KEY`)**
```json
{
  "sub": "patient-uuid",
  "channel": "mission:9f2c...-uuid",
  "exp": 1758470400,
  "iat": 1758466800
}
```

"Token TTL is 60 minutes; `useMissionChannel.ts` MUST request a fresh token on reconnect, never cache and reuse an expired one."

## Files to Create/Modify
- `apps/patient/src/hooks/useMissionChannel.ts`

## Acceptance Criteria
- Uses `centrifuge@^5.x` client connected to `EXPO_PUBLIC_CENTRIFUGO_WS_URL`.
- Before establishing subscription to `mission:{missionId}`, executes an HTTP POST to `${EXPO_PUBLIC_GATEWAY_URL}/realtime/token` with header `Authorization: Bearer <token>` and body `{ "scope": "mission:" + missionId }`.
- Configures Centrifugo subscription `getToken` callback to dynamically re-fetch from `/realtime/token` upon reconnection, ensuring expired tokens are never reused.
- Exposes `latestTelemetry: DriverTelemetry | null` containing `{ latitude, longitude, heading, speed, timestamp }`.
- When the gateway returns HTTP 403 (caller is not patient or driver for the mission), the hook terminates the subscription and surfaces an unauthorized error without entering retry loops.
- Hook cleanup function unsubscribes from the channel and disconnects the Centrifugo client instance when the component unmounts or `missionId` changes.

## Out of Scope
- Map rendering and polyline animation in `apps/patient/app/booking/[id].tsx` (deferred to P06).
- Trip completion and receipt generation triggers.

## Open Questions
- What fallback mechanism (e.g. short-interval HTTP polling to dispatch service) should be specified if the Centrifugo WebSocket connection fails due to hospital firewall restrictions?
