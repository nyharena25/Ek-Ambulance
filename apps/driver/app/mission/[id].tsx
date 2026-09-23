import { useState } from "react";
import { useRouter, useLocalSearchParams, Redirect } from "expo-router";
import {
  DriverNavigationScreen,
  OnSceneCareScreen,
  InTransitHospitalScreen,
} from "../../src/screens";
import { useDriverLifecycleStore, type DriverLifecycleStoreState } from "../../src/state/driverLifecycle.store";
import { TraumaCentreItem } from "../../src/i18n/driverOnSceneStrings";
import type { DriverLifecycleState, GeoPoint } from "@sahayak/domain";

type MissionPhase = "enRouteToPatient" | "onScene" | "transporting";

// arrivedHospital has no distinct parent-level screen - InTransitHospitalScreen
// handles both transporting and arrivedHospital internally (its own
// isCompletedAtHospital/isReceiptView sub-states), the same way
// DriverNavigationScreen already handles its own post-arrival review UI
// internally without a parent-level phase change.
const MISSION_ACTIVE_STATES: readonly DriverLifecycleState[] = [
  "enRouteToPatient",
  "onScene",
  "transporting",
  "arrivedHospital",
];

function phaseForLifecycleState(state: DriverLifecycleState): MissionPhase {
  if (state === "onScene") return "onScene";
  if (state === "transporting" || state === "arrivedHospital") return "transporting";
  return "enRouteToPatient";
}

export default function MissionExecutionRoute() {
  const { id, pickupLat, pickupLng } = useLocalSearchParams<{ id: string; pickupLat?: string; pickupLng?: string }>();
  const pickupCoordinates =
    pickupLat && pickupLng ? { latitude: Number(pickupLat), longitude: Number(pickupLng) } : undefined;
  const { currentState, driverId, send } = useDriverLifecycleStore();

  // A stale deep link, a page reload with no accepted mission, or a mission
  // that already completed (currentState back to standby) - nothing here
  // for the route to render. Redirect rather than rendering a screen whose
  // events the machine won't accept.
  if (!MISSION_ACTIVE_STATES.includes(currentState)) {
    return <Redirect href="/(shift)/standby" />;
  }

  return (
    <MissionExecutionScreens
      missionId={id || "MSN-2026-8819"}
      driverId={driverId || "DRV-DEMO-0001"}
      initialLifecycleState={currentState}
      pickupCoordinates={pickupCoordinates}
      send={send}
    />
  );
}

interface MissionExecutionScreensProps {
  missionId: string;
  driverId: string;
  initialLifecycleState: DriverLifecycleState;
  pickupCoordinates?: GeoPoint;
  send: DriverLifecycleStoreState["send"];
}

/**
 * Separated from the route component so `phase`'s initial value is derived
 * exactly once from the real machine state at mount (not a route param that
 * could drift from it). Subsequent phase advances come from this route's
 * own callbacks below, which only ever fire after the corresponding
 * send() already moved the machine forward - never the reverse.
 */
function MissionExecutionScreens({ missionId, driverId, initialLifecycleState, pickupCoordinates, send }: MissionExecutionScreensProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<MissionPhase>(phaseForLifecycleState(initialLifecycleState));
  const [selectedHospital, setSelectedHospital] = useState<TraumaCentreItem | null>(null);

  // Closes HANDOVER §14/§15's open item: a driver backing out mid-mission
  // must not leave the machine stuck in an active-mission state - that
  // silently rejects the driver's next SERVER_OFFER_RECEIVED (Test 14 in
  // driverLifecycle.test.ts locks this in). ABORT_MISSION returns to
  // standby without dropping the shift session, unlike reset().
  const abortMissionAndReturnToStandby = () => {
    send({
      type: "ABORT_MISSION",
      payload: { missionId, driverId, reason: "driver_backed_out", abortedAt: new Date().toISOString() },
    });
    router.replace("/(shift)/standby");
  };

  if (phase === "enRouteToPatient") {
    return (
      <DriverNavigationScreen
        missionId={missionId}
        pickupCoordinates={pickupCoordinates}
        onConfirmArrival={(payload) => {
          // Dispatches server-authoritative CONFIRM_ARRIVAL_SCENE to XState / lifecycle store
          send({
            type: "CONFIRM_ARRIVAL_SCENE",
            payload,
          });
        }}
        onProceedToPatientHandoff={() => {
          // Irreversible arrival slider confirmed, advance to on-scene triage and vitals
          setPhase("onScene");
        }}
        onBackToStandby={abortMissionAndReturnToStandby}
      />
    );
  }

  if (phase === "onScene") {
    return (
      <OnSceneCareScreen
        missionId={missionId}
        onConfirmPatientOnboard={(payload) => {
          // Dispatches server-authoritative CONFIRM_PATIENT_ONBOARD to XState / lifecycle store
          send({
            type: "CONFIRM_PATIENT_ONBOARD",
            payload,
          });
        }}
        onProceedToTransportNavigation={(hospital) => {
          setSelectedHospital(hospital);
          setPhase("transporting");
        }}
        onBack={() => {
          setPhase("enRouteToPatient");
        }}
      />
    );
  }

  return (
    <InTransitHospitalScreen
      missionId={missionId}
      hospitalName={
        selectedHospital?.name || "Jaypee Hospital (Sector 128, Noida)"
      }
      hospitalCoordinates={selectedHospital?.coordinates}
      onConfirmArrivalHospital={(payload) => {
        // Dispatches server-authoritative CONFIRM_ARRIVAL_HOSPITAL to XState / lifecycle store -
        // must fire BEFORE onCompleteMission below (the machine rejects
        // COMPLETE_MISSION sent from transporting; see driverLifecycle.test.ts Test 12b).
        send({
          type: "CONFIRM_ARRIVAL_HOSPITAL",
          payload,
        });
      }}
      onCompleteMission={(payload) => {
        // Fires only after the statutory receipt is confirmed - dispatches
        // server-authoritative COMPLETE_MISSION to XState / lifecycle store
        send({
          type: "COMPLETE_MISSION",
          payload,
        });
      }}
      onFinishSignOff={() => {
        // Statutory sign-off completed and signed - COMPLETE_MISSION already
        // fired above; the machine is already in standby, not an abort.
        router.replace("/(shift)/standby");
      }}
      onBackToStandby={abortMissionAndReturnToStandby}
    />
  );
}
