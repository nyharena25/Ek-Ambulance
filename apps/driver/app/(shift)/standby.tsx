import { useRouter } from "expo-router";
import { DriverStandbyScreen } from "../../src/screens";
import { useDriverLifecycleStore } from "../../src/state/driverLifecycle.store";
import { generateMockDispatchOffer } from "../../src/services/mockDispatchWave";

export default function StandbyRoute() {
  const router = useRouter();
  const { send } = useDriverLifecycleStore();

  return (
    <DriverStandbyScreen
      onSimulateOffer={() => {
        // Simulate a real Centrifugo dispatch.offer push (P05 channel stub):
        // a realistic wave across Delhi/NCR + UP districts, driven through
        // the real driverLifecycle machine, then present the offer screen.
        const offer = generateMockDispatchOffer();
        send({
          type: "SERVER_OFFER_RECEIVED",
          payload: { offerId: offer.offerId, missionId: offer.missionId },
        });
        router.push({
          pathname: "/(shift)/offer",
          params: {
            missionId: offer.missionId,
            offerId: offer.offerId,
            acuity: offer.acuity,
            requiredVehicleType: offer.requiredVehicleType,
            address: offer.pickup.address,
            landmark: offer.pickup.landmark,
            distanceKm: String(offer.distanceKm),
            etaMinutes: String(offer.etaMinutes),
          },
        });
      }}
      onNavigateToOnboarding={() => {
        router.push("/(auth)/onboarding");
      }}
    />
  );
}
