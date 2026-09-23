import { useEffect } from "react";
import { AppState } from "react-native";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { initTracer } from "@sahayak/observability";

import { OfflineConnectivityOverlay } from "../src/components";
import { useDriverLifecycleStore } from "../src/state/driverLifecycle.store";
import { useDriverStandbyStore } from "../src/state/driverStandby.store";
import { generateMockDispatchOffer } from "../src/services/mockDispatchWave";
import { assertEnvOrWarn } from "../src/config/env.ts";
import { useDriverLocation } from "../src/hooks/useDriverLocation";
import { Notifications, notifyIncomingOffer, setupDispatchNotifications } from "../src/services/dispatchNotifications";
import { resolveOfferAction, type OfferNotificationData } from "../src/services/dispatchNotifications.core";

assertEnvOrWarn();

declare global {
  // eslint-disable-next-line no-var
  var __mockDispatchOffer: ((delayMs?: number) => void) | undefined;
}

export default function RootLayout() {
  const { activeMissionId, send, driverId } = useDriverLifecycleStore();
  useDriverLocation();

  // Accept/Decline buttons on the dispatch notification run the same lifecycle events as the offer screen.
  useEffect(() => {
    setupDispatchNotifications().catch(() => {});
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const result = resolveOfferAction(
        response.actionIdentifier,
        response.notification.request.content.data,
        driverId || "DRV-DEMO-0001"
      );
      if (!result) return;
      send(result.event);
      if (result.kind === "accept") router.replace(result.route);
      Notifications.dismissNotificationAsync(response.notification.request.identifier).catch(() => {});
    });
    const appStateSub = AppState.addEventListener("change", (s) => {
      if (s === "active") Notifications.dismissAllNotificationsAsync().catch(() => {});
    });
    return () => {
      responseSub.remove();
      appStateSub.remove();
    };
  }, [driverId, send]);

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
    // Pass a delay, then background the app, to exercise the dispatch notification.
    globalThis.__mockDispatchOffer = (delayMs = 0) => {
      setTimeout(() => {
        const offer = generateMockDispatchOffer(useDriverStandbyStore.getState().gps);
        send({
          type: "SERVER_OFFER_RECEIVED",
          payload: { offerId: offer.offerId, missionId: offer.missionId },
        });
        const params = {
          missionId: offer.missionId,
          offerId: offer.offerId,
          acuity: offer.acuity,
          requiredVehicleType: offer.requiredVehicleType,
          address: offer.pickup.address,
          landmark: offer.pickup.landmark,
          pickupLat: String(offer.pickup.latitude),
          pickupLng: String(offer.pickup.longitude),
          distanceKm: String(offer.distanceKm),
          etaMinutes: String(offer.etaMinutes),
        } satisfies OfferNotificationData & Record<string, string>;
        router.push({ pathname: "/(shift)/offer", params });
        void notifyIncomingOffer(params);
      }, delayMs);
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
