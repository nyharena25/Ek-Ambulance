# P05: Implement Statutory Pricing Estimate Flow and Confirmation Screen

## Scope
Implement `usePricingEstimate.ts` and the `booking/confirm.tsx` confirmation screen to query statutory fare estimates from the Kong gateway. Render the price breakdown with strict adherence to §3.3 data contracts and display mandatory UI notices indicating that all client-side estimates are indicative only and that final statutory fares are locked server-side.

## Non-Goals
Do not calculate binding or final trip fares client-side; authoritative pricing calculations are strictly reserved for server-side evaluation during the `REQUEST` lifecycle action. Do not dispatch the `REQUEST` event in this task (handled in P06).

## Preconditions / Dependencies
P01 and P02 must be complete. Domain pricing contracts in `packages/domain/src/pricing/` must be exported and available.

## Reference Contracts
Verbatim excerpt from architecture specification (§3.3):

```http
GET /pricing/estimate?careLevel=ALS&jurisdiction=DL&distanceKm=12.4
```

Success (200):
```json
{
  "careLevel": "ALS",
  "jurisdiction": "DL",
  "distanceKm": 12.4,
  "baseFareInr": 500,
  "perKmRateInr": 25,
  "estimatedTotalInr": 810,
  "currency": "INR",
  "tariffVersion": "2026-04-01",
  "computedAt": "2026-09-21T14:32:00.000Z"
}
```

"This response shape MUST match the return type of the pure pricing function in `packages/domain/src/pricing/`. `usePricingEstimate.ts` treats this endpoint's figure as indicative only - the authoritative fare is always recomputed server-side at `REQUEST` time and is never trusted from client-side state."

## Files to Create/Modify
- `apps/patient/src/hooks/usePricingEstimate.ts`
- `apps/patient/app/booking/confirm.tsx`

## Acceptance Criteria
- `usePricingEstimate.ts` executes an HTTP GET request to `${EXPO_PUBLIC_GATEWAY_URL}/pricing/estimate` with query parameters `careLevel`, `jurisdiction`, and `distanceKm`.
- Typed response validates against `PricingEstimateResponse` from `@sahayak/domain`.
- `confirm.tsx` displays the tariff breakdown:
  - Base fare (`baseFareInr`)
  - Per-kilometer rate (`perKmRateInr`)
  - Distance (`distanceKm` km)
  - Estimated total (`estimatedTotalInr` INR)
  - Tariff version identifier (`tariffVersion`)
- `confirm.tsx` renders a prominent, persistent statutory disclaimer: *"Statutory estimate is indicative. The authoritative fare is computed and locked server-side upon dispatch request."*
- Handles error states (e.g. invalid jurisdiction or missing network) with retry capabilities.

## Out of Scope
- Mission dispatch execution via `POST /missions` (deferred to P06).
- Triage questionnaire interaction (handled in P06).

## Open Questions
- In the case of emergency bookings where the destination is omitted at request time (`destination?: GeoPoint` is optional in `RequestEventPayload`), should `/pricing/estimate` be queried with `distanceKm=0` to show the base fare only, or does the UI omit distance-based totals until a destination hospital is chosen?
