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

export type NativeLoad<T> = { status: "ready"; module: T } | { status: "unavailable"; reason: string };

/**
 * Loads an optional native module, never throwing: Expo Go has no expo-notifications native side, and a dev build
 * compiled before a dependency was added (e.g. ExpoApplication, which expo-notifications needs since SDK 58) throws
 * "Cannot find native module" at require time. Callers cache the result so a failed load is not retried.
 */
export function loadOptionalNative<T>(inExpoGo: boolean, load: () => T): NativeLoad<T> {
  if (inExpoGo) return { status: "unavailable", reason: "Expo Go" };
  try {
    const module = load();
    if (!module) return { status: "unavailable", reason: "module resolved empty" };
    return { status: "ready", module };
  } catch (e) {
    return { status: "unavailable", reason: e instanceof Error ? e.message : String(e) };
  }
}

export const ACTION_ACCEPT = "ACCEPT_MISSION";
export const ACTION_DECLINE = "DECLINE_MISSION";

export type OfferActionResult =
  | { kind: "accept"; event: DriverLifecycleEvent; route: { pathname: "/mission/[id]"; params: { id: string; pickupLat?: string; pickupLng?: string } } }
  | { kind: "decline"; event: DriverLifecycleEvent };

function isOfferNotificationData(data: unknown): data is OfferNotificationData {
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

/** What the notification itself may carry: only what resolveOfferAction needs to accept or decline. The patient summary,
 *  address and other offer details stay in the in-app offer screen, never in the system notification store. */
export function offerNotificationPayload(data: OfferNotificationData): Pick<OfferNotificationData, "missionId" | "offerId" | "pickupLat" | "pickupLng"> {
  return {
    missionId: data.missionId,
    offerId: data.offerId,
    ...(data.pickupLat !== undefined ? { pickupLat: data.pickupLat } : {}),
    ...(data.pickupLng !== undefined ? { pickupLng: data.pickupLng } : {}),
  };
}

export function offerNotificationBody(data: OfferNotificationData): string {
  const parts = [data.address, data.distanceKm ? `${data.distanceKm} km` : null, data.etaMinutes ? `ETA ${data.etaMinutes} min` : null];
  return parts.filter(Boolean).join(" • ");
}
