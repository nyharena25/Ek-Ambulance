# 5. System Architecture

## 5.1 Architectural Drivers and Style

The architecture follows from quality attributes Q1–Q9 (§3.2) and challenges C1–C7 (§2.3). Its style can be summarised
in four rules, which hold throughout the code base.

1. **Server authority.** The database is the only component that decides. Clients *request* (call an RPC) and
   *render* (show server state). A modified client can call procedures but cannot write mission, dispatch, fare or
   location rows directly.
2. **Event-carried state transfer.** Every accepted state change appends one row to an ordered, append-only event log.
   The realtime message is a projection of that stored row, so a client never sees a transition that did not commit
   [@fowlerES; @hohpe2003].
3. **Functional core, imperative shell.** Pure logic is separated from framework code. In `@sahayak/domain` and in every
   `*.core.ts` file it has no I/O, so it runs in Node tests. React Native, Expo and Supabase wrappers form a thin shell
   around it, and stores receive server access through an injected adapter. This is a ports-and-adapters arrangement
   [@cockburnHex].
4. **Reconcile, don't trust the wire.** Realtime delivery is an optimisation. Correctness comes from sequence numbers
   and snapshot reads, so a lost or duplicated message is detected and repaired (§6.8).

## 5.2 Logical Architecture and Trust Boundary

```
 UNTRUSTED                                    │ TRUSTED (server side)
                                              │
 Patient app ─┐   HTTPS (JWT)   ┌────────────┐│  ┌──────────────────────── PostgreSQL 17 (Supabase) ───────┐
 Driver app ──┼────────────────►│ Kong 3.9   ││  │ PostgREST → RPCs (SECURITY DEFINER, search_path='')      │
 Staff console┘                 │ DB-less    │├─►│ RLS + column privileges   PostGIS   pg_cron (5 s tick)   │
      │  ▲                      │ rate limits││  │ missions · dispatch_waves · mission_events (append-only) │
      │  │ WSS (HMAC JWT)       └─────┬──────┘│  │ trigger → publish_realtime() → pg_net (async HTTP)       │
      │  │                            │       │  └───────────────────────────────┬─────────────────────────┘
      │  │                    /realtime/token │                                  │ HTTP /api/publish (API key)
      │  │                            ▼       │                                  ▼
      │  │                    ┌──────────────┐│       ┌──────────────────────────────────────────┐
      │  └────────────────────│ token service ││──────►│ Centrifugo v5  (engine: Redis 7)          │
      └──────── subscribe ───►│ (mock-gateway)││ proxy │ mission:{id}   driver:{id}:offers         │
            GPS publish ─────►│ publish proxy ││◄──────│ history + recovery                        │
                              └──────────────┘│       └──────────────────────────────────────────┘
```

The trust boundary runs between the clients and everything to their right. Three properties hold at the boundary.
**Authentication**: every request carries a Supabase-issued JWT [@rfc7519], and realtime connections carry a short-lived
Centrifugo token minted only after that JWT is verified (strict mode). **Authorisation**: decisions are taken by RLS and
by checks inside procedures, never by the gateway alone. **Integrity**: clients hold no write privilege on authoritative
tables. Figure 8.1 gives the deployment-level view in draw.io form.

## 5.3 Deployment Views

| Environment | Database and auth | Gateway and realtime | Purpose |
|---|---|---|---|
| Local development | Supabase CLI stack (`supabase start`, port 54321) or the hosted project | `docker compose`: Kong :8000, Centrifugo :8001, Redis :6379, token service, `AUTH_MODE=dev` | Development, SQL behaviour suites, local end-to-end tests |
| Demonstration (university PBL) | Hosted Supabase project, AWS Mumbai `ap-south-1` | Oracle Cloud VM: Caddy (TLS) → Kong, token service, Centrifugo + Redis; `AUTH_MODE=strict` | Hosted end-to-end scenario with real phone OTP |
| Production (target) | Hosted Supabase in `ap-south-1` | Same images, `docker-compose.prod.yml` (strict mode, secure Centrifugo config, restricted origins) | Not yet deployed |

`docker-compose.prod.yml` refuses to start in a permissive configuration, and the secure Centrifugo configuration
disables anonymous connections and client publishing except through the proxy. Both properties are asserted by
`pnpm test:gateway`.

## 5.4 Component Responsibilities

| Component | Responsibility | Must never |
|---|---|---|
| `apps/patient` | Triage UI, pickup, quote display, booking RPC, tracking, receipt, consent and erasure requests | Decide jurisdiction, fare or assignment; publish lifecycle events |
| `apps/driver` | Presence heartbeat, GPS (foreground and background), offers, acceptance, mission transitions, telemetry upload, KYC | Write its own location row directly; accept outside a wave; hold two missions |
| `apps/admin` | KYC queue, document inspection via signed URLs, approve, reject and revoke, activity history | Hold a service-role key (the dev server refuses to start with one) |
| `@sahayak/domain` | Triage, tariff, dispatch constants, wire parsers, transition table, lifecycle statecharts, realtime health | Import React, React Native, storage or network code |
| `@sahayak/ui` | Design tokens | Contain components or logic |
| PostgreSQL functions | Every business decision; event append; offer publication; scheduled escalation and purges | Trust client-supplied identity, time or role |
| Token service (`docker/mock-gateway`) | Verify JWT, authorise channel scope through RLS, mint Centrifugo tokens, authorise GPS publications, relay triage text to the LLM | Issue publish capability to clients (strict mode) |
| Centrifugo + Redis | Fan-out, per-channel history, recovery | Be the source of truth |
| Kong | Route allow-list, per-IP rate limiting, CORS | Make authorisation decisions about data |

## 5.5 Data Model

### 5.5.1 Entities

The schema has 13 tables. Figure 8.5 gives the entity-relationship diagram. The principal entities and their invariants
are listed below.

| Table | Key columns (abridged) | Invariants and notes |
|---|---|---|
| `profiles` | `id` (= auth user), `role` (patient/driver/staff), `full_name`, `phone`, `preferred_language`, `dpdp_consent_at`, `anonymised_at` | Role comes only from GoTrue `app_metadata`. Users cannot edit `role`. `full_name` ≤ 100 chars. |
| `drivers` | `id`, `ais125_type`, `emt_level`, `dl_expiry`, `is_verified`, `kyc_status`, `kyc_reviewed_by`, `is_online`, `current_location geography(Point)`, `last_seen_at`, `location_fixed_at`, `service_zone`, `hospital_id` | No client write privilege on dispatch columns. Presence only through `set_driver_presence`. Partial GiST index on `current_location WHERE is_online`. |
| `driver_vehicles` | `driver_id`, `registration_number`, `make_model`, `color`, `crew_count`, `equipment_attested`, `is_active` | Unique on the normalised plate (upper case, spaces and hyphens removed). One active vehicle per driver. |
| `driver_documents` | `driver_id`, `slot`, `storage_path`, `mime_type`, `size_bytes`, `status`, `rejection_reason` | ARAI certificate, fitness permit and registration. Objects live in a private bucket. A review resets when a document is replaced. |
| `missions` | `id`, `display_ref`, `patient_id`, `driver_id`, `status`, `urgency`, `vehicle_type`, `jurisdiction`, `pickup_location`, `pickup_address`, `triage`, `distance_km`, `fare_details jsonb`, `final_fare_inr`, `state_version`, `idempotency_key`, `dispatch_round`, `search_started_at`, `accepted_at`, `onboard_at`, `arrived_hospital_at`, `completed_at`, `cancelled_by`, `destination_hospital_id`, `personal_data_purged_at` | `status` changes only through `_record_event`. Partial unique index: at most one active mission per driver. CHECK: `surgeMultiplier = 1.0` and `surgeGougingAmountInr = 0`. `patient_id` is `ON DELETE RESTRICT` because the fare record is statutory. |
| `mission_events` | `id`, `mission_id`, `seq`, `event_type`, `from_status`, `to_status`, `triggered_by`, `actor_role`, `metadata`, `client_event_id`, `created_at` | Append-only (UPDATE and DELETE raise). `(mission_id, seq)` gap-free. An AFTER INSERT trigger publishes. `triggered_by` is `ON DELETE SET NULL`, so erasure never deletes audit rows. |
| `dispatch_waves` | `id` (= offer id), `mission_id`, `round`, `wave_number` (1..3), `radius_km`, `eligible_driver_ids uuid[]`, `declined_driver_ids uuid[]`, `status` (broadcasting/accepted/expired/exhausted), `expires_at`, `accepted_by` | Not readable by clients. One row per wave per dispatch round. |
| `telemetry_logs` | `mission_id`, `driver_id`, `location`, `speed`, `heading`, `accuracy_m`, `recorded_at`, `dead_zone` | Written only by the assigned driver while the mission is active. Not client-readable. Deduplicated. |
| `hospitals` | `id`, `name`, `zone`, `location`, `trauma_level`, `total_capacity`, `held_capacity`, `available_capacity`, `is_active` | GiST on `location`. A bed hold is released on abort or cancellation. |
| `jurisdictions` | `zone` (`DL`, `UP`), `name`, `boundary`, `statutory_order_ref`, `tariff_version` | Server-side point-in-polygon with a GiST index. Boundaries from geoBoundaries ADM1 (CC BY 2.5 IN). |
| `consent_records` | `user_id`, `purpose`, `notice_version`, `granted`, `granted_at`, `withdrawn_at`, `locale` | Purpose-specific DPDP consent [@dpdp2023]. |
| `erasure_requests` | `user_id`, `mission_id`, `scope`, `status`, `requested_at`, `due_at`, `completed_at` | Processed hourly by `process_erasure_requests()`. |
| `driver_push_tokens` | `driver_id`, `platform`, `token` | Stored. Server-side push delivery is not yet implemented. |

Enumerations: `mission_status` (`requesting`, `matched`, `en_route`, `on_scene`, `transporting`, `arrived_hospital`,
`completed`, `cancelled`), `urgency_tier` (`CAT_1_IMMEDIATE`, `CAT_2_URGENT`, `CAT_3_DELAYED`), `ais125_vehicle_type`
(`TYPE_A_MFR`, `TYPE_B_PTA`, `TYPE_C_BLS`, `TYPE_D_ALS`) and `jurisdiction_zone` (`DL`, `UP`). The status `matched` is
retained for compatibility but is not produced by the current procedures.

### 5.5.2 Indexing strategy

Indexes exist only where a named query reads them. The performance migration removed four indexes that had a write cost
on hot paths and no reader, and it documented each removal.

| Index | Serves |
|---|---|
| `idx_drivers_online_location` GiST on `drivers(current_location) WHERE is_online` | Wave candidate search, board fallback check |
| `idx_hospitals_location` GiST | Nearest-hospital selection |
| `idx_jurisdictions_boundary` GiST | Point-in-polygon jurisdiction resolution in `create_mission` |
| `idx_dispatch_waves_open` (partial, open waves) | `dispatch_tick`'s scan for expired broadcasting waves |
| `missions_one_active_per_driver` UNIQUE partial on `missions(driver_id) WHERE status IN (active statuses)` | The one-active-mission invariant (§6.5) |
| `idx_missions_patient_id (patient_id, created_at DESC)` | Patient history, RLS predicate, per-account rate limit |
| `idx_mission_events_mission_seq (mission_id, seq)` | Gap detection, replay after a given sequence |
| `idx_telemetry_dedupe` | Telemetry deduplication, the fare's measured-leg query, retention purge |

## 5.6 API Design

### 5.6.1 Style

The API is a set of *commands* exposed as PostgreSQL functions through PostgREST
(`POST /rest/v1/rpc/<name>`), plus row reads that RLS filters. Each command validates the caller (`auth.uid()` evaluated
once per statement as `(select auth.uid())`, the pattern that avoids per-row re-evaluation [@supabaseRls]), validates
its input, takes the locks it needs in a fixed order, changes state, appends an event and returns a JSON result. Errors
are raised by `_fail(code, sqlstate)` with a stable machine-readable `code` and a PostgREST status class (`PT401`,
`PT403`, `PT404`, `PT409`, `PT422`, `PT429`). The domain package maps them to typed client errors (`mapRpcError`).

### 5.6.2 Command catalogue

| RPC | Caller | Purpose | Idempotency | Representative errors |
|---|---|---|---|---|
| `create_mission` | patient | Validate triage and pickup, resolve jurisdiction from polygons, quote fare, insert mission, append `MISSION_REQUESTED`, open wave 1 | `idempotency_key` (replay returns the original) | `out_of_zone`, `invalid_triage`, `active_mission_exists`, `too_many_requests` |
| `accept_offer` | driver | Exclusive assignment from a pushed offer | `client_event_id` | `offer_taken`, `offer_expired`, `offer_declined`, `already_on_mission`, `not_eligible`, `mission_cancelled` |
| `decline_offer` | driver | Record decline; open next wave if all declined | natural (set union) | `offer_not_found` |
| `claim_emergency` | driver | Take a request from the Booking board | `client_event_id` | `not_in_range`, `already_on_mission` |
| `list_nearby_emergencies` | driver | The caller's board (bands, oldest first, server time) | read | — |
| `list_open_offers` | driver | Re-read open offers after a socket outage | read | — |
| `transition_mission` | driver | `DRIVER_ARRIVED`, `TRANSPORT_STARTED`, `HOSPITAL_ARRIVED`, `MISSION_COMPLETED`, `DRIVER_RELEASED` | `client_event_id` | `invalid_transition`, `handoff_incomplete`, `invalid_vitals` |
| `cancel_mission` | patient, driver | Cancel with reason (patient until pickup) | `client_event_id` | `invalid_transition`, `reason_required` |
| `confirm_receipt` | patient | Acknowledge receipt or raise a dispute flag | natural | — |
| `set_driver_presence` | driver | Online/offline, position and fix age | natural | `not_verified`, `invalid_location` |
| `ingest_telemetry` | driver | Batch GPS track (≤ 1000 pings) | dedupe index | `invalid_batch`, `not_found` |
| `submit_kyc`, `upsert_driver_application`, `update_driver_profile` | driver | KYC and profile | natural | `documents_missing`, `kyc_locked`, `profile_locked`, `registration_in_use` |
| `staff_list_kyc_applications`, `staff_get_kyc_application`, `staff_approve_kyc`, `staff_reject_kyc`, `staff_driver_activity`, `staff_driver_missions` | staff | Review and history | natural | `not_staff`, `cannot_review_own_application` |
| `record_consent`, `request_erasure` | any user | DPDP mechanisms | natural | `invalid_consent` |
| `dispatch_tick`, `process_erasure_requests`, `purge_expired_personal_data` | pg_cron only | Scheduled jobs | n/a | — |

### 5.6.3 Realtime wire contract

| Channel | Publisher | Messages | Authorisation |
|---|---|---|---|
| `mission:{uuid}` | database (lifecycle); assigned driver (GPS, through the publish proxy) | `lifecycle` v1 envelope `{v, type, event, eventId, seq, missionId, driverId, state, timestamp, data}`; `telemetry` `{latitude, longitude, heading?, speed?, accuracy?, timestamp, deadZone?}` | Subscription token minted only if the caller can read the mission under RLS. Publication admitted only for the assigned driver in an active status. |
| `driver:{uuid}:offers` | database | `offer` `{offerId, missionId, waveNumber, issuedAt, expiresAt, urgency, requiredVehicleType, jurisdiction, pickup, distanceKm, estimatedFareInr, patientSummary}`; `offer_revoked` `{offerId, reason: taken \| cancelled \| expired}` | Token minted only for the caller's own driver id. |

Receivers are *tolerant readers* [@hohpe2003]. They ignore unknown events and fields, drop malformed optional fields
instead of inventing defaults, and never throw inside a socket callback. Audit and clinical details (vitals, hand-off)
remain in `mission_events.metadata` and are stripped from the wire.

## 5.7 Transactions and Concurrency Control

All procedures run under PostgreSQL's default READ COMMITTED isolation [@berenson1995; @postgresDocs]. Correctness under
concurrency is obtained from explicit locks, not from a stronger isolation level.

| Mechanism | Where | Guarantee |
|---|---|---|
| Row lock `missions … FOR UPDATE` taken first | `accept_offer`, `claim_emergency`, `decline_offer`, `transition_mission`, `cancel_mission` | Commands on one mission are serialised. `_record_event` reads `state_version` under the lock, so `seq` is gap-free. |
| Row lock on `drivers` taken second | `accept_offer`, `claim_emergency` | Two acceptances by the same driver serialise; the second sees the first assignment. A fixed lock order (mission, then driver) prevents deadlock between these paths [@grayReuter1993]. |
| `FOR UPDATE SKIP LOCKED` on candidate drivers | `dispatch_next_wave`, `dispatch_tick` | Concurrent waves claim disjoint driver sets without waiting. A tick never blocks behind a user command. |
| Partial unique index on active missions per driver | `missions` | A redundant, declarative backstop for the one-active-mission invariant. |
| Transaction-scoped advisory lock `hashtextextended('create_mission:'‖uid)` | `create_mission` | One patient's concurrent bookings serialise, so the "one open request" and "10 per hour" checks see each other. |
| Append-only trigger on `mission_events` | table | History cannot be rewritten even by a privileged function bug. |

## 5.8 Realtime Pipeline and Reconciliation

1. A command commits a mission change and, in the same transaction, inserts the event row.
2. The `AFTER INSERT` trigger calls `publish_realtime(channel, envelope)`. This reads the Centrifugo URL and API key
   from Supabase Vault and enqueues an asynchronous HTTP POST through pg_net [@pgnet]. If the secrets are absent or the
   call fails, it logs a warning and returns. **A publishing failure never rolls back the state change.**
3. pg_net delivers to Centrifugo's `/api/publish`. Centrifugo appends the publication to the channel history in Redis
   and fans it out to subscribers over WebSocket [@rfc6455; @centrifugoDocs].
4. The client passes each message through `parseLifecycleMessage` and `decideSeq` (§6.8). In-order messages are
   applied, duplicates are dropped, and a gap triggers a snapshot read of the mission and its events after the last
   applied sequence.
5. After a reconnection, Centrifugo replays missed publications from history (`force_recovery`). If the history window
   has passed, the client falls back to step 4's snapshot path. Drivers additionally re-read open offers with
   `list_open_offers`.

Delivery is therefore at-least-once with idempotent, ordered application, which is the practical form of exactly-once
processing [@kleppmann2017]. The measured latency of steps 3–4 is reported in §7.6. Earlier project runs measured the
full path including pg_net at 9–45 ms or 850–990 ms depending on the run (§7.9.2).

## 5.9 Security Protocols

### 5.9.1 Threat model

| STRIDE class | Example threat | Control |
|---|---|---|
| Spoofing | Client claims to be another driver; forged realtime token | GoTrue JWT verified by PostgREST and by the token service (strict). HMAC-signed Centrifugo tokens bound to `sub` and channel [@rfc2104]. |
| Tampering | Client writes its own fare, status or location | No client write grants on `missions` and `drivers`. Fare computed in SQL. Surge CHECK constraint. Location only via `set_driver_presence`. |
| Repudiation | Driver denies an action; staff denies a KYC decision | Append-only `mission_events` with actor and role. `kyc_reviewed_by` recorded. |
| Information disclosure | Patient reads another mission; driver reads other drivers; offers broadcast to everyone | RLS on every table. Offers sent only to wave members on private channels. `dispatch_waves` and `telemetry_logs` not readable. KYC files in a private bucket behind signed URLs. Wire strips clinical metadata. |
| Denial of service | Flood of bookings reserves every nearby driver; OTP or token flooding | One open request per patient and 10 bookings per hour (system cancellations excluded). Kong per-IP limits (below). Bounded inputs (batch ≤ 1000 pings, text truncation). |
| Elevation of privilege | Self-promotion to `staff`; search-path hijack of `SECURITY DEFINER` | Role only from `app_metadata`. Column-level grants. Every `SECURITY DEFINER` function sets `search_path = ''`, enforced by `test:security`. Internal helpers not executable by client roles. |

These controls map onto the OWASP API Security Top 10 [@owaspApi2023]. Object-level authorisation (API1) is handled by
RLS. Broken authentication (API2) is addressed by the JWT and OTP flow. Unrestricted resource consumption (API4) is
bounded by rate limits and input bounds. Function-level authorisation (API5) is enforced by `_require_staff` and the
execute grants.

### 5.9.2 Gateway rate limits (per client IP, per minute)

| Route | Limit | Rationale |
|---|---|---|
| `/auth/v1` (OTP) | 20 | Each OTP is an SMS cost and a brute-force surface |
| `/rest/v1` (RPC and reads) | 300 | Normal app traffic including heartbeats every 10 s |
| `/storage/v1/object` | 120 | KYC upload and signed links |
| `/realtime/token` | 120 | Token mint per (re)subscription. Verified in §7.9.1. |
| `/triage/extract` | 20 | Each call is a billed LLM request |

### 5.9.3 Location and time integrity

The server does not trust device time. A driver reports the *age* of its fix, and the server stores
`location_fixed_at = now() − age`, so a skewed phone clock cancels out (§6.12). Device-reported stage times (onboard,
hospital arrival) are clamped into [previous stage, server now + 5 min]. Telemetry outside the mission lifetime is
rejected. The billed distance ignores fixes worse than 50 m and segments implying more than 200 km/h (§6.7).

### 5.9.4 Secrets and supply chain

Clients receive only the Supabase anon key through `EXPO_PUBLIC_*` and `VITE_*` variables. `test:security` scans 333
files for committed secrets and for secrets in public environment prefixes. The LLM key exists only behind the gateway,
which fixes the model and prompt. Leaflet is loaded with a Subresource Integrity hash [@w3cSri].

### 5.9.5 Personal-data protection (DPDP Act 2023)

The DPDP mechanisms are purpose-specific consent records (`record_consent`) shown at driver onboarding and in the
patient profile, and erasure requests processed hourly. A daily purge (03:00 UTC) removes personal data from missions
completed more than 30 days ago: pickup address, route, free-text notes and on-scene position. The stored pickup is
coarsened to about 1 km, while statutory fields (fare, distance, urgency, jurisdiction) are retained. Data residency is
pinned to AWS Mumbai (`ap-south-1`) [@dpdp2023]. No formal compliance assessment has been performed.

### 5.9.6 Known security gaps

There is no TLS certificate pinning in the mobile apps. `AUTH_MODE=dev` is permissive by design and must never be
exposed. Rate limiting is per IP, so carrier-grade NAT can group many users. Per-account limits exist only for bookings.
Push notifications are not implemented, so an offer can be missed while the app is backgrounded and its socket is
closed.

## 5.10 Observability and Operations

The dispatch pipeline emits structured `raise log` lines keyed by `mission_id`, `offer_id`, `round` and `wave`
(`wave_opened`, `offer_accepted`, `offer_declined`, `offer_expired`, `waves_exhausted`, `no_ambulance_available`,
`search_window_closed`). They contain no patient data. Scheduled jobs are recorded in pg_cron's run history. There is
no metrics or tracing stack yet. The client exposes only a development-mode realtime log line, and production
monitoring is listed as future work (§7.13).
