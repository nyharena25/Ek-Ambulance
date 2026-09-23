# P04: Implement Shift Presence Management and AIS-125 Verification Gate

## Scope
Implement `usePresence.ts` and the `(shift)/standby.tsx` screen to manage driver shift availability via the Kong gateway presence endpoint. Enforce domain-to-wire coordinate conversion, handle statutory AIS-125 verification rejection, and map errors strictly to existing `packages/ui/i18n` localization keys.

## Non-Goals
Do not introduce new translation keys for the crew verification error path. Do not listen for dispatch waves or accept mission offers in this task (handled in P05).

## Preconditions / Dependencies
Tasks P01, P02, and P03 must be complete. Session authentication with verified `driver` role must be active.

## Reference Contracts
Verbatim excerpt from architecture specification (§3.3):

```http
PATCH /drivers/me/presence
Authorization: Bearer <supabase access_token>
Content-Type: application/json

{
  "isOnline": true,
  "location": { "lat": 28.6139, "lng": 77.2090 },
  "careLevel": "ALS"
}
```

Success (200):
```json
{
  "driverId": "uuid",
  "isOnline": true,
  "geoIndexed": true,
  "updatedAt": "2026-09-21T16:41:00.000Z"
}
```

Error (403): crew/certification incomplete:
```json
{
  "error": "crew_incomplete",
  "error_description": "AIS-125 certification not verified for this driver."
}
```

"This error code MUST map to the project's existing bilingual i18n keys `driverCrewIncomplete` / `driverAis125Verified` already defined in `packages/ui/i18n` - do not introduce new translation keys for this error path."

## Files to Create/Modify
- `apps/driver/src/hooks/usePresence.ts`
- `apps/driver/app/(shift)/standby.tsx`

## Acceptance Criteria
- `usePresence.ts` issues an HTTP PATCH request to `${EXPO_PUBLIC_GATEWAY_URL}/drivers/me/presence` with header `Authorization: Bearer <access_token>`.
- Converts internal domain `GeoPoint` (`{ latitude, longitude }`) to the wire format `{ lat: location.latitude, lng: location.longitude }` required by the gateway.
- Upon 200 response, stores `isOnline: true` and confirms spatial indexing (`geoIndexed: true`).
- Upon 403 response with `error: "crew_incomplete"`, parses `error_description` and maps the error state to `driverCrewIncomplete` / `driverAis125Verified` without inventing new i18n keys.
- `standby.tsx` renders:
  - Online/Offline shift status toggle button.
  - Current ambulance vehicle ID and statutory `CareLevel` badge.
  - GPS location status indicator.
  - Prominent blocking alert when `crew_incomplete` error is returned, preventing the toggle from showing "Online".
- Toggling offline issues PATCH with `{ "isOnline": false }` and dispatches `GO_OFFLINE` to return state to `offline`.

## Out of Scope
- Realtime dispatch offer subscription (deferred to P05).
- Background location publishing during active missions (deferred to P05).

## Open Questions
- If GPS or location permission is revoked or becomes unavailable while the driver is online in `standby`, should `usePresence` automatically submit a PATCH with `{ "isOnline": false }` to de-list the vehicle from the spatial dispatch pool?
