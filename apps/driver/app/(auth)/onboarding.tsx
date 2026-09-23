import { useRouter } from "expo-router";
import { DriverOnboardingScreen } from "../../src/screens";

export default function OnboardingRoute() {
  const router = useRouter();

  return (
    <DriverOnboardingScreen
      onFinishOnboarding={(_result) => {
        // Upon successful registration & statutory submission, navigate to driver standby
        router.replace("/(shift)/standby");
      }}
      onBackToAuth={() => {
        router.back();
      }}
    />
  );
}
