import { useRouter } from "expo-router";
import { DriverProfileScreen } from "../../src/screens";

export default function ProfileRoute() {
  const router = useRouter();
  return (
    <DriverProfileScreen
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/(shift)/standby"))}
      onOpenApplication={() => router.push("/(auth)/onboarding")}
    />
  );
}
