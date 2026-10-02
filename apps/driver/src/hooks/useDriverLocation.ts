import { useEffect } from "react";
import * as Location from "expo-location";
import type { DriverLifecycleState } from "@sahayak/domain";
import { backgroundTrackingApi, isBackgroundTrackingActive, liveFixDeps } from "../services/backgroundLocation";
import { handleLocationFix, shouldWatchLocation, syncBackgroundTracking } from "../services/backgroundLocation.core";
import { useDriverAuthStore } from "../state/driverAuth.store";
import { useDriverLifecycleStore } from "../state/driverLifecycle.store";
import { useDriverStandbyStore } from "../state/driverStandby.store";

const MISSION_PUBLISHING_STATES: readonly DriverLifecycleState[] = [
  "enRouteToPatient",
  "onScene",
  "transporting",
  "arrivedHospital",
];

/**
 * Single real-GPS source, mounted once at the root. Tracks while the driver is signed in (offline included: going
 * online requires a real fix), online, or on a mission (coarse + cheap when idle, 3s/5m high-accuracy on a mission), mirrors every fix into the standby
 * store's `gps`, and during an active mission publishes it to mission:{id}. While a mission is
 * enRouteToPatient/onScene/transporting the background task (dev build only) owns publishing so it
 * survives Google Maps taking the screen; this watcher is the fallback if background permission is denied.
 */
export function useDriverLocation(): void {
  const isOnline = useDriverStandbyStore((s) => s.isOnline);
  const currentState = useDriverLifecycleStore((s) => s.currentState);
  const missionActive = MISSION_PUBLISHING_STATES.includes(currentState);
  const signedIn = useDriverAuthStore((s) => s.status === "signedIn");
  const tracking = shouldWatchLocation(signedIn, isOnline, missionActive);

  useEffect(() => {
    syncBackgroundTracking(currentState, backgroundTrackingApi).catch(() => {
      // Denied permission / Expo Go: the foreground watcher below keeps publishing.
    });
  }, [currentState]);

  useEffect(() => {
    if (!tracking) return;
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted" || cancelled) return;
      // A stationary driver may not move the 50 m the watcher waits for: take one real fix now so Go online works.
      if (!missionActive) {
        // Location services off: no seed, the watcher below still starts and delivers once they are on.
        const first = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
        if (cancelled) return;
        if (first) handleLocationFix(first, liveFixDeps, false);
      }
      const sub = await Location.watchPositionAsync(
        missionActive
          ? { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 }
          : { accuracy: Location.Accuracy.Balanced, timeInterval: 10000, distanceInterval: 50 },
        (loc) => handleLocationFix(loc, liveFixDeps, missionActive && !isBackgroundTrackingActive())
      );
      if (cancelled) sub.remove();
      else subscription = sub;
    })().catch(() => {
      // Permission/provider errors leave the last known gps in place; nothing else to do.
    });

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [tracking, missionActive]);
}
