import { Redirect, useRouter } from "expo-router";
import { Linking, View } from "react-native";
import { colors } from "@sahayak/ui";
import { OnboardingScreen } from "../src/screens";
import { realAccessToken, usePatientAuthStore } from "../src/state/patientAuth.store";

/** Entry: a signed-in patient goes straight home; everyone else sees Welcome (Sign in / Create account / Call 108). */
export default function WelcomeRoute() {
  const router = useRouter();
  const session = usePatientAuthStore((s) => s.session);
  const isInitializing = usePatientAuthStore((s) => s.isInitializing);

  // Nothing while the stored session is read, so a signed-in patient never sees Welcome flash by.
  if (isInitializing) return <View style={{ flex: 1, backgroundColor: colors.white }} />;
  if (realAccessToken(session)) return <Redirect href="/(tabs)/home" />;

  return (
    <OnboardingScreen
      onSignIn={() => router.push({ pathname: "/(auth)/phone-entry", params: { mode: "signin" } })}
      onCreateAccount={() => router.push({ pathname: "/(auth)/phone-entry", params: { mode: "signup" } })}
      onCall108={() => void Linking.openURL("tel:108").catch(() => {})}
    />
  );
}
