import type { AuthError } from "@supabase/supabase-js";

/** Pure helpers backing useOtpAuth.ts, unit-testable without a live
 *  Supabase/network connection - same split as the patient app's
 *  otpAuth.core.ts. */

export interface AuthApiError {
  error: string;
  error_description: string;
  isRateLimited?: boolean;
  cooldownSeconds?: number;
}

/** Indian mobile number, 10 digits, must start 6-9 (TRAI numbering plan).
 *  Expects the raw 10-digit number, not the +91-prefixed form. */
const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;

export function isValidIndianMobile(rawNumber: string): boolean {
  return INDIAN_MOBILE_REGEX.test(rawNumber);
}

export function toE164IndianPhone(rawNumber: string): string {
  return `+91${rawNumber}`;
}

/** Extracts cooldown seconds from GoTrue rate-limit descriptions such as:
 * "For security purposes, you can only request this after 33 seconds." */
export function extractCooldownSeconds(description: string): number | null {
  const match = description.match(/after\s+(\d+)\s+seconds/i);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  return null;
}

export function mapAuthError(error: AuthError, isVerifyStep: boolean): AuthApiError {
  const isRateLimited = error.status === 429;
  const cooldownSeconds = extractCooldownSeconds(error.message) ?? undefined;

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

/**
 * Defense-in-depth driver-role assertion (P03-otp-authentication-driver-role.md).
 * Trusts `app_metadata.role` only - it's set server-side (service role /
 * Postgres trigger) and can't be forged by the client, unlike `user_metadata`.
 * RLS enforces the same rule server-side; this just stops an unauthorized
 * session from ever reaching shift screens client-side.
 */
export function hasDriverRole(role: string | null | undefined): role is "driver" {
  return role === "driver";
}
