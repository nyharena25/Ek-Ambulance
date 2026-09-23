import type { DriverLifecycleEvent } from "@sahayak/domain";

/** Route params of an offer, all strings (they ride in notification `data` and expo-router params). */
export interface OfferNotificationData {
  missionId: string;
  offerId: string;
  address?: string;
  landmark?: string;
  distanceKm?: string;
  etaMinutes?: string;
  pickupLat?: string;
  pickupLng?: string;
}

export const ACTION_ACCEPT = "ACCEPT_MISSION";
export const ACTION_DECLINE = "DECLINE_MISSION";

export type OfferActionResult =
  | { kind: "accept"; event: DriverLifecycleEvent; route: { pathname: "/mission/[id]"; params: { id: string; pickupLat?: string; pickupLng?: string } } }
  | { kind: "decline"; event: DriverLifecycleEvent };

export function isOfferNotificationData(data: unknown): data is OfferNotificationData {
  const d = data as Partial<OfferNotificationData> | null;
  return typeof d?.missionId === "string" && typeof d?.offerId === "string";
}

/** Maps a notification button press to the exact lifecycle event the in-app offer screen would send. */
export function resolveOfferAction(
  actionIdentifier: string,
  data: unknown,
  driverId: string,
  now: Date = new Date()
): OfferActionResult | null {
  if (!isOfferNotificationData(data)) return null;
  const at = now.toISOString();
  if (actionIdentifier === ACTION_ACCEPT) {
    const params = { id: data.missionId, pickupLat: data.pickupLat, pickupLng: data.pickupLng };
    return {
      kind: "accept",
      event: {
        type: "ACCEPT_DISPATCH",
        payload: { missionId: data.missionId, driverId, offerId: data.offerId, acceptedAt: at },
      },
      route: { pathname: "/mission/[id]", params },
    };
  }
  if (actionIdentifier === ACTION_DECLINE) {
    return {
      kind: "decline",
      event: {
        type: "DECLINE_DISPATCH",
        payload: { missionId: data.missionId, driverId, offerId: data.offerId, reason: "other", declinedAt: at },
      },
    };
  }
  return null;
}

export function offerNotificationBody(data: OfferNotificationData): string {
  const parts = [data.address, data.distanceKm ? `${data.distanceKm} km` : null, data.etaMinutes ? `ETA ${data.etaMinutes} min` : null];
  return parts.filter(Boolean).join(" • ");
}
