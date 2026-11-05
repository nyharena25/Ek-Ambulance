import { isRunningInExpoGo } from "expo";
import Constants from "expo-constants";
import { AppState, Platform } from "react-native";
import {
  ACTION_ACCEPT,
  ACTION_DECLINE,
  loadOptionalNative,
  offerNotificationBody,
  offerNotificationPayload,
  type NativeLoad,
  type OfferNotificationData,
} from "./dispatchNotifications.core";

const DISPATCH_CHANNEL_ID = "emergency_dispatch";
const OFFER_CATEGORY_ID = "dispatch_offer";

type NotificationsModule = typeof import("expo-notifications");
let loaded: NativeLoad<NotificationsModule> | null = null;

/**
 * Lazily loads expo-notifications once; null when its native side is missing (Expo Go, or a dev build that predates
 * the SDK 58 upgrade). Expo Go is detected the way Expo's own modules do it: `Constants.executionEnvironment` is not
 * reliably "storeClient" there.
 */
function native(): NotificationsModule | null {
  if (!loaded) {
    loaded = loadOptionalNative(isRunningInExpoGo(), () => require("expo-notifications") as NotificationsModule);
    if (loaded.status === "ready") {
      loaded.module.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
    } else if (loaded.reason !== "Expo Go") {
      console.warn(`[dispatchNotifications] expo-notifications unavailable (${loaded.reason}); rebuild the dev client with \`pnpm --filter @sahayak/driver android\`.`);
    }
  }
  return loaded.status === "ready" ? loaded.module : null;
}

// Fallback when the native module is missing: the offer screen is pushed in-app and this is the only diagnostic.
function expoGoNotice(what: string): void {
  console.info(`[dispatchNotifications] ${what} skipped (no expo-notifications native module; needs a development build); the in-app offer screen is the only alert.`);
}

/**
 * Registers the max-importance channel, the Accept/Decline action category and notification permission.
 * Android has no full-screen-intent API in expo-notifications: the strongest available is a MAX-importance
 * heads-up that bypasses DND and vibrates. Its content (the patient's pickup address) is PRIVATE on the lock screen:
 * the alert still sounds and shows, the details only after unlock. A true full-screen takeover needs a
 * native config plugin (USE_FULL_SCREEN_INTENT + setFullScreenIntent) and a dev build.
 */
export async function setupDispatchNotifications(): Promise<void> {
  const Notifications = native();
  if (!Notifications) return expoGoNotice("notification channel setup");
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(DISPATCH_CHANNEL_ID, {
      name: "Emergency dispatch",
      importance: Notifications.AndroidImportance.MAX,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      bypassDnd: true,
      enableVibrate: true,
      // Android channels cannot repeat a pattern; this long one is as close to "continuous" as the API allows.
      vibrationPattern: [0, 800, 300, 800, 300, 800, 300, 1600],
      sound: "default",
      showBadge: false,
    });
  }
  await Notifications.setNotificationCategoryAsync(OFFER_CATEGORY_ID, [
    { identifier: ACTION_ACCEPT, buttonTitle: "Accept Mission", options: { opensAppToForeground: true } },
    { identifier: ACTION_DECLINE, buttonTitle: "Decline", options: { opensAppToForeground: false } },
  ]);
  await Notifications.requestPermissionsAsync();
}

/** Shows the offer as a high-priority notification, only if the app is not in the foreground. */
export async function notifyIncomingOffer(data: OfferNotificationData): Promise<boolean> {
  if (AppState.currentState === "active") return false;
  const Notifications = native();
  if (!Notifications) {
    expoGoNotice("background offer notification");
    return false;
  }
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Incoming emergency mission",
      body: offerNotificationBody(data),
      data: offerNotificationPayload(data),
      categoryIdentifier: OFFER_CATEGORY_ID,
      priority: Notifications.AndroidNotificationPriority.MAX,
      sticky: true,
      sound: "default",
      vibrate: [0, 800, 300, 800, 300, 800, 300, 1600],
    },
    trigger: { channelId: DISPATCH_CHANNEL_ID },
  });
  return true;
}

export interface OfferActionResponse {
  actionIdentifier: string;
  data: unknown;
  notificationId: string;
}

/** Accept/Decline button presses; a no-op unsubscribe in Expo Go. */
export function subscribeToOfferActions(handler: (response: OfferActionResponse) => void): () => void {
  const Notifications = native();
  if (!Notifications) return () => {};
  const sub = Notifications.addNotificationResponseReceivedListener((r) =>
    handler({
      actionIdentifier: r.actionIdentifier,
      data: r.notification.request.content.data,
      notificationId: r.notification.request.identifier,
    })
  );
  return () => sub.remove();
}

export function dismissNotification(id: string): void {
  native()?.dismissNotificationAsync(id).catch(() => {});
}

export function dismissAllNotifications(): void {
  native()?.dismissAllNotificationsAsync().catch(() => {});
}

export interface DevicePushToken {
  token: string;
  platform: "android" | "ios" | "web";
}

/** The Expo push token for this device, for real registration in `driver_push_tokens` (G-21). Needs a real
 *  EAS project id in app.config.ts's `extra.eas.projectId` - `getExpoPushTokenAsync` throws without one, and
 *  the placeholder slug this repo ships today ("ek-ambulance-driver") is not one; that throw is caught here
 *  and reported as `null`, never a fabricated token. Also null in Expo Go (no native module) and on web. */
export async function getDevicePushToken(): Promise<DevicePushToken | null> {
  if (Platform.OS === "web") return null;
  const Notifications = native();
  if (!Notifications) {
    expoGoNotice("push token registration");
    return null;
  }
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return token ? { token, platform: Platform.OS === "ios" ? "ios" : "android" } : null;
  } catch (e) {
    console.warn("[dispatchNotifications] getExpoPushTokenAsync failed (no real EAS project configured?):", e);
    return null;
  }
}
