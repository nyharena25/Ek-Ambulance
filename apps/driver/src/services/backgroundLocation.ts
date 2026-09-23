import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { useDriverConnectionStore } from "../state/driverConnection.store";
import { publishDriverTelemetry, useDriverLifecycleStore } from "../state/driverLifecycle.store";
import { useDriverStandbyStore } from "../state/driverStandby.store";
import {
  BACKGROUND_LOCATION_TASK,
  handleLocationFix,
  type BackgroundTrackingApi,
  type LocationFixDeps,
  type LocationObjectLike,
} from "./backgroundLocation.core";
import { telemetryQueueService } from "./telemetryQueue.service";

export const liveFixDeps: LocationFixDeps = {
  setGps: (gps) => useDriverStandbyStore.getState().setGps(gps),
  getActiveMissionId: () => useDriverLifecycleStore.getState().activeMissionId,
  isFallbackActive: () => useDriverConnectionStore.getState().isFallbackActive,
  enqueuePing: (missionId, coords, meta) => telemetryQueueService.enqueuePing(missionId, coords, meta),
  publish: publishDriverTelemetry,
};

// defineTask must run at module load (before the OS delivers a fix), so this file is imported from the root hook.
// ponytail: the handler reuses the in-process stores, so it publishes while the app process is alive
// (Google Maps in front). If Android kills the process, the headless task has no active mission and drops fixes;
// persist the mission id + auth token if that matters.
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  for (const loc of (data as { locations: LocationObjectLike[] }).locations) handleLocationFix(loc, liveFixDeps);
});

let active = false;
export const isBackgroundTrackingActive = () => active;

export const backgroundTrackingApi: BackgroundTrackingApi = {
  isRunning: () => Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK),
  start: async () => {
    const fg = await Location.requestForegroundPermissionsAsync();
    const bg = fg.granted ? await Location.requestBackgroundPermissionsAsync() : fg;
    if (!bg.granted) throw new Error("Background location permission denied");
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 3000,
      distanceInterval: 5,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "Sahayak Ambulance Dispatch Active",
        notificationBody: "Broadcasting live emergency mission telemetry",
        notificationColor: "#1D4ED8",
      },
    });
    active = true;
  },
  stop: async () => {
    active = false;
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  },
};
