import { useEffect, useMemo, useState } from "react";
import { Alert } from "../../src/lib/alert";
import { useRouter, useLocalSearchParams } from "expo-router";
import { IncomingMissionModal } from "../../src/screens";
import { getDrivingRoute, type AIS125VehicleType, type UrgencyTier } from "@sahayak/domain";
import { getServerAdapter, useDriverLifecycleStore } from "../../src/state/driverLifecycle.store";
import { useDriverStandbyStore } from "../../src/state/driverStandby.store";
import { driverErrorMessage } from "../../src/lib/driverServer.core";

const VALID_TIERS: UrgencyTier[] = ["CAT_1_IMMEDIATE", "CAT_2_URGENT", "CAT_3_DELAYED"];
const VALID_VEHICLE_TYPES: AIS125VehicleType[] = ["TYPE_D_ALS", "TYPE_C_BLS", "TYPE_B_PTA", "TYPE_A_MFR"];

export default function DispatchOfferRoute() {
  const router = useRouter();
  const p = useLocalSearchParams<{
    missionId?: string;
    offerId?: string;
    acuity?: string;
    requiredVehicleType?: string;
    address?: string;
    landmark?: string;
    distanceKm?: string;
    etaMinutes?: string;
    estimatedFareInr?: string;
    pickupLat?: string;
    pickupLng?: string;
    expiresAt?: string;
    clockOffsetMs?: string;
    patientSummary?: string;
  }>();
  const { driverId, send, submit } = useDriverLifecycleStore();
  const registeredVehicleType = useDriverStandbyStore((s) => s.registeredAis125Type);
  const [busy, setBusy] = useState(false);

  const driverGps = useDriverStandbyStore((s) => s.gps);
  const [route, setRoute] = useState<{ distanceKm: number; etaMinutes: number } | null>(null);
  const hasPickup = Boolean(p.pickupLat && p.pickupLng);
  useEffect(() => {
    if (!hasPickup) return;
    let cancelled = false;
    void getDrivingRoute(driverGps, { latitude: Number(p.pickupLat), longitude: Number(p.pickupLng) }).then((r) => {
      if (!cancelled) setRoute({ distanceKm: r.distanceKm, etaMinutes: r.durationMin });
    });
    return () => {
      cancelled = true;
    };
  }, [hasPickup, p.pickupLat, p.pickupLng, driverGps.latitude, driverGps.longitude]);

  // No invented ids: with a real server offer the ids are always real.
  const missionId = p.missionId ?? "";
  const offerId = p.offerId ?? "";
  const actingDriverId = getServerAdapter()?.userId ?? driverId ?? undefined;
  // What the offer carried, or undefined (shown as "—"): never a default urgency and never the driver's own type standing in
  // for the mission's. The server only offers a mission whose type matches this driver's registered one.
  const acuity: UrgencyTier | undefined = VALID_TIERS.includes(p.acuity as UrgencyTier) ? (p.acuity as UrgencyTier) : undefined;
  const requiredVehicleType: AIS125VehicleType | undefined = VALID_VEHICLE_TYPES.includes(p.requiredVehicleType as AIS125VehicleType)
    ? (p.requiredVehicleType as AIS125VehicleType)
    : undefined;
  const estimatedFareInr = p.estimatedFareInr !== undefined && Number.isFinite(Number(p.estimatedFareInr)) ? Number(p.estimatedFareInr) : undefined;
  // Only the clinical content the offer actually carried (D-UX-02).
  const patientSummary = useMemo(() => {
    try {
      return p.patientSummary ? (JSON.parse(p.patientSummary) as { primaryComplaint?: string; derivedFlags?: string[]; ageBand?: string; sex?: string }) : undefined;
    } catch {
      return undefined;
    }
  }, [p.patientSummary]);

  const refuse = (code: string) => {
    Alert.alert("Not recorded", driverErrorMessage(code));
    // The machine did not move: return it to standby the way an expiry does, so the driver is not stuck on a dead offer.
    send({ type: "SERVER_OFFER_TIMEOUT", payload: { offerId } });
    router.replace("/(shift)/standby");
  };

  return (
    <IncomingMissionModal
      visible={true}
      missionId={missionId}
      initialAcuity={acuity}
      requiredVehicleType={requiredVehicleType}
      registeredVehicleType={registeredVehicleType ?? undefined}
      pickupAddress={p.address}
      pickupLandmark={p.landmark}
      distanceKm={route?.distanceKm ?? (p.distanceKm ? Number(p.distanceKm) : undefined)}
      etaMinutes={route?.etaMinutes ?? (p.etaMinutes ? Number(p.etaMinutes) : undefined)}
      estimatedFareInr={estimatedFareInr}
      expiresAt={p.expiresAt}
      clockOffsetMs={p.clockOffsetMs ? Number(p.clockOffsetMs) : 0}
      patientSummary={patientSummary}
      onAccept={async (acceptedId) => {
        if (busy) return;
        if (!actingDriverId) return refuse("not_found");
        setBusy(true);
        // Server first (7.5 rule 1): the machine only moves if the server says this driver won the offer.
        const result = await submit({
          type: "ACCEPT_DISPATCH",
          payload: { missionId: acceptedId, driverId: actingDriverId, offerId, acceptedAt: new Date().toISOString() },
        });
        setBusy(false);
        if (!result.ok) return refuse(result.error.code);
        router.replace({ pathname: "/mission/[id]", params: { id: acceptedId, pickupLat: p.pickupLat, pickupLng: p.pickupLng } });
      }}
      onDecline={(reason) => {
        if (!actingDriverId) {
          send({ type: "SERVER_OFFER_TIMEOUT", payload: { offerId } });
          router.back();
          return;
        }
        void submit({
          type: "DECLINE_DISPATCH",
          payload: { missionId, driverId: actingDriverId, offerId, reason: reason as never, declinedAt: new Date().toISOString() },
        }).then((result) => {
          // A decline the server could not record still lets this driver stand down locally: the offer times out on its own.
          if (!result.ok) send({ type: "SERVER_OFFER_TIMEOUT", payload: { offerId } });
        });
        router.back();
      }}
      onTimeout={() => {
        // The window (server expiresAt when present) closed unactioned: back to standby, same as an explicit decline.
        send({ type: "SERVER_OFFER_TIMEOUT", payload: { offerId } });
        router.back();
      }}
    />
  );
}
