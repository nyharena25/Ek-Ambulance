import { useRouter } from "expo-router";
import { DriverBookingScreen } from "../../src/screens";

export default function BookingRoute() {
  const router = useRouter();
  return <DriverBookingScreen onBack={() => (router.canGoBack() ? router.back() : router.replace("/(shift)/standby"))} />;
}
