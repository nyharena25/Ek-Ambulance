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
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="booking" />
      </Stack>
    </>
  );
}
