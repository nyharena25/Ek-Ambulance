import { useCallback, useEffect, useState } from "react";
import { Alert } from "../lib/alert";
import { router } from "expo-router";
import type { BoardEmergency } from "@sahayak/domain";
import { getServerAdapter, useDriverLifecycleStore } from "../state/driverLifecycle.store";
import { useDriverBoardStore, startBoardPolling } from "../state/driverBoard.store";
import { useDriverStandbyStore } from "../state/driverStandby.store";
import { canAcceptFromBoard } from "../state/driverAvailability.core";
import { driverErrorMessage } from "../lib/driverServer.core";
import { driverBookingStrings } from "../i18n/driverBookingStrings";

/** Keeps the board fresh while a screen that shows it is mounted and the driver is online. One interval however many screens. */
export function useBoardPolling(): void {
  const isOnline = useDriverStandbyStore((s) => s.isOnline);
  useEffect(() => {
    // Offline: one refresh so a list left on screen is cleared, then nothing to poll.
    if (!isOnline) {
      void useDriverBoardStore.getState().refresh();
      return;
    }
    return startBoardPolling();
  }, [isOnline]);
}

/**
 * Taking an emergency from the Booking board. `canAccept` comes from the lifecycle machine (only `standby` may accept), so
 * a driver who holds an offer or a mission sees the list but cannot act on it; the server refuses a second claim anyway.
 */
export function useClaimEmergency() {
  const currentState = useDriverLifecycleStore((s) => s.currentState);
  const language = useDriverStandbyStore((s) => s.language);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const canAccept = canAcceptFromBoard(currentState) && claimingId === null;

  const doClaim = useCallback(async (e: BoardEmergency) => {
    const lifecycle = useDriverLifecycleStore.getState();
    if (!canAcceptFromBoard(lifecycle.currentState)) return;
    setClaimingId(e.missionId);
    // The machine takes an accept only from `offered`: a board claim is an offer the driver made themselves.
    lifecycle.send({ type: "SERVER_OFFER_RECEIVED", payload: { offerId: e.missionId, missionId: e.missionId } });
    const driverId = getServerAdapter()?.userId ?? lifecycle.driverId;
    if (!driverId) {
      useDriverLifecycleStore.getState().send({ type: "SERVER_OFFER_TIMEOUT", payload: { offerId: e.missionId } });
      setClaimingId(null);
      Alert.alert("Not recorded", driverErrorMessage("not_found"));
      void useDriverBoardStore.getState().refresh();
      return;
    }
    const result = await lifecycle.submit({
      type: "ACCEPT_DISPATCH",
      payload: { missionId: e.missionId, driverId, offerId: e.missionId, acceptedAt: new Date().toISOString(), source: "board" },
    });
    setClaimingId(null);
    if (!result.ok) {
      // Not recorded: the machine did not move, so stand it down the way an expiry does, say why, and show what the server holds now.
      useDriverLifecycleStore.getState().send({ type: "SERVER_OFFER_TIMEOUT", payload: { offerId: e.missionId } });
      Alert.alert("Not recorded", driverErrorMessage(result.error.code));
      void useDriverBoardStore.getState().refresh();
      return;
    }
    useDriverBoardStore.getState().markTaken(e.missionId);
    router.replace({ pathname: "/mission/[id]", params: { id: e.missionId, pickupLat: String(e.pickup.latitude), pickupLng: String(e.pickup.longitude) } });
  }, []);

  /** Asks first: an accept is a commitment to drive, and a card is easy to tap by accident. */
  const claim = useCallback(
    (e: BoardEmergency) => {
      const t = driverBookingStrings[language];
      Alert.alert(t.confirmTitle, t.confirmBody(e.distanceKm, e.patientSummary?.primaryComplaint), [
        { text: t.confirmNo, style: "cancel" },
        { text: t.confirmYes, onPress: () => void doClaim(e) },
      ]);
    },
    [doClaim, language]
  );

  return { claim, canAccept, claimingId, currentState };
}
