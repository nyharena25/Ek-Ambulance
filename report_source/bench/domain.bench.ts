/**
 * Experiment E1: microbenchmarks of the pure @sahayak/domain functions that run on every client interaction
 * (triage, statutory pricing, wire parsing, sequence ordering, board banding, realtime health reduction) and of a
 * full XState patient lifecycle. Pure CPU, no I/O.
 *
 * Run from the repo root:
 *   node --experimental-strip-types report_source/bench/domain.bench.ts > report_source/bench/results/domain.json
 */
import { createRequire } from "node:module";
import os from "node:os";
import { computeTriageUrgency } from "../../packages/domain/src/triage/index.ts";
import { computeItemizedStatutoryFare } from "../../packages/domain/src/pricing/index.ts";
import { parseDispatchOffer } from "../../packages/domain/src/dispatch/index.ts";
import { parseLifecycleMessage, decideSeq } from "../../packages/domain/src/mission-channel/index.ts";
import { boardBand, sortOldestFirst, paginate } from "../../packages/domain/src/dispatch/board.ts";
import { haversineKm } from "../../packages/domain/src/services/routingService.ts";
import { initialRealtime, reduceRealtime, realtimeHealth } from "../../packages/domain/src/realtime/index.ts";
import { patientLifecycleMachine } from "../../packages/domain/src/state-machine/patientLifecycle.machine.ts";

const require = createRequire(new URL("../../packages/domain/package.json", import.meta.url));
const { createActor } = require("xstate") as typeof import("xstate");

/** Runs `fn` in batches until `samples` batch timings exist; returns per-call nanoseconds (median, p95, p99) and ops/s. */
function bench(name: string, fn: () => unknown, opts: { batch?: number; samples?: number; warmup?: number } = {}) {
  const batch = opts.batch ?? 1000;
  const samples = opts.samples ?? 200;
  const warmup = opts.warmup ?? 20;
  let sink: unknown;
  for (let i = 0; i < warmup * batch; i++) sink = fn();
  const perCall: number[] = [];
  for (let s = 0; s < samples; s++) {
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < batch; i++) sink = fn();
    perCall.push(Number(process.hrtime.bigint() - t0) / batch);
  }
  perCall.sort((x, y) => x - y);
  const q = (p: number) => perCall[Math.min(perCall.length - 1, Math.floor(p * perCall.length))];
  const mean = perCall.reduce((x, y) => x + y, 0) / perCall.length;
  if (sink === Symbol.for("never")) console.error("unreachable");
  return {
    name,
    medianNs: +q(0.5).toFixed(1),
    p95Ns: +q(0.95).toFixed(1),
    p99Ns: +q(0.99).toFixed(1),
    meanNs: +mean.toFixed(1),
    opsPerSec: Math.round(1e9 / q(0.5)),
    calls: batch * samples,
  };
}

const now = Date.now();
const iso = new Date(now).toISOString();
const offerWire = {
  type: "offer",
  offerId: "8f14e45f-ceea-4e7a-9b2c-1f0a6d3c2b11",
  missionId: "c9f0f895-fb98-4b91-9f3e-8d2a1c7b6e55",
  waveNumber: 2,
  issuedAt: iso,
  expiresAt: new Date(now + 15_000).toISOString(),
  urgency: "CAT_1_IMMEDIATE",
  requiredVehicleType: "TYPE_D_ALS",
  jurisdiction: "DL",
  pickup: { latitude: 28.5672, longitude: 77.21, address: "synthetic address", landmark: "synthetic landmark" },
  distanceKm: 4.4,
  estimatedFareInr: 500,
  patientSummary: { primaryComplaint: "chest_pain", derivedFlags: ["chest_pain", "cardiac_arrest"] },
};
const lifecycleWire = {
  v: 1,
  type: "lifecycle",
  event: "DRIVER_ACCEPTED",
  eventId: "45c48cce-2e2d-4fbd-a1b2-0c9d8e7f6a5b",
  seq: 2,
  missionId: offerWire.missionId,
  driverId: "d3d94468-02a4-4b4f-8a6e-2b1c0d9e8f7a",
  state: "en_route",
  timestamp: iso,
  data: { driver: { displayName: "synthetic", vehicleRegistration: "SYNTH0000", ais125Type: "TYPE_D_ALS" }, etaMinutes: 7 },
};
const a = { latitude: 28.5672, longitude: 77.21 };
const b = { latitude: 28.6139, longitude: 77.209 };

const results = [
  bench("computeTriageUrgency (severe_trauma, START red)", () =>
    computeTriageUrgency({
      primaryComplaint: "severe_trauma",
      traumaAssessment: { respiration: "abnormal", severeBleeding: true, responsiveness: "alert" },
    })
  ),
  bench("computeItemizedStatutoryFare (TYPE_D_ALS, 12.7 km)", () =>
    computeItemizedStatutoryFare({ vehicleType: "TYPE_D_ALS", jurisdiction: "DL", distanceKm: 12.7 })
  ),
  bench("haversineKm", () => haversineKm(a, b)),
  bench("parseDispatchOffer (full offer)", () => parseDispatchOffer(offerWire)),
  bench("parseLifecycleMessage (v1 envelope)", () => parseLifecycleMessage(lifecycleWire)),
  bench("decideSeq", () => decideSeq(5, 6)),
  bench("boardBand", () => boardBand(5.2, 61, false)),
  bench("reduceRealtime + realtimeHealth", () =>
    realtimeHealth(reduceRealtime(initialRealtime(), { type: "connecting" }, now), now + 12_000)
  ),
  bench(
    "patient lifecycle: 6 transitions (idle -> receiptConfirmed)",
    () => {
      const actor = createActor(patientLifecycleMachine).start();
      const triage = computeTriageUrgency({ primaryComplaint: "chest_pain" });
      actor.send({ type: "SUBMIT_TRIAGE", payload: { missionDraftId: "d", symptoms: triage.symptomFlags, answeredAt: iso, locale: "en", result: triage } });
      actor.send({
        type: "REQUEST",
        payload: { patientId: "p", pickup: a, careLevel: "ALS", vehicleType: "TYPE_D_ALS", jurisdiction: "DL", requestedAt: iso, idempotencyKey: "k" },
      });
      actor.send({ type: "SERVER_MISSION_ASSIGNED", payload: { missionId: "m" } });
      actor.send({ type: "SERVER_TRANSPORT_STARTED", payload: { missionId: "m" } });
      actor.send({ type: "SERVER_MISSION_COMPLETED", payload: { missionId: "m" } });
      actor.send({ type: "CONFIRM_RECEIPT", payload: { missionId: "m", receiptId: "r", confirmedAt: iso, disputeFlag: false } });
      const v = actor.getSnapshot().value;
      actor.stop();
      return v;
    },
    { batch: 50, samples: 100, warmup: 10 }
  ),
];

// Scaling of the Booking board pipeline (sort oldest-first + paginate) with list size n: expected O(n log n).
const scaling = [10, 100, 1_000, 10_000, 100_000].map((n) => {
  const items = Array.from({ length: n }, (_, i) => ({
    missionId: `m-${(i * 7919) % n}`,
    createdAt: new Date(now - ((i * 104729) % 600_000)).toISOString(),
  }));
  const r = bench(`board sort+paginate n=${n}`, () => paginate(sortOldestFirst(items), 0), {
    batch: Math.max(1, Math.floor(20_000 / n)),
    samples: n >= 100_000 ? 15 : 60,
    warmup: 3,
  });
  return {
    n,
    medianUs: +(r.medianNs / 1000).toFixed(2),
    p95Us: +(r.p95Ns / 1000).toFixed(2),
    nsPerNLogN: +(r.medianNs / (n * Math.log2(Math.max(2, n)))).toFixed(2),
  };
});

const mem = process.memoryUsage();
console.log(
  JSON.stringify(
    {
      experiment: "E1 domain microbenchmarks",
      runAt: new Date().toISOString(),
      env: { node: process.version, cpu: os.cpus()[0]?.model, cores: os.cpus().length, platform: `${os.platform()} ${os.release()}` },
      results,
      scaling,
      memory: { rssMiB: +(mem.rss / 2 ** 20).toFixed(1), heapUsedMiB: +(mem.heapUsed / 2 ** 20).toFixed(1) },
    },
    null,
    2
  )
);
