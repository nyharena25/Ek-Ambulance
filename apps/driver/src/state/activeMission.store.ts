import { create } from "zustand";
import { Alert } from "react-native";
import { fetchAssignedMission } from "../lib/driverServer";
import { devLog } from "../services/driverRealtime";
import { getServerAdapter, serverCallActivity, useDriverLifecycleStore } from "./driverLifecycle.store";
import {
  reconcileRead,
  viewAfterMissionEndAcknowledged,
  type ActiveMissionView,
  type MachineSnapshot,
} from "./activeMission.core";

/**
 * Current Mission (7.6): the server's answer to "which mission is this driver on?", re-read on sign-in, foreground, realtime
 * (re)connect, mission (re)subscribe and every lifecycle change. This store only caches that answer for the UI; the machine is
 * moved by `lifecycleSyncFor` on fresh successful reads only. Realtime being down never clears it.
 */
interface ActiveMissionStoreState {
  view: ActiveMissionView;
  refreshing: boolean;
  /** Concurrent callers share one read. */
  refresh: (reason: string) => Promise<void>;
  /** COMPLETE / ABORT returned 200, or the server published the cancellation: the mission is over. */
  missionEndAcknowledged: (missionId: string) => void;
  reset: () => void;
}

const snapshot = (): MachineSnapshot => {
  const s = useDriverLifecycleStore.getState();
  const calls = serverCallActivity();
  return { currentState: s.currentState, activeMissionId: s.activeMissionId, pendingCalls: calls.pending, callEpoch: calls.epoch };
};

let inFlight: Promise<void> | null = null;

export const useActiveMissionStore = create<ActiveMissionStoreState>((set, get) => ({
  view: { kind: "checking" },
  refreshing: false,

  refresh: (reason) => {
    inFlight ??= (async () => {
      set({ refreshing: true });
      try {
        // A read that raced a local transition (accept, complete, ...) may predate it: discard and read again.
        for (let attempt = 0; attempt < 3; attempt++) {
          const driverId = getServerAdapter()?.userId;
          if (!driverId) return;
          const before = snapshot();
          const result = await fetchAssignedMission(driverId);
          if (getServerAdapter()?.userId !== driverId) return; // signed out or switched account meanwhile
          const outcome = reconcileRead(get().view, result, before, snapshot());
          if (outcome.discard) continue;
          const { view, sync } = outcome;
          set({ view });
          devLog("ACTIVE_MISSION_READ", { reason, view: view.kind, mission_id: view.kind === "active" ? view.mission.missionId : undefined });
          if (view.kind === "integrity") {
            // Diagnostics: the database is meant to make this impossible (missions_one_active_per_driver).
            console.warn(`[driver] integrity: ${view.missionIds.length} active missions for driver ${driverId}: ${view.missionIds.join(", ")}`);
          }
          const lifecycle = useDriverLifecycleStore.getState();
          if (sync.type === "hydrate") {
            lifecycle.send({ type: "HYDRATE", payload: { missionId: sync.missionId, status: sync.status, driverId } });
          } else if (sync.type === "end") {
            lifecycle.send({ type: "SERVER_MISSION_CANCELLED", payload: { missionId: sync.missionId } });
            Alert.alert("Mission ended", "This mission is no longer assigned to you. It was completed or cancelled on the server.");
          }
          return;
        }
      } finally {
        inFlight = null;
        set({ refreshing: false });
      }
    })();
    return inFlight;
  },

  missionEndAcknowledged: (missionId) => {
    set({ view: viewAfterMissionEndAcknowledged(get().view, missionId) });
    void get().refresh("mission_end_acknowledged");
  },

  reset: () => set({ view: { kind: "checking" }, refreshing: false }),
}));
