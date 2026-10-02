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
        // Authenticated (session persisted, driver role checked in useOtpAuth.verifyOtp) is not yet authorized: the
        // index route waits for the server's KYC state and the root route gate sends the driver to the shift,
        // the application form or the verification screen from it.
        router.replace("/");
      }}
      onChangeNumber={() => router.back()}
    />
  );
}
