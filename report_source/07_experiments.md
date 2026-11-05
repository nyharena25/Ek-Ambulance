# 7. Experimental Evaluation, Discussion and Conclusion

## 7.1 Research Questions

| RQ | Question | Experiment | Kind |
|---|---|---|---|
| RQ1 | Do the implemented rules, authorisation checks and contracts behave as specified? | E0 | Measured (regression gate) plus project records |
| RQ2 | What does the shared domain logic cost on the client, and how does it scale? | E1 | Measured |
| RQ3 | What latency does the realtime plane add per message, and how does it depend on payload size and fan-out? | E2, E3 | Measured |
| RQ4 | What is the throughput ceiling of one realtime node, and at what CPU and memory cost? | E4 | Measured |
| RQ5 | Does the gateway enforce its abuse limits exactly? | E5 | Measured |
| RQ6 | How expensive is the dispatch candidate query at fleet scale? | E6 | Project record (not re-measured) |
| RQ7 | How does the escalation design affect time-to-assignment? | E7 | Simulation with synthetic inputs |

## 7.2 Testbed

**Table 7.1. Hardware and software under test**

| Item | Value |
|---|---|
| Host | Intel Core i7-13620H (10 cores / 16 threads), 14.8 GiB RAM, Linux 7.0.0 |
| Runtime | Node.js 24.22.1 (benchmarks, gateway client, test runner) |
| Realtime | `centrifugo/centrifugo:v5`, Redis 7 (alpine) engine, Docker on the same host |
| Gateway | `kong:3.9.3` DB-less; token service on `node:22-alpine`, `AUTH_MODE=dev` |
| Client libraries | `centrifuge` 5.7.4 (the apps' own SDK) over Node's built-in WebSocket; `xstate` 5.33.2 |
| Domain package | `@sahayak/domain` at the evaluated revision (working tree on 28 Oct 2026) |
| Database (E6 record) | Local PostgreSQL 17 Supabase image with PostGIS; 5,000 online + 1,000 offline drivers, 300 open requests |

All measured experiments ran on 28 October 2026 on a single machine, with no other intentional load. Raw outputs are in
`report_source/bench/results/*.json`.

## 7.3 Methodology

**Microbenchmarks (E1).** Each function runs in batches (1,000 calls per batch, or 50 for the full lifecycle) after
20 warm-up batches. We report the median, 95th- and 99th-percentile *per-call* time across 200 batches, following
standard practice for noisy JIT-compiled runtimes [@jain1991]. Results below about 10 ns are at the resolution floor of
the loop and timer overhead and should be read as "negligible", not compared with each other. Inputs are constants, so
the JIT may specialise aggressively; the figures are therefore lower bounds on in-app cost.

**Realtime latency (E2–E4).** Publisher and subscribers live in one Node process and share one monotonic clock
(`performance.now()`), so no clock synchronisation error enters the measurement. Each publication carries its send
time. End-to-end latency is the receive time minus the send time, measured through the HTTP publish API, Centrifugo, the
Redis engine and a WebSocket subscriber. This is the server-side path that `publish_realtime()` uses after pg_net. The
first 50 publications of each series are discarded as warm-up. Container CPU and memory are sampled asynchronously with
`docker stats` so that sampling does not stall the event loop. A first run that sampled synchronously produced a
2-second artefact and was discarded.

**Gateway (E5).** 140 sequential token requests start 250 ms after a calendar-minute boundary, because Kong's local
rate-limiting counter is a fixed minute window.

**Simulation (E7).** Monte Carlo [@metropolis1949] with a seeded mulberry32 generator, Knuth's Poisson sampler
[@knuth1997], and 20,000 trials per configuration. Assumptions are stated in §7.10.

## 7.4 E0: Functional, Contract and Security Verification (RQ1)

**Table 7.2. Regression gate `pnpm preflight` (run on 28 Oct 2026)**

| Stage | Scope | Result |
|---|---|---|
| `turbo run typecheck test --force` | 6 workspaces (admin, config, domain, driver, patient, ui), 10 tasks | 10/10 successful, 5.3 s |
| Node test files | 49 `*.test.ts` / `*.test.mjs` files: lifecycle statecharts, data-sync contract, realtime health, routing, offer core, KYC, background location, mission sync, cross-client golden path, gateway | all passed |
| `test:schema` | Static checks over the migration SQL: RLS on every table, `(select auth.uid())` pattern, grants, tariff, `dispatch_config()` and transition-table drift | passed |
| `test:gateway` | Token service, publish proxy, Kong route parity, production override, secure Centrifugo config | passed |
| `test:integrity` | Ban on fabricated runtime data: 28 rules over 195 files | passed |
| `test:security` | No committed secrets, no secrets in `EXPO_PUBLIC_`/`VITE_`, `SECURITY DEFINER` pins `search_path`, Leaflet SRI: 333 files | passed |
| Total | | exit 0, 7.1 s wall clock |
| Re-run after the fixes (§4.3.1, §6.6) | Same gate, with the new parse-count, text-contrast and control-border tests | exit 0, 10/10 tasks; the security scan now covers 353 files because `report_source/` is scanned too |

**Table 7.3. SQL behaviour suites (project records, not re-run in this study)**

The behaviour suites need a migrated local Supabase database, which was not running during this study. The counts below
are those recorded by the project in its earlier evaluation.

| Suite | Scope | Recorded result |
|---|---|---|
| `mission_api.behaviour.sql` | Missions, dispatch, lifecycle, telemetry, fares | 176 / 176 |
| `driver_board.behaviour.sql` | Board bands, claim, profile lock, search window, busy-driver invariant | 116 / 116 |
| `kyc_admin.behaviour.sql` | Staff KYC review, document access | 63 / 63 |
| `gps_fare.behaviour.sql` | Location writes, dispatch location, telemetry trust, fare source | 54 / 54 |
| `dispatch_hardening`, `security_hardening`, `hospital_handoff`, `driver_activity`, `kyc_draft_upload` | Later migrations | Present in the repository; no counts recorded in this report |

**Concurrency evidence for Theorem 6.1.** The project reproduced the busy-driver defect with two concurrent database
sessions in which one driver accepted two offers. Before the fix, both acceptances committed. After it, the second
session waited on the first session's driver-row lock and was refused with `already_on_mission`, leaving the second
mission unchanged. A regression test failed before the change and passed after it.

**Negative security tests (recorded).** The server refused all of the following: unauthenticated calls to mission,
offer, presence and telemetry procedures; a patient's token request for another patient's mission or for a driver
channel; a driver's request for another driver's offers channel (HTTP 403); acceptance outside the wave, after expiry,
after another driver took the offer, or after cancellation; position writes by patients or unverified drivers; invalid
coordinates; any direct client write to `drivers` or `missions`; and non-staff access to KYC data.

**Answer to RQ1.** The specified behaviour holds in every automated check run here, and the database-level behaviour
held in the project's recorded suites. The evidence covers controlled scenarios and does not cover hosted load or
physical devices.

## 7.5 E1: Cost of the Shared Domain Logic (RQ2)

**Table 7.4. Per-call cost of pure domain functions (Node 24, median of 200 batches)**

| Function | Median | p95 | p99 | Throughput (calls/s) |
|---|---|---|---|---|
| `computeTriageUrgency` (severe trauma, START red) | 130.8 ns | 193.8 ns | 256.1 ns | 7.6 M |
| `computeItemizedStatutoryFare` (Type D, 12.7 km) | 529.8 ns | 590.6 ns | 722.4 ns | 1.9 M |
| `parseDispatchOffer` (complete offer) | 213.4 ns | 271.7 ns | 331.0 ns | 4.7 M |
| `parseLifecycleMessage` (v1 envelope) | 16.7 ns | 58.6 ns | 91.8 ns | 59.7 M |
| `reduceRealtime` + `realtimeHealth` | 18.8 ns | 68.4 ns | 93.5 ns | 53.3 M |
| `haversineKm`, `decideSeq`, `boardBand` | 3.0–3.5 ns | ≤ 21.5 ns | ≤ 63.9 ns | at timer floor |
| Patient statechart, 6 transitions (`idle → receiptConfirmed`) | 25.4 µs | 49.9 µs | 98.4 µs | 39 k lifecycles/s |

The fare function is the most expensive scalar function because it builds an itemised object with two ISO timestamps
and bilingual strings. A complete patient lifecycle through XState, including actor creation and teardown, costs about
25 µs. That is roughly 4 µs per transition, five orders of magnitude below the 16.7 ms frame budget of a 60 Hz display.
Resident memory of the benchmark process was 215 MiB, of which the JavaScript heap was 38.7 MiB.

**Table 7.5. Scaling of the Booking-board pipeline (`sortOldestFirst` + `paginate`)**

| *n* | Median | p95 | ns per (*n* log₂ *n*) |
|---|---|---|---|
| 10 | 6.2 µs | 6.4 µs | 188 |
| 100 | 183 µs | 186 µs | 276 |
| 1,000 | 2.97 ms | 3.04 ms | 298 |
| 10,000 | 40.9 ms | 41.2 ms | 308 |
| 100,000 | 531 ms | 546 ms | 319 |

The normalised cost per *n* log₂ *n* is nearly constant (188–319 ns), which confirms the O(*n* log *n*) analysis of
§6.6. The constant was large for a sort because each comparison parsed two ISO-8601 strings. Real boards are small (open
requests within 10 km, five per page), so the defect was latent rather than user-visible, but a 10,000-item list blocked
the JavaScript thread for about 41 ms, more than two frames. Table 7.5 was measured before the fix.

**Table 7.5b. Board sort before and after the parse-once fix (paired, same process, alternating)**

The original E1 run and the post-fix run were made in different power states: E1 on mains power, the post-fix runs on
battery after a reboot. A naive comparison of the two would therefore be confounded. `board_sort.bench.ts` reproduces
the legacy comparator inline and times it alternately with the current function in one process (31 samples, or 9 at
*n* = 100,000, after 3 warm-up rounds). It also checks that both return the same order.

| *n* | Legacy median | Fixed median | Speed-up | Same order |
|---|---|---|---|---|
| 10 | 11.0 µs | 3.9 µs | 2.8× | yes |
| 100 | 315 µs | 39.0 µs | 8.1× | yes |
| 1,000 | 5.12 ms | 0.45 ms | 11.4× | yes |
| 10,000 | 70.4 ms | 5.11 ms | 13.8× | yes |
| 100,000 | 922 ms | 63.7 ms | 14.5× | yes |

The speed-up grows with *n*, as expected when *n* log *n* parses become *n*, and it levels off at about 14× once the
numeric sort itself dominates. A 10,000-item board now sorts in about 5 ms on battery, well inside one 16.7 ms frame.

**Answer to RQ2.** Client-side domain logic is negligible relative to network and rendering costs. The only
super-linear path had a constant-factor defect, which was fixed and is now guarded by a regression test.

## 7.6 E2: Realtime Latency by Payload Size (RQ3)

**Table 7.6. End-to-end delivery latency, publish API → WebSocket subscriber (1,000 messages per row, sequential)**

| Payload | Size | Delivered | p50 | p95 | p99 | max | Publish API RTT p50 / p95 |
|---|---|---|---|---|---|---|---|
| GPS ping | 142 B | 1000/1000 | 1.20 ms | 3.28 ms | 4.33 ms | 8.21 ms | 0.91 / 2.29 ms |
| Lifecycle event (v1 envelope) | 578 B | 1000/1000 | 1.17 ms | 1.87 ms | 2.04 ms | 5.80 ms | 0.84 / 1.27 ms |
| Synthetic 4 KiB | 4,112 B | 1000/1000 | 1.36 ms | 2.61 ms | 3.37 ms | 6.76 ms | 0.99 / 1.92 ms |
| Synthetic 16 KiB | 16,400 B | 1000/1000 | 1.92 ms | 4.23 ms | 4.95 ms | 10.72 ms | 1.41 / 3.03 ms |

No message was lost or reordered. Latency is dominated by fixed per-message overheads: the HTTP request, Redis
publish and WebSocket frame. Size has only a weak effect. A 115-fold increase from 142 B to 16 KiB raises the median by
0.7 ms. About 70–75 % of the end-to-end median is the publish API round trip itself. The realistic lifecycle and GPS
payloads are both delivered in about 1.2 ms at the median.

## 7.7 E3: Fan-out (RQ3)

**Table 7.7. One publication delivered to *K* subscribers of the same `mission:{id}` channel (200 publications, 5 ms apart)**

| *K* | Deliveries (expected) | Per-delivery p50 / p95 / p99 | Last subscriber p50 / p95 / p99 |
|---|---|---|---|
| 1 | 200 (200) | 1.79 / 2.51 / 3.33 ms | 1.79 / 2.51 / 3.33 ms |
| 10 | 2,000 (2,000) | 1.72 / 2.62 / 4.69 ms | 1.85 / 2.79 / 5.08 ms |
| 50 | 10,000 (10,000) | 2.12 / 3.38 / 4.10 ms | 2.66 / 3.96 / 4.88 ms |
| 100 | 20,000 (20,000) | 3.04 / 5.27 / 8.02 ms | 4.15 / 6.68 / 9.32 ms |

Delivery was complete at every *K*. The time until the *last* of 100 subscribers receives a message grows by about
2.4 ms at the median relative to a single subscriber, roughly 24 µs per additional subscriber. In production a mission
channel has two subscribers (patient and driver) and an offers channel has one. Fan-out is therefore not a factor for
the application's own channels. The experiment bounds the cost if a future operations dashboard subscribes to many
channels.

**Answer to RQ3.** The realtime hop adds about 1–2 ms at the median and under 10 ms at p99 even with 100 subscribers.
This is negligible next to mobile-network round trips (tens to hundreds of milliseconds) and the 1 s resolution of every
countdown in the UI.

## 7.8 E4: Throughput and Resource Use (RQ4)

**Table 7.8. Throughput with *c* concurrent publishers (20,000 GPS-ping publications per row, one subscriber)**

| *c* | Delivered | Publish rate | Delivery rate | Latency p50 / p95 / p99 / max |
|---|---|---|---|---|
| 1 | 20,000 | 1,606 /s | 1,603 /s | 0.78 / 1.62 / 2.08 / 14.99 ms |
| 8 | 20,000 | 11,670 /s | 11,670 /s | 0.52 / 0.84 / 2.06 / 6.91 ms |
| 32 | 20,000 | 12,558 /s | 12,558 /s | 1.90 / 2.85 / 7.79 / 13.87 ms |
| 64 | 20,000 | 12,412 /s | 12,412 /s | 3.83 / 8.42 / 11.50 / 33.03 ms |

**Table 7.9. Container resource use (`docker stats`)**

| Container | Idle CPU | Idle memory | CPU at *c* = 32 | CPU at *c* = 64 | Memory under load |
|---|---|---|---|---|---|
| Centrifugo | 0.37 % | 82.3 MiB | 52.5 % | 105.3 % | 84.6–87.8 MiB |
| Redis | 1.22 % | 7.9 MiB | 21.3 % | 41.8 % | 10.1–10.9 MiB |
| Kong | 2.83 % | 1.03 GiB | 1.9 % | 1.5 % | 1.03 GiB |
| Token service | 2.41 % | 18.2 MiB | 0.0 % | 0.0 % | 16.9 MiB |

Throughput saturates at about 12,500 publications per second, reached at *c* = 8 and flat beyond. Beyond saturation,
extra concurrency only adds queueing delay: p50 rises from 0.52 ms to 3.83 ms between *c* = 8 and *c* = 64, as
Little's law predicts for a saturated server [@jain1991]. At *c* = 64 Centrifugo uses just over one core and Redis
0.42 cores. Memory stays flat (≈ 88 MiB), because history is bounded per channel. Kong is not on the publish path, and
its 1 GiB footprint is its fixed baseline.

**Capacity interpretation (back-of-envelope, single node).** The driver application sends a GPS fix about every 3 s
during a mission. On the measured server-API path, one node could therefore carry the location stream of the order of
12,500 × 3 ≈ 37,000 concurrently active missions before saturating. Two caveats make this an upper bound rather than a
capacity claim. First, in strict mode GPS is published by clients through Centrifugo's publish proxy, which makes an
HTTP call to the token service and a REST query to Supabase per publication. That path was not measured here and will
saturate much earlier. Second, the experiment used loopback networking without TLS.

## 7.9 E5–E6: Gateway Protection and Database Query Cost (RQ5, RQ6)

### 7.9.1 E5: Rate-limit enforcement

**Table 7.10. 140 sequential `POST /realtime/token` requests through Kong in one minute window (limit 120/min/IP)**

| Outcome | Count | Latency p50 / p95 / p99 / max |
|---|---|---|
| HTTP 200 (token minted) | 120 | 1.13 / 1.92 / 2.73 / 4.29 ms |
| HTTP 429 (rate limited) | 20 (first at request 121) | 0.30 / 0.77 / 0.77 / 0.77 ms |

The limit is enforced exactly. Rejected requests cost about a quarter of an accepted one because Kong answers them
without contacting the upstream. A second run started inside an already exhausted window was refused at its first
request, which confirmed that the counter persists across clients from the same IP for the whole window. The
experiment ran in development mode. In strict mode each successful mint also verifies the JWT with GoTrue and, for
mission scopes, performs an RLS-checked read, so the accepted-request latency will be higher.

### 7.9.2 E6: Dispatch candidate query (project record)

The performance migration (`20261005000000_performance.sql`) records a measurement taken by the project on a local
database with 5,000 online and 1,000 offline drivers and 300 open requests. Before the change, the candidate query
filtered drivers only through `_driver_dispatchable(d)`. That function has its own `SET search_path` clause, so
PostgreSQL cannot inline it, and the planner never saw the `is_online` predicate. As a result it could not use the
partial GiST index `idx_drivers_online_location`, which had zero recorded scans across every suite. The query scanned
every driver row per wave. Stating `is_online AND is_verified` in the query itself, conditions the function already
required, restored the index plan without changing the candidate set or its order.

**Table 7.11. 3 km wave candidate query, 6,000 drivers (project record, not re-measured)**

| Plan | Execution time | Shared buffers touched |
|---|---|---|
| Before: sequential scan via non-inlinable predicate | 69.5 ms | 7,832 |
| After: partial GiST index scan | 1.0 ms | 190 |
| Improvement | 69.5× | 41× |

The general lesson is that `SECURITY DEFINER` functions must pin `search_path`, which is a security requirement
(§5.9.1), and that this makes helper functions opaque to the planner. Index-relevant predicates must therefore be
repeated at the call site.

**Earlier end-to-end timings (project record).** The project's previous evaluation, made under the legacy one-minute
scheduler, recorded the following. Wave-1 offers reached drivers 12–39 ms after mission creation. Lifecycle RPCs
completed in 3–12 ms. `DRIVER_ACCEPTED` reached the patient 9–10 ms after acceptance in some runs and about 860–990 ms
in others. E2 shows that the Centrifugo hop itself takes about 1 ms. The bimodal 0.9 s component must therefore
originate upstream, most plausibly in pg_net's batched background worker, which processes its request queue on a
polling interval. This hypothesis has not been tested in isolation and is the most significant open latency question
(§7.11).

## 7.10 E7: Simulation of Escalation Timeliness (RQ7)

**Model.** This experiment is a *model*, not a measurement. Eligible drivers of the required type form a homogeneous
Poisson point process of density ρ per km² around the pickup [@baddeley2015]. Each offered driver independently accepts
with probability *p*, declines with probability (1 − *p*)/2, or ignores the offer. Each answer arrives uniformly in
[1, 15) s. The first acceptance wins, and realtime delay is taken as zero (E2: about 1 ms). The model uses the real
`DISPATCH_CONFIG` (radii 3/6/10 km, offer TTL 15 s, wave window 45 s) and compares two schedulers that both existed in
the repository.

- **Legacy:** an offer dies at 15 s, but the wave stays open until 45 s, and only the next one-minute tick escalates.
  Declines are not recorded.
- **Hardened:** the wave expires with its offers at 15 s, a tick runs every 5 s, and the last decline opens the next
  wave immediately (§6.4).

The model ignores busy, reserved and lock-skipped drivers. It also excludes the Booking board, which only adds
assignments after the waves, so the figures below are for the push phase alone. The ETA term uses the repository's own
offline route model (straight line × 1.3 at 30 km/h) and is illustrative only.

**Validation.** For a Poisson process, the probability that the wave-1 disc of radius *r* = 3 km contains at least one
driver is 1 − e^(−ρπr²). The simulated frequencies match this closed form to within 0.56 percentage points in every
configuration.

**Table 7.12. Validation of the spatial model (wave-1 disc non-empty, %)**

| ρ (km⁻²) | Analytic | Simulated (legacy run / hardened run) |
|---|---|---|
| 0.01 | 24.63 | 24.75 / 24.46 |
| 0.03 | 57.18 | 57.43 / 57.26 |
| 0.1 | 94.08 | 94.08 / 94.04 |
| 0.3 | 99.98 | 99.97 / 99.97 |

**Table 7.13. Time from booking to assignment (20,000 trials per cell, seed 20261028)**

| ρ (km⁻²) | E[drivers ≤ 10 km] | *p* | Assigned during waves (%) legacy / hardened | Legacy p50 / p90 / p99 (s) | Hardened p50 / p90 / p99 (s) | Δ p90 | Mean drivers contacted |
|---|---|---|---|---|---|---|---|
| 0.01 | 3.1 | 0.2 | 46.48 / 46.15 | 12.3 / 105.3 / 181.8 | 11.4 / 28.0 / 42.8 | −73.4 % | 2.69 |
| 0.01 | 3.1 | 0.5 | 78.96 / 79.13 | 9.4 / 91.2 / 158.0 | 9.0 / 23.0 / 36.1 | −74.8 % | 2.17 |
| 0.01 | 3.1 | 0.8 | 91.69 / 91.94 | 7.2 / 14.9 / 106.6 | 7.1 / 14.4 / 28.6 | −3.4 % | 1.78 |
| 0.03 | 9.4 | 0.2 | 84.55 / 84.80 | 65.5 / 154.1 / 197.9 | 16.8 / 35.2 / 46.8 | −77.2 % | 6.06 |
| 0.03 | 9.4 | 0.5 | 99.09 / 98.99 | 9.9 / 98.3 / 172.9 | 9.3 / 24.1 / 38.4 | −75.5 % | 3.59 |
| 0.03 | 9.4 | 0.8 | 99.93 / 99.94 | 6.6 / 52.1 / 106.7 | 6.6 / 14.4 / 27.4 | −72.4 % | 2.56 |
| 0.1 | 31.4 | 0.2 | 99.84 / 99.81 | 52.8 / 110.7 / 187.1 | 14.2 / 30.7 / 43.0 | −72.3 % | 9.71 |
| 0.1 | 31.4 | 0.5 | 100 / 100 | 6.9 / 76.2 / 106.9 | 6.9 / 19.3 / 27.6 | −74.7 % | 4.94 |
| 0.1 | 31.4 | 0.8 | 100 / 100 | 4.7 / 12.3 / 94.8 | 4.7 / 11.8 / 20.8 | −4.1 % | 3.71 |
| 0.3 | 94.2 | 0.2 | 100 / 100 | 6.8 / 76.2 / 105.9 | 6.8 / 20.3 / 26.7 | −73.4 % | 13.16 |
| 0.3 | 94.2 | 0.5 | 100 / 100 | 3.3 / 8.6 / 66.8 | 3.3 / 8.6 / 18.2 | 0.0 % | 8.86 |
| 0.3 | 94.2 | 0.8 | 100 / 100 | 2.4 / 5.7 / 10.5 | 2.4 / 5.7 / 10.5 | 0.0 % | 8.49 |

**Findings.**

1. **The scheduler redesign changes the tail, not the median.** Whenever the first wave settles the request, both
   designs behave identically, because the first acceptance arrives within 15 s either way. When a second wave is
   needed, the legacy design waits 45 s plus up to 60 s, while the hardened design waits at most 20 s. In 8 of the 12
   configurations the 90th percentile falls by 72–77 %, and the 99th percentile falls from 106–198 s to 27–47 s.
2. **Coverage is set by density and acceptance, not by the scheduler.** The share of requests assigned during the
   waves is the same under both designs (differences ≤ 0.35 points, within Monte Carlo error). Faster escalation does
   not reach more drivers; it reaches the same drivers sooner.
3. **Sparse fleets need the board and the 108 fallback.** At ρ = 0.01 km⁻² (about three eligible ambulances within
   10 km) and *p* = 0.2, fewer than half of the requests are assigned during the push phase. This is the regime where
   the Booking board's extended search window and the patient app's permanent "Call 108" action matter most.
4. **Dispatch delay is small next to travel time.** Under the illustrative route model, median modelled arrival is
   334–1,053 s across the cells, dominated by driving. Assignment delay is a minor share once a driver accepts. Fleet
   density, through distance, matters far more than scheduling.

## 7.11 Discussion and Limitations

**Synthesis.** The measurements support the architecture's central bet. Placing decisions in the database costs
milliseconds (E6: 1 ms for a candidate search at 6,000 drivers; recorded RPCs 3–12 ms). The realtime plane adds about
1 ms per hop (E2–E3) and has ample headroom (E4). The client logic is negligible (E1). End-to-end latency is therefore
determined by components *outside* the tested path: mobile networks, the pg_net worker, and human response time. E7
shows that protocol design dominates the tail of time-to-assignment by tens of seconds, three to four orders of
magnitude more than any computational cost measured here. Engineering effort on dispatch timeliness should therefore go
into protocol and scheduling rather than micro-optimisation.

**Limitations of the system** (carried into future work, §7.13):

- **Physical devices.** Foreground and background GPS, permission flows and battery behaviour have not been verified
  on representative Android and iOS hardware.
- **Push notifications.** Offers are delivered only over an open WebSocket. A backgrounded app with a closed socket can
  miss an offer. `list_open_offers` recovers it on resume, but only if the offer is still open.
- **pg_net latency.** The recorded 0.9 s delivery mode for lifecycle events is unexplained (§7.9.2).
- **Rate limiting per IP.** Under carrier-grade NAT many users share one address. Per-account limits exist only for
  booking.
- **Triage on the client.** The server validates the triage payload's shape and bounds but does not recompute the
  tier.
- **Two defects found and fixed by this study.** The board comparator parsed dates on every comparison (§6.6, §7.5),
  and the documented contrast ratios did not match the colours (§4.3.1). Both are fixed and guarded by tests, as are 14 control
  boundaries that failed WCAG 1.4.11 (§4.3.1).
- **No formal DPDP assessment** and no production observability stack.

## 7.12 Threats to Validity

- **Internal validity.** All measured experiments ran on one machine over loopback, so network latency and TLS are
  absent and container scheduling noise is present. Percentiles from 1,000 samples are stable at p95 but noisier at p99
  and max. E1 inputs are constants that a JIT can specialise.
- **Construct validity.** E2–E4 measure the server-API publish path, not the strict-mode client publish path through
  the proxy. E5 measures development-mode minting. Time-to-assignment in E7 is a model output, not an observed
  quantity.
- **External validity.** No measurement used real users, real driver distributions, mobile networks or the hosted
  database under load. The E7 parameters (ρ, *p*, uniform response times, homogeneous density) are assumptions chosen to
  span plausible regimes, not estimates from data. Real urban driver density is clustered, not Poisson.
- **Conclusion validity.** E6 and Table 7.3 report the project's own earlier records, which were not re-run in this
  study. They are cited as such and are not used in any comparison that requires a common testbed.

## 7.13 Conclusion and Future Work

This report presented Ek-Ambulance, an emergency ambulance dispatch platform for Delhi and Uttar Pradesh whose every
safety-relevant decision is taken inside PostgreSQL and propagated to clients as ordered, stored events. The design
removes an entire class of trust problems: no client can assign itself, alter a fare or rewrite history. The wave
protocol provably never gives one driver two active missions, and the evaluation found that this invariant had been
violated before the fix and confirmed the repair under concurrency. On the running system, the realtime plane delivered
lifecycle events in about 1 ms and sustained about 12,500 publications per second on one node. The gateway enforced its
limits exactly, and the shared domain logic cost microseconds. A validated simulation showed that the redesigned
escalation scheduler cuts the 90th-percentile time-to-assignment by roughly three quarters whenever a second wave is
needed.

The platform is not yet production-ready, and the evidence does not establish that it shortens real response times.
The planned work, in priority order, is:

1. Physical-device validation of foreground and background GPS and permissions on low-end Android hardware.
2. Server-side push notification (FCM/APNS) for offers, and SMS fallback for areas with weak connectivity.
3. Load testing of the hosted database, the pg_net queue and the strict-mode publish proxy, and isolation of the 0.9 s
   delivery mode.
4. A full accessibility audit beyond contrast: the state indication of selectable chips and option cards (WCAG
   1.4.11 for states), and TalkBack and VoiceOver testing on physical devices.
5. Production observability: metrics, tracing and alerting on the dispatch log events.
6. Calibrating the E7 model with real acceptance rates and response times from a supervised pilot, and evaluating
   coverage-aware dispatch policies [@jagtenberg2017; @brotcorne2003].
7. A usability study (§4.9), a formal DPDP compliance assessment, and a field pilot with ethical approval and hospital
   partners, including integration with the 108 service.

## 7.14 Reproducibility

All scripts are in `report_source/bench/` and write the JSON in `report_source/bench/results/`.

```bash
pnpm preflight
```

```bash
node --experimental-strip-types report_source/bench/domain.bench.ts > report_source/bench/results/domain.json
```

```bash
pnpm services:up
```

```bash
node report_source/bench/realtime.bench.mjs > report_source/bench/results/realtime.json
```

```bash
node --experimental-strip-types report_source/bench/dispatch.sim.ts > report_source/bench/results/dispatch_sim.json
```

```bash
node --experimental-strip-types report_source/bench/board_sort.bench.ts > report_source/bench/results/board_sort.json
```

```bash
node report_source/bench/contrast.mjs
```

The realtime benchmark assumes the default development data plane (`AUTH_MODE=dev`, Centrifugo API key `dev-api-key`).
It mints tokens with an unsigned development bearer, which strict mode refuses by design. The simulation is
deterministic for a given seed and Node version.
