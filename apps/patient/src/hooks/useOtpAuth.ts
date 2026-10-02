import { useCallback, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { toE164IndianPhone, requestOtpWith, verifyOtpWith, type AuthApiError, type OtpResult } from "./otpAuth.core";

export type { AuthApiError };

export interface VerifyOtpResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  user: {
    id: string;
    phone: string;
    role: string;
  };
}

export interface UseOtpAuthReturn {
  isLoading: boolean;
  error: AuthApiError | null;
  rateLimitCooldown: number | null;
  /** `createAccount`: Create Account may create the Supabase user; Sign In never does (unknown phone -> account_not_found). */
  requestOtp: (phone: string, createAccount: boolean) => Promise<boolean>;
  verifyOtp: (phone: string, token: string) => Promise<VerifyOtpResponse | null>;
  clearError: () => void;
}

/**
 * Phone-OTP auth for the patient app, per
 * docs/prompts/patient-app/P03-otp-authentication-flow.md and Task 4.1.
 *
 * Uses the real @supabase/supabase-js SDK (Task 4.1's ask: session
 * auto-refresh, secure persistent storage) rather than P03's original
 * raw-fetch implementation - but the client (src/lib/supabaseClient.ts) is
 * configured against the Kong gateway URL, not a raw Supabase project URL,
 * which is what P03's "route through Kong, never call Supabase directly"
 * non-goal actually protects against. Same GoTrue /auth/v1/otp and
 * /auth/v1/verify endpoints either way.
 *
 * External contract (VerifyOtpResponse, AuthApiError, rateLimitCooldown)
 * is unchanged from the prior implementation, so PhoneAuthScreen.tsx and
 * its bilingual error wiring in authStrings.ts needed no changes.
 */
export function useOtpAuth(): UseOtpAuthReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<AuthApiError | null>(null);
  const [rateLimitCooldown, setRateLimitCooldown] = useState<number | null>(null);
  // One request at a time. A ref, not isLoading: a double tap (or auto-submit plus a tap) lands before the re-render.
  const inFlight = useRef(false);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const run = useCallback(async <T,>(call: () => Promise<OtpResult<T>>): Promise<T | null> => {
    if (inFlight.current) return null;
    inFlight.current = true;
    setIsLoading(true);
    setError(null);
    const result = await call();
    inFlight.current = false;
    setIsLoading(false);
    if (result.ok) return result.data;
    if (result.error.cooldownSeconds) setRateLimitCooldown(result.error.cooldownSeconds);
    setError(result.error);
    return null;
  }, []);

  // `phone` arrives +91-prefixed from PhoneAuthScreen.
  const requestOtp = useCallback(
    async (phone: string, createAccount: boolean): Promise<boolean> =>
      (await run(async () => {
        const r = await requestOtpWith(supabase.auth, phone, createAccount);
        return r.ok ? { ok: true as const, data: true } : r;
      })) === true,
    [run]
  );

  const verifyOtp = useCallback(
    async (phone: string, token: string): Promise<VerifyOtpResponse | null> => {
      const session = await run(() => verifyOtpWith(supabase.auth, phone, token));
      if (!session) return null;
      return {
        access_token: session.access_token,
        token_type: session.token_type,
        expires_in: session.expires_in,
        refresh_token: session.refresh_token,
        user: { id: session.user.id, phone: session.user.phone ?? phone, role: session.user.role ?? "authenticated" },
      };
    },
    [run]
  );

  return { isLoading, error, rateLimitCooldown, requestOtp, verifyOtp, clearError };
}

// Re-exported for callers that need +91 formatting outside this hook
// (e.g. the auth store deriving a display phone number).
export { toE164IndianPhone };
