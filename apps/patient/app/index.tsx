import { useRouter } from "expo-router";
import { Linking } from "react-native";
import { OnboardingScreen } from "../src/screens";

export default function OnboardingRoute() {
  const router = useRouter();

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
