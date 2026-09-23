import { Redirect, useRouter } from "expo-router";
import { Linking } from "react-native";
import { OnboardingScreen } from "../src/screens";
import { usePatientLifecycleStore } from "../src/state/patientLifecycle.store";

export default function OnboardingRoute() {
  const router = useRouter();
  const currentState = usePatientLifecycleStore((s) => s.currentState);
  // Terminal states are dead ends; a cold launch is always idle, so onboarding stays reachable.
  if (currentState === "cancelled" || currentState === "receiptConfirmed") return <Redirect href="/(tabs)/home" />;

  const handleQuickEmergencyAccess = () => {
    // Zero-friction emergency dispatch: routes directly to clinical symptom triage
    router.push("/booking/triage");
  };

  const handleSignInWithPhone = () => {
    // Phone OTP authentication flow for returning users and patient records
    router.push("/(auth)/phone-entry");
  };

  const handleCall108 = () => {
    Linking.openURL("tel:108");
  };

  return (
    <OnboardingScreen
      onQuickEmergencyAccess={handleQuickEmergencyAccess}
      onSignInWithPhone={handleSignInWithPhone}
      onCall108={handleCall108}
    />
  );
}
