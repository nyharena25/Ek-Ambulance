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

/**
 * The driver's authentication state machine:
 *   loading    startup, the stored session has not been read yet
 *   restoring  a session is stored but could not be refreshed for a network reason: the account still exists on this
 *              device and auth-js keeps retrying; never shown as signed out (that used to send an existing driver back
 *              to sign-in and consent whenever the app started offline with an expired access token)
 *   signedIn   a verified driver session (verifiedDriverSession)
 *   signedOut  no session, an invalid/revoked refresh token, or a non-driver account
 */
export type DriverAuthStatus = "loading" | "restoring" | "signedIn" | "signedOut";

type SessionLike = Parameters<typeof verifiedDriverSession>[0];
type AuthErrorLike = { status?: number; name?: string; message?: string };

/** The startup getSession() answer -> status. auth-js returns { session: null, error } both for a dead refresh token (it
 *  has already removed the stored session) and for a network failure (it keeps it): only the error tells them apart. */
export function initialAuthStatus(result: { session: SessionLike; error: AuthErrorLike | null }): DriverAuthStatus {
  if (verifiedDriverSession(result.session)) return "signedIn";
  if (!result.session && result.error && isNetworkFailure(result.error)) return "restoring";
  return "signedOut";
}

export type DriverAuthEvent = "INITIAL_SESSION" | "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED" | "USER_UPDATED" | "PASSWORD_RECOVERY" | "MFA_CHALLENGE_VERIFIED";

/**
 * Orders the two sources of the session at startup. The listener's INITIAL_SESSION is ignored: on a refresh failure it
 * fires with null and no error, so it cannot tell "offline" from "signed out" - the getSession() result (which has the
 * error) decides the initial state instead. Once a real auth event has been adopted, a getSession() answer that lands later
 * is stale and ignored, so a slow startup read can never undo a sign-in, a refresh or a sign-out.
 */
export function createAuthSessionTracker(adopt: (session: SessionLike, status: DriverAuthStatus) => void) {
  let eventAdopted = false;
  return {
    initial(result: { session: SessionLike; error: AuthErrorLike | null }): void {
      if (eventAdopted) return;
      adopt(result.session ?? null, initialAuthStatus(result));
    },
    event(event: DriverAuthEvent | string, session: SessionLike): void {
      if (event === "INITIAL_SESSION") return;
      eventAdopted = true;
      adopt(session ?? null, verifiedDriverSession(session) ? "signedIn" : "signedOut");
    },
  };
}

/**
 * DPDP consent (5.3.9). Recorded server-side per account (consent_records via record_consent, server timestamp, keyed on
 * auth.uid()), once per notice version: bumping DRIVER_CONSENT_NOTICE_VERSION asks every driver again, nothing else does.
 */
export const DRIVER_CONSENT_NOTICE_VERSION = "driver-dpdp-v1";
export const DRIVER_CONSENT_PURPOSES = ["driver_location", "driver_credentials"] as const;

export interface ConsentRecordRow {
  purpose: string;
  granted: boolean;
  notice_version: string;
  granted_at: string;
  withdrawn_at: string | null;
}

/** consent_records is append-only: the newest row per purpose is the current decision. Every driver purpose must be granted,
 *  not withdrawn, under the current notice version. */
export function hasCurrentDriverConsent(rows: readonly ConsentRecordRow[], version: string = DRIVER_CONSENT_NOTICE_VERSION): boolean {
  const latest = new Map<string, ConsentRecordRow>();
  for (const row of [...rows].sort((a, b) => Date.parse(b.granted_at) - Date.parse(a.granted_at))) {
    if (!latest.has(row.purpose)) latest.set(row.purpose, row);
  }
  return DRIVER_CONSENT_PURPOSES.every((purpose) => {
    const row = latest.get(purpose);
    return !!row && row.granted && !row.withdrawn_at && row.notice_version === version;
  });
}

/** "unknown" until read, "error" when it could not be read (never "required": a network blip must not re-ask consent). */
export type DriverConsentGate = "unknown" | "error" | "required" | "granted";

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
export function authRedirectTarget(
  status: DriverAuthStatus,
  segments: readonly string[],
  kyc: DriverKycGate,
  consent: DriverConsentGate
): string | null {
  // Still reading or restoring the stored session: never redirect (no flash of sign-in or consent).
  if (status === "loading" || status === "restoring") return null;
  const [first, second] = segments;
  if (status === "signedOut") return first === "(auth)" && second !== "consent" ? null : "/(auth)/phone-entry";
  if (first === "mission") return null;
  const at = (route: string) => (`/${first}/${second}` === route ? null : route);
  // Consent before the application: credentials are processed only once the account has consented to it.
  if (consent === "required") return at("/(auth)/consent");
  if (consent !== "granted") return first === "(shift)" || second === "consent" ? "/" : null;
  return kycTarget(first, second, kyc, at) ?? (second === "consent" ? "/" : null);
}

function kycTarget(first: string | undefined, second: string | undefined, kyc: DriverKycGate, at: (route: string) => string | null): string | null {
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
