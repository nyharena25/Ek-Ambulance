import { useRouter } from "expo-router";
import { DriverPhoneEntryScreen } from "../../src/screens";

export default function PhoneEntryRoute() {
  const router = useRouter();

  return (
    <DriverPhoneEntryScreen
      onOtpSent={(phone) =>
        router.push({ pathname: "/(auth)/otp-verify", params: { phone } })
      }
      // This is the signed-out landing screen (the route gate replaces into it): only offer Back when there is somewhere
      // to go, instead of an arrow that does nothing.
      onBack={router.canGoBack() ? () => router.back() : undefined}
    />
  );
}
