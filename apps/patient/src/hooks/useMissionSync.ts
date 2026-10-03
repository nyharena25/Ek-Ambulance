import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { readMissionCancelled, readMissionCompleted, readTransportStarted, type ParsedLifecycleMessage } from "@sahayak/domain";
import { usePatientLifecycleStore } from "../state/patientLifecycle.store";
import { authStorage } from "../lib/supabaseClient";
import { fetchAssignedDriver, fetchEventsAfter, fetchLatestEvent, fetchMissionSnapshot } from "../lib/missionApi";
import { createMissionSync, type MissionSync } from "../services/missionSync.core";
import { clearPersistedMission, loadPersistedMission, savePersistedMission } from "../services/missionSession.core";
import { translateLifecycleMessage } from "../services/missionLifecycleBridge";
import { useMissionChannel, type DriverTelemetry } from "./useMissionChannel";
import { devLog } from "../services/missionChannel.service";

/** While the socket is not healthy the database is read on this cadence, so a missed transition still arrives. */
const UNHEALTHY_RECONCILE_MS = 10_000;
/** While searching, even on a healthy socket: a publish the server could not deliver (pg_net does not retry) must not leave
 *  the patient on "Finding an ambulance" after the database already says ACCEPTED or NO_AMBULANCE_AVAILABLE. */
const SEARCHING_RECONCILE_MS = 20_000;

export interface UseMissionSyncOptions {
  missionId: string | null;
  /** Supabase access token. Null means no real session: the channel reports an error and nothing is read from the server. */
  authToken: string | null;
  onTelemetryReceived?: (telemetry: DriverTelemetry) => void;
}

/**
 * Sequence-aware mission tracking (DATA_AND_SYNC_SPECIFICATION.md 7.5): subscribes to mission:{id}, orders and de-duplicates
 * events by `seq`, recovers gaps from the server, resumes after a process kill, and clears its baseline on a terminal state.
 * The mission id is the route's/store's, never a payload's.
 */
export function useMissionSync({ missionId, authToken, onTelemetryReceived }: UseMissionSyncOptions) {
  const send = usePatientLifecycleStore((s) => s.send);
  const currentState = usePatientLifecycleStore((s) => s.currentState);
  const syncRef = useRef<MissionSync | null>(null);
  const earlyRef = useRef<ParsedLifecycleMessage[]>([]);

  useEffect(() => {
    syncRef.current = null;
    earlyRef.current = [];
    if (!missionId || !authToken) return;
    let cancelled = false;
    void (async () => {
      const persisted = await loadPersistedMission(authStorage);
      if (cancelled) return;
      const sync = createMissionSync({
        lastSeq: persisted?.missionId === missionId ? persisted.lastSeq : null,
        apply: (message) => send(translateLifecycleMessage(message, missionId)),
        hydrate: async (s) => {
          // The snapshot is the mission row; who is coming, the hospital and the final fare come from its stored events,
          // so a reconnect at any stage shows what the server recorded (never a default).
          const after = (statuses: string[]) => statuses.includes(s.status);
          const [driver, transport, completed, cancelled] = await Promise.all([
            s.status === "requesting" ? undefined : fetchAssignedDriver(missionId),
            after(["transporting", "arrived_hospital", "completed"]) ? fetchLatestEvent(missionId, "TRANSPORT_STARTED") : null,
            s.status === "completed" ? fetchLatestEvent(missionId, "MISSION_COMPLETED") : null,
            s.status === "cancelled" ? fetchLatestEvent(missionId, "MISSION_CANCELLED") : null,
          ]);
          send({
            type: "HYDRATE",
            payload: {
              missionId, status: s.status, vehicleType: s.vehicleType, jurisdiction: s.jurisdiction, pickup: s.pickup, fareDetails: s.fareDetails, driver,
              destination: transport ? readTransportStarted(transport.data).destination : undefined,
              completion: completed ? readMissionCompleted(completed.data) : undefined,
              cancellation: cancelled ? readMissionCancelled(cancelled.data) : undefined,
            },
          });
        },
        fetchEventsAfter: (seq) => fetchEventsAfter(missionId, seq),
        fetchSnapshot: () => fetchMissionSnapshot(missionId),
        persist: (lastSeq) => void savePersistedMission(authStorage, { missionId, lastSeq }),
        onError: (e) => console.warn("[missionSync]", e),
      });
      syncRef.current = sync;
      for (const m of earlyRef.current.splice(0)) sync.handle(m);
      // Rule 9: a cold launch has an idle machine, so jump to the server's state; a warm one only needs to catch up.
      const cold = usePatientLifecycleStore.getState().currentState === "idle";
      void sync.reconcile(cold ? "snapshot" : "auto");
    })();
    return () => {
      cancelled = true;
      syncRef.current = null;
    };
  }, [missionId, authToken, send]);

  // Rule 8: a terminal state ends the booking, so the persisted baseline must not leak into the next one.
  useEffect(() => {
    if (currentState === "cancelled" || currentState === "receiptConfirmed") void clearPersistedMission(authStorage);
  }, [currentState]);

  const channel = useMissionChannel({
    missionId,
    authToken,
    onTelemetryReceived: (telemetry) => {
      // A live position while this app still thinks it is searching proves a DRIVER_ACCEPTED was missed: catch up now.
      if (usePatientLifecycleStore.getState().currentState === "requesting") void syncRef.current?.reconcile("auto");
      onTelemetryReceived?.(telemetry);
    },
    onLifecycleMessage: (message) => {
      if (syncRef.current) syncRef.current.handle(message);
      else if (authToken) earlyRef.current.push(message);
      else send(translateLifecycleMessage(message, missionId ?? ""));
    },
    onResubscribed: ({ recovered }) => {
      if (!recovered) {
        devLog("RECONCILIATION", { mission_id: missionId ?? undefined, trigger: "resubscribe" });
        void syncRef.current?.reconcile("auto");
      }
    },
  });

  // Reconcile against the database (authoritative) whenever realtime cannot be trusted to have delivered everything.
  const healthy = channel.transportHealth === "healthy";
  const searching = currentState === "requesting";
  useEffect(() => {
    if (!missionId || !authToken || (healthy && !searching)) return;
    const every = healthy ? SEARCHING_RECONCILE_MS : UNHEALTHY_RECONCILE_MS;
    const timer = setInterval(() => {
      devLog("RECONCILIATION", { mission_id: missionId, trigger: healthy ? "searching" : "transport_unhealthy" });
      void syncRef.current?.reconcile("auto");
    }, every);
    return () => clearInterval(timer);
  }, [missionId, authToken, healthy, searching]);

  // Back to the foreground: the OS may have frozen the socket while events were published.
  useEffect(() => {
    if (!missionId || !authToken) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      devLog("RECONCILIATION", { mission_id: missionId, trigger: "foreground" });
      void syncRef.current?.reconcile("auto");
    });
    return () => sub.remove();
  }, [missionId, authToken]);

  return channel;
}
