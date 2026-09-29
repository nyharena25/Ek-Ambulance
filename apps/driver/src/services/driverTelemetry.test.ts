import assert from "node:assert";
import type { MissionTelemetryPing } from "@sahayak/domain";
import {
  mountDriverTelemetryPublisher,
  missionChannelName,
  type PublisherClientLike,
} from "./driverTelemetry.ts";

console.log("=================================================");
console.log("Running Ek-Ambulance Driver Telemetry Service Tests");
console.log("=================================================\n");

/** Fake client that never opens a real socket - lets the mount/teardown
 *  and publish contract be verified without network access. `failNextN(n)`
 *  makes the next n publish() calls reject, to exercise onPublishError. */
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

console.log("Test 4: Validating the publisher carries GPS only - lifecycle events are server-published (6.1 Design A)...");
assert.ok(!("publishLifecycleEvent" in publisher), "the driver's only Centrifugo publisher has no lifecycle publish");
const countBefore4 = mounted.calls.publish;
// What the removed client path used to send, and the server's own v1 envelope: neither may leave the driver.
publisher.publish({ event: "DRIVER_ACCEPTED", missionId: "MSN-TEST-0001", driverId: "DRV-TEST-0001", timestamp: "2026-01-01T00:00:00.000Z" } as never);
publisher.publish({ v: 1, type: "lifecycle", event: "MISSION_COMPLETED", seq: 9, latitude: 1, longitude: 2 } as never);
publisher.publish({ latitude: 1, longitude: 2, event: "DRIVER_ARRIVED" } as never);
assert.strictEqual(mounted.calls.publish, countBefore4, "no lifecycle-shaped payload reaches client.publish()");
publisher.publish({ latitude: 28.54, longitude: 77.39, timestamp: "2026-01-01T00:00:02.000Z" });
assert.strictEqual(mounted.calls.publish, countBefore4 + 1, "a real GPS ping still publishes");
assert.strictEqual(mounted.publishedChannels.at(-1), "mission:MSN-TEST-0001");
console.log("✓ Lifecycle payloads are dropped; GPS pings still publish on mission:{id}.\n");

console.log("Test 4b: Validating a failed GPS publish reports once, with no retry (the next ping supersedes it)...");
const countBefore4b = mounted.calls.publish;
mounted.failNextN(1);
publisher.publish({ latitude: 28.55, longitude: 77.4, timestamp: "2026-01-01T00:00:03.000Z" });
await settle(20);
assert.strictEqual(mounted.calls.publish, countBefore4b + 1, "one attempt, no retry");
assert.strictEqual(publishErrors.length, 1, "onPublishError fired exactly once");
assert.ok(publishErrors[0] instanceof Error, "The rejection reason is passed through");
console.log("✓ A failed ping surfaces onPublishError once and is not retried.\n");

console.log("Test 5: Validating teardown disconnects exactly once and is idempotent...");
publisher.teardown();
assert.strictEqual(mounted.calls.disconnect, 1, "disconnect() called exactly once on teardown");
publisher.teardown();
assert.strictEqual(mounted.calls.disconnect, 1, "A second teardown() call does not disconnect again");
console.log("✓ Teardown disconnects exactly once and is safe to call twice.\n");

console.log("Test 6: Validating publish() after teardown is a silent no-op, not a crash...");
const publishCountBeforeTeardownCheck = mounted.calls.publish;
publisher.publish({ latitude: 0, longitude: 0, heading: 0, speed: 0, timestamp: "2026-01-01T00:00:01.000Z" });
assert.strictEqual(mounted.calls.publish, publishCountBeforeTeardownCheck, "publish() does not reach the (disconnected) client after teardown");
console.log("✓ A publish attempted after teardown is dropped, not thrown.\n");

console.log("=================================================");
console.log("ALL DRIVER TELEMETRY SERVICE TESTS PASSED (100% GREEN)");
console.log("=================================================");
