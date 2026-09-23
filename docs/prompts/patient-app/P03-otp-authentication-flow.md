# P03: Implement Supabase GoTrue Phone-OTP Authentication Flow via Kong Gateway

## Scope
Implement the phone number capture, OTP generation, verification, and session creation flow across `useOtpAuth.ts`, `(auth)/phone-entry.tsx`, and `(auth)/otp-verify.tsx`. Honor the exact Kong gateway contracts for Supabase GoTrue OTP endpoints, enforce non-retry behavior on HTTP 429 rate limits, and provide bilingual (EN/HI) error surfacing to the patient UI.

## Non-Goals
Do not call the Supabase project URL directly; all requests must route through the Kong API gateway. Do not implement OAuth, password login, or biometric authenticators.

## Preconditions / Dependencies
P01 must be complete. Expo Router structure in `apps/patient/app/(auth)/` must be active.

## Reference Contracts
Verbatim excerpt from architecture specification (§3.1):

**Request OTP**
```http
POST /auth/v1/otp
Content-Type: application/json

{
  "phone": "+91XXXXXXXXXX",
  "create_user": true
}
```

Success (200): GoTrue returns an empty body; the client treats `2xx` as success:
```json
{}
```

Error (400/429):
```json
{
  "error": "over_sms_send_rate_limit",
  "error_description": "For security purposes, you can only request this after 33 seconds."
}
```

**Verify OTP**
```http
POST /auth/v1/verify
Content-Type: application/json

{
  "type": "sms",
  "phone": "+91XXXXXXXXXX",
  "token": "123456"
}
```

Success (200):
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "expires_in": 3600,
  "refresh_token": "v1.M...",
  "user": {
    "id": "uuid",
    "phone": "+91XXXXXXXXXX",
    "role": "authenticated"
  }
}
```

Error (401):
```json
{
  "error": "invalid_otp",
  "error_description": "Token has expired or is invalid"
}
```

Gateway-added rate-limit headers on both endpoints:
```http
X-RateLimit-Limit-Minute: 5
X-RateLimit-Remaining-Minute: 4
```

"The `useOtpAuth.ts` hook MUST surface `error_description` verbatim to the UI layer (for i18n lookup keyed by `error`) and MUST NOT retry automatically on 429."

## Files to Create/Modify
- `apps/patient/src/hooks/useOtpAuth.ts`
- `apps/patient/app/(auth)/phone-entry.tsx`
- `apps/patient/app/(auth)/otp-verify.tsx`

## Acceptance Criteria
- `requestOtp(phone)` performs an HTTP POST to `${EXPO_PUBLIC_GATEWAY_URL}/auth/v1/otp` with body `{ "phone": phone, "create_user": true }`.
- `verifyOtp(phone, token)` performs an HTTP POST to `${EXPO_PUBLIC_GATEWAY_URL}/auth/v1/verify` with body `{ "type": "sms", "phone": phone, "token": token }`.
- When the gateway responds with HTTP 429 or 400/401, `useOtpAuth` parses the JSON body and exposes `error` and `error_description` verbatim without initiating automatic retry loops.
- `phone-entry.tsx` renders a phone number input formatted with `+91` prefix validation, a submit button that disables during loading or active rate-limit cooldown, and bilingual error messaging (EN/HI).
- `otp-verify.tsx` renders a 6-digit verification code input, displays verbatim `error_description` on failure alongside localized hints, and redirects to `/(tabs)/home` upon receiving 200 with valid `access_token`.
- On receiving `X-RateLimit-Remaining-Minute: 0`, the UI triggers a countdown timer based on the seconds specified in `error_description`.

## Out of Scope
- Secure token storage setup in SQLite/Keystore/Keychain (handled in session bootstrap layer).
- Realtime mission subscriptions (handled in P04).

## Open Questions
- What secure storage module should be utilized for long-term storage of `refresh_token` (`expo-secure-store` or shared `@sahayak/data` secure adapter)?
