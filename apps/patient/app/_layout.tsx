import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { initTracer } from "@sahayak/observability";
import { assertEnvOrWarn } from "../src/config/env.ts";

assertEnvOrWarn();

export default function RootLayout() {
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
