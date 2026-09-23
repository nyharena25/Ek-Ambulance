# P03: Implement Supabase GoTrue Phone-OTP Authentication with Driver Role Enforcement

## Scope
Implement phone number capture, OTP generation, verification, and session creation across `useOtpAuth.ts`, `(auth)/phone-entry.tsx`, and `(auth)/otp-verify.tsx`. Honor the exact Kong gateway contracts for Supabase GoTrue OTP endpoints, enforce client-side defense-in-depth verification that the authenticated user possesses `profiles.role === "driver"`, immediately purge unauthorized sessions, and provide bilingual error surfacing.

## Non-Goals
Do not call the Supabase project URL directly; all requests must route through the Kong API gateway. Do not permit non-driver (e.g. patient) accounts to bypass authentication guards into driver shift screens.

## Preconditions / Dependencies
P01 must be complete. Expo Router structure in `apps/driver/app/(auth)/` must be active.

## Reference Contracts
Verbatim excerpt from architecture specification (§3.1):

"Identical wire contract to the patient app - same `POST /auth/v1/otp` and `POST /auth/v1/verify` request/response shapes, same rate-limit headers, same `useOtpAuth.ts` hook signature. Do not re-derive this contract; reuse it as documented in the patient app's task specs.

The one driver-specific rule: after `verifyOtp` succeeds, `useOtpAuth.ts` MUST assert client-side that the returned session's `profiles.role === "driver"` (defense in depth - RLS enforces this server-side too) before allowing navigation past `(auth)/`. If the role does not match, sign the session out immediately and surface a bilingual error; do not silently redirect into the wrong app's flow."

Rate Limit Headers:
```http
X-RateLimit-Limit-Minute: 5
X-RateLimit-Remaining-Minute: 4
```

## Files to Create/Modify
- `apps/driver/src/hooks/useOtpAuth.ts`
- `apps/driver/app/(auth)/phone-entry.tsx`
- `apps/driver/app/(auth)/otp-verify.tsx`

## Acceptance Criteria
- `requestOtp(phone)` performs an HTTP POST to `${EXPO_PUBLIC_GATEWAY_URL}/auth/v1/otp` with body `{ "phone": phone, "create_user": true }`.
- `verifyOtp(phone, token)` performs an HTTP POST to `${EXPO_PUBLIC_GATEWAY_URL}/auth/v1/verify` with body `{ "type": "sms", "phone": phone, "token": token }`.
- When the gateway responds with HTTP 429 or 400/401, `useOtpAuth` parses the JSON body and exposes `error` and `error_description` verbatim without automatic retry loops.
- Client-side role assertion: Upon receiving 200 from `/auth/v1/verify`, the hook verifies that the user profile contains `role === "driver"`.
- If `role !== "driver"`, the hook triggers immediate session purge/sign-out, aborts navigation to `/(shift)/standby`, and surfaces bilingual error message:
  - English: *"Unauthorized: This phone number is not registered as an active ambulance driver."*
  - Hindi: *"अनधिकृत: यह फ़ोन नंबर एम्बुलेंस चालक के रूप में पंजीकृत नहीं है।"*
- If `role === "driver"`, the screen navigates to `/(shift)/standby`.

## Out of Scope
- Presence toggle and shift online/offline management (handled in P04).
- Dispatch offer listening (handled in P05).

## Open Questions
- Code duplication across apps: `useOtpAuth.ts` in `apps/driver` shares 90% of its logic with `apps/patient`. Should `useOtpAuth` be extracted and promoted to `@sahayak/data` with a configurable role assertion parameter, eliminating cross-application duplication?
