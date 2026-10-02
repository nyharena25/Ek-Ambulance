# Ek-Ambulance: A Multi-Tier Emergency Medical Dispatch Platform for On-Demand Ambulance Booking in Delhi and Uttar Pradesh

**Ny Harena RAVELOMANANTSOA**
Department of Computer Science and Engineering, Sharda School of Engineering and Technology (SSET), Sharda University, Greater Noida, Uttar Pradesh, India

**Yogesh Lekhra**
Department of Computer Science and Engineering, Sharda School of Engineering and Technology (SSET), Sharda University, Greater Noida, Uttar Pradesh, India

---

**Abstract:** Emergency medical response in India faces critical challenges, including fragmented dispatch systems, opaque pricing structures, and the absence of a unified digital platform connecting patients to appropriate ambulances. In 2023, India recorded over 480,000 road accidents and 172,000 fatalities, with very few victims reaching medical care within the vital "golden hour" [1]. To address these gaps, this paper presents SAHAYAK-EMS, an on-demand emergency ambulance dispatch platform for Delhi and Uttar Pradesh. The system consists of a patient application, a driver application and a staff portal built on a shared TypeScript domain package, and a server-authoritative backend on Supabase (PostgreSQL with PostGIS, Row-Level Security and database-side remote procedures). Missions are created, dispatched and advanced only through server-side procedures; every lifecycle transition is persisted as a sequenced mission event and forwarded to the mobile clients through a Centrifugo realtime server. Dispatch uses three expanding geographic waves (3, 6 and 10 km) over drivers who have passed a staff-reviewed KYC process and report a fresh presence heartbeat. The implementation was validated incrementally through database behaviour suites, authenticated end-to-end tests against a local stack, and a hosted scenario routed through a university demonstration deployment on Oracle Cloud. The evaluation confirmed server-side jurisdiction resolution, real wave-based dispatch including escalation to the second and third waves, the complete mission lifecycle with cancellation and abort paths, protected realtime channels, and a server-side invariant that prevents a driver from holding two active missions, which the evaluation itself first exposed as a defect. Physical-device GPS accuracy, large-scale load behaviour and field deployment were not evaluated, and the final fare can still fall back to the booking estimate when the transport-leg telemetry is insufficient; these limitations are reported explicitly.

**Index terms:** Emergency Medical Services, ambulance dispatch, geospatial matching, PostGIS, row-level security, clinical triage, AIS-125, DPDP Act, real-time systems, state machines, event-driven architecture, India.

---

## I. Introduction

Road traffic injuries are a major public health emergency in India. In 2023 alone, the Ministry of Road Transport and Highways reported over 480,000 accidents and 172,000 deaths, the highest number ever recorded [1]. Most victims are young adults aged 18 to 45, with Uttar Pradesh seeing the highest mortality rate. Often, people do not die from the initial impact, but because they fail to reach a hospital within the critical "golden hour" [4]. In major cities, fewer than 10% of trauma victims make it to care in time, leading to thousands of preventable deaths [2], [3].

Public helplines like 108 cover large regions, but they face constant call-centre delays [5]. Callers cannot track ambulances in real time or know prices in advance. To address these gaps, this paper introduces SAHAYAK-EMS, an on-demand ambulance booking platform designed for Delhi and Uttar Pradesh. SAHAYAK-EMS connects a patient to a nearby, verified ambulance of the required category using server-side geographic matching, a deterministic triage aid based on the START and ESI protocols [8], [9], and a statutory, non-surge fare aligned with the AIS-125 vehicle categories [6], [7].

The central design decision of the current implementation is that the mobile applications are not trusted with mission state. Mission creation, jurisdiction, dispatch, acceptance, lifecycle transitions and fare computation are executed inside the database through authenticated remote procedures, and each accepted transition produces a persisted, sequenced event that is then delivered to the clients in real time. The platform also implements mechanisms that support the Digital Personal Data Protection Act 2023 [24], such as consent records, erasure requests and scheduled retention purges.

This paper describes the architecture as it is actually implemented, the methodology used to build and validate it, and the results of that validation, including the defects and limitations that the validation exposed.

## II. Related Work

The architecture of SAHAYAK-EMS builds upon established literature spanning spatial indexing algorithms, prehospital dispatch systems, real-time geospatial search, clinical triage protocols, and regulatory digital health standards.

### A. On-Demand Dispatch Platforms and Spatial Indexing Algorithms

On-demand spatial matching models pioneered by ride-hailing services such as Uber rely on spatial partitioning structures to track dynamic supply and demand. A fundamental challenge in high-concurrency dispatch systems is efficiently querying dynamic positions across moving fleets. Uber addressed this via H3, an open-source hexagonal hierarchical spatial index that partitions global coordinates into hexagonal cells across sixteen resolution tiers [11]. Hexagonal geometry is preferred over rectangular grids because each cell shares equidistant centroids with all six adjacent neighbours, enabling uniform spatial aggregation and density estimation [11]. SAHAYAK-EMS does not require multi-resolution spatial hierarchies for a two-state deployment; instead, it borrows the idea of expanding search areas for its wave-based dispatch and performs the proximity queries themselves with PostGIS [13].

In India, prehospital emergency response is primarily led by the 108 emergency service, operated through a public–private partnership by GVK EMRI, which handles approximately 22,000 daily emergencies nationwide [5]. Published performance metrics indicate typical response windows within 15 minutes in urban centres and 20–25 minutes in rural areas [5]. Despite its national reach, the 108 network remains a centralised, dispatcher-driven framework without public vehicle tracking, pricing transparency, or consumer-facing interfaces, and it does not aggregate private ambulance operators. SAHAYAK-EMS is positioned to complement existing public EMS infrastructure by digitising private ambulance networks and introducing real-time operational transparency [5].

### B. Real-Time Geospatial Systems

Modern spatial search engines rely on index-accelerated spatial structures for low-latency proximity queries. PostGIS, the spatial extension for PostgreSQL, supports indexed proximity search through Generalized Search Tree (GiST) indexes; published measurements report nearest-neighbour latencies of approximately 7.8 ms, about 1,800 times faster than unindexed scans [13]. In-memory key-value stores such as Redis offer a different approach, with geospatial commands such as GEOADD (O(log N) insertion) and GEOSEARCH (O(N + log M) search) [12]. An earlier design of SAHAYAK-EMS planned to keep live driver positions in Redis and use PostGIS only for durable records. The implemented system does not do this: driver positions are stored in PostgreSQL as PostGIS geography values and dispatch queries them directly with a GiST index, while Redis is used only as the storage and message engine of the Centrifugo realtime server (Section III-C).

### C. Clinical Triage Protocols

Objective clinical triage prioritises patient care based on clinical acuity. The Simple Triage and Rapid Treatment (START) protocol, developed by the Newport Beach Fire Department and Hoag Hospital, provides rapid field triage for mass-casualty incidents based on respiration, perfusion, and neurological status [8]. For emergency department settings, the Emergency Severity Index (ESI) stratifies patient urgency across five levels based on acuity and anticipated resource utilisation [9]. Similarly, the Manchester Triage System (MTS) uses standardised flowcharts to categorise patients into urgency tiers with defined maximum waiting thresholds [10]. SAHAYAK-EMS incorporates a deterministic triage function based on START [8] and ESI [9] principles that maps caller-reported symptoms to urgency tiers and to a required vehicle category.

### D. Critical Gaps in Existing EMS Deployments

A synthesis of prehospital dispatch research reveals four structural gaps in current deployments:

- **Lack of Operational Visibility:** Callers using public helplines like 108 or private services lack real-time visibility into vehicle locations, care capabilities, and transparent pricing structures [5].
- **Absence of Structured Clinical Matching:** Booking workflows rarely incorporate standardised clinical triage like START or ESI [8], [9], risking inappropriate dispatch assignments (e.g., dispatching Basic Life Support for Advanced Life Support cases).
- **Inconsistent Vehicle Categorisation:** Consumer-facing platforms rarely present formal vehicle standards such as AIS-125 [6], [7], obscuring medical equipment capabilities from patients.
- **Data Protection Vulnerabilities:** Legacy dispatch systems were not designed for the data governance requirements of the Digital Personal Data Protection (DPDP) Act 2023 and its 2025 Rules [24].

SAHAYAK-EMS addresses these gaps in software; whether it reduces prehospital delays in practice [2]–[4] can only be established through field deployment, which is outside the scope of this paper.

## III. System Architecture

### A. Overall Layered Architecture

The SAHAYAK-EMS platform is organised as a small number of layers with a single authoritative data store. When a patient requests an ambulance or a driver reports a position, the request passes through the following layers:

**Client Layer:** Three applications share one TypeScript domain package: a patient application and a driver application built with Expo/React Native, and a staff portal for KYC review. The mobile clients hold only the Supabase anonymous (publishable) key and the user's own session; no service-role credential is present in any client bundle.

**Edge and Gateway Layer:** In the demonstration deployment, a Caddy server terminates HTTPS/WSS with an automatically issued certificate and forwards traffic to a Kong OSS gateway [18] or to Centrifugo. Kong exposes only the routes the clients need (authentication, the REST/RPC interface, storage objects, the realtime token endpoint and a triage-extraction relay) and applies per-IP rate limits (for example 20 requests per minute on authentication and 300 per minute on the REST interface).

**Backend-as-a-Service (BaaS) Layer:** Supabase provides authentication (GoTrue, with phone OTP for patients and drivers), PostgreSQL, Storage and Vault. Business logic is implemented as PostgreSQL functions called through the REST interface ("RPCs"), protected by Row-Level Security (RLS) and column-level privileges.

**Realtime Layer:** A Centrifugo v5 server delivers events to the mobile clients over WebSockets, using Redis as its engine. A small token service issues Centrifugo connection and subscription tokens only after verifying the caller's Supabase session and authorising the requested channel, and it acts as a publish proxy that admits only GPS pings from the driver assigned to an active mission.

**Scheduling Layer:** The pg_cron extension runs the dispatch escalation job (`dispatch_tick`) every minute, erasure-request processing hourly, and personal-data retention purging daily.

The realtime path for a mission event is:

```
Patient / Driver App
    ↓  authenticated RPC (Supabase Auth JWT, through Kong)
PostgreSQL RPC (create_mission, accept_offer, transition_mission, cancel_mission)
    ↓  validates actor, state and payload; updates mission and dispatch state
public.mission_events  (append-only, sequenced)
    ↓  AFTER INSERT trigger (mission_events_publish)
publish_realtime()  →  pg_net asynchronous HTTP POST (Centrifugo URL and API key read from Vault)
    ↓
Caddy (TLS)  →  Centrifugo /api/publish
    ↓
mission:{mission_id}  (patient and assigned driver)
```

The dispatch path is:

```
Driver App
    ↓  device GPS fix (Expo Location) + 10 s presence heartbeat
set_driver_presence()  →  drivers.current_location (PostGIS geography), last_seen_at
    ↓
dispatch_next_wave()   (on booking, then from pg_cron dispatch_tick)
    ↓  eligibility: online, KYC-verified, matching AIS-125 type, heartbeat < 30 s,
    ↓  within the wave radius, not already asked for this mission, not on another active mission
dispatch_waves row  +  offer published to  driver:{driver_id}:offers
    ↓
accept_offer()  →  re-checks eligibility, TTL and the busy-driver invariant under row locks
    ↓
mission assigned (en_route), DRIVER_ACCEPTED event, other offers revoked
```

In both paths, authorisation and every important state change are decided server-side. The client applications render state and submit requests; they cannot write mission, dispatch, fare or driver-location rows directly.

### B. Dispatch Service and Mission State Machine

Earlier designs placed mission state in an application-level XState machine protected by distributed locks. In the implemented system, the authoritative state lives in the `missions` table and changes only through SECURITY DEFINER PostgreSQL functions. XState [19] is still used, but only on the clients, to model what each screen shows; on start-up or reconnection the clients reconcile their local machine against the server's persisted state.

The server-side lifecycle of a mission is:

requesting → en_route → on_scene → transporting → arrived_hospital → completed

with the following terminal and alternative paths:

- the patient may cancel while the mission is `requesting`, `en_route` or `on_scene` (`MISSION_CANCELLED`);
- the system cancels a request nobody accepted when its search window closes, or immediately if no eligible driver exists within any wave (`MISSION_CANCELLED`, reason `no_ambulance_available`);
- a driver who aborts before pickup releases the mission back to `requesting` and it is re-dispatched (`DRIVER_RELEASED`); an abort after pickup is recorded as a cancellation by the driver and releases the hospital bed hold.

Each accepted transition is written by a single internal function (`_record_event`) that inserts a row into `mission_events` with the next sequence number and sets the mission's `state_version` to that number, while the caller holds the mission row lock. The event types are `MISSION_REQUESTED`, `DRIVER_ACCEPTED`, `DRIVER_ARRIVED`, `TRANSPORT_STARTED`, `HOSPITAL_ARRIVED`, `MISSION_COMPLETED`, `MISSION_CANCELLED` and `DRIVER_RELEASED`. Requests that carry a client event identifier are idempotent: a retry returns the original result instead of creating a second event. Invalid transitions (for example completing a mission that is still `on_scene`) are refused with an error rather than silently ignored.

Concurrency control relies on PostgreSQL row locks rather than on Redis Redlock or advisory locks. Acceptance locks the mission row and then the driver's row; two acceptances by the same driver therefore run one after the other, and the second one sees the first assignment (Section V-E).

### C. Real-Time Geospatial Matching and Communication

Dispatch proceeds in expanding waves whose parameters are read from a single configuration function (`dispatch_config()`):

| Parameter | Value |
|---|---|
| Wave radii | 3 km, 6 km, 10 km |
| Offer time-to-live | 15 s |
| Wave window | 45 s |
| Search window (from creation) | 345 s |
| Driver presence freshness | 30 s |
| Driver heartbeat interval (app) | 10 s |
| Escalation scheduler (pg_cron) | every minute |

When a mission is created, `dispatch_next_wave()` selects the eligible drivers within 3 km, ordered by PostGIS distance, records them in a `dispatch_waves` row and publishes an offer to each driver's private channel `driver:{driver_id}:offers`. Wave 1 is created inside the same transaction as the mission. When the wave window closes without an acceptance, the next run of `dispatch_tick` revokes the old offers and opens the next wave. Drivers who were already asked for the mission are excluded from later waves, so each wave reaches new drivers only. Waves that find no eligible driver are recorded as empty and the search moves directly to the next radius.

After the third wave, two outcomes are possible. If at least one driver was asked, the request stays open until the search window closes, and nearby free drivers can still see it on the driver application's booking board. If nobody was eligible at any radius, the mission is cancelled immediately with the reason `no_ambulance_available`, inside the booking transaction itself.

Once a driver accepts, lifecycle events reach the patient on `mission:{mission_id}`, and while the mission is active the driver application publishes GPS pings to the same channel through the token service's publish proxy. The use of Centrifugo rather than Supabase Realtime follows from the connection and message limits of the latter [15]. Channel access is authorised per request: a patient can subscribe only to missions they are allowed to read under RLS, and a driver can subscribe only to their own offers channel.

### D. Data Model, Database Optimisation, and Security

Data persistence uses PostgreSQL with the PostGIS extension for spatial types and queries. The principal tables are `profiles`, `drivers`, `driver_vehicles`, `driver_documents`, `missions`, `mission_events`, `dispatch_waves`, `telemetry_logs`, `hospitals` (including held bed capacity), `jurisdictions` (the Delhi and Uttar Pradesh boundary polygons), consent records, erasure requests and driver push tokens. User data isolation is enforced inside the database using Row-Level Security (RLS):

- Patients can read only their own missions and mission events.
- Drivers can read only missions assigned to them; dispatch waves, telemetry logs and other drivers' rows are not readable.
- Clients have no direct write privilege on `missions` or `drivers`; all writes go through RPCs.
- Staff access to KYC data is granted by a separate staff role, checked inside the staff procedures and storage policies.

RLS policies wrap the identity lookup in a scalar subquery (`(select auth.uid())`), so PostgreSQL evaluates it once per query rather than once per row; Supabase's published benchmark reports a reduction from approximately 463 ms to 0.14 ms on a 500,000-row table for this pattern [14]. This figure is the vendor's measurement and was not reproduced in this project.

All RPCs that run with elevated rights are declared SECURITY DEFINER with a pinned, empty `search_path`, and internal helper functions are not executable by client roles. KYC documents are stored in a private Storage bucket; staff open them through short-lived signed URLs that Storage issues only if the staff read policy allows it.

TLS certificate pinning in the mobile clients and per-account limits on OTP requests, dispatch calls or mission creation are not implemented; rate limiting is currently applied per IP address at the gateway (Section III-A).

### E. Bilingual Mobile Application Integration

The platform includes two mobile applications, one for patients and one for drivers, both with full bilingual support in English and Hindi to serve users across Delhi and Uttar Pradesh. Interface strings, triage questions, fare disclosures and DPDP consent notices are externalised so that the language can be switched at run time.

## IV. Implementation

### A. Development Environment and Monorepo Tooling

The codebase is organised as a monorepo managed with Turborepo and the pnpm package manager. It contains the patient, driver and admin applications and shared packages, the most important of which is the TypeScript domain package. This package contains side-effect-free functions for triage, statutory pricing, dispatch helpers and the realtime wire contract, together with the client-side lifecycle machines. The database schema, RPCs and triggers are maintained as ordered Supabase migrations in the same repository, and the realtime infrastructure (Kong, Centrifugo, Redis, the token service and, for the demonstration deployment, Caddy) is defined with Docker Compose.

The triage function runs in the patient application, and the server records the resulting urgency tier and vehicle type as submitted; it does not re-run triage. The statutory pricing function, in contrast, exists in both places: the server recomputes the fare itself, and a schema test fails if the database tariff and the domain package's tariff diverge.

### B. Backend Services and Message Flow

The backend is not a set of separate application services. Its business logic is a set of PostgreSQL functions, among them `create_mission`, `accept_offer`, `decline_offer`, `claim_emergency`, `transition_mission`, `cancel_mission`, `confirm_receipt`, `set_driver_presence`, `ingest_telemetry`, the KYC submission and staff review functions, and the internal dispatch functions `dispatch_next_wave` and `dispatch_tick`. Asynchronous delivery is handled by two mechanisms inside the database:

- **pg_net:** the `publish_realtime()` function reads the Centrifugo API URL and key from Supabase Vault and sends an asynchronous HTTP request, so that a publishing problem never blocks or rolls back the state change that caused it. If the secrets are absent, the function returns without publishing.
- **pg_cron:** scheduled jobs run dispatch escalation, erasure processing and retention purging (Section III-A).

Driver push tokens are stored, and the driver application raises a local notification when an offer arrives while it is running. However, no server-side push delivery (FCM/APNS) or SMS gateway is implemented yet. A separate event bus, change-data-capture auditing, feature-flag management and an observability stack are likewise not implemented (only a stub tracing interface exists); secrets used by the database are held in Supabase Vault. The persisted, append-only `mission_events` table is the implemented audit trail for mission state.

### C. Clinical Triage and Pricing Engines

The triage engine is a deterministic pure function: given a structured set of caller-reported symptoms and indicators, it returns an urgency tier derived from START/ESI logic, and that tier determines the minimum ambulance care level. The patient application also offers an optional free-text description panel whose text is sent, through a server-side relay, to a large language model that suggests structured inputs; the deterministic function alone decides the tier and vehicle constraint. The triage engine is a decision-support aid, not a diagnostic system.

The pricing engine is a pure function of vehicle category and distance. For each AIS-125 category it applies a base fare that includes the first 5 km and a per-kilometre rate beyond it (for example ₹500 plus ₹25/km for Type D ALS, and ₹300 plus ₹15/km for Type C BLS). The jurisdiction only selects which statutory order is cited on the receipt. Surge pricing is excluded by a database constraint on the stored fare. The fare is computed at two points:

1. **Quote (at booking):** the patient application estimates a distance and the server prices it. The distance is the road distance from a fixed reference point per jurisdiction ("dispatch hub") to the pickup location, obtained from an OSRM routing request or, if that fails, from a straight-line estimate. The quote is labelled on screen as an estimate.
2. **Final fare (at completion):** the server measures the distance of the transport leg, from patient onboarding to hospital arrival, as the sum of segment lengths between the driver's logged GPS fixes. If fewer than two fixes fall within that window, it bills the quoted distance instead.

The source of the billed distance is recorded on the completion event as `distanceSource` (`measured` or `estimate`) and is shown on the patient's receipt. The receipt describes a distance as GPS-measured only when the server reports `measured`. Section V-G discusses the remaining limitations of this design.

### D. AIS-125 Ambulance Categorisation

Vehicle classification follows the Indian National Ambulance Code, Automotive Industry Standard AIS-125 (Part 1 and Part 2), published in August 2014 by the Automotive Research Association of India (ARAI) [6], [7]. AIS-125 designates road ambulances as Type A, B, C, and D. SAHAYAK-EMS maps these to internal care-level categories: Type A (Medical First Responder, "CAT 4"), Type B (Patient Transport Ambulance / PTA, "CAT 3"), Type C (Basic Life Support / BLS, "CAT 2"), and Type D (Advanced Life Support / ALS, "CAT 1"). The mapping is shown in both apps so that the patient knows the capability of the dispatched vehicle, and dispatch only offers a mission to drivers whose verified vehicle type matches the requested type.

### E. Driver Verification (KYC)

A driver becomes dispatchable only after a staff-reviewed KYC process. The driver submits an application (licence, licence expiry, EMT level and AIS-125 type), registers a vehicle and uploads the required documents (ARAI certificate, fitness permit and vehicle registration) into a private Storage bucket, then submits for review. Staff members use the admin portal to list applications, inspect documents through signed URLs, and approve, reject or revoke. Only an approved driver is marked verified, and `set_driver_presence` refuses to put an unverified driver online. Documents must be replaced before a rejected application can be resubmitted, and the regulated vehicle fields are locked after approval.

### F. Location and Telemetry Path

The driver application obtains location from the Expo Location API. A foreground watcher runs while the driver is online (balanced accuracy, about every 10 s or 50 m) and switches to high accuracy (about every 3 s or 5 m) during a mission. A background location task, which requires the separate background permission, continues publishing while the mission is en route, on scene or transporting. Each fix updates the application's current position, and two independent channels use it:

- **Presence:** every 10 s the application calls `set_driver_presence` with the last real fix. This updates the driver's PostGIS position and `last_seen_at`, and dispatch uses a driver only while that heartbeat is less than 30 s old. The heartbeat is sent only after the device has produced a real fix, so a placeholder location is never reported as the driver's position.
- **Mission telemetry:** during a mission, fixes are published to the patient over `mission:{id}` and are also uploaded in acknowledged batches through `ingest_telemetry` into `telemetry_logs`, which only the assigned driver can write while the mission is active. The buffered track is flushed before completion, because the final fare is computed from it.

The server validates coordinate ranges and the caller's identity and assignment. It does not currently use the reported accuracy of a fix, filter implausible tracks, or bound client-supplied timestamps to server time. Location freshness is represented only by the presence heartbeat; there is no separate timestamp for the last GPS fix.

### G. Data Residency and DPDP-Related Mechanisms

The Digital Personal Data Protection (DPDP) Act 2023 and its implementing Rules, notified via Gazette notification G.S.R. 846(E) dated 13 November 2025 by the Ministry of Electronics and Information Technology (MeitY) [24], guided several implemented mechanisms: purpose-specific consent records (`record_consent`), patient erasure requests (`request_erasure`), an hourly job that processes due erasure requests, and a daily purge of personal data from completed missions after a default 30-day retention period, while the statutory fare ledger is retained. Authentication uses Supabase Auth (GoTrue) with phone-OTP sign-in, suited to a mobile-first user base that may not rely on email. The implemented mechanisms support DPDP-oriented practices, but no formal compliance assessment was performed.

## V. Experimental Results and Evaluation

Because SAHAYAK-EMS is a software engineering project rather than a clinical trial, the evaluation focuses on technical properties that can be verified directly: correctness of the server-side rules, enforcement of authorisation, behaviour of dispatch and the mission lifecycle, and delivery of realtime events. All measurements reported below are single observations from specific test runs, not averages or guarantees.

### A. Evaluation Methodology

The system was built in successive implementation phases, and each phase was followed by the full regression set before the next phase began. Validation was organised in six levels:

1. **Functional implementation:** unit and integration tests of the domain package and of each application's service layer, run through Turborepo (`typecheck` and `test` for every package).
2. **Database-level validation:** behaviour suites written in SQL that run against a migrated local PostgreSQL instance. Each check is a query that raises an error on failure. The suites call the real RPCs under the `authenticated` or `anon` role with forged JWT claims, so RLS and privileges are exercised exactly as for a client. For this evaluation, every suite was run inside a single transaction that was rolled back, leaving the database unchanged.
3. **Security and authorisation validation:** negative tests inside the SQL suites and the end-to-end tests. They check that unauthenticated callers, the wrong patient, the wrong driver, unverified drivers and non-staff users are refused, and that expired or already-taken offers cannot be accepted.
4. **Realtime validation:** end-to-end tests that subscribe with the applications' own realtime client code and check that each persisted event arrives on the correct channel with the same identifier, sequence number and state as the stored row.
5. **End-to-end validation:** scripted scenarios with real authenticated sessions (throwaway users created for each run), real KYC approval, real presence heartbeats and the production pg_cron scheduler. These scenarios never insert waves, offers or events directly and never publish manually.
6. **Deployment and infrastructure validation:** static tests of the gateway and Centrifugo configuration, and a hosted scenario through the demonstration deployment (Section V-F).

### B. Automated Verification Results

Table I summarises the automated suites in the latest full regression run.

**TABLE I. Automated Verification Results**

| Test Category | Test Suite | Result |
|---|---|---|
| Functional (all packages) | Turborepo `typecheck` and `test` across the workspace packages | 12 / 12 tasks passed |
| Database behaviour: missions, dispatch, lifecycle, telemetry, fares | `mission_api.behaviour.sql` | 176 / 176 checks passed |
| Database behaviour: booking board, claim, profile lock, search window, busy-driver invariant | `driver_board.behaviour.sql` | 116 / 116 checks passed |
| Database behaviour: staff KYC review and document access | `kyc_admin.behaviour.sql` | 63 / 63 checks passed |
| Database behaviour: location writes, dispatch location, telemetry trust, fare source | `gps_fare.behaviour.sql` | 54 / 54 checks passed |
| Schema consistency (static) | `test:schema` (migration invariants, tariff parity, privilege checks) | Passed |
| Gateway and realtime configuration (static) | `test:gateway` (token service, publish proxy, Kong and Centrifugo configuration) | Passed |

### C. End-to-End Functional Validation

Table II lists the end-to-end scenarios. Unless stated otherwise, they ran against the local Supabase stack with the local Centrifugo and token service.

**TABLE II. End-to-End Functional Validation**

| Scenario | Actors | Expected Behaviour | Observed Result |
|---|---|---|---|
| Staff KYC review | Patient, driver, staff (real sessions) | Patient and driver refused; staff can list, inspect, approve, reject and revoke; resubmission requires replaced documents | Passed |
| Mission lifecycle (four missions) | Patient, verified driver, second patient, second driver | Full lifecycle to `completed`; patient cancel while `en_route`; driver abort before pickup returns the mission to `requesting`; driver abort after pickup cancels it and releases the bed hold | Passed; sequence numbers 1–6 contiguous; every event received by the patient |
| Server-side jurisdiction | Patient | Jurisdiction decided by the server from the boundary polygons, not by the client | Passed (`DL` returned for Delhi pickups) |
| Wave 2 escalation | Patient, drivers A and B | A receives wave 1 only; after the wave window the scheduler opens wave 2 for B; B accepts | Passed (Section V-D) |
| Wave 3, exhaustion and search window | Patient, drivers A, B, C | Waves 1–3 reach A, B, C respectively; after wave 3 the request stays open until the search window closes; then the system cancels it | Passed |
| No driver in range | Patient, driver 11 km away | Immediate system cancellation, no scheduler involvement | Passed |
| Offer decline | Driver | Decline is recorded as accepted but changes nothing; the driver can still accept the same offer | Passed (documented behaviour, see Section VI-D) |
| Busy driver | Patient, drivers X and Y | Driver on an active mission is not offered and cannot accept another mission | Failed before the fix; passed after (Section V-E) |
| Hosted scenario | Patient and driver with real phone OTP, staff | Real OTP sign-in, KYC through the gateway, one hosted mission, offer and acceptance delivered over the Oracle-hosted Centrifugo | Executed in phase G4.5-C (Section V-F) |

### D. Dispatch Experiment

The wave-2 escalation scenario used a pickup inside Delhi (28.5672 N, 77.2100 E). Driver A reported a position approximately 0.89 km from the pickup (inside wave 1) and driver B approximately 4.45 km away (outside wave 1, inside wave 2). Both drivers sent the application's 10 s presence heartbeat throughout. Driver A received the wave-1 offer and did not answer. Table III shows one observed run.

**TABLE III. Dispatch Experiment (single local run)**

| Parameter | Value | Observed Behaviour |
|---|---|---|
| Wave 1 radius / eligible drivers | 3 km / A | A received the offer 12 ms after the mission was created |
| Offer TTL | 15 s | A's own offer was refused as `offer_expired` after the TTL, although the wave was still open |
| Wave window | 45 s | The wave remained open for 30 s after the offer had expired, with no driver able to accept |
| Scheduler | pg_cron, every minute | The first `dispatch_tick` after the window closed ran 18.7 s later, at the start of the next minute |
| Wave 2 radius / eligible drivers | 6 km / B (A excluded as already asked) | B received the offer 39 ms after the scheduler run, 63.8 s after the mission was created |
| Acceptance | B accepts | The patient received `DRIVER_ACCEPTED` 9 ms after the request was sent |

The extended scenario added driver C at approximately 8.0 km. In one run, waves 2 and 3 opened 55.5 s and 115.5 s after creation. Each wave reached only its new driver, and the server's own distance calculation agreed with the independently computed great-circle distance to within 0.06 km. After wave 3 closed, the mission remained `requesting` with no active wave. It was then cancelled by the system with the reason `no_ambulance_available`. In three runs this cancellation occurred 402.2 s, 364.4 s and 355.5 s after creation. All three values lie within the expected range of the 345 s search window plus at most one scheduler interval.

The scheduler records confirmed the escalation cadence: the pg_cron job started at the beginning of every minute, and each escalated wave's creation time matched a scheduler run to within milliseconds. A code comment in the repository still describes a 5-second schedule; the configured and observed cadence is one minute. Consequently, the time from the end of a wave window to the next wave depends on where the window ends within the minute. In the observed runs it varied between 10.5 s and 57.2 s, and wave 2 opened between 55.5 s and 102.2 s after the mission was created.

These results describe specific driver positions on a single machine. They do not characterise dispatch under other driver distributions, real mobile networks or concurrent load.

### E. Security and Negative Validation

Security validation demonstrated that the following requests were refused by the server:

- unauthenticated calls to the mission, offer, presence and telemetry procedures;
- a patient requesting a realtime token for another patient's mission, or for a driver's offers channel;
- a driver requesting another driver's offers channel (HTTP 403 from the token service), or signed-out tokens;
- acceptance of an offer by a driver outside the wave, of an expired offer, of an offer already taken by another driver, and of any offer after the mission was cancelled or exhausted;
- a patient or an unverified driver attempting to set a driver position; invalid latitude or longitude values; and any direct write to the `drivers` or `missions` tables, including the fare fields;
- telemetry writes by anyone other than the driver assigned to the mission, and any client read of `telemetry_logs`;
- non-staff access to KYC applications and documents.

**Busy-driver defect and fix.** The end-to-end evaluation exposed a real dispatch safety defect. A driver who was already `en_route` on one mission was included in the next nearby mission's wave, received its offer, and could accept it, ending up assigned to two active missions. The cause was that neither the eligibility query nor `accept_offer` applied the existing rule `_driver_on_mission` (a driver holds a mission from acceptance until it is completed or cancelled), which only the booking-board claim procedure used. The fix added this rule to both paths:
- a busy driver is not asked and does not use up a wave;
- `accept_offer` refuses a busy driver with `already_on_mission`, after locking the driver's row in the same order as the board claim.

The fix was verified in three ways:
- **Before and after:** an SQL test that failed before the change and passed after it.
- **Two concurrent database sessions** in which the same driver accepted two offers:
  - On the old code, both acceptances committed.
  - On the new code, the second session waited on the first session's lock and was then refused. The second mission was left unchanged.
- **End-to-end scenarios:** the busy driver received no offer; an offer issued while the driver was free was refused after the driver accepted another mission; and the other driver could still accept it.

This guarantee relies on PostgreSQL's default READ COMMITTED isolation level, under which each statement sees the latest committed data; other isolation levels were not tested.

### F. Realtime and Infrastructure Validation

**TABLE IV. Realtime Validation (local runs)**

| Event | Source | Transport | Observed Result |
|---|---|---|---|
| Dispatch offer | `dispatch_next_wave` | pg_net → Centrifugo → `driver:{id}:offers` | Delivered to exactly the drivers in the wave; received 12–39 ms after creation in the dispatch runs, and 24–986 ms in the lifecycle runs |
| Offer revocation | `dispatch_tick`, acceptance | pg_net → Centrifugo → `driver:{id}:offers` | Previously asked drivers received `offer_revoked` (`expired` or `taken`) |
| `DRIVER_ACCEPTED` | `accept_offer` → `mission_events` trigger | pg_net → Centrifugo → `mission:{id}` | Payload identical to the stored event; received 9–10 ms after acceptance in two runs and about 860 ms in others |
| Lifecycle events (`DRIVER_ARRIVED` … `MISSION_COMPLETED`) | `transition_mission` | pg_net → Centrifugo → `mission:{id}` | RPCs completed in 3–12 ms; the patient received each event about 850–990 ms after the RPC |
| System cancellation | `dispatch_tick` (search window) | pg_net → Centrifugo → `mission:{id}` | Received 14–44 ms after the event was stored (three runs) |
| Instant cancellation (nobody in range) | `create_mission` | pg_net | Published before the client knows the mission identifier, so it is not observable in real time; the patient application recovers it by replaying events after sequence 1 |

The variation between delivery times of about 10–45 ms and about 850–990 ms was consistent across runs but was not investigated further. A plausible explanation is the asynchronous, batched processing of pg_net's request queue, but this was not isolated experimentally.

**Hosted and deployment validation.** A demonstration deployment for the university Project-Based Learning (PBL) evaluation runs on an Oracle Cloud virtual machine:
- Caddy terminates TLS (HTTPS/WSS) and forwards to Kong, the token service and Centrifugo with Redis.
- Kong and Centrifugo are reachable only through Caddy.
- Only the Centrifugo publish endpoint is exposed, for the hosted database.
- The hosted Supabase project's `publish_realtime()` sends events through pg_net to this endpoint.

The repository describes this deployment as temporary and distinct from production. In phase G4.5-C, a hosted scenario exercised the whole path. It used real phone-OTP sign-in with Supabase test phone numbers, KYC submission through the gateway with staff approval, one real hosted mission with server-side jurisdiction, the offer and the `DRIVER_ACCEPTED` event delivered over the Oracle-hosted Centrifugo, negative channel checks, and a final patient cancellation. A separate hosted phone-authentication test covered patient and driver sign-in, role verification and sign-out. *[Author's note: the timing figures of the hosted runs are recorded in the hosted run logs (phone authentication and G4.5-C), which are not stored in the repository; insert them here from those logs. No hosted timing is claimed in this version.]*

### G. Location and Fare Audit

The location path was audited separately (phase G4.7-C), with the following results:

- **Server side:** the SQL suite confirmed that only the authenticated driver can write their own position and that invalid coordinates are refused. Dispatch uses the stored PostGIS position only while the heartbeat is fresh, a driver's moved position changes eligibility at the next evaluation, and mission telemetry never changes the dispatch position.
- **Client defect found and fixed:** development builds could send a hard-coded city location as the driver's position before the first real fix. The fix was confirmed by a unit test that failed before the change.
- **Physical device:** no physical Android or iOS device was available, so device GPS accuracy, permission handling on real hardware and background tracking were **not** verified. All coordinates in the tests were supplied through the authenticated RPCs.

The fare audit confirmed that the quote and the final fare are computed by the server and cannot be written by clients. It also identified the following limitations:

- The quote measures the road distance from a fixed reference point to the pickup, which is a different leg from the transport leg that the final fare is meant to measure. For distant pickups the difference is large. For a pickup in Lucknow, the patient application's own estimate was 525.5 km from the Uttar Pradesh reference point near Noida, giving an ALS quote of ₹13,513.
- When the transport leg has fewer than two logged fixes, the final fare uses the quoted distance. The only end-to-end lifecycle run that reached completion took this fallback path, because the test driver sent no telemetry. The measured path was validated only in the SQL suite, with a synthetic 11.1 km track.
- The onboarding and arrival times that bound the measured window, and the telemetry timestamps, are supplied by the driver application and are not checked against server time.

The billing rule itself was kept unchanged, as it follows the project's documented contract. The implementation now records the source of the billed distance on the completion event and shows it on the patient receipt, so a fallback amount can no longer be presented as a measured one. The SQL suites and the lifecycle test confirm that the source (`measured` or `estimate`) is stored and delivered over the realtime channel.

### H. Summary of Findings and Limitations

The evaluation confirmed the server-side rules, the authorisation checks and the realtime delivery path under the tested scenarios. The end-to-end tests also found two real defects, the double assignment of busy drivers and the placeholder location in development builds, and both were fixed and covered by regression tests. The evaluation did not include:
- physical-device GPS;
- load or concurrency testing beyond two sessions;
- real mobile networks;
- a representative dataset of drivers, patients or emergencies;
- field deployment.

The latency values in this section are individual observations on a local machine, not performance guarantees.

## VI. Discussion

### A. Architectural Trade-offs: Database-Centred Logic vs. Application Services

The earlier design proposed a modular monolith with separate dispatch, pricing and notification services. The implemented system goes further in the same direction: the business rules live in PostgreSQL functions next to the data they protect. This has three practical advantages for a small team.
- **One authority:** mission state, dispatch and fare decisions are made in one transaction, under one set of row locks and one authorisation model (RLS plus function-level checks). A modified client cannot bypass them.
- **One audit trail:** the append-only `mission_events` table serves as both the audit trail and the source of realtime messages, so what the patient sees is always a stored fact.
- **Direct testability:** SQL behaviour suites can test the rules without any application server.

The cost is that the logic is written in PL/pgSQL, which is harder to structure and review than application code, and that some rules are duplicated between the domain package and the database. The project handles one such duplication, the tariff, with an automated parity test.

### B. Backend-as-a-Service (BaaS) Integration and Vendor Lock-In

Using Supabase as a BaaS provider accelerated development by providing identity management, PostgreSQL, Storage and Vault. The dependency is smaller than it may appear, because the core logic is ordinary PostgreSQL (functions, RLS, PostGIS, pg_cron, pg_net) and the realtime layer is a separate, self-hostable Centrifugo deployment. Moving to a self-hosted PostgreSQL and GoTrue installation would therefore mainly require infrastructure work, although this migration was not tested.

### C. Rural Connectivity and Offline Operational Constraints

Weak or intermittent cellular coverage is common in rural areas of Uttar Pradesh. The current architecture relies on active HTTP and WebSocket connections for booking and dispatch. The driver application already buffers telemetry and retries uploads that fail. However, a patient without connectivity cannot create a mission, and an offer can be missed during a disconnection. Offline-first mechanisms, such as SMS-based requests, remain future work.

### D. Evaluation and System Limitations

The evaluation shows that the server-side rules behave as intended in the tested scenarios, but several limitations remain:

- **Dispatch cadence:** escalation depends on a once-per-minute scheduler, so the delay between the end of one wave window and the next wave varies with where the window ends within the minute (between 10.5 s and 57.2 s in the observed runs, and up to 60 s in principle). A declined offer does not speed up escalation, because a decline is not recorded.
- **Location quality:** fix accuracy is not used, implausible tracks are not filtered, and location freshness is inferred from the heartbeat. If a device stops producing fixes, the application continues to report the last known position as current.
- **Fare semantics:** the fallback to the quoted distance and the driver-supplied billing window mean that the final fare is not always based on measured transport distance. The source of the billed distance is now shown to the patient, but the underlying billing rule is unchanged.
- **Triage:** the triage result is computed on the patient's device and submitted as the requested urgency and vehicle type; the server does not recompute it. The triage function remains a decision-support aid, not a replacement for clinical personnel.
- **Crew qualifications:** vehicle categorisation follows AIS-125, but the platform does not verify crew qualification standards beyond the EMT level declared during KYC.
- **Evidence base:** there was no load testing, no physical-device testing and no field deployment, and there is no representative real-world dataset. No claim is made about production-wide performance.

### E. Synthesis and Practical Significance

The work shows that a small team can build a dispatch platform whose critical decisions are enforced server-side and whose behaviour can be checked by automated tests at the database, realtime and end-to-end levels. The testing process was itself informative: the busy-driver defect was found by an end-to-end test that deliberately looked for it, not by unit tests, and it was then fixed at the database level where it could not be bypassed. The remaining gaps are clearly defined and are listed as future work.

## VII. Conclusion and Future Work

### A. Conclusion

This paper presented SAHAYAK-EMS, an event-driven emergency ambulance dispatch platform for Delhi and Uttar Pradesh, as it is currently implemented. The evaluation demonstrated:
- real authenticated patients, drivers and staff, including phone-OTP sign-in on the hosted project;
- driver onboarding with staff-reviewed KYC and protected document access;
- server-side jurisdiction resolution from boundary polygons;
- wave-based dispatch over verified, present drivers, including escalation to the second and third waves and the search-window cancellation;
- the complete server-controlled mission lifecycle with cancellation and abort paths, persisted as sequenced events;
- realtime delivery of offers and lifecycle events to the correct authorised channels;
- a server-side invariant that prevents busy drivers from being assigned a second mission;
- hosted operation through Supabase, pg_net and an Oracle Cloud deployment of Kong and Centrifugo.

The automated regression passed in full (Table I).

At the same time, the platform is not yet production-ready. Physical-device GPS has not been verified. The final fare can still be based on the quoted estimate when telemetry is insufficient. Dispatch escalation depends on a one-minute scheduler. The system has not been load tested or used in the field. The results show that the architecture works as designed in controlled scenarios; they do not establish its performance or reliability in real emergencies.

### B. Future Work

The following items are unresolved and are planned; none of them is implemented in the current system:

- **Physical-device GPS validation:** testing foreground and background location, permissions and accuracy on real Android and iOS devices.
- **Location freshness and quality:** a separate timestamp for the last GPS fix, use of the reported fix accuracy, and plausibility checks on telemetry tracks.
- **Final-fare integrity:** a decision on how to bill when the transport-leg track is insufficient, and bounding driver-supplied timestamps to server time. Both depend on the applicable statutory tariff rules.
- **Dispatch cadence:** a scheduler with a shorter interval than one minute, so that escalation follows the 45 s wave window more closely, and a decision on whether an explicit decline should speed up escalation.
- **Broader dispatch validation:** more driver distributions, concurrent missions and repeated runs for waves 3 and exhaustion.
- **Load and performance testing:** measurements of dispatch, realtime delivery and database behaviour under concurrent load, including the cause of the observed realtime delivery variation.
- **Notifications and offline operation:** server-side push notification delivery for offers, and SMS fallback for areas with weak connectivity.
- **Observability:** production-scale monitoring, logging and alerting (currently only a stub interface exists).
- **Field validation:** a supervised pilot with real drivers and hospitals, with appropriate ethical approval.
- **Public EMS integration and multi-state expansion:** interfacing with the 108 system, and adding jurisdictions through the boundary table and tariff function.

## Acknowledgements

The authors thank the faculty of the Department of Computer Science and Engineering at the Sharda School of Engineering and Technology (SSET), Sharda University, Greater Noida, for their supervision and guidance, and gratefully acknowledge the Project-Based Learning (PBL) framework under which this work was carried out.

## References

[1] Ministry of Road Transport and Highways, Government of India, "Road Accidents in India 2023," New Delhi, India, Tech. Rep., 2025.

[2] P. M. U. D. Dar, S. Kaur, A. K. Katiyar, P. Priyadarshani, S. Kumar, A. Gupta, and S. Sagar, "Prehospital care: Lessons learned from 311 mortalities at a level I trauma center," Chin. J. Traumatol., Feb. 2025, doi: 10.1016/j.cjtee.2025.02.011.

[3] N. Roy et al., "Learning from 2523 trauma deaths in India—Opportunities to prevent in-hospital deaths," BMC Health Serv. Res., vol. 17, no. 1, p. 172, 2017.

[4] University of Maryland Medical Center, "History of the Shock Trauma Center: R Adams Cowley and the Golden Hour." Accessed: Sep. 17, 2026. [Online]. Available: https://www.umms.org/ummc/health-services/shock-trauma/about/history

[5] GVK Emergency Management and Research Institute (EMRI), "108 Emergency Response Service." Accessed: Sep. 17, 2026. [Online]. Available: https://www.emri.in/

[6] Automotive Research Association of India (ARAI), "Automotive Industry Standard AIS-125 (Part 1): National Ambulance Code," ARAI, Pune, India, Standard AIS-125-1, Aug. 2014. [Online]. Available: https://law.resource.org/pub/in/bis/ais/arai.in.ais.125-1.2014.pdf

[7] Automotive Research Association of India (ARAI), "Automotive Industry Standard AIS-125 (Part 2): Medical Equipment for Road Ambulances," ARAI, Pune, India, Standard AIS-125-2, Aug. 2014. [Online]. Available: https://law.resource.org/pub/in/bis/ais/arai.in.ais.125-2.2014.pdf

[8] Elsevier, "Simple Triage and Rapid Treatment (START)," ScienceDirect Topics. Accessed: Sep. 17, 2026. [Online]. Available: https://www.sciencedirect.com/topics/medicine-and-dentistry/simple-triage-and-rapid-treatment

[9] Agency for Healthcare Research and Quality (AHRQ), "Emergency Severity Index (ESI): A Triage Tool for Emergency Departments," Version 4 Implementation Handbook, AHRQ, Rockville, MD, USA, 2023. [Online]. Available: https://www.ahrq.gov/patient-safety/settings/emergency-dept/esi.html

[10] "Manchester Triage System: Effectiveness, limitations, and global implementation—A structured narrative review," PMC. Accessed: Sep. 17, 2026. [Online]. Available: https://pmc.ncbi.nlm.nih.gov/articles/PMC13512649/

[11] I. Brodsky, "H3: Uber's Hexagonal Hierarchical Spatial Index," Uber Engineering Blog, 2018. Accessed: Sep. 17, 2026. [Online]. Available: https://www.uber.com/blog/h3/

[12] Redis, "Redis Geospatial (GEOADD, GEOSEARCH)." Accessed: Sep. 17, 2026. [Online]. Available: https://redis.io/docs/latest/develop/data-types/geospatial/

[13] P. Ramsey et al., "A deep dive into PostGIS nearest neighbor search," Crunchy Data Blog. Accessed: Sep. 17, 2026. [Online]. Available: https://www.crunchydata.com/blog/a-deep-dive-into-postgis-nearest-neighbor-search

[14] Supabase, "Row Level Security—Performance and best practices," GitHub Discussion #14576. Accessed: Sep. 17, 2026. [Online]. Available: https://github.com/orgs/supabase/discussions/14576

[15] Supabase, "Realtime limits." Accessed: Sep. 17, 2026. [Online]. Available: https://supabase.com/docs/guides/realtime/limits

[16] Cloud Native Computing Foundation, "CloudEvents Specification v1.0.2," CNCF, 2021. [Online]. Available: https://github.com/cloudevents/spec

[17] Cloud Native Computing Foundation, "NATS protocol binding for CloudEvents." Accessed: Sep. 17, 2026. [Online]. Available: https://github.com/cloudevents/spec/blob/main/cloudevents/bindings/nats-protocol-binding.md

[18] Kong Inc., "Kong Gateway (Open Source API Gateway) Documentation." Accessed: Sep. 17, 2026. [Online]. Available: https://docs.konghq.com/gateway/

[19] D. Khourshid, "XState: State machines and statecharts for JavaScript." Accessed: Sep. 17, 2026. [Online]. Available: https://stately.ai/docs/xstate

[20] Cloudflare, "Web Application Firewall (WAF) and DDoS protection documentation." Accessed: Sep. 17, 2026. [Online]. Available: https://developers.cloudflare.com/waf/

[21] Cloudflare, "Turnstile documentation." Accessed: Sep. 17, 2026. [Online]. Available: https://developers.cloudflare.com/turnstile/

[22] Cloud Native Computing Foundation, "OpenTelemetry: Vendor-neutral observability framework." Accessed: Sep. 17, 2026. [Online]. Available: https://opentelemetry.io/

[23] Debezium Community, "Debezium user guide: Change data capture." Accessed: Sep. 17, 2026. [Online]. Available: https://debezium.io/documentation/

[24] Ministry of Electronics and Information Technology (MeitY), Government of India, Digital Personal Data Protection Act, 2023 and Digital Personal Data Protection Rules, 2025, Gazette Notification G.S.R. 846(E), Nov. 13, 2025.

<!--
Editorial notes (not part of the paper):
- Removed from the previous (PDF) version because they are not implemented: Cloudflare WAF/Turnstile edge, Kong in AWS
  ap-south-1, Fastify core, NATS JetStream + CloudEvents, Debezium/ClickHouse audit log, OpenTelemetry/Grafana, Sentry,
  Unleash, HashiCorp Vault/Infisical, Singapore read replica, TLS certificate pinning, per-account rate limits (5 OTP /
  10 dispatch / 3 missions per minute), Redis GEOSEARCH dispatch, Redis Redlock + advisory locks, FCM/APNS/MSG91/Twilio
  delivery, server-side triage, the SLO table (unmeasured targets) and the 391/391 test figure (not traceable to any suite).
- If an architecture figure exists in the PDF/Google Doc, redraw it to match Section III-A (Clients -> Caddy -> Kong ->
  Supabase; pg_net -> Centrifugo (+Redis) via Caddy; token service; pg_cron).
- Test counts: mission_api grew 175 -> 176 and the GPS/fare suite 52 -> 54 when fare-source checks were added.
- References [16], [17], [20]-[23] described components that are not implemented (CloudEvents/NATS, Cloudflare WAF/Turnstile,
  OpenTelemetry, Debezium) and are no longer cited in the text. Remove them before submission and renumber, or keep them only
  if a related-work sentence is added that cites them.
- Citations are still needed for: Centrifugo, pg_net, pg_cron, Supabase Vault, Caddy, Expo Location, OSRM and Oracle Cloud
  Infrastructure. They are not in the original reference list and have not been added here.
- Insert the hosted phone-authentication / G4.5-C timing figures in Section V-F from the run logs, or leave the section without numbers.
-->
