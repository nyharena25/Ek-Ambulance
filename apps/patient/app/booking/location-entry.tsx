import { useRouter, useLocalSearchParams } from "expo-router";
import { PickupLocationScreen } from "../../src/screens";
import type { CareLevel, GeoPoint } from "@sahayak/domain";
import { usePatientLifecycleStore } from "../../src/state/patientLifecycle.store";
import { soleEligibleVehicle } from "../../src/lib/vehicleEligibility.core";

export default function LocationEntryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ careLevel?: string; tier?: string }>();
  const { triageResult } = usePatientLifecycleStore((s) => s.context);
  // The triage screen sets these params on every confirm, so they win: the machine keeps only the first
  // SUBMIT_TRIAGE, and a patient who goes back and picks another symptom would otherwise book the old care level.
  // Machine context is the fallback for a cold deep link without params.
  const careLevel = (params.careLevel as CareLevel | undefined) ?? triageResult?.recommendedCareLevel;
  const tier = params.tier ?? triageResult?.tier;

  const handleConfirmPickup = (data: {
    point: GeoPoint;
    address: string;
  }) => {
    // Only the coordinates travel on: the server decides the jurisdiction when the mission is created (R-12).
    const pickup = {
      lat: data.point.latitude.toString(),
      lon: data.point.longitude.toString(),
      address: data.address,
    };
    // Triage left a single safe vehicle (ALS -> Type D): the vehicle screen would offer no choice, so go straight to
    // the fare review. Back from there still returns here.
    const onlyVehicle = careLevel ? soleEligibleVehicle(careLevel) : null;
    if (careLevel && onlyVehicle) {
      router.push({ pathname: "/booking/confirm", params: { ...pickup, vehicleType: onlyVehicle, careLevel } });
      return;
    }
    router.push({ pathname: "/booking/category-select", params: { ...pickup, careLevel, tier } });
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/home");
    }
  };

  return (
    <PickupLocationScreen
      onConfirmPickup={handleConfirmPickup}
      onBack={handleBack}
    />
  );
}
