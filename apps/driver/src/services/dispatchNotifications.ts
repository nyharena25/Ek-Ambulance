import Constants, { ExecutionEnvironment } from "expo-constants";
import { AppState, Platform } from "react-native";
import {
  ACTION_ACCEPT,
  ACTION_DECLINE,
  offerNotificationBody,
  type OfferNotificationData,
} from "./dispatchNotifications.core";

export const DISPATCH_CHANNEL_ID = "emergency_dispatch";
const OFFER_CATEGORY_ID = "dispatch_offer";

/** Expo Go (SDK 53+) has no expo-notifications native module: even importing it can crash the root layout. */
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

type NotificationsModule = typeof import("expo-notifications");
let loaded: NotificationsModule | null = null;

/** Lazily loads expo-notifications in dev/production builds; null in Expo Go. */
function native(): NotificationsModule | null {
  if (isExpoGo) return null;
  if (!loaded) {
    loaded = require("expo-notifications") as NotificationsModule;
    loaded.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }
  return loaded;
}

// Expo Go fallback: the offer screen is pushed in-app and this is the only diagnostic.
function expoGoNotice(what: string): void {
  console.info(`[dispatchNotifications] Expo Go: ${what} skipped (needs a development build); the in-app offer screen is the only alert.`);
}

/**
 * Registers the max-importance channel, the Accept/Decline action category and notification permission.
 * Android has no full-screen-intent API in expo-notifications: the strongest available is a MAX-importance
 * heads-up that is public on the lock screen, bypasses DND and vibrates. A true full-screen takeover needs a
 * native config plugin (USE_FULL_SCREEN_INTENT + setFullScreenIntent) and a dev build.
 */
export async function setupDispatchNotifications(): Promise<void> {
  const Notifications = native();
  if (!Notifications) return expoGoNotice("notification channel setup");
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(DISPATCH_CHANNEL_ID, {
      name: "Emergency dispatch",
      importance: Notifications.AndroidImportance.MAX,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
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
      data: { ...data },
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
