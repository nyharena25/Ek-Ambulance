import { useLocalSearchParams, useRouter } from "expo-router";
import { PhoneAuthScreen } from "../../src/screens";
import { VerifyOtpResponse } from "../../src/hooks/useOtpAuth";
import { recordConsent } from "../../src/lib/missionApi";

/** Version of the DPDP notice text shown on the phone screen; bump when that text changes. */
const CONSENT_NOTICE_VERSION = "2026-09";

export default function PhoneEntryScreen() {
  const router = useRouter();
  const { mode, phone } = useLocalSearchParams<{ mode?: string; phone?: string }>();

  const handleAuthSuccess = (_authResponse: VerifyOtpResponse) => {
    // Session is already persisted by supabaseClient's secure-store adapter
    // and mirrored into usePatientAuthStore via onAuthStateChange - nothing
    // further to do here but navigate. Home is where a request starts, and where
    // an active request is shown if one exists.
    // Consent was ticked by the patient (the boxes start unticked); the server records it with its own timestamp.
    // Failures are ignored here: consent must never block an emergency flow.
    void recordConsent("geolocation", CONSENT_NOTICE_VERSION, true);
    void recordConsent("medical_data", CONSENT_NOTICE_VERSION, true);
    router.replace("/(tabs)/home");
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  };

  return (
    <PhoneAuthScreen
      // Remount on a mode switch so the OTP step and errors start fresh for the new flow.
      key={mode === "signup" ? "signup" : "signin"}
      mode={mode === "signup" ? "signup" : "signin"}
      initialPhone={phone}
      onCreateAccount={(rawPhone) => router.setParams({ mode: "signup", phone: rawPhone })}
      onSuccess={handleAuthSuccess}
      onBack={handleBack}
    />
  );
}
