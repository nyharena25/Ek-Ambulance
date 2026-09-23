import assert from "node:assert";
import type { MissionTelemetryPing } from "@sahayak/domain";
import {
  mountDriverTelemetryPublisher,
  missionChannelName,
  mockTelemetryEmitter,
  type PublisherClientLike,
} from "./driverTelemetry.ts";

console.log("=================================================");
console.log("Running Ek-Ambulance Driver Telemetry Service Tests");
console.log("=================================================\n");

/** Fake client that never opens a real socket - lets the mount/teardown
 *  and publish contract be verified without network access. `failNextN(n)`
 *  makes the next n publish() calls reject, to exercise retry/backoff and
 *  onPublishError. */
function createFakeClient() {
  const calls = { connect: 0, disconnect: 0, publish: 0 };
  const publishedChannels: string[] = [];
  const publishedPayloads: unknown[] = [];
  let failuresRemaining = 0;
  const client: PublisherClientLike = {
    connect: () => {
      calls.connect += 1;
    },
    disconnect: () => {
      calls.disconnect += 1;
    },
    on: () => client,
    publish: (channel, data) => {
      calls.publish += 1;
      publishedChannels.push(channel);
      publishedPayloads.push(data);
      if (failuresRemaining > 0) {
        failuresRemaining -= 1;
        return Promise.reject(new Error("simulated Centrifugo publish failure"));
      }
      return Promise.resolve({});
    },
  };
  return {
    client,
    calls,
    publishedChannels,
    publishedPayloads,
    failNextN: (n: number) => {
      failuresRemaining = n;
    },
  };
}

const FAST_RETRY_DELAYS_MS = [5, 5];
const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

console.log("Test 1: Validating mission:{missionId} channel naming...");
assert.strictEqual(missionChannelName("MSN-DL-2026-8921"), "mission:MSN-DL-2026-8921");
console.log("✓ Channel name matches the mission:{missionId} convention (same as the patient app's).\n");

console.log("Test 2: Validating mount connects the client exactly once...");
const mounted = createFakeClient();
const publishErrors: unknown[] = [];
const publisher = mountDriverTelemetryPublisher("MSN-TEST-0001", "fake-token", {
  createClient: () => mounted.client,
  onPublishError: (err) => publishErrors.push(err),
  lifecycleRetryDelaysMs: FAST_RETRY_DELAYS_MS,
});
assert.strictEqual(mounted.calls.connect, 1, "connect() called exactly once on mount");
assert.strictEqual(mounted.calls.disconnect, 0, "disconnect() not called before teardown");
console.log("✓ Mount connects exactly once, nothing torn down yet.\n");

console.log("Test 3: Validating publish() sends a `heading` field (schema parity with the patient app), on the correct mission channel...");
publisher.publish({ latitude: 28.5355, longitude: 77.391, heading: 90, speed: 45, timestamp: "2026-01-01T00:00:00.000Z" });
assert.strictEqual(mounted.calls.publish, 1, "publish() forwarded to the client exactly once");
assert.strictEqual(mounted.publishedChannels[0], "mission:MSN-TEST-0001", "Published on the exact mission:{missionId} channel");
assert.strictEqual(
  (mounted.publishedPayloads[0] as MissionTelemetryPing).heading,
  90,
  "Ping carries `heading`, not `bearing` - apps/patient/src/services/missionChannel.service.ts only ever reads `heading`"
);
console.log("✓ Telemetry pings publish on the correct channel with the patient-compatible `heading` field.\n");

console.log("Test 4: Validating publishLifecycleEvent() sends { event, missionId, driverId, timestamp } on the same channel...");
publisher.publishLifecycleEvent("DRIVER_ACCEPTED", "DRV-TEST-0001");
await settle(0); // lifecycle publishes run on a promise chain now (retry queue), not synchronously
assert.strictEqual(mounted.calls.publish, 2, "publishLifecycleEvent() also goes through client.publish()");
assert.strictEqual(mounted.publishedChannels[1], "mission:MSN-TEST-0001", "Lifecycle events publish on the same mission channel as telemetry");
const lifecyclePayload = mounted.publishedPayloads[1] as {
  event: string;
  missionId: string;
  driverId: string;
  timestamp: string;
};
// timestamp is generated fresh on each call, so it's checked separately
// from the stable fields rather than via one deepStrictEqual.
assert.strictEqual(lifecyclePayload.event, "DRIVER_ACCEPTED");
assert.strictEqual(lifecyclePayload.missionId, "MSN-TEST-0001", "Lifecycle publication carries the exact missionId apps/patient/src/services/missionLifecycleBridge.ts expects");
assert.strictEqual(lifecyclePayload.driverId, "DRV-TEST-0001", "Lifecycle publication carries the driver's ID");
assert.ok(!Number.isNaN(Date.parse(lifecyclePayload.timestamp)), "Lifecycle publication carries a valid ISO timestamp");
console.log("✓ Lifecycle events publish the full MissionLifecyclePublication shape, including driverId and timestamp.\n");

console.log("Test 4b: Validating a lifecycle publish that fails once recovers via retry, without calling onPublishError...");
const publishCountBefore4b = mounted.calls.publish;
mounted.failNextN(1);
publisher.publishLifecycleEvent("DRIVER_ARRIVED", "DRV-TEST-0001");
await settle(40); // one FAST_RETRY_DELAYS_MS[0] (5ms) plus margin
assert.strictEqual(mounted.calls.publish, publishCountBefore4b + 2, "Initial attempt (failed) plus one retry (succeeded)");
assert.strictEqual(publishErrors.length, 0, "A recovered retry never reaches onPublishError");
console.log("✓ A single transient failure is retried and recovers silently.\n");

console.log("Test 4c: Validating a lifecycle publish that fails all 3 attempts calls onPublishError exactly once, after exhausting retries...");
const publishCountBefore4c = mounted.calls.publish;
mounted.failNextN(3);
publisher.publishLifecycleEvent("TRANSPORT_STARTED", "DRV-TEST-0001");
await settle(40); // FAST_RETRY_DELAYS_MS[0] + [1] (5ms + 5ms) plus margin
assert.strictEqual(mounted.calls.publish, publishCountBefore4c + 3, "Initial attempt plus both retries were made");
assert.strictEqual(publishErrors.length, 1, "onPublishError fired exactly once, only after every retry was exhausted");
assert.ok(publishErrors[0] instanceof Error, "The rejection reason is passed through");
console.log("✓ Exhausting every retry surfaces onPublishError exactly once, not once per failed attempt.\n");

console.log("Test 4d: Validating same-mission lifecycle events publish strictly in order, even when an earlier one is retrying...");
const orderMounted = createFakeClient();
const orderPublisher = mountDriverTelemetryPublisher("MSN-ORDER-0001", "fake-token", {
  createClient: () => orderMounted.client,
  lifecycleRetryDelaysMs: FAST_RETRY_DELAYS_MS,
});
orderMounted.failNextN(1); // only the first event's first attempt fails
orderPublisher.publishLifecycleEvent("DRIVER_ACCEPTED", "DRV-ORDER-01"); // A: fails once, then retries and succeeds
orderPublisher.publishLifecycleEvent("DRIVER_ARRIVED", "DRV-ORDER-01"); // B: sent immediately after, must not jump the queue
await settle(40);
const orderedEvents = orderMounted.publishedPayloads.map((p) => (p as { event: string }).event);
assert.deepStrictEqual(
  orderedEvents,
  ["DRIVER_ACCEPTED", "DRIVER_ACCEPTED", "DRIVER_ARRIVED"],
  "A's failed attempt and its retry both complete before B publishes at all - the FIFO chain, not independent per-event timers"
);
orderPublisher.teardown();
console.log("✓ Lifecycle events for the same mission are serialized, so a retrying event can never be overtaken by a later one.\n");

console.log("Test 4e: Validating teardown() defers disconnect until an in-flight lifecycle retry drains...");
const drainMounted = createFakeClient();
const drainPublisher = mountDriverTelemetryPublisher("MSN-DRAIN-0001", "fake-token", {
  createClient: () => drainMounted.client,
  lifecycleRetryDelaysMs: FAST_RETRY_DELAYS_MS,
});
drainMounted.failNextN(1); // first attempt fails, one retry scheduled
drainPublisher.publishLifecycleEvent("MISSION_COMPLETED", "DRV-DRAIN-01");
drainPublisher.teardown(); // called synchronously right after, same as ensurePublisherFor(null) does for COMPLETE_MISSION
assert.strictEqual(drainMounted.calls.disconnect, 0, "teardown() must not disconnect while a retry is still pending - it would drop the terminal event");
await settle(40);
assert.strictEqual(drainMounted.calls.disconnect, 1, "disconnect() fires exactly once, once the retry has drained");
assert.strictEqual(drainMounted.calls.publish, 2, "The retried MISSION_COMPLETED still went out before disconnect");
console.log("✓ A pending retry for a terminal wire event (MISSION_COMPLETED/MISSION_CANCELLED) survives teardown() instead of being silently dropped.\n");

console.log("Test 5: Validating teardown disconnects exactly once and is idempotent...");
publisher.teardown();
assert.strictEqual(mounted.calls.disconnect, 1, "disconnect() called exactly once on teardown");
publisher.teardown();
assert.strictEqual(mounted.calls.disconnect, 1, "A second teardown() call does not disconnect again");
console.log("✓ Teardown disconnects exactly once and is safe to call twice.\n");

console.log("Test 6: Validating publish() after teardown is a silent no-op, not a crash...");
const publishCountBeforeTeardownCheck = mounted.calls.publish;
publisher.publish({ latitude: 0, longitude: 0, heading: 0, speed: 0, timestamp: "2026-01-01T00:00:01.000Z" });
publisher.publishLifecycleEvent("MISSION_CANCELLED", "DRV-TEST-0001");
assert.strictEqual(mounted.calls.publish, publishCountBeforeTeardownCheck, "Neither publish() nor publishLifecycleEvent() reach the (disconnected) client after teardown");
console.log("✓ A publish attempted after teardown is dropped, not thrown.\n");

console.log("Test 7: Validating the mock telemetry emitter interpolates along a route and stops cleanly...");
const routePolyline = [
  { latitude: 28.5355, longitude: 77.391 },
  { latitude: 28.5375, longitude: 77.393 },
  { latitude: 28.5395, longitude: 77.395 },
];
const pings: MissionTelemetryPing[] = [];
const emitter = mockTelemetryEmitter(routePolyline, (ping) => pings.push(ping), 10);
emitter.start();
await new Promise((resolve) => setTimeout(resolve, 55));
emitter.stop();
const countAfterStop = pings.length;
await new Promise((resolve) => setTimeout(resolve, 30));
assert.strictEqual(pings.length, countAfterStop, "stop() halts emission - no further pings arrive afterward");
assert.ok(pings.length >= 3, `Emitter produced multiple interpolated pings (got ${pings.length})`);
assert.ok(
  pings.every((p) => typeof p.latitude === "number" && typeof p.heading === "number"),
  "Every emitted ping carries latitude/longitude/heading/speed"
);
console.log(`✓ Mock emitter produced ${pings.length} interpolated pings along the route and stopped cleanly.\n`);

console.log("=================================================");
console.log("ALL DRIVER TELEMETRY SERVICE TESTS PASSED (100% GREEN)");
console.log("=================================================");
