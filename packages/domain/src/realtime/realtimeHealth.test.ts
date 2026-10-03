import assert from "node:assert/strict";
import {
  initialRealtime,
  reduceRealtime,
  realtimeHealth,
  gpsHealth,
  trackingBadge,
  type RealtimeEvent,
  type RealtimeSnapshot,
} from "./index.ts";

const run = (events: Array<[RealtimeEvent, number]>, from: RealtimeSnapshot = initialRealtime()) =>
  events.reduce((s, [e, at]) => reduceRealtime(s, e, at), from);

// Connect -> subscribe: healthy, no reconnect counted for the first connect.
const s = run([[{ type: "connecting" }, 0], [{ type: "connected" }, 300], [{ type: "subscribing" }, 310], [{ type: "subscribed" }, 400]]);
assert.equal(s.connectionState, "connected");
assert.equal(s.subscriptionState, "subscribed");
assert.equal(s.reconnectAttempt, 0, "the first connect is not a reconnect");
assert.equal(s.lastConnectedAt, 300);
assert.equal(s.transportName, "centrifugo");
assert.equal(realtimeHealth(s, 500), "healthy");

// A quiet channel is not a network failure: no messages for 10 minutes, still healthy.
assert.equal(realtimeHealth(s, 10 * 60_000), "healthy", "silence alone never degrades a connected, subscribed channel");

// Connected but the channel is not (yet) subscribed: degraded, not offline.
assert.equal(realtimeHealth(run([[{ type: "unsubscribed" }, 600]], s), 700), "degraded");

// A drop with reconnect: the SDK goes connected -> connecting directly (no "disconnected" event).
const dropped = run([[{ type: "connecting", reason: "transport closed" }, 1_000]], s);
assert.equal(dropped.reconnectAttempt, 1);
assert.equal(dropped.lastError, "transport closed");
assert.equal(run([[{ type: "disconnected", reason: "client" }, 1_000]], s).subscriptionState, "subscribing", "a dropped socket means the subscription is being re-established");
assert.equal(realtimeHealth(dropped, 5_000), "degraded", "inside the grace period");
assert.equal(realtimeHealth(dropped, 15_000), "reconnecting", "past grace, still trying");
// Fallback only on evidence: down long enough, or several failed attempts.
assert.equal(realtimeHealth(dropped, 1_000 + 30_000), "disconnected", "down for the failure threshold");
// Each failed retry while down is a client `error` event (the SDK does not re-emit `connecting`).
const manyAttempts = run([[{ type: "error", message: "transport" }, 2_000], [{ type: "error", message: "transport" }, 3_000]], dropped);
assert.equal(manyAttempts.reconnectAttempt, 3);
assert.equal(realtimeHealth(manyAttempts, 13_000), "disconnected", "three failed attempts past grace");

// Reconnect -> resubscribe: healthy again, counters reset, fallback cleared.
const back = run([[{ type: "connected" }, 20_000], [{ type: "subscribed" }, 20_100]], manyAttempts);
assert.equal(back.reconnectAttempt, 0);
assert.equal(back.downSince, null);
assert.equal(realtimeHealth(back, 20_200), "healthy");

// Never connected at all (bad URL / server down from the start) eventually counts as disconnected, not "connecting" forever.
const never = run([[{ type: "connecting" }, 0]]);
assert.equal(realtimeHealth(never, 5_000), "degraded");
assert.equal(realtimeHealth(never, 31_000), "disconnected");
// Explicitly idle (no session / unmounted): disconnected without waiting.
assert.equal(realtimeHealth(initialRealtime(), 0), "disconnected");

// Messages and heartbeats are recorded, never used as proof of failure.
const msg = run([[{ type: "message" }, 450], [{ type: "heartbeat" }, 460], [{ type: "error", message: "token refresh failed" }, 470]], s);
assert.equal(msg.lastMessageAt, 450);
assert.equal(msg.lastHeartbeatAt, 460);
assert.equal(msg.lastError, "token refresh failed");
assert.equal(realtimeHealth(msg, 480), "healthy", "an SDK error event alone does not mean the socket is down");

// GPS health is separate from transport health.
assert.equal(gpsHealth(null, 0), "none");
assert.equal(gpsHealth(1_000, 20_000), "fresh");
assert.equal(gpsHealth(1_000, 32_000), "stale");

// The patient badge: transport first, then GPS. A healthy socket with a quiet GPS feed is never "paused".
assert.equal(trackingBadge("healthy", "fresh"), "live");
assert.equal(trackingBadge("healthy", "stale"), "awaitingGps");
assert.equal(trackingBadge("healthy", "none"), "awaitingGps");
assert.equal(trackingBadge("degraded", "fresh"), "connecting");
assert.equal(trackingBadge("reconnecting", "fresh"), "connecting");
assert.equal(trackingBadge("disconnected", "fresh"), "paused");

console.log("REALTIME HEALTH TESTS PASSED (100% GREEN)");
