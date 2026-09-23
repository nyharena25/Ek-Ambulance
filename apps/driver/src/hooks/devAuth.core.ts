import { DEV_OTP, getDevDriverProfile, type DevDriverProfile } from "../config/devDriverProfiles.ts";
import { useDriverStandbyStore } from "../state/driverStandby.store.ts";
import { useDriverOnboardingStore } from "../state/driverOnboarding.store.ts";
import type { AuthApiError } from "./otpAuth.core.ts";

export interface DevSession {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
  user: {
    id: string;
    phone: string;
    app_metadata: { role: string; provider: string };
    user_metadata: { full_name: string; vehicle_type: string | null };
  };
}

export type DevVerifyResult =
  | { ok: true; session: DevSession; profile: DevDriverProfile }
  | { ok: false; error: AuthApiError };

export const isDevDriverPhone = (phone: string): boolean => getDevDriverProfile(phone) !== undefined;

export function devVerifyOtp(phone: string, token: string): DevVerifyResult | null {
  const profile = getDevDriverProfile(phone);
  if (!profile) return null;

  if (token !== DEV_OTP) {
    return {
      ok: false,
      error: {
        error: "invalid_otp",
        error_description: "Invalid verification code. Please try again.",
      },
    };
  }

  const type = profile.ais125Type;
  const expiresIn = 3600;
  const session: DevSession = {
    access_token: "dev-mock-access-token",
    refresh_token: "dev-mock-refresh-token",
    token_type: "bearer",
    expires_in: expiresIn,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    user: {
      id: `dev-driver-${(type ?? "unverified").toLowerCase()}-uuid`,
      phone: profile.phone,
      app_metadata: { role: "driver", provider: "phone" },
      user_metadata: { full_name: "Dev Pilot", vehicle_type: type },
    },
  };

  const standby = useDriverStandbyStore.getState();
  standby.setJurisdiction(profile.jurisdiction);
  const onboarding = useDriverOnboardingStore.getState();
  onboarding.resetOnboarding();
  if (type) {
    standby.setAis125Type(type);
    onboarding.setAIS125VehicleType(type);
  }
  if (profile.isVerified && type) {
    useDriverOnboardingStore.setState({
      submissionResult: {
        trackingId: "DEV-VERIFIED",
        submittedAt: new Date().toISOString(),
        vehicleType: type,
        careLevelCode: type,
        status: "APPROVED",
      },
    });
  }

  return { ok: true, session, profile };
}
