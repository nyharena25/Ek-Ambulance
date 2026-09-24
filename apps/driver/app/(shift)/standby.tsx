import { useRouter } from "expo-router";
import { DriverStandbyScreen } from "../../src/screens";
import { useDriverLifecycleStore } from "../../src/state/driverLifecycle.store";
import { useDriverStandbyStore } from "../../src/state/driverStandby.store";
import { notifyIncomingOffer } from "../../src/services/dispatchNotifications";
import { generateMockDispatchOffer } from "../../src/services/mockDispatchWave";

export default function StandbyRoute() {
  const router = useRouter();
  const { send } = useDriverLifecycleStore();

  return (
    <DriverStandbyScreen
      // Development only (G-25): a release build must never offer a driver a fabricated dispatch.
      onSimulateOffer={!__DEV__ ? undefined : () => {
        // Simulate a real Centrifugo dispatch.offer push (P05 channel stub):
        // a realistic wave across Delhi/NCR + UP districts, driven through
        // the real driverLifecycle machine, then present the offer screen.
        const offer = generateMockDispatchOffer(useDriverStandbyStore.getState().gps);
        send({
          type: "SERVER_OFFER_RECEIVED",
          payload: { offerId: offer.offerId, missionId: offer.missionId },
        });
        const params = {
          missionId: offer.missionId,
          offerId: offer.offerId,
          acuity: offer.acuity,
          requiredVehicleType: offer.requiredVehicleType,
          address: offer.pickup.address,
          landmark: offer.pickup.landmark,
          pickupLat: String(offer.pickup.latitude),
          pickupLng: String(offer.pickup.longitude),
          distanceKm: String(offer.distanceKm),
          etaMinutes: String(offer.etaMinutes),
        };
        router.push({ pathname: "/(shift)/offer", params });
        void notifyIncomingOffer(params);
      }}
      onNavigateToOnboarding={() => {
        router.push("/(auth)/onboarding");
      }}
      onOpenBooking={() => router.push("/(shift)/booking")}
      onOpenProfile={() => router.push("/(shift)/profile")}
    />
  );
}
