import { useEffect, useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { IncomingMissionModal } from "../../src/screens";
import { getDrivingRoute, type AIS125VehicleType, type UrgencyTier } from "@sahayak/domain";
import { useDriverLifecycleStore } from "../../src/state/driverLifecycle.store";
import { useDriverStandbyStore } from "../../src/state/driverStandby.store";

const VALID_TIERS: UrgencyTier[] = ["CAT_1_IMMEDIATE", "CAT_2_URGENT", "CAT_3_DELAYED"];
const VALID_VEHICLE_TYPES: AIS125VehicleType[] = [
  "TYPE_D_ALS",
  "TYPE_C_BLS",
  "TYPE_B_PTA",
  "TYPE_A_MFR",
];

export default function DispatchOfferRoute() {
  const router = useRouter();
  const { missionId, offerId, acuity, requiredVehicleType, address, landmark, distanceKm, etaMinutes, pickupLat, pickupLng } =
    useLocalSearchParams<{
      missionId?: string;
      offerId?: string;
      acuity?: string;
      requiredVehicleType?: string;
      address?: string;
      landmark?: string;
      distanceKm?: string;
      etaMinutes?: string;
      pickupLat?: string;
      pickupLng?: string;
    }>();
  const { driverId, send } = useDriverLifecycleStore();
  const registeredVehicleType = useDriverStandbyStore((s) => s.registeredAis125Type);

  const driverGps = useDriverStandbyStore((s) => s.gps);
  const [route, setRoute] = useState<{ distanceKm: number; etaMinutes: number } | null>(null);
  const hasPickup = Boolean(pickupLat && pickupLng);
  useEffect(() => {
    if (!hasPickup) return;
    let cancelled = false;
    void getDrivingRoute(driverGps, { latitude: Number(pickupLat), longitude: Number(pickupLng) }).then((r) => {
      if (!cancelled) setRoute({ distanceKm: r.distanceKm, etaMinutes: r.durationMin });
    });
    return () => {
      cancelled = true;
    };
  }, [hasPickup, pickupLat, pickupLng, driverGps.latitude, driverGps.longitude]);

  const resolvedMissionId = missionId || "MSN-2026-8819";
  const resolvedOfferId = offerId || `OFFER-${resolvedMissionId}`;
  const initialAcuity: UrgencyTier = VALID_TIERS.includes(acuity as UrgencyTier)
    ? (acuity as UrgencyTier)
    : "CAT_1_IMMEDIATE";
  const resolvedRequiredVehicleType: AIS125VehicleType = VALID_VEHICLE_TYPES.includes(
    requiredVehicleType as AIS125VehicleType
  )
    ? (requiredVehicleType as AIS125VehicleType)
    : "TYPE_D_ALS";

  return (
    <IncomingMissionModal
      visible={true}
      missionId={resolvedMissionId}
      initialAcuity={initialAcuity}
      requiredVehicleType={resolvedRequiredVehicleType}
      registeredVehicleType={registeredVehicleType}
      pickupAddress={address}
      pickupLandmark={landmark}
      distanceKm={route?.distanceKm ?? (distanceKm ? Number(distanceKm) : undefined)}
      etaMinutes={route?.etaMinutes ?? (etaMinutes ? Number(etaMinutes) : undefined)}
      onAccept={(acceptedId) => {
        // Accidental-tap-proof swipe confirmed - server-authoritative
        // ACCEPT_DISPATCH: standby's offer pool exits, driver is en route.
        send({
          type: "ACCEPT_DISPATCH",
          payload: {
            missionId: acceptedId,
            driverId: driverId || "DRV-DEMO-0001",
            offerId: resolvedOfferId,
            acceptedAt: new Date().toISOString(),
          },
        });
        router.replace({
          pathname: "/mission/[id]",
          params: { id: acceptedId, pickupLat, pickupLng },
        });
      }}
      onDecline={(_reason) => {
        // Declined offer, return to standby cockpit - shift session untouched.
        send({
          type: "DECLINE_DISPATCH",
          payload: {
            missionId: resolvedMissionId,
            driverId: driverId || "DRV-DEMO-0001",
            offerId: resolvedOfferId,
            reason: "other",
            declinedAt: new Date().toISOString(),
          },
        });
        router.back();
      }}
      onTimeout={() => {
        // Wave offer's 15s window closed unactioned - SERVER_OFFER_TIMEOUT
        // returns the driver to standby, same as an explicit decline.
        send({ type: "SERVER_OFFER_TIMEOUT", payload: { offerId: resolvedOfferId } });
        router.back();
      }}
    />
  );
}
