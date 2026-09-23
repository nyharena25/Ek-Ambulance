import { useRouter } from "expo-router";
import { PhoneAuthScreen } from "../../src/screens";
import { VerifyOtpResponse } from "../../src/hooks/useOtpAuth";

export default function PhoneEntryScreen() {
  const router = useRouter();

  const handleAuthSuccess = (_authResponse: VerifyOtpResponse) => {
    // Session is already persisted by supabaseClient's secure-store adapter
    // and mirrored into usePatientAuthStore via onAuthStateChange - nothing
    // further to do here but navigate. Per Task 4.1, a verified patient
    // goes straight into the booking flow rather than landing on the
    // dashboard first.
    router.replace("/booking/location-entry");
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
