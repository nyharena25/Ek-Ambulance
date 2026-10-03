import assert from "node:assert";
import { AuthApiError as SupabaseAuthApiError } from "@supabase/supabase-js";
import {
  isValidIndianMobile,
  toE164IndianPhone,
  normalizeIndianMobileInput,
  extractCooldownSeconds,
  mapAuthError,
  networkErrorToApiError,
  hasDriverRole,
  verifiedDriverSession,
  authRedirectTarget,
  driverKycGate,
  initialAuthStatus,
  createAuthSessionTracker,
  hasCurrentDriverConsent,
  DRIVER_CONSENT_NOTICE_VERSION,
  type ConsentRecordRow,
  type DriverAuthStatus,
  type DriverConsentGate,
  type DriverKycGate,
} from "./otpAuth.core.ts";

console.log("=================================================");
console.log("Running Ek-Ambulance Driver OTP Auth Core Tests");
console.log("=================================================\n");

console.log("Test 1: Validating +91 Indian mobile number format (^[6-9]\\d{9}$)...");
assert.strictEqual(isValidIndianMobile("9876543210"), true, "Valid: starts with 9, 10 digits");
assert.strictEqual(isValidIndianMobile("6000000000"), true, "Valid: starts with 6 (TRAI floor)");
assert.strictEqual(isValidIndianMobile("5999999999"), false, "Invalid: starts with 5 (below TRAI range)");
assert.strictEqual(isValidIndianMobile("98765432"), false, "Invalid: too short (8 digits)");
assert.strictEqual(isValidIndianMobile("987654321012"), false, "Invalid: too long (12 digits)");
assert.strictEqual(isValidIndianMobile("+919876543210"), false, "Invalid: must be raw 10-digit, not +91-prefixed");
assert.strictEqual(toE164IndianPhone("9876543210"), "+919876543210", "E.164 formatting adds +91 prefix");
for (const typed of ["9876543210", "98765 43210", "+91 98765 43210", "+919876543210", "919876543210", "09876543210", "+91-98765-43210"]) {
  assert.strictEqual(toE164IndianPhone(normalizeIndianMobileInput(typed)), "+919876543210", `"${typed}" normalizes to +919876543210`);
}
assert.strictEqual(normalizeIndianMobileInput("98765432101"), "9876543210", "an extra typed digit is dropped, not shifted in");
assert.strictEqual(normalizeIndianMobileInput("9198765432"), "9198765432", "a 10-digit number starting 91 is left alone");
console.log("✓ Valid and invalid +91 formats classified correctly.\n");

console.log("Test 2: Validating OTP resend cooldown extraction from GoTrue rate-limit messages...");
assert.strictEqual(
  extractCooldownSeconds("For security purposes, you can only request this after 33 seconds."),
  33,
  "Extracts the exact cooldown from a real GoTrue rate-limit message"
);
assert.strictEqual(extractCooldownSeconds("Something went wrong."), null, "Returns null when the message carries no cooldown");
console.log("✓ Cooldown seconds extracted correctly, or null when absent.\n");

console.log("Test 3: Validating 429 rate-limit errors map to isRateLimited + cooldownSeconds...");
const rateLimitError = new SupabaseAuthApiError(
  "For security purposes, you can only request this after 33 seconds.",
  429,
  "over_sms_send_rate_limit"
);
const mappedRateLimit = mapAuthError(rateLimitError, false);
assert.strictEqual(mappedRateLimit.isRateLimited, true, "429 status maps to isRateLimited: true");
assert.strictEqual(mappedRateLimit.cooldownSeconds, 33, "Cooldown seconds carried through into AuthApiError");
console.log("✓ Rate-limit errors correctly flagged with their cooldown.\n");

console.log("Test 4: Validating expired/invalid OTP codes normalize to \"invalid_otp\"...");
const expiredOtpError = new SupabaseAuthApiError("Token has expired or is invalid", 401, "invalid_otp");
assert.strictEqual(mapAuthError(expiredOtpError, true).error, "invalid_otp");
const newerGoTrueError = new SupabaseAuthApiError("The OTP has expired", 401, "otp_expired");
assert.strictEqual(mapAuthError(newerGoTrueError, true).error, "invalid_otp", "otp_expired also normalizes to invalid_otp");
console.log("✓ Expired/invalid OTP errors normalize to the exact string the UI checks for.\n");

console.log("Test 5: Validating network failures produce a network_error, not a false rate-limit...");
const offlineError = networkErrorToApiError(new Error("Network request failed"));
assert.strictEqual(offlineError.error, "network_error");
assert.strictEqual(offlineError.isRateLimited, undefined, "A network error is never flagged as rate-limited");
console.log("✓ Network failures classified distinctly from auth/rate-limit errors.\n");

console.log("Test 6: Validating driver-role assertion (P03 defense-in-depth check)...");
assert.strictEqual(hasDriverRole("driver"), true, "Exact role 'driver' is authorized");
assert.strictEqual(hasDriverRole("patient"), false, "A patient-role account must not pass as a driver");
assert.strictEqual(hasDriverRole("authenticated"), false, "The generic Postgres role claim is not a driver authorization");
assert.strictEqual(hasDriverRole(undefined), false, "Missing app_metadata.role must not default to authorized");
assert.strictEqual(hasDriverRole(null), false, "Null role must not default to authorized");
assert.strictEqual(hasDriverRole(""), false, "Empty string role must not default to authorized");
console.log("✓ Only an exact 'driver' role claim passes the assertion.\n");

console.log("Test 5b: Raw Java/DNS exceptions never reach the UI...");
const dnsError = new SupabaseAuthApiError("java.net.UnknownHostException: Unable to resolve host api.sahayak.in", 0, "unexpected_failure");
const mapped = mapAuthError(dnsError, false);
assert.strictEqual(mapped.error, "network_error");
assert.ok(!/java|UnknownHost|sahayak/i.test(mapped.error_description), "no raw exception text in error_description");
console.log("✓ Network failures sanitized.\n");

console.log("Test: a verified driver session needs a UUID user AND server-set app_metadata.role = driver...");
const U = "00000000-0000-4000-8000-0000000000d1";
const sess = (id: string, app_metadata: Record<string, unknown>) => ({ access_token: "jwt", user: { id, app_metadata } });
assert.deepStrictEqual(verifiedDriverSession(sess(U, { role: "driver" })), { accessToken: "jwt", userId: U });
assert.strictEqual(verifiedDriverSession(sess(U, { role: "patient" })), null, "a patient account is not a driver in the driver app");
assert.strictEqual(verifiedDriverSession(sess(U, {})), null, "a fresh OTP signup (no role yet) is not a driver");
assert.strictEqual(verifiedDriverSession({ access_token: "jwt", user: { id: U } }), null, "missing app_metadata");
assert.strictEqual(verifiedDriverSession(sess("DRV-DEMO-0001", { role: "driver" })), null, "a non-UUID (local/mock) id never counts");
assert.strictEqual(verifiedDriverSession(null), null);
console.log("✓ Verified driver session.\n");

console.log("Test: route gate...");
const R = (status: DriverAuthStatus, path: string, kyc: DriverKycGate = "approved", consent: DriverConsentGate = "granted") =>
  authRedirectTarget(status, path ? path.split("/") : [], kyc, consent);
assert.strictEqual(R("loading", ""), null, "never redirect while the stored session is read");
assert.strictEqual(R("loading", "(shift)/standby"), null);
assert.strictEqual(R("signedOut", ""), "/(auth)/phone-entry", "cold start without a session");
assert.strictEqual(R("signedOut", "(shift)/standby"), "/(auth)/phone-entry", "expired/signed-out session leaves the shift");
assert.strictEqual(R("signedOut", "mission/[id]"), "/(auth)/phone-entry", "deep link to a mission needs a session");
assert.strictEqual(R("signedOut", "(auth)/phone-entry"), null, "sign-in screens stay reachable (wrong-role error stays visible)");

// Approved: the shift.
assert.strictEqual(R("signedIn", ""), "/(shift)/standby", "restored approved session opens the shift");
assert.strictEqual(R("signedIn", "(auth)/otp-verify"), "/(shift)/standby");
assert.strictEqual(R("signedIn", "(auth)/verification"), "/(shift)/standby", "approval moves the driver off the waiting screen");
assert.strictEqual(R("signedIn", "(auth)/onboarding"), null, "onboarding shows the approved status");
assert.strictEqual(R("signedIn", "(shift)/booking"), null);

// KYC not known yet / unreadable: wait on the index route, never the shift.
for (const kyc of ["unknown", "error"] as const) {
  assert.strictEqual(R("signedIn", "", kyc), null, `${kyc}: index waits`);
  assert.strictEqual(R("signedIn", "(shift)/standby", kyc), "/", `${kyc}: never the shift before the server says approved`);
  assert.strictEqual(R("signedIn", "(auth)/otp-verify", kyc), null);
}

// Not approved: authenticated, but never operational.
for (const path of ["", "(shift)/standby", "(shift)/booking", "(shift)/offer", "(shift)/profile", "(auth)/phone-entry"]) {
  assert.strictEqual(R("signedIn", path, "application"), "/(auth)/onboarding", `application at /${path}`);
  assert.strictEqual(R("signedIn", path, "pending"), "/(auth)/verification", `pending at /${path}`);
}
assert.strictEqual(R("signedIn", "(auth)/verification", "pending"), null, "already there");
assert.strictEqual(R("signedIn", "(auth)/verification", "application"), "/(auth)/onboarding", "rejected after review: back to the form");
assert.strictEqual(R("signedIn", "(auth)/onboarding", "application"), null, "already there");
assert.strictEqual(R("signedIn", "(auth)/onboarding", "pending"), "/(auth)/verification", "a submitted application is a status, not a form");
assert.strictEqual(R("signedIn", "mission/[id]", "pending"), null, "a live mission screen is never interrupted");

// The gate's input: the server's KYC state.
const P = (kycStatus: string) => ({ status: "ready" as const, errorCode: null, profile: { kycStatus } });
assert.strictEqual(driverKycGate(P("approved")), "approved");
assert.strictEqual(driverKycGate(P("pending_verification")), "pending");
assert.strictEqual(driverKycGate(P("draft")), "application");
assert.strictEqual(driverKycGate(P("rejected")), "application", "rejected: correct and resubmit through onboarding");
assert.strictEqual(driverKycGate({ status: "idle", errorCode: null, profile: null }), "unknown");
assert.strictEqual(driverKycGate({ status: "loading", errorCode: null, profile: null }), "unknown");
assert.strictEqual(driverKycGate({ status: "error", errorCode: "network", profile: null }), "error", "unreadable is not approved");
assert.strictEqual(driverKycGate({ status: "error", errorCode: "driver_profile_missing", profile: null }), "application", "no drivers row yet");
console.log("✓ Route gate.\n");

console.log("Test: restoring a stored session never shows sign-in or consent...");
for (const path of ["", "(shift)/standby", "mission/[id]", "(auth)/consent"]) {
  assert.strictEqual(R("restoring", path, "unknown", "unknown"), null, `restoring at /${path}: stay`);
}
console.log("✓ Restoring.\n");

console.log("Test: consent gate in the route gate...");
// Existing account with current consent: straight through, consent never shown.
assert.strictEqual(R("signedIn", "", "approved", "granted"), "/(shift)/standby", "existing consented driver: no consent screen");
assert.strictEqual(R("signedIn", "(auth)/otp-verify", "approved", "granted"), "/(shift)/standby");
// New account (or new notice version): consent first, before the application.
assert.strictEqual(R("signedIn", "", "application", "required"), "/(auth)/consent", "new account: consent appears");
assert.strictEqual(R("signedIn", "(auth)/onboarding", "application", "required"), "/(auth)/consent", "before credentials are processed");
assert.strictEqual(R("signedIn", "(shift)/standby", "approved", "required"), "/(auth)/consent", "a new notice version re-asks");
assert.strictEqual(R("signedIn", "(auth)/consent", "unknown", "required"), null, "already there");
// Not read yet / unreadable: wait, never ask (a network blip must not re-ask consent).
for (const consent of ["unknown", "error"] as const) {
  assert.strictEqual(R("signedIn", "", "approved", consent), null, `${consent}: index waits`);
  assert.strictEqual(R("signedIn", "(shift)/standby", "approved", consent), "/", `${consent}: not the shift`);
  assert.notStrictEqual(R("signedIn", "(auth)/otp-verify", "approved", consent), "/(auth)/consent");
}
// Granted on the consent screen: moves on by KYC state.
assert.strictEqual(R("signedIn", "(auth)/consent", "approved", "granted"), "/(shift)/standby");
assert.strictEqual(R("signedIn", "(auth)/consent", "application", "granted"), "/(auth)/onboarding");
assert.strictEqual(R("signedIn", "(auth)/consent", "unknown", "granted"), "/", "KYC still loading: index waits");
// A live mission is never interrupted, not even by consent.
assert.strictEqual(R("signedIn", "mission/[id]", "approved", "required"), null);
// Signed out on the consent screen (declined = signed out): back to sign-in.
assert.strictEqual(R("signedOut", "(auth)/consent", "unknown", "unknown"), "/(auth)/phone-entry");
console.log("✓ Consent route gate.\n");

console.log("Test: consent persistence rule (server consent_records, per account, per notice version)...");
{
  const row = (purpose: string, extra: Partial<ConsentRecordRow> = {}): ConsentRecordRow => ({
    purpose,
    granted: true,
    notice_version: DRIVER_CONSENT_NOTICE_VERSION,
    granted_at: "2026-10-01T10:00:00Z",
    withdrawn_at: null,
    ...extra,
  });
  assert.strictEqual(hasCurrentDriverConsent([]), false, "new account: nothing recorded");
  assert.strictEqual(hasCurrentDriverConsent([row("driver_location"), row("driver_credentials")]), true, "both purposes, current version");
  assert.strictEqual(hasCurrentDriverConsent([row("driver_location")]), false, "every purpose is required");
  assert.strictEqual(
    hasCurrentDriverConsent([row("driver_location"), row("driver_credentials", { withdrawn_at: "2026-10-02T00:00:00Z" })]),
    false,
    "withdrawn"
  );
  assert.strictEqual(
    hasCurrentDriverConsent([row("driver_location"), row("driver_credentials", { notice_version: "driver-dpdp-v0" })]),
    false,
    "an older notice version asks again"
  );
  // Append-only: the newest row per purpose wins, whatever order the server returns.
  const revoked = [row("driver_location"), row("driver_credentials"), row("driver_credentials", { granted: false, granted_at: "2026-10-03T00:00:00Z" })];
  assert.strictEqual(hasCurrentDriverConsent(revoked), false, "a later refusal overrides an earlier grant");
  const regranted = [row("driver_location", { granted: false, granted_at: "2026-09-01T00:00:00Z" }), row("driver_location"), row("driver_credentials")];
  assert.strictEqual(hasCurrentDriverConsent(regranted), true, "a later grant overrides an earlier refusal");
}
console.log("✓ Consent persistence rule.\n");

console.log("Test: startup session restoration and auth state transitions...");
{
  const driver = sess(U, { role: "driver" });
  const offline = { name: "AuthRetryableFetchError", status: 0, message: "Network request failed" };
  assert.strictEqual(initialAuthStatus({ session: driver, error: null }), "signedIn", "valid stored session restored");
  assert.strictEqual(initialAuthStatus({ session: null, error: null }), "signedOut", "nothing stored");
  assert.strictEqual(initialAuthStatus({ session: null, error: offline }), "restoring", "expired token + offline refresh: NOT signed out");
  assert.strictEqual(
    initialAuthStatus({ session: null, error: { name: "AuthApiError", status: 400, message: "Invalid Refresh Token: Refresh Token Not Found" } }),
    "signedOut",
    "invalid/revoked refresh token: signed out"
  );
  assert.strictEqual(initialAuthStatus({ session: sess(U, { role: "patient" }), error: null }), "signedOut", "wrong role");

  const seen: DriverAuthStatus[] = [];
  const run = () => {
    seen.length = 0;
    return createAuthSessionTracker((_s, status) => seen.push(status));
  };

  // INITIAL_SESSION fires with null on a refresh failure; only getSession (with its error) decides.
  let t = run();
  t.event("INITIAL_SESSION", null);
  t.initial({ session: null, error: offline });
  assert.deepStrictEqual(seen, ["restoring"], "INITIAL_SESSION null is not a sign-out");
  // Back online: auth-js refreshes on its own and emits TOKEN_REFRESHED.
  t.event("TOKEN_REFRESHED", driver);
  assert.deepStrictEqual(seen, ["restoring", "signedIn"], "restoring -> signedIn on refresh");

  // Race: the sign-in event lands before a slow startup read; the stale read must not undo it.
  t = run();
  t.event("SIGNED_IN", driver);
  t.initial({ session: null, error: null });
  assert.deepStrictEqual(seen, ["signedIn"], "a late getSession() never overrides a newer auth event");

  // Token refresh while signed in stays signed in; sign-out (button, revoked token, elsewhere) signs out.
  t = run();
  t.initial({ session: driver, error: null });
  t.event("TOKEN_REFRESHED", driver);
  t.event("SIGNED_OUT", null);
  assert.deepStrictEqual(seen, ["signedIn", "signedIn", "signedOut"]);
  // Login after logout.
  t.event("SIGNED_IN", driver);
  assert.deepStrictEqual(seen, ["signedIn", "signedIn", "signedOut", "signedIn"], "a new sign-in after logout is adopted");
}
console.log("✓ Session restoration + transitions.\n");

console.log("=================================================");
console.log("ALL DRIVER OTP AUTH CORE TESTS PASSED (100% GREEN)");
console.log("=================================================");
