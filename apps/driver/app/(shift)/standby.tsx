import { useRouter } from "expo-router";
import { DriverStandbyScreen } from "../../src/screens";

export default function StandbyRoute() {
  const router = useRouter();

  return (
    <DriverStandbyScreen
      onNavigateToOnboarding={() => {
        router.push("/(auth)/onboarding");
      }}
      onOpenBooking={() => router.push("/(shift)/booking")}
      onOpenProfile={() => router.push("/(shift)/profile")}
    />
  );
}
