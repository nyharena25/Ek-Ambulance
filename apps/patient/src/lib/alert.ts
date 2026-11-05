import { Alert as NativeAlert, Platform } from "react-native";
import { showBrowserAlert, type AlertButton } from "./alert.core";

/** Drop-in for react-native's Alert: the native dialog on Android/iOS, the browser's alert/confirm on web. */
export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[]): void {
    if (Platform.OS === "web") showBrowserAlert(window, title, message, buttons);
    else NativeAlert.alert(title, message, buttons);
  },
};
