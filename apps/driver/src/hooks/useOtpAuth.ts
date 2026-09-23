import { useCallback, useState } from "react";
import { supabase, authStorage } from "../lib/supabaseClient";
import { devVerifyOtp, isDevDriverPhone } from "./devAuth.core";
import { DEV_OTP } from "../config/devDriverProfiles";
import {
  hasDriverRole,
  mapAuthError,
  networkErrorToApiError,
  toE164IndianPhone,
  type AuthApiError,
} from "./otpAuth.core";

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
  requestOtp: (phone: string) => Promise<boolean>;
  verifyOtp: (phone: string, token: string) => Promise<VerifyOtpResponse | null>;
  clearError: () => void;
}

const UNAUTHORIZED_ROLE_ERROR = "unauthorized_role";

/**
 * Phone-OTP auth for the driver app, per
 * docs/prompts/driver-app/P03-otp-authentication-driver-role.md.
 * Same GoTrue /auth/v1/otp and /auth/v1/verify contract as the patient app's
 * useOtpAuth.ts (via the real @supabase/supabase-js SDK, routed through the
 * Kong gateway - see src/lib/supabaseClient.ts), plus one driver-specific
 * rule: verifyOtp asserts `app_metadata.role === "driver"` before returning
 * a session, signing out and refusing the session immediately on mismatch.
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

    if (__DEV__ && isDevDriverPhone(phone)) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      console.log(`[DevAuth] Mock OTP dispatched to ${phone} -> OTP: ${DEV_OTP}`);
      setIsLoading(false);
      return true;
    }

    try {
      const { error: authError } = await supabase.auth.signInWithOtp({
        phone,
        options: { channel: "sms", shouldCreateUser: true },
      });

      setIsLoading(false);

      if (!authError) return true;

      const apiError = mapAuthError(authError, false);
      if (apiError.cooldownSeconds) setRateLimitCooldown(apiError.cooldownSeconds);
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

      if (__DEV__) {
        const dev = devVerifyOtp(phone, token);
        if (dev) {
          setIsLoading(false);
          if (!dev.ok) {
            setError(dev.error);
            return null;
          }
          const { user, ...tokens } = dev.session;
          // supabase-js reads this key on getSession(); setSession() would reject the fake JWT.
          await authStorage.setItem(
            (supabase.auth as unknown as { storageKey: string }).storageKey,
            JSON.stringify(dev.session)
          );
          return {
            access_token: tokens.access_token,
            token_type: tokens.token_type,
            expires_in: tokens.expires_in,
            refresh_token: tokens.refresh_token,
            user: { id: user.id, phone: user.phone, role: user.app_metadata.role },
          };
        }
      }

      try {
        const { data, error: authError } = await supabase.auth.verifyOtp({
          phone,
          token,
          type: "sms",
        });

        if (authError || !data.session) {
          setIsLoading(false);
          setError(
            authError
              ? mapAuthError(authError, true)
              : { error: "invalid_otp", error_description: "Token has expired or is invalid." }
          );
          return null;
        }

        const session = data.session;
        const role = session.user.app_metadata?.role as string | undefined;

        if (!hasDriverRole(role)) {
          await supabase.auth.signOut();
          setIsLoading(false);
          setError({
            error: UNAUTHORIZED_ROLE_ERROR,
            error_description:
              "This phone number is not registered as an active ambulance driver.",
          });
          return null;
        }

        setIsLoading(false);
        return {
          access_token: session.access_token,
          token_type: session.token_type,
          expires_in: session.expires_in,
          refresh_token: session.refresh_token,
          user: {
            id: session.user.id,
            phone: session.user.phone ?? phone,
            role,
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

export { toE164IndianPhone };
