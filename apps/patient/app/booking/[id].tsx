import { useRef } from "react";
import { Animated } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  MissionTrackingScreen,
  TransportingScreen,
  MissionCompletionScreen,
  MissionCancelledScreen,
} from "../../src/screens";
import {
  AIS125VehicleType,
  Jurisdiction,
  PatientLifecycleState,
  TriageSymptomFlag,
  DEFAULT_DISPATCH_DISTANCE_KM,
  computeItemizedStatutoryFare,
} from "@sahayak/domain";
import { usePatientLifecycleStore } from "../../src/state/patientLifecycle.store";
import { usePatientAuthStore } from "../../src/state/patientAuth.store";
import {
  useMissionChannel,
  type MissionLifecycleEventType,
} from "../../src/hooks/useMissionChannel";
import { translateLifecycleEvent } from "../../src/services/missionLifecycleBridge";

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
    symptom?: string;
    state?: string;
    hospitalName?: string;
    wardStatus?: string;
  }>();
  const currentState = usePatientLifecycleStore((s) => s.currentState);
  const context = usePatientLifecycleStore((s) => s.context);
  const send = usePatientLifecycleStore((s) => s.send);
  const resetLifecycle = usePatientLifecycleStore((s) => s.reset);

  // `cancelled` and `receiptConfirmed` are both terminal in the machine (no
  // `on` handlers) - navigating home without resetting would leave the
  // actor stuck there, silently no-op-ing every event a fresh booking
  // sends (SUBMIT_TRIAGE included) until the app process restarts.
  const handleReturnHome = () => {
    resetLifecycle();
    router.replace("/(tabs)/home");
  };

  // currentState, not context.missionId: CANCEL clears missionId back to
  // null (so a cancelled mission's context no longer looks "active"), but
  // the actor has still processed real events by then - "idle" is the only
  // state a genuinely cold store (no events sent this session) can be in.
  const isStoreWarm = currentState !== "idle";
  const missionId = context.missionId || params.id || "MSN-DL-2026-8921";

  // Zero-re-render marker rotation: mutated directly from the raw per-ping
  // callback via .setValue(), bound to the existing driverHeadingIndicator
  // transform in both screens. Neither screen's driver marker has ever
  // actually moved from lat/lon (both use a fixed-pixel mock map canvas
  // with no real map projection), so only heading needs a ref here -
  // adding a position ValueXY with nothing real to project it onto would
  // be inventing map-projection logic that wasn't asked for.
  const driverHeadingAnim = useRef(new Animated.Value(0)).current;

  const handleLifecycleEvent = (event: MissionLifecycleEventType, eventMissionId: string) => {
    send(translateLifecycleEvent(event, eventMissionId));
  };

  const sessionAccessToken = usePatientAuthStore((s) => s.session?.access_token ?? null);

  const { throttledTelemetry, mockControls } = useMissionChannel({
    missionId,
    // Task 4.1: the real, verified session JWT now authorizes the
    // Centrifugo subscription directly - null only for a patient who
    // reached this screen via the anonymous "quick emergency access" path
    // with no session, in which case __DEV__ still falls back to the mock
    // emitter so the flow stays testable without forcing a login.
    authToken: sessionAccessToken,
    onTelemetryReceived: (telemetry) => {
      if (telemetry.heading !== undefined) {
        driverHeadingAnim.setValue(telemetry.heading);
      }
    },
    onLifecycleEvent: handleLifecycleEvent,
  });
  const vehicleType: AIS125VehicleType =
    context.vehicleType || (params.vehicleType as AIS125VehicleType) || "TYPE_D_ALS";
  const jurisdiction: Jurisdiction =
    context.jurisdiction || (params.jurisdiction as Jurisdiction) || "DL";
  const pickupAddress =
    params.address || "AIIMS New Delhi, Main Emergency Ward";
  // Every computeTriageUrgency() branch returns >=1 symptomFlags entry, so
  // symptomFlags[0] cannot actually be undefined for a real triage result -
  // this optional chain and the "chest_pain" terminal only matter for a raw
  // deep link with no context and no params at all, where any value here is
  // an arbitrary placeholder, not a clinical default.
  const triagedSymptom: TriageSymptomFlag =
    context.triageResult?.symptomFlags[0] ||
    (params.symptom as TriageSymptomFlag) ||
    "chest_pain";
  const missionState: PatientLifecycleState = isStoreWarm
    ? currentState
    : (params.state as PatientLifecycleState) || "tracking";

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
        hospitalName={
          params.hospitalName ||
          "Jai Prakash Narayan Apex Trauma Center, AIIMS"
        }
        fareDetails={
          context.fareDetails ||
          computeItemizedStatutoryFare({
            vehicleType,
            jurisdiction,
            distanceKm: DEFAULT_DISPATCH_DISTANCE_KM,
          })
        }
        initialLanguage="en"
        onReturnHome={handleReturnHome}
      />
    );
  }

  if (missionState === "cancelled") {
    return (
      <MissionCancelledScreen
        missionId={missionId}
        initialLanguage="en"
        onReturnHome={handleReturnHome}
      />
    );
  }

  if (missionState === "transporting") {
    return (
      <TransportingScreen
        missionId={missionId}
        vehicleType={vehicleType}
        hospitalName={
          params.hospitalName ||
          "Jai Prakash Narayan Apex Trauma Center, AIIMS"
        }
        wardStatus={params.wardStatus || "Trauma ICU Alerted - Bed Held"}
        initialLanguage="en"
        onBack={handleBack}
        driverHeadingAnim={driverHeadingAnim}
        liveSpeedKmh={throttledTelemetry?.speed ?? null}
        onSimulateHospitalArrival={mockControls?.triggerMissionCompleted}
      />
    );
  }

  return (
    <MissionTrackingScreen
      missionId={missionId}
      vehicleType={vehicleType}
      pickupAddress={pickupAddress}
      triagedSymptom={triagedSymptom}
      initialLanguage="en"
      onBack={handleBack}
      driverHeadingAnim={driverHeadingAnim}
      liveSpeedKmh={throttledTelemetry?.speed ?? null}
      driverHasArrived={context.driverHasArrived}
      onSimulateDriverArrival={mockControls?.triggerDriverArrived}
      onSimulateTransportStart={mockControls?.triggerTransportStarted}
    />
  );
}
