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
export function mapAuthError(error: AuthError, isVerifyStep: boolean): AuthApiError {
  const isRateLimited = error.status === 429;
  const cooldownSeconds = extractCooldownSeconds(error.message) ?? undefined;

  // GoTrue's expired/invalid verification-code error code varies by
  // version ("invalid_otp" per P03's documented example, "otp_expired" on
  // newer GoTrue) - normalize both to "invalid_otp" so the UI's existing
  // literal-string check keeps working regardless of which the gateway's
  // GoTrue instance actually returns.
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

export function networkErrorToApiError(err: unknown): AuthApiError {
  return {
    error: "network_error",
    error_description: err instanceof Error ? err.message : "Network request failed.",
  };
}
