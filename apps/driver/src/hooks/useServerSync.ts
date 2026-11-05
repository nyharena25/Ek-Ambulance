import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { Alert } from "../lib/alert";
import { router } from "expo-router";
import type { DriverLifecycleState } from "@sahayak/domain";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import { createAuthSessionTracker, isNetworkFailure, verifiedDriverSession, type DriverAuthStatus } from "./otpAuth.core";
import { useDriverConsentStore } from "../state/driverConsent.store";
import { useDriverAuthStore } from "../state/driverAuth.store";
import {
  callServer,
  fetchOpenOffers,
  fetchBoard,
  fetchDriverProfile,
  registerPushToken,
  saveDriverProfile,
  setPresence,
  submitDriverApplication,
  submitKyc,
  uploadKycDocument,
  type ServerSession,
} from "../lib/driverServer";
import { getDevicePushToken } from "../services/dispatchNotifications";
import { getDriverRealtimeSession, getServerAdapter, setDriverRealtimeSession, setServerAdapter, useDriverLifecycleStore } from "../state/driverLifecycle.store";
import { useDriverConnectionStore } from "../state/driverConnection.store";
import { useActiveMissionStore } from "../state/activeMission.store";
import { heartbeatLocation, useDriverStandbyStore } from "../state/driverStandby.store";
import { useDriverProfileStore } from "../state/driverProfile.store";
import { createDriverRealtimeSession, devLog, mountMissionWatch, mountOffersChannel, type DriverRealtimeSession } from "../services/driverRealtime";
import type { DispatchOffer } from "@sahayak/domain";
import { telemetryQueueService } from "../services/telemetryQueue.service";
import { dismissAllNotifications, notifyIncomingOffer } from "../services/dispatchNotifications";
import { startTelemetryUploadLoop, syncQueuedPings } from "../services/telemetryUpload";

const ACTIVE_STATES: readonly DriverLifecycleState[] = ["enRouteToPatient", "onScene", "transporting", "arrivedHospital"];
const HEARTBEAT_MS = 10_000;
/** While the active-mission read is failing (unknown, or a last-known mission marked stale), retry this often. */
const MISSION_RETRY_MS = 15_000;
/** How often the time-dependent connection health (grace period, failure threshold) is re-derived. */
const HEALTH_EVALUATE_MS = 2_000;

/** Offers already shown, by offer id. The live push, its redelivery after a resubscribe and the reconnect re-read can all
 *  carry the same offer; a declined or expired one must never come back. */
const presentedOfferIds = new Set<string>();
// ponytail: plain set, cleared past a cap; offers are a handful per shift.
const PRESENTED_OFFERS_CAP = 200;

/** Shows a server offer, if this driver is free to take one. Shared by the live push and the reconnect recovery read. */
function presentOffer(offer: DispatchOffer, clockOffsetMs: number): void {
  const lifecycle = useDriverLifecycleStore.getState();
  // Busy or mid-offer: the server expires this offer on its own; nothing to show (and not marked seen).
  if (lifecycle.currentState !== "standby") return;
  if (presentedOfferIds.has(offer.offerId)) return devLog("DUPLICATE_DROPPED", { offer_id: offer.offerId });
  if (presentedOfferIds.size >= PRESENTED_OFFERS_CAP) presentedOfferIds.clear();
  presentedOfferIds.add(offer.offerId);
  devLog("OFFER_RECEIVED", { mission_id: offer.missionId, offer_id: offer.offerId });
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
    ...(offer.estimatedFareInr !== undefined ? { estimatedFareInr: String(offer.estimatedFareInr) } : {}),
    ...(offer.patientSummary ? { patientSummary: JSON.stringify(offer.patientSummary) } : {}),
  };
  router.push({ pathname: "/(shift)/offer", params });
  void notifyIncomingOffer(params as never);
}

/** The current session's access token, refreshed first by Supabase if it has expired. A backgrounded app resumes with an
 *  expired token in React state; using it got every reconnect refused (401) until the refresh ticker caught up, and that
 *  outage was shown as low connectivity. A failed read (offline refresh) falls back to the last known token, which the
 *  gateway may refuse - a retryable error, never a permanent sign-out. */
async function freshAccessToken(fallback: string | null): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    return error ? fallback : (data.session?.access_token ?? null);
  } catch {
    return fallback;
  }
}

/** The "restoring" screen's Retry: one refresh attempt with the stored refresh token. Success arrives as TOKEN_REFRESHED
 *  (signed in); a dead refresh token makes auth-js remove the session and emit SIGNED_OUT; a network failure leaves the
 *  driver in "restoring" (auth-js keeps retrying on its own). Returns false while still offline. */
export async function retrySessionRestore(): Promise<boolean> {
  try {
    const { error } = await supabase.auth.refreshSession();
    if (!error) return true;
    // Nothing usable is stored (no SIGNED_OUT is emitted for that): signed out.
    if (!isNetworkFailure(error)) useDriverAuthStore.setState({ status: "signedOut" });
    return false;
  } catch {
    return false;
  }
}

/** Local state that belongs to the account that just signed out (button, revoked refresh token, sign-out elsewhere). The
 *  realtime connection, presence heartbeat and telemetry loop stop with the session (useServerSync effects keyed on the
 *  user id). Kept on purpose: the store-and-forward telemetry queue (acknowledged uploads of a finished mission's track)
 *  and device preferences (language). */
function clearSignedOutDriverState(): void {
  useDriverLifecycleStore.getState().reset();
  useDriverStandbyStore.setState({ isOnline: false, isOfflineModalOpen: false, presenceErrorCode: null });
  useDriverConsentStore.getState().reset();
  useActiveMissionStore.getState().reset();
  presentedOfferIds.clear();
  dismissAllNotifications();
}

let refreshing: Promise<void> | null = null;
/**
 * The driver's Reconnect action: refreshes the session if needed, then restarts the realtime connection on the same
 * client (no new subscriptions). Each channel resubscribes and its onSubscribed re-reads the server (open offers, the
 * assigned mission), so the server state is refreshed too. The mission state is untouched: only a successful server read
 * that shows no such mission ends it. Concurrent taps share one run.
 */
export function refreshDriverConnection(): Promise<void> {
  refreshing ??= (async () => {
    try {
      await freshAccessToken(null);
      getDriverRealtimeSession()?.reconnect(true);
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/**
 * The driver app's connection to the server (DATA_AND_SYNC_SPECIFICATION.md 6, 7). Mounted once at the root. With a session the
 * server can verify it: makes the server authoritative for transitions (lifecycle store adapter), receives offers on
 * driver:{id}:offers, watches mission:{id} so a cancellation reaches a driver who is already driving (G-05), resumes an
 * assigned mission after a process kill (7.6) and heartbeats presence. Without a verified driver session it does nothing,
 * and the route gate (app/_layout.tsx) keeps the driver on the sign-in screens.
 */
export function useServerSync(): void {
  const [session, setSession] = useState<ServerSession | null>(null);
  // Effects key on the user, not the token: a refreshed token is read through this ref on every (re)connect, so a token
  // refresh never tears down and re-creates the realtime subscriptions.
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = session?.accessToken ?? null;
  const userId = session?.userId ?? null;
  const [realtime, setRealtime] = useState<DriverRealtimeSession | null>(null);
  const isOnline = useDriverStandbyStore((s) => s.isOnline);
  const currentState = useDriverLifecycleStore((s) => s.currentState);
  const activeMissionId = useDriverLifecycleStore((s) => s.activeMissionId);
  const missionActive = ACTIVE_STATES.includes(currentState);

  // Adopt the verified driver session, and drop it on sign-out, expiry or a wrong-role account. The status is set
  // synchronously from the auth event, so the route gate already knows when verifyOtp resolves; Supabase calls are
  // deferred out of the onAuthStateChange callback (calling the client inside it can deadlock on its auth lock).
  useEffect(() => {
    let alive = true;
    const adopt = (raw: Session | null, status: DriverAuthStatus) => {
      if (!alive) return;
      // A stored session that could not be refreshed yet (offline): not signed out, not usable. The route gate waits on
      // the index screen; auth-js's own refresh (or the Retry button) moves it on with TOKEN_REFRESHED or SIGNED_OUT.
      if (status === "restoring") return useDriverAuthStore.setState({ status });
      const s: ServerSession | null = status === "signedIn" ? verifiedDriverSession(raw) : null;
      const previousUserId = getServerAdapter()?.userId ?? null;
      if ((s?.userId ?? null) !== previousUserId) {
        // The KYC state belongs to one account: never route the next sign-in on the previous driver's profile.
        useDriverProfileStore.setState({ profile: null, status: "idle", errorCode: null });
        if (previousUserId) clearSignedOutDriverState();
      }
      useDriverAuthStore.setState({ status: s ? "signedIn" : "signedOut" });
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
        setTimeout(() => {
          void useDriverProfileStore.getState().load();
          // Consent is per account, not per session: read once for this user, never again on an hourly token refresh.
          if (useDriverConsentStore.getState().userId !== s.userId) void useDriverConsentStore.getState().load(s.userId);
          // Best-effort (G-21): getDevicePushToken() returns null without a real EAS project id, which this
          // repo does not have configured yet - registration then simply does not happen, never a fake token.
          void getDevicePushToken().then((device) => {
            if (device) void registerPushToken(s.userId, device.token, device.platform);
          });
        }, 0);
      }
    };
    const tracker = createAuthSessionTracker((raw, status) => adopt(raw as Session | null, status));
    supabase.auth
      .getSession()
      .then(({ data, error }) => tracker.initial({ session: data.session, error }))
      .catch((error: unknown) => tracker.initial({ session: null, error: error instanceof Error ? error : { message: String(error) } }));
    const { data } = supabase.auth.onAuthStateChange((event, raw) => tracker.event(event, raw));
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  // One Centrifugo connection per signed-in driver; its SDK lifecycle is the app's connection state.
  useEffect(() => {
    if (!userId) return;
    const connection = useDriverConnectionStore.getState();
    connection.reset();
    const rt = createDriverRealtimeSession(() => freshAccessToken(tokenRef.current), {
      onTransportEvent: (event) => useDriverConnectionStore.getState().applyTransport(event),
      onPublishRejected: (error) => devLog("PUBLISH_REJECTED", { error: error instanceof Error ? error.message : "unknown" }),
    });
    setDriverRealtimeSession(rt);
    setRealtime(rt);
    // Back in the foreground: restart a socket the SDK gave up on, or skip a long backoff. A connected socket is left alone.
    const appState = AppState.addEventListener("change", (s) => {
      if (s === "active") rt.reconnect(false);
    });
    return () => {
      appState.remove();
      setDriverRealtimeSession(null);
      setRealtime(null);
      rt.teardown();
      useDriverConnectionStore.getState().reset();
    };
  }, [userId]);

  // Health depends on elapsed time (grace period, failure threshold), so it is re-derived on a timer. Fallback appears only
  // for an active mission on a socket that is really down, and clears itself - flushing the store-and-forward queue - when
  // the socket is back.
  useEffect(() => {
    if (!userId) return;
    const timer = setInterval(() => {
      const lifecycle = useDriverLifecycleStore.getState();
      const transition = useDriverConnectionStore.getState().evaluate(Date.now(), ACTIVE_STATES.includes(lifecycle.currentState));
      if (transition) devLog(transition === "entered" ? "FALLBACK_ENTERED" : "FALLBACK_EXITED", { mission_id: lifecycle.activeMissionId ?? undefined });
      const missionId = lifecycle.activeMissionId;
      if (transition === "exited" && missionId) {
        void telemetryQueueService.flushQueue((pings) => syncQueuedPings(missionId, pings)).then(({ syncedCount, remainingCount }) => {
          const connection = useDriverConnectionStore.getState();
          connection.setQueuedPingsCount(remainingCount);
          if (syncedCount > 0) connection.markRestored(syncedCount);
        });
      }
    }, HEALTH_EVALUATE_MS);
    return () => clearInterval(timer);
  }, [userId]);

  // Offers: server -> this driver only (never a broadcast channel that would expose every open mission).
  useEffect(() => {
    if (!realtime || !userId || !isOnline) return;
    return mountOffersChannel(userId, realtime, {
      onOffer: presentOffer,
      onRevoked: (revoked) => {
        const lifecycle = useDriverLifecycleStore.getState();
        if (lifecycle.currentState !== "offered" || lifecycle.activeOfferId !== revoked.offerId) return;
        devLog("OFFER_REVOKED", { offer_id: revoked.offerId, reason: revoked.reason });
        lifecycle.send({ type: "SERVER_OFFER_REVOKED", payload: { offerId: revoked.offerId, reason: revoked.reason } });
        dismissAllNotifications();
        router.replace("/(shift)/standby");
      },
      // (Re)subscribed: an offer pushed while the socket was down is not replayed by the channel, so re-read the offers
      // the server still holds open for this driver.
      onSubscribed: () => {
        devLog("RECONCILIATION", { scope: "offers" });
        void fetchOpenOffers().then((result) => {
          const first = result.ok ? result.data.offers[0] : undefined;
          if (result.ok && first) presentOffer(first, result.data.clockOffsetMs);
        });
      },
    });
  }, [realtime, userId, isOnline]);

  // Mission watch: the server ended the mission under a driver who is already driving.
  useEffect(() => {
    // Keyed on "a mission is active", not on its stage: en route -> on scene -> transporting must keep one subscription.
    if (!realtime || !activeMissionId || !missionActive) return;
    const missionId = activeMissionId;
    return mountMissionWatch(missionId, realtime, {
      onCancelled: (info) => {
        const lifecycle = useDriverLifecycleStore.getState();
        if (lifecycle.activeMissionId !== missionId) return;
        lifecycle.send({ type: "SERVER_MISSION_CANCELLED", payload: { missionId, cancelledBy: info.cancelledBy, reason: info.reason } });
        useActiveMissionStore.getState().missionEndAcknowledged(missionId);
        router.replace("/(shift)/standby");
        Alert.alert("Mission ended", info.cancelledBy === "patient" ? "The patient cancelled this mission." : "This mission was ended by dispatch.");
      },
      // Resubscribing may have skipped the cancellation or a stage change: re-read the server's view (rule 3, 7.6). Only a
      // successful read that shows no such mission ends it; a network blip never drops a live mission.
      onSubscribed: () => {
        devLog("RECONCILIATION", { scope: "mission", mission_id: missionId });
        void useActiveMissionStore.getState().refresh("mission_resubscribed");
      },
    });
  }, [realtime, activeMissionId, missionActive]);

  // Current Mission recovery (7.6): the machine is memory-only, the assignment is on the server. Read it on sign-in (cold
  // start, session restore), on every return to the foreground and on every transition INTO "connected" (a realtime outage
  // is never read as "no mission"), and keep retrying while the read fails. No auto-navigation: the Current Mission card on
  // standby is the route back.
  useEffect(() => {
    const missions = useActiveMissionStore.getState();
    missions.reset();
    if (!userId) return;
    void missions.refresh("session");
    const appState = AppState.addEventListener("change", (s) => {
      if (s === "active") void useActiveMissionStore.getState().refresh("foreground");
    });
    const unsubscribeConnection = useDriverConnectionStore.subscribe((now, before) => {
      if (now.status === "connected" && before.status !== "connected") void useActiveMissionStore.getState().refresh("realtime_connected");
    });
    const retry = setInterval(() => {
      const { view } = useActiveMissionStore.getState();
      if (view.kind === "unknown" || (view.kind === "active" && view.stale)) void useActiveMissionStore.getState().refresh("retry");
    }, MISSION_RETRY_MS);
    return () => {
      appState.remove();
      unsubscribeConnection();
      clearInterval(retry);
    };
  }, [userId]);

  // Every lifecycle change (accept, stage, end) re-reads the server's view, so the card follows the server.
  useEffect(() => {
    if (!userId) return;
    void useActiveMissionStore.getState().refresh("lifecycle");
  }, [userId, activeMissionId, currentState]);

  // Live GPS is persisted server-side in acknowledged batches: the final fare is computed from the measured transport leg.
  useEffect(() => {
    if (!userId) return;
    return startTelemetryUploadLoop(() => useDriverLifecycleStore.getState().activeMissionId);
  }, [userId]);

  // Presence heartbeat: the server treats a driver as present for 30 s after the last one (dispatch_config / 6.6).
  useEffect(() => {
    if (!userId || !isOnline) return;
    const beat = async () => {
      // No real fix yet: send nothing. A beat without a position would still refresh last_seen_at on whatever position
      // the server holds from an earlier session, and the city preset is not a position at all.
      const location = heartbeatLocation(useDriverStandbyStore.getState());
      if (!location) return;
      // The fix time travels with the position: re-sending an old fix never makes it look fresh to the dispatcher.
      const result = await setPresence(true, location, location.fixedAt);
      if (result.ok) useDriverConnectionStore.getState().recordHeartbeat();
      if (!result.ok && result.error.code === "not_verified" && getServerAdapter()) {
        // Not (or no longer) approved: never keep showing "online" for a driver the dispatcher cannot see.
        useDriverStandbyStore.getState().confirmGoOffline();
      }
    };
    void beat();
    const timer = setInterval(() => void beat(), HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [userId, isOnline]);
}
