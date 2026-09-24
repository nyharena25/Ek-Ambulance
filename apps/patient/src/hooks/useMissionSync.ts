import { useEffect, useRef } from "react";
import type { ParsedLifecycleMessage } from "@sahayak/domain";
import { usePatientLifecycleStore } from "../state/patientLifecycle.store";
import { authStorage } from "../lib/supabaseClient";
import { fetchEventsAfter, fetchMissionSnapshot } from "../lib/missionApi";
import { createMissionSync, type MissionSync } from "../services/missionSync.core";
import { clearPersistedMission, loadPersistedMission, savePersistedMission } from "../services/missionSession.core";
import { translateLifecycleMessage } from "../services/missionLifecycleBridge";
import { useMissionChannel, type DriverTelemetry } from "./useMissionChannel";

export interface UseMissionSyncOptions {
  missionId: string | null;
  /** Supabase access token. Null means no real session: the dev mock channel runs and nothing is read from the server. */
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
        hydrate: (s) =>
          send({
            type: "HYDRATE",
            payload: { missionId, status: s.status, vehicleType: s.vehicleType, jurisdiction: s.jurisdiction, pickup: s.pickup, fareDetails: s.fareDetails },
          }),
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
    onTelemetryReceived,
    onLifecycleMessage: (message) => {
      if (syncRef.current) syncRef.current.handle(message);
      else if (authToken) earlyRef.current.push(message);
      else send(translateLifecycleMessage(message, missionId ?? ""));
    },
    onResubscribed: ({ recovered }) => {
      if (!recovered) void syncRef.current?.reconcile("auto");
    },
  });

  return channel;
}
