/** Pure core of alert.ts, unit-testable without React Native. react-native-web's Alert.alert is a no-op, so on web a
 *  confirm (accept an emergency, sign out, leave a mission) silently did nothing. This maps the native call onto the
 *  browser's blocking dialogs instead. Same file in the driver app. */

export interface AlertButton {
  text?: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
}

export interface BrowserDialogs {
  alert(message: string): void;
  confirm(message: string): boolean;
}

/** No buttons or a single one: a notice (window.alert), then that button's handler. A cancel button plus an action:
 *  window.confirm, OK runs the last non-cancel button (every call site has exactly one), Cancel runs the cancel one. */
export function showBrowserAlert(dialogs: BrowserDialogs, title: string, message?: string, buttons?: AlertButton[]): void {
  const text = message ? `${title}\n\n${message}` : title;
  const list = buttons ?? [];
  const cancel = list.find((b) => b.style === "cancel");
  const actions = list.filter((b) => b !== cancel);
  if (!cancel || actions.length === 0) {
    dialogs.alert(text);
    (actions[0] ?? cancel)?.onPress?.();
    return;
  }
  const chosen = dialogs.confirm(text) ? actions[actions.length - 1] : cancel;
  chosen?.onPress?.();
}
