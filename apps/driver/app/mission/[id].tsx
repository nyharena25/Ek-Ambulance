import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import { useRouter, useLocalSearchParams, Redirect } from "expo-router";
import {
  DriverNavigationScreen,
  OnSceneCareScreen,
  InTransitHospitalScreen,
} from "../../src/screens";
import {
  getServerAdapter,
  isServerAuthoritative,
  useDriverLifecycleStore,
  type DriverLifecycleStoreState,
} from "../../src/state/driverLifecycle.store";
import { driverErrorMessage, type CatalogHospital } from "../../src/lib/driverServer.core";
import { fetchAssignedMission, fetchHospitalCatalog } from "../../src/lib/driverServer";
import { flushLivePings } from "../../src/services/telemetryUpload";
import type { DriverLifecycleMachineEvent, DriverLifecycleState, GeoPoint } from "@sahayak/domain";

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
  const { currentState, driverId, submit, send } = useDriverLifecycleStore();

  // A stale deep link, a page reload with no accepted mission, or a mission
  // that already completed (currentState back to standby) - nothing here
  // for the route to render. Redirect rather than rendering a screen whose
  // events the machine won't accept.
  const actingDriverId = getServerAdapter()?.userId ?? driverId;
  if (!MISSION_ACTIVE_STATES.includes(currentState) || !actingDriverId) {
    return <Redirect href="/(shift)/standby" />;
  }

  return (
    <MissionExecutionScreens
      missionId={id ?? ""}
      driverId={actingDriverId}
      initialLifecycleState={currentState}
      pickupCoordinates={pickupCoordinates}
      submit={submit}
      send={send}
    />
  );
}

interface MissionExecutionScreensProps {
  missionId: string;
  driverId: string;
  initialLifecycleState: DriverLifecycleState;
  pickupCoordinates?: GeoPoint;
  submit: DriverLifecycleStoreState["submit"];
  send: DriverLifecycleStoreState["send"];
}

/**
 * Separated from the route component so `phase`'s initial value is derived exactly once from the real machine state at
 * mount. Every confirmation goes to the server FIRST (7.5 rule 1): the machine, and therefore this route's next screen, only
 * advances on the server's 200. A refusal shows why and re-reads the server's view instead of pretending it happened.
 */
function MissionExecutionScreens({ missionId, driverId, initialLifecycleState, pickupCoordinates, submit, send }: MissionExecutionScreensProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<MissionPhase>(phaseForLifecycleState(initialLifecycleState));
  const [selectedHospital, setSelectedHospital] = useState<CatalogHospital | null>(null);
  // The registered catalog (canonical ids). null = loading; an error is shown, never replaced by a built-in list.
  const [hospitals, setHospitals] = useState<CatalogHospital[] | null>(null);
  const [hospitalsError, setHospitalsError] = useState(false);
  const loadHospitals = useCallback(async () => {
    setHospitalsError(false);
    const result = await fetchHospitalCatalog();
    if (result.ok) setHospitals(result.data);
    else setHospitalsError(true);
    return result.ok ? result.data : null;
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const catalog = await loadHospitals();
      // Resumed mid-transport (process kill, reconnect): the destination comes back from missions.destination_hospital_id.
      if (!alive || !catalog || phaseForLifecycleState(initialLifecycleState) !== "transporting") return;
      const row = await fetchAssignedMission();
      const id = row.ok ? row.data?.destinationHospitalId : undefined;
      const hospital = id ? catalog.find((h) => h.id === id) : undefined;
      if (alive && hospital) setSelectedHospital((current) => current ?? hospital);
    })();
    return () => {
      alive = false;
    };
  }, [loadHospitals, initialLifecycleState]);

  // After a refusal that means "your view of the mission is out of date", ask the server what the mission is now.
  const refreshFromServer = async () => {
    const result = await fetchAssignedMission();
    if (!result.ok) return; // could not reach the server: keep the mission, the alert already said it was not recorded
    const row = result.data;
    if (!row || row.missionId !== missionId) {
      send({ type: "SERVER_MISSION_CANCELLED", payload: { missionId } });
      router.replace("/(shift)/standby");
      return;
    }
    send({ type: "HYDRATE", payload: { missionId: row.missionId, status: row.status, driverId } });
    router.replace({ pathname: "/mission/[id]", params: { id: missionId } });
  };

  const run = async (event: DriverLifecycleMachineEvent): Promise<boolean> => {
    const result = await submit(event);
    if (result.ok) return true;
    Alert.alert("Not recorded", driverErrorMessage(result.error.code));
    if (isServerAuthoritative() && (result.error.code === "invalid_transition" || result.error.code === "not_found")) {
      await refreshFromServer();
    }
    return false;
  };

  // Only advance the screen when the machine really is where this step expects it (a refused confirm left it behind).
  const machineIs = (state: DriverLifecycleState) => useDriverLifecycleStore.getState().currentState === state;

  // D-UX-09: a stray Back must not abort a mission. Before pickup an abort re-dispatches; after pickup it is an incident.
  const abortMissionAndReturnToStandby = () => {
    Alert.alert("Leave this mission?", "Leaving now ends your part of this mission. The patient's request may be re-assigned.", [
      { text: "Stay", style: "cancel" },
      {
        text: "Leave mission",
        style: "destructive",
        onPress: () => {
          void run({
            type: "ABORT_MISSION",
            payload: { missionId, driverId, reason: "driver_backed_out", abortedAt: new Date().toISOString() },
          }).then((ok) => {
            if (ok) router.replace("/(shift)/standby");
          });
        },
      },
    ]);
  };

  if (phase === "enRouteToPatient") {
    return (
      <DriverNavigationScreen
        missionId={missionId}
        driverId={driverId}
        pickupCoordinates={pickupCoordinates}
        onConfirmArrival={(payload) => {
          void run({ type: "CONFIRM_ARRIVAL_SCENE", payload });
        }}
        onProceedToPatientHandoff={() => {
          if (machineIs("onScene")) setPhase("onScene");
        }}
        onBackToStandby={abortMissionAndReturnToStandby}
      />
    );
  }

  if (phase === "onScene") {
    return (
      <OnSceneCareScreen
        missionId={missionId}
        driverId={driverId}
        pickupCoordinates={pickupCoordinates}
        hospitals={hospitals}
        hospitalsError={hospitalsError}
        onRetryHospitals={() => void loadHospitals()}
        onConfirmPatientOnboard={async (payload) => {
          // payload.hospitalId is the chosen catalog row's canonical id; the server validates it and takes the bed hold.
          return run({ type: "CONFIRM_PATIENT_ONBOARD", payload });
        }}
        onProceedToTransportNavigation={(hospital) => {
          if (!machineIs("transporting")) return;
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
      driverId={driverId}
      hospitalName={selectedHospital?.name}
      hospitalCoordinates={selectedHospital?.coordinates}
      onConfirmArrivalHospital={(payload) => {
        // Must succeed BEFORE the completion below: the server (like the machine) rejects COMPLETE from `transporting`.
        void run({ type: "CONFIRM_ARRIVAL_HOSPITAL", payload });
      }}
      onCompleteMission={async (payload) => {
        // The fare is computed by the server from the pings it holds for the transport leg, so ship the buffered track first
        // (the mission is still `arrived_hospital`, which the ingest endpoint accepts).
        await flushLivePings(missionId);
        // The signed handoff is validated by the server.
        if (await run({ type: "COMPLETE_MISSION", payload })) router.replace("/(shift)/standby");
      }}
      onFinishSignOff={() => {
        // Navigation happens in onCompleteMission, only after the server accepted the completion.
      }}
      onBackToStandby={abortMissionAndReturnToStandby}
    />
  );
}
