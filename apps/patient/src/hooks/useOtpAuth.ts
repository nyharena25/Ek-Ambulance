import { useCallback, useState } from "react";
import { supabase, authStorage } from "../lib/supabaseClient";
import {
  toE164IndianPhone,
  mapAuthError,
  networkErrorToApiError,
  type AuthApiError,
} from "./otpAuth.core";

export type { AuthApiError };

const DEV_PATIENT_PHONE = "+919876500001";
const DEV_OTP = "123456";

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
  requestOtp: (phone: string) => Promise<boolean>;
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

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const requestOtp = useCallback(async (phone: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    if (__DEV__ && phone === DEV_PATIENT_PHONE) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      console.log(`[DevAuth] Mock OTP dispatched to ${phone} -> OTP: ${DEV_OTP}`);
      setIsLoading(false);
      return true;
    }

    try {
      // `phone` already arrives +91-prefixed from PhoneAuthScreen (matches
      // the prior contract); toE164IndianPhone is for callers passing a
      // raw 10-digit number, kept here only for symmetry with verifyOtp.
      const { error: authError } = await supabase.auth.signInWithOtp({
        phone,
        options: { channel: "sms", shouldCreateUser: true },
      });

      setIsLoading(false);

      if (!authError) return true;

      const apiError = mapAuthError(authError, false);
      const cooldown = apiError.cooldownSeconds;
      if (cooldown) setRateLimitCooldown(cooldown);
      setError(apiError);
      return false;
    } catch (err: unknown) {
      setError(networkErrorToApiError(err));
      setIsLoading(false);
      return false;
    }
  }, []);

  const verifyOtp = useCallback(
    async (phone: string, token: string): Promise<VerifyOtpResponse | null> => {
      setIsLoading(true);
      setError(null);

      if (__DEV__ && phone === DEV_PATIENT_PHONE) {
        setIsLoading(false);
        if (token !== DEV_OTP) {
          setError({
            error: "invalid_otp",
            error_description: "Invalid verification code. Please try again.",
          });
          return null;
        }
        const expiresIn = 3600;
        const user = { id: "dev-patient-uuid", phone, role: "authenticated" };
        const response = {
          access_token: "dev-mock-access-token",
          token_type: "bearer",
          expires_in: expiresIn,
          refresh_token: "dev-mock-refresh-token",
          user,
        };
        // supabase-js reads this key on getSession(); setSession() would reject the fake JWT.
        await authStorage.setItem(
          (supabase.auth as unknown as { storageKey: string }).storageKey,
          JSON.stringify({
            ...response,
            expires_at: Math.floor(Date.now() / 1000) + expiresIn,
            user: { ...user, app_metadata: { provider: "phone" }, user_metadata: { full_name: "Mock Emergency Patient" } },
          })
        );
        return response;
      }

      try {
        const { data, error: authError } = await supabase.auth.verifyOtp({
          phone,
          token,
          type: "sms",
        });

        setIsLoading(false);

        if (authError || !data.session) {
          setError(
            authError
              ? mapAuthError(authError, true)
              : { error: "invalid_otp", error_description: "Token has expired or is invalid." }
          );
          return null;
        }

        const session = data.session;
        return {
          access_token: session.access_token,
          token_type: session.token_type,
          expires_in: session.expires_in,
          refresh_token: session.refresh_token,
          user: {
            id: session.user.id,
            phone: session.user.phone ?? phone,
            role: session.user.role ?? "authenticated",
          },
        };
      } catch (err: unknown) {
        setError(networkErrorToApiError(err));
        setIsLoading(false);
        return null;
      }
    },
    []
  );

  return { isLoading, error, rateLimitCooldown, requestOtp, verifyOtp, clearError };
}

// Re-exported for callers that need +91 formatting outside this hook
// (e.g. the auth store deriving a display phone number).
export { toE164IndianPhone };
