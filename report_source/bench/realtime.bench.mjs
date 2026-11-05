/**
 * Experiments E2-E5: the realtime plane of the local docker data plane (`pnpm services:up`, AUTH_MODE=dev).
 *   E2  end-to-end delivery latency: Centrifugo HTTP publish API -> Redis engine -> WebSocket subscriber, by payload size
 *   E3  fan-out: one publication delivered to K subscribers of the same mission:{id} channel
 *   E4  throughput: M publications with c concurrent publishers, one subscriber
 *   E5  gateway: POST /realtime/token through Kong (latency, and the 120/min per-IP rate limit)
 * Container CPU/memory is sampled with `docker stats` at idle and during E4.
 *
 * Publisher and subscribers share one process and one monotonic clock (performance.now()), so latencies need no
 * clock synchronisation. This is the server-side publish path that publish_realtime() uses through pg_net; the
 * PostgreSQL trigger and pg_net queue are NOT in this measurement (see E6 in 07_experiments.md).
 *
 * Run from the repo root (data plane up):
 *   node report_source/bench/realtime.bench.mjs > report_source/bench/results/realtime.json
 */
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import os from "node:os";

const require = createRequire(new URL("../../apps/patient/package.json", import.meta.url));
const { Centrifuge } = require("centrifuge");

const GATEWAY = process.env.BENCH_GATEWAY_URL ?? "http://localhost:8000";
const CENTRIFUGO_WS = process.env.BENCH_CENTRIFUGO_WS ?? "ws://localhost:8001/connection/websocket";
const CENTRIFUGO_API = process.env.BENCH_CENTRIFUGO_API ?? "http://localhost:8001/api";
// The committed dev default from docker/centrifugo.json; never a real key.
const API_KEY = process.env.CENTRIFUGO_API_KEY ?? "dev-api-key";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
/** AUTH_MODE=dev only reads `sub` from the bearer; this unsigned token would be refused in strict mode. */
const devBearer = (sub) => `${b64url({ alg: "none", typ: "JWT" })}.${b64url({ sub, role: "authenticated" })}.x`;

function stats(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length);
  const r = (x) => +x.toFixed(3);
  return { n: s.length, minMs: r(s[0]), p50Ms: r(q(0.5)), p95Ms: r(q(0.95)), p99Ms: r(q(0.99)), maxMs: r(s[s.length - 1]), meanMs: r(mean), sdMs: r(sd) };
}

async function mint(sub, scope) {
  const t0 = performance.now();
  const res = await fetch(`${GATEWAY}/realtime/token`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${devBearer(sub)}` },
    body: JSON.stringify({ scope }),
  });
  const ms = performance.now() - t0;
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ms, token: body.token };
}

async function publish(channel, data) {
  const res = await fetch(`${CENTRIFUGO_API}/publish`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-API-Key": API_KEY },
    body: JSON.stringify({ channel, data }),
  });
  if (!res.ok) throw new Error(`publish ${res.status}`);
  await res.arrayBuffer();
}

/** Async on purpose: a synchronous child process would block the event loop and stall the run being measured. */
async function dockerStats() {
  try {
    const { stdout: out } = await promisify(execFile)("docker", ["stats", "--no-stream", "--format", "{{json .}}"], { encoding: "utf8" });
    return out
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l))
      .filter((s) => s.Name.startsWith("sahayak-data-plane"))
      .map((s) => ({ name: s.Name.replace("sahayak-data-plane-", "").replace(/-1$/, ""), cpu: s.CPUPerc, mem: s.MemUsage }));
  } catch {
    return null;
  }
}

/** K connected subscribers on `channel`; `onPub(i, data)` per delivery. Tokens are reused across connections. */
async function subscribers(k, channel, connectToken, subToken, onPub) {
  const clients = [];
  for (let i = 0; i < k; i++) {
    const c = new Centrifuge(CENTRIFUGO_WS, { token: connectToken, websocket: WebSocket });
    const s = c.newSubscription(channel, { token: subToken });
    s.on("publication", (ctx) => onPub(i, ctx.data));
    s.subscribe();
    c.connect();
    clients.push({ c, s });
  }
  await Promise.all(clients.map(({ s }) => s.ready(10_000)));
  return () => clients.forEach(({ c }) => c.disconnect());
}

// Payloads shaped like the real wire messages (packages/domain mission-channel and dispatch modules).
const gpsPing = (t) => ({ type: "telemetry", latitude: 28.5672, longitude: 77.21, heading: 182, speed: 34.5, accuracy: 8, timestamp: new Date().toISOString(), t });
const lifecycle = (t, seq) => ({
  v: 1, type: "lifecycle", event: "DRIVER_ARRIVED", eventId: randomUUID(), seq, missionId: randomUUID(), driverId: randomUUID(),
  state: "on_scene", timestamp: new Date().toISOString(),
  data: { driver: { displayName: "synthetic", vehicleRegistration: "SYNTH0000", ais125Type: "TYPE_D_ALS", makeModel: "synthetic", color: "white", crewCount: 2 }, etaMinutes: 0, note: "x".repeat(120) },
  t,
});
const padded = (t, bytes) => ({ t, pad: "x".repeat(bytes) });

async function main() {
  const out = {
    experiment: "E2-E5 realtime plane (local docker, AUTH_MODE=dev)",
    runAt: new Date().toISOString(),
    env: { node: process.version, cpu: os.cpus()[0]?.model, cores: os.cpus().length, centrifugo: "centrifugo/centrifugo:v5 (redis engine)", kong: "kong:3.9.3 DB-less" },
  };
  out.idleStats = await dockerStats();

  const user = randomUUID();
  const missionId = randomUUID();
  const channel = `mission:${missionId}`;
  // A previous run may have used up this minute's rate-limit window; wait for the next one.
  let conn = await mint(user, "connect");
  if (conn.status === 429) {
    await sleep(60_000 - (Date.now() % 60_000) + 250);
    conn = await mint(user, "connect");
  }
  const subT = await mint(user, channel);
  if (conn.status !== 200 || subT.status !== 200) throw new Error(`token mint failed: ${conn.status}/${subT.status}`);

  // ---------------- E2: latency by payload size, 1 subscriber, sequential ----------------
  {
    const pending = new Map();
    const lat = [];
    const stop = await subscribers(1, channel, conn.token, subT.token, (_i, d) => {
      const t0 = pending.get(d.t);
      if (t0 !== undefined) { lat.push(performance.now() - t0); pending.delete(d.t); }
    });
    out.e2 = [];
    const kinds = [
      ["GPS ping", (t) => gpsPing(t)],
      ["lifecycle event", (t, i) => lifecycle(t, i + 2)],
      ["4 KiB payload", (t) => padded(t, 4096)],
      ["16 KiB payload", (t) => padded(t, 16384)],
    ];
    for (const [label, make] of kinds) {
      lat.length = 0;
      const pubRtt = [];
      const N = 1000;
      for (let i = 0; i < 50; i++) await publish(channel, make(-1 - i, i)); // warm-up (ignored: t < 0)
      await sleep(200);
      for (let i = 0; i < N; i++) {
        const t = performance.now();
        const msg = make(t, i);
        pending.set(t, t);
        await publish(channel, msg);
        pubRtt.push(performance.now() - t);
      }
      await sleep(500);
      out.e2.push({ payload: label, bytes: Buffer.byteLength(JSON.stringify(make(0, 0))), delivered: lat.length, sent: N, endToEnd: stats(lat), publishApiRtt: stats(pubRtt) });
      pending.clear();
    }
    stop();
  }

  // ---------------- E3: fan-out to K subscribers ----------------
  out.e3 = [];
  for (const k of [1, 10, 50, 100]) {
    const sent = new Map();
    const perDelivery = [];
    const allDelivered = [];
    const counts = new Map();
    const stop = await subscribers(k, channel, conn.token, subT.token, (_i, d) => {
      const t0 = sent.get(d.t);
      if (t0 === undefined) return;
      const now = performance.now();
      perDelivery.push(now - t0);
      const c = (counts.get(d.t) ?? 0) + 1;
      counts.set(d.t, c);
      if (c === k) allDelivered.push(now - t0);
    });
    await sleep(300);
    const N = 200;
    for (let i = 0; i < N; i++) {
      const t = performance.now();
      sent.set(t, t);
      await publish(channel, lifecycle(t, i + 2));
      await sleep(5);
    }
    await sleep(1000);
    out.e3.push({ subscribers: k, publications: N, deliveries: perDelivery.length, expected: N * k, perDelivery: stats(perDelivery), lastSubscriberReceived: stats(allDelivered) });
    stop();
    await sleep(300);
  }

  // ---------------- E4: throughput, c concurrent publishers ----------------
  out.e4 = [];
  for (const c of [1, 8, 32, 64]) {
    let received = 0;
    const lat = [];
    const stop = await subscribers(1, channel, conn.token, subT.token, (_i, d) => {
      if (typeof d.t === "number" && d.t >= 0) { received++; lat.push(performance.now() - d.t); }
    });
    await sleep(300);
    const M = 20000;
    let next = 0;
    let statsDuring = null;
    const t0 = performance.now();
    const worker = async () => {
      while (next < M) {
        next++;
        await publish(channel, gpsPing(performance.now()));
      }
    };
    const sampler = c >= 32 ? (async () => { await sleep(100); statsDuring = await dockerStats(); })() : Promise.resolve();
    await Promise.all(Array.from({ length: c }, worker));
    const pubDone = performance.now() - t0;
    const deadline = performance.now() + 5000;
    while (received < M && performance.now() < deadline) await sleep(20);
    const allDone = performance.now() - t0;
    await sampler;
    out.e4.push({
      concurrency: c, publications: M, delivered: received,
      publishRatePerSec: Math.round((M / pubDone) * 1000), deliveredRatePerSec: Math.round((received / allDone) * 1000),
      endToEnd: stats(lat), ...(statsDuring ? { containerStatsDuringRun: statsDuring } : {}),
    });
    stop();
    await sleep(300);
  }

  // ---------------- E5: gateway token mint through Kong ----------------
  // Kong's local rate-limiting counter is a fixed calendar minute; start the burst right after a minute boundary so
  // earlier mints do not count against it.
  const msToNextMinute = 60_000 - (Date.now() % 60_000) + 250;
  await sleep(msToNextMinute);
  const codes = [];
  const okLat = [];
  const limitedLat = [];
  for (let i = 0; i < 140; i++) {
    const r = await mint(user, "connect");
    codes.push(r.status);
    (r.status === 200 ? okLat : limitedLat).push(r.ms);
  }
  const firstLimited = codes.indexOf(429);
  out.e5 = {
    requests: codes.length,
    ok200: codes.filter((c) => c === 200).length,
    limited429: codes.filter((c) => c === 429).length,
    firstLimitedRequestIndex1Based: firstLimited < 0 ? null : firstLimited + 1,
    okLatency: stats(okLat),
    limitedLatency: limitedLat.length ? stats(limitedLat) : null,
  };

  out.finalStats = await dockerStats();
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
