import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import { driverStateForStatus, type DriverLifecycleState } from "@sahayak/domain";
import { supabase } from "../lib/supabaseClient";
import {
  callServer,
  fetchAssignedMission,
  fetchBoard,
  fetchDriverProfile,
  getServerSession,
  registerPushToken,
  saveDriverProfile,
  setPresence,
  submitDriverApplication,
  submitKyc,
  uploadKycDocument,
  type ServerSession,
} from "../lib/driverServer";
import { getDevicePushToken } from "../services/dispatchNotifications";
import { getServerAdapter, setServerAdapter, useDriverLifecycleStore } from "../state/driverLifecycle.store";
import { useDriverStandbyStore } from "../state/driverStandby.store";
import { useDriverProfileStore } from "../state/driverProfile.store";
import { mountMissionWatch, mountOffersChannel } from "../services/driverRealtime";
import { dismissAllNotifications, notifyIncomingOffer } from "../services/dispatchNotifications";
import { startTelemetryUploadLoop } from "../services/telemetryUpload";

const ACTIVE_STATES: readonly DriverLifecycleState[] = ["enRouteToPatient", "onScene", "transporting", "arrivedHospital"];
const HEARTBEAT_MS = 10_000;

/**
 * The driver app's connection to the server (DATA_AND_SYNC_SPECIFICATION.md 6, 7). Mounted once at the root. With a session the
 * server can verify it: makes the server authoritative for transitions (lifecycle store adapter), receives offers on
 * driver:{id}:offers, watches mission:{id} so a cancellation reaches a driver who is already driving (G-05), resumes an
 * assigned mission after a process kill (7.6) and heartbeats presence. Without such a session (local development with a mock
 * login) it does nothing and the app behaves as it always did.
 */
export function useServerSync(): void {
  const [session, setSession] = useState<ServerSession | null>(null);
  const isOnline = useDriverStandbyStore((s) => s.isOnline);
  const currentState = useDriverLifecycleStore((s) => s.currentState);
  const activeMissionId = useDriverLifecycleStore((s) => s.activeMissionId);

  // Adopt the verified session, and drop it on sign-out.
  useEffect(() => {
    let alive = true;
    const adopt = async () => {
      const s = await getServerSession();
      if (!alive) return;
      setSession(s);
      setServerAdapter(
        s
          ? {
              userId: s.userId,
              accessToken: s.accessToken,
              call: callServer,
              setPresence,
              fetchBoard,
              fetchProfile: fetchDriverProfile,
              saveProfile: saveDriverProfile,
              submitApplication: submitDriverApplication,
              submitKyc,
              uploadDocument: (slot, asset) => uploadKycDocument(s.userId, slot, asset),
            }
          : null
      );
      // The header and the offer screen show the driver's own name, plate and tier, so read the profile as soon as the server can answer.
      if (s) {
        void useDriverProfileStore.getState().load();
        // Best-effort (G-21): getDevicePushToken() returns null without a real EAS project id, which this
        // repo does not have configured yet - registration then simply does not happen, never a fake token.
        void getDevicePushToken().then((device) => {
          if (device) void registerPushToken(s.userId, device.token, device.platform);
        });
      }
    };
    void adopt();
    const { data } = supabase.auth.onAuthStateChange(() => void adopt());
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  // Offers: server -> this driver only (never a broadcast channel that would expose every open mission).
  useEffect(() => {
    if (!session || !isOnline) return;
    return mountOffersChannel(session.userId, session.accessToken, {
      onOffer: (offer, clockOffsetMs) => {
        const lifecycle = useDriverLifecycleStore.getState();
        // Busy or mid-offer: the server expires this offer on its own; nothing to show.
        if (lifecycle.currentState !== "standby") return;
        lifecycle.send({ type: "SERVER_OFFER_RECEIVED", payload: { offerId: offer.offerId, missionId: offer.missionId } });
        const params: Record<string, string> = {
          missionId: offer.missionId,
          offerId: offer.offerId,
          expiresAt: offer.expiresAt,
          clockOffsetMs: String(clockOffsetMs),
          ...(offer.urgency ? { acuity: offer.urgency } : {}),
          ...(offer.requiredVehicleType ? { requiredVehicleType: offer.requiredVehicleType } : {}),
          ...(offer.pickup?.address ? { address: offer.pickup.address } : {}),
          ...(offer.pickup?.landmark ? { landmark: offer.pickup.landmark } : {}),
          ...(offer.pickup ? { pickupLat: String(offer.pickup.latitude), pickupLng: String(offer.pickup.longitude) } : {}),
          ...(offer.distanceKm !== undefined ? { distanceKm: String(offer.distanceKm) } : {}),
          ...(offer.etaMinutes !== undefined ? { etaMinutes: String(offer.etaMinutes) } : {}),
          ...(offer.patientSummary ? { patientSummary: JSON.stringify(offer.patientSummary) } : {}),
        };
        router.push({ pathname: "/(shift)/offer", params });
        void notifyIncomingOffer(params as never);
      },
      onRevoked: (revoked) => {
        const lifecycle = useDriverLifecycleStore.getState();
        if (lifecycle.currentState !== "offered" || lifecycle.activeOfferId !== revoked.offerId) return;
        lifecycle.send({ type: "SERVER_OFFER_REVOKED", payload: { offerId: revoked.offerId, reason: revoked.reason } });
        dismissAllNotifications();
        router.replace("/(shift)/standby");
      },
    });
  }, [session, isOnline]);

  // Mission watch: the server ended the mission under a driver who is already driving.
  useEffect(() => {
    if (!session || !activeMissionId || !ACTIVE_STATES.includes(currentState)) return;
    const missionId = activeMissionId;
    const end = (cancelledBy?: "patient" | "driver" | "system", reason?: string) => {
      const lifecycle = useDriverLifecycleStore.getState();
      if (lifecycle.activeMissionId !== missionId) return;
      lifecycle.send({ type: "SERVER_MISSION_CANCELLED", payload: { missionId, cancelledBy, reason } });
      router.replace("/(shift)/standby");
      Alert.alert("Mission ended", cancelledBy === "patient" ? "The patient cancelled this mission." : "This mission was ended by dispatch.");
    };
    return mountMissionWatch(missionId, session.accessToken, {
      onCancelled: (info) => end(info.cancelledBy, info.reason),
      // Resubscribing may have skipped the cancellation: read the server's view (rule 3, 7.6 "mission ends while offline").
      onSubscribed: () => {
        // Only a successful read that shows no such mission ends it; a network blip must never drop a live mission.
        void fetchAssignedMission().then((result) => {
          if (result.ok && (!result.data || result.data.missionId !== missionId)) end();
        });
      },
    });
  }, [session, activeMissionId, currentState]);

  // Resume after a process kill: the machine is memory-only, the assignment is on the server (7.6).
  useEffect(() => {
    if (!session) return;
    const lifecycle = useDriverLifecycleStore.getState();
    if (ACTIVE_STATES.includes(lifecycle.currentState)) return;
    void fetchAssignedMission().then((result) => {
      const row = result.ok ? result.data : null;
      if (!row || driverStateForStatus(row.status) === null) return;
      const now = useDriverLifecycleStore.getState();
      if (ACTIVE_STATES.includes(now.currentState)) return;
      now.send({ type: "HYDRATE", payload: { missionId: row.missionId, status: row.status, driverId: session.userId } });
      router.replace({
        pathname: "/mission/[id]",
        params: { id: row.missionId, ...(row.pickup ? { pickupLat: String(row.pickup.latitude), pickupLng: String(row.pickup.longitude) } : {}) },
      });
    });
  }, [session]);

  // Live GPS is persisted server-side in acknowledged batches: the final fare is computed from the measured transport leg.
  useEffect(() => {
    if (!session) return;
    return startTelemetryUploadLoop(() => useDriverLifecycleStore.getState().activeMissionId);
  }, [session]);

  // Presence heartbeat: the server treats a driver as present for 30 s after the last one (dispatch_config / 6.6).
  useEffect(() => {
    if (!session || !isOnline) return;
    const beat = async () => {
      const result = await setPresence(true, useDriverStandbyStore.getState().gps);
      if (!result.ok && result.error.code === "not_verified" && getServerAdapter()) {
        // Not (or no longer) approved: never keep showing "online" for a driver the dispatcher cannot see.
        useDriverStandbyStore.getState().confirmGoOffline();
      }
    };
    void beat();
    const timer = setInterval(() => void beat(), HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [session, isOnline]);
}
