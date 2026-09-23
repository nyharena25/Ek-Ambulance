import { useRouter } from "expo-router";
import { DriverPhoneEntryScreen } from "../../src/screens";

export default function PhoneEntryRoute() {
  const router = useRouter();

  return (
    <DriverPhoneEntryScreen
      onOtpSent={(phone) =>
        router.push({ pathname: "/(auth)/otp-verify", params: { phone } })
      }
      onBack={() => router.canGoBack() && router.back()}
    />
  );
}
