import { useRouter } from "expo-router";
import { TriageScreen } from "../../src/screens";
import { TriageResult } from "@sahayak/domain";
import { usePatientLifecycleStore } from "../../src/state/patientLifecycle.store";

export default function BookingTriageRoute() {
  const router = useRouter();
  const send = usePatientLifecycleStore((s) => s.send);

  const handleConfirmTriage = (result: TriageResult) => {
    // Full TriageResult goes into machine context here - the fix for the
    // broken pipeline: previously only 3 scalar fields survived the hop to
    // category-select, discarding clinicalRationale/tierName/symptomFlags/etc.
    send({
      type: "SUBMIT_TRIAGE",
      payload: {
        missionDraftId: `draft-${Date.now()}`,
        symptoms: result.symptomFlags,
        answeredAt: new Date().toISOString(),
        locale: "en",
        result,
      },
    });

    // Scalar params kept as a cold-store fallback (direct deep link to
    // category-select would otherwise have nothing to read).
    router.push({
      pathname: "/booking/location-entry",
      params: {
        careLevel: result.recommendedCareLevel,
        tier: result.tier,
        goldenHour: result.goldenHourActive ? "true" : "false",
      },
    });
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  };

  return (
    <TriageScreen
      onConfirmTriage={handleConfirmTriage}
      onBack={handleBack}
    />
  );
}
