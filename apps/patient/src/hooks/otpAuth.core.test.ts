import assert from "node:assert";
import { AuthApiError as SupabaseAuthApiError } from "@supabase/supabase-js";
import {
  isValidIndianMobile,
  toE164IndianPhone,
  normalizeIndianMobileInput,
  extractCooldownSeconds,
  mapAuthError,
  networkErrorToApiError,
  phoneInputIssue,
  authMessageKey,
  requestOtpWith,
  verifyOtpWith,
  realAccessToken,
  entryTarget,
  type AuthApiError,
} from "./otpAuth.core.ts";

console.log("=================================================");
console.log("Running Ek-Ambulance Patient OTP Auth Core Tests");
console.log("=================================================\n");

// Test 1: Indian mobile number format validation
console.log("Test 1: Validating +91 Indian mobile number format (^[6-9]\\d{9}$)...");
assert.strictEqual(isValidIndianMobile("9876543210"), true, "Valid: starts with 9, 10 digits");
assert.strictEqual(isValidIndianMobile("6000000000"), true, "Valid: starts with 6 (TRAI floor)");
assert.strictEqual(isValidIndianMobile("5999999999"), false, "Invalid: starts with 5 (below TRAI range)");
assert.strictEqual(isValidIndianMobile("98765432"), false, "Invalid: too short (8 digits)");
assert.strictEqual(isValidIndianMobile("987654321012"), false, "Invalid: too long (12 digits)");
assert.strictEqual(isValidIndianMobile("+919876543210"), false, "Invalid: must be raw 10-digit, not +91-prefixed");
assert.strictEqual(isValidIndianMobile("98765abcde"), false, "Invalid: contains non-digit characters");
assert.strictEqual(isValidIndianMobile(""), false, "Invalid: empty string");
assert.strictEqual(toE164IndianPhone("9876543210"), "+919876543210", "E.164 formatting adds +91 prefix");
for (const typed of ["9876543210", "98765 43210", "+91 98765 43210", "+919876543210", "919876543210", "09876543210", "+91-98765-43210"]) {
  assert.strictEqual(toE164IndianPhone(normalizeIndianMobileInput(typed)), "+919876543210", `"${typed}" normalizes to +919876543210`);
}
assert.strictEqual(normalizeIndianMobileInput("98765432101"), "9876543210", "an extra typed digit is dropped, not shifted in");
assert.strictEqual(normalizeIndianMobileInput("9198765432"), "9198765432", "a 10-digit number starting 91 is left alone");
console.log("✓ Valid and invalid +91 formats classified correctly.\n");

// Test 2: OTP resend cooldown extraction (the pure logic behind the resend
// cooldown timer - PhoneAuthScreen's own setInterval countdown display is
// presentation-layer and reads this value, not retested here).
console.log("Test 2: Validating OTP resend cooldown extraction from GoTrue rate-limit messages...");
assert.strictEqual(
  extractCooldownSeconds("For security purposes, you can only request this after 33 seconds."),
  33,
  "Extracts the exact cooldown from a real GoTrue rate-limit message"
);
assert.strictEqual(
  extractCooldownSeconds("You can only request this after 5 seconds."),
  5,
  "Extracts a single-digit cooldown"
);
assert.strictEqual(
  extractCooldownSeconds("Something went wrong."),
  null,
  "Returns null when the message carries no cooldown"
);
console.log("✓ Cooldown seconds extracted correctly, or null when absent.\n");

// Test 3: rate-limit (429) error mapping carries isRateLimited + cooldown
console.log("Test 3: Validating 429 rate-limit errors map to isRateLimited + cooldownSeconds...");
const rateLimitError = new SupabaseAuthApiError(
  "For security purposes, you can only request this after 33 seconds.",
  429,
  "over_sms_send_rate_limit"
);
const mappedRateLimit = mapAuthError(rateLimitError, false);
assert.strictEqual(mappedRateLimit.isRateLimited, true, "429 status maps to isRateLimited: true");
assert.strictEqual(mappedRateLimit.cooldownSeconds, 33, "Cooldown seconds carried through into AuthApiError");
assert.strictEqual(mappedRateLimit.error, "over_sms_send_rate_limit");
assert.strictEqual(
  mappedRateLimit.error_description,
  "For security purposes, you can only request this after 33 seconds.",
  "error_description is the verbatim GoTrue message, per P03's explicit requirement"
);
console.log("✓ Rate-limit errors correctly flagged with their cooldown.\n");

// Sign In (shouldCreateUser: false) with a phone that has no account: the hosted project answers exactly this
// (probed 2026-10-02 with a number confirmed absent; no account was created and no SMS sent).
console.log("Test 3b: Validating Sign In with an unknown phone maps to account_not_found...");
const signupsNotAllowed = new SupabaseAuthApiError("Signups not allowed for otp", 422, "otp_disabled");
assert.strictEqual(mapAuthError(signupsNotAllowed, false).error, "account_not_found");
assert.strictEqual(mapAuthError(signupsNotAllowed, false).isRateLimited, false);
// An older GoTrue with no error code still says it in the message.
assert.strictEqual(mapAuthError(new SupabaseAuthApiError("Signups not allowed for otp", 422, undefined as never), false).error, "account_not_found");
assert.notStrictEqual(mapAuthError(signupsNotAllowed, true).error, "account_not_found", "only the request step means 'no account'");
console.log("✓ Unknown phone on Sign In is account_not_found.\n");

// Test 4: expired/invalid OTP token errors normalize to "invalid_otp" -
// PhoneAuthScreen.tsx checks this exact literal string to pick the right
// bilingual error message (strings.invalidOtpError).
console.log("Test 4: Validating expired/invalid OTP codes normalize to \"invalid_otp\"...");
const expiredOtpError = new SupabaseAuthApiError("Token has expired or is invalid", 401, "invalid_otp");
const mappedExpired = mapAuthError(expiredOtpError, true);
assert.strictEqual(mappedExpired.error, "invalid_otp");
assert.strictEqual(mappedExpired.isRateLimited, false, "An expired-token error is not a rate-limit error");

// Newer GoTrue versions use "otp_expired" instead of "invalid_otp" for the
// same condition - both must normalize to the one literal the UI checks.
const newerGoTrueError = new SupabaseAuthApiError("The OTP has expired", 401, "otp_expired");
assert.strictEqual(
  mapAuthError(newerGoTrueError, true).error,
  "invalid_otp",
  "otp_expired (newer GoTrue) also normalizes to invalid_otp"
);

// A 401 with no code at all, during the verify step specifically, also
// normalizes - but the SAME statusless 401 during the *request* step must
// NOT be misclassified as an invalid OTP (there is no OTP to be invalid
// yet at that step).
const bareUnauthorized = new SupabaseAuthApiError("Unauthorized", 401, "");
assert.strictEqual(
  mapAuthError(bareUnauthorized, true).error,
  "invalid_otp",
  "A bare 401 during verifyOtp normalizes to invalid_otp"
);
assert.notStrictEqual(
  mapAuthError(bareUnauthorized, false).error,
  "invalid_otp",
  "The same bare 401 during requestOtp is NOT relabeled invalid_otp - there's no OTP yet"
);
console.log("✓ Expired/invalid OTP errors normalize to the exact string the UI checks for.\n");

// Test 5: network failures map to a distinct, non-rate-limited error
console.log("Test 5: Validating network failures produce a network_error, not a false rate-limit...");
const offlineError = networkErrorToApiError(new Error("Network request failed"));
assert.strictEqual(offlineError.error, "network_error");
assert.strictEqual(offlineError.isRateLimited, undefined, "A network error is never flagged as rate-limited");
assert.ok(!/Network request failed/.test(offlineError.error_description), "raw error text is not surfaced");

const nonErrorThrow = networkErrorToApiError("a raw string was thrown");
assert.strictEqual(nonErrorThrow.error, "network_error", "A non-Error throw is still classified, not a crash");
console.log("✓ Network failures classified distinctly from auth/rate-limit errors.\n");

console.log("Test 5b: Raw Java/DNS exceptions never reach the UI...");
const dnsError = new SupabaseAuthApiError("java.net.UnknownHostException: Unable to resolve host api.sahayak.in", 0, "unexpected_failure");
const mapped = mapAuthError(dnsError, false);
assert.strictEqual(mapped.error, "network_error");
assert.ok(!/java|UnknownHost|sahayak/i.test(mapped.error_description), "no raw exception text in error_description");
console.log("✓ Network failures sanitized.\n");


console.log("Test 6: Phone entry - prefixes stripped, never a duplicate +91, live validation...");
for (const typed of ["0091 98765 43210", "00919876543210", "0 98765 43210"]) {
  assert.strictEqual(toE164IndianPhone(normalizeIndianMobileInput(typed)), "+919876543210", `"${typed}" normalizes to +919876543210`);
}
assert.strictEqual(normalizeIndianMobileInput("0"), "", "a lone trunk 0 is not a digit of the number");
// Typed one key at a time through the controlled field (display "98765 43210" + next key, normalized each time).
const display = (raw: string) => (raw.length > 5 ? `${raw.slice(0, 5)} ${raw.slice(5)}` : raw);
const typeKeys = (keys: string) => [...keys].reduce((raw, k) => normalizeIndianMobileInput(display(raw) + k), "");
for (const keys of ["919876543210", "+919876543210", "09876543210", "9876543210"]) {
  assert.strictEqual(toE164IndianPhone(typeKeys(keys)), "+919876543210", `typing "${keys}" key by key gives +919876543210, never +9191...`);
}
assert.strictEqual(typeKeys("98765432109"), "9876543210", "an 11th typed digit is ignored");
assert.strictEqual(phoneInputIssue(""), "empty");
assert.strictEqual(phoneInputIssue("98765"), "incomplete", "a partial number is incomplete, not wrong");
assert.strictEqual(phoneInputIssue("5"), "invalid_start", "a first digit 1-5 is flagged at once");
assert.strictEqual(phoneInputIssue("9876543210"), null);
console.log("✓ Phone input normalized and validated.\n");

console.log("Test 7: Every failure shows a patient-facing message, never GoTrue text...");
const key = (e: AuthApiError, mode: "signin" | "signup" = "signin") => authMessageKey(e, mode);
const fromGoTrue = (msg: string, status: number, code?: string, verify = false) =>
  mapAuthError(new SupabaseAuthApiError(msg, status, code as never), verify);
assert.strictEqual(key(fromGoTrue("Invalid API key", 401, undefined)), "generic", "an anon-key misconfiguration is generic");
assert.strictEqual(key(fromGoTrue("Database error saving new user", 500, "unexpected_failure")), "generic", "a server trigger failure is generic");
assert.strictEqual(key(fromGoTrue("Error sending confirmation OTP to provider: ...", 500, "sms_send_failed")), "smsSendFailed");
assert.strictEqual(key(fromGoTrue("Invalid phone number format (E.164 required)", 400, "validation_failed")), "invalidPhone");
assert.strictEqual(key(mappedRateLimit), "rateLimit");
assert.strictEqual(key(fromGoTrue("Token has expired or is invalid", 403, "otp_expired", true)), "invalidOtp");
assert.strictEqual(key(networkErrorToApiError(new Error("Network request failed"))), "network");
assert.strictEqual(key(mapAuthError(signupsNotAllowed, false), "signin"), "accountNotFound", "Sign In: no account for this number");
assert.strictEqual(key(mapAuthError(signupsNotAllowed, false), "signup"), "signupUnavailable", "Create Account: sign-ups switched off, not 'no account'");
console.log("✓ Failures map to localized messages only.\n");

console.log("Test 8: The real request / verify calls (fake Supabase auth client)...");
const calls: unknown[] = [];
const session = { access_token: "at", refresh_token: "rt", token_type: "bearer", expires_in: 3600, user: { id: "4f0c2a1e-8b7d-4c3a-9e2f-1a2b3c4d5e6f" } };
const fakeAuth = (behaviour: { request?: unknown; verify?: unknown; throws?: boolean }) =>
  ({
    signInWithOtp: async (args: unknown) => {
      calls.push(["signInWithOtp", args]);
      if (behaviour.throws) throw new TypeError("Network request failed");
      return { data: {}, error: behaviour.request ?? null };
    },
    verifyOtp: async (args: unknown) => {
      calls.push(["verifyOtp", args]);
      if (behaviour.throws) throw new TypeError("Network request failed");
      return behaviour.verify ?? { data: { session, user: session.user }, error: null };
    },
  }) as never;

// Existing patient signs in: never creates an account.
assert.deepStrictEqual(await requestOtpWith(fakeAuth({}), "+919876543210", false), { ok: true, data: null });
assert.deepStrictEqual(calls.pop(), ["signInWithOtp", { phone: "+919876543210", options: { channel: "sms", shouldCreateUser: false } }]);
// Unknown patient tries Sign In: refused, shown as "no account" with the Create account path.
const unknown = await requestOtpWith(fakeAuth({ request: signupsNotAllowed }), "+919876543210", false);
assert.ok(!unknown.ok && key(unknown.error, "signin") === "accountNotFound");
// Patient chooses Create Account: the same real call, allowed to create.
await requestOtpWith(fakeAuth({}), "+919876543210", true);
assert.deepStrictEqual(calls.pop(), ["signInWithOtp", { phone: "+919876543210", options: { channel: "sms", shouldCreateUser: true } }]);
// Resend is the same request again (same mode); a rate-limited resend carries the server cooldown.
const resent = await requestOtpWith(fakeAuth({ request: rateLimitError }), "+919876543210", false);
assert.ok(!resent.ok && resent.error.isRateLimited && resent.error.cooldownSeconds === 33);
assert.deepStrictEqual(calls.pop(), ["signInWithOtp", { phone: "+919876543210", options: { channel: "sms", shouldCreateUser: false } }]);
// OTP verification success returns the Supabase session.
const ok = await verifyOtpWith(fakeAuth({}), "+919876543210", "123456");
assert.ok(ok.ok && ok.data.access_token === "at");
assert.deepStrictEqual(calls.pop(), ["verifyOtp", { phone: "+919876543210", token: "123456", type: "sms" }]);
// Invalid OTP.
const bad = await verifyOtpWith(fakeAuth({ verify: { data: { session: null, user: null }, error: expiredOtpError } }), "+919876543210", "000000");
assert.ok(!bad.ok && key(bad.error) === "invalidOtp");
// No session without an error is still not signed in.
const noSession = await verifyOtpWith(fakeAuth({ verify: { data: { session: null, user: null }, error: null } }), "+919876543210", "000000");
assert.ok(!noSession.ok && noSession.error.error === "invalid_otp");
// Network failure (thrown) on either call.
for (const r of [await requestOtpWith(fakeAuth({ throws: true }), "+919876543210", false), await verifyOtpWith(fakeAuth({ throws: true }), "+919876543210", "123456")]) {
  assert.ok(!r.ok && key(r.error) === "network" && !/Network request failed/.test(r.error.error_description));
}
console.log("✓ Sign in / create account / verify / resend / failures.\n");

console.log("Test 9: Already-authenticated session routing...");
assert.strictEqual(entryTarget(null, true), "wait", "no Welcome flash while the stored session is read");
assert.strictEqual(entryTarget(session as never, false), "home", "a restored session skips Welcome");
assert.strictEqual(entryTarget(null, false), "welcome");
assert.strictEqual(entryTarget({ ...session, user: { id: "local-demo" } } as never, false), "welcome", "a non-UUID session is not signed in");
assert.strictEqual(realAccessToken(session as never), "at");
console.log("✓ Session restoration routing.\n");

console.log("=================================================");
console.log("ALL PATIENT OTP AUTH CORE TESTS PASSED (100% GREEN)");
console.log("=================================================");
