# Ek-Ambulance (Sahayak EMS): Data & Sync Specification

| | |
| :--- | :--- |
| **Scope** | End-to-end audit of `apps/patient` and `apps/driver`, plus the shared `packages/domain`, `supabase/migrations`, and the local data plane in `docker/`. |
| **Baseline** | Repository at commit `70e3005` (branch `main`, 2026-09-24). |
| **Method** | Static reading of source, migrations and `HANDOVER.md`. No code was executed for this document and no screen was rendered. |
| **Deliverable type** | Architecture specification: target data model, sync protocol and gap register. It contains no SQL files and no application code. |

---

## 0. Reading Guide & Status Legend

### 0.1 How to read this document

This specification does two jobs at once, and every table keeps them apart:

1. **As-built.** What the code and migrations do today, with file references so a reader can check.
2. **Target.** What the data model and sync protocol should be, so the two apps and a backend can be built against one contract.

The two differ in many places. Several parts of the request that prompted this document (for example a `dispatch:waves` channel, or Supabase Storage buckets) do not exist in the repository, and some parts that do exist contradict each other. Rather than describe an idealised system, each row carries a **status tag**.

### 0.2 Status legend

| Tag | Meaning |
| :--- | :--- |
| `IMPL` | Implemented in application or infrastructure code. A file reference is given. |
| `MIG` | Defined in a SQL migration under `supabase/migrations/`. The migration headers say they are generated for a manual `supabase db push` and are **not applied by tooling**; `HANDOVER.md` §20 and §25 record them as not pushed. |
| `STUB` | A function, hook or endpoint exists but performs no real work (returns a constant, or is a placeholder). |
| `MOCK` | Dev-only simulation (`__DEV__` mock OTP, mock dispatch wave, mock mission channel, simulated uploads). |
| `PROP` | Proposed by this specification. Nothing in the repository implements it. |
| `DRIFT` | Two sources in the repository disagree (for example the DB enum and the wire vocabulary). The row states which one this spec treats as authoritative. |

### 0.3 Limits of this audit

- **No device rendering.** `HANDOVER.md` D6 records that the UI has never been rendered on a device or simulator. Every UX finding in §2 and §3 is a **static-review finding** (derived from code), not an observed defect. Treat them as hypotheses to confirm on a device.
- **Migrations not applied.** RLS behaviour described in §5 is taken from the SQL text and from the scratch-container checks recorded in `HANDOVER.md` §20 and §25. Supabase advisors have not been run.
- **Statutory values not verified.** Tariff amounts, the `2026-04-01` tariff version, and the gazette references embedded in `packages/domain/src/pricing/index.ts` were not checked against the cited orders.
- **Secrets.** The `.env` files were deliberately not opened. Environment variable *names* come from `.env.example` and `src/config/env.ts`.

### 0.4 Conventions used throughout

| Topic | Convention |
| :--- | :--- |
| Identifiers | UUID v4 strings everywhere in the target model. The code today uses several non-UUID formats (see §4.9); the spec treats UUID as authoritative. |
| Timestamps | ISO 8601, UTC, with `Z` suffix, on the wire and in JSON. `timestamptz` in Postgres. |
| Coordinates | Application code: `{latitude, longitude}` in decimal degrees. PostGIS: `geography(Point, 4326)` written as `POINT(longitude latitude)` (longitude first). Wire payloads use the application order. |
| Speed / heading | Wire speed is **km/h** (the driver converts from m/s). Heading is degrees `0..359` (`360` is normalised to `0` on the driver). |
| Currency | INR, whole rupees (integers), `Math.round` rounding in the pricing engine. |
| Language | `en` or `hi`. |
| Government IDs | Never shown with real values. Placeholders such as `[DL Number Redacted]` and `[Aadhaar Redacted]` are used. The apps do **not** collect an Aadhaar number today (the only occurrence is an instruction string telling the patient to keep it ready, `apps/patient/src/i18n/trackingStrings.ts:216`). |
| Sample values | Synthetic (`00000000-...` style UUIDs, `+91XXXXXXXXXX` phones). |

### 0.5 Ten findings that change the plan

Full detail, evidence and remediation are in §8. IDs refer to the gap register.

| # | Finding | ID |
| :-: | :--- | :--- |
| 1 | **No write path exists.** Missions, profiles and driver rows are service-role-write only and there is no backend. `REQUEST` is never sent anywhere; the move from matching to tracking is simulated with a hard-coded mission id. | G-03, G-11 |
| 2 | **Test and fabricated content can reach real users.** A "Simulate Driver Acceptance (Test Flow)" button is rendered unconditionally; the tracking screen shows a fixed driver name and plate; the "EMR handoff" share text contains invented vitals; the offer modal shows an invented "42, Male" patient. | G-01, G-02 |
| 3 | **The real-time plane is unauthenticated.** Anonymous connects are allowed, any client may publish to `mission:*`, and the token minter never verifies the caller's JWT. Any client can forge `DRIVER_ACCEPTED` or `MISSION_COMPLETED`. | G-04 |
| 4 | **Cancellation does not reach the driver, and a driver abort during transport strands the patient.** | G-05 |
| 5 | **The quoted fare is not the locked fare.** The category screen quotes an ALS trip at Rs 710 for 8.4 km; the confirm sheet and state machine lock Rs 585 for the same trip. The billing distance is measured hub-to-pickup rather than on the transport leg. | G-07 |
| 6 | **Jurisdiction uses bounding boxes.** Gurugram and Faridabad (Haryana) fall inside the "Delhi" box and receive the Delhi tariff and statutory reference; areas of neighbouring states fall inside the "UP" box. | G-06 |
| 7 | **DPDP compliance gaps.** Consent boxes are pre-ticked and never stored; the deletion request is a local toggle; a "72-hour purge" is promised with no job behind it; free-text symptoms go to a third-party LLM from a key bundled in the app. | G-09 |
| 8 | **The offline telemetry queue drains to nowhere.** The flush function returns `true` without sending, so the UI reports pings as synced while they are discarded. | G-10 |
| 9 | **Mission state cannot be recovered.** All stores are in memory, the patient machine cannot fast-forward past a missed event, and Centrifugo history (20 entries / 300 s) is shared with GPS pings. | G-12 |
| 10 | **KYC is simulated end to end.** Nothing is uploaded or persisted, the wizard ships with pre-filled demo values, and an expired licence passes validation. | G-13 |

---

## 1. System Context

### 1.1 Topology

```text
 PATIENT APP  (in.sahayak.patient)                 DRIVER APP  (in.sahayak.driver)
 XState machine -> Zustand mirror -> screens       XState machine -> Zustand mirror -> screens
   |        |            |                            |        |            |
   |        |            +-- 3rd-party HTTPS ---------+--------+------------+
   |        |                (OSRM, Nominatim, OpenRouter,      (OSRM, OSM tiles, unpkg CDN,
   |        |                 OSM tiles, unpkg CDN)              Google Maps deep link)
   |        +-- WS subscribe  mission:{id}                +-- WS publish   mission:{id}
   |        +-- HTTPS  POST /realtime/token               +-- WS subscribe driver:{id}:offers  (STUB)
   +-- HTTPS  /auth/v1  /rest/v1                          +-- HTTPS  POST /realtime/token (publisher)
        |                    |                                 |                |
        v                    v                                 v                v
   +---------------------- KONG 3.8 (DB-less) :8000 ---------------------+   +---- CENTRIFUGO v5 :8001 ----+
   | /auth/v1        -> Supabase Auth      (ap-south-1)      20 req/min/IP |   | namespaces: mission, driver |
   | /rest/v1        -> Supabase PostgREST (ap-south-1)     300 req/min/IP |   | engine: redis               |
   | /realtime/token -> token-mint         (DEV ONLY)       120 req/min/IP |   +--------------+--------------+
   +------------------------------------------------------------------------+                  |
                                                                                          REDIS 7 (AOF, 256mb,
                                                                                          volatile-lru)
                                                        Planned, not built: GEO + presence keys for the matcher
```

### 1.2 Component inventory

| Component | Role | Status | Evidence |
| :--- | :--- | :---: | :--- |
| Patient app (Expo / React Native) | Booking flow, live tracking, receipt | `IMPL` (UI), `MOCK` (backend seams) | `apps/patient/` |
| Driver app (Expo / React Native) | Auth, KYC, shift, offers, mission execution | `IMPL` (UI), `MOCK` (offers, KYC submit) | `apps/driver/` |
| `@sahayak/domain` | Triage, pricing, jurisdiction, state machines, wire contract | `IMPL` | `packages/domain/src/` |
| Kong gateway | Rate limiting, CORS, proxy to Supabase and token minter | `IMPL` (local Docker) | `docker/kong.yml` |
| Supabase Auth (GoTrue) | Phone OTP, sessions | `IMPL` (client), SMS provider not configured | `apps/*/src/lib/supabaseClient.ts` |
| Supabase Postgres + PostgREST | System of record | `MIG` (schema only) | `supabase/migrations/*.sql` |
| Supabase Storage | Documents and receipts | `PROP` (no bucket or client call exists) | none |
| Centrifugo v5 | Live GPS and lifecycle fan-out | `IMPL` (config), dev-grade security | `docker/centrifugo.json` |
| Redis 7 | Centrifugo engine; planned matcher state | `IMPL` (engine only) | `docker-compose.yml` |
| Token minter | `POST /realtime/token` | `MOCK` (does not verify the caller's JWT) | `docker/mock-gateway/server.mjs` |
| Dispatch service (matcher, waves, offers) | Creates missions, selects drivers, publishes offers | `PROP` (does not exist) | none |
| Mission API (create, cancel, transition, complete) | Server-authoritative state changes | `PROP` (does not exist) | `useMissionTransition.ts` is a `STUB` |
| Push sender (FCM / APNs) | Wake a backgrounded driver | `PROP` | none |

### 1.3 What the apps actually send over the network today

This table is exhaustive for both apps (grep of `fetch`, `supabase.from/rpc/storage`).

| Call | App | Destination | Purpose | Status |
| :--- | :--- | :--- | :--- | :---: |
| `signInWithOtp`, `verifyOtp` (SDK) | both | Kong `/auth/v1` -> Supabase Auth | Phone OTP login | `IMPL`; `MOCK` in `__DEV__` for fixed dev numbers |
| `POST /realtime/token` | both | Kong -> token minter | Channel token (patient: subscription; driver: connection with `role: "publisher"`) | `IMPL` against a `MOCK` minter |
| WebSocket subscribe `mission:{id}` | patient | Centrifugo | Live telemetry and lifecycle | `IMPL` |
| WebSocket publish `mission:{id}` | driver | Centrifugo | Telemetry and lifecycle | `IMPL` |
| WebSocket subscribe `driver:{id}:offers` | driver | Centrifugo | Dispatch offers | `STUB` (`useDispatchOfferChannel.ts`) |
| Driving route | both (via domain) | `router.project-osrm.org` | Distance, ETA, polyline | `IMPL` (public demo server) |
| Reverse geocode / search | patient | Google (only if key set), device geocoder, Nominatim | Address text | `IMPL` |
| Triage extraction | patient | `openrouter.ai` | Free-text symptoms to structured indicators | `IMPL` (key in client bundle) |
| Map tiles, Leaflet library | both | OSM tile host, `unpkg.com` | Map rendering in a WebView | `IMPL` |
| **PostgREST reads or writes** | neither | none | none | **none exist** |
| **Storage uploads** | neither | none | none | **none exist** |

**Consequence:** the only Supabase interaction is authentication. No table is read or written by either app. Every RLS policy in §5 is therefore untested against real client traffic.

### 1.4 Identity and session model

| Aspect | As-built | Note |
| :--- | :--- | :--- |
| Login | Phone number + 6-digit SMS OTP through the Supabase SDK, routed through Kong. Session persisted by an `expo-secure-store` adapter with an in-memory fallback. | `IMPL` |
| SMS provider | Not configured on the project. Real numbers fail with `400: Unsupported phone provider`. | A `__DEV__` interceptor accepts fixed development numbers with a fixed code (`MOCK`, `HANDOVER.md` last milestone). |
| Role source | Driver app asserts `session.user.app_metadata.role === "driver"` and signs out on mismatch. Patient app does not assert a role. | `DRIFT`: the DB has a second source, `profiles.role`. |
| Mock sessions | Written straight into secure storage with fake JWTs. | They cannot pass any RLS policy or a real token minter. |
| Profile rows | `profiles` and `drivers` rows are written by `service_role` only. No trigger, function or backend creates them. | After a genuine OTP login the user has **no** `profiles` row, so every RLS-protected read returns nothing (G-11). |
| Anonymous booking | "Quick Emergency Access" skips login by design; the request is stamped `PAT-ANONYMOUS-0001`. | Not a UUID, so it cannot satisfy `missions.patient_id` (FK to `profiles`). A decision is needed on anonymous booking (see §8.2). |

### 1.5 Third-party data egress (DPDP and residency)

`HANDOVER.md` invariant 4 requires databases, auth and the API gateway to be pinned to AWS Mumbai (`ap-south-1`). The client makes the following calls to parties outside that boundary.

| Recipient | Data sent | Sensitivity | Concern |
| :--- | :--- | :--- | :--- |
| OpenRouter (LLM gateway) | Free-text emergency description (up to 1000 characters) and a fixed system prompt | Health data, possibly names and relations | Third-party processing of health text with no dedicated consent step; API key is `EXPO_PUBLIC_*` and is readable from the app binary. |
| OSRM public demo server | Pickup, hub, hospital and driver coordinates | Precise location | Public demo instance with no service commitment, residency not pinned. Also breaks the domain-purity rule (a network call inside `@sahayak/domain`). |
| Nominatim / Google geocoder | Pickup coordinates | Precise location | Reverse geocoding of the patient's location. |
| OSM tile host / `unpkg.com` | Tile coordinates, IP, request headers | Approximate location | Volunteer-run tile mirror is not for production load (`HANDOVER.md`); a CDN dependency at map load. |
| Google Maps (deep link) | Destination coordinates (driver taps "Navigate") | Precise location | User-initiated, acceptable, but should be disclosed. |

Recommendation: route every one of these through a gateway function that the operator controls (§8.3, R-09), or replace with India-resident equivalents.

## 2. Patient App: Screen-by-Screen Audit

### 2.1 Flow graph

```text
 [/ Onboarding] --Quick Emergency Access--> [/booking/triage] --SUBMIT_TRIAGE--> [/booking/location-entry]
       |                                                                                   |
       | Sign in with phone                                                                v
       v                                                                       [/booking/category-select]
 [/(auth)/phone-entry] --OTP verified-->  [/booking/location-entry]                        |
   (skips triage: see G-08)                                                                v
                                                                                 [/booking/confirm]
 [/(tabs)/home] --Request Ambulance--> [/booking/triage]                                   | REQUEST
       ^                                                                                   v
       |                                                                          [/booking/matching]
       |  returnHome() = reset() + dismissAll() + replace(home)                            | SERVER_MISSION_ASSIGNED
       |                                                                                   |   (simulated today)
       |                                                                                   v
       |                                                        [/booking/[id]]  one route, four renderings:
       |                                                           tracking ............. MissionTrackingScreen
       |                                                           transporting ......... TransportingScreen
       +-------------------------------------------------------    awaitingReceipt /
                                                                   receiptConfirmed ..... MissionCompletionScreen
                                                                   cancelled ............ MissionCancelledScreen
```

### 2.2 Route table

| Route file | Screen component | Machine state expected | Params in | Params out / event sent |
| :--- | :--- | :--- | :--- | :--- |
| `app/index.tsx` | `OnboardingScreen` | any (redirects home from `cancelled`, `receiptConfirmed`) | none | none |
| `app/(auth)/phone-entry.tsx` | `PhoneAuthScreen` | any | none | replace to `/booking/location-entry` |
| `app/(tabs)/home.tsx` | inline `HomeScreen` | any | none | push `/booking/triage`, or `/booking/matching` from the banner |
| `app/booking/triage.tsx` | `TriageScreen` | `idle` | none | `SUBMIT_TRIAGE`; params `careLevel`, `tier`, `goldenHour` |
| `app/booking/location-entry.tsx` | `PickupLocationScreen` | `triaged` | `careLevel`, `tier`, `goldenHour` | params `lat`, `lon`, `jurisdiction`, `address` |
| `app/booking/category-select.tsx` | `AmbulanceCategoryScreen` | `triaged` | above | params `vehicleType`, `careLevel`, `jurisdiction`, `lat`, `lon`, `address` |
| `app/booking/confirm.tsx` | inline + `StatutoryFareBottomSheet` | `triaged` | above | `REQUEST`; same params to matching |
| `app/booking/matching.tsx` | `ActiveMatchingScreen` | `requesting` | `vehicleType`, `jurisdiction`, `address`, `lat`, `lon` | `CANCEL`, or simulated `SERVER_MISSION_ASSIGNED` then replace `/booking/[id]` |
| `app/booking/[id].tsx` | four screens by state | `tracking` .. `receiptConfirmed`, `cancelled` | `id`, `vehicleType`, `address`, `lat`, `lon`, plus optional `state`, `hospitalName`, `wardStatus` | none (reads wire events) |

### 2.3 State boundaries

| Holder | Contents | Lifetime | Persistence |
| :--- | :--- | :--- | :--- |
| `patientLifecycle.store` (Zustand mirror of one XState actor) | `currentState`; context: `patientId`, `missionId`, `pickup`, `jurisdiction`, `triageResult`, `vehicleType`, `fareDetails`, `driverHasArrived`, `error` | Module singleton; `reset()` builds a fresh actor | **In memory only** (no persist middleware anywhere in either app) |
| `patientAuth.store` | Supabase `session` | Module singleton | Persisted by the SDK's SecureStore adapter |
| Route params | Everything in §2.2 | One navigation | URL only; used as the cold-store fallback when a deep link arrives with no machine context |
| Screen-local `useState` | `language`, form values, timers, toasts | Screen mount | None. **Language is local to each screen** (see P-UX-01). |

### 2.4 Screen catalogue

Each table has the same rows: what the user enters, what the screen shows, where state lives, what leaves the device, and static-review notes.

#### P1. Onboarding (`/`)

| Aspect | Detail |
| :--- | :--- |
| Inputs | "Quick Emergency Access", "Sign in with phone", "Call 108" (`tel:108`), EN / हिन्दी toggle |
| Displayed | Brand and service framing, bilingual copy |
| State | Local `language` only |
| Data out | None |
| Notes | The 108 control was unreachable until `HANDOVER.md` §5.2 wired it. Both entry buttons lead into flows that do not share the same first step (see G-08). |

#### P2. Phone authentication (`/(auth)/phone-entry`, one component, two steps)

| Aspect | Detail |
| :--- | :--- |
| Inputs | Phone: 10 digits, pattern `^[6-9]\d{9}$`, `number-pad`, `maxLength` 11 (allows a display space), auto-focus, shown as two groups of five digits (`NNNNN NNNNN`). OTP: six cells, `number-pad`, paste of six digits, `textContentType="oneTimeCode"`, `autoComplete="sms-otp"`, backspace retreats focus. Two consent toggles (`consentGeolocation`, `consentMedical`). Resend (30 s countdown; a GoTrue 429 cooldown overrides it). Language toggle. Back. |
| Displayed | "AIS-125 Secure Auth" header, DPDP Act 2023 consent notices, inline errors: invalid phone, consent required, invalid or expired OTP, network failure, rate limit with countdown |
| State | Local: step (`phone` or `otp`), digits, countdown, consent flags. Global: session mirrored into `patientAuth.store` by `onAuthStateChange`. |
| Data out | `signInWithOtp({ phone: "+91XXXXXXXXXX", options: { channel: "sms", shouldCreateUser: true } })`, then `verifyOtp({ phone, token, type: "sms" })`, both through Kong. `__DEV__`: a fixed development number and code bypass Supabase (see `useOtpAuth.ts`). |
| Notes | Consent flags are initialised to `true` (`PhoneAuthScreen.tsx:60-61`); consent is validated again at the OTP step; the outcome is never stored (G-09). Only screen in the patient app with a `KeyboardAvoidingView`. |

#### P3. Home (`/(tabs)/home`)

| Aspect | Detail |
| :--- | :--- |
| Inputs | "Request Ambulance" (goes to triage), "Call 108" |
| Displayed | Title and subtitle; a red banner "Ambulance Dispatch Active - Searching... Tap to View" (the source uses an em dash; ASCII is shown here) only while the machine is `requesting` |
| State | Reads the machine; no local state |
| Data out | None |
| Notes | English only (no language switch). The banner text is hard-coded English. There is no `_layout.tsx` for the `(tabs)` group, so no tab bar renders; history and profile screens were deleted (`HANDOVER.md` §5.3, D5). |

#### P4. Triage (`/booking/triage`)

| Aspect | Detail |
| :--- | :--- |
| Inputs | **Describe the emergency** (optional): multiline text, up to 1000 characters, "Analyze" button; the microphone button only focuses the input and relies on keyboard dictation. **Primary complaint** cards: `severe_trauma`, `chest_pain` (pre-selected), `breathing_distress`, `unconscious`, `minor_injury`. **Trauma vitals** (only for `severe_trauma`): respiration `normal` or `abnormal`, severe bleeding yes or no, responsiveness `alert` or `unresponsive`. |
| Displayed | Live tier banner: category pill (`Cat 1`, `Cat 2`, `Cat 3`), tier name in English or Hindi, colour and background from the engine result, recommended care level (`ALS`, `BLS`, `PTA`), clinical rationale in both languages, a golden-hour ticker when active, a START-protocol badge, a speed notice. If the AI suggested a more severe tier than the engine: a "please review" warning. |
| State | Local `language`, `selectedComplaint`, `traumaVitals`. Result is derived with `useMemo` from `computeTriageUrgency`. |
| Data out | `SUBMIT_TRIAGE { missionDraftId: "draft-<epoch ms>", symptoms: TriageSymptomFlag[], answeredAt, locale: "en", result: TriageResult }`. The AI call sends the free text to OpenRouter (see §1.5). |
| Notes | The AI only pre-fills the same state the buttons drive; the tier always comes from the START/ESI engine. Extraction output (`primaryComplaint`, `respiratoryDistress`, `severeHemorrhage`, `alteredMentalStatus`, `recommendedTier`) is not stored anywhere. `locale` is hard-coded to `"en"` (`triage.tsx:20`) even when the screen is in Hindi. A pre-selected complaint makes the primary action available with zero input (a deliberate rapid-launch choice, but it means over-triage is the silent default). |

#### P5. Pickup location (`/booking/location-entry`)

| Aspect | Detail |
| :--- | :--- |
| Inputs | Map pan (a fixed centre pin; the pickup is the map centre when a drag ends). Search box over 7 preset landmarks (client-side filter). **Locate Me** (foreground permission, balanced-accuracy fix, animate to 0.012 degree span, reverse geocode). **Confirm** (disabled when the location is outside the operating zone). |
| Displayed | Jurisdiction badge: `NCT of Delhi`, `Uttar Pradesh (<district>)` or `Outside Operating Zone` with a 108 fallback banner; address in two lines (street or landmark, then district and state); coordinate fallback text such as `28.5672° N, 77.2100° E`; a non-blocking banner for denied permission or GPS failure; OpenStreetMap attribution |
| State | Local: `coordinates`, `jurisdiction`, `currentAddress`, `addressLine2`, `searchQuery`, `locationErrorMessage`; a sequence counter drops stale geocode replies |
| Data out | Geocoding chain: Google (only with a key) then device geocoder then Nominatim then raw coordinates, 300 ms debounce after a drag. Output `{ point, resolution, address }` becomes route params `lat`, `lon`, `jurisdiction`, `address`. |
| Notes | The address string is not part of the `REQUEST` payload, so it exists only in URL params and is lost from machine context (a `pickup_address` column is needed, §5). The jurisdiction is a bounding-box guess (G-06). |

#### P6. AIS-125 vehicle selection (`/booking/category-select`)

| Aspect | Detail |
| :--- | :--- |
| Inputs | Select one of four vehicle cards; confirm. Cards below the triage requirement are disabled with a lockout banner. |
| Displayed | Per card: code (`Type A..D`), title in both languages, badge, subtitle, equipment list (six items for Type D), ETA minutes, distance, base fare, per-km rate, preview total, minimum tier required. Triage context: tier and mandate notice. Statutory footnote. |
| State | Local `language`, `selectedVehicle` |
| Data out | `{ vehicleType, careLevel, pricing }` to the route, which forwards only `vehicleType` and `careLevel` |
| Notes | ETA and distance per card are constants (Type D: 4 min, 1.2 km), not live availability. `minimumTierRequired` for Type A is `"CAT_4_MFR"`, a value that does not exist in `UrgencyTier` (`DRIFT`). The preview total (the number on each card and in the confirm-button label) is `estimatedTotalInr` from `computeVehiclePricingEstimate`, which has no included distance, while the machine locks `computeItemizedStatutoryFare` (5 km included): G-07. |

#### P7. Confirm and statutory fare (`/booking/confirm`)

| Aspect | Detail |
| :--- | :--- |
| Inputs | Expand or collapse the itemised fare, sheet-local language toggle, **Confirm and Request**, back |
| Displayed | Pickup card (address and GPS), selected vehicle card, a "3 NEARBY" tag (static), itemised fare: base fare covering the first 5 km, additional km at the per-km rate, EMT or paramedic charge (Rs 0), surge multiplier (1.0), anti-gouging amount (Rs 0), total, tariff version, statutory order reference, mandate declaration in both languages |
| State | Local `routedDistanceKm` (initialised to 8.4, replaced by the OSRM route from the dispatch hub to the pickup) |
| Data out | `REQUEST { patientId, pickup, careLevel, vehicleType, jurisdiction, requestedAt, distanceKm, idempotencyKey: "idem-<epoch>-<random>" }`. No network call follows. |
| Notes | `patientId` falls back to `PAT-ANONYMOUS-0001` (not a UUID). `REQUEST` is accepted only from `triaged`; arriving here through the sign-in path leaves the machine in `idle` and the event is silently dropped while navigation continues (G-08). The distance is hub-to-pickup, not the transport leg (G-07). The sheet's language toggle does not report back to the route. |

#### P8. Matching radar (`/booking/matching`)

| Aspect | Detail |
| :--- | :--- |
| Inputs | **Cancel** (modal with reasons, default "Found alternative transport"), hardware Back (intercepted; asks "Cancel Ambulance Request?"), Call 108, language toggle, and **"Simulate Driver Acceptance (Test Flow)"**, which renders whenever the route passes the handler, and the route always does (`matching.tsx:101`, `ActiveMatchingScreen.tsx:604`) |
| Displayed | Radar animation; pickup address; wave progress `Wave 1: 0-3 km`, `Wave 2: 3-6 km`; mm:ss countdown; nearby fleet count (3 in wave 1, 6 in wave 2, static); escalation notice |
| State | Local `currentWave` (1 or 2), `secondsLeft` (45 s per wave), cancel-modal flag, selected reason key |
| Data out | `CANCEL { missionId: "pending", reason: "changed_mind", reasonNote: <selected key>, cancelledAt }` (the reason enum is always `changed_mind`, `matching.tsx:33-34`). The simulated match sends `SERVER_MISSION_ASSIGNED { missionId: "MSN-DL-2026-8921" }` (`matching.tsx:76`). |
| Notes | Wave 2 restarts its timer forever; there is no "no ambulance available, call 108" end state, although the database models `exhausted`. The UI models two waves; the database allows three. |

#### P9. Active mission tracking (`/booking/[id]`, state `tracking`)

| Aspect | Detail |
| :--- | :--- |
| Inputs | Call driver (opens a hard-coded `tel:+91XXXXXXXXXX` "masked relay" number, `MissionTrackingScreen.tsx:117`), Call 108, an in-app chat modal, expandable symptom-specific first-aid guide, language toggle, map zoom and recentre, back |
| Displayed | Mission id; AIS-125 tier badge and equipment; **a fixed driver name and a fixed plate `[Vehicle Reg. Redacted]` for every mission** (`trackingStrings.ts:117,125`); live speed (throttled to one update per 2 s); progression stepper driven by `driverHasArrived`; map with pickup marker, route, and a driver marker that glides on each ping without re-rendering; static ETA; LIVE GPS and VERIFIED badges |
| State | `context.driverHasArrived`, `throttledTelemetry`, chat toast, guide expansion |
| Events in | `DRIVER_ACCEPTED` (already applied by matching), `DRIVER_ARRIVED` (sets `driverHasArrived`), `TRANSPORT_STARTED` (moves to `transporting`), `MISSION_CANCELLED` |
| Notes | The route drawn is from a fixed dispatch hub to the pickup, not from the driver's live position. Chat has no transport, table or channel anywhere in the repository. Back leaves without resetting the store (`HANDOVER.md` §12). The patient never sees a connection-lost indicator (P-UX-09). |

#### P10. Hospital transport (`/booking/[id]`, state `transporting`)

| Aspect | Detail |
| :--- | :--- |
| Inputs | Share to family (WhatsApp or SMS text), Call crew, Call 108, back, map controls |
| Displayed | Hospital name and ward status (defaults "Jai Prakash Narayan Apex Trauma Center, AIIMS" and "Trauma ICU Alerted - Bed Held"), live speed, green-corridor badge, transport route (pickup to hospital, hospital found by keyword match against the four seeded centres) |
| State | Toast only; everything else arrives as props from the route |
| Events in | `MISSION_COMPLETED` moves to `awaitingReceipt` |
| Notes | No wire event carries the hospital the driver actually selected, and nothing sets the `hospitalName` param, so the patient always sees the default hospital (`DRIFT`, fixed by the `TRANSPORT_STARTED` payload in §6.4). Cancellation is deliberately not offered here, but a driver abort can still arrive (G-05). |

#### P11. Completion and receipt (`/booking/[id]`, states `awaitingReceipt`, `receiptConfirmed`)

| Aspect | Detail |
| :--- | :--- |
| Inputs | **Download EMR handoff** (opens the system share sheet), **Request premature deletion** (toggle plus explanatory modal), Return home, language toggle. A "Dispute fare" control exists but the route does not pass its handler, so it never shows (`HANDOVER.md` D4). |
| Displayed | Completion banner with a **hard-coded timestamp** `22 Sep 2026, 08:35 IST` (`MissionCompletionScreen.tsx:211`); receipt: distance, base fare with included km, additional km, total, "PAID • Digital Tax Invoice Issued" (a static string; no payment system exists), zero-surge declaration; DPDP panel: data inventory (GPS telemetry, triage, vitals, masked audio, handoff), the 72-hour purge versus statutory retention disclosure |
| State | Local `isDeletionRequested`, modal flag, toast |
| Data out | Only the share sheet. The **EMR text contains invented data**: a fixed plate `[Vehicle Reg. Redacted]`, vitals "HR 84 bpm, SpO2 98%, BP 122/80", `Receiving Bay: Resuscitation Bay #04`, triage text, and a URL on `receipts.ek-ambulance.in` that nothing serves (`MissionCompletionScreen.tsx:86-100`). The deletion toggle changes local state only. `CONFIRM_RECEIPT` is never sent, so the machine never reaches `receiptConfirmed`. |
| Notes | This is the highest-risk screen for data integrity (G-02, G-09). |

#### P12. Mission cancelled (`/booking/[id]`, state `cancelled`)

| Aspect | Detail |
| :--- | :--- |
| Inputs | Call 108, "Return to Home and Start New Request" (resets the store first) |
| Displayed | Mission id, cancellation notice, statutory-fallback banner with the 108 dialler |
| State | Local `language` |
| Notes | The wire event carries no actor or reason, and the bridge hard-codes the note `"Cancelled by dispatch or driver"`, so the patient cannot tell who cancelled or why. |

### 2.5 UX friction register (static review)

Severity reflects emergency use: a stressed, possibly one-handed user, often in Hindi. Nothing here has been observed on a device.

| ID | Sev | Finding | Evidence | Recommendation |
| :--- | :-: | :--- | :--- | :--- |
| P-UX-01 | High | The language choice does not survive navigation. Each screen owns its language in local state, and route wrappers pass `"en"` or nothing. A Hindi-first user is returned to English at every step, mid-emergency. | `booking/[id].tsx:151,161,177`; `matching.tsx`; `triage.tsx:20` | One app-wide language store, persisted, read by every screen and by `locale` in `SUBMIT_TRIAGE`. |
| P-UX-02 | High | A test button that fakes a driver acceptance is visible on the matching screen in any build. | `matching.tsx:101`, `ActiveMatchingScreen.tsx:604` | Render only under `__DEV__`; see G-01. |
| P-UX-03 | High | DPDP consent toggles are pre-ticked; consent must be an affirmative act. | `PhoneAuthScreen.tsx:60-61` | Default to unticked; record grant with a timestamp (§5.3.9, `consent_records`). |
| P-UX-04 | Med | Only the phone screen wraps content in a `KeyboardAvoidingView`. The triage description field (multiline, inside a `ScrollView`) and the pickup search box (its suggestion list lives inside the map container) rely on platform defaults. | grep of both apps | Verify on iOS and small Android screens; add avoidance and `keyboardShouldPersistTaps`. |
| P-UX-05 | Med | Static values are presented as live facts: "3 NEARBY", per-card ETA and distance, driver name and plate, the masked-relay number, the completion timestamp. | `confirm.tsx`, `categoryStrings.ts`, `trackingStrings.ts:117-125`, `MissionTrackingScreen.tsx:117` | Show a value only when the server supplied it; otherwise omit or label "estimating". |
| P-UX-06 | Med | The patient has no connection-state indicator. `useMissionChannel` returns `status`, `isSubscribed` and `error`, but the route reads only `throttledTelemetry` and `mockControls`. Stale tracking looks identical to live tracking. | `booking/[id].tsx:86` | Surface a "live tracking paused" chip and the last-ping age. |
| P-UX-07 | Med | Cancellation reasons are collected, then flattened to `changed_mind`; the mission id is `"pending"`. | `matching.tsx:33-34` | Map reason keys to the domain enum; send the real mission id. |
| P-UX-08 | Med | Matching has no terminal state. Wave 2 loops indefinitely. | `ActiveMatchingScreen.tsx:131-151` | After the final wave show "No ambulance available, call 108" with an auto-dial affordance. |
| P-UX-09 | Low | Touch targets: verified sizes are a 56 dp Home primary button, 48 dp controls in the describe panel, and 36 dp back buttons with `hitSlop` 10 (56 dp effective). The Home "Call 108" link is 44 dp tall. The size of the EN / हिन्दी segments was not verified on 9 of 11 screens. | style blocks | Standardise on 48 dp minimum for emergency actions. |
| P-UX-10 | Low | Safe-area handling was reworked after device screenshots (`HANDOVER.md`, 2026-09-24) and every screen now uses `SafeAreaView`; no clipping can be confirmed statically. | HANDOVER | Re-verify on a gesture-navigation Android device. |
| P-UX-11 | Low | Accessibility roles are present on every screen; label coverage varies and no screen-reader pass has been done. | counts per screen | Run a TalkBack and VoiceOver pass; automated checks cover only part of WCAG. |
| P-UX-12 | Low | The "dispute fare" affordance was removed, not replaced, although the pricing is statutory zero-surge. | HANDOVER D4 | Decide the dispute route and send `disputeFlag` in `CONFIRM_RECEIPT`. |

## 3. Driver App: Screen-by-Screen Audit

### 3.1 Flow graph

```text
 [(auth)/phone-entry] --OTP sent--> [(auth)/otp-verify] --role verified--> [(shift)/standby]
                                          |                                     |   ^
                       (dev: unverified   |                                     |   | Go online / Go offline
                        account only)     v                                     |   |   (offline asks for confirmation)
                                   [(auth)/onboarding] --submit--> -------------+   |
                                     4-step KYC wizard                              | offer (mock today)
                                                                                    v
                                                                            [(shift)/offer]  modal, 15 s
                                                                    accept (75% swipe) |      | decline / timeout
                                                                                       v      v
                                                                          [/mission/[id]]   standby
                                            enRouteToPatient .............. DriverNavigationScreen
                                            onScene ....................... OnSceneCareScreen
                                            transporting, arrivedHospital . InTransitHospitalScreen (+ sign-off, receipt)
                                                                                       | COMPLETE_MISSION or ABORT_MISSION
                                                                                       v
                                                                                    standby
```

### 3.2 Route table

| Route file | Screen component | Machine state | Events sent |
| :--- | :--- | :--- | :--- |
| `(auth)/phone-entry.tsx` | `DriverPhoneEntryScreen` | any | none (SDK call inside the hook) |
| `(auth)/otp-verify.tsx` | `DriverOtpVerifyScreen` | any | none; redirects to onboarding for the dev-unverified account, else to standby |
| `(auth)/onboarding.tsx` | `DriverOnboardingScreen` | any | none |
| `(shift)/standby.tsx` | `DriverStandbyScreen` | `standby` | `SERVER_OFFER_RECEIVED` from the mock generator |
| `(shift)/offer.tsx` | `IncomingMissionModal` | `offered` | `ACCEPT_DISPATCH`, `DECLINE_DISPATCH`, `SERVER_OFFER_TIMEOUT` |
| `mission/[id].tsx` | three screens by phase | `enRouteToPatient`, `onScene`, `transporting`, `arrivedHospital` (any other state redirects to standby) | `CONFIRM_ARRIVAL_SCENE`, `CONFIRM_PATIENT_ONBOARD`, `CONFIRM_ARRIVAL_HOSPITAL`, `COMPLETE_MISSION`, `ABORT_MISSION` |
| `_layout.tsx` (global) | `OfflineConnectivityOverlay`, notification listeners, `useDriverLocation` | n/a | notification buttons map to the same accept and decline events |

### 3.3 State boundaries

| Holder | Contents | Persistence |
| :--- | :--- | :--- |
| `driverLifecycle.store` (Zustand mirror of one XState actor) | `currentState`, `driverId`, `activeMissionId`, `activeOfferId`, `error`. A module-level Centrifugo publisher is mounted for the active mission and torn down when none is active. | Memory |
| `driverStandby.store` | `isOnline` (**defaults to true**), `shiftStartedAt`, `language`, `currentJurisdiction` (`UP_NOIDA` or `DL_SOUTH`), `gps` (latitude, longitude, accuracy, heading, speed km/h, altitude), `battery`, `gpsQuality`, `dailyMetrics`, `registeredAis125Type`, `redisPresence`, `isOfflineModalOpen` | Memory. `battery`, `gpsQuality`, `dailyMetrics` (4 missions, 342 min, 68.4 km, Rs 3,450) and `redisPresence` are **seeded or simulated**. |
| `driverOnboarding.store` | `currentStep`, `language`, `formData` (13 fields), `documents` (7 slots), `stepErrors`, `isSubmitting`, `submissionResult` | Memory; initial state is a complete demo profile |
| `driverConnection.store` | `status` (`connected`, `connecting`, `disconnected`, `fallback`), `isFallbackActive`, `queuedPingsCount`, `showRestoredBanner`, `lastSyncedCount`, `language`, `error` | Memory |
| `telemetryQueueService` (singleton) | Up to 1000 buffered pings | Memory |
| SecureStore | Supabase session (real, or a fake dev session) | Device |

Two facts shape the rest of this section:

- `driverStandby.store` sends `GO_ONLINE` to the lifecycle machine **at import time** with demo identifiers (`DRV-DEMO-0001`, `AMB-DEMO-0001`, certificate path `storage/certs/demo-driver-kyc.pdf`, `driverStandby.store.ts:121`). The driver is therefore "online" and in `standby` before authentication or KYC.
- Language is held in **three stores** (`driverStandby`, `driverOnboarding`, `driverConnection`) and, in addition, in local state on six screens (D1, D2, D5, D6, D7, D8), so toggling language on one screen changes none of the others (`DRIFT`).

### 3.4 Screen catalogue

#### D1. Phone entry (`(auth)/phone-entry`)

| Aspect | Detail |
| :--- | :--- |
| Inputs | Phone (10 digits, same rule as the patient app), two consent toggles (`consentLocation`, `consentCredential`, both default `true`), language, and in `__DEV__` a chip row of five test-fleet numbers |
| Displayed | Driver-portal copy; driver-specific DPDP purposes: live dispatch location, crew and vehicle credential processing |
| State | Local; `KeyboardAvoidingView` uses `padding` on iOS only |
| Data out | `signInWithOtp` (a `__DEV__` interceptor answers fixed numbers with no network call) |
| Notes | Same pre-ticked consent defect as the patient app (`DriverPhoneEntryScreen.tsx:37`). |

#### D2. OTP verification (`(auth)/otp-verify`)

| Aspect | Detail |
| :--- | :--- |
| Inputs | Six OTP cells, resend (30 s), change number, and in `__DEV__` an "Auto-fill Dev OTP" button |
| Displayed | Countdown, errors including `unauthorized_role` |
| Data out | `verifyOtp`. On success the hook asserts `app_metadata.role === "driver"`; on mismatch it signs out at once. |
| Notes | Route param `phone` is required; a stale link redirects back. The role comes from JWT metadata while the database has its own `profiles.role` (`DRIFT`). |

#### D3. KYC onboarding (`(auth)/onboarding`, four steps, 2,391 lines)

| Aspect | Detail |
| :--- | :--- |
| Step 1: commercial licence | Licence number, expiry (free text `DD/MM/YYYY`), issuing state, PSV badge number. Text is upper-cased. |
| Step 2: EMT certification | Level (`EMT_P`, `EMT_A`, `EMT_B`, `FMR`), registration number, issuing council, expiry, ACLS toggle, BLS toggle |
| Step 3: vehicle and AIS-125 | Registration number, make and model, manufacture year (numeric, 4 digits), VIN or chassis number, and a four-card AIS-125 tier selector. Each card shows staffing, regulatory clause, recommended use and a mandatory-equipment checklist: Type D 8 items, Type C 8, Type B 6, Type A 5. |
| Step 4: statutory documents | Seven upload slots. Mandatory: ARAI certificate, fitness permit (Form 38), vehicle RC. Optional: commercial licence scan, EMT certificate, commercial insurance, PUC certificate. |
| Displayed | Stepper, validation messages, upload progress, "MANDATORY STATUTORY" and "REQUIRED" labels, and on submit a tracking id `EK-AMB-DL-<6 digits>` with status `PENDING_STA_VERIFICATION` |
| State | `driverOnboarding.store` |
| Data out | **None.** `submitApplication` waits 1.2 s and fabricates the result; uploads are `simulateQuickUpload` (an 0.8 s timer that invents a file name). |
| Notes | The store starts pre-filled with a full demo profile and five documents already "uploaded". Validation checks only string lengths and slot status. The expiry-date error code fires only when the field is **empty**, so an expired licence passes. EMT-level eligibility for each vehicle tier ("Type D (ALS) Eligible" tags) and the ACLS requirement for Type D are shown but not enforced. Equipment items are informational; no per-item attestation is captured (G-13). |

#### D4. Standby and shift radar (`(shift)/standby`)

| Aspect | Detail |
| :--- | :--- |
| Inputs | **Go online / Go offline** (going offline opens a confirm modal; going online waits a simulated 600 ms "GEOADD" then sends `GO_ONLINE`), jurisdiction selector (Noida UP or South Delhi DL, which **replaces the GPS with a preset**), recentre GPS, toggle charging and low-battery simulators, **Simulate Offer**, link to onboarding, language toggle |
| Displayed | Online state and shift start, AIS-125 tier badge, GPS fix (accuracy, heading, speed), GPS quality (satellites, provider label), battery percentage, temperature and charging, daily metrics (missions, online minutes, distance, revenue), and Redis presence internals (key, indexed flag, TTL, last ping, sync interval) |
| State | `driverStandby.store` |
| Data out | Only local `GO_ONLINE` and `GO_OFFLINE`. `usePresence` is a `STUB` that returns `true` without a request. |
| Notes | Real GPS arrives from `useDriverLocation` (foreground watch while online or on a mission; balanced, 10 s, 50 m when idle; high, 3 s, 5 m on a mission). The simulators and the Simulate Offer button are passed unconditionally by the route, so they are visible in any build (G-25). The displayed metrics are seeded fiction. |

#### D5. Dispatch offer (`(shift)/offer`, modal, 15 seconds)

| Aspect | Detail |
| :--- | :--- |
| Inputs | **Swipe to accept** (`PanResponder`; must drag at least 75% of the track; disabled entirely when the vehicle tier does not match), **Decline** (opens a sheet with four reasons: too far or gridlock, mechanical issue or low oxygen, another patient onboard, break or shift handover; confirm or keep reviewing), siren mute, language toggle, and a demo acuity switcher |
| Displayed | "Emergency dispatch broadcast, Wave 1, highest priority" banner (static); a 15 s countdown and progress bar; triage badge (`RED (ALS)`, `YELLOW (BLS)`, `GREEN (PTA)`); pickup address and landmark; distance and ETA (an instant offline estimate, upgraded by an OSRM route from the driver's position); required AIS-125 category against the driver's registered tier, with a mismatch banner; **symptom headline and demographics, which are fixed strings chosen by tier** (`"Severe road traffic injury ..."` or `"Fall from height ..."`, and `"42, Male"`; `IncomingMissionModal.tsx:458-462`) |
| State | Local `secondsLeft` (one-second ticks from 15), `acuity`, decline-sheet state |
| Data out | `ACCEPT_DISPATCH`, `DECLINE_DISPATCH` (reason always `"other"`), or `SERVER_OFFER_TIMEOUT`, all to the local machine. Notification buttons (`ACCEPT_MISSION`, `DECLINE_MISSION`) map to the same events. No network request is made. |
| Notes | The countdown is a local timer, not derived from a server expiry. Eligibility is strict equality of AIS-125 type (an ALS unit cannot take a BLS request). A driver makes an accept decision on invented clinical text (G-02). |

#### D6. Navigation to scene (`/mission/[id]`, `enRouteToPatient`)

| Aspect | Detail |
| :--- | :--- |
| Inputs | **Slide to confirm arrival** (58 dp thumb; must drag at least 80%; irreversible) which sends `CONFIRM_ARRIVAL_SCENE`; **Navigate in Google Maps** (deep link to the pickup coordinates); a report-delay drawer offering delay options that add minutes with a severity of moderate, high or severe, and a "broadcast" action; a call modal; Back |
| Displayed | Mission status, a maneuver list (static content), live speed from the GPS store, and after arrival an on-scene modal with a triage-preparation notice |
| State | Local drawer and modal flags plus `isArrivedOnScene`; the parent route holds the phase |
| Data out | `CONFIRM_ARRIVAL_SCENE { missionId, driverId, location, arrivedAt }`. **Back sends `ABORT_MISSION { reason: "driver_backed_out" }`** from the route wrapper. The delay broadcast raises a local notice only; there is no wire event for it. |
| Notes | Route guidance is delegated to Google Maps. Background publishing continues through a foreground location service while Maps is in front (`HANDOVER.md` §22). |

#### D7. On-scene care and hospital selection (`onScene`)

| Aspect | Detail |
| :--- | :--- |
| Inputs | **Vitals:** pulse (default 88), SpO2 (94), blood pressure systolic and diastolic (numeric, `maxLength` 3), Glasgow Coma Scale via preset chips (default 13). **Emergency type** selector (default `trauma`). **Bypass** toggle which dims the vitals card. **Hospital selection** from six ranked centres. **Start transport**, which sends `CONFIRM_PATIENT_ONBOARD`. |
| Displayed | SpO2 status (hypoxia below 90), mean arterial pressure pill, per hospital: English and Hindi name, government or private, trauma level, distance, ETA, ICU beds available of total, trauma bays, ventilators, beds held, inbound ambulances, specialities; an "AT CAPACITY" badge and disabled state when `available - held - inbound <= 0` |
| State | Local vitals, `emergency`, `isBypassActive`, `selectedHospitalId`, handoff-modal flag |
| Data out | `CONFIRM_PATIENT_ONBOARD { missionId, driverId, destination, onboardAt }` only. **The payload has no vitals field, so the readings never leave the screen.** |
| Notes | A cleared numeric field is coerced to `0` (`Number(val) \|\| 0`), so an empty SpO2 reads as hypoxia. There is no range validation. The starting values look like real readings, so an untouched screen reports plausible vitals. No keyboard avoidance. The hospital list is a six-entry client fixture, not the four-row `hospitals` table (§4.5). |

#### D8. Hospital transit, ER handoff and receipt (`transporting`, `arrivedHospital`)

| Aspect | Detail |
| :--- | :--- |
| Inputs | Map (Leaflet WebView, driver marker, recentre), **Navigate in Google Maps** to the hospital, **ER handoff slider** which sends `CONFIRM_ARRIVAL_HOSPITAL` and opens the sign-off modal. **Sign-off form:** receiving physician name, medical registration number, department, an "EMT signed" toggle, and three checklist toggles (bed ready, ventilator ready, EMR handed over). Then a **receipt view** and **Complete and Return to Shift**, which sends `COMPLETE_MISSION`. |
| Displayed | Hospital name, ETA and distance, a receipt with total kilometres (**a constant of 5.6 km**, `InTransitHospitalScreen.tsx:49`), the statutory fare breakdown and the sign-off just entered |
| State | Local sign-off fields; **pre-filled with a named physician, a medical registration number and a department (`InTransitHospitalScreen.tsx:72-74`), with every toggle already `true`** |
| Data out | `CONFIRM_ARRIVAL_HOSPITAL { missionId, driverId, location, arrivedAt }`, then `COMPLETE_MISSION { missionId, driverId, finalFareInr, completedAt }`. The sign-off is not included in either payload. On completion the standby store increments missions and revenue. |
| Notes | A driver can complete a "statutory sign-off" without typing anything (G-02). `finalFareInr` comes from local demo constants, although the domain comment says it is server-recomputed. Hospital arrival has no wire event, so the patient learns nothing until completion. |

#### D9. Connectivity overlay (global, `OfflineConnectivityOverlay`)

| Aspect | Detail |
| :--- | :--- |
| Inputs | **Force sync now**, **Send SMS fallback** (opens the device SMS composer with a prepared body; the driver must press send), dismiss |
| Displayed | An in-flow banner when `isFallbackActive`; queued ping count; on recovery a "restored, N pings synced" banner that auto-dismisses after 3.5 s |
| State | `driverConnection.store`, `telemetryQueueService` |
| Data out | SMS body: `UP108:AMB <missionId> LOC:<lat4>,<lng4> SPD:<n>K Q:<queued> T:<hh:mm:ss>`, addressed to a default of `108` |
| Notes | The flush function returns `true` without transmitting (`useCentrifugoConnection.ts:46`), so the recovery banner reports pings as synced that were only discarded (G-10). Whether the control-room number accepts SMS is an assumption. |

### 3.5 Driver control catalogue

| Control | Screen | Type | Limits | Effect | Reversible |
| :--- | :--- | :--- | :--- | :--- | :---: |
| Go online / offline | D4 | Toggle, confirm modal for offline | Verified drivers only (constraint `drivers_online_requires_verified`, machine guard on a non-empty certificate path) | `GO_ONLINE` / `GO_OFFLINE` | Yes |
| Jurisdiction selector (Noida UP / South Delhi DL) | D4 | Segmented control | Two presets | Sets `currentJurisdiction` and **overwrites the GPS with a preset** | Yes |
| Language toggle | D1 to D8 | Toggle | Three stores plus local state on six screens (§3.3) | Changes copy on that screen only | Yes |
| Simulate offer, low-battery and charging simulators | D4 | Test buttons | Not `__DEV__`-gated | Generate a mock offer or fake battery state | Yes |
| Swipe to accept | D5 | Slider | 75% drag; disabled on tier mismatch | `ACCEPT_DISPATCH` | No |
| Decline | D5 | Button plus reason sheet | 4 reasons, all sent as `"other"` | `DECLINE_DISPATCH` | No |
| Siren mute | D5 | Toggle | none | Local audio only | Yes |
| Confirm arrival | D6 | Slider | 80% drag, 58 dp thumb | `CONFIRM_ARRIVAL_SCENE` | No |
| Report delay | D6 | Drawer | Preset options only | Local notice; no wire event | n/a |
| Start transport | D7 | Action | Requires a selectable hospital | `CONFIRM_PATIENT_ONBOARD` | No |
| Hospital card | D7 | Radio card | Disabled at capacity | Sets destination | Yes |
| ER handoff | D8 | Slider | 80% drag, 58 dp thumb | `CONFIRM_ARRIVAL_HOSPITAL` | No |
| Complete and Return to Shift | D8 | Button | Only after sign-off | `COMPLETE_MISSION` | No |
| Back (mission screens) | D6, D8 | Button | none | `ABORT_MISSION` | No |
| Force sync / SMS fallback | D9 | Buttons | none | Flush (stub) / SMS composer | n/a |

### 3.6 Vehicle and telemetry inputs

| Input | Source | Cadence and accuracy | Sent anywhere | Status |
| :--- | :--- | :--- | :--- | :---: |
| Position, speed, heading, altitude, accuracy | `expo-location` foreground watch | Idle: balanced, 10 s or 50 m. On mission: high, 3 s or 5 m. | Idle: no. On mission: published to `mission:{id}` | `IMPL` |
| Position while another app is in front | `expo-task-manager` background task with a foreground service | Best-for-navigation, 3 s or 5 m; starts at `enRouteToPatient`, stops at `arrivedHospital` | Published to `mission:{id}` while the process is alive | `IMPL`; a killed process drops fixes (`HANDOVER.md` §22) |
| Battery, temperature, charging | Store values and toggles | Simulated | No | `MOCK` |
| GPS quality (satellites, provider) | Store values | Simulated | No | `MOCK` |
| Presence (Redis GEO key, TTL) | Store values | Simulated; the key `ambulances:geo:<type>` is a third naming convention (§6.6) | No | `MOCK` |
| Connection state | Centrifugo client callbacks | Event driven | No | `IMPL` |

### 3.7 UX friction register (static review)

| ID | Sev | Finding | Evidence | Recommendation |
| :--- | :-: | :--- | :--- | :--- |
| D-UX-01 | High | Simulation controls and seeded fiction (4 missions, Rs 3,450, battery, satellites, Redis internals) render in every build. | `standby.tsx`, `driverStandby.store.ts` | Gate under `__DEV__`; replace metrics with server values or hide them. |
| D-UX-02 | High | The offer's clinical text and demographics are fixed strings chosen by tier; the driver commits to a run on invented information. | `IncomingMissionModal.tsx:458-462` | Render only fields present in the offer payload (§6.4). |
| D-UX-03 | High | The sign-off form and vitals start pre-filled with plausible real-looking data and all toggles ticked. | `InTransitHospitalScreen.tsx:72-79`, `OnSceneCareScreen.tsx:53-57` | Empty by default; require entry; block submit until each mandatory field is set. |
| D-UX-04 | High | KYC ships pre-filled and uploads are simulated; an expired licence passes. | `driverOnboarding.store.ts:88-148,245-300` | Empty defaults; parse and compare dates; real uploads (§5.4). |
| D-UX-05 | Med | Vitals entry: empty coerces to `0`; no range checks; no keyboard avoidance; readings are discarded. | `OnSceneCareScreen.tsx:257-269` | Numeric ranges, empty state, persist to the mission (§6.4). |
| D-UX-06 | Med | Language lives in three stores and in local state on six screens; toggling one does not carry over to the others. | three store files; `useState<SupportedLanguage>` in six screens | Single persisted language store shared with the patient-app pattern. |
| D-UX-07 | Med | Jurisdiction preset buttons overwrite the real GPS position. | `driverStandby.store.ts:201-206` | Make the selector a filter for shift zone, never a position override. |
| D-UX-08 | Med | "Restored, N pings synced" is untrue while the flush is a stub. | `useCentrifugoConnection.ts:46` | Do not claim success until the server acknowledges a batch. |
| D-UX-09 | Med | The route wrapper aborts the mission on any Back action, and an abort publishes a cancellation to the patient. | `mission/[id].tsx` | Add a confirm step; treat pre-transport driver abort as a re-dispatch (G-05). |
| D-UX-10 | Low | The accept and arrival controls are swipe-only, with no alternative for users who cannot perform a long drag or use assistive tech. | slider code | Provide an accessible alternative (hold-to-confirm or a two-tap confirm) that keeps the accidental-tap protection. |
| D-UX-11 | Low | Keyboard avoidance exists only on the two auth screens, and on Android `behavior` is `undefined`. | grep | Verify with the on-screen keyboard on vitals and sign-off. |
| D-UX-12 | Low | Redis presence internals are shown to end users. | `DriverStandbyScreen` | Remove from the production UI. |

## 4. Domain Data Dictionary

### 4.0 How to read the tables

Columns: **Field** (UI label or store key), **Captured / shown** (screen, see §2 and §3), **Holder today** (where the value lives at runtime), **Type and validation** (as implemented), **Sens.** (sensitivity class), **Target home** (table.column, bucket, Redis, or *none*), **St.** (status tag).

| Sensitivity | Meaning |
| :--- | :--- |
| `PII` | Personal identifier (phone, name) |
| `HEALTH` | Health or clinical data |
| `GEO` | Precise location |
| `GOVID` | Government-issued identifier (shown only as a placeholder in this document) |
| `CRED` | Professional credential or licence detail |
| `FIN` | Financial or statutory-fare data |
| `OPS` | Operational, device or session data with no personal content |

### 4.1 Identity and profiles

| Field | Captured / shown | Holder today | Type and validation | Sens. | Target home | St. |
| :--- | :--- | :--- | :--- | :-: | :--- | :-: |
| Mobile number (+91) | P2, D1 | Local `rawPhone`, then SDK | 10 digits, `^[6-9]\d{9}$`, sent as `+91XXXXXXXXXX` | `PII` | `auth.users.phone`; `profiles.phone` (unique, `^\+?[1-9][0-9]{7,14}$`) | `IMPL` / `MIG` |
| OTP code | P2, D2 | Local digits | 6 digits, transient, resend after 30 s, server 429 cooldown honoured | `OPS` | None (GoTrue verifies) | `IMPL` |
| Role | Session | JWT `app_metadata.role` (driver app asserts) | `patient` or `driver` | `OPS` | `profiles.role` (check in `('patient','driver')`) | `DRIFT` |
| Full name | none | none | The patient app has no name input; `TransportingScreen.patientName` is never set | `PII` | `profiles.full_name` (nullable) | `MIG` |
| Preferred language | Toggles on every screen | Local per screen | `en` or `hi` | `OPS` | `profiles.preferred_language` | `PROP` |
| Consent: location and medical (patient) | P2 | `consentGeolocation`, `consentMedical`, default `true`, not stored | Both must be true to proceed | `PII` | `consent_records` (§5.3.9) | `PROP` |
| Consent: dispatch location and credentials (driver) | D1 | `consentLocation`, `consentCredential`, default `true`, not stored | Both must be true | `PII` | `consent_records` | `PROP` |
| Consent audit timestamp | none | none | The only column is `profiles.dpdp_consent_at`, **client-writable** | `PII` | `consent_records.granted_at`, written server-side | `MIG` / `PROP` |
| Data-deletion request | P11 | Local `isDeletionRequested` | Boolean toggle | `PII` | `erasure_requests` (§5.3.9) | `PROP` |
| Session tokens | Automatic | SecureStore (SDK adapter) | Access JWT about 1 h, refresh token | `OPS` | Device only | `IMPL` |
| Government ID | not collected | none | No Aadhaar or other ID is collected from patients. If e-KYC is added, store only a verification result and last-four reference, shown here as `[Aadhaar Redacted]`. | `GOVID` | none | n/a |

### 4.2 KYC and vehicle telemetry (driver)

| Field | Captured / shown | Holder today | Type and validation | Sens. | Target home | St. |
| :--- | :--- | :--- | :--- | :-: | :--- | :-: |
| Commercial licence number `[DL Number Redacted]` | D3 step 1 | `formData.commercialDlNumber` | String, at least 8 characters, upper-cased | `GOVID` | `drivers.license_number` (unique, not null) | `IMPL` / `MIG` |
| Licence expiry | D3 step 1 | `formData.dlExpiry` | Free text `DD/MM/YYYY`; only checked for non-empty | `CRED` | `drivers.dl_expiry` (date) | `PROP` |
| Licence issuing state | D3 step 1 | `formData.dlState` | Free text | `CRED` | `drivers.dl_state` | `PROP` |
| PSV badge `[PSV Badge Redacted]` | D3 step 1 | `formData.psvBadgeNumber` | At least 4 characters | `GOVID` | `drivers.psv_badge_number` | `PROP` |
| EMT level | D3 step 2 | `formData.emtLevel` | `EMT_P`, `EMT_A`, `EMT_B`, `FMR` | `CRED` | `drivers.emt_level` | `PROP` |
| EMT registration `[EMT Registration Redacted]` | D3 step 2 | `formData.emtNumber` | At least 4 characters | `GOVID` | `drivers.emt_cert_id` (nullable today) | `MIG` |
| EMT council | D3 step 2 | `formData.emtCouncil` | At least 2 characters | `CRED` | `drivers.emt_council` | `PROP` |
| EMT expiry | D3 step 2 | `formData.emtExpiry` | Free text, unchecked | `CRED` | `drivers.emt_expiry` (date) | `PROP` |
| ACLS certified, BLS certified | D3 step 2 | booleans | Not enforced against the chosen tier | `CRED` | `drivers.acls_certified`, `drivers.bls_certified` | `PROP` |
| Vehicle registration `[Vehicle Reg. Redacted]` | D3 step 3 | `formData.vehicleRegistrationNumber` | At least 6 characters, upper-cased | `GOVID` | `driver_vehicles.registration_number` (unique) | `PROP` |
| Make and model | D3 step 3 | `formData.makeModel` | At least 2 characters | `OPS` | `driver_vehicles.make_model` | `PROP` |
| Manufacture year | D3 step 3 | `formData.manufactureYear` | Numeric, 4 digits, unchecked | `OPS` | `driver_vehicles.manufacture_year` | `PROP` |
| VIN or chassis number | D3 step 3 | `formData.vinChassisNumber` | Upper-cased, unchecked | `GOVID` | `driver_vehicles.vin` | `PROP` |
| AIS-125 category | D3 step 3 | `formData.ais125VehicleType` | `TYPE_D_ALS`, `TYPE_C_BLS`, `TYPE_B_PTA`, `TYPE_A_MFR` | `OPS` | `drivers.ais125_type` (not null) | `MIG` |
| Equipment attestation | D3 step 3 | none (checklist is informational) | None | `OPS` | `driver_vehicles.equipment_attested` (jsonb list of item keys) | `PROP` |
| Ambulance id | GO_ONLINE payload | `AMB-DEMO-0001` | String | `OPS` | `driver_vehicles.id` (uuid) | `PROP` |
| Document slots (7) | D3 step 4 | `documents[slot]` with `status`, `fileName`, `fileSize`, `uploadedAt`, `uri`, `progress` | Slots: `arai_certificate`, `fitness_permit`, `commercial_dl`, `emt_certificate`, `vehicle_rc`, `commercial_insurance`, `puc_certificate`. Mandatory: ARAI, fitness permit, RC. | `GOVID` | `driver_documents` row plus Storage object (§5.4) | `MOCK` |
| AIS-125 certificate path | GO_ONLINE payload | Demo string `storage/certs/demo-driver-kyc.pdf` | Non-empty string; the machine guard checks only non-emptiness, not existence | `CRED` | Object path of the `arai_certificate` slot; existence verified server-side | `STUB` |
| KYC submission | D3 result | `submissionResult { trackingId, submittedAt, vehicleType, careLevelCode, status }` | `status` is `PENDING_STA_VERIFICATION` or `APPROVED`; `trackingId` is `EK-AMB-DL-<6 digits>` (the `DL` is fixed regardless of state) | `OPS` | `drivers.kyc_status`, `drivers.kyc_submitted_at`, `drivers.kyc_reference` | `MOCK` |
| Verified flag | Gate on go-online | none (dev: store set to APPROVED) | Boolean | `OPS` | `drivers.is_verified` (only `service_role` may set) | `MIG` |
| Online flag | D4 | `driverStandby.isOnline`, default `true` | Boolean; DB check forbids online while unverified | `OPS` | `drivers.is_online` | `MIG` |
| Live position | D4, D6 | `gps { latitude, longitude, accuracyMeters, heading, speedKmh, altitudeMeters }` | Decimal degrees; km/h | `GEO` | Redis GEO (matcher); last known `drivers.current_location`; on mission `telemetry_logs` | `IMPL` / `MIG` |
| Battery, temperature, GPS quality, presence internals | D4 | Simulated store values | none | `OPS` | none (remove from production UI) | `MOCK` |

**AIS-125 reference catalogue** (as defined in the apps; the patient and driver apps each hold their own equipment lists, so the counts differ):

| Type | Care level | Staffing (driver app text) | Regulatory clause (driver app text) | Driver-app equipment items | Patient-app equipment items | Min. triage tier | Base fare (Rs) | Per km (Rs) |
| :--- | :-: | :--- | :--- | :-: | :-: | :--- | :-: | :-: |
| `TYPE_D_ALS` | ALS | Driver plus certified paramedic (EMT-P or critical-care nurse) | AIS-125:2014 Part 1 Cl. 3.4, Part 2 Cl. 4.4 | 8 | 6 | `CAT_1_IMMEDIATE` | 500 | 25 |
| `TYPE_C_BLS` | BLS | Driver plus certified basic EMT | Part 1 Cl. 3.3, Part 2 Cl. 4.3 | 8 | not counted | `CAT_2_URGENT` | 300 | 15 |
| `TYPE_B_PTA` | PTA | Driver plus medical attendant or first responder | Part 1 Cl. 3.2, Part 2 Cl. 4.2 | 6 | not counted | `CAT_3_DELAYED` | 200 | 12 |
| `TYPE_A_MFR` | PTA | Certified first medical responder or solo EMT | Part 1 Cl. 3.1, Part 2 Cl. 4.1 | 5 | not counted | `"CAT_4_MFR"` (not a member of `UrgencyTier`) | 150 | 8 |

### 4.3 Spatial and navigation

| Field | Captured / shown | Holder today | Type and validation | Sens. | Target home | St. |
| :--- | :--- | :--- | :--- | :-: | :--- | :-: |
| Pickup point | P5 | `context.pickup` `{ latitude, longitude }` | Map centre, or device fix, or landmark preset | `GEO` | `missions.pickup_location` `geography(Point, 4326)`, not null | `MIG` |
| Pickup address text | P5 | URL param `address` only | Primary line plus secondary line | `GEO` | `missions.pickup_address` (text) | `PROP` |
| Destination hospital | D7 | Driver `selectedHospital`, patient URL param `hospitalName` (never set) | Fixture id | `GEO` | `missions.destination_hospital_id` (FK `hospitals`) | `MIG` |
| Jurisdiction | P5 | `context.jurisdiction` | `DL` or `UP`; derived by bounding box | `OPS` | `missions.jurisdiction` (`jurisdiction_zone`), computed server-side from polygons | `PROP` |
| Jurisdiction resolution details | P5 | `JurisdictionResolution` (`isSupported`, display names in both languages, `stateCode`, `district`, `statutoryFramework`, warning text) | Derived | `OPS` | `missions.district` (text); the rest is derivable | `PROP` |
| Route distance and duration | P7, P9, D5 | `DrivingRoute { distanceKm, durationMin, source }` | OSRM or haversine fallback (x1.3 winding factor, 30 km/h) | `GEO` | `missions.distance_km`, `missions.duration_min` | `PROP` |
| Route polyline | P9, P10, D8 | `geometry` as GeoJSON `[lng, lat]` pairs | Not stored | `GEO` | Optional `missions.route_polyline` (encoded) for dispute review | `PROP` |
| Dispatch hub | P7, P9 | Constant `DISPATCH_HUB[jurisdiction]` in `mapGeo.core.ts` | Fixed coordinates | `OPS` | none; it is used as if it were the ambulance's start, which is not true | `DRIFT` |
| Live ping | P9, P10, D6 to D8 | `MissionTelemetryPing` | `latitude`, `longitude` numbers; optional `heading` and `speed`; `timestamp` | `GEO` | Wire only; persisted to `telemetry_logs` (server) | `IMPL` / `MIG` |
| Heading (bearing) | ping | `heading`, degrees 0-359 | The driver once published `bearing`; standardised to `heading` | `GEO` | `telemetry_logs.heading` (0-360) | `IMPL` |
| Speed | ping | `speed`, km/h, one decimal (m/s x 3.6) | Non-negative | `GEO` | `telemetry_logs.speed` | `IMPL` |
| Fix time | ping | `timestamp` (device clock, ISO 8601) | Also used for queued pings | `OPS` | `telemetry_logs.recorded_at` (use the fix time, not insertion time) | `MIG` |
| Queued ping extras | D9 | `id`, `altitude`, `accuracy`, `syncStatus`, `retryCount`, `recordedInDeadZone`; coordinates rounded to 6 decimals | In-memory queue | `GEO` | `telemetry_logs` plus optional `accuracy_m`, `dead_zone` | `IMPL` / `PROP` |

**Jurisdiction resolver reference** (`packages/domain/src/jurisdiction/index.ts`). The resolver tests axis-aligned boxes in a fixed order. The first match wins.

| Order | Region | Latitude range | Longitude range | Result |
| :-: | :--- | :--- | :--- | :--- |
| 1 | "NCT of Delhi" | 28.404 to 28.883 | 76.838 to 77.348 | `DL` |
| 2 | "Uttar Pradesh" | 23.85 to 30.42 | 77.05 to 84.65 | `UP`, with a district if a sub-box matches |
| n/a | Anywhere else | | | `OUT_OF_BOUNDS`, dispatch refused |
| District sub-boxes (8) | Gautam Buddha Nagar (Noida), Ghaziabad, Meerut, Lucknow, Kanpur, Agra, Varanasi, Prayagraj | one box each | one box each | Only used to label the district |

Consequences (static analysis; coordinates are approximate and should be confirmed):

- The Delhi box is wider than the territory. Points such as central Gurugram (about 28.46, 77.03, Haryana), Faridabad (about 28.41, 77.31, Haryana) and Noida Sector 18 (about 28.57, 77.32, Uttar Pradesh) all fall inside it and resolve to `DL`, so they receive the Delhi tariff and the Delhi statutory reference.
- The Delhi box overlaps the Noida district box (longitudes 77.30 to 77.348), and Delhi is tested first, so western Noida can never be labelled Uttar Pradesh.
- The UP box also contains parts of neighbouring states, so an address in, for example, eastern Rajasthan or northern Madhya Pradesh can resolve to `UP`.

Recommendation (G-06): keep the box as an instant UX hint only; decide jurisdiction on the server with PostGIS `ST_Covers` against a `jurisdictions` boundary table (§5.3.9) and store the result on the mission.

### 4.4 Clinical and triage

| Field | Captured / shown | Holder today | Type and validation | Sens. | Target home | St. |
| :--- | :--- | :--- | :--- | :-: | :--- | :-: |
| Free-text description | P4 | Local `text` | Up to 1000 characters, English, Hindi or Hinglish | `HEALTH` | Not stored (data minimisation); optional retention only with explicit consent | `IMPL` |
| Primary complaint | P4 | `selectedComplaint` | `severe_trauma`, `chest_pain`, `breathing_distress`, `unconscious`, `minor_injury` | `HEALTH` | `missions.triage.primary_complaint` | `PROP` |
| Trauma assessment | P4 | `traumaVitals` | `respiration` normal or abnormal; `severeBleeding` boolean; `responsiveness` alert or unresponsive | `HEALTH` | `missions.triage.trauma` | `PROP` |
| Urgency tier | P4, D5 | `TriageResult.tier` | `CAT_1_IMMEDIATE`, `CAT_2_URGENT`, `CAT_3_DELAYED` | `HEALTH` | `missions.urgency` (`urgency_tier`, not null) | `MIG` |
| Recommended care level | P4, P6 | `TriageResult.recommendedCareLevel` | `ALS`, `BLS`, `PTA` | `HEALTH` | Derived; not stored | `IMPL` |
| Golden-hour flag | P4 | `TriageResult.goldenHourActive` | Boolean; true only for Cat 1 | `HEALTH` | Derived | `IMPL` |
| Tier presentation | P4 | `tierName`, `hindiTierName`, `tierColorHex`, `tierBgHex`, rationale in both languages | Derived text and colours (`#DC2626`, `#B45309`, `#15803D`) | `OPS` | Not stored; store `engine_version` instead | `IMPL` |
| Symptom flags | P4, P9 | `symptomFlags[]` from a 17-value set | 1 to 3 flags per complaint. **They are inferred, not observed**: a chest-pain complaint yields `["chest_pain","cardiac_arrest"]`; unconscious yields `["unconscious","stroke_symptoms","head_injury"]`. | `HEALTH` | `missions.triage.derived_flags`, kept distinct from reported complaint | `PROP` |
| AI extraction | P4 | `TriageExtraction { primaryComplaint, respiratoryDistress, severeHemorrhage, alteredMentalStatus, recommendedTier }`, or `TriageFailureReason` (`no_key`, `empty_input`, `timeout`, `auth`, `rate_limit`, `network`, `invalid_response`) | Strict JSON schema; the engine ignores `recommendedTier` except to raise a review warning | `HEALTH` | `missions.triage.ai { model, extraction, escalated_by_ai, failure_reason }` | `PROP` |
| Triage locale | P4 | Hard-coded `"en"` | `en` or `hi` | `OPS` | `missions.triage.locale` | `DRIFT` |
| Patient age and sex | D5 (displayed) | Fixed text `42, Male` | The patient app collects neither | `HEALTH` | Decision needed: capture an age band and sex at triage, or remove from the offer UI | `DRIFT` |
| Vitals: pulse, SpO2, blood pressure, GCS | D7 | `pulse` 88, `spO2` 94, `systolic` 120, `diastolic` 80, `gcsScore` 13 | Numeric; expected ranges pulse 0-300, SpO2 0-100, systolic 40-300, diastolic 20-200, GCS 3-15 | `HEALTH` | `mission_events.metadata.vitals` on the on-board event | `PROP` |
| Mean arterial pressure | D7 | Computed for display | Derived | `HEALTH` | Derived | `IMPL` |
| Emergency type, bypass mode | D7 | `emergency` (default `trauma`), `isBypassActive` | Value set not enumerated in the state; bypass dims the vitals card | `HEALTH` | `mission_events.metadata` on the on-board event | `PROP` |
| ER handoff sign-off | D8 | Physician name, registration number, department, EMT-signed flag, three checklist flags | Free text and booleans, pre-filled | `CRED` | `mission_events.metadata.handoff` on the completion event | `PROP` |

### 4.5 Hospital and capacity

The driver app ranks a six-entry client fixture; the database seeds four rows. They disagree on names and on which capacity fields exist.

| Client fixture field | DB column | Status |
| :--- | :--- | :--- |
| `name` (for example "AIIMS Apex Trauma Centre") | `hospitals.name` ("AIIMS New Delhi") | `DRIFT`: four names differ; "Jaypee Hospital (Sec 128)" and "Max Super Speciality Hospital (Saket)" have no database row |
| `hindiName` | `hospitals.name_hi` | `PROP` |
| `category` (`GOVERNMENT` or `PRIVATE`) | `hospitals.category` | `PROP` |
| `traumaLevel` (string) | `hospitals.trauma_level` (`smallint`, 1 to 3) | `MIG` |
| `coordinates` | `hospitals.location` | `MIG` |
| `distanceKm`, `etaMinutes` | Derived per request | n/a |
| `totalIcuBeds` | `hospitals.total_capacity` | `MIG` |
| `bedsHeldCounter` | `hospitals.held_capacity` | `MIG` |
| `availableIcuBeds` | Derived (`total_capacity - held_capacity`) | `DRIFT`: the client treats it as an independent number |
| `inboundAmbulances` | `hospitals.inbound_count` | `PROP` |
| `availableTraumaBays`, `ventilatorsReady` | `hospitals.trauma_bays_available`, `hospitals.ventilators_ready` | `PROP` |
| `specialities`, Hindi specialities | `hospitals.specialities` (text array) | `PROP` |
| Selectable rule `available - held - inbound > 0` | Server rule should be the single source | `DRIFT` |
| none | `hospitals.capacity_updated_at` so clients can show staleness | `PROP` |

### 4.6 Financial and statutory

**Tariff (`packages/domain/src/pricing`, tariff version `2026-04-01`).** Jurisdiction changes only the printed statutory reference; the amounts are identical in Delhi and Uttar Pradesh.

| Vehicle | Care level | Base fare (Rs) | Per km (Rs) | Included distance | Note |
| :--- | :-: | :-: | :-: | :-: | :--- |
| `TYPE_D_ALS` | ALS | 500 | 25 | 5.0 km | |
| `TYPE_C_BLS` | BLS | 300 | 15 | 5.0 km | |
| `TYPE_B_PTA` | PTA | 200 | 12 | 5.0 km | |
| `TYPE_A_MFR` | PTA | 150 | 8 | 5.0 km | Same care level as Type B, different fare |

**Itemised statutory fare** (`ItemizedStatutoryFare`, stored as `missions.fare_details`):

| Field | Type | Rule |
| :--- | :--- | :--- |
| `vehicleType`, `careLevel`, `jurisdiction` | text | Echo of the request |
| `totalDistanceKm` | number | Distance the fare was computed on |
| `initialIncludedKm` | number | Constant `5.0` |
| `baseFareInr` | integer | From the tariff table |
| `billableAdditionalKm` | number | `max(0, round to 1 decimal (totalDistanceKm - 5.0))` |
| `perKmRateInr` | integer | From the tariff table |
| `additionalDistanceFareInr` | integer | `round(billableAdditionalKm x perKmRateInr)` |
| `emtParamedicChargesInr` | integer | **Literal `0`** in the type: crew is included |
| `surgeMultiplier` | number | **Literal `1.0`** in the type |
| `surgeGougingAmountInr` | integer | **Literal `0`** in the type |
| `estimatedTotalInr` | integer | `baseFareInr + additionalDistanceFareInr` |
| `currency` | text | `INR` |
| `tariffVersion` | text | `2026-04-01` |
| `statutoryOrderRef` | text | Delhi: "Delhi Transport Dept Gazette Order F.No.19(13)/Tpt/Ops/2021"; UP: "Uttar Pradesh Motor Vehicles (Ambulance Tariff) Schedule 2024" (not verified in this audit) |
| `mandateDeclaration`, `hindiMandateDeclaration` | text | "Regulated Non-Surge Emergency Pricing under State Mandate" and its Hindi text |
| `computedAt` | timestamp | Set by the client clock today; the server must stamp it |

The anti-gouging guarantee is enforced only by TypeScript literal types. A database check on `fare_details` (for example `(fare_details->>'surgeMultiplier')::numeric = 1.0` and `(fare_details->>'surgeGougingAmountInr')::int = 0`) should back it (§5.3.4).

**Worked example at 8.4 km** (`billableAdditionalKm` = 3.4). The category screen quotes with a function that has no included distance; the machine locks the itemised fare.

| Vehicle | Quoted on P6 (no included km) | Locked on `REQUEST` (5 km included) | Overstatement |
| :--- | :-: | :-: | :-: |
| Type D (ALS) | Rs 710 | Rs 585 | Rs 125 |
| Type C (BLS) | Rs 426 | Rs 351 | Rs 75 |
| Type B (PTA) | Rs 301 | Rs 241 | Rs 60 |
| Type A (MFR) | Rs 217 | Rs 177 | Rs 40 |

**Distances in play.** Four different numbers stand in for "the distance", none of which is the transport leg:

| Distance | Where | Meaning |
| :--- | :--- | :--- |
| 8.4 km | `DEFAULT_DISPATCH_DISTANCE_KM` (P6 preview, machine default, receipt default) | Placeholder constant |
| OSRM hub to pickup | P7 confirm sheet | Distance from a fixed dispatch hub to the patient, not the patient's trip |
| 5.6 km | D8 receipt (`TOTAL_MISSION_DISTANCE_KM`) | Demo constant |
| none | | No component measures the actual pickup-to-hospital distance |

A decision is required on the billable distance definition (see §8.2), followed by a server-side final fare computed from `telemetry_logs` or a routed transport leg.

| Other financial field | Holder today | Target home | St. |
| :--- | :--- | :--- | :-: |
| Final fare | `COMPLETE_MISSION.finalFareInr` from local constants | `missions.final_fare_inr`, computed by the server | `PROP` |
| Payment status | Static string "PAID • Digital Tax Invoice Issued" | Out of scope; the receipt must not claim a payment until a payment model exists | `DRIFT` |
| Receipt file | `receiptId` = `receipts/{patientId}/{missionId}.pdf` in the domain type | Storage bucket `receipts` (§5.4); `missions.receipt_path` | `PROP` |
| Fare dispute | `disputeFlag` in `CONFIRM_RECEIPT`, never sent | `missions.dispute_flag` | `PROP` |
| Driver revenue | `dailyMetrics.revenueInr` (seeded Rs 3,450) | Earnings model not defined | `MOCK` |

### 4.7 Reference enumerations and where they disagree

| Concept | Values | Where defined | Notes |
| :--- | :--- | :--- | :--- |
| Vehicle type | `TYPE_D_ALS`, `TYPE_C_BLS`, `TYPE_B_PTA`, `TYPE_A_MFR` | Domain type, DB enum `ais125_vehicle_type` | Consistent |
| Urgency tier | `CAT_1_IMMEDIATE`, `CAT_2_URGENT`, `CAT_3_DELAYED` | Domain type, DB enum `urgency_tier` | Category strings add `CAT_4_MFR` (`DRIFT`) |
| Jurisdiction | `DL`, `UP` | Domain type, DB enum `jurisdiction_zone` | Driver app also has `UP_NOIDA`, `DL_SOUTH` (`DRIFT`) |
| Care level | `ALS`, `BLS`, `PTA` | Domain type | No DB type; derived from vehicle type |
| Mission status | 8 database values; 8 patient states; 7 driver states | Three different vocabularies | See the crosswalk in §7.1 |
| Cancel reason (patient) | `changed_mind`, `found_alternative`, `duplicate_request`, `other` | `CancelPayload` | The UI's reason keys do not map onto this set and the route always sends `changed_mind` |
| Decline reason (driver) | `too_far`, `unavailable`, `wrong_care_level`, `other` | `DeclineDispatchPayload` | The UI offers four reasons (gridlock or too far; mechanical or low oxygen; patient already onboard; break or handover). Proposed set: `too_far`, `vehicle_issue`, `patient_onboard`, `break`, `other`. Today every decline is sent as `other`. |
| Abort reason (driver) | `driver_backed_out`, `vehicle_breakdown`, `other` | `AbortMissionPayload` | Back always sends `driver_backed_out` |
| Offline reason (driver) | `shift_end`, `break`, `vehicle_issue`, `other` | `GoOfflinePayload` | Not collected by the offline modal (confirm only) |
| Document slot | 7 keys | `DocumentSlotKey` | See §4.2 |

### 4.8 Identifier formats (`DRIFT`)

| Entity | In the code today | Database | Target |
| :--- | :--- | :--- | :--- |
| Mission | `MSN-DL-2026-8921` (hard-coded), `MSN-<6 digits>` (mock) | `uuid` | UUID plus a separate human `display_ref` such as `MSN-DL-2026-000123` |
| Patient | Auth user id, or `PAT-ANONYMOUS-0001` | `uuid` FK to `profiles` | Auth user id; anonymous booking is a decision (§8.2) |
| Driver | `DRV-DEMO-0001` | `uuid` FK to `drivers` | Auth user id |
| Offer | `OFFER-<6 digits>` | none | `dispatch_waves.id` (the domain comment says an offer id "correlates to the specific wave") |
| Triage draft | `draft-<epoch ms>` | none | UUID v4 |
| Idempotency key | `idem-<epoch>-<random>` (the domain type says "uuid v4") | none | UUID v4, unique per patient |
| Ambulance | `AMB-DEMO-0001` | none | `driver_vehicles.id` |
| KYC tracking | `EK-AMB-DL-<6 digits>` | none | `drivers.kyc_reference` |
| Receipt | `receipts/{patientId}/{missionId}.pdf` (domain comment) | none | Storage object path |

The token minter accepts any scope matching `[\w-]+`, so all of the above are accepted today; it should require UUIDs.

## 5. Supabase Schema & Storage Architecture

### 5.1 Principles

| Principle | Statement | Source |
| :--- | :--- | :--- |
| Server-authoritative writes | Clients read under RLS. Mission, event, wave, telemetry and verification rows are written by `service_role` (a backend or Edge Functions). | Migrations, `HANDOVER.md` §20 |
| Deny by default | Every table has RLS enabled. `anon` and `authenticated` are first revoked, then granted exactly what is needed, with **column-level** grants where a row policy cannot protect a column. | Migrations |
| Policy form | Every policy is `to authenticated` and calls `(select auth.uid())`, so Postgres evaluates it once per statement as an InitPlan rather than once per row. New policies in this spec follow the same form. | Migrations |
| PostGIS placement | Extensions live in the `extensions` schema; geography columns are written `extensions.geography(Point, 4326)`. | Migrations |
| Statutory records outlive accounts | `missions.patient_id` is `on delete restrict`; audit tables use `on delete set null` for actor columns. Erasure is an anonymisation job, not a cascade. | Migrations |
| Status honesty | Everything tagged `MIG` below exists as SQL text. `HANDOVER.md` §20 and §25 record it as not pushed; this audit did not check the live project (a linked project exists under `supabase/.temp/`), so treat "applied or not" as unverified. | §0.2 |

### 5.2 Entity relationships

```text
 auth.users (Supabase-managed)
   |
   +--1:1--> profiles (id = auth.users.id; role patient|driver)
   |            |
   |            +--1:N (patient_id, ON DELETE RESTRICT)--> missions ---(destination_hospital_id, SET NULL)--> hospitals
   |                                                          |  ^
   +--1:1--> drivers (id = auth.users.id) --1:N--------------+  | (driver_id, SET NULL)
   |            |                                             |
   |            +--1:N--> driver_vehicles   [PROP]            +--1:N (CASCADE)--> mission_events
   |            +--1:N--> driver_documents  [PROP]            +--1:N (CASCADE)--> dispatch_waves
   |                                                          +--1:N (CASCADE)--> telemetry_logs (driver_id SET NULL)
   +--1:N--> driver_push_tokens (driver_id -> auth.users, CASCADE)
   +--1:N--> consent_records    [PROP]
   +--1:N--> erasure_requests   [PROP]

 jurisdictions [PROP]  <-- missions.jurisdiction, hospitals.zone (same jurisdiction_zone enum)
```

### 5.3 Table specifications

Legend for the *Status* column: `MIG` exists in a migration; `PROP` proposed by this specification. Every `PROP` change is additive, so it can ship as a new migration without rewriting the existing ones.

#### 5.3.1 `profiles`

| Column | Type | Null | Default | Constraints and keys | St. |
| :--- | :--- | :-: | :--- | :--- | :-: |
| `id` | `uuid` | no | | Primary key; FK `auth.users(id)` on delete cascade | `MIG` |
| `phone` | `text` | no | | Unique; check `phone ~ '^\+?[1-9][0-9]{7,14}$'` | `MIG` |
| `role` | `text` | no | | Check `role in ('patient','driver')` | `MIG` |
| `full_name` | `text` | yes | | | `MIG` |
| `dpdp_consent_at` | `timestamptz` | yes | | | `MIG` |
| `created_at` | `timestamptz` | no | `now()` | | `MIG` |
| `preferred_language` | `text` | no | `'en'` | Check `in ('en','hi')` | `PROP` |
| `anonymised_at` | `timestamptz` | yes | | Set by the erasure job | `PROP` |

| Indexes | Policies and grants |
| :--- | :--- |
| Primary key; unique index on `phone` | `profiles_select_own` (select): `id = (select auth.uid())`. `profiles_update_own` (update): using and check `id = (select auth.uid())`. Grants: `select`; `update (full_name, dpdp_consent_at)`. No insert or delete for clients. |

Notes: a user can currently write their own `dpdp_consent_at` (any value, including null), which makes it useless as evidence. Revoke the column grant and record consent in `consent_records` (below). Nothing creates the row after a real OTP login (G-11); the server must insert it from the verified auth event with the role fixed server-side, never from `raw_user_meta_data`.

#### 5.3.2 `drivers`

| Column | Type | Null | Default | Constraints and keys | St. |
| :--- | :--- | :-: | :--- | :--- | :-: |
| `id` | `uuid` | no | | Primary key; FK `auth.users(id)` on delete cascade | `MIG` |
| `license_number` | `text` | no | | Unique | `MIG` |
| `emt_cert_id` | `text` | yes | | | `MIG` |
| `ais125_type` | `ais125_vehicle_type` | no | | | `MIG` |
| `is_verified` | `boolean` | no | `false` | | `MIG` |
| `is_online` | `boolean` | no | `false` | Check `drivers_online_requires_verified`: `not is_online or is_verified` | `MIG` |
| `current_location` | `extensions.geography(Point, 4326)` | yes | | | `MIG` |
| `dl_expiry` | `date` | yes | | | `PROP` |
| `dl_state` | `text` | yes | | | `PROP` |
| `psv_badge_number` | `text` | yes | | | `PROP` |
| `emt_level` | `text` | yes | | Check `in ('EMT_P','EMT_A','EMT_B','FMR')` | `PROP` |
| `emt_council` | `text` | yes | | | `PROP` |
| `emt_expiry` | `date` | yes | | | `PROP` |
| `acls_certified`, `bls_certified` | `boolean` | no | `false` | | `PROP` |
| `kyc_status` | `text` | no | `'draft'` | Check `in ('draft','pending_verification','approved','rejected')`; check `is_verified = (kyc_status = 'approved')` | `PROP` |
| `kyc_reference` | `text` | yes | | Unique | `PROP` |
| `kyc_submitted_at`, `kyc_reviewed_at` | `timestamptz` | yes | | | `PROP` |
| `kyc_reject_reason` | `text` | yes | | | `PROP` |
| `last_seen_at` | `timestamptz` | yes | | Last presence heartbeat written by the server | `PROP` |

| Indexes | Policies and grants |
| :--- | :--- |
| Primary key; unique on `license_number`; partial GiST `idx_drivers_online_location` on `current_location` where `is_online` | `drivers_select_own`: `id = (select auth.uid())`. `drivers_update_own`: using and check `id = (select auth.uid())`. Grants: `select`; `update (is_online, current_location)`. |

Notes: `is_verified` is settable only by `service_role`. The client-writable `is_online` and `current_location` columns let a verified driver spoof a position and would push a position update through PostgREST every few seconds; the target is a server call that checks verification and writes Redis presence (§6.6), with the two column grants removed (R-05). The check `drivers_online_requires_verified` should stay.

#### 5.3.3 `hospitals`

| Column | Type | Null | Default | Constraints and keys | St. |
| :--- | :--- | :-: | :--- | :--- | :-: |
| `id` | `uuid` | no | `gen_random_uuid()` | Primary key | `MIG` |
| `name` | `text` | no | | Unique | `MIG` |
| `zone` | `jurisdiction_zone` | no | | | `MIG` |
| `location` | `extensions.geography(Point, 4326)` | no | | | `MIG` |
| `trauma_level` | `smallint` | no | | Check `between 1 and 3` | `MIG` |
| `total_capacity` | `integer` | no | `0` | Check `>= 0` | `MIG` |
| `held_capacity` | `integer` | no | `0` | Check `>= 0`; table check `held_capacity <= total_capacity` | `MIG` |
| `is_active` | `boolean` | no | `true` | | `MIG` |
| `name_hi` | `text` | yes | | | `PROP` |
| `category` | `text` | yes | | Check `in ('GOVERNMENT','PRIVATE')` | `PROP` |
| `trauma_bays_available`, `ventilators_ready` | `integer` | no | `0` | Check `>= 0` | `PROP` |
| `inbound_count` | `integer` | no | `0` | Check `>= 0` | `PROP` |
| `specialities`, `specialities_hi` | `text[]` | no | `'{}'` | | `PROP` |
| `capacity_updated_at` | `timestamptz` | yes | | | `PROP` |

| Indexes | Policies and grants |
| :--- | :--- |
| Primary key; unique on `name`; GiST `idx_hospitals_location` | `hospitals_select_active`: `is_active = true`. Grant: `select` only. |

Seed data (`MIG`): AIIMS New Delhi (`DL`, level 1, 30), Safdarjung Hospital (`DL`, level 1, 24), Sharda Hospital Greater Noida (`UP`, level 2, 10), Fortis Hospital Noida Sector 62 (`UP`, level 2, 12). Capacities are demo placeholders. The proximity operators are not leakproof, so PostGIS distance queries do not use the GiST index under RLS; run ranking on the server (`HANDOVER.md` §20).

Rule to standardise (G-22): a hospital is selectable when `is_active and total_capacity - held_capacity > 0`. When a driver selects a hospital, the server increments `held_capacity` for that mission and releases it on completion or cancellation, so the client's `available - held - inbound` arithmetic disappears.

#### 5.3.4 `missions`

| Column | Type | Null | Default | Constraints and keys | St. |
| :--- | :--- | :-: | :--- | :--- | :-: |
| `id` | `uuid` | no | `gen_random_uuid()` | Primary key | `MIG` |
| `patient_id` | `uuid` | no | | FK `profiles(id)` on delete restrict | `MIG` |
| `driver_id` | `uuid` | yes | | FK `drivers(id)` on delete set null | `MIG` |
| `destination_hospital_id` | `uuid` | yes | | FK `hospitals(id)` on delete set null | `MIG` |
| `status` | `mission_status` | no | `'requesting'` | | `MIG` |
| `urgency` | `urgency_tier` | no | | | `MIG` |
| `vehicle_type` | `ais125_vehicle_type` | no | | | `MIG` |
| `pickup_location` | `extensions.geography(Point, 4326)` | no | | | `MIG` |
| `fare_details` | `jsonb` | yes | | Schema in §4.6 | `MIG` |
| `created_at`, `updated_at` | `timestamptz` | no | `now()` | `updated_at` maintained by trigger `missions_set_updated_at` | `MIG` |
| `display_ref` | `text` | no | generated | Unique; for example `MSN-DL-2026-000123` | `PROP` |
| `idempotency_key` | `uuid` | no | | Unique with `patient_id`, so a retried request returns the existing mission | `PROP` |
| `jurisdiction` | `jurisdiction_zone` | no | | Decided server-side from polygons | `PROP` |
| `district` | `text` | yes | | | `PROP` |
| `pickup_address` | `text` | yes | | | `PROP` |
| `distance_km` | `numeric(6,2)` | yes | | Check `>= 0`; the billable distance (decision in §8.2) | `PROP` |
| `duration_min` | `integer` | yes | | | `PROP` |
| `route_polyline` | `text` | yes | | Encoded route, for dispute review | `PROP` |
| `triage` | `jsonb` | no | `'{}'` | Object defined in §4.4 | `PROP` |
| `state_version` | `integer` | no | `0` | Incremented on every transition; equals the last event `seq` | `PROP` |
| `accepted_at`, `arrived_scene_at`, `onboard_at`, `arrived_hospital_at`, `completed_at`, `cancelled_at` | `timestamptz` | yes | | Denormalised from events for receipts and reporting | `PROP` |
| `cancelled_by` | `text` | yes | | Check `in ('patient','driver','system')` | `PROP` |
| `cancel_reason` | `text` | yes | | Check `in ('changed_mind','found_alternative','duplicate_request','other')` | `PROP` |
| `cancel_note` | `text` | yes | | | `PROP` |
| `final_fare_inr` | `integer` | yes | | Check `>= 0`; server-computed | `PROP` |
| `receipt_path` | `text` | yes | | Path in bucket `receipts` | `PROP` |
| `dispute_flag` | `boolean` | no | `false` | | `PROP` |
| `receipt_confirmed_at` | `timestamptz` | yes | | Patient acknowledgement from `CONFIRM_RECEIPT` (§7.1) | `PROP` |
| Fare guard | | | | Check: `fare_details is null or ((fare_details->>'surgeMultiplier')::numeric = 1.0 and (fare_details->>'surgeGougingAmountInr')::int = 0)` | `PROP` |

| Indexes | Policies and grants |
| :--- | :--- |
| `MIG`: `idx_missions_patient_id (patient_id, created_at desc)`; `idx_missions_driver_id (driver_id) where driver_id is not null`; `idx_missions_matched (created_at) where status = 'matched' and driver_id is null`; `idx_missions_destination_hospital_id (destination_hospital_id) where destination_hospital_id is not null`. `PROP`: `(patient_id) where status not in ('completed','cancelled')` and `(driver_id) where status not in ('completed','cancelled')`, to make "resume my active mission on launch" a one-row lookup. | `missions_select_patient`: `patient_id = (select auth.uid())`. `missions_select_driver` (as built): `driver_id = (select auth.uid()) or (status = 'matched' and driver_id is null and (select exists (select 1 from public.drivers d where d.id = (select auth.uid()) and d.is_verified)))`. Grant: `select` only; no client writes. |

Notes:

- **Pool branch (R-06).** As built, every verified driver, of any vehicle type and zone, can read the pickup location, urgency and fare of every unassigned `matched` mission. Recommended: `driver_id = (select auth.uid())` only. Offers reach drivers through `driver:{id}:offers` (§6.4), so no client needs the pool.
- **Meaning of `matched`.** `HANDOVER.md` §20 flags that `matched` is used as "unassigned pool" while the patient machine treats acceptance as the step after `requesting`. §7.1 fixes the meaning.
- **Writer.** There is no path that inserts a mission (G-03). The target is a server function `create_mission(idempotency_key, pickup, vehicle_type, triage, ...)` that validates the caller, resolves jurisdiction, computes the fare and writes the first event in one transaction.

#### 5.3.5 `mission_events`

| Column | Type | Null | Default | Constraints and keys | St. |
| :--- | :--- | :-: | :--- | :--- | :-: |
| `id` | `uuid` | no | `gen_random_uuid()` | Primary key | `MIG` |
| `mission_id` | `uuid` | no | | FK `missions(id)` on delete cascade | `MIG` |
| `from_status` | `mission_status` | yes | | | `MIG` |
| `to_status` | `mission_status` | no | | | `MIG` |
| `triggered_by` | `uuid` | yes | | FK `auth.users(id)` on delete set null | `MIG` |
| `metadata` | `jsonb` | no | `'{}'` | Per-event content in §6.4 | `MIG` |
| `created_at` | `timestamptz` | no | `now()` | | `MIG` |
| `seq` | `integer` | no | | Per-mission sequence starting at 1; unique with `mission_id` | `PROP` |
| `event_type` | `text` | no | | Wire vocabulary (`DRIVER_ACCEPTED` and so on) | `PROP` |
| `actor_role` | `text` | no | | Check `in ('patient','driver','system')` | `PROP` |
| `client_event_id` | `uuid` | yes | | Unique with `mission_id` where not null; makes a retried driver call idempotent | `PROP` |

| Indexes | Policies and grants |
| :--- | :--- |
| `MIG`: `idx_mission_events_mission_time (mission_id, created_at)`. `PROP`: unique `(mission_id, seq)`; partial unique `(mission_id, client_event_id)`. | `mission_events_select_participant`: `exists (select 1 from public.missions m where m.id = mission_events.mission_id and (m.patient_id = (select auth.uid()) or m.driver_id = (select auth.uid())))`. Grant: `select` only. |

Notes: the table is not append-only at the database level (`service_role` can update or delete, and rows cascade from `missions`). If the trail is statutory, add a trigger that rejects `update` and `delete` (R-08). Because a driver loses access once `driver_id` is set null, the patient remains the durable reader.

#### 5.3.6 `dispatch_waves`

| Column | Type | Null | Default | Constraints and keys | St. |
| :--- | :--- | :-: | :--- | :--- | :-: |
| `id` | `uuid` | no | `gen_random_uuid()` | Primary key; doubles as the **offer id** | `MIG` |
| `mission_id` | `uuid` | no | | FK `missions(id)` on delete cascade | `MIG` |
| `wave_number` | `integer` | no | | Check `between 1 and 3`; unique with `mission_id` | `MIG` |
| `radius_km` | `numeric(4,2)` | no | | Check `> 0` | `MIG` |
| `eligible_driver_ids` | `uuid[]` | no | `'{}'` | | `MIG` |
| `status` | `text` | no | | Check `in ('broadcasting','accepted','expired','exhausted')` | `MIG` |
| `created_at` | `timestamptz` | no | `now()` | | `MIG` |
| `expires_at` | `timestamptz` | no | | End of the wave window; the offer countdown is derived from it | `PROP` |
| `accepted_by` | `uuid` | yes | | FK `drivers(id)` | `PROP` |

| Indexes | Policies and grants |
| :--- | :--- |
| Primary key; unique `(mission_id, wave_number)`; GIN `idx_dispatch_waves_eligible_drivers` on `eligible_driver_ids` | `dispatch_waves_select_eligible`: `eligible_driver_ids @> array[(select auth.uid())]`. Grant: `select` only. |

Notes: an eligible driver can read the whole array, so they learn the ids of every other driver in the wave. Either drop client access (offers arrive by channel) or expose a view without the array (R-06). The UI models two waves of 45 s (0 to 3 km and 3 to 6 km) while the table allows three, and the driver's offer window is 15 s. Recommended values: offer TTL 15 s per driver, wave window 45 s, up to three waves (radius 3, 6, 10 km, to be confirmed by operations). The wave count and radii should come from the server so the UI never hard-codes them, and a fourth outcome, `exhausted`, needs a patient-facing end state (P-UX-08).

#### 5.3.7 `driver_push_tokens`

| Column | Type | Null | Default | Constraints and keys | St. |
| :--- | :--- | :-: | :--- | :--- | :-: |
| `id` | `uuid` | no | `gen_random_uuid()` | Primary key | `MIG` |
| `driver_id` | `uuid` | no | | FK `auth.users(id)` on delete cascade; unique with `token` | `MIG` |
| `token` | `text` | no | | | `MIG` |
| `platform` | `text` | no | | Check `in ('android','ios','web')` | `MIG` |
| `updated_at` | `timestamptz` | no | `now()` | Trigger `driver_push_tokens_set_updated_at` | `MIG` |
| `token_type` | `text` | no | `'expo'` | Check `in ('expo','fcm','apns')` | `PROP` |
| `is_active` | `boolean` | no | `true` | | `PROP` |

| Indexes | Policies and grants |
| :--- | :--- |
| Primary key; unique `(driver_id, token)` | `push_tokens_select_own` and `push_tokens_insert_own` (`driver_id = (select auth.uid())`), `push_tokens_update_own` (using and check the same). Grants: `select`; `insert (driver_id, token, platform)`; `update (token, platform)`. `PROP`: `push_tokens_delete_own` and a `delete` grant so a logout can remove the token. |

Notes: no client code registers a token today (there is no call to `getExpoPushTokenAsync`), and without server-sent FCM or APNs a backgrounded app loses its socket, so offers do not arrive (`HANDOVER.md` §21, limit 3).

#### 5.3.8 `telemetry_logs`

| Column | Type | Null | Default | Constraints and keys | St. |
| :--- | :--- | :-: | :--- | :--- | :-: |
| `id` | `bigint` | no | identity (always) | Primary key | `MIG` |
| `mission_id` | `uuid` | no | | FK `missions(id)` on delete cascade | `MIG` |
| `driver_id` | `uuid` | yes | | FK `auth.users(id)` on delete set null | `MIG` |
| `location` | `extensions.geography(Point, 4326)` | no | | | `MIG` |
| `speed` | `numeric(5,2)` | yes | | Check `>= 0` (km/h) | `MIG` |
| `heading` | `numeric(5,2)` | yes | | Check `>= 0 and <= 360` | `MIG` |
| `recorded_at` | `timestamptz` | no | `now()` | Should carry the **device fix time**; the default is only a fallback | `MIG` |
| `received_at` | `timestamptz` | no | `now()` | Server insertion time, so dead-zone flushes are distinguishable | `PROP` |
| `accuracy_m` | `numeric(6,1)` | yes | | | `PROP` |
| `dead_zone` | `boolean` | no | `false` | True for pings buffered while offline | `PROP` |

| Indexes | Policies and grants |
| :--- | :--- |
| `MIG`: `idx_telemetry_mission_time (mission_id, recorded_at)`. `PROP`: unique `(mission_id, driver_id, recorded_at)` so a re-flushed batch does not create duplicates. | RLS is on with **no policy**, so `authenticated` has no access; the `revoke` removes table grants. `service_role` only. |

Notes: nothing writes this table today; the "pings are persisted server-side" premise needs a consumer (a Centrifugo publish proxy or a subscriber service). At a 3 s cadence a 30-minute mission yields about 600 rows, so partition by month on `recorded_at` once volume warrants and apply the retention in §5.6.

#### 5.3.9 Proposed new tables

| Table | Purpose | Columns (all `PROP`) | Policies |
| :--- | :--- | :--- | :--- |
| `consent_records` | Append-only DPDP consent evidence | `id uuid pk`; `user_id uuid not null` FK `auth.users` (cascade); `purpose text not null` (check in `geolocation`, `medical_data`, `driver_location`, `driver_credentials`, `third_party_llm`); `notice_version text not null`; `granted boolean not null`; `granted_at timestamptz not null default now()`; `locale text`; `app_version text`; `withdrawn_at timestamptz`. Index `(user_id, purpose, granted_at desc)`. | Select: `user_id = (select auth.uid())`. Insert and update: `service_role` only, so timestamps cannot be forged. |
| `erasure_requests` | Tracks the "queue data erasure" action promised in the UI | `id uuid pk`; `user_id uuid not null`; `mission_id uuid` FK `missions`; `requested_at timestamptz not null default now()`; `due_at timestamptz not null` (request plus 72 h); `status text not null default 'queued'` (check in `queued`, `processing`, `done`, `rejected`); `completed_at timestamptz`; `scope jsonb` | Select: `user_id = (select auth.uid())`. Insert through an RPC that sets `user_id` from the JWT. |
| `driver_vehicles` | The vehicle behind a driver's AIS-125 tier | `id uuid pk`; `driver_id uuid not null` FK `drivers` (cascade); `registration_number text not null unique`; `make_model text`; `manufacture_year smallint` (check between 1990 and 2100); `vin text`; `ais125_type ais125_vehicle_type not null`; `equipment_attested jsonb not null default '[]'`; `is_active boolean not null default true`. Partial unique `(driver_id) where is_active`. | Select: `driver_id = (select auth.uid())`. Insert and update own while `drivers.kyc_status in ('draft','rejected')`. |
| `driver_documents` | One row per KYC document slot | `id uuid pk`; `driver_id uuid not null` FK `drivers` (cascade); `slot text not null` (check in the 7 slot keys); `storage_path text not null`; `file_name text`; `size_bytes integer`; `mime_type text`; `status text not null default 'uploaded'` (check in `uploaded`, `accepted`, `rejected`); `rejection_reason text`; `uploaded_at timestamptz not null default now()`; `reviewed_at timestamptz`. Unique `(driver_id, slot)`. | Select: `driver_id = (select auth.uid())`. Insert and update own while `kyc_status in ('draft','rejected')`, without write access to `status`. |
| `jurisdictions` | Authoritative zone boundaries and statutory references | `zone jurisdiction_zone pk`; `name text`; `boundary extensions.geography(MultiPolygon, 4326) not null`; `statutory_order_ref text not null`; `tariff_version text not null`. GiST on `boundary`. | No client policy; server use only (`ST_Covers(boundary, pickup)`). |

### 5.4 Storage buckets (all `PROP`)

No bucket, upload call or Storage policy exists in the repository. The domain contract already names two object paths: `receipts/{patientId}/{missionId}.pdf` (`ConfirmReceiptPayload.receiptId`) and an `ais125CertPath` "Storage path" (`GoOnlinePayload`). The buckets below make those paths real and add the two the request names.

| Bucket | Purpose | Visibility | Max object size | Accepted MIME types | Path template |
| :--- | :--- | :--- | :-: | :--- | :--- |
| `driver-kyc-documents` | The seven KYC slots. `ais125CertPath` is the object path of the `arai_certificate` slot. | Private | 5 MB | `application/pdf`, `image/jpeg`, `image/png` | `{driver_id}/{slot}/{uuid}.{ext}` |
| `medical-prescriptions` | Prescriptions or reports a patient chooses to attach to a mission. **No current UI produces these**; keep only if the product adds the attach step. | Private | 10 MB | `application/pdf`, `image/jpeg`, `image/png` | `{patient_id}/{mission_id}/{uuid}.{ext}` |
| `receipts` | Statutory fare receipt PDF, generated by the server at completion | Private | 1 MB | `application/pdf` | `{patient_id}/{mission_id}.pdf` |
| `emr-handoffs` | Emergency medical record handoff PDF generated from **real** mission data (replaces the fabricated share text in P11) | Private | 2 MB | `application/pdf` | `{patient_id}/{mission_id}.pdf` |

Folder-level policies on `storage.objects`. Predicates use `(select auth.uid())` and the folder helper.

| Bucket | Operation | Roles | Predicate |
| :--- | :--- | :--- | :--- |
| `driver-kyc-documents` | select | authenticated | `bucket_id = 'driver-kyc-documents' and (storage.foldername(name))[1] = (select auth.uid())::text` |
| `driver-kyc-documents` | insert, update, delete | authenticated | The select predicate, and `exists (select 1 from public.drivers d where d.id = (select auth.uid()) and d.kyc_status in ('draft','rejected'))` |
| `medical-prescriptions` | select, insert, delete | authenticated | `bucket_id = 'medical-prescriptions' and (storage.foldername(name))[1] = (select auth.uid())::text` |
| `medical-prescriptions` | select (assigned driver) | authenticated | `bucket_id = 'medical-prescriptions' and exists (select 1 from public.missions m where m.id::text = (storage.foldername(name))[2] and m.driver_id = (select auth.uid()) and m.status in ('en_route','on_scene','transporting','arrived_hospital'))` |
| `receipts`, `emr-handoffs` | select | authenticated | `bucket_id = '<bucket>' and (storage.foldername(name))[1] = (select auth.uid())::text` |
| `receipts`, `emr-handoffs` | insert, update, delete | `service_role` only | No client policy; the server generates and writes the files |

Operational rules: the size limit and MIME list are bucket settings, enforced by Storage rather than by the app. Uploads go directly from the device with the user's JWT. Server-side malware scanning and document review (staff use `service_role` or short-lived signed URLs) happen before a document may be marked `accepted`. No bucket is public. Hospital access to an EMR handoff is by a time-limited signed URL, never by a standing policy.

### 5.5 Enumerations (`MIG`)

| Enum | Values |
| :--- | :--- |
| `ais125_vehicle_type` | `TYPE_A_MFR`, `TYPE_B_PTA`, `TYPE_C_BLS`, `TYPE_D_ALS` |
| `urgency_tier` | `CAT_1_IMMEDIATE`, `CAT_2_URGENT`, `CAT_3_DELAYED` |
| `jurisdiction_zone` | `DL`, `UP` |
| `mission_status` | `requesting`, `matched`, `en_route`, `on_scene`, `transporting`, `arrived_hospital`, `completed`, `cancelled` |

All proposed value sets are `text` columns with check constraints, so a future value does not require an enum migration.

### 5.6 Access matrix and retention

**Client access as built** (after column grants, RLS and the absence of write grants):

| Table | `anon` | Patient (`authenticated`) | Driver (`authenticated`) | `service_role` |
| :--- | :--- | :--- | :--- | :--- |
| `profiles` | none | select own; update `full_name`, `dpdp_consent_at` | same | all |
| `drivers` | none | none (no row) | select own; update `is_online`, `current_location` | all |
| `hospitals` | none | select active | select active | all |
| `missions` | none | select own | select assigned, or the whole unassigned `matched` pool if verified | all |
| `mission_events` | none | select for own missions | select for own missions | all |
| `dispatch_waves` | none | none in effect | select waves that list them | all |
| `driver_push_tokens` | none | none in effect | select, insert, update own | all |
| `telemetry_logs` | none | none | none | all |

**Retention.** The completion screen (P11) already tells the patient what is kept and for how long. Those statements are commitments, so the data model must be able to honour them. Note that the inventory it shows is static text: counts such as "248 coordinates" and "1 masked call (42 s)" are not computed, and it lists an ECG log, CPAP flow telemetry, masked-call metadata and chat transcripts that no component collects.

| Data class | Stated retention (UI) | Where it lives | Mechanism needed |
| :--- | :--- | :--- | :--- |
| GPS breadcrumbs | 30 days by default, purgeable on request | `telemetry_logs` | Scheduled purge; on request, delete within 72 h |
| Triage and symptoms | 30 days, purgeable | `missions.triage` | Null the object; keep `urgency` and tier for statistics if anonymised |
| In-transit vitals | 30 days, purgeable | `mission_events.metadata.vitals` | Remove the key on request or expiry |
| Masked-call metadata | 7 days | None (no telephony integration) | Not applicable until a proxy exists |
| Handoff record | "Permanent in Hospital ABHA/NDHM record" | `emr-handoffs` (ours) | No ABHA integration exists; keep ours on the 30-day rule unless a decision says otherwise |
| Fare ledger and invoice | Retained under statute | `missions.fare_details`, `final_fare_inr`, `receipts` | Keep; anonymise personal fields; `patient_id` stays because of `on delete restrict` |
| Chat transcripts | Listed as purgeable | None | Not applicable until chat exists |

Erasure design: the request creates an `erasure_requests` row with `due_at = requested_at + 72 h`; a job nulls or deletes the classes above, sets `profiles.anonymised_at`, replaces `full_name` and `phone` with tombstones, and leaves the fare ledger and anonymised distance metrics, matching the disclosure in the UI.

## 6. Real-Time Plane (Centrifugo v5 + Redis)

### 6.1 Roles and the two designs in the repository

Two incompatible designs for lifecycle propagation coexist:

| | Design A: server fans out | Design B: driver publishes directly |
| :--- | :--- | :--- |
| Flow | The driver calls a REST transition endpoint; the server validates, updates the database and publishes the event | The driver's app publishes the lifecycle event straight onto `mission:{id}` after its local machine accepts the transition |
| Where it appears | `useMissionTransition.ts` (`STUB`: it maps `CONFIRM_ARRIVAL_SCENE`, `CONFIRM_PATIENT_ONBOARD`, `CONFIRM_ARRIVAL_HOSPITAL`, `COMPLETE_MISSION` to `ON_SCENE`, `PATIENT_ON_BOARD`, `ARRIVED_HOSPITAL`, `COMPLETE`, with an error shape `{ error, from }`), and `docs/prompts/driver-app/P06`, which specifies `POST /missions/{id}/transition`, offer accept and decline endpoints, and "machine advances only on HTTP 200 `{ ok: true }`, no optimistic transitions" | `driverLifecycleWire.core.ts`, `driverTelemetry.ts`, `driverLifecycle.store.ts` (`IMPL`) |
| Backend | P06 says the route is "already implemented in `apps/dispatch-service/src/routes/transition.ts`" (Redis Redlock, Postgres advisory lock, an XState `missionMachine`, an audit-log trigger). **No `apps/dispatch-service` exists in this repository** (`apps/` holds only `driver` and `patient`). | None |
| Authority | Server | The client, and nothing verifies it |

**This specification adopts Design A as the target**, which is also what the project's own task documents intended. The database is the system of record, the server publishes lifecycle events, and drivers publish only their own GPS. Design B is retained only as the current development shortcut, with the consequences listed in §8 (G-04, G-05, G-12).

### 6.2 Centrifugo configuration as built (`docker/centrifugo.json`)

| Setting | Value | Assessment |
| :--- | :--- | :--- |
| Engine | Redis (`redis:6379`) | Fine |
| `allow_anonymous_connect_without_token` | `true` | Development only. The patient connects anonymously and authenticates only through a subscription token. Must be `false` in production. |
| `allowed_origins` | `["*"]` | Restrict to the app origins. |
| `client_channel_limit` | 10 | Adequate: a patient needs 1 channel, a driver 2. |
| Admin UI | enabled, with a committed development password and secret | Rotate and inject from the environment; do not reproduce these values. |
| HMAC signing key, API key | Committed development placeholders, shared with the token minter | Inject from a secret store. |
| Namespace `mission` | `allow_publish_for_client: true`, `history_size: 20`, `history_ttl: 300s`, `force_recovery: true` | Publish permission is namespace-wide; nothing ties it to a mission or a role. History is shared by GPS and lifecycle traffic (see §7.6). |
| Namespace `driver` | `history_size: 5`, `history_ttl: 60s`, `force_recovery: true`; client publish not allowed; server publishes through the HTTP API with `api_key` | Correct shape for offers. |

### 6.3 Channel taxonomy

| Channel | Namespace | Direction | Publisher (target) | Subscriber (target) | Status |
| :--- | :--- | :--- | :--- | :--- | :-: |
| `mission:{missionId}` | `mission` | Lifecycle events and driver GPS | **Server** for lifecycle; the assigned driver for GPS (as built, the driver publishes both) | The mission's patient and the assigned driver | `IMPL` |
| `driver:{driverId}:offers` | `driver` | Server to one driver: `OFFER`, `OFFER_REVOKED` | Server only, through the Centrifugo HTTP API | That driver only | Config `IMPL`; client `STUB` |
| `gps:{missionId}` | new namespace `gps` (history size 1, TTL 60 s, no recovery) | Driver GPS only | The assigned driver, through a publish proxy | Patient, assigned driver | `PROP` |

Notes on naming:

- **`dispatch:waves` does not exist and should not be created.** A channel that broadcast waves to all drivers would expose every open mission's pickup to every subscriber. Waves are orchestrated server-side (database `dispatch_waves` plus Redis) and reach drivers as per-driver messages on `driver:{driverId}:offers`. The offer scope accepted by the token minter is exactly `driver:{id}:offers`; a bare `driver:{id}` is not a channel.
- **Splitting GPS from lifecycle (`gps:{missionId}`) is the fix for the shared-history problem** described in §7.6. If a split is deferred, raise `history_size` and add the REST snapshot in §7.5.
- The driver must subscribe to `mission:{missionId}` once assigned (as a subscriber), because today the driver app only publishes and therefore never hears a cancellation (G-05).

### 6.4 Wire event catalogue

#### 6.4.1 Envelope conventions

| Rule | Detail |
| :--- | :--- |
| Format | JSON objects. Timestamps ISO 8601 UTC. Coordinates `{latitude, longitude}` degrees. Speed km/h. Heading degrees 0-359. |
| Discriminator (as built) | None. A receiver decides by shape: a numeric `latitude` and `longitude` is a telemetry ping, otherwise a string `event` is a lifecycle publication (`packages/domain/src/mission-channel`). |
| Discriminator (target) | Add `v` (integer, starts at 1) and `type` (`telemetry`, `lifecycle`, `offer`, `offer_revoked`). Receivers ignore unknown `type` and unknown fields and never throw. |
| Idempotency (target) | Lifecycle messages carry `eventId` (UUID) and a per-mission `seq` that matches `mission_events.seq` and `missions.state_version`. |
| Guard weakness (as built) | The lifecycle guard checks only that `event` is a string. The translator has a `switch` with no default, so an unknown event string yields no domain event and a call to `send(undefined)`, which very likely throws inside the socket callback (not executed in this audit; G-18). |

#### 6.4.2 Telemetry ping (`mission:{missionId}`, or `gps:{missionId}` after the split)

As built (`MissionTelemetryPing`):

```json
{
  "latitude": 28.5672,
  "longitude": 77.21,
  "heading": 68,
  "speed": 42.5,
  "timestamp": "2026-09-24T08:31:07.412Z"
}
```

| Field | Type | Required | Rule |
| :--- | :--- | :-: | :--- |
| `latitude`, `longitude` | number | yes | The only fields the guard requires |
| `heading` | number | no | 0-359; omitted when unknown (`-1` or null from the device); the driver once sent `bearing`, now retired |
| `speed` | number | no | km/h, one decimal; converted from m/s (multiply by 3.6); omitted if negative or unknown |
| `timestamp` | string | yes by type, not by guard | Device fix time |

Cadence: about every 3 s during a mission (foreground high accuracy, or the background task at 3 s or 5 m). Delivery is best-effort: a dropped ping is superseded by the next. Target additions: `v`, `type: "telemetry"`, and `deadZone: true` on pings flushed from the offline buffer. Receivers must drop a ping whose `timestamp` is not newer than the last one applied (§7.5).

#### 6.4.3 Lifecycle events

As built, every lifecycle publication has this shape (`MissionLifecyclePublication`); the guard requires only `event`:

```json
{
  "event": "DRIVER_ACCEPTED",
  "missionId": "6f0c1e9a-0000-4000-8000-000000000001",
  "driverId": "b7d2a4c1-0000-4000-8000-000000000002",
  "timestamp": "2026-09-24T08:29:40.101Z"
}
```

Target: the same fields plus an envelope and a per-event `data` object, defined field by field for each event after the table below. The change is additive, so older receivers that read only `event` and `missionId` keep working.

| Event | Emitted when | DB transition | Patient machine effect (as built) | `data` (target) |
| :--- | :--- | :--- | :--- | :--- |
| `DRIVER_ACCEPTED` | Driver's accept wins the race (server confirmed) | `requesting` to `en_route` (`matched` is unused in the target, §7.1) | `SERVER_MISSION_ASSIGNED`: `requesting` to `tracking`, sets `missionId` | `driver { displayName, vehicleRegistration "[Vehicle Reg. Redacted]", ais125Type }`, `maskedCall { number, extension }`, `etaMinutes` |
| `DRIVER_ARRIVED` | Driver confirms arrival at the scene (arrival slider) | `en_route` to `on_scene` | `SERVER_DRIVER_ARRIVED`: sets `driverHasArrived`, stays in `tracking` | `location { latitude, longitude }`, `arrivedAt` |
| `TRANSPORT_STARTED` | Driver confirms patient on board and a hospital | `on_scene` to `transporting` | `SERVER_TRANSPORT_STARTED`: `tracking` to `transporting` | `destination { hospitalId, name, latitude, longitude }`, `etaMinutes`, `onboardAt` |
| `HOSPITAL_ARRIVED` (**new**) | Driver confirms arrival at the hospital | `transporting` to `arrived_hospital` | none today (no event exists); target: a "arrived at hospital" state on the transport screen | `arrivedAt` |
| `MISSION_COMPLETED` | Sign-off complete | `arrived_hospital` to `completed` | `SERVER_MISSION_COMPLETED`: `transporting` to `awaitingReceipt` (accepted **only** from `transporting`) | `completedAt`, `finalFareInr`, `distanceKm`, `receiptPath` |
| `MISSION_CANCELLED` | Patient cancels, driver aborts, or dispatch cancels | any active status to `cancelled` | Translated to `CANCEL` with a fixed note; handled from `triaged`, `requesting`, `tracking` only; **ignored in `transporting`** | `cancelledBy` (`patient`, `driver`, `system`), `reason`, `note` |
| `DRIVER_RELEASED` (**new**, decision needed) | Driver aborts before the patient is on board | `en_route` or `on_scene` back to `requesting`, new wave | Target: return to the matching screen | `reason` |

**As built, the payload is identical for all five events:** `event`, `missionId`, `driverId`, `timestamp` (the example above). Only `event` is required by the guard, the type marks all four required, and there is no `data` object. The schemas below are the **target**; each adds `data` and the envelope fields, and older receivers that read only `event` and `missionId` keep working.

**Envelope fields (every lifecycle event, target):**

| Field | Type | Required | Rule |
| :--- | :--- | :-: | :--- |
| `v` | integer | yes | `1` |
| `type` | string | yes | `"lifecycle"` |
| `event` | string | yes | One of the event names in the table above. Receivers ignore unknown values. |
| `eventId` | string (UUID) | yes | Generated by the server; the deduplication key |
| `seq` | integer | yes | Per mission, starts at 1 and increases by 1 for each applied transition; equals `mission_events.seq` |
| `missionId` | string (UUID) | yes | Must equal the mission in the channel name |
| `driverId` | string (UUID) | no | The assigned driver; omitted on events with no driver (a patient cancel before assignment) |
| `state` | string | yes | `mission_status` after the event |
| `timestamp` | string (ISO 8601) | yes | Server time of the transition |
| `data` | object | yes | Event-specific content below; `{}` if none |

**`DRIVER_ACCEPTED`**

```json
{
  "v": 1,
  "type": "lifecycle",
  "event": "DRIVER_ACCEPTED",
  "eventId": "0b6f4c3e-0000-4000-8000-000000000003",
  "seq": 1,
  "missionId": "6f0c1e9a-0000-4000-8000-000000000001",
  "driverId": "b7d2a4c1-0000-4000-8000-000000000002",
  "state": "en_route",
  "timestamp": "2026-09-24T08:29:40.101Z",
  "data": {
    "driver": {
      "displayName": "First name and initial",
      "vehicleRegistration": "[Vehicle Reg. Redacted]",
      "ais125Type": "TYPE_D_ALS"
    },
    "maskedCall": { "number": "+91XXXXXXXXXX", "extension": "000" },
    "etaMinutes": 6
  }
}
```

| `data` field | Type | Required | Rule |
| :--- | :--- | :-: | :--- |
| `driver.displayName` | string | yes | First name and initial only; never a phone number or licence detail |
| `driver.vehicleRegistration` | string | yes | Plate as shown on the vehicle (a `GOVID` class field, so it is shown only to the patient of this mission) |
| `driver.ais125Type` | string | yes | Enum in §5.5 |
| `maskedCall.number` | string | no | Virtual relay number provisioned for this mission (E.164). If absent the app hides the call button rather than showing a fixed number. |
| `maskedCall.extension` | string | no | Digits |
| `etaMinutes` | integer | no | 0 or more; from the route at the moment of acceptance |

**`DRIVER_ARRIVED`**

```json
{
  "v": 1,
  "type": "lifecycle",
  "event": "DRIVER_ARRIVED",
  "eventId": "0b6f4c3e-0000-4000-8000-000000000005",
  "seq": 2,
  "missionId": "6f0c1e9a-0000-4000-8000-000000000001",
  "driverId": "b7d2a4c1-0000-4000-8000-000000000002",
  "state": "on_scene",
  "timestamp": "2026-09-24T08:37:12.550Z",
  "data": {
    "location": { "latitude": 28.5671, "longitude": 77.2102 },
    "arrivedAt": "2026-09-24T08:37:11.900Z",
    "distanceFromPickupM": 18
  }
}
```

| `data` field | Type | Required | Rule |
| :--- | :--- | :-: | :--- |
| `location.latitude`, `location.longitude` | number | yes | The driver's fix when the arrival slider completed |
| `arrivedAt` | string (ISO 8601) | yes | Device time of the confirmation |
| `distanceFromPickupM` | number | no | Computed by the server for audit. The server should refuse an arrival whose last known position is farther from the pickup than a configured threshold (the value is an operations decision). |

**`TRANSPORT_STARTED`**

```json
{
  "v": 1,
  "type": "lifecycle",
  "event": "TRANSPORT_STARTED",
  "eventId": "0b6f4c3e-0000-4000-8000-000000000006",
  "seq": 3,
  "missionId": "6f0c1e9a-0000-4000-8000-000000000001",
  "driverId": "b7d2a4c1-0000-4000-8000-000000000002",
  "state": "transporting",
  "timestamp": "2026-09-24T08:44:03.010Z",
  "data": {
    "destination": {
      "hospitalId": "c1a9e7f2-0000-4000-8000-000000000007",
      "name": "AIIMS New Delhi",
      "latitude": 28.5672,
      "longitude": 77.21
    },
    "onboardAt": "2026-09-24T08:44:02.400Z",
    "etaMinutes": 11,
    "wardStatus": "Trauma ICU alerted, bed held"
  }
}
```

| `data` field | Type | Required | Rule |
| :--- | :--- | :-: | :--- |
| `destination.hospitalId` | string (UUID) | yes | A row in `hospitals`; replaces the `hospitalName` route param that nothing sets today |
| `destination.name` | string | yes | Display name |
| `destination.latitude`, `destination.longitude` | number | yes | Hospital location |
| `onboardAt` | string (ISO 8601) | yes | Device time the patient was confirmed on board |
| `etaMinutes` | integer | no | Routed estimate to the hospital |
| `wardStatus` | string | no | Only when the hospital hold was actually made on the server; otherwise omitted |

**`MISSION_COMPLETED`**

```json
{
  "v": 1,
  "type": "lifecycle",
  "event": "MISSION_COMPLETED",
  "eventId": "0b6f4c3e-0000-4000-8000-000000000008",
  "seq": 5,
  "missionId": "6f0c1e9a-0000-4000-8000-000000000001",
  "driverId": "b7d2a4c1-0000-4000-8000-000000000002",
  "state": "completed",
  "timestamp": "2026-09-24T08:58:30.000Z",
  "data": {
    "completedAt": "2026-09-24T08:58:29.500Z",
    "distanceKm": 8.4,
    "finalFareInr": 585,
    "fareDetails": {
      "vehicleType": "TYPE_D_ALS",
      "jurisdiction": "DL",
      "totalDistanceKm": 8.4,
      "initialIncludedKm": 5.0,
      "baseFareInr": 500,
      "billableAdditionalKm": 3.4,
      "perKmRateInr": 25,
      "additionalDistanceFareInr": 85,
      "emtParamedicChargesInr": 0,
      "surgeMultiplier": 1.0,
      "surgeGougingAmountInr": 0,
      "estimatedTotalInr": 585,
      "currency": "INR",
      "tariffVersion": "2026-04-01",
      "computedAt": "2026-09-24T08:58:29.900Z"
    },
    "receiptPath": null
  }
}
```

| `data` field | Type | Required | Rule |
| :--- | :--- | :-: | :--- |
| `completedAt` | string (ISO 8601) | yes | Device time the sign-off completed |
| `distanceKm` | number | yes | The billable distance as decided in §8.2 (D-2), measured by the server |
| `finalFareInr` | integer | yes | 0 or more; equals `fareDetails.estimatedTotalInr`; **computed by the server**, never taken from the driver |
| `fareDetails` | object | yes | The itemised fare in §4.6, with the anti-gouging fields fixed at `0`, `1.0`, `0`. The statutory order reference and mandate texts are included as in §4.6 and omitted from this example for length. |
| `receiptPath` | string or null | yes | Object path in bucket `receipts` once the PDF exists; `null` if generation is still running, in which case a follow-up read of `missions.receipt_path` supplies it |

**`MISSION_CANCELLED`**

```json
{
  "v": 1,
  "type": "lifecycle",
  "event": "MISSION_CANCELLED",
  "eventId": "0b6f4c3e-0000-4000-8000-000000000009",
  "seq": 2,
  "missionId": "6f0c1e9a-0000-4000-8000-000000000001",
  "state": "cancelled",
  "timestamp": "2026-09-24T08:31:00.000Z",
  "data": {
    "cancelledBy": "patient",
    "reason": "found_alternative",
    "note": "Family arranged own transport",
    "fromState": "en_route"
  }
}
```

| `data` field | Type | Required | Rule |
| :--- | :--- | :-: | :--- |
| `cancelledBy` | string | yes | `patient`, `driver` or `system`. Removes the fixed "Cancelled by dispatch or driver" text the bridge invents today. |
| `reason` | string | no | For a patient cancel: `changed_mind`, `found_alternative`, `duplicate_request`, `other`. For `driver` or `system`: a free label from the server. |
| `note` | string | no | Up to 500 characters; required by the UI when `reason` is `other` |
| `fromState` | string | yes | `mission_status` before the cancel, so the app can choose a suitable end screen (for example a "call 108" state if the patient was already on board) |

**Proposed events** (not in the current vocabulary; the `data` objects are short):

| Event | Envelope `state` | `data` field | Type | Required | Rule |
| :--- | :--- | :--- | :--- | :-: | :--- |
| `HOSPITAL_ARRIVED` | `arrived_hospital` | `arrivedAt` | string (ISO 8601) | yes | Device time of the ER handoff slider |
| | | `hospitalId` | string (UUID) | yes | Matches the `TRANSPORT_STARTED` destination |
| `DRIVER_RELEASED` | `requesting` | `reason` | string | yes | `driver_backed_out`, `vehicle_breakdown` or `other` |
| | | `wave` | integer | no | Wave number now searching |

Coverage of the driver machine's events:

| Driver event | Wire event | Note |
| :--- | :--- | :--- |
| `ACCEPT_DISPATCH` | `DRIVER_ACCEPTED` | Published by the client today; server-confirmed in the target |
| `CONFIRM_ARRIVAL_SCENE` | `DRIVER_ARRIVED` | |
| `CONFIRM_PATIENT_ONBOARD` | `TRANSPORT_STARTED` | |
| `CONFIRM_ARRIVAL_HOSPITAL` | none | Gap: `HOSPITAL_ARRIVED` is proposed |
| `COMPLETE_MISSION` | `MISSION_COMPLETED` | |
| `ABORT_MISSION` | `MISSION_CANCELLED` | Cancels the patient's request instead of re-dispatching (G-05) |
| `GO_ONLINE`, `GO_OFFLINE`, `DECLINE_DISPATCH` | none | Not patient-visible; correct |

#### 6.4.4 Offer messages (`driver:{driverId}:offers`)

Today the hook's type is `{ offerId, missionId, expiresAt, [key: string]: unknown }` with a comment "payload shape flagged as Open Question", and offers come from a local generator (`mockDispatchWave.ts`) shaped `{ offerId, missionId, acuity, requiredVehicleType, pickup { district, jurisdiction, latitude, longitude, address, landmark }, distanceKm, etaMinutes }`. Target message:

```json
{
  "v": 1,
  "type": "offer",
  "offerId": "9a3e5d10-0000-4000-8000-000000000004",
  "missionId": "6f0c1e9a-0000-4000-8000-000000000001",
  "waveNumber": 1,
  "issuedAt": "2026-09-24T08:29:10.000Z",
  "expiresAt": "2026-09-24T08:29:25.000Z",
  "urgency": "CAT_1_IMMEDIATE",
  "requiredVehicleType": "TYPE_D_ALS",
  "jurisdiction": "DL",
  "pickup": {
    "latitude": 28.5672,
    "longitude": 77.21,
    "address": "Hauz Khas Village, South Delhi",
    "landmark": "Near Deer Park Main Gate"
  },
  "distanceKm": 2.4,
  "etaMinutes": 6,
  "patientSummary": {
    "primaryComplaint": "chest_pain",
    "derivedFlags": ["chest_pain", "cardiac_arrest"],
    "ageBand": "40-49",
    "sex": "M"
  }
}
```

| Field | Rule |
| :--- | :--- |
| `offerId` | The `dispatch_waves.id` for this wave (UUID) |
| `expiresAt` | Server time. The countdown must be computed as `expiresAt` minus the server-adjusted clock, not from a local counter of 15 (`OFFER_WINDOW_SECONDS`). |
| `urgency`, `requiredVehicleType` | Enums as in §5.5. Eligibility is strict equality of vehicle type. |
| `patientSummary` | The **only** clinical content shown to the driver. The P05 open question lists `patientAgeGender` and `chiefComplaint` as candidate fields, but the patient app collects no age or sex today, so `ageBand` and `sex` are optional and depend on the decision in §8.2. When absent the UI omits the line rather than inventing one. |

```json
{
  "v": 1,
  "type": "offer_revoked",
  "offerId": "9a3e5d10-0000-4000-8000-000000000004",
  "reason": "taken"
}
```

`reason` is one of `taken`, `cancelled`, `expired`. The driver machine has no event for it today; add `SERVER_OFFER_REVOKED` (`offered` to `standby`, with a "mission no longer available" notice). Offers reach a backgrounded app only through a server-sent push carrying the same content (the notification data model already uses `missionId`, `offerId`, `acuity`, `requiredVehicleType`, `address`, `landmark`, `pickupLat`, `pickupLng`, `distanceKm`, `etaMinutes` as strings).

#### 6.4.5 REST contracts

| Method and path | Caller | Purpose | Idempotency | Errors | Status |
| :--- | :--- | :--- | :--- | :--- | :-: |
| `POST /realtime/token` `{ scope, role? }` returns `{ token, channel, publish }` | Both apps | Mint a Centrifugo token | Not applicable; never cached; called on every reconnect | 401 no bearer, 403 scope not allowed | `IMPL` (dev minter, TTL 300 s) |
| `POST /missions` | Patient | Create the mission from the `REQUEST` event | `idempotencyKey` (unique per patient) | 409 with the existing mission on replay; 422 out-of-zone or bad fare | `PROP` |
| `POST /missions/{id}/cancel` `{ reason, note }` | Patient | Cancel before transport | Safe to repeat | 409 if already `transporting` or later | `PROP` |
| `GET /missions/{id}` (or PostgREST `missions` select) | Both | Snapshot for reconciliation (§7.5) | Read | 404 if not a participant | `PROP` (RLS `MIG`) |
| `POST /dispatch/offers/{offerId}/accept` | Driver | Claim the mission (path per P06) | `Idempotency-Key` header carrying `clientEventId` | 200; 409 `offer_taken`, `offer_expired` | `PROP` (client `STUB`) |
| `POST /dispatch/offers/{offerId}/decline` `{ reason }` | Driver | Decline (path per P06) | `Idempotency-Key` | | `PROP` |
| `POST /missions/{id}/transition` `{ event, payload }` | Driver | `event` in `ON_SCENE`, `PATIENT_ON_BOARD`, `ARRIVED_HOSPITAL`, `COMPLETE`, `ABORT` (the first four are the names already in `useMissionTransition.ts`) | `Idempotency-Key` (P06 lists this as an open question; this spec answers yes) | 200 `{ ok: true, status }`; 409 `{ error: "invalid_transition", from }` | `STUB` types, `PROP` server |
| `POST /presence` `{ isOnline, location, careLevel }` | Driver | Go online, heartbeat | Idempotent by value | 403 `crew_incomplete` | `STUB` (`usePresence.ts`) |
| `POST /consents`, `POST /erasure-requests` | Both | Record consent, queue erasure | `client id` | | `PROP` |

The `transition` endpoint validates the move against the same transition table as the domain machines and returns 409 with the current status when the driver is out of date. Its 200 response is what the driver machine should treat as the confirmation, rather than trusting the local send; this is exactly the rule P06 states and the current driver app does not follow.

#### 6.4.6 SMS fallback body (`IMPL`, formatting only)

`UP108:AMB <missionId> LOC:<lat, 4 dp>,<lng, 4 dp> SPD:<n>K Q:<queued count> T:<hh:mm:ss>`, for example `UP108:AMB 6f0c1e9a-0000-4000-8000-000000000001 LOC:28.5672,77.2100 SPD:58K Q:14 T:08:49:02`. It stays under the 140-character limit even with a UUID mission id. The app only opens the SMS composer; the driver must press send, and the recipient (default `108`) is an unverified assumption.

### 6.5 Token flow

1. The app obtains a Supabase access token (patient or driver).
2. It calls `POST /realtime/token` through Kong with `Authorization: Bearer <access_token>` and a `scope`.
3. The minter returns an HS256 token valid for 300 s. Patients receive a **subscription** token (`channel` claim, no `sub`); drivers requesting `role: "publisher"` receive a **connection** token (`sub`, no channel claim), because Centrifugo rejects a channel claim in a connection token.
4. The client hands the token to Centrifugo. On every reconnect or expiry the client's `getToken` callback fetches a fresh one; nothing is cached.

Target changes: the minter verifies the JWT signature and expiry, derives `sub` from it, checks the scope against the database (the caller owns the mission or is its assigned driver; the offers scope equals the caller's own id), issues per-channel subscription tokens for both roles, issues no publish capability at all (server publishes; GPS through a proxy that validates membership), and rejects any scope that is not a UUID. Much of this is already specified in `docs/prompts/driver-app/P05`: the gateway must reject with 403 unless `sub` equals the `{driverId}` in an offers scope, and must reject a publisher token unless `sub` equals `missions.driver_id` and the mission is in an active status. P05 names those statuses `assigned`, `en_route`, `on_scene`, `transporting`, whereas the database enum has `matched` and `arrived_hospital` (see §7.1). The development minter implements none of these checks. As built, the minter reads `sub` from the JWT payload without verifying it and falls back to `"dev-user"` when it cannot (`docker/mock-gateway/server.mjs:16`); the driver app sends the literal placeholder `demo_auth_token` (`driverLifecycle.store.ts:35`), and the patient captures the Supabase token in a closure at mount.

### 6.6 Redis

Redis is used today only as Centrifugo's engine (AOF on, 256 MB, `volatile-lru`, so only keys with a TTL can be evicted). The matcher's keys do not exist yet, and three naming conventions appear:

| Source | Convention |
| :--- | :--- |
| `HANDOVER.md` §19 | `drivers:geo:{DL\|UP}` (GEO set), `driver:presence:{id}` (`SET ... EX 30`) |
| Driver standby store (simulated) | `ambulances:geo:tier_d` style, TTL 60 s, sync every 3 s |
| Driver standby strings | Jurisdiction codes `UP_NOIDA`, `DL_SOUTH` |

Target: `drivers:geo:{zone}:{vehicle_type}` (GEO; the vehicle type is part of the key because eligibility is strict equality) and `driver:presence:{driverId}` (string holding `{ zone, type, ts }`, expiring after 30 s, refreshed by a heartbeat every 3 to 10 s). A GEO set has no per-member expiry, so the matcher must confirm the presence key still exists (and that the driver is verified in the database) before offering, and a sweeper must remove members whose presence key has lapsed.

### 6.7 Timing parameters

| Parameter | Value | Where |
| :--- | :--- | :--- |
| GPS cadence, on a mission | 3 s or 5 m (high accuracy foreground; best-for-navigation background) | `useDriverLocation`, `backgroundLocation.ts` |
| GPS cadence, idle and online | 10 s or 50 m (balanced) | `useDriverLocation` |
| Patient display flush for speed text | 2 s | `useMissionChannel.ts` |
| Offer window (driver) | 15 s, local timer | `dispatchOffer.core.ts:12` |
| Wave window (patient UI) | 45 s per wave, two waves | `matching.tsx` |
| Token TTL | 300 s | `server.mjs:8` |
| Centrifugo reconnect backoff | 500 ms minimum, 20 s maximum, exponential (centrifuge-js) | `missionChannel.service.ts:129`, `driverTelemetry.ts` |
| Lifecycle publish retry | Attempt at once, then after 3 s, then after 7 s (three attempts, about 10 s), then give up | `driverTelemetry.ts:107` |
| Recovery history (`mission`) | 20 publications, 300 s | `docker/centrifugo.json` |
| Offline queue | 1000 pings maximum; on overflow keep the first 10 and last 50 and every second ping between | `telemetryQueue.service.ts` |
| Restored banner | Auto-dismiss after 3.5 s | `useCentrifugoConnection.ts` |
| Kong rate limits | 20 req/min/IP for auth, 300 for REST, 120 for tokens | `docker/kong.yml` |

### 6.8 Hardening checklist

| Area | As built | Target |
| :--- | :--- | :--- |
| Anonymous connect | Allowed | Disallowed; every client presents a JWT-derived connection token |
| Publish authority | Namespace-wide `allow_publish_for_client`; token minter hands a publisher token to any bearer | Server publishes lifecycle; drivers publish GPS through a proxy that checks assignment |
| Token minter | Does not verify the JWT | Verify signature, expiry, role and mission membership |
| Origins | `*` | App origins only |
| Secrets | Development placeholders committed in configuration | Environment or secret store; rotate |
| Transport | `ws://` and `http://` locally | `wss://` and `https://` |
| Rate limits | Per IP in Kong (in-memory) | Per user for the token endpoint; shared store |
| Identifier shape | `[\w-]+` accepted | UUID only |
| Payload validation | Shape guards only | Schema validation at the proxy, including allowed `event` values and a mission-id match with the channel |

## 7. State Reconciliation

### 7.1 Five state vocabularies and one crosswalk

The same mission is named differently by five sources. Every reconciliation rule below relies on this table, and the server must implement it in one place.

| DB `mission_status` (`MIG`) | Patient machine state | Driver machine state | Wire event that enters it | Patient screen | Driver screen | `HANDOVER.md` invariant 3 | P05 / P06 task documents |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `requesting` | `requesting` (after client-only `idle`, `triaged`) | `offered` for the one driver being asked | none (created by `REQUEST`) | Matching radar | Offer modal | `requested` | `requested` |
| `matched` | `tracking` | `enRouteToPatient` | `DRIVER_ACCEPTED` | Tracking | Navigation | `allocated` | `assigned` |
| `en_route` | `tracking` | `enRouteToPatient` | `DRIVER_ACCEPTED` (same driver action) | Tracking | Navigation | `en_route_to_patient` | `en_route` |
| `on_scene` | `tracking` plus `driverHasArrived` | `onScene` | `DRIVER_ARRIVED` | Tracking, "arrived" step | On-scene care | `on_scene` | `on_scene` |
| `transporting` | `transporting` | `transporting` | `TRANSPORT_STARTED` | Transport | Hospital transit | `transporting` | `transporting` |
| `arrived_hospital` | `transporting` (no change) | `arrivedHospital` | none (`HOSPITAL_ARRIVED` proposed) | Transport | Sign-off | `arrived_hospital` | `arrived_hospital` |
| `completed` | `awaitingReceipt`, then `receiptConfirmed` | `standby` (no completed state) | `MISSION_COMPLETED` | Receipt | Standby | `completed` | `complete` |
| `cancelled` | `cancelled` | `standby` after `ABORT_MISSION`; no state or event for a server-side cancel | `MISSION_CANCELLED` | Cancelled | Standby | `cancelled` | `cancelled` |

Decisions recorded by this table:

- **`matched` and `en_route` describe one driver action.** There is no separate driver gesture between accepting and driving. In the target, the accept transaction sets `driver_id` and status `en_route` together and `matched` stays unused. If the business wants a distinct "assigned, not yet moving" status, add a driver action for it first. Removing the pool branch from `missions_select_driver` (R-06) removes the only current use of `matched`.
- **`idle`, `triaged`** exist only on the patient device (a mission draft); the database first sees a mission when the server creates it.
- **`receiptConfirmed`** is a patient acknowledgement after `completed`; store it as `missions.receipt_confirmed_at` plus `dispute_flag`, not as a status.
- **`arrived_hospital`** needs its own wire event so the patient stops seeing "in transit" while the driver signs off.

### 7.2 Machine transition tables (as built)

Any event with no row below is ignored: an XState transition that is not declared under the current state does nothing.

**Patient machine** (`patientLifecycle.machine.ts`):

| From | Event | To | Effect on context |
| :--- | :--- | :--- | :--- |
| `idle` | `SUBMIT_TRIAGE` | `triaged` | Stores `triageResult`; clears `error` |
| `triaged` | `REQUEST` | `requesting` | Stores `patientId`, `pickup`, `jurisdiction`, `vehicleType`; computes `fareDetails` from the event's `distanceKm` (default 8.4) |
| `triaged`, `requesting`, `tracking` | `CANCEL` | `cancelled` | Clears `missionId`, `driverHasArrived`, `error` |
| `requesting` | `SERVER_MISSION_ASSIGNED` | `tracking` | Sets `missionId` from the event payload |
| `tracking` | `SERVER_DRIVER_ARRIVED` | (stays) | `driverHasArrived = true` |
| `tracking` | `SERVER_TRANSPORT_STARTED` | `transporting` | `driverHasArrived = false` |
| `transporting` | `SERVER_MISSION_COMPLETED` | `awaitingReceipt` | none |
| `awaitingReceipt` | `CONFIRM_RECEIPT` | `receiptConfirmed` | none (never sent by any screen) |
| `receiptConfirmed`, `cancelled` | none | terminal | `reset()` builds a fresh actor |

There is deliberately no `CANCEL` from `transporting`, `awaitingReceipt` or `receiptConfirmed`.

**Driver machine** (`driverLifecycle.ts`):

| From | Event | To | Effect |
| :--- | :--- | :--- | :--- |
| `offline` | `GO_ONLINE` with a non-empty `ais125CertPath` | `standby` | Stores `driverId`, `ambulanceId`, `careLevel` |
| `offline` | `GO_ONLINE` with an empty path | `offline` | `error = AIS125_CERT_UNVERIFIED` |
| `standby` | `GO_OFFLINE` | `offline` | Clears offer |
| `standby` | `SERVER_OFFER_RECEIVED` | `offered` | Stores `activeOfferId`, `activeMissionId` |
| `offered` | `ACCEPT_DISPATCH` | `enRouteToPatient` | Clears offer, keeps mission |
| `offered` | `DECLINE_DISPATCH`, `SERVER_OFFER_TIMEOUT` | `standby` | Clears offer and mission |
| `enRouteToPatient` | `CONFIRM_ARRIVAL_SCENE` | `onScene` | |
| `onScene` | `CONFIRM_PATIENT_ONBOARD` | `transporting` | |
| `transporting` | `CONFIRM_ARRIVAL_HOSPITAL` | `arrivedHospital` | |
| `arrivedHospital` | `COMPLETE_MISSION` | `standby` | Clears mission |
| `enRouteToPatient`, `onScene`, `transporting`, `arrivedHospital` | `ABORT_MISSION` | `standby` | Clears mission and offer |

Missing from the driver machine: an event for a **server-initiated cancellation**, an event for a **revoked or lost offer** (`SERVER_OFFER_REVOKED`), and a forced-offline notice. The `GO_ONLINE` guard checks only that a certificate path string is non-empty.

### 7.3 Layering: wire payload, machine, store, screen

```text
 Wire payload --> guard --> translate --> XState actor.send --> snapshot --> Zustand set --> screens
                  (shape)   (wire name to   (transition table;     (value +      (selectors)     |
                             machine event)  illegal = ignored)      context)                      v
                                                                               route file calls router.push/replace
                                                                               (navigation lives outside machine and store)
```

Rules of the current code base that the target keeps:

- One module-singleton actor per app. Its snapshot is mirrored into a Zustand store on every transition. Screens read the store; route files call `send()` and, separately, `router.*`.
- `reset()` builds a fresh actor, because a stopped XState v5 actor cannot be restarted. Every exit from the patient booking flow must call it or the machine stays pinned in a terminal or mid-flow state. As built, `returnHome()` does this for completion, cancellation and the matching cancel, but the Back button on the tracking and transport screens leaves without a reset (`HANDOVER.md` §12).
- The driver store's `send` wraps the actor: it captures the snapshot before and after, asks `publishForTransition` whether a wire event applies (only when the state actually changed), then reconciles which mission the publisher is mounted for. The publisher is mounted as soon as an offer sets `activeMissionId`, well before acceptance, so the connection is ready.
- Cross-store coupling: `driverStandby.store` imports the lifecycle store and sends `GO_ONLINE` and `GO_OFFLINE`; it seeds the machine at import time.
- The route `mission/[id]` seeds a local `phase` from the machine state once and then advances by callbacks. It does not follow later machine changes, so a server-driven state change (once one exists) would not move the screen without a rule that derives the screen from `currentState` and keeps the intermediate review sub-states.

### 7.4 Target synchronisation sequence

As built (Design B, no server):

```text
 driver UI       driver machine + store        client publisher         Centrifugo          patient hook + bridge      patient machine + store
    | swipe accept        |                            |                    |                        |                          |
    |-- send ACCEPT ----->| offered -> enRouteToPatient|                    |                        |                          |
    |                     |-- state changed? yes ----->|                    |                        |                          |
    |                     |    publish DRIVER_ACCEPTED |---- publish ------>| mission:{id}           |                          |
    |                     |                            |                    |----------------------->| guard, translate         |
    |                     |                            |                    |                        |-- SERVER_MISSION_ASSIGNED>| requesting -> tracking
```

Target (Design A):

```text
 driver          SERVER                                                  Centrifugo         patient
   |-- POST /dispatch/offers/{id}/accept  (Idempotency-Key) -->  |               |             |
   |                          one transaction: conditional update of the mission (only if still unassigned),
   |                          set status en_route, state_version + 1, insert mission_events row with seq
   |<-- 200 { ok, status, seq } (driver machine advances now) ---|               |             |
   |                          publish { eventId, seq, state, data } to mission:{id}  --------->| seq check, apply, or
   |                                                                              |            | fetch snapshot on a gap
   |<-- 409 offer_taken / offer_expired  (loser: machine returns to standby via SERVER_OFFER_REVOKED)
```

### 7.5 Reconciliation rules (target)

| # | Rule | Why |
| :-: | :--- | :--- |
| 1 | The server is authoritative. A client machine advances on the server's 200 response or on a received event, never on its own tap. | P06's rule; removes the class of bugs where local and server state diverge |
| 2 | Every lifecycle event carries `eventId` and `seq`, equal to `mission_events.seq` and `missions.state_version`. | Gives clients a total order and a duplicate test |
| 3 | The client stores `lastSeq` per mission (persisted). `seq == lastSeq + 1`: apply. `seq <= lastSeq`: drop as a duplicate. `seq > lastSeq + 1`: a gap, so fetch the snapshot and events after `lastSeq`, then apply in order. | Detects loss without relying on channel history |
| 4 | The snapshot is a normal RLS read of `missions` and `mission_events` for a participant, which the existing policies already permit. | No new endpoint needed for reads |
| 5 | Add a `HYDRATE` path (restore the actor from a snapshot or a status) to both machines. As built the patient machine accepts events only in sequence, so a missed `TRANSPORT_STARTED` makes `MISSION_COMPLETED` a permanent no-op. | Lets a client jump forward |
| 6 | Take the mission id from the channel or the request, not from the payload. As built, `SERVER_MISSION_ASSIGNED` copies `missionId` out of the payload. | A mismatched or forged payload cannot rewrite context |
| 7 | Ignore unknown `event` or `type` values; never let a guard or translator throw inside the socket callback. | Forward compatibility and robustness |
| 8 | On any terminal state, clear persisted `lastSeq`, unsubscribe and reset. | Avoids stale state carrying into the next booking |
| 9 | On app launch, look up the caller's non-terminal mission (a one-row query, supported by the proposed partial index), hydrate, then subscribe. | Survives process death |
| 10 | Telemetry: drop any ping whose `timestamp` is not newer than the last applied. | Flushed and recovered pings can otherwise move the marker backwards |
| 11 | Offer countdown derives from the server's `expiresAt` corrected by a measured clock offset. | A local counter drifts and cannot represent early revocation |

### 7.6 Recovery scenarios

| Scenario | As built | Target |
| :--- | :--- | :--- |
| Patient app killed mid-mission | All state is in memory; a cold launch is always `idle`; the Home banner exists only for an in-memory `requesting`. The mission is orphaned. | Rule 9 |
| Socket drops during transport | Centrifugo `force_recovery` replays up to 20 publications within 300 s. GPS pings arrive about every 3 s on the same channel, so a lifecycle event is pushed out of the window after roughly 60 s. The patient hook ignores the subscription's recovery flags, so it cannot tell that events were lost. | Split GPS from lifecycle (§6.3) and use the snapshot (rule 3) |
| `TRANSPORT_STARTED` missed | Patient stays in `tracking`; `MISSION_COMPLETED` is then ignored (accepted only from `transporting`); the patient never reaches the receipt. | Rules 3 and 5 |
| Driver aborts while `transporting` or `arrivedHospital` | `ABORT_MISSION` is legal in those states and publishes `MISSION_CANCELLED`, but the patient machine has no `CANCEL` handler in `transporting`, so the event is dropped and the transport screen stays up with no way out except Back. | Decide policy (§8.2); at minimum add a handled `cancelled` path or a "contact 108" state |
| Driver aborts before pickup | Patient sees "Cancelled by dispatch or driver" and must start again. | Treat as `DRIVER_RELEASED`: return to matching and start a new wave |
| Patient cancels after acceptance | Patient machine cancels locally; nothing is published or sent. The driver never subscribed to the mission channel and keeps driving. | `POST /missions/{id}/cancel`; server publishes `MISSION_CANCELLED`; driver subscribes and handles it with a new machine event |
| Two drivers accept | Not modelled (no server, no `offer_taken`). | Conditional update; loser gets 409 and `offer_revoked` |
| Publish retried after a lost acknowledgement | A duplicate can reach the patient. The patient machine ignores it (see §7.8). | `eventId` dedupe |
| Forged lifecycle event | Accepted; the patient machine trusts it. | Server-only publish (§6.8) |
| Driver process killed mid-mission | Publisher, mission id and queue are gone; the background task drops fixes. | Persist the active mission id, and drive presence and GPS from the server-known assignment |
| Mission ends while the driver is offline | The driver machine has no event for it. | Snapshot on reconnect; server-cancel event |

### 7.7 Offline buffering, retry and backoff (as built)

| Mechanism | Scope | Behaviour | Persistence | Gap |
| :--- | :--- | :--- | :--- | :--- |
| Reconnect | Both apps | centrifuge-js exponential backoff with jitter, 500 ms to 20 s. The token callback fetches a fresh token every time. | n/a | None |
| Lifecycle publish retry | Driver | One FIFO promise chain per publisher, so events cannot reorder. Attempts at once, after 3 s and after 7 s. After the last failure `onPublishError` sets status `fallback` and shows the banner. Teardown waits until the chain drains. | Memory | An event that exhausts retries is dropped; the local state change stays applied; nothing reconciles with the server. |
| Telemetry publish | Driver | Fire-and-forget; a failure sets `fallback`. | None | Intentional |
| Offline ping queue | Driver | While `fallback` is active, fixes are queued (`ping_<epoch>_<random>`, coordinates to 6 decimals, heading and speed rounded, status `queued`, `syncing`, `synced` or `failed`, `retryCount`). Capacity 1000; on overflow keep the first 10 and last 50 and every second ping between. | Memory | Lost if the process ends |
| Queue flush | Driver | `flushQueue` marks pending pings `syncing`; if the sync function returns `true` all are removed and the count is reported. | Memory | **The sync function returns `true` without sending anything** (`useCentrifugoConnection.ts:46`): the pings are deleted and the banner says "restored, N synced" (G-10). |
| SMS fallback | Driver | The app opens the SMS composer with a 140-character body. | n/a | Manual; the number is assumed |
| Patient offline handling | Patient | None. No buffer; no visible indicator. | n/a | P-UX-06 |

Target for the flush: send the queue as one batch to the server, mark `deadZone`, use the unique key on `telemetry_logs` for idempotency, delete only on acknowledgement, and persist the queue (for example in SQLite or a secure file store) so it survives a restart.

### 7.8 Duplicate prevention

| Layer | As built | Target |
| :--- | :--- | :--- |
| Wire | None: no `eventId` or `seq` | `eventId` and `seq` (§6.4.1) |
| Driver publish | A wire event is produced only when the local state actually changed (before differs from after), so illegal or repeated taps publish nothing | Keep; add server idempotency keys |
| Patient machine | An event with no transition from the current state is ignored, which gives natural idempotence | Keep, plus `seq` |
| Mission creation | `idempotencyKey` is generated on the client but nothing honours it | Unique `(patient_id, idempotency_key)`; replay returns the existing mission |
| Telemetry | None | Unique `(mission_id, driver_id, recorded_at)`; drop older timestamps |
| Offer accept | None | Conditional update; `Idempotency-Key` |

How the patient machine treats a duplicate of each event today:

| Duplicate event | Result |
| :--- | :--- |
| `DRIVER_ACCEPTED` while `tracking` | Ignored (no handler) |
| `DRIVER_ARRIVED` while `tracking` | Sets the flag again; harmless |
| `DRIVER_ARRIVED` after `TRANSPORT_STARTED` | Ignored |
| `TRANSPORT_STARTED` while `transporting` | Ignored |
| `MISSION_COMPLETED` while `awaitingReceipt` | Ignored |
| `MISSION_CANCELLED` while `cancelled` | Ignored |

### 7.9 Two machines, two clocks

The patient and driver machines were written and tested separately (a cross-client test drives both actors through a mock channel). Their agreement rests on the wire vocabulary in §6.4.3 and on the crosswalk in §7.1, not on shared state. The remaining risk is the asymmetry in the tables above: the driver can move to states the patient machine cannot follow (`ABORT_MISSION` from `transporting`), and the patient can leave a mission (`CANCEL`) without the driver machine ever being told.

## 8. Gap Register, Decisions & Rollout

### 8.1 Gap register

Severity: **Critical** = harms a patient or driver, breaks the law, or lets an outsider forge state if shipped; **High** = blocks a working product; **Medium** = correctness or maintainability debt with a visible effect; **Low** = polish. "Rec." points to the recommendations in §8.3.

| ID | Sev | Area | Finding | Evidence | Rec. |
| :--- | :-: | :--- | :--- | :--- | :-: |
| G-01 | Critical | Patient UX | The matching screen renders a "Simulate Driver Acceptance (Test Flow)" button in every build; tapping it fakes a driver assignment with a hard-coded mission id. A patient in a real emergency could be shown "help is coming" with no dispatch behind it. | `matching.tsx:76,101`; `ActiveMatchingScreen.tsx:601-612` | R-01 |
| G-02 | Critical | Data integrity | Invented content is presented as real: driver name and plate on every mission; a masked-call number; an "Official EMR" share text with made-up vitals, bay and URL; a completion timestamp; "PAID"; a static privacy inventory ("248 coordinates", an ECG log, CPAP flow); the driver's offer text and "42, Male"; a sign-off pre-filled with a named physician and all boxes ticked; plausible default vitals. | `trackingStrings.ts:117,125`; `MissionTrackingScreen.tsx:117`; `MissionCompletionScreen.tsx:86-100,211`; `completionStrings.ts:124-172`; `IncomingMissionModal.tsx:458-462`; `InTransitHospitalScreen.tsx:72-79`; `OnSceneCareScreen.tsx:53-57` | R-01 |
| G-03 | Critical | Backend | No write path exists. Missions, profiles and driver rows are service-role-write only and there is no backend; `apps/dispatch-service`, which P06 says already exists, is absent. `REQUEST` triggers no I/O and neither app makes any PostgREST call. | `20260924000000_core_ems_schema.sql` grants; `apps/` contents; `confirm.tsx:81-95`; grep of network calls (§1.3) | R-02 |
| G-04 | Critical | Security | Anonymous connects are allowed; publish permission is namespace-wide; the token minter does not verify the JWT and hands a publisher token to any bearer. Any client can publish a forged `DRIVER_ACCEPTED`, `MISSION_COMPLETED` or GPS track. The driver uses the literal `demo_auth_token`. | `docker/centrifugo.json:7,15`; `server.mjs:16-22`; `driverLifecycle.store.ts:35`; `HANDOVER.md` §19 | R-03 |
| G-05 | Critical | Sync | Cancellation is one-way. A patient cancel after acceptance is never published; the driver does not subscribe and keeps driving. A driver abort during `transporting` or `arrivedHospital` publishes `MISSION_CANCELLED`, which the patient machine ignores in `transporting`, stranding the patient. A pre-pickup abort cancels the patient's request instead of re-dispatching. | `patientLifecycle.machine.ts` (no `CANCEL` under `transporting`); `driverLifecycleWire.core.ts:28-34`; `mission/[id].tsx` | R-02, R-07 |
| G-06 | High | Statutory | Jurisdiction uses bounding boxes. Gurugram, Faridabad and Noida Sector 18 resolve to `DL`; neighbouring states can resolve to `UP`; the Delhi box overlaps Noida and wins. Wrong tariff and wrong statutory reference. | `jurisdiction/index.ts:104-108,125-129` | R-12 |
| G-07 | High | Pricing | The category screen quotes with a function that has no 5 km included distance (Rs 710 for ALS at 8.4 km) while the machine locks Rs 585. Fare distance is hub-to-pickup, not the trip; a driver receipt uses a 5.6 km constant; nothing computes the real transport leg; the final fare is not server-recomputed. | `AmbulanceCategoryScreen.tsx:85` (call), `:362-365` (card total and formula), `:413-428` (confirm-button label); `pricing/index.ts:98,146`; `confirm.tsx:62`; `InTransitHospitalScreen.tsx:49`; `patientLifecycle.machine.ts:15` | R-11 |
| G-08 | High | Patient flow | Signing in sends the patient to pickup selection, skipping triage. `REQUEST` is accepted only from `triaged`, so from `idle` it is silently dropped while navigation carries on to matching. | `(auth)/phone-entry.tsx:14`; `patientLifecycle.machine.ts` (`REQUEST` under `triaged` only) | R-15 |
| G-09 | High | DPDP | Consent toggles are pre-ticked and never stored; `profiles.dpdp_consent_at` is client-writable; the deletion request is a local toggle; the promised 72-hour purge and retention tiers have no job or table; health text goes to a third-party LLM with no dedicated consent; coordinates go to public services. | `PhoneAuthScreen.tsx:60-61`; `DriverPhoneEntryScreen.tsx:37`; `MissionCompletionScreen.tsx:66,118`; `openRouterTriage.ts`; `routingService.ts:11` | R-13, R-09 |
| G-10 | High | Sync | The offline queue drains to nowhere: the flush function returns `true` without sending, the queue is in memory, and the UI reports "restored, N synced". | `useCentrifugoConnection.ts:44-60` | R-14 |
| G-11 | High | Identity | No code creates `profiles` or `drivers` rows, so after a real OTP login every RLS-protected read returns empty. Role has two sources (JWT metadata and `profiles.role`). Fake dev sessions cannot pass RLS. | Migrations (no trigger, no insert grant); `useOtpAuth.ts` (driver) | R-04 |
| G-12 | High | Sync | Mission state is unrecoverable: all stores are in memory; the patient machine cannot jump forward; recovery history is 20 publications and 300 s shared with GPS (about 60 s of protection); a killed driver process loses the mission id. | Store files; `docker/centrifugo.json:16-18`; `HANDOVER.md` §22 limit 2 | R-07 |
| G-13 | High | KYC | KYC is simulated: pre-filled demo profile, timer-based fake uploads, a fabricated submission result, an expiry check that fires only on empty input, unenforced EMT eligibility, no equipment attestation, and a go-online guard that checks only for a non-empty string. No bucket or document table exists. | `driverOnboarding.store.ts:88-148,224-235,245-331`; `driverLifecycle.ts` guard | R-10 |
| G-14 | High | Dispatch | Offers are a stub: `useDispatchOfferChannel` returns constants; offers come from a local generator; accept and decline are never sent; the 15 s countdown is local; there is no way to lose a race. | `useDispatchOfferChannel.ts`; `mockDispatchWave.ts`; `dispatchOffer.core.ts:12`; `offer.tsx` | R-02 |
| G-15 | Med | UX | Language does not persist across screens (patient) and there are three separate language stores (driver); `SUBMIT_TRIAGE.locale` is fixed to `"en"`. | P-UX-01, D-UX-06 | R-15 |
| G-16 | Med | UX | Keyboard avoidance only on auth screens; vitals inputs coerce empty to 0 with no ranges; swipe-only critical controls. | P-UX-04, D-UX-05, D-UX-10, D-UX-11 | R-15 |
| G-17 | Med | Data | Identifiers are not UUIDs in code (`MSN-...`, `DRV-DEMO-0001`, `PAT-ANONYMOUS-0001`, `OFFER-...`, `idem-...`); the minter accepts any `[\w-]+`. | §4.8; `server.mjs:9` | R-16 |
| G-18 | Med | Wire | The lifecycle guard checks only `event` is a string; the translator has no default and will call `send(undefined)`; `SERVER_MISSION_ASSIGNED` takes its mission id from the payload rather than the channel. | `mission-channel/index.ts:59-65`; `missionLifecycleBridge.ts`; `missionChannel.service.ts:147-148` | R-17 |
| G-19 | Med | Redis | Three naming conventions for presence and GEO keys; none implemented. | §6.6 | R-16 |
| G-20 | Med | Dispatch | Wave model disagrees: UI two waves of 45 s, table one to three, driver window 15 s; wave 2 loops forever with no "no ambulance" end state though the table has `exhausted`. | `ActiveMatchingScreen.tsx:131-151`; migration check | R-02, R-15 |
| G-21 | Med | Push | No client registers a push token; the table has no delete grant; a backgrounded driver receives nothing without server-sent push. | grep; migration grants; `HANDOVER.md` §21 | R-02 |
| G-22 | Med | Data | Hospital data drifts: six client fixtures against four seeded rows with different names; capacity fields the table lacks; a different selectable formula. | §4.5 | R-02 |
| G-23 | Med | RLS | Every verified driver can read every unassigned `matched` mission; `dispatch_waves` exposes peer driver ids; clients can write `dpdp_consent_at`, `is_online` and `current_location`; `mission_events` can be edited by `service_role`. | Migrations | R-05, R-06, R-08 |
| G-24 | Med | Architecture | `@sahayak/domain` performs network I/O (OSRM) despite the stated invariant of no network in the domain package, and depends on a public demo server. | `routingService.ts:11,60-80`; `HANDOVER.md` invariant 1 | R-09 |
| G-25 | Med | Driver UX | Simulation controls (simulate offer, battery, charging, GPS presets) and seeded metrics render in every build; the jurisdiction preset overwrites real GPS. | `standby.tsx`; `DriverStandbyScreen.tsx:129,195,566`; `driverStandby.store.ts:201-206` | R-01 |
| G-26 | Med | Security | The OpenRouter key is an `EXPO_PUBLIC_*` value bundled into the binary. | `openRouterTriage.ts:125`; `.env.example` warning | R-09 |
| G-27 | Low | Patient UX | No connection indicator; static ETA, distance, "3 NEARBY"; tracking route drawn from a fixed hub rather than the driver's position; chat has no transport. | P-UX-05, P-UX-06 | R-15 |
| G-28 | Low | Statutory | Tariff amounts, the tariff version and gazette references are unverified against the cited orders; amounts are identical for DL and UP; `computedAt` is stamped by the client clock. | `pricing/index.ts` | R-11 |

### 8.2 Decisions needed

Each item blocks a schema or protocol choice above. A recommended default is given so work can proceed if no owner answers.

| # | Decision | Options | Recommended default |
| :-: | :--- | :--- | :--- |
| D-1 | **Anonymous emergency booking.** "Quick Emergency Access" skips login, but a mission needs a patient row and the driver needs a callable number. | (a) Require a phone OTP before dispatch. (b) Anonymous session with an unverified phone. | (a), keeping "Call 108" one tap away on every screen |
| D-2 | **Billable distance and when it is known.** The patient books before the destination is chosen (the driver picks the hospital on scene). | Statutory order text decides: transport leg only, or hub-to-pickup-to-hospital. | Quote an estimate, label it as such, and compute the final fare on the server from the measured transport leg. Confirm the definition against the gazette order. |
| D-3 | **Driver abort semantics.** | Cancel the patient's request, or re-dispatch. Separate policy once the patient is on board. | Re-dispatch before pickup (`DRIVER_RELEASED`); after pickup treat as an incident requiring dispatcher action and show the patient a "call 108" state. |
| D-4 | **Meaning of `matched`.** | Unassigned pool marker, or assigned. | Unused; accept sets `en_route` (§7.1). |
| D-5 | **Wave configuration.** | Two or three waves; radii; windows. | Three waves at 3, 6 and 10 km, 45 s wave window, 15 s per-driver offer; values come from the server |
| D-6 | **Patient age and sex.** The driver's offer implies them; the patient app collects neither. | Capture an age band and sex at triage, or remove from the offer UI. | Capture an optional age band and sex; omit the line when absent |
| D-7 | **Prescription attachments** (`medical-prescriptions`). | Add an attach step, or drop the bucket. | Drop until the product asks for it |
| D-8 | **Handoff record retention** ("permanent in the hospital ABHA/NDHM record"). | Integrate, or keep on the 30-day rule. | Keep on the 30-day rule and correct the UI text until an integration exists |
| D-9 | **Payments.** The receipt says "PAID". | Build a payment model, or change the copy to "fare payable". | Change the copy now; model payments separately |
| D-10 | **In-app chat.** A modal exists with no transport. | Build on a channel, or remove. | Remove |
| D-11 | **Crew model.** An AIS-125 Type D unit staffs a driver plus a paramedic, but onboarding collects one licence and one EMT certificate for a single person and the `drivers` table models one person. The P04 task doc already anticipates a `crew_incomplete` error. | Add a crew table (driver plus paramedic as separate verified people), or define the driver as the EMT. | Add `crew_members` linked to the vehicle before the first Type D go-live |

### 8.3 Recommendations

| Rec. | Action | Closes |
| :-: | :--- | :--- |
| R-01 | Gate every simulation and test control behind `__DEV__`; delete fabricated strings; render only server-supplied values or hide the field. | G-01, G-02, G-25 |
| R-02 | Build the mission API and dispatch service: create (idempotent), cancel, accept and decline, transition, snapshot, presence, push registration; one transition table shared with the domain machines. | G-03, G-05, G-14, G-20, G-21, G-22 |
| R-03 | Secure the real-time plane: JWT-verifying token service, no anonymous connect, server-only lifecycle publish, a GPS publish proxy that checks assignment, per-scope authorisation, origin and secret hygiene, `wss`. | G-04 |
| R-04 | Provision `profiles` and `drivers` rows from the verified auth event with the role fixed server-side; pick one role source. | G-11 |
| R-05 | Move presence to the server (Redis plus a heartbeat call); revoke client writes on `drivers.is_online` and `drivers.current_location`, and on `profiles.dpdp_consent_at`. | G-23 |
| R-06 | Tighten RLS: drivers read only missions assigned to them; hide the eligible-driver array behind a view or remove client access to `dispatch_waves`. | G-23 |
| R-07 | Persist `lastSeq` and the active mission id; add a `HYDRATE` path to both machines; resume on launch; split GPS from lifecycle channels; subscribe the driver to its mission channel; handle recovery flags. | G-05, G-12 |
| R-08 | Make `mission_events` append-only; implement retention jobs; partition `telemetry_logs`. | G-23, §5.6 |
| R-09 | Send third-party calls (LLM, routing, geocoding) through gateway functions the operator controls; keep provider keys server-side; prefer India-resident routing or self-hosted OSRM; remove the routing network call from the domain package. | G-09, G-24, G-26 |
| R-10 | Real KYC: `driver_vehicles`, `driver_documents`, buckets, review workflow, date parsing, equipment attestation, tier-versus-EMT-level enforcement. | G-13 |
| R-11 | One fare function and one distance definition; server-computed final fare; anti-gouging check in the database; verify the tariff against the orders. | G-07, G-28 |
| R-12 | Decide jurisdiction on the server from polygons (`jurisdictions` table); keep the box only as an instant hint. | G-06 |
| R-13 | DPDP: unticked defaults, `consent_records`, `erasure_requests` with a 72-hour job, an honest privacy panel generated from real data, explicit consent for third-party processing. | G-09 |
| R-14 | Real batch flush with acknowledgement and a persisted queue; never report "synced" before the server acknowledges. | G-10 |
| R-15 | UX corrections: an app-wide persisted language store, keyboard avoidance, triage on every entry path, a connection indicator, a terminal "no ambulance" state, safe exits that reset the machine, accessible alternatives to swipe controls. | G-08, G-15, G-16, G-20, G-27 |
| R-16 | Normalise identifiers to UUID and Redis keys to one convention; tighten the minter's scope pattern. | G-17, G-19 |
| R-17 | Harden the wire: validate `event` values, never throw in socket callbacks, take the mission id from the channel. | G-18 |

### 8.4 Suggested order

| Phase | Work | Exit check |
| :-: | :--- | :--- |
| 0 | No backend needed: R-01, the triage step on the sign-in path (G-08), the category preview using the itemised function (G-07 first half), unticked consent defaults, and the misleading "synced" claim. | A release build shows no test controls or invented data; a Hindi user stays in Hindi. |
| 1 | Push the migrations to a staging project; run the Supabase advisors; R-04, R-12, R-11, R-02 (create, accept, transition, cancel, snapshot). | A real OTP user can book and be assigned; RLS checked with real JWTs. |
| 2 | R-03, R-07, R-17. | A forged event is rejected; killing either app mid-mission and relaunching resumes the mission. |
| 3 | R-10, R-05, offers over the channel (G-14), push registration. | A verified driver goes online, receives an offer in the background, and can lose a race safely. |
| 4 | R-13, R-09, R-08, R-14. | Consent evidence, erasure and retention jobs run; no health text or coordinates leave the controlled boundary unrecorded. |
| 5 | R-15, R-16, D-1 to D-11 resolved and reflected here. | Device pass and screen-reader pass complete. |

### 8.5 Device verification checklist (turns static findings into observed facts)

1. Build a release variant and confirm no "Simulate ..." control or simulator toggle appears anywhere (G-01, G-25).
2. Choose Hindi at onboarding and walk the whole booking; note every screen that reverts to English (P-UX-01).
3. Open the triage description field and the pickup search box with the keyboard up on a small Android phone and on iOS; confirm the field and its suggestions stay visible (P-UX-04).
4. Sign in from onboarding, complete pickup, category and confirm, and observe what the machine does when `REQUEST` arrives in `idle` (G-08).
5. Enable airplane mode mid-mission on both apps; observe indicators, the queue count, and what the "restored" banner says on reconnect (G-10, P-UX-06).
6. Force-stop each app mid-mission and relaunch (G-12).
7. Complete a mission on a device and read the EMR share text and the receipt (G-02).
8. Cancel from the patient app after a driver is assigned and watch the driver app (G-05).
9. Run TalkBack and VoiceOver over the emergency path and try the swipe controls with assistive tech (P-UX-11, D-UX-10).

### 8.6 Sources reviewed

`apps/patient` and `apps/driver`: every file under `app/`, the stores, services, hooks and i18n dictionaries, plus the screen props and state of all screens (the two largest, `DriverOnboardingScreen` and `DriverStandbyScreen`, were read for inputs, state and store wiring rather than line by line). `packages/domain` (types, triage, pricing, jurisdiction, mission-channel, routing, both state machines). `supabase/migrations/20260924000000_core_ems_schema.sql` and `20260924000001_operational_ems_schema.sql`. `docker/centrifugo.json`, `docker/kong.yml`, `docker/mock-gateway/server.mjs`, `docker-compose.yml`. `HANDOVER.md` and the `docs/prompts` task documents P05 and P06 for the driver app.
