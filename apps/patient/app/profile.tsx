import { Redirect, useRouter } from "expo-router";
import { PatientProfileScreen } from "../src/screens";
import { realAccessToken, usePatientAuthStore } from "../src/state/patientAuth.store";
import { usePatientLifecycleStore } from "../src/state/patientLifecycle.store";
import { canSignOut } from "../src/services/missionSession.core";

export default function ProfileRoute() {
  const router = useRouter();
  const session = usePatientAuthStore((s) => s.session);
  const signOut = usePatientAuthStore((s) => s.signOut);
  const signOutAllowed = canSignOut(usePatientLifecycleStore((s) => s.currentState));

  // The root layout's auth gate also sends a signed-out user to the welcome screen; this covers the render in between.
  if (!realAccessToken(session) || !session) return <Redirect href="/" />;

  return (
    <PatientProfileScreen
      userId={session.user.id}
      signOutAllowed={signOutAllowed}
      onSignOut={signOut}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/home"))}
    />
  );
}
