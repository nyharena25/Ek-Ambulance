# 6. Algorithms and Core Logic

This section specifies the core algorithms in language-neutral pseudocode. Each listing is a faithful abstraction of a
named function in the code base (file or SQL function given in the caption). Validation of trivial inputs and logging
are elided. Complexity is stated with the symbols in §6.1, and Table 6.1 summarises the results.

## 6.1 Notation and Cost Model

| Symbol | Meaning |
|---|---|
| *N* | drivers in the `drivers` table; *N*ₒ ≤ *N* of them online |
| *k* | candidates returned by one radius query (drivers inside the wave disc) |
| *W* | number of wave radii (= 3: 3, 6, 10 km) |
| *E* | events of one mission; *T* telemetry fixes of one mission's transport leg |
| *R* | missions in `requesting` with an expired wave at one scheduler tick |
| *B* | pings in one telemetry batch (≤ 1000) |
| *n* | items on a driver's Booking board |
| *M* | missions of one patient in the last hour |

Index lookups in a B-tree cost O(log *N*). A GiST (R-tree-like) radius search costs O(log *N*ₒ + *k*) expected for
well-distributed points and O(*N*ₒ) in the worst case [@guttman1984; @hellerstein1995]. Row-lock acquisition is O(1)
excluding waiting time. Waiting is analysed separately as a concurrency property, not as computational cost.

## 6.2 Algorithm 1: Deterministic Triage (START/ESI-derived)

*Source: `packages/domain/src/triage/index.ts` (`computeTriageUrgency`).*

```text
function TRIAGE(complaint, trauma?):
    switch complaint:
        case CHEST_PAIN, BREATHING_DISTRESS, UNCONSCIOUS:
            return (tier = CAT_1_IMMEDIATE, care = ALS, goldenHour = true)
        case SEVERE_TRAUMA:
            a ← trauma ?? (respiration = normal, severeBleeding = false, responsiveness = alert)
            if a.respiration = abnormal or a.severeBleeding or a.responsiveness = unresponsive:
                return (CAT_1_IMMEDIATE, ALS, goldenHour = true, triggers = failed checkpoints)   ▷ START "red"
            return (CAT_2_URGENT, BLS, goldenHour = false)                                      ▷ START "yellow"
        default:                                                                                  ▷ minor injury
            return (CAT_3_DELAYED, PTA, goldenHour = false)

function ELIGIBLE(care, vehicleType):            ▷ apps/patient/src/lib/vehicleEligibility.core.ts
    ALS → {TYPE_D};  BLS → {TYPE_C, TYPE_D};  PTA → {TYPE_B, TYPE_C, TYPE_D}
```

**Complexity.** O(1) time and space. At most three checkpoint tests and a constant-size result.

**Properties.** (i) *Monotone safety*: any failed START checkpoint escalates to CAT-1. No combination of answers can
lower the tier below what any single failed checkpoint implies. (ii) *Determinism*: the optional LLM panel can
pre-fill `complaint` and `trauma` but never sets the tier, so the function's output is reproducible from the recorded
answers. (iii) *Vehicle constraint*: when `ELIGIBLE` returns a single type (ALS), the category screen is skipped.

## 6.3 Algorithm 2: Wave Dispatch (`dispatch_next_wave`)

*Source: SQL `public.dispatch_next_wave`, as redefined in `20261005000000_performance.sql`.*

```text
function DISPATCH_NEXT_WAVE(missionId):
    m ← SELECT mission WHERE id = missionId
    if m.status ≠ requesting or m.driver ≠ null: return −1
    UPDATE waves SET status = expired WHERE mission = m AND status = broadcasting
    loop:
        n ← 1 + max(wave_number of m in round m.round, default 0)
        if n > W:                                                   ▷ all radii tried this round
            mark wave n−1 exhausted
            if now < m.searchStart + SEARCH_TTL and (m.round > 1 or some wave this round had candidates):
                return −2                                           ▷ stays open on the Booking board
            CANCEL_UNANSWERED(m, reason = no_ambulance_available)   ▷ appends MISSION_CANCELLED
            return 0
        r ← RADII[n]                                                ▷ 3, 6, 10 km
        C ← SELECT d.id, ST_Distance(d.loc, m.pickup) AS dist
              FROM drivers d
             WHERE d.is_online AND d.is_verified                    ▷ stated so the partial GiST index applies
               AND DISPATCHABLE(d)                                  ▷ heartbeat < 30 s AND fix < 30 s old
               AND d.type = m.vehicleType
               AND (d.zone IS NULL OR d.zone = m.jurisdiction)
               AND ST_DWithin(d.loc, m.pickup, r)                   ▷ GiST radius search
               AND NOT ON_MISSION(d) AND NOT RESERVED(d, m)         ▷ busy / holds an open offer elsewhere
               AND d NOT IN (asked this round ∪ any driver who released m)
             ORDER BY dist, d.id
             FOR UPDATE OF d SKIP LOCKED                            ▷ concurrent waves take disjoint drivers
        w ← INSERT wave(m, round, n, r, eligible = C,
                        status = (C = ∅ ? expired : broadcasting),
                        expires = (C = ∅ ? now : now + OFFER_TTL))  ▷ OFFER_TTL = 15 s
        if C ≠ ∅:
            for each d in C: PUBLISH("driver:" + d + ":offers", OFFER(w, m, km(d)))
            return n
        ▷ empty wave: continue immediately with the next radius
```

**Complexity.** One iteration costs a GiST radius probe, O(log *N*ₒ + *k*), plus per-candidate predicate checks. Each
check is an index lookup, for O(*k* log *N*) in total. The sort costs O(*k* log *k*) and publication O(*k*). Empty waves
loop, so one call costs at most *W* iterations:
**O(*W* · (log *N*ₒ + *k* log *N*))**, which is O(log *N*ₒ + *k* log *N*) for constant *W* = 3. Without the index
predicates stated explicitly, the planner could not use the partial index, because `DISPATCHABLE` is not inlinable
(it has its own `search_path`), and the cost degraded to a sequential scan, Θ(*N*) per wave (§7.9.2). Space is O(*k*).

**Design notes.** (a) Closest-first ordering with a stable tiebreak (`id`) makes the offer set deterministic for equal
distances. (b) Excluding previously asked drivers means each wave reaches *new* drivers only. (c) `SKIP LOCKED`
trades a small unfairness for liveness. A driver whose row is momentarily locked by a heartbeat sits out one wave and
is reached by the next, larger one. (d) Offers are published from inside the transaction through pg_net, whose queue is
processed after commit, so a rolled-back wave publishes nothing.

## 6.4 Algorithm 3: Escalation Scheduler and Decline-Driven Escalation

*Source: SQL `public.dispatch_tick` (pg_cron, every 5 s) and `public.decline_offer`, `20261003000000_dispatch_hardening.sql`.*

```text
procedure DISPATCH_TICK():                          ▷ scheduled every 5 s
    for each m in (SELECT missions WHERE status = requesting
                     AND ∃ wave(m) broadcasting with expires ≤ now
                   FOR UPDATE SKIP LOCKED):         ▷ never blocks behind a user command
        REVOKE_OFFERS(m, reason = expired)          ▷ offer_revoked to each asked driver
        DISPATCH_NEXT_WAVE(m)
    for each m in (SELECT missions WHERE status = requesting AND driver IS NULL
                     AND searchStart + SEARCH_TTL ≤ now FOR UPDATE SKIP LOCKED):
        REVOKE_OFFERS(m, expired); expire open waves
        CANCEL_UNANSWERED(m)                        ▷ system cancel: no_ambulance_available

function DECLINE_OFFER(offerId, reason):
    w ← wave(offerId); require caller ∈ w.eligible
    LOCK mission(w.mission) FOR UPDATE              ▷ same order as ACCEPT: serialises with acceptances
    w.declined ← w.declined ∪ {caller}
    if w.status = broadcasting and mission.status = requesting and mission.driver = null
       and w.eligible ⊆ w.declined:                 ▷ everyone said no
        w.status ← expired
        DISPATCH_NEXT_WAVE(mission)                 ▷ escalate now, do not wait for TTL
```

**Complexity.** A tick costs O(*R* · (log *N*ₒ + *k* log *N*)). Finding *R* uses the partial index
`idx_dispatch_waves_open (expires_at) WHERE status = 'broadcasting'`, at O(log |open waves| + *R*). A decline costs
O(*k*) for the subset test on arrays of size *k*, plus at most one wave dispatch.

**Timeliness bound.** Let *t*₀ be the moment a wave opens and *τ* = 5 s the tick period. If nobody accepts, the next
wave opens no later than *t*₀ + OFFER_TTL + *τ* = *t*₀ + 20 s. If everyone declines earlier, it opens at the last
decline. The legacy design (offer TTL 15 s, wave window 45 s, 60 s tick, declines not stored) had a bound of
*t*₀ + 45 + 60 = *t*₀ + 105 s and a guaranteed dead interval of at least 30 s per wave, during which offers had already
expired but the wave stayed open. Section 7.10 quantifies the difference in distribution.

## 6.5 Algorithm 4: Exclusive Offer Acceptance (`accept_offer`)

*Source: SQL `public.accept_offer`, `20261003000000_dispatch_hardening.sql`.*

```text
function ACCEPT_OFFER(offerId, clientEventId?):
    u ← auth.uid(); require u ≠ null
    w ← wave(offerId)                                            ▷ unlocked read
    if clientEventId ≠ null and ∃ event e(mission = w.mission, clientEventId, by u):
        return REPLAY(e)                                         ▷ idempotent retry
    m ← LOCK mission(w.mission) FOR UPDATE                       ▷ lock 1
    w ← re-read wave(offerId)                                    ▷ fresh under the lock
    if m.driver = u and m.status = en_route and w.acceptedBy = u: return REPLAY
    d ← LOCK driver(u) FOR UPDATE                                ▷ lock 2 (fixed order)
    require d.isVerified                                         else not_verified
    require not ON_MISSION(u)                                    else already_on_mission
    require u ∈ w.eligible and d.type = m.vehicleType            else not_eligible
    require m.status ≠ cancelled                                 else mission_cancelled
    require m.status = requesting and m.driver = null
            and w.status ≠ accepted                              else offer_taken
    require u ∉ w.declined                                       else offer_declined
    require w.status = broadcasting and now < w.expires          else offer_expired
    w.status ← accepted; w.acceptedBy ← u
    m.driver ← u; m.acceptedAt ← now
    e ← RECORD_EVENT(m, to = en_route, DRIVER_ACCEPTED, actor = u, data = PUBLIC_INFO(u))
    REVOKE_OFFERS(m, reason = taken, except = u)
    return (ok, en_route, e.seq, e.id)

function RECORD_EVENT(m, to, type, actor, data, clientEventId?):    ▷ caller holds lock on m
    e ← INSERT mission_events(m, from = m.status, to, seq = m.stateVersion + 1, type, actor, data)
    m.status ← to; m.stateVersion ← e.seq
    return e                                                          ▷ AFTER INSERT trigger publishes e
```

**Complexity.** O(log *N*) for the indexed row reads, plus O(*k*) for the membership tests on `eligible` and
`declined` (arrays of at most *k* elements), plus O(*k*) for revocation. In total **O(log *N* + *k*)**.

**Theorem 6.1 (exclusive assignment).** Under READ COMMITTED isolation, (a) every mission is assigned to at most one
driver, and (b) no driver holds two missions whose status is active (`en_route`, `on_scene`, `transporting`,
`arrived_hospital`).

*Proof sketch.* (a) Every path that sets `missions.driver_id` (`ACCEPT_OFFER`, `claim_emergency`) holds the mission row
lock and checks `m.driver = null` after acquiring it. PostgreSQL row locks are exclusive, and a READ COMMITTED statement
that waited for a lock re-reads the latest committed row version [@postgresDocs]. So the second of two concurrent
acceptors observes the first one's committed `driver_id` and fails with `offer_taken`. (b) Both assignment paths acquire
the *driver* row lock after the mission lock and then test `ON_MISSION(u)`. Two concurrent acceptances by the same
driver for different missions hold different mission locks but contend for the same driver lock. The second proceeds
only after the first commits and then observes the first assignment, failing with `already_on_mission`. Because every
path acquires locks in the same global order (mission, then driver), no cycle in the wait-for graph can form, and the
protocol is deadlock-free [@grayReuter1993]. Finally, the partial unique index `missions_one_active_per_driver` makes
any violation of (b) by a future code path fail at commit. The invariant is therefore enforced twice, procedurally and
declaratively. ∎

The project found this property violated before the busy-driver migration (`20261001000000`), when the eligibility
query and `accept_offer` did not test `ON_MISSION`. It was demonstrated with two concurrent database sessions and fixed
with a regression test that failed before and passed after (§7.4).

## 6.6 Algorithm 5: Booking Board Banding and Claim

*Source: `packages/domain/src/dispatch/board.ts` (`boardBand`, `sortOldestFirst`, `paginate`) and SQL `_board_band`,
`list_nearby_emergencies`, `claim_emergency`.*

The board is a *pull* complement to the *push* waves. A request that nearby drivers left unanswered becomes visible to
slightly farther drivers as it ages. The same rule runs in SQL (authoritative: it decides what a driver may see) and in
TypeScript (for development feeds and tests).

```text
function BOARD_BAND(distanceKm, ageS, freeTypeWithin7km):      ▷ G = 4, Rd = 7, F = 10 km; D = 45 s
    if distanceKm ≤ G:  return green                           ▷ any age; overdue shows a negative timer
    if distanceKm ≤ Rd: return (ageS ≥ D) ? red : hidden
    if distanceKm ≤ F:  return (ageS ≥ 2D and not freeTypeWithin7km) ? fallback : hidden
    return hidden

function BOARD(driver):
    items ← [m ∈ open requests of driver.type | BOARD_BAND(dist(driver, m), age(m), …) ≠ hidden]
    items ← SORT(items, by createdAt ascending, then missionId)          ▷ oldest first, stable
    return PAGINATE(items, page, size = 5)                                ▷ page clamped into range

function TIMER_TONE(secondsLeft, D = 45):
    if secondsLeft < 0: red; elif ≤ 10: orange; elif ≤ D/2: yellow; else green
```

**Complexity.** `BOARD_BAND` is O(1). The board listing is O(*n* log *n*) for the sort plus O(1) for pagination. The
`fallback` band needs one existence probe on the online-driver GiST index, O(log *N*ₒ). `claim_emergency` re-evaluates
`BOARD_BAND` under the mission and driver locks (same order as §6.5), so the visibility rule is also an authorisation
rule.

**Implementation finding (fixed).** `sortOldestFirst` called `Date.parse` inside the comparator, so each of the
Θ(*n* log *n*) comparisons parsed two ISO-8601 strings. The asymptotic class was unchanged, but the constant was about
300 ns per comparison (§7.5), roughly 41 ms for *n* = 10,000. The fix is a decorate–sort–undecorate transformation:

```text
function SORT_OLDEST_FIRST(items):
    D ← [(item, parse(item.createdAt)) for item in items]      ▷ n parses, O(n)
    sort D by (at ascending, then item.missionId)              ▷ numeric comparisons, O(n log n)
    return [d.item for d in D]                                 ▷ caller's own objects, input untouched
```

It performs exactly *n* parses instead of up to 2*n* log₂ *n*. It also keeps the previous order in every case,
including an unparsable timestamp, which compares as a tie and falls back to the id order. A regression test counts the
parses and fails on the old code. The paired measurement is in Table 7.5b.

## 6.7 Algorithm 6: Statutory Fare and Measured Transport Leg

*Source: `packages/domain/src/pricing/index.ts` (`computeItemizedStatutoryFare`), SQL `compute_statutory_fare` and the
`MISSION_COMPLETED` branch of `transition_mission`, `20261004000000_security_hardening.sql`.*

```text
TARIFF = { D: (500, 25), C: (300, 15), B: (200, 12), A: (150, 8) }       ▷ (base ₹ incl. 5 km, ₹ per extra km)

function FARE(type, distanceKm):
    (base, rate) ← TARIFF[type]
    extra ← max(0, round₁(distanceKm − 5.0))                              ▷ one decimal
    return base + round(extra × rate)                                     ▷ surge = 1.0, EMT charge = 0

function MEASURED_LEG_KM(mission):
    P ← telemetry of mission by its driver with onboardAt ≤ t ≤ arrivedHospitalAt
          and (accuracy unknown or accuracy ≤ 50 m)
          ORDER BY t                                                      ▷ index-ordered
    km ← Σ over consecutive (pᵢ₋₁, pᵢ) in P with Δt > 0 and dist/Δt ≤ 200 km/h of dist(pᵢ₋₁, pᵢ)
    if km > 0: return (min(km, 9999.99), measured)
    return (geodesic(pickup, destinationHospital), estimate)              ▷ canonical points, not the quote
```

**Complexity.** `FARE` is O(1). `MEASURED_LEG_KM` costs O(*T*) given index order (O(*T* log *T*) if a sort is needed)
and O(1) extra space beyond the window. `onboardAt` and `arrivedHospitalAt` are themselves clamped into
[previous stage, server now + 5 min] before use (§6.13).

**Properties.** (i) *Quote–bill parity*: the client quote and the SQL fare use the same table and rounding, enforced by
a schema drift test. (ii) *Non-surge*: a CHECK constraint rejects any stored fare with a multiplier other than 1.0.
(iii) *Disclosure*: the completion event carries `distanceSource ∈ {measured, estimate}`, and the receipt labels the
amount accordingly. (iv) *Robustness*: the accuracy and speed filters bound the error that GPS jitter can inject. At
3 s sampling, each admitted segment is at most 200/3.6 × 3 ≈ 167 m long, so the two segments that touch a single
outlier fix contribute at most ≈ 333 m in total, whatever the size of the outlier.

## 6.8 Algorithm 7: Ordered, Idempotent Event Application on Clients

*Source: `packages/domain/src/mission-channel/index.ts` (`parseLifecycleMessage`, `decideSeq`) and the
`missionSync.core.ts` services in both apps.*

```text
state: lastSeq ← persisted or null; machine ← statechart in state S

on message x:
    msg ← PARSE_LIFECYCLE(x)                    ▷ tolerant: unknown/malformed → null, never throws
    if msg = null: return
    switch DECIDE_SEQ(lastSeq, msg.seq):
        apply:     machine.send(SERVER_<msg.event>(msg.data)); lastSeq ← msg.seq
        duplicate: return                       ▷ seq ≤ lastSeq (redelivery or history replay)
        gap:       RESYNC()

function DECIDE_SEQ(last, seq):
    if seq = undefined or last = null: return apply      ▷ legacy publisher / no baseline
    if seq ≤ last: return duplicate
    return (seq = last + 1) ? apply : gap

procedure RESYNC():                             ▷ also on start-up and after reconnect
    snap ← read mission (RLS-filtered) and events with seq > lastSeq, in order
    for e in events: machine.send(SERVER_<e.type>); lastSeq ← e.seq
    machine.send(HYDRATE(statusCrosswalk(snap.status)))  ▷ server status always wins
```

**Complexity.** O(1) per message for parsing a bounded envelope and an integer comparison. `RESYNC` is O(*E*) for the
missed events. Because each mission has a single writer (§6.5, `RECORD_EVENT` under the row lock), `seq` is a total
order consistent with causality for that mission [@lamport1978]. Applying in `seq` order with duplicate suppression
therefore yields exactly-once *effect* over an at-least-once channel [@kleppmann2017; @helland2012]. The patient
persists `lastSeq = 1` after booking, so an instant system cancellation recorded inside `create_mission` (seq 2,
published before the client knows the mission id) is recovered by replay rather than lost.

## 6.9 Algorithm 8: Realtime Transport Health

*Source: `packages/domain/src/realtime/index.ts` (`reduceRealtime`, `realtimeHealth`, `trackingBadge`).*

```text
reduce(s, event, now):                           ▷ pure reducer fed by the SDK's own callbacks
    connecting:   s.conn ← connecting; s.attempt += (fresh client ? 0 : 1); s.downSince ← s.downSince ?? now
    connected:    s.conn ← connected; s.downSince ← null; s.attempt ← 0
    disconnected: s.conn ← disconnected; s.sub ← (unsubscribed ? unsubscribed : subscribing); s.downSince ← s.downSince ?? now
    error:        if s.conn ≠ connected: s.attempt += 1   ▷ each failed retry while down
    message/heartbeat: update timestamps only               ▷ silence is never failure

health(s, now; grace = 10 s, failAfter = 30 s, maxAttempts = 3):
    if s.conn = connected: return (s.sub = subscribed) ? healthy : degraded
    if s.downSince = null: return disconnected               ▷ idle
    down ← now − s.downSince
    if down < grace: return degraded
    if down ≥ failAfter or s.attempt ≥ maxAttempts: return disconnected
    return reconnecting

badge(transport, gps): disconnected → paused; ≠ healthy → connecting; gps fresh → live; else awaitingGps
```

**Complexity.** O(1) time and space per event and per query. The reducer is total: every event in every state yields a
defined state, which the realtime health tests cover.

## 6.10 Algorithm 9: Server-Timed Countdown with Clock-Offset Correction

*Source: `estimateClockOffsetMs`, `offerSecondsLeft`, `boardSecondsLeft` in `packages/domain/src/dispatch`.*

```text
offset ← parse(offer.issuedAt) − localNowAtReceipt          ▷ 0 if absent or unparsable
offerSecondsLeft(expiresAt, localNow) = max(0, ⌈(parse(expiresAt) − (localNow + offset)) / 1000⌉)
boardSecondsLeft(dueAt, localNow)     =        ⌈(parse(dueAt)     − (localNow + offset)) / 1000⌉   ▷ signed
```

**Complexity.** O(1). **Error bound.** The estimate absorbs the device's clock skew but includes the one-way delivery
latency *δ* of the offer. The displayed countdown is therefore late by *δ*, which in §7.6 is on the order of 1–5 ms on
the realtime hop, small relative to the 1 s display resolution. The countdown is advisory. The server's `expires_at`
decides acceptance.

## 6.11 Algorithm 10: Batched Telemetry Ingestion with Graceful Fallback

*Source: SQL `public.ingest_telemetry`, `20261005000000_performance.sql`.*

```text
function INGEST(missionId, pings[1..B]):                     ▷ B ≤ 1000
    require caller is the assigned driver and mission active
    from ← (acceptedAt ?? createdAt) − 5 min
    try:                                                     ▷ one statement, one subtransaction
        ok(p) ← valid lat/lng ranges ∧ speed ≥ 0 ∧ heading ∈ [0,360] ∧ accuracy ∈ [0,99999]
                ∧ from ≤ p.timestamp ≤ now + 5 min
        INSERT all p with ok(p) ON CONFLICT DO NOTHING       ▷ dedupe index
        return (acknowledged = |ok|, rejected = B − |ok|)
    on any error:                                            ▷ e.g. a non-numeric string in one ping
        for p in pings: try insert p individually; count ack/reject   ▷ old per-ping semantics
```

**Complexity.** The fast path is O(*B* log *S*), where *S* is the size of the dedupe index, in **one** subtransaction.
The fallback is O(*B* log *S*) with *B* subtransactions. The fast path matters beyond its constant factor. More than 64
open subtransactions overflow PostgreSQL's per-backend subtransaction cache, which slows snapshot checks for every other
session while the batch is open [@postgresDocs]. The fallback preserves the exact per-ping result for any batch the fast
path cannot take whole.

## 6.12 Algorithm 11: Presence with Device-Clock-Independent Fix Age

*Source: SQL `public.set_driver_presence`, `_driver_dispatchable`, `20261003000000_dispatch_hardening.sql`; driver
heartbeat every 10 s.*

```text
client (every 10 s, only after a real fix exists):
    age ← deviceNow − fix.timestampDevice                    ▷ both readings from the same device clock
    RPC set_driver_presence(online, fix.lat, fix.lng, age)

server:
    d.last_seen_at ← now
    if position given: d.loc ← point(lng, lat); d.location_fixed_at ← now − age

DISPATCHABLE(d) ≡ d.online ∧ d.verified ∧ d.loc ≠ null
                  ∧ now − d.last_seen_at < 30 s ∧ now − d.location_fixed_at < 30 s
```

**Complexity.** O(log *N*) for the update. **Property.** A skew of the phone's clock by any constant *c* cancels out,
because *age* = (*t*_now + *c*) − (*t*_fix + *c*). A heartbeat that re-sends an old fix keeps the driver *present* but
lets the fix go *stale*, so the driver drops out of dispatch after 30 s instead of being offered missions at a position
they have left.

## 6.13 Algorithm 12: Clamping Device-Reported Times

*Source: SQL `public._reported_ts`, `20261004000000_security_hardening.sql`.*

```text
REPORTED_TS(text, lowerBound) = min(max(parse(text), lowerBound ?? −∞), now + 5 min)
    arrivedSceneAt    ← REPORTED_TS(client value, acceptedAt)
    onboardAt         ← REPORTED_TS(client value, arrivedSceneAt ?? acceptedAt)
    arrivedHospitalAt ← REPORTED_TS(client value, onboardAt)
    completedAt       ← REPORTED_TS(client value, arrivedHospitalAt)
```

**Complexity.** O(1). **Property.** Stage times are monotone non-decreasing by construction and never lie more than
5 minutes in the server's future. This bounds the billing window of §6.7 to what the server could have observed.

## 6.14 Algorithm 13: Per-Patient Admission Control

*Source: SQL `public.create_mission`, `20261004000000_security_hardening.sql`.*

```text
function CREATE_MISSION(u, request, idemKey):
    ADVISORY_XACT_LOCK(hash("create_mission:" + u))              ▷ serialise this patient's bookings
    if ∃ mission(u, idemKey): return REPLAY                      ▷ idempotent retry
    if ∃ mission(u) with status ∈ {requesting, en_route, on_scene}: fail active_mission_exists
    if |{m(u) : createdAt > now − 1 h and cancelledBy ≠ system}| ≥ 10: fail too_many_requests
    zone ← POINT_IN_POLYGON(request.pickup, jurisdictions)       ▷ GiST; fail out_of_zone
    insert mission; RECORD_EVENT(MISSION_REQUESTED, seq = 1); quote fare
    DISPATCH_NEXT_WAVE(mission)                                  ▷ wave 1 in the same transaction
```

**Complexity.** O(log *N* + *M*) for the checks, using `(patient_id, created_at DESC)`. Point-in-polygon costs
O(log *J* + *v*) for *J* jurisdictions with *v* boundary vertices tested. The jurisdiction boundaries are large
polygons (about 3 MB of SQL), so *v* dominates the constant. One dispatch wave then follows (§6.3). **Rationale.**
Every open request reserves all drivers it offered (§6.3, `RESERVED`). Without admission control, one account could
reserve every nearby ambulance and starve genuine requests. System cancellations are excluded from the hourly count so
that a patient whose search failed can always try again.

## 6.15 Complexity Summary

**Table 6.1. Time complexity of the core algorithms**

| Algorithm | Location | Time | Space | Dominant term in practice |
|---|---|---|---|---|
| A1 Triage | client | O(1) | O(1) | 0.13 µs measured (§7.5) |
| A2 Wave dispatch | DB | O(*W*(log *N*ₒ + *k* log *N*)) | O(*k*) | GiST probe; 1.0 ms at *N* = 6,000 (§7.9.2) |
| A3 Tick / decline | DB | O(*R* · A2) / O(*k*) + A2 | O(*R*) | Number of expiring waves per 5 s |
| A4 Accept | DB | O(log *N* + *k*) | O(1) | Lock wait under contention |
| A5 Board | DB + client | O(*n* log *n*) | O(*n*) | Sort; timestamps now parsed once (§6.6) |
| A6 Fare / measured leg | client + DB | O(1) / O(*T*) | O(1) | Telemetry window scan |
| A7 Event application | client | O(1) per msg; O(*E*) resync | O(1) | Network round trip on gap |
| A8 Transport health | client | O(1) | O(1) | — |
| A9 Countdown | client | O(1) | O(1) | — |
| A10 Telemetry batch | DB | O(*B* log *S*) | O(*B*) | One vs *B* subtransactions |
| A11 Presence | DB | O(log *N*) | O(1) | One heartbeat per driver per 10 s |
| A12 Time clamp | DB | O(1) | O(1) | — |
| A13 Admission | DB | O(log *N* + *M* + log *J* + *v*) | O(1) | Jurisdiction polygon test |

At the system level, the steady-state database write load from presence is *N*ₒ/10 updates per second. 1,000 online
drivers produce 100 small indexed updates per second. Telemetry load during missions is one batch per flush interval per
active mission. Dispatch work is proportional to the number of *expiring* waves, not to the number of drivers, because
every candidate search is index-bounded.
