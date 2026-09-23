import * as Notifications from "expo-notifications";
import { AppState, Platform } from "react-native";
import {
  ACTION_ACCEPT,
  ACTION_DECLINE,
  offerNotificationBody,
  type OfferNotificationData,
} from "./dispatchNotifications.core";

export const DISPATCH_CHANNEL_ID = "emergency_dispatch";
const OFFER_CATEGORY_ID = "dispatch_offer";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Registers the max-importance channel, the Accept/Decline action category and notification permission.
 * Android has no full-screen-intent API in expo-notifications: the strongest available is a MAX-importance
 * heads-up that is public on the lock screen, bypasses DND and vibrates. A true full-screen takeover needs a
 * native config plugin (USE_FULL_SCREEN_INTENT + setFullScreenIntent) and a dev build.
 */
export async function setupDispatchNotifications(): Promise<void> {
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

export { Notifications };
