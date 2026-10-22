import assert from "node:assert";
import { readFileSync } from "node:fs";
import { resolveOfferAction, offerNotificationBody, offerNotificationPayload, ACTION_ACCEPT, ACTION_DECLINE } from "./dispatchNotifications.core.ts";

const now = new Date("2026-09-25T10:00:00.000Z");
const data = {
  missionId: "MSN-1",
  offerId: "OFFER-1",
  address: "Hauz Khas Village",
  distanceKm: "4.2",
  etaMinutes: "11",
  pickupLat: "28.5672",
  pickupLng: "77.21",
};

console.log("Test 1: Accept button -> ACCEPT_DISPATCH + mission route carrying pickup coordinates...");
const accept = resolveOfferAction(ACTION_ACCEPT, data, "DRV-1", now);
assert.deepStrictEqual(accept, {
  kind: "accept",
  event: { type: "ACCEPT_DISPATCH", payload: { missionId: "MSN-1", driverId: "DRV-1", offerId: "OFFER-1", acceptedAt: now.toISOString() } },
  route: { pathname: "/mission/[id]", params: { id: "MSN-1", pickupLat: "28.5672", pickupLng: "77.21" } },
});
console.log("✓ accept\n");

console.log("Test 2: Decline button -> DECLINE_DISPATCH, no navigation...");
const decline = resolveOfferAction(ACTION_DECLINE, data, "DRV-1", now);
assert.deepStrictEqual(decline, {
  kind: "decline",
  event: { type: "DECLINE_DISPATCH", payload: { missionId: "MSN-1", driverId: "DRV-1", offerId: "OFFER-1", reason: "other", declinedAt: now.toISOString() } },
});
console.log("✓ decline\n");

console.log("Test 3: plain taps, unknown actions and malformed data do nothing...");
assert.strictEqual(resolveOfferAction("expo.modules.notifications.actions.DEFAULT", data, "DRV-1"), null);
assert.strictEqual(resolveOfferAction(ACTION_ACCEPT, {}, "DRV-1"), null);
assert.strictEqual(resolveOfferAction(ACTION_ACCEPT, null, "DRV-1"), null);
assert.strictEqual(resolveOfferAction(ACTION_ACCEPT, { missionId: 5, offerId: "x" }, "DRV-1"), null);
console.log("✓ guards\n");

console.log("Test 4: notification body...");
assert.strictEqual(offerNotificationBody(data), "Hauz Khas Village • 4.2 km • ETA 11 min");
assert.strictEqual(offerNotificationBody({ missionId: "m", offerId: "o" }), "");
console.log("✓ body\n");
console.log("Test 5: the notification carries only what Accept/Decline need, never the patient summary or address...");
const full = { ...data, patientSummary: JSON.stringify({ primaryComplaint: "chest_pain", sex: "F" }), acuity: "CAT_1_IMMEDIATE" } as unknown as typeof data;
const payload = offerNotificationPayload(full);
assert.deepStrictEqual(payload, { missionId: "MSN-1", offerId: "OFFER-1", pickupLat: "28.5672", pickupLng: "77.21" });
assert.deepStrictEqual(resolveOfferAction(ACTION_ACCEPT, payload, "DRV-1", now), accept, "the reduced payload still accepts exactly as before");
const src = readFileSync(new URL("./dispatchNotifications.ts", import.meta.url), "utf8");
assert.match(src, /lockscreenVisibility: Notifications\.AndroidNotificationVisibility\.PRIVATE/, "lock-screen content is private");
assert.doesNotMatch(src, /AndroidNotificationVisibility\.PUBLIC/, "never public on the lock screen");
assert.match(src, /data: offerNotificationPayload\(data\)/, "the scheduled notification uses the reduced payload");
console.log("✓ notification privacy\n");
console.log("DISPATCH NOTIFICATION CORE TESTS PASSED (100% GREEN)");
