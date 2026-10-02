import type { AuthError } from "@supabase/supabase-js";

/**
 * Pure helpers backing useOtpAuth.ts, split out so they're unit-testable
 * without a live Supabase/network connection (Task 4.1 objective 4) -
 * same "pure core, thin hook wrapper" split used for the Centrifugo
 * service in Phase 4.
 */

export interface AuthApiError {
  error: string;
  error_description: string;
  isRateLimited?: boolean;
  cooldownSeconds?: number;
}

/** Indian mobile number, 10 digits, must start 6-9 (TRAI numbering plan) -
 *  the exact pattern named in HANDOVER's DPDP compliance notes. Expects
 *  the raw 10-digit number, not the +91-prefixed form. */
const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;

export function isValidIndianMobile(rawNumber: string): boolean {
  return INDIAN_MOBILE_REGEX.test(rawNumber);
}

export function toE164IndianPhone(rawNumber: string): string {
  return `+91${rawNumber}`;
}

/** Phone-field text -> the raw 10-digit number. Autofill and paste bring "+91 98765 43210" or "098765 43210"; keeping
 *  the first 10 digits of those would keep the country/trunk prefix and drop the end of the number. */
export function normalizeIndianMobileInput(text: string): string {
  const digits = text.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits.slice(0, 10);
}

/**
 * Extracts cooldown seconds from GoTrue rate-limit descriptions such as:
 * "For security purposes, you can only request this after 33 seconds."
 */
export function extractCooldownSeconds(description: string): number | null {
  const match = description.match(/after\s+(\d+)\s+seconds/i);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  return null;
}

/**
 * Maps @supabase/supabase-js's AuthError onto the AuthApiError shape the
 * UI already depends on (PhoneAuthScreen checks `.isRateLimited` and the
 * literal string `.error === "invalid_otp"`) - preserves the exact
 * contract the raw-fetch implementation this replaces already had, per
 * docs/prompts/patient-app/P03-otp-authentication-flow.md's documented
 * error shape, so no UI/i18n code needed to change.
 */
const NETWORK_ERROR_PATTERN = /network|fetch|UnknownHost|ECONN|ENOTFOUND|timed? ?out|java\.|status: 0/i;

export function isNetworkFailure(error: { status?: number; name?: string; message?: string }): boolean {
  return (
    error.status === 0 ||
    error.name === "AuthRetryableFetchError" ||
    NETWORK_ERROR_PATTERN.test(error.message ?? "")
  );
}

const NETWORK_MESSAGE = "Network connection unavailable. Please try again.";

export function mapAuthError(error: AuthError, isVerifyStep: boolean): AuthApiError {
  if (isNetworkFailure(error)) {
    return { error: "network_error", error_description: NETWORK_MESSAGE };
  }
  const isRateLimited = error.status === 429;
  const cooldownSeconds = extractCooldownSeconds(error.message) ?? undefined;

  // GoTrue's expired/invalid verification-code error code varies by
  // version ("invalid_otp" per P03's documented example, "otp_expired" on
  // newer GoTrue) - normalize both to "invalid_otp" so the UI's existing
  // literal-string check keeps working regardless of which the gateway's
  // GoTrue instance actually returns.
  // Sign In asks GoTrue not to create a user (shouldCreateUser: false); for a phone with no account it answers
  // 422 otp_disabled "Signups not allowed for otp" (confirmed against the hosted project) and sends no SMS.
  if (!isVerifyStep && (error.code === "otp_disabled" || /signups not allowed/i.test(error.message))) {
    return { error: "account_not_found", error_description: error.message, isRateLimited: false };
  }

  const isInvalidOtpCode = error.code === "invalid_otp" || error.code === "otp_expired";
  const normalizedCode =
    isVerifyStep && (isInvalidOtpCode || (!error.code && error.status === 401))
      ? "invalid_otp"
      : error.code || (isRateLimited ? "over_sms_send_rate_limit" : "auth_error");

  return {
    error: normalizedCode,
    error_description: error.message,
    isRateLimited,
    cooldownSeconds,
  };
}

export function networkErrorToApiError(_err: unknown): AuthApiError {
  return {
    error: "network_error",
    error_description: NETWORK_MESSAGE,
  };
}
