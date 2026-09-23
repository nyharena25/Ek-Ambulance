import { useEffect } from "react";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { initTracer } from "@sahayak/observability";

import { OfflineConnectivityOverlay } from "../src/components";
import { useDriverLifecycleStore } from "../src/state/driverLifecycle.store";
import { generateMockDispatchOffer } from "../src/services/mockDispatchWave";
import { assertEnvOrWarn } from "../src/config/env.ts";

assertEnvOrWarn();

declare global {
  // eslint-disable-next-line no-var
  var __mockDispatchOffer: (() => void) | undefined;
}

export default function RootLayout() {
  const { activeMissionId, send } = useDriverLifecycleStore();

  useEffect(() => {
    const tracer = initTracer("sahayak-driver-mobile");
    const span = tracer.startSpan("driver_app_bootstrap");
    span.end();
  }, []);

  // Dev-console-callable mock dispatch wave (Phase 2 Objective 4) - lets a
  // developer trigger `__mockDispatchOffer()` from the Metro/Expo debugger
  // console without needing to be on the standby screen's own trigger button.
  useEffect(() => {
    if (!__DEV__) return;
    globalThis.__mockDispatchOffer = () => {
      const offer = generateMockDispatchOffer();
      send({
        type: "SERVER_OFFER_RECEIVED",
        payload: { offerId: offer.offerId, missionId: offer.missionId },
      });
      router.push({
        pathname: "/(shift)/offer",
        params: {
          missionId: offer.missionId,
          offerId: offer.offerId,
          acuity: offer.acuity,
          requiredVehicleType: offer.requiredVehicleType,
          address: offer.pickup.address,
          landmark: offer.pickup.landmark,
          distanceKm: String(offer.distanceKm),
          etaMinutes: String(offer.etaMinutes),
        },
      });
    };
    return () => {
      globalThis.__mockDispatchOffer = undefined;
    };
  }, [send]);

  return (
    <>
      <StatusBar style="light" />
      <OfflineConnectivityOverlay missionId={activeMissionId || "MSN-2026-8819"} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(shift)" />
        <Stack.Screen name="mission" />
      </Stack>
    </>
  );
}
