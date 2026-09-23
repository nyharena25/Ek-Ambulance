import { useRouter, useLocalSearchParams } from "expo-router";
import { AmbulanceCategoryScreen } from "../../src/screens";
import {
  AIS125VehicleType,
  CareLevel,
  Jurisdiction,
  UrgencyTier,
  VehiclePricingEstimateResponse,
  DEFAULT_DISPATCH_DISTANCE_KM,
} from "@sahayak/domain";
import { usePatientLifecycleStore } from "../../src/state/patientLifecycle.store";

export default function BookingCategorySelectRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    careLevel?: string;
    tier?: string;
    jurisdiction?: string;
    lat?: string;
    lon?: string;
    address?: string;
  }>();
  const { triageResult } = usePatientLifecycleStore((s) => s.context);

  // Machine context is the source of truth when warm (the normal in-app
  // flow); URL params are the fallback for a cold store (deep link direct
  // to this screen, or an app restart mid-flow).
  const triageCareLevel: CareLevel =
    triageResult?.recommendedCareLevel ?? ((params.careLevel as CareLevel) || "ALS");
  const urgencyTier: UrgencyTier =
    triageResult?.tier ?? ((params.tier as UrgencyTier) || "CAT_1_IMMEDIATE");
  const jurisdiction = (params.jurisdiction as Jurisdiction) || "DL";

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
        jurisdiction,
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
      jurisdiction={jurisdiction}
      estimatedDistanceKm={DEFAULT_DISPATCH_DISTANCE_KM}
      onConfirmCategory={handleConfirmCategory}
      onBack={handleBack}
    />
  );
}
