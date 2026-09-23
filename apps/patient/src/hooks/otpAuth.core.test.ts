import assert from "node:assert";
import { AuthApiError as SupabaseAuthApiError } from "@supabase/supabase-js";
import {
  isValidIndianMobile,
  toE164IndianPhone,
  extractCooldownSeconds,
  mapAuthError,
  networkErrorToApiError,
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
assert.strictEqual(offlineError.error_description, "Network request failed");

const nonErrorThrow = networkErrorToApiError("a raw string was thrown");
assert.strictEqual(
  nonErrorThrow.error_description,
  "Network request failed.",
  "A non-Error throw falls back to a generic description rather than crashing"
);
console.log("✓ Network failures classified distinctly from auth/rate-limit errors.\n");

console.log("=================================================");
console.log("ALL PATIENT OTP AUTH CORE TESTS PASSED (100% GREEN)");
console.log("=================================================");
