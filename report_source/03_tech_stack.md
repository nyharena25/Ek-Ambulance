# 3. Literature Review and Technology Choice Justification

This section first places Ek-Ambulance in the research literature (§3.1). It then derives the quality attributes that
drive technology selection (§3.2) and justifies each choice against its realistic alternatives (§3.3–3.9). A
consolidated decision record closes the section (§3.10). Ratings in the comparison tables are the authors' qualitative
assessments against the stated criteria. They are not measurements.

## 3.1 Related Work

### 3.1.1 Ambulance operations research

The operations-research literature on emergency medical services (EMS) has concentrated on *where* to station
ambulances and *which* idle ambulance to send. Brotcorne, Laporte and Semet survey static covering models (LSCM, MCLP)
and their dynamic relocation extensions [@brotcorne2003]. Jagtenberg, Bhulai and van der Mei show that the intuitive
closest-idle dispatch policy is not always optimal once future coverage is accounted for [@jagtenberg2017]. These
models assume a centrally controlled, salaried fleet whose vehicles can be commanded. An on-demand platform that
aggregates independently operated private ambulances cannot command a driver. It can only *offer* a mission, so the
decision problem becomes one of offer sequencing under uncertain acceptance. Ek-Ambulance therefore uses closest-first
offering within expanding radii (§6.3), the offer analogue of closest-idle. It leaves coverage-aware policies to future
work once real acceptance data exist.

### 3.1.2 On-demand spatial matching

Ride-hailing platforms popularised supply-demand matching over moving fleets. Uber's H3 hierarchical hexagonal index
partitions the globe into multi-resolution cells for aggregation and nearest-supply search [@brodsky2018]. Ek-Ambulance
borrows the idea of *expanding search areas* but not the cell index. For a two-jurisdiction deployment with at most
thousands of online drivers, an R-tree-family index over true geodesic geometry answers radius queries directly, avoids
cell-boundary effects, and keeps location in the same transactional store as the dispatch decision (§3.5).

### 3.1.3 Spatial indexing

R-trees index rectangles hierarchically and support range and nearest-neighbour search in logarithmic expected time
[@guttman1984]. PostgreSQL implements them through the Generalized Search Tree (GiST) framework [@hellerstein1995], on
which PostGIS builds its `geography` type and its index-aware predicates such as `ST_DWithin` [@postgisDocs]. Published
measurements report index-assisted nearest-neighbour queries orders of magnitude faster than sequential scans
[@ramseyKnn]. In-memory alternatives such as Redis `GEOSEARCH` trade durability and transactional coupling for speed
[@redisGeo]. Section 7.9.2 reports the project's own measurement of what happens when the planner cannot use the index.

### 3.1.4 Clinical triage

START (Simple Triage and Rapid Treatment) sorts casualties by respiration, perfusion and mental status into
colour-coded priorities [@benson1996]. The Emergency Severity Index (ESI) stratifies emergency-department patients into
five levels by acuity and expected resource use [@gilboy2012]. The Manchester Triage System uses presentation-specific
flowcharts with maximum waiting times [@mackway2014]. Ek-Ambulance adopts a deliberately reduced, deterministic subset
(§6.2). Chest pain, breathing distress and unconsciousness are always immediate. Trauma is graded by the three START
vital checkpoints. The output only constrains the ambulance category; it never makes a diagnosis.

### 3.1.5 Statecharts and lifecycle modelling

Harel's statecharts extend finite automata with hierarchy, concurrency and guarded transitions [@harel1987]. They are
well suited to user-interface flows in which ad-hoc boolean flags (`isTripActive`, `isSearching`) tend to combine into
unreachable or contradictory states. XState implements statecharts for JavaScript and TypeScript, including typed events
and actors [@xstateDocs]. Ek-Ambulance models both client lifecycles as XState machines and requires the server status
crosswalk to map onto them (§6.8).

### 3.1.6 Events, ordering and idempotency

Event sourcing stores state changes as an append-only sequence of events from which current state can be derived
[@fowlerES]. Messaging patterns such as the idempotent receiver, the event message and the guaranteed-delivery channel
are catalogued by Hohpe and Woolf [@hohpe2003]. Kleppmann discusses why exactly-once delivery is usually realised as
at-least-once delivery plus idempotent processing [@kleppmann2017]. Helland argues that idempotence must be designed into
every retried operation [@helland2012]. Lamport's logical clocks establish that per-object sequence numbers, not
wall-clock timestamps, should order causally related events [@lamport1978]. Ek-Ambulance applies all four ideas. Each
mission has a gap-free sequence number, every mutating request carries an idempotency key, receivers apply, discard or
resynchronise by sequence number, and timestamps are informational only.

### 3.1.7 Gap analysis

| Concern | Public 108 service [@emri108] | Typical private booking | Ek-Ambulance |
|---|---|---|---|
| Live vehicle location for caller | No | Rarely | Yes (Centrifugo `mission:{id}`) |
| Vehicle clinical category disclosed | No | Informal | AIS-125 Types A–D [@ais125p1] |
| Structured triage → vehicle constraint | Call-taker protocol | No | START/ESI-derived function (§6.2) |
| Price disclosed before booking | Free service | Negotiated | Statutory, surge-free quote (§6.7) |
| Aggregates private fleets | No | Single operator | Yes, with staff-reviewed KYC |
| Machine-checkable audit trail | Not public | No | Append-only `mission_events` |
| DPDP consent/erasure/retention | Not documented publicly | Rare | Implemented (§5.9) [@dpdp2023] |

## 3.2 Quality Attributes that Drive Technology Choice

| ID | Quality attribute | Concrete requirement |
|---|---|---|
| Q1 | Integrity of decisions | Assignment, state and fare must be decided where a modified client cannot reach them (C1). |
| Q2 | Atomicity and isolation | "Exactly one driver per mission, at most one active mission per driver" must hold under concurrent requests (C2). |
| Q3 | Low-latency push | Offers and lifecycle events must reach phones within a second, with recovery after disconnection (C5). |
| Q4 | Geospatial correctness | Radius queries over geodesic distance, indexed, consistent with the decision transaction. |
| Q5 | Cross-platform mobile reach | Android first (dominant in the target market), iOS second, from one code base, with background location. |
| Q6 | Code sharing and drift control | Triage, tariff and wire contracts identical in three clients and consistent with SQL. |
| Q7 | Small-team operability | A two-person academic team must build, test and operate the system. Minimise services to deploy. |
| Q8 | Data residency and protection | Personal data pinned to India (AWS Mumbai, `ap-south-1`). Secrets never in client bundles [@dpdp2023]. |
| Q9 | Cost | Free or open-source tiers where possible. No mandatory per-request map or SDK fees. |

## 3.3 Mobile Front End: Expo / React Native

**Choice.** Expo SDK 57 with React Native 0.86 and React 19.2, using expo-router for file-based navigation, expo-location
and expo-task-manager for foreground and background GPS, and expo-secure-store for session storage [@expoDocs;
@reactNative].

| Criterion | Expo / React Native | Flutter [@flutter] | Native Kotlin + Swift | Progressive Web App |
|---|---|---|---|---|
| Q5 single code base | ●●● | ●●● | ● (two code bases) | ●●● |
| Q6 share TypeScript domain package with SQL tests and web console | ●●● (same language) | ● (Dart; logic duplicated) | ● | ●●● |
| Background location while screen is off | ●● (TaskManager, foreground service) | ●● (plugins) | ●●● | ● (not reliably available) |
| Team familiarity and hiring pool | ●●● | ●● | ●● | ●●● |
| Runtime performance for map-heavy screens | ●● | ●●● | ●●● | ●● |

**Justification.** The decisive criterion is Q6. Because the clients are written in TypeScript, the triage engine,
tariff, wire parsers and lifecycle statecharts exist exactly once, in `@sahayak/domain`. The same files run unchanged in
the patient app, the driver app, the Vite admin console and the Node test runner. Flutter would match React Native on
reach but would force a second implementation of every rule in Dart, which is exactly the drift Section 3.8 is designed
to prevent. A PWA cannot sustain background GPS publishing on Android, which the driver application needs while
navigating with the screen locked.

**Accepted costs.** The JavaScript thread can stall under heavy rendering, and background location on Android needs a
foreground-service notification and careful permission handling. Physical-device validation of the latter remains open
(§7.11).

## 3.4 Client State: XState Statecharts inside Zustand Stores

**Choice.** Each app runs an XState v5 machine from `@sahayak/domain` inside a Zustand store (`*Lifecycle.store.ts`)
that screens read [@xstateDocs; @zustand].

| Criterion | XState + Zustand | Redux Toolkit | Ad-hoc `useState` flags |
|---|---|---|---|
| Illegal states unrepresentable | ●●● (explicit states, guarded transitions) | ● | ✗ |
| Testable without React | ●●● (pure machine, Node tests) | ●● | ✗ |
| Server reconciliation (`HYDRATE` from server status) | ●●● (one event) | ●● | ● |
| Boilerplate | ●● | ● | ●●● |

**Justification.** The lifecycle is a statechart by nature (§6.8). Encoding it explicitly means an event that is invalid
in the current state is a no-op rather than a corruption. This property is covered by tests, for example
`REQUEST` from `idle` leaves both state and fare untouched. Zustand gives React a minimal subscription layer without
coupling the machine to the component tree. The machine also shapes the UI contract: the codebase rule is that screens
follow machine states, never booleans such as `isTripActive`.

## 3.5 Backend Logic: PostgreSQL Functions on Supabase ("Database as Application Server")

**Choice.** No bespoke application server. Business logic is 64 PL/pgSQL and SQL functions exposed as remote procedure
calls (RPCs) through Supabase's PostgREST interface, with GoTrue for authentication, Storage for KYC documents and Vault
for secrets [@supabaseDocs; @postgresDocs].

| Criterion | PostgreSQL RPCs (chosen) | Node/Fastify service + Postgres | Firebase (Firestore + Functions) [@firebase] |
|---|---|---|---|
| Q1/Q2 decision, locks and authorisation in one transaction | ●●● | ●● (two processes; locks via DB anyway) | ● (document transactions, no row locks across collections) |
| Q4 geospatial in the same transaction | ●●● (PostGIS) | ●●● | ● (geohash workarounds) |
| Q7 services to operate | ●●● (managed DB only) | ● (service, deploys, scaling) | ●●● |
| Testability of rules in isolation | ●● (SQL behaviour suites) | ●●● | ●● |
| Language ergonomics, code review | ● (PL/pgSQL) | ●●● | ●● |
| Q8 region pinning (`ap-south-1`) | ●●● | ●●● | ●● |

**Justification.** Dispatch correctness depends on decisions that must be atomic with the data they read. One example:
"this driver is free, is in the wave and has not declined, therefore assign". With an application server, the server
must either reimplement locking or delegate it to the database anyway, and it adds a network hop and a second deployable
unit in which authorisation can drift. Placing the rule in a `SECURITY DEFINER` function makes the transaction, the row
locks, the RLS context and the audit insert a single unit. The same function is the only write path. Clients hold no
`INSERT` or `UPDATE` privilege on `missions` or `drivers`. A modified client can therefore call the procedure but cannot
bypass it. This is the principle of complete mediation [@saltzer1975]. Fielding's REST constraints [@fielding2000] are
deliberately relaxed in favour of explicit RPC verbs (`accept_offer`, `transition_mission`), because the domain is a
command-oriented state machine rather than a collection of resources.

**Accepted costs.** PL/pgSQL is harder to structure, review and debug than application code. Some rules exist in both
TypeScript and SQL (tariff, dispatch configuration, transition table), which the drift tests in §3.8 compensate for.
The coupling to Supabase is smaller than it appears. GoTrue, PostgREST, pg_cron and pg_net are all open source, and the
business logic is plain PostgreSQL, but a migration to self-hosting has not been tested.

## 3.6 Database: PostgreSQL 17 with PostGIS

| Criterion | PostgreSQL + PostGIS | MongoDB (2dsphere) | Redis GEO only [@redisGeo] | DynamoDB + geohash |
|---|---|---|---|---|
| ACID transactions across mission, wave and driver rows | ●●● | ●● | ✗ | ● |
| Row-level locks, `FOR UPDATE SKIP LOCKED`, advisory locks | ●●● | ✗ | ✗ | ✗ |
| Geodesic `geography` type, GiST index, `ST_DWithin` | ●●● | ●● | ●● (no polygons) | ● |
| Jurisdiction polygons (point-in-polygon for DL/UP boundaries) | ●●● | ●● | ✗ | ✗ |
| Declarative row security (RLS) | ●●● | ✗ | ✗ | ● (IAM conditions) |

**Justification.** Two features are decisive. The first is `SELECT … FOR UPDATE SKIP LOCKED`, which lets two
concurrent dispatch waves claim *disjoint* sets of free drivers without blocking each other (§6.3). The second is RLS,
which states "a patient reads only their own missions" once, in the database, rather than in every query. A spatial
partial GiST index on online drivers (`idx_drivers_online_location … WHERE is_online`) keeps candidate search
logarithmic. An earlier design kept live positions in Redis GEO sets and used Postgres only for durable records. It was
abandoned because it splits the dispatch decision across two stores that cannot share a transaction.

## 3.7 Realtime Plane: Centrifugo v5 with a Redis Engine

| Criterion | Centrifugo (chosen) [@centrifugoDocs] | Supabase Realtime [@supabaseRealtimeLimits] | Firebase RTDB | Self-built Socket.IO | MQTT broker |
|---|---|---|---|---|---|
| Per-channel authorisation by signed token | ●●● (HMAC JWT subscription tokens [@rfc7519; @rfc2104]) | ●● (RLS-based) | ●● (rules) | ● (hand-written) | ●● (ACLs) |
| History and automatic recovery after reconnect | ●●● (`history_size`, `force_recovery`) | ● | ●● | ✗ | ●● (retained/QoS) |
| Publish proxy to authorise client publications | ●●● | ✗ | ● | ● | ● |
| Server-to-client publish from the database | ●●● (HTTP API via pg_net) | ●●● | ● | ● | ● |
| Independent of the database vendor; self-hostable | ●●● | ● | ✗ | ●●● | ●●● |
| Connection and message quotas on the managed tier | n/a (self-hosted) | constrained | metered | n/a | n/a |

**Justification.** Ek-Ambulance needs two kinds of channels: `mission:{id}` for lifecycle events and driver GPS, and
`driver:{id}:offers` for private offers. Both need authorisation at subscription time and must survive brief
disconnections without losing messages. Centrifugo provides signed per-channel subscription tokens, a bounded history
per namespace (250 messages and 600 s for missions, 5 messages and 60 s for offers) with automatic recovery, and, in
strict mode, a publish proxy. The proxy lets the gateway admit a driver's GPS publication only if that driver is
assigned to the mission in an active status. Supabase Realtime was rejected because of the connection and message limits
of the managed tier [@supabaseRealtimeLimits] and because high-frequency GPS should not flow through the primary
database's replication stream. Section 7.6–7.8 measures the chosen plane.

## 3.8 Monorepo, Build and Test Tooling

**Choice.** pnpm 9 workspaces with Turborepo 2 orchestration [@pnpm; @turborepo]. Tests are plain `node:assert`
scripts executed by Node's built-in TypeScript type stripping (`node --experimental-strip-types`) [@nodeStripTypes],
with no test framework.

**Justification.** One repository holds three apps, two shared packages, the SQL migrations and the gateway, so a single
change can update a rule in TypeScript and SQL together and be checked atomically. pnpm's content-addressed store and
strict dependency isolation prevent phantom dependencies, which matter when the same domain package must stay free of
React Native imports. Running tests without a framework removes a transpilation and configuration layer: the full gate
of type checking and tests runs in 7.1 s (§7.4). The trade-off is the absence of watch mode, coverage reports and test
discovery. Every new test file must be appended to its package's `test` script explicitly.

**Drift tests.** Rules that must exist in two languages are checked statically. The tariff table, `dispatch_config()`
(offer TTL, wave window, radii, board radii, search window, freshness windows) and the transition table in the SQL
migrations are parsed and compared with `@sahayak/domain`. A divergence fails `pnpm test:schema`.

## 3.9 Other Components

| Component | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| API gateway | Kong 3.9 OSS, DB-less declarative config [@kongDocs] | Nginx, AWS API Gateway | Route allow-list and per-IP rate limits as reviewable YAML. The configuration itself is unit-tested (`pnpm test:gateway`). No database to operate. |
| TLS edge (demo deployment) | Caddy with automatic HTTPS [@caddy] | Nginx + certbot | Zero-configuration certificates for the university demonstration host. |
| Scheduler | pg_cron, every 5 s [@pgcron] | External worker, cloud scheduler | Escalation runs next to the data under the same locks; no extra service. |
| Database → realtime bridge | pg_net asynchronous HTTP [@pgnet] | Logical replication consumer, outbox poller | A failed publish never rolls back or blocks the state change. Clients reconcile from the event log. |
| Maps | Leaflet in a WebView, OpenStreetMap tiles, loaded with Subresource Integrity [@leaflet; @haklay2008; @w3cSri] | Google Maps SDK via react-native-maps, Mapbox | Keyless and free (Q9). The native Google map rendered a black surface on test devices and needed an API key in the bundle. SRI pins the exact library bytes. |
| Routing / ETA | OSRM public demo server, with a haversine × 1.3 fallback at 30 km/h [@luxen2011; @sinnott1984] | Google Directions | Free and OSM-based. The fallback never rejects, so the UI degrades instead of failing. |
| Staff console | Vite + plain TypeScript DOM, no framework [@vite] | React/Next.js admin template | Small surface (KYC queue, activity history). Fewer dependencies to audit. The dev server refuses to start if given a service-role key. |
| Authentication | Supabase GoTrue phone OTP | Firebase Auth, custom | Phone-first users. JWTs [@rfc7519] carry the role in `app_metadata`, which users cannot edit. |
| Triage text assist | LLM via a gateway relay to OpenRouter [@openrouter] | On-device model, none | Optional and suggestion-only. The gateway, not the app, fixes the model and prompt, and the deterministic function decides the tier. |

## 3.10 Consolidated Decision Record

| Decision | Primary driver | Main risk accepted | Mitigation in place |
|---|---|---|---|
| Logic in PostgreSQL functions | Q1, Q2, Q7 | PL/pgSQL maintainability | SQL behaviour suites with forged JWT claims. Static schema and drift tests. |
| PostGIS radius waves instead of a cell index | Q4, Q2 | Index misuse by the planner | Query states its index predicates explicitly (§7.9.2). |
| Centrifugo instead of database-native realtime | Q3 | One more service; delivery not transactional | pg_net is fire-and-forget. Clients reconcile by sequence number (§6.8). |
| Expo / React Native | Q5, Q6 | Background GPS on real devices | Pure `*.core.ts` logic tested in Node. Device validation pending. |
| Framework-free tests | Q7 | Manual test registration | Explicit `&&` chains reviewed per package. |
