import type { AuthError } from "@supabase/supabase-js";
import { isUuid } from "@sahayak/domain";

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

/** Phone-field text -> the raw 10-digit number. Autofill and paste bring "+91 98765 43210" or "098765 43210"; keeping
 *  the first 10 digits of those would keep the country/trunk prefix and drop the end of the number. */
export function normalizeIndianMobileInput(text: string): string {
  const digits = text.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits.slice(0, 10);
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

/**
 * The one definition of "signed in as a driver" (verify, restore, refresh, route gate): a Supabase session whose
 * user id is a real UUID and whose server-set app_metadata.role is "driver". Anything else is treated as signed out.
 */
export function verifiedDriverSession(
  session: { access_token: string; user: { id: string; app_metadata?: Record<string, unknown> } } | null | undefined
): { accessToken: string; userId: string } | null {
  if (!session || !isUuid(session.user.id)) return null;
  const role = session.user.app_metadata?.role;
  return hasDriverRole(typeof role === "string" ? role : null) ? { accessToken: session.access_token, userId: session.user.id } : null;
}

export type DriverAuthStatus = "loading" | "signedIn" | "signedOut";

/**
 * The driver's authorization, read from the server's own KYC state (get_driver_profile), never a local flag:
 * "unknown" until the first profile read answers, "error" when it could not be read, "application" for an incomplete
 * (draft / no drivers row yet) or rejected application, "pending" while staff review it, "approved" once verified.
 */
export type DriverKycGate = "unknown" | "error" | "application" | "pending" | "approved";

export function driverKycGate(p: {
  status: "idle" | "loading" | "ready" | "error";
  errorCode: string | null;
  profile: { kycStatus: string } | null;
}): DriverKycGate {
  if (p.profile) {
    if (p.profile.kycStatus === "approved") return "approved";
    return p.profile.kycStatus === "pending_verification" ? "pending" : "application";
  }
  if (p.status !== "error") return "unknown";
  // A driver-role account with no drivers row has simply not started the application yet.
  return p.errorCode === "driver_profile_missing" ? "application" : "error";
}

/**
 * Where the router must go for the current auth + KYC state, or null to stay. `segments` are expo-router's route
 * segments ([] at the index route). Signed out: only the (auth) screens are reachable. Signed in, authentication is not
 * authorization: only an approved driver reaches the shift (standby, booking board, offers); an incomplete or rejected
 * application goes to onboarding, a submitted one to the verification screen. Until the KYC state is known the index
 * route waits (it shows the load error and a retry). A live mission screen is never interrupted. Loading: never redirect.
 */
export function authRedirectTarget(status: DriverAuthStatus, segments: readonly string[], kyc: DriverKycGate): string | null {
  if (status === "loading") return null;
  const [first, second] = segments;
  if (status === "signedOut") return first === "(auth)" ? null : "/(auth)/phone-entry";
  if (first === "mission") return null;
  const at = (route: string) => (`/${first}/${second}` === route ? null : route);
  switch (kyc) {
    case "unknown":
    case "error":
      return first === "(shift)" ? "/" : null;
    case "application":
      return at("/(auth)/onboarding");
    case "pending":
      return at("/(auth)/verification");
    case "approved":
      // Onboarding stays reachable: it shows the approved status.
      return first === "(shift)" || second === "onboarding" ? null : "/(shift)/standby";
  }
}
