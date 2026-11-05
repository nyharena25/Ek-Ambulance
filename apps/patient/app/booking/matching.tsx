import { useEffect, useRef, useState } from "react";
import { BackHandler, Platform } from "react-native";
import { Alert } from "../../src/lib/alert";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ActiveMatchingScreen } from "../../src/screens";
import { AIS125VehicleType } from "@sahayak/domain";
import { returnHome } from "../../src/navigation/returnHome";
import { formatCoordinates } from "../../src/services/mapGeo.core";
import { usePatientLifecycleStore } from "../../src/state/patientLifecycle.store";
import { usePatientAuthStore, realAccessToken } from "../../src/state/patientAuth.store";
import { useMissionSync } from "../../src/hooks/useMissionSync";
import { cancelMission, fetchMissionCreatedAt } from "../../src/lib/missionApi";
import { cancelReasonForKey, createMissionErrorMessage } from "../../src/lib/missionApi.core";

export default function BookingMatchingRoute() {
  const router = useRouter();
  const send = usePatientLifecycleStore((s) => s.send);
  const resetLifecycle = usePatientLifecycleStore((s) => s.reset);
  const currentState = usePatientLifecycleStore((s) => s.currentState);
  const context = usePatientLifecycleStore((s) => s.context);
  const missionId = context.missionId;
  const accessToken = realAccessToken(usePatientAuthStore((s) => s.session));
  const params = useLocalSearchParams<{
    vehicleType?: string;
    careLevel?: string;
    jurisdiction?: string;
    address?: string;
    lat?: string;
    lon?: string;
  }>();

  // The id survives the machine clearing it on `cancelled`, so the cancelled screen can still name the mission.
  const lastMissionIdRef = useRef<string | null>(null);
  if (missionId) lastMissionIdRef.current = missionId;
  const leavingRef = useRef(false);

  // The countdown counts from the server's creation time, so it matches the drivers' card and survives leaving and re-entering.
  const [startedAtMs, setStartedAtMs] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (!accessToken || !missionId) return;
    let alive = true;
    void fetchMissionCreatedAt(missionId).then((ms) => {
      if (alive && ms !== null) setStartedAtMs(ms);
    });
    return () => {
      alive = false;
    };
  }, [accessToken, missionId]);

  // The type the request really carried; undefined (not a made-up type) if neither the machine nor the link has one.
  const vehicleType = context.vehicleType ?? ((params.vehicleType as AIS125VehicleType | undefined) || undefined);
  // context.pickup is the real coordinate confirm.tsx sent to create_mission, hydrated into the machine the
  // moment the mission was created - always present in the same-session flow that reaches this screen. Route
  // params are a real (not fabricated) fallback only for a cold re-entry deep link. No fabricated coordinate:
  // if neither is available, there is genuinely no pickup to show.
  const paramLat = params.lat ? parseFloat(params.lat) : null;
  const paramLon = params.lon ? parseFloat(params.lon) : null;
  const latitude = context.pickup?.latitude ?? paramLat;
  const longitude = context.pickup?.longitude ?? paramLon;
  const hasRealPickup = latitude !== null && longitude !== null;
  const pickupAddress = params.address || (hasRealPickup ? formatCoordinates({ latitude, longitude }) : "");

  // Listen while searching: DRIVER_ACCEPTED moves the machine to `tracking`; the server ending the search (no ambulance
  // available in any wave) moves it to `cancelled`. The effect below navigates for both.
  useMissionSync({ missionId: accessToken ? missionId : null, authToken: accessToken });

  useEffect(() => {
    if (leavingRef.current) return;
    if (currentState === "tracking" || currentState === "cancelled") {
      router.replace({
        pathname: "/booking/[id]",
        params: {
          id: lastMissionIdRef.current ?? "",
          vehicleType,
          address: pickupAddress,
          // [id].tsx reads the same context.pickup independently once mounted; these are only a real (not
          // fabricated) hint for a cold re-entry deep link, omitted entirely when there is no real pickup to send.
          ...(hasRealPickup ? { lat: String(latitude), lon: String(longitude) } : {}),
        },
      });
    }
  }, [currentState, router, vehicleType, pickupAddress, hasRealPickup, latitude, longitude]);

  const finishCancel = (reason: ReturnType<typeof cancelReasonForKey>) => {
    send({
      type: "CANCEL",
      payload: {
        missionId: lastMissionIdRef.current ?? "pending",
        reason: reason.reason,
        reasonNote: reason.note,
        cancelledAt: new Date().toISOString(),
      },
    });
    // `cancelled` has no `on` handlers, so without a reset the actor would stay pinned and every event a fresh booking
    // sends (SUBMIT_TRIAGE included) would silently no-op. Home is where the reset actor is ready to be used.
    returnHome(router, resetLifecycle);
  };

  const handleCancel = async (reasonKey: string) => {
    const reason = cancelReasonForKey(reasonKey);
    leavingRef.current = true;
    if (accessToken && lastMissionIdRef.current) {
      // The server must know: otherwise drivers keep being offered a mission the patient has abandoned. If it cannot be
      // reached the patient is told the request is still live, instead of being shown a false "cancelled".
      const result = await cancelMission(lastMissionIdRef.current, reason.reason, reason.note);
      if (!result.ok && result.error.code !== "not_found") {
        leavingRef.current = false;
        Alert.alert("Could not cancel", createMissionErrorMessage(result.error.code));
        return;
      }
    }
    finishCancel(reason);
  };

  // Leaving without cancelling keeps the mission alive (the actor lives in the global store; Home shows a banner).
  // Back only asks for an explicit cancel.
  const confirmCancel = () => {
    Alert.alert(
      "Cancel Ambulance Request?",
      "Nearby emergency ambulances are currently being notified. Are you sure you want to cancel?",
      [
        { text: "Keep Searching", style: "cancel" },
        { text: "Cancel Request", style: "destructive", onPress: () => void handleCancel("other") },
      ]
    );
  };

  useEffect(() => {
    // Android-only API: on web it logs an error on every render.
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      confirmCancel();
      return true;
    });
    return () => sub.remove();
  });

  return (
    <ActiveMatchingScreen
      vehicleType={vehicleType}
      pickupAddress={pickupAddress}
      pickupCoords={hasRealPickup ? { latitude, longitude } : undefined}
      initialLanguage="en"
      startedAtMs={startedAtMs}
      onCancel={(key) => void handleCancel(key)}
      onBack={confirmCancel}
    />
  );
}
