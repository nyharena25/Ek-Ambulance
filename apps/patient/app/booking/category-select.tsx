import { useRouter, useLocalSearchParams } from "expo-router";
import { AmbulanceCategoryScreen } from "../../src/screens";
import {
  AIS125VehicleType,
  CareLevel,
  UrgencyTier,
  VehiclePricingEstimateResponse,
} from "@sahayak/domain";
import { usePatientLifecycleStore } from "../../src/state/patientLifecycle.store";

export default function BookingCategorySelectRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    careLevel?: string;
    tier?: string;
    lat?: string;
    lon?: string;
    address?: string;
  }>();
  const { triageResult } = usePatientLifecycleStore((s) => s.context);

  // URL params win (forwarded from the latest triage confirm via location-entry): the machine keeps only the first
  // SUBMIT_TRIAGE, so after a patient goes back and re-triages its context is stale. Machine context, then the most
  // protective default, cover a cold deep link without params.
  const triageCareLevel: CareLevel =
    (params.careLevel as CareLevel | undefined) || triageResult?.recommendedCareLevel || "ALS";
  const urgencyTier: UrgencyTier =
    (params.tier as UrgencyTier | undefined) || triageResult?.tier || "CAT_1_IMMEDIATE";

  const handleConfirmCategory = (selection: {
    vehicleType: AIS125VehicleType;
    careLevel: CareLevel;
    pricing: VehiclePricingEstimateResponse;
  }) => {
    // Proceed to dispatch confirmation screen with selected AIS-125 vehicle & tariff
    router.push({
      pathname: "/booking/confirm",
      params: {
        vehicleType: selection.vehicleType,
        careLevel: selection.careLevel,
        lat: params.lat,
        lon: params.lon,
        address: params.address,
      },
    });
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/booking/location-entry");
    }
  };

  return (
    <AmbulanceCategoryScreen
      triageCareLevel={triageCareLevel}
      urgencyTier={urgencyTier}
      onConfirmCategory={handleConfirmCategory}
      onBack={handleBack}
    />
  );
}
