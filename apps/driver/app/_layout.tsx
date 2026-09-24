import { useEffect } from "react";
import { Alert, AppState, View } from "react-native";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { initTracer } from "@sahayak/observability";

import { OfflineConnectivityOverlay } from "../src/components";
import { getServerAdapter, useDriverLifecycleStore } from "../src/state/driverLifecycle.store";
import { useServerSync } from "../src/hooks/useServerSync";
import { driverErrorMessage } from "../src/lib/driverServer.core";
import { useDriverConnectionStore } from "../src/state/driverConnection.store";
import { useDriverStandbyStore } from "../src/state/driverStandby.store";
import { generateMockDispatchOffer } from "../src/services/mockDispatchWave";
import { assertEnvOrWarn } from "../src/config/env.ts";
import { useDriverLocation } from "../src/hooks/useDriverLocation";
import {
  dismissAllNotifications,
  dismissNotification,
  notifyIncomingOffer,
  setupDispatchNotifications,
  subscribeToOfferActions,
} from "../src/services/dispatchNotifications";
import { resolveOfferAction, type OfferNotificationData } from "../src/services/dispatchNotifications.core";

assertEnvOrWarn();

declare global {
  // eslint-disable-next-line no-var
  var __mockDispatchOffer: ((delayMs?: number) => void) | undefined;
}

export default function RootLayout() {
  const { activeMissionId, send, submit, driverId } = useDriverLifecycleStore();
  useDriverLocation();
  useServerSync();

  // Accept/Decline buttons on the dispatch notification run the same lifecycle events as the offer screen, through the
  // same server-authoritative path: an Accept the server refuses (offer taken, expired) does not move the machine.
  useEffect(() => {
    setupDispatchNotifications().catch(() => {});
    const unsubscribe = subscribeToOfferActions((response) => {
      const result = resolveOfferAction(response.actionIdentifier, response.data, getServerAdapter()?.userId ?? (driverId || "DRV-DEMO-0001"));
      if (!result) return;
      void submit(result.event).then((outcome) => {
        if (!outcome.ok) {
          Alert.alert("Not recorded", driverErrorMessage(outcome.error.code));
          router.replace("/(shift)/standby");
        } else if (result.kind === "accept") {
          router.replace(result.route);
        }
      });
      dismissNotification(response.notificationId);
    });
    const appStateSub = AppState.addEventListener("change", (s) => {
      if (s === "active") dismissAllNotifications();
    });
    return () => {
      unsubscribe();
      appStateSub.remove();
    };
  }, [driverId, submit]);

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

  // The offline banner sits in flow at the top and already clears the status bar, so screens below it must not add the inset again.
  const insets = useSafeAreaInsets();
  const bannerShown = useDriverConnectionStore((s) => s.isFallbackActive || s.showRestoredBanner);

  return (
    <>
      <StatusBar style="light" />
      <OfflineConnectivityOverlay missionId={activeMissionId || "MSN-2026-8819"} />
      <View style={{ flex: 1 }}>
        <SafeAreaInsetsContext.Provider value={bannerShown ? { ...insets, top: 0 } : insets}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(shift)" />
            <Stack.Screen name="mission/[id]" />
          </Stack>
        </SafeAreaInsetsContext.Provider>
      </View>
    </>
  );
}
