import type { AuthError, Session, SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "@sahayak/domain";

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
  // A valid mobile never starts with 0, so leading zeros (trunk "0", international "00") are always a prefix.
  const digits = text.replace(/\D/g, "").replace(/^0+/, "");
  // More than 10 digits starting 91 is the country code - pasted whole, or typed one digit at a time (the field then
  // passes 11 digits, "91" + the first 9 of the number). Keeping the first 10 would send +91 91XXXXXXXX.
  if (digits.length > 10 && digits.startsWith("91")) return digits.slice(2, 12);
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

function isNetworkFailure(error: { status?: number; name?: string; message?: string }): boolean {
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

/** Live check of the phone field: "invalid_start" as soon as the first digit rules out a mobile number. */
export function phoneInputIssue(rawNumber: string): "empty" | "incomplete" | "invalid_start" | null {
  if (!rawNumber) return "empty";
  if (!/^[6-9]/.test(rawNumber)) return "invalid_start";
  return isValidIndianMobile(rawNumber) ? null : "incomplete";
}

/** Every message a patient can see for an auth failure. The screen renders only these (localized) - never the GoTrue
 *  text, which can be "Invalid API key", "Database error saving new user" and the like. */
export type AuthMessageKey =
  | "rateLimit" | "network" | "invalidOtp" | "accountNotFound" | "signupUnavailable" | "smsSendFailed" | "invalidPhone" | "generic";

export function authMessageKey(e: AuthApiError, mode: "signin" | "signup"): AuthMessageKey {
  if (e.isRateLimited) return "rateLimit";
  if (e.error === "network_error") return "network";
  if (e.error === "invalid_otp") return "invalidOtp";
  // Same GoTrue answer ("Signups not allowed"): on Sign In it means no account; on Create Account, sign-ups are off.
  if (e.error === "account_not_found") return mode === "signin" ? "accountNotFound" : "signupUnavailable";
  if (e.error === "sms_send_failed") return "smsSendFailed";
  if (e.error === "validation_failed" && /phone/i.test(e.error_description)) return "invalidPhone";
  return "generic";
}

type OtpAuthClient = Pick<SupabaseClient["auth"], "signInWithOtp" | "verifyOtp">;
export type OtpResult<T> = { ok: true; data: T } | { ok: false; error: AuthApiError };

/** Sign In never creates an account (shouldCreateUser: false); Create Account may. phone is E.164 (+91...). */
export async function requestOtpWith(auth: OtpAuthClient, phone: string, createAccount: boolean): Promise<OtpResult<null>> {
  try {
    const { error } = await auth.signInWithOtp({ phone, options: { channel: "sms", shouldCreateUser: createAccount } });
    return error ? { ok: false, error: mapAuthError(error, false) } : { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: networkErrorToApiError(err) };
  }
}

export async function verifyOtpWith(auth: OtpAuthClient, phone: string, token: string): Promise<OtpResult<Session>> {
  try {
    const { data, error } = await auth.verifyOtp({ phone, token, type: "sms" });
    if (error) return { ok: false, error: mapAuthError(error, true) };
    if (!data.session) return { ok: false, error: { error: "invalid_otp", error_description: "Token has expired or is invalid." } };
    return { ok: true, data: data.session };
  } catch (err) {
    return { ok: false, error: networkErrorToApiError(err) };
  }
}

/**
 * The access token, but only for a session the server can verify: a session with a non-UUID user id (or no
 * session at all) is not "signed in" for anything that reaches the server.
 */
export function realAccessToken(session: Session | null): string | null {
  return session && isUuid(session.user.id) ? session.access_token : null;
}

/** Where the entry route sends someone: nothing while the stored session is still being read (no Welcome flash). */
export function entryTarget(session: Session | null, isInitializing: boolean): "wait" | "home" | "welcome" {
  if (isInitializing) return "wait";
  return realAccessToken(session) ? "home" : "welcome";
}
