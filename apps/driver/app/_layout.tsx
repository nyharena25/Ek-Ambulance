import { useEffect } from "react";
import { Alert, AppState, View } from "react-native";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, router, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { OfflineConnectivityOverlay } from "../src/components";
import { getServerAdapter, useDriverLifecycleStore } from "../src/state/driverLifecycle.store";
import { useServerSync } from "../src/hooks/useServerSync";
import { driverErrorMessage } from "../src/lib/driverServer.core";
import { useDriverConnectionStore } from "../src/state/driverConnection.store";
import { assertEnvOrWarn } from "../src/config/env.ts";
import { useDriverLocation } from "../src/hooks/useDriverLocation";
import {
  dismissAllNotifications,
  dismissNotification,
  setupDispatchNotifications,
  subscribeToOfferActions,
} from "../src/services/dispatchNotifications";
import { resolveOfferAction } from "../src/services/dispatchNotifications.core";
import { authRedirectTarget, driverKycGate } from "../src/hooks/otpAuth.core";
import { useDriverAuthStore } from "../src/state/driverAuth.store";
import { useDriverProfileStore } from "../src/state/driverProfile.store";
import { useDriverConsentStore } from "../src/state/driverConsent.store";

assertEnvOrWarn();

export default function RootLayout() {
  const { activeMissionId, submit, driverId } = useDriverLifecycleStore();
  useDriverLocation();
  useServerSync();

  // Route gate. Authentication: without a verified driver session (Supabase phone OTP + app_metadata.role = driver) only
  // the sign-in screens are reachable. Authorization: the server's KYC state (get_driver_profile) decides whether the
  // driver reaches the shift at all, or the application / verification screens instead.
  const authStatus = useDriverAuthStore((s) => s.status);
  const kyc = useDriverProfileStore(driverKycGate);
  const consent = useDriverConsentStore((s) => s.gate);
  const segments = useSegments();
  const path = segments.join("/");
  useEffect(() => {
    const target = authRedirectTarget(authStatus, path ? path.split("/") : [], kyc, consent);
    if (target) router.replace(target as never);
  }, [authStatus, path, kyc, consent]);

  // Accept/Decline buttons on the dispatch notification run the same lifecycle events as the offer screen, through the
  // same server-authoritative path: an Accept the server refuses (offer taken, expired) does not move the machine.
  useEffect(() => {
    setupDispatchNotifications().catch(() => {});
    const unsubscribe = subscribeToOfferActions((response) => {
      const actingDriverId = getServerAdapter()?.userId ?? driverId;
      if (!actingDriverId) return;
      const result = resolveOfferAction(response.actionIdentifier, response.data, actingDriverId);
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

  // The offline banner sits in flow at the top and already clears the status bar, so screens below it must not add the inset again.
  const insets = useSafeAreaInsets();
  const bannerShown = useDriverConnectionStore((s) => s.isFallbackActive || s.showRestoredBanner);

  return (
    <>
      <StatusBar style="light" />
      <OfflineConnectivityOverlay missionId={activeMissionId} />
      <View style={{ flex: 1 }}>
        <SafeAreaInsetsContext.Provider value={bannerShown ? { ...insets, top: 0 } : insets}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(shift)" />
            <Stack.Screen name="mission/[id]" />
          </Stack>
        </SafeAreaInsetsContext.Provider>
      </View>
    </>
  );
}
