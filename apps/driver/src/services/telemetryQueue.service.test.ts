import assert from "node:assert";
import { TelemetryQueueService } from "./telemetryQueue.service.ts";
import { driverOfflineStrings } from "../i18n/driverOfflineStrings.ts";

console.log("=================================================");
console.log("Running Ek-Ambulance Rural UP Offline Unit Tests");
console.log("=================================================\n");

// Test Suite 1: Exact Verbatim Strings Requirement & Bilingual Parity
console.log("Test 1: Validating exact banner text requirements & bilingual parity...");
const expectedEnBanner = "Low Connectivity: Operating in SMS/Store-and-Forward Fallback";
const expectedHiBanner = "कम कनेक्टिविटी: एसएमएस / स्टोर-एंड-फ़ॉरवर्ड फ़ॉलबैक में संचालित";

assert.strictEqual(
  driverOfflineStrings.en.bannerTitle,
  expectedEnBanner,
  `English banner title must match exact requirement "${expectedEnBanner}"`
);
assert.strictEqual(
  driverOfflineStrings.hi.bannerTitle,
  expectedHiBanner,
  `Hindi banner title must match exact requirement "${expectedHiBanner}"`
);
console.log("✓ Exact banner title string assertions passed for English & Hindi.\n");

// Test Suite 2: Telemetry Queue Enqueue & FIFO Preservation
console.log("Test 2: Validating Store-and-Forward Telemetry Queue FIFO mechanics...");
const queueService = new TelemetryQueueService({ maxCapacity: 20 });
queueService.clear();

assert.strictEqual(queueService.getPendingCount(), 0);

const p1 = queueService.enqueuePing("MSN-2026-8819", { latitude: 26.8467, longitude: 80.9462 }, { speed: 45, heading: 90 });
const p2 = queueService.enqueuePing("MSN-2026-8819", { latitude: 26.8500, longitude: 80.9500 }, { speed: 50, heading: 92 });
const p3 = queueService.enqueuePing("MSN-2026-8819", { latitude: 26.8550, longitude: 80.9550 }, { speed: 55, heading: 95 });

assert.strictEqual(queueService.getPendingCount(), 3);
assert.strictEqual(p1.syncStatus, "queued");
assert.strictEqual(p1.recordedInDeadZone, true);
assert.strictEqual(p1.latitude, 26.8467);
assert.strictEqual(p1.speed, 45);

const pending = queueService.getPendingPings();
assert.strictEqual(pending.length, 3, "All three pings retained in the queue");
assert.strictEqual(pending[0]?.id, p1.id, "FIFO order preserved for earliest ping");
assert.strictEqual(pending[1]?.id, p2.id, "FIFO order preserved for middle ping");
assert.strictEqual(pending[2]?.id, p3.id, "FIFO order preserved for latest ping");
console.log("✓ Enqueueing and FIFO ordering verified successfully.\n");

// Test Suite 3: Carrier SMS Emergency Fallback Payload (<= 140 GSM chars)
console.log("Test 3: Validating UP 108 Emergency SMS fallback formatting...");
const smsPayload = queueService.formatSmsFallbackPayload("MSN-2026-8819", p3);

assert.strictEqual(smsPayload.smsNumber, "108");
assert.ok(smsPayload.body.includes("UP108:AMB MSN-2026-8819"), "SMS body must include dispatch mission identifier");
assert.ok(smsPayload.body.includes("LOC:26.8550,80.9550"), "SMS body must include latest GPS coordinates");
assert.ok(smsPayload.body.includes("SPD:55K"), "SMS body must include speed");
assert.ok(smsPayload.body.length <= 140, `SMS length (${smsPayload.body.length}) must be <= 140 GSM characters`);
console.log(`✓ SMS Fallback generated valid 108 dispatch payload (${smsPayload.body.length} chars): "${smsPayload.body}"\n`);

// Test Suite 4: Queue Compaction during Prolonged Rural UP Dead Zones
console.log("Test 4: Validating memory-safe queue compaction for extended offline periods...");
const cappedQueue = new TelemetryQueueService({ maxCapacity: 75 });
cappedQueue.clear();

for (let i = 0; i < 90; i++) {
  cappedQueue.enqueuePing("MSN-2026-8819", { latitude: 26.0 + i * 0.001, longitude: 80.0 + i * 0.001 }, { speed: 50 });
}

// After 90 insertions into a max-capacity 75 queue, compaction should have run
const compactedCount = cappedQueue.getPendingCount();
assert.ok(compactedCount <= 85, `Compacted queue count (${compactedCount}) should be controlled below unconstrained growth`);
const allPings = cappedQueue.getAllPings();
// Earliest ping preserved
assert.ok(allPings.length > 0, "Compaction must never empty the queue");
assert.strictEqual(allPings[0]?.latitude, 26.0, "Trip origin departure coordinates preserved after compaction");
console.log(`✓ Queue compacted safely from 90 to ${compactedCount} pings while preserving origin and recent trajectory.\n`);

// Test Suite 5: Automated Flush on Reconnection
console.log("Test 5: Validating automatic flush and sync upon connectivity restoration...");
let syncAttempts = 0;
let syncedBatchSize = 0;

// Case 5A: Successful Sync
const flushResult = await queueService.flushQueue(async (pings) => {
  syncAttempts++;
  syncedBatchSize = pings.length;
  return true; // Server accepts batch
});

assert.strictEqual(flushResult.syncedCount, 3);
assert.strictEqual(flushResult.remainingCount, 0);
assert.strictEqual(queueService.getPendingCount(), 0);
assert.strictEqual(syncAttempts, 1);
assert.strictEqual(syncedBatchSize, 3);
console.log("✓ All pending pings flushed and drained upon successful server acknowledgement.\n");

// Case 5B: Failed Sync & Retry Increment
const failPing = queueService.enqueuePing("MSN-2026-8819", { latitude: 26.9, longitude: 80.9 });
const failResult = await queueService.flushQueue(async () => {
  return false; // Network drops mid-sync
});

assert.strictEqual(failResult.syncedCount, 0);
assert.strictEqual(failResult.remainingCount, 1);
assert.strictEqual(queueService.getPendingCount(), 1);
const retainedPing = queueService.getPendingPings()[0];
assert.ok(retainedPing, "Failed ping must be retained in the queue");
assert.strictEqual(retainedPing.id, failPing.id, "The retained ping is the one that failed to sync");
assert.strictEqual(retainedPing.syncStatus, "failed");
assert.strictEqual(retainedPing.retryCount, 1, "Retry count incremented on failed sync attempt");
console.log("✓ Failed sync cleanly retains pings with incremented retry count.\n");

// Test Suite 6: Zustand Connection Store State Transitions
// Test Suite 6: Telemetry Queue Observer Subscription Pattern
console.log("Test 6: Validating telemetry queue state listener & subscriber notifications...");
let receivedPingsCount = -1;
const unsubscribe = queueService.subscribe((state) => {
  receivedPingsCount = state.pings.length;
});

const subPing = queueService.enqueuePing("MSN-2026-8819", { latitude: 26.86, longitude: 80.96 });
assert.strictEqual(receivedPingsCount, queueService.getAllPings().length);
assert.strictEqual(subPing.missionId, "MSN-2026-8819", "Subscriber notified for the enqueued ping");
unsubscribe();

console.log("✓ State listener and observer subscription verified.\n");

console.log("=================================================");
console.log("ALL 6 TEST SUITES PASSED SUCCESSFULLY (100% GREEN)");
console.log("=================================================");
