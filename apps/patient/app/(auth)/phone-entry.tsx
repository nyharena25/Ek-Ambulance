import { useRouter } from "expo-router";
import { PhoneAuthScreen } from "../../src/screens";
import { VerifyOtpResponse } from "../../src/hooks/useOtpAuth";
import { recordConsent } from "../../src/lib/missionApi";

/** Version of the DPDP notice text shown on the phone screen; bump when that text changes. */
const CONSENT_NOTICE_VERSION = "2026-09";

export default function PhoneEntryScreen() {
  const router = useRouter();

  const handleAuthSuccess = (_authResponse: VerifyOtpResponse) => {
    // Session is already persisted by supabaseClient's secure-store adapter
    // and mirrored into usePatientAuthStore via onAuthStateChange - nothing
    // further to do here but navigate. Per Task 4.1, a verified patient
    // goes straight into the booking flow rather than landing on the
    // dashboard first.
    // Consent was ticked by the patient (the boxes start unticked); the server records it with its own timestamp.
    // Failures are ignored here: a dev mock session cannot reach the RPC, and consent must never block an emergency flow.
    void recordConsent("geolocation", CONSENT_NOTICE_VERSION, true);
    void recordConsent("medical_data", CONSENT_NOTICE_VERSION, true);
    // Triage first (G-08): going straight to pickup left the machine in `idle`, and REQUEST is only accepted from `triaged`.
    router.replace("/booking/triage");
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
      onSuccess={handleAuthSuccess}
      onBack={handleBack}
    />
  );
}
