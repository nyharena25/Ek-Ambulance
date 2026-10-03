import assert from "node:assert";
import { DRIVER_REALTIME_THRESHOLDS, useDriverConnectionStore } from "./driverConnection.store.ts";
import { AUTH_REQUIRED_REASON } from "../services/driverRealtime.ts";

console.log("=================================================");
console.log("Running Driver Connection Store Tests (truthful status + fallback)");
console.log("=================================================\n");

const store = () => useDriverConnectionStore.getState();
const healthy = (at = 0) => {
  store().reset();
  // As in useServerSync: reset and connect happen together, before the first health tick.
  store().applyTransport({ type: "connecting", reason: "connect called" }, at);
  store().applyTransport({ type: "connected" }, at + 300);
  store().applyTransport({ type: "subscribed" }, at + 400);
  assert.strictEqual(store().evaluate(at + 500, true), null, "a mission is active; no fallback on a healthy start");
};

console.log("Test 1: a healthy socket never shows fallback, even on a quiet channel...");
{
  healthy();
  assert.strictEqual(store().status, "connected");
  assert.strictEqual(store().evaluate(10 * 60_000, true), null, "10 minutes without a message: no transition");
  assert.strictEqual(store().isFallbackActive, false);
  assert.strictEqual(store().status, "connected");
}
console.log("✓ healthy = connected, no fallback\n");

console.log("Test 2: first connect pending reads as connecting; a connected socket with no channel is connected...");
{
  store().reset();
  store().applyTransport({ type: "connecting" }, 0);
  assert.strictEqual(store().status, "connecting");
  store().applyTransport({ type: "connected" }, 200);
  store().applyTransport({ type: "unsubscribed" }, 210); // driver offline, no mission: nothing to subscribe
  assert.strictEqual(store().status, "connected", "an idle healthy socket is not degraded");
  store().applyTransport({ type: "subscribing" }, 220);
  assert.strictEqual(store().status, "reconnecting", "connected but a required channel is not subscribed yet");
}
console.log("✓ connecting / idle connected\n");

console.log("Test 3: a drop goes reconnecting first; fallback only after the explicit 30 s threshold...");
{
  healthy();
  store().applyTransport({ type: "connecting", reason: "transport closed" }, 1_000);
  // The SDK retries from 500 ms with backoff: many failed attempts inside the first seconds.
  for (const at of [1_600, 2_400, 3_900, 6_500]) store().applyTransport({ type: "error", message: "transport closed" }, at);
  assert.strictEqual(store().evaluate(5_000, true), null);
  assert.strictEqual(store().status, "reconnecting", "inside the grace period");
  assert.strictEqual(store().evaluate(15_000, true), null, "5 failed attempts past grace is still not fallback (used to be)");
  assert.strictEqual(store().status, "reconnecting");
  assert.strictEqual(store().isFallbackActive, false);
  assert.strictEqual(store().evaluate(1_000 + DRIVER_REALTIME_THRESHOLDS.failAfterMs, true), "entered");
  assert.strictEqual(store().status, "disconnected");
  assert.strictEqual(store().isFallbackActive, true);
  // Reconnect + resubscribe restores it.
  store().applyTransport({ type: "connected" }, 40_000);
  store().applyTransport({ type: "subscribed" }, 40_100);
  assert.strictEqual(store().status, "connected", "the status follows the SDK immediately");
  assert.strictEqual(store().evaluate(40_200, true), "exited", "the exit is reported once, so the caller flushes the queue");
  assert.strictEqual(store().isFallbackActive, false, "cleared by the SDK's own connected/subscribed evidence");
  assert.strictEqual(store().evaluate(42_200, true), null, "and only once");
}
console.log("✓ reconnecting -> disconnected -> restored\n");

console.log("Test 4: without an active mission a long outage is disconnected, never fallback...");
{
  healthy();
  store().evaluate(0, false);
  store().applyTransport({ type: "connecting", reason: "transport closed" }, 1_000);
  assert.strictEqual(store().evaluate(60_000, false), null);
  assert.strictEqual(store().status, "disconnected");
  assert.strictEqual(store().isFallbackActive, false);
}
console.log("✓ fallback is mission-only\n");

console.log("Test 5: credentials refused by the server read as authRequired, not as low connectivity...");
{
  healthy();
  store().applyTransport({ type: "disconnected", reason: AUTH_REQUIRED_REASON }, 1_000);
  assert.strictEqual(store().status, "authRequired");
  store().evaluate(40_000, true);
  assert.strictEqual(store().status, "authRequired", "stays authRequired past the threshold");
  // A reconnect with a fresh session clears it.
  store().applyTransport({ type: "connecting", reason: "connect called" }, 41_000);
  assert.notStrictEqual(store().status, "authRequired");
  store().applyTransport({ type: "connected" }, 41_300);
  store().applyTransport({ type: "subscribed" }, 41_400);
  assert.strictEqual(store().status, "connected");
}
console.log("✓ authRequired\n");

console.log("Test 6: logout (reset) clears every trace of the previous session...");
{
  healthy();
  store().markRestored(3);
  store().dismissRestoredBanner();
  assert.strictEqual(store().showRestoredBanner, false, "the restored notice closes");
  store().markRestored(3);
  store().reset();
  assert.strictEqual(store().isFallbackActive, false);
  assert.strictEqual(store().showRestoredBanner, false);
  assert.strictEqual(store().realtime.lastConnectedAt, null);
  assert.strictEqual(store().evaluate(100_000, false), null, "and the mission flag is cleared too");
}
console.log("✓ reset\n");

console.log("ALL DRIVER CONNECTION STORE TESTS PASSED (100% GREEN)");
