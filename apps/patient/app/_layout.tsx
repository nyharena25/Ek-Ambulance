import { useEffect } from "react";
import { Stack, router, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { initTracer } from "@sahayak/observability";
import { assertEnvOrWarn } from "../src/config/env.ts";
import { useResumeActiveMission } from "../src/hooks/useResumeActiveMission";
import { realAccessToken, usePatientAuthStore } from "../src/state/patientAuth.store";

assertEnvOrWarn();

export default function RootLayout() {
  useResumeActiveMission();

  // Auth gate: without a real Supabase session only Welcome (index) and the (auth) screens are reachable. A signed-out,
  // expired or never-signed-in patient anywhere else goes back to Welcome; nothing redirects while the stored session is
  // still being read. Signing back in re-runs useResumeActiveMission (once per account), so a live request is picked up again.
  const signedIn = usePatientAuthStore((s) => realAccessToken(s.session) !== null);
  const isInitializing = usePatientAuthStore((s) => s.isInitializing);
  const firstSegment = useSegments()[0] as string | undefined;
  useEffect(() => {
    if (isInitializing || signedIn) return;
    if (firstSegment !== undefined && firstSegment !== "(auth)") router.replace("/");
  }, [isInitializing, signedIn, firstSegment]);
  useEffect(() => {
    const tracer = initTracer("sahayak-patient-mobile");
    const span = tracer.startSpan("patient_app_bootstrap");
    span.end();
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      {/* "(tabs)" and "booking" aren't declared here: neither folder has its own _layout.tsx, so
          expo-router registers their real leaf routes as "(tabs)/home", "booking/matching", etc.
          Declaring the group name itself matched nothing and only produced the router's
          "No route named ... exists in nested children" warning. */}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
      </Stack>
    </>
  );
}
