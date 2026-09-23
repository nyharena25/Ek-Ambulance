import assert from "node:assert";
import { AuthApiError as SupabaseAuthApiError } from "@supabase/supabase-js";
import {
  isValidIndianMobile,
  toE164IndianPhone,
  extractCooldownSeconds,
  mapAuthError,
  networkErrorToApiError,
  hasDriverRole,
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

console.log("=================================================");
console.log("ALL DRIVER OTP AUTH CORE TESTS PASSED (100% GREEN)");
console.log("=================================================");
