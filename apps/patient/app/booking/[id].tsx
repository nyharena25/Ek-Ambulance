import { useEffect, useRef, useState } from "react";
import { Linking } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  MissionTrackingScreen,
  TransportingScreen,
  MissionCompletionScreen,
  MissionCancelledScreen,
} from "../../src/screens";
import {
  AIS125VehicleType,
  ItemizedStatutoryFare,
  PatientLifecycleState,
  TriageSymptomFlag,
  type GeoPoint,
} from "@sahayak/domain";
import { returnHome } from "../../src/navigation/returnHome";
import { usePatientLifecycleStore } from "../../src/state/patientLifecycle.store";
import { usePatientAuthStore, realAccessToken } from "../../src/state/patientAuth.store";
import { useMissionSync } from "../../src/hooks/useMissionSync";
import type { DriverMarkerHandle } from "../../src/components";
import { useDrivingRoute } from "../../src/hooks/useDrivingRoute";
import { DEFAULT_PICKUP, formatCoordinates, parseCoordinate } from "../../src/services/mapGeo.core";
import { confirmReceipt, fetchMissionCreatedAt, requestErasure } from "../../src/lib/missionApi";
import { matchingStrings } from "../../src/i18n/matchingStrings";


/**
 * Single dynamic route for every post-match mission phase (tracking,
 * transporting, awaitingReceipt/receiptConfirmed) - the missionId doesn't
 * change across these phases, only which screen is rendered for it, so one
 * route keyed by id is the natural Expo Router shape rather than a
 * separate path per phase.
 *
 * Screen selection is bound to the lifecycle machine's real state: once the
 * store is warm (context.missionId is set - true immediately after
 * SERVER_MISSION_ASSIGNED fires in booking/matching.tsx, before this route
 * is even pushed), `currentState` is authoritative. The `state` URL param
 * is the cold-store fallback for a direct deep link.
 */
export default function BookingMissionTrackingRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string;
    vehicleType?: string;
    jurisdiction?: string;
    address?: string;
    lat?: string;
    lon?: string;
    symptom?: string;
    state?: string;
    wardStatus?: string;
  }>();
  const currentState = usePatientLifecycleStore((s) => s.currentState);
  const context = usePatientLifecycleStore((s) => s.context);
  const resetLifecycle = usePatientLifecycleStore((s) => s.reset);

  // `cancelled` and `receiptConfirmed` are both terminal in the machine (no
  // `on` handlers) - navigating home without resetting would leave the
  // actor stuck there, silently no-op-ing every event a fresh booking
  // sends (SUBMIT_TRIAGE included) until the app process restarts.
  const handleReturnHome = () => returnHome(router, resetLifecycle);

  // currentState, not context.missionId: CANCEL clears missionId back to
  // null (so a cancelled mission's context no longer looks "active"), but
  // the actor has still processed real events by then - "idle" is the only
  // state a genuinely cold store (no events sent this session) can be in.
  const isStoreWarm = currentState !== "idle";
  // No invented fallback id: a deep link without an id and a cold store simply has no mission to show.
  const missionId = context.missionId || params.id || "";

  // Live pings glide the native map marker through this handle; no screen re-renders per ping.
  const driverMarkerRef = useRef<DriverMarkerHandle>(null);
  const lastDriverRef = useRef<GeoPoint | null>(null);

  // confirm_receipt / request_erasure both require a real, server-verified session (isUuid'd by
  // realAccessToken, same guard driverServer.ts uses driver-side) - without one, realAccessToken returns
  // null and neither RPC is even attempted.
  const patientSession = usePatientAuthStore((s) => s.session);
  // Best-effort, non-blocking: leaving the completion screen without disputing confirms receipt
  // (dispute=false); the RPC is idempotent (coalesces receipt_confirmed_at, ORs dispute_flag), so this can
  // never conflict with a dispute the patient records separately.
  const handleCompletionReturnHome = () => {
    if (missionId && realAccessToken(patientSession)) void confirmReceipt(missionId, false);
    handleReturnHome();
  };
  const handleDisputeFare = async (): Promise<boolean> => {
    if (!missionId || !realAccessToken(patientSession)) return false;
    const result = await confirmReceipt(missionId, true);
    return result.ok;
  };
  const handleRequestErasure = async (): Promise<string | null> => {
    if (!missionId || !realAccessToken(patientSession)) return null;
    const result = await requestErasure(missionId);
    return result.ok ? result.data.dueAt : null;
  };

  const sessionAccessToken = usePatientAuthStore((s) => s.session?.access_token ?? null);

  const { throttledTelemetry, connection } = useMissionSync({
    missionId: missionId || null,
    // The real, verified session JWT authorizes the Centrifugo subscription directly - null only without a
    // session (e.g. signed out or expired), in which case the channel reports an error rather than connecting.
    authToken: sessionAccessToken,
    onTelemetryReceived: (telemetry) => {
      lastDriverRef.current = telemetry;
      driverMarkerRef.current?.moveTo(telemetry, telemetry.heading);
    },
  });
  // The type the request carried (machine, else the route link); undefined is shown as "—", never a default type.
  const vehicleType: AIS125VehicleType | undefined =
    context.vehicleType || (params.vehicleType as AIS125VehicleType | undefined) || undefined;
  // Only a symptom the patient really reported; unknown (resumed after a restart) shows the general first-aid guide.
  const triagedSymptom: TriageSymptomFlag | undefined =
    context.triageResult?.symptomFlags[0] || (params.symptom as TriageSymptomFlag | undefined) || undefined;
  const missionState: PatientLifecycleState = isStoreWarm
    ? currentState
    : (params.state as PatientLifecycleState) || "tracking";

  // context.pickup is the server-synced real location (once the store is warm); params.lat/lon are the
  // cold-store fallback for a direct deep link, same pattern as vehicleType above - real data
  // always wins over both. If neither exists (a malformed deep link that bypassed matching.tsx entirely,
  // which always carries a real pickup by the time it hands off here), the map still needs *a* coordinate to
  // center on, but the address shown to the patient must never claim that placeholder is their real location.
  const hasRealPickup =
    context.pickup != null ||
    (params.lat != null && params.lon != null && Number.isFinite(Number(params.lat)) && Number.isFinite(Number(params.lon)));
  const pickup = context.pickup ?? parseCoordinate(params.lat, params.lon, DEFAULT_PICKUP);
  const pickupAddress = params.address || (hasRealPickup ? formatCoordinates(pickup) : "");
  // The hospital is only the server's record (TRANSPORT_STARTED.destination, written from missions.destination_hospital_id
  // and reloaded from the stored event after a reconnect). Never a name from a link, never a name-to-coordinate guess.
  const hospitalName = context.destination?.name;
  const hospitalCoordinate = context.destination
    ? { latitude: context.destination.latitude, longitude: context.destination.longitude }
    : null;
  const isTransportLeg = missionState === "transporting";
  // The patient app is not sent the ambulance's position before its first live ping, so no route or marker is drawn
  // from a made-up start (a fixed hub) on the way to the pickup; the transport leg is pickup -> real hospital.
  const route = useDrivingRoute(isTransportLeg ? pickup : null, isTransportLeg ? hospitalCoordinate : null);
  const mapProps = { pickup, route, driverMarkerRef, driverStart: lastDriverRef.current ?? undefined };

  // A search the server ended with no ambulance: say when it received the request (its own created_at), not a guess.
  const noAmbulance = missionState === "cancelled" && context.cancellation?.reason === "no_ambulance_available";
  const [requestedAtMs, setRequestedAtMs] = useState<number | null>(null);
  useEffect(() => {
    if (!noAmbulance || !missionId) return;
    let alive = true;
    void fetchMissionCreatedAt(missionId).then((ms) => alive && setRequestedAtMs(ms));
    return () => {
      alive = false;
    };
  }, [noAmbulance, missionId]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/home");
    }
  };

  if (missionState === "awaitingReceipt" || missionState === "receiptConfirmed") {
    return (
      <MissionCompletionScreen
        missionId={missionId}
        pickupAddress={pickupAddress}
        hospitalName={hospitalName}
        completedAt={context.completion?.completedAt}
        distanceSource={context.completion?.distanceSource}
        // Only the server's final fare (live MISSION_COMPLETED, or the stored one after a reconnect): never the booking
        // quote and never a fare from a default distance.
        fareDetails={context.completion?.fareDetails as ItemizedStatutoryFare | undefined}
        crewName={context.assignedDriver?.displayName}
        vehicleType={vehicleType}
        initialLanguage="en"
        onReturnHome={handleCompletionReturnHome}
        onDisputeFare={handleDisputeFare}
        onRequestErasure={handleRequestErasure}
      />
    );
  }

  if (missionState === "cancelled") {
    return (
      <MissionCancelledScreen
        missionId={missionId}
        cancelledBy={context.cancellation?.cancelledBy ?? undefined}
        reason={context.cancellation?.reason ?? undefined}
        initialLanguage="en"
        onCall108={() => void Linking.openURL("tel:108").catch(() => {})}
        onReturnHome={handleReturnHome}
        request={{
          requestedAt: requestedAtMs !== null ? new Date(requestedAtMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : undefined,
          pickupAddress: pickupAddress || undefined,
          ambulanceType: (() => {
            const t = context.vehicleType || params.vehicleType; // only a type the request really carried
            return t ? (matchingStrings.en.vehicleTypeName[t] ?? t) : undefined;
          })(),
        }}
      />
    );
  }

  if (missionState === "transporting") {
    return (
      <TransportingScreen
        vehicleRegistration={context.assignedDriver?.vehicleRegistration}
        missionId={missionId}
        vehicleType={vehicleType}
        hospitalName={hospitalName}
        destinationCoordinate={hospitalCoordinate ?? undefined}
        wardStatus={context.wardStatus ?? params.wardStatus}
        hospitalArrived={context.hospitalArrived}
        connection={connection}
        initialLanguage="en"
        onBack={handleBack}
        {...mapProps}
        liveSpeedKmh={throttledTelemetry?.speed ?? null}
      />
    );
  }

  return (
    <MissionTrackingScreen
      missionId={missionId}
      vehicleType={vehicleType}
      triagedSymptom={triagedSymptom}
      initialLanguage="en"
      onBack={handleBack}
      {...mapProps}
      liveSpeedKmh={throttledTelemetry?.speed ?? null}
      driverHasArrived={context.driverHasArrived}
      assignedDriver={context.assignedDriver ?? undefined}
      maskedCall={context.maskedCall ?? undefined}
      etaMinutes={context.etaMinutes ?? undefined}
      estimatedFareInr={context.fareDetails?.estimatedTotalInr}
      connection={connection}
    />
  );
}
