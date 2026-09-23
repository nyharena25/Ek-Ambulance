import { useRouter, useLocalSearchParams } from "expo-router";
import { ActiveMatchingScreen } from "../../src/screens";
import { AIS125VehicleType } from "@sahayak/domain";
import { usePatientLifecycleStore } from "../../src/state/patientLifecycle.store";

export default function BookingMatchingRoute() {
  const router = useRouter();
  const send = usePatientLifecycleStore((s) => s.send);
  const resetLifecycle = usePatientLifecycleStore((s) => s.reset);
  const params = useLocalSearchParams<{
    vehicleType?: string;
    careLevel?: string;
    jurisdiction?: string;
    address?: string;
    lat?: string;
    lon?: string;
  }>();

  const vehicleType = (params.vehicleType as AIS125VehicleType) || "TYPE_D_ALS";
  const pickupAddress =
    params.address || "AIIMS New Delhi, Main Emergency Ward";
  const latitude = params.lat ? parseFloat(params.lat) : 28.5672;
  const longitude = params.lon ? parseFloat(params.lon) : 77.21;

  const handleCancel = (reason: string) => {
    send({
      type: "CANCEL",
      payload: {
        missionId: "pending",
        reason: "changed_mind",
        reasonNote: reason,
        cancelledAt: new Date().toISOString(),
      },
    });
    // Same terminal-state trap as booking/[id].tsx's two post-match return-
    // home screens: `cancelled` has no `on` handlers, so without a reset the
    // actor would stay pinned here and every event a fresh booking sends
    // (SUBMIT_TRIAGE included) would silently no-op from this point on.
    resetLifecycle();
    // Reset means idle, and idle only accepts SUBMIT_TRIAGE - router.back()
    // or /booking/confirm would land on a screen that sends REQUEST instead,
    // relocating the exact dead-end this reset exists to prevent. Home is
    // where the reset actor is actually ready to be used, matching both
    // reset call sites in booking/[id].tsx.
    router.replace("/(tabs)/home");
  };

  const handleSimulateMatch = () => {
    // Mocked server push (real Centrifugo event lands in a later slice) -
    // this is exactly the seam the machine's SERVER_MISSION_ASSIGNED event
    // exists for.
    const missionId = "MSN-DL-2026-8921";
    send({ type: "SERVER_MISSION_ASSIGNED", payload: { missionId } });

    router.replace({
      pathname: "/booking/[id]",
      params: {
        id: missionId,
        vehicleType,
        address: pickupAddress,
      },
    });
  };

  return (
    <ActiveMatchingScreen
      vehicleType={vehicleType}
      pickupAddress={pickupAddress}
      pickupCoords={{ latitude, longitude }}
      initialLanguage="en"
      wave1TimeoutSeconds={45}
      wave2TimeoutSeconds={45}
      onCancel={handleCancel}
      onSimulateMatch={handleSimulateMatch}
    />
  );
}
