# 1. Abstract and Executive Summary

## 1.1 Abstract

India recorded more than 480,000 road accidents and 172,000 road deaths in 2023 [@morth2023], and many victims die before
definitive care because they do not reach a hospital within the so-called golden hour [@ummcGoldenHour; @roy2017; @dar2025].
Public emergency numbers such as 108 cover large regions, but callers cannot see where an ambulance is, what it can do
clinically, or what it will cost [@emri108]. This paper presents **Ek-Ambulance (SAHAYAK-EMS)**, an on-demand emergency
ambulance dispatch platform for the National Capital Territory of Delhi and Uttar Pradesh. It consists of a patient
application and a driver application built with Expo and React Native, a staff console for driver verification, a pure
TypeScript domain package shared by all clients, and a *server-authoritative* backend implemented entirely as PostgreSQL
functions on Supabase, with PostGIS, Row-Level Security (RLS), pg_cron and pg_net. Every mission transition is executed by
an authenticated remote procedure under row locks and appended to an ordered, append-only event log. A database trigger
then forwards the event to a self-hosted Centrifugo realtime server. Dispatch broadcasts time-limited offers in three
expanding geographic waves (3, 6 and 10 km) to drivers who passed staff-reviewed Know-Your-Customer (KYC) checks. A
driver must be of the clinically required AIS-125 ambulance category [@ais125p1] and must report a fresh presence
heartbeat and a fresh GPS fix. A deterministic triage function derived from START and ESI [@benson1996; @gilboy2012] maps
caller answers to an urgency tier and a minimum care level. A regulated, surge-free tariff is computed on the server, and
a schema test keeps it identical to the client quote.

The evaluation combines correctness and performance evidence. The full regression gate (type checking, 49 Node test
files across five workspaces, schema, gateway, data-integrity and security static analysis) passed 10/10 tasks. On a
local deployment of the realtime plane, a lifecycle event travelled from the Centrifugo publish API to a WebSocket
subscriber in 1.17 ms at the median and 2.04 ms at the 99th percentile. Fan-out to 100 subscribers kept the
99th-percentile time for the last receiver below 9.4 ms. A single Centrifugo node saturated at about 12,500 publications
per second while using 1.05 CPU cores. The gateway enforced its 120-requests-per-minute limit exactly at request 121. The
client-side domain functions cost between 3 ns and 0.53 µs per call. The project's own database record shows that a
planner fix reduced the dispatch-candidate query from 69.5 ms to 1.0 ms on 6,000 drivers.

A seeded Monte Carlo model of the dispatch protocol (20,000 trials per configuration) compares the original
one-minute escalation scheduler with the hardened five-second, decline-aware scheduler. The model is labelled as a
simulation with synthetic inputs, and its spatial component agrees with the closed-form Poisson coverage to within
0.6 percentage points. Under the hardened design it predicts a 72–77 % reduction in the 90th-percentile
time-to-assignment in the 8 of 12 configurations where the first wave often fails to settle the request. In the other
4 configurations, where the first wave almost always succeeds, it predicts essentially no change. The evaluation also exposed two defects, both fixed during the
study and guarded by new tests. The Booking-board sort re-parsed timestamps inside its comparator; parsing once made it
2.8–14.5× faster in a paired benchmark. 16 of the 17 contrast ratios documented in the colour tokens were wrong, and four AAA claims
measured only 5.0–6.5:1 (AA). Physical-device GPS, mobile-network conditions, load on the hosted database and field deployment
were not evaluated.

**Index Terms**: emergency medical services, ambulance dispatch, server-authoritative architecture, PostgreSQL, PostGIS,
row-level security, event sourcing, realtime publish/subscribe, Centrifugo, statecharts, XState, React Native, clinical
triage, AIS-125, DPDP Act 2023, Monte Carlo simulation.

## 1.2 Executive Summary

**What was built.** Ek-Ambulance is a working, end-to-end dispatch platform rather than a prototype of a single
component. A patient answers at most four triage questions, chooses or accepts an AIS-125 vehicle category, confirms a
pickup point on an OpenStreetMap map, sees a statutory fare estimate before booking, and then follows the search, the
assigned ambulance and the transport leg live. A driver signs in with a phone one-time password, completes KYC with
document upload, goes online, receives offers with a 15-second server-timed countdown, and executes the mission through
navigation, on-scene care, hospital hand-off and completion. Staff review KYC applications and driver activity in a
separate web console. Section 4 describes the user experience and Section 5 the architecture.

**Key architectural decision.** No mission state lives on a phone. Mission creation, jurisdiction resolution, dispatch,
acceptance, every lifecycle transition, the fare and the receipt data are decided inside PostgreSQL by 64 SQL functions
(42 callable or trigger functions and 22 internal helpers), protected by 29 RLS policy definitions, column-level privileges and a pinned `search_path` on every
`SECURITY DEFINER` function. Clients render server state and reconcile against it after reconnection. The same
append-only `mission_events` table is the audit trail and the source of every realtime message, so the patient only ever
sees stored facts.

**Evidence of quality.** Correctness is guarded by 49 automated Node test files, nine SQL behaviour suites that exercise
RLS with forged JWT claims, static schema-drift tests and two repository-wide static analyses: one for fabricated runtime
data (28 rules over 195 files) and one for secrets (333 files). Section 7 reports seven experiments, five of them
measured on the running system and one a labelled simulation.

| Indicator (Section 7) | Result |
|---|---|
| Regression gate (`pnpm preflight`) | 10/10 tasks passed, 7.1 s wall clock |
| Lifecycle event delivery, publish API → subscriber (local) | p50 1.17 ms, p99 2.04 ms |
| Fan-out to 100 subscribers, last receiver | p50 4.15 ms, p99 9.32 ms |
| Single-node realtime saturation | ≈ 12,500 publications/s, Centrifugo 1.05 CPU cores, 88 MiB RSS |
| Gateway token rate limit | first HTTP 429 at request 121 of 140 (limit 120/min) |
| Dispatch candidate query, 6,000 drivers (project record) | 69.5 ms → 1.0 ms after index-aware rewrite |
| Simulated p90 time-to-assignment, ρ = 0.03 km⁻², p = 0.5 | 98.3 s (legacy) → 24.1 s (hardened) |

**Readiness and limitations.** The platform is suitable for a supervised pilot only after the gaps listed in Section 7.11
are closed. The most important gaps are validation of background GPS on physical devices, server-side push
notifications for offers, load testing of the hosted database and its pg_net queue, and a formal DPDP compliance
assessment [@dpdp2023]. The software makes no clinical claim: triage is decision support, and whether the platform
shortens real response times can only be established by a field study with ethical approval.
