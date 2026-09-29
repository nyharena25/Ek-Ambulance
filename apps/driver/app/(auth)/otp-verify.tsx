import { useRouter, useLocalSearchParams, Redirect } from "expo-router";
import { DriverOtpVerifyScreen } from "../../src/screens";

export default function OtpVerifyRoute() {
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone?: string }>();

  // Reached without a phone param (e.g. a stale deep link) - nothing to
  // verify, send back to capture it first.
  if (!phone) {
    return <Redirect href="/(auth)/phone-entry" />;
  }

  return (
    <DriverOtpVerifyScreen
      phone={phone}
      onVerified={() => {
        // Session is already persisted by supabaseClient's secure-store
        // adapter; role is verified inside useOtpAuth.verifyOtp before this
        // fires, so it's safe to proceed straight to the shift dashboard.
        // A driver who still needs to onboard uses standby's own onboarding entry point.
        router.replace("/(shift)/standby");
      }}
      onChangeNumber={() => router.back()}
    />
  );
}
