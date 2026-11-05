import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Location from "expo-location";
import type { DriverLifecycleState } from "@sahayak/domain";
import { backgroundTrackingApi, isBackgroundTrackingActive, liveFixDeps } from "../services/backgroundLocation";
import {
  checkLocationAccess,
  handleLocationFix,
  shouldWatchLocation,
  syncBackgroundTracking,
  type LocationAccessApi,
} from "../services/backgroundLocation.core";
import { useDriverAuthStore } from "../state/driverAuth.store";
import { useDriverLifecycleStore } from "../state/driverLifecycle.store";
import { useDriverStandbyStore } from "../state/driverStandby.store";

const MISSION_PUBLISHING_STATES: readonly DriverLifecycleState[] = [
  "enRouteToPatient",
  "onScene",
  "transporting",
  "arrivedHospital",
];

const locationAccessApi: LocationAccessApi = {
  requestPermission: () => Location.requestForegroundPermissionsAsync(),
  servicesEnabled: () => Location.hasServicesEnabledAsync(),
  promptEnableServices: () => Location.enableNetworkProviderAsync(),
};

/**
 * Single real-GPS source, mounted once at the root. Tracks while the driver is signed in (offline included: going
 * online requires a real fix), online, or on a mission (coarse + cheap when idle, 3s/5m high-accuracy on a mission), mirrors every fix into the standby
 * store's `gps`, and during an active mission publishes it to mission:{id}. While a mission is
 * enRouteToPatient/onScene/transporting the background task (dev build only) owns publishing so it
 * survives Google Maps taking the screen; this watcher is the fallback if background permission is denied.
 *
 * The watcher restarts on a refused Go online tap (locationRetryNonce) and when the app returns to the foreground with
 * no watcher or an open locationIssue (the driver fixed it in Settings), so a refused permission or location switched
 * off at launch no longer leaves the driver unable to go online until the app is restarted.
 */
export function useDriverLocation(): void {
  const isOnline = useDriverStandbyStore((s) => s.isOnline);
  const retryNonce = useDriverStandbyStore((s) => s.locationRetryNonce);
  const currentState = useDriverLifecycleStore((s) => s.currentState);
  const missionActive = MISSION_PUBLISHING_STATES.includes(currentState);
  const signedIn = useDriverAuthStore((s) => s.status === "signedIn");
  const tracking = shouldWatchLocation(signedIn, isOnline, missionActive);
  const [resumeNonce, setResumeNonce] = useState(0);
  const watching = useRef(false);
  const handledRetry = useRef(retryNonce);

  useEffect(() => {
    syncBackgroundTracking(currentState, backgroundTrackingApi).catch(() => {
      // Denied permission / Expo Go: the foreground watcher below keeps publishing.
    });
  }, [currentState]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active" && (!watching.current || useDriverStandbyStore.getState().locationIssue)) {
        setResumeNonce((n) => n + 1);
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!tracking) return;
    const userInitiated = retryNonce !== handledRetry.current;
    handledRetry.current = retryNonce;
    const { setLocationIssue } = useDriverStandbyStore.getState();
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;

    (async () => {
      const issue = await checkLocationAccess(locationAccessApi, userInitiated);
      if (cancelled) return;
      setLocationIssue(issue);
      if (issue === "location_permission_denied") return;
      // Never let the watcher show the system dialog: declining it would reject watchPositionAsync and end tracking.
      // Without it the request stays registered and delivers as soon as location services come on.
      const noDialog = { mayShowUserSettingsDialog: false };
      // Seed one real fix at once so Go online does not wait for the watcher's first interval.
      if (!missionActive && !issue) {
        const first = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, ...noDialog }).catch(() => null);
        if (cancelled) return;
        if (first) handleLocationFix(first, liveFixDeps, false);
      }
      const sub = await Location.watchPositionAsync(
        missionActive
          ? { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5, ...noDialog }
          // Time-based on standby (distanceInterval 0): a parked ambulance must keep producing fresh fixes, or the server
          // (gpsFreshSeconds = 30) correctly stops dispatching it. Balanced accuracy keeps the battery cost moderate.
          : { accuracy: Location.Accuracy.Balanced, timeInterval: 10000, distanceInterval: 0, ...noDialog },
        (loc) => handleLocationFix(loc, liveFixDeps, missionActive && !isBackgroundTrackingActive())
      );
      if (cancelled) sub.remove();
      else {
        subscription = sub;
        watching.current = true;
      }
    })().catch(() => {
      // Provider errors leave the last known gps in place; the next Go online tap or app resume retries.
    });

    return () => {
      cancelled = true;
      watching.current = false;
      subscription?.remove();
    };
  }, [tracking, missionActive, retryNonce, resumeNonce]);
}
