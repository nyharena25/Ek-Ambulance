import assert from "node:assert";
import { showBrowserAlert, type AlertButton, type BrowserDialogs } from "./alert.core.ts";

console.log("=================================================");
console.log("Running Ek-Ambulance Web Alert Core Tests");
console.log("=================================================\n");

function dialogs(confirmAnswer: boolean) {
  const shown: string[] = [];
  const d: BrowserDialogs = {
    alert: (m) => void shown.push(`alert:${m}`),
    confirm: (m) => {
      shown.push(`confirm:${m}`);
      return confirmAnswer;
    },
  };
  return { d, shown };
}

console.log("Test 1: a title-only notice shows window.alert with the title...");
{
  const { d, shown } = dialogs(true);
  showBrowserAlert(d, "Sign out failed");
  assert.deepStrictEqual(shown, ["alert:Sign out failed"]);
}

console.log("Test 2: title and message are joined by a blank line...");
{
  const { d, shown } = dialogs(true);
  showBrowserAlert(d, "Not recorded", "Try again.");
  assert.deepStrictEqual(shown, ["alert:Not recorded\n\nTry again."]);
}

console.log("Test 3: a cancel + action pair asks window.confirm; OK runs the action only...");
{
  const { d, shown } = dialogs(true);
  const ran: string[] = [];
  const buttons: AlertButton[] = [
    { text: "No", style: "cancel", onPress: () => void ran.push("cancel") },
    { text: "Yes", onPress: () => void ran.push("yes") },
  ];
  showBrowserAlert(d, "Accept?", "0.6 km", buttons);
  assert.deepStrictEqual(shown, ["confirm:Accept?\n\n0.6 km"]);
  assert.deepStrictEqual(ran, ["yes"]);
}

console.log("Test 4: Cancel in window.confirm runs the cancel handler, never the action...");
{
  const { d } = dialogs(false);
  const ran: string[] = [];
  showBrowserAlert(d, "Sign out?", undefined, [
    { text: "Cancel", style: "cancel", onPress: () => void ran.push("cancel") },
    { text: "Sign out", style: "destructive", onPress: () => void ran.push("signout") },
  ]);
  assert.deepStrictEqual(ran, ["cancel"]);
}

console.log("Test 5: a cancel button without onPress is fine when declined...");
{
  const { d } = dialogs(false);
  let ran = false;
  showBrowserAlert(d, "Leave?", undefined, [{ text: "Stay", style: "cancel" }, { text: "Leave", onPress: () => void (ran = true) }]);
  assert.strictEqual(ran, false);
}

console.log("Test 6: a single non-cancel button is a notice whose handler runs after it...");
{
  const { d, shown } = dialogs(false);
  let ran = false;
  showBrowserAlert(d, "Done", undefined, [{ text: "OK", onPress: () => void (ran = true) }]);
  assert.deepStrictEqual(shown, ["alert:Done"]);
  assert.strictEqual(ran, true);
}

console.log("\nALL WEB ALERT CORE TESTS PASSED (100% GREEN)");
