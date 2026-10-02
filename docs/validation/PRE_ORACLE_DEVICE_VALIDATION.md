# Pre-Oracle physical-device validation

Status: 2026-10-02. **No device test has been executed.** Every row below is `NOT RUN`. Two blockers stopped execution
(section 2). Predicted outcomes come from code reading, not observation.

## 1. Phase 1: current state

| Check | Result |
|---|---|
| Changes outside `apps/patient`, `apps/driver` (supabase/, packages/, docker/) | None. 69 tracked files changed + 4 new patient files (profile screen/strings/lib/route), 1 deleted (`SearchRadar.tsx`), plus untracked `Ek-Ambulance.md` |
| SQL / dispatch / fare / GPS / KYC server logic | Unchanged (no `supabase/` diff) |
| Patient typecheck | PASS |
| Driver typecheck | PASS |
| Patient tests | PASS: 10/10 files, exit 0 |
| Driver tests | PASS: exit 0, but the chain runs **18** files, not 15 as stated |

Unexpected / worth flagging (not touched):

1. **Auth transport changed.** Both `src/lib/supabaseClient.ts` now call `EXPO_PUBLIC_SUPABASE_URL` directly instead of the Kong gateway. This contradicts "no auth changes". It is the fix that made real-phone sign-in possible, since Kong only exists on the dev machine. Keep it deliberately, or revert it.
2. **New auth gate** in `apps/patient/app/_layout.tsx`: a signed-out user is redirected to Welcome from any non-`(auth)` route.
3. **Anon key hard-coded** in every `eas.json` profile, including `production`. It is public by design, but it is now in git.
4. **Stale comment:** `apps/patient/src/lib/missionApi.ts:17` still says "Every call goes through Kong".
5. `IS_DEV` → `IS_TEST_RUNNER` in the driver stores. Dev builds on a phone no longer seed demo identity, GPS or forms. This is intended (fabricated data removed).
6. `driverServer.core.ts`: new error-message mappings only (`driver_profile_missing`, `invalid_location`, `unauthenticated`).

## 2. Blockers that stopped execution

| # | Blocker | What clears it |
|---|---|---|
| B1 | No device on `adb devices` | Plug both phones in over USB (USB debugging on). Logcat and screenshots can then be captured |
| B2 | Hosted DB not readable from this session: the Supabase connector does not have project `nzwbwuhbtqhhjwnopwmm`, and service-key REST reads were refused by the permission policy | Run the SQL in section 4 in Studio and paste the output, or allow the read |
| B3 | Driver eligibility on the hosted project is unknown (previously reported: no driver row) | Section 3 |

## 3. Phase 2: legitimate path to one eligible driver

Server rules (code-verified):

- `dispatch_next_wave` picks drivers that are `is_online AND is_verified AND ais125_type = mission.vehicle_type AND last_seen_at > now()-30s`, within `radiiKm` [3, 6, 10] km of the pickup, and not on a mission.
- Board (`list_nearby_emergencies`): same type, within `boardRadiiKm` [4, 7, 10] km. `waveWindowSeconds` = 45, `searchTtlSeconds` = 345.
- `create_mission` calls `dispatch_next_wave` **inline**. If no driver is eligible at that moment, all waves run empty at once and the mission is **cancelled immediately**. **The driver must be online and in range before the patient confirms.**
- The driver heartbeat is a 10 s JS `setInterval` (`useServerSync.ts:31`). Android pauses this when the app is backgrounded or the screen is off, so `last_seen_at` goes stale after 30 s. **Keep the driver app foregrounded with the screen on.**

Steps (all through existing flows, nothing inserted by hand):

1. Driver phone: sign in with OTP using the driver test number. This creates `auth.users` + `profiles`.
2. Profile → Complete driver application → onboarding wizard. This calls `upsert_driver_application` (creates the `drivers` row + vehicle with `ais125_type`), then document uploads, then `submit_kyc`, which sets `kyc_status = pending_verification`.
3. **Approval: a human operator action, outside the apps.** Pick one:
   - a) Admin console (`apps/admin`, `pnpm --filter admin dev`). Needs a staff account: `auth.users.raw_app_meta_data.role = 'staff'`, which only service_role or the dashboard can set. There is **no documented provisioning step** in `docs/`, which is a gap.
   - b) Supabase Studio SQL editor: `select public.approve_kyc('<driver uuid>');` (service_role only, the documented MVP path in `20260928000001_approve_kyc.sql`).
4. Driver: Standby → Go online with a real GPS fix. This calls `set_driver_presence(true, lat, lng)`, then a heartbeat every 10 s.
5. The patient pickup must be ≤ 3 km from the driver (first wave), and the patient must choose the category whose AIS-125 type equals the driver's vehicle type.

Do **not** use `apps/patient/src/integration/*.e2e.ts` to create the driver; those seed rows with the service key.

## 4. SQL to run in Studio (read-only)

```sql
-- driver eligibility
select d.id, d.kyc_status, d.is_verified, d.is_online, d.ais125_type, d.last_seen_at,
       now() - d.last_seen_at as age, d.current_location is not null as has_loc,
       v.registration_number, v.make_model, v.color, v.crew_count, v.is_active
from public.drivers d left join public.driver_vehicles v on v.driver_id = d.id;

-- roles (phone tail only)
select u.id, u.raw_app_meta_data->>'role' as app_role, p.role as profile_role, right(u.phone,4) as phone_tail
from auth.users u left join public.profiles p on p.id = u.id;

-- documents
select driver_id, status, count(*) from public.driver_documents group by 1,2;

-- latest missions + events
select id, status, vehicle_type, driver_id, state_version, created_at from public.missions order by created_at desc limit 5;
select mission_id, seq, event_type, to_status, metadata, created_at from public.mission_events
 where mission_id = '<mission uuid>' order by seq;
select wave_number, radius_km, cardinality(eligible_driver_ids) n, status, accepted_by from public.dispatch_waves
 where mission_id = '<mission uuid>' order by wave_number;

-- is realtime publishing configured at all?
select name from vault.decrypted_secrets where name in ('centrifugo_api_url','centrifugo_api_key');
```

## 5. Setup preconditions for device runs

- Development EAS profile: `EXPO_PUBLIC_GATEWAY_URL=http://localhost:8000`. Triage (`/triage/extract`) and realtime token mint go through Kong, so run `pnpm services:up` and then `pnpm adb:reverse` with **both phones on USB**. Without this, triage and channel failures are infrastructure, not UX.
- Evidence capture per step: `adb -s <serial> exec-out screencap -p > docs/validation/evidence/<id>.png` and `adb -s <serial> logcat -d ReactNativeJS:V *:S > <id>.log`.

## 6. Phase 3: test matrix

Apply this checklist to **every** row. Note the failing item code in the result column.

`SA` safe area · `CL` clipped text · `OV` overlapping controls · `NB` bottom nav / gesture area · `KB` keyboard · `LD` loading state · `BT` disabled/enabled buttons · `ER` error state · `BK` back navigation · `RS` restart persistence · `RV` real values, no placeholders · `DB` no debug terms · `FD` no fabricated data

### Patient

| ID | Screen / step | Key specific checks | Predicted pre-Oracle | Result |
|---|---|---|---|---|
| P1 | Welcome | Sign in / Create account / Call 108; no flash when already signed in | OK | NOT RUN |
| P2 | Sign in | 10-digit input, paste "+91 …" normalises | OK | NOT RUN |
| P3 | Create account | Wording differs from sign-in (`mode=signup`) | OK | NOT RUN |
| P4 | OTP | Auto-advance, resend cooldown, wrong-code error | OK | NOT RUN |
| P5 | Home | Real name/phone, no seeded data | OK | NOT RUN |
| P6 | Profile | Name save persists (`profiles.full_name`), consents listed | OK | NOT RUN |
| P7 | Sign out | Returns to Welcome; deep routes are blocked | OK | NOT RUN |
| P8 | Sign back in | Lands on Home; active mission resumes | OK | NOT RUN |
| P9 | Triage | Needs gateway (section 5) | Fails without Kong | NOT RUN |
| P10 | Location | Real GPS fix; permission-denied path | OK | NOT RUN |
| P11 | Category | Must match driver's `ais125_type` | OK | NOT RUN |
| P12 | Fare confirmation | Sheet collapsed by default; withheld without real pickup | OK | NOT RUN |
| P13 | Searching | Countdown matches server `created_at` | **Stays here after driver accepts** (no Centrifugo, no polling) | NOT RUN |
| P14 | Matched / tracking | Driver name, plate, vehicle, crew | Reached only via restart (P19) | NOT RUN |
| P15 | Transporting | Hospital, plate | Same realtime dependency | NOT RUN |
| P16 | Completion | Fare / receipt | Same realtime dependency | NOT RUN |
| P17 | Cancellation | Patient cancel during Searching; server status `cancelled` | OK (RPC, then local state) | NOT RUN |
| P18 | Call 108 | Opens dialer from Welcome, cancelled screen | OK | NOT RUN |
| P19 | Restart with active mission | Kill app, reopen | **Predicted defect:** tracking opens with status `en_route` but **no driver card** (section 8) | NOT RUN |

### Driver

| ID | Screen / step | Key specific checks | Predicted pre-Oracle | Result |
|---|---|---|---|---|
| D1 | Sign in | Phone normalisation | OK | NOT RUN |
| D2 | OTP | As P4 | OK | NOT RUN |
| D3 | Standby | Offline by default, no demo identity | OK | NOT RUN |
| D4 | Profile | Real profile from `get_driver_profile` | OK | NOT RUN |
| D5 | Application state | Wizard empty on a phone (no seeded DL/plate) | OK | NOT RUN |
| D6 | KYC status | pending → approved after operator action | OK | NOT RUN |
| D7 | Go online | `not_verified` message before approval; GPS required | OK | NOT RUN |
| D8 | Incoming offer (modal) | Pushed only via Centrifugo `driver:<id>:offers` | **Not delivered pre-Oracle (expected)** | NOT RUN |
| D8b | Booking board | Mission appears within ~5 s (`BOARD_POLL_MS`) | OK | NOT RUN |
| D9 | Accept / claim | Board → `claim_emergency`; or modal → `accept_offer` | Board path OK | NOT RUN |
| D10 | Navigation | Real route to pickup | OK | NOT RUN |
| D11 | On scene | Vitals entry, keyboard | OK | NOT RUN |
| D12 | Transport | Hospital pick, hold taken | OK | NOT RUN |
| D13 | Completion | Final fare | OK | NOT RUN |
| D14 | Sign out | Goes offline first (`setPresence(false)`) | OK | NOT RUN |

## 7. Phase 4: real dispatch run (order matters)

1. Driver approved (section 3), online, app foregrounded. SQL: `is_online`, `age < 30s`, `has_loc`.
2. Patient within 3 km, matching category → Confirm. SQL: mission `requesting`, `dispatch_waves` wave 1 `broadcasting`, `n ≥ 1`.
   If the mission is `cancelled` immediately, the driver wasn't eligible at creation time.
3. Driver: board shows it → Claim. SQL: mission `en_route`, `driver_id` set, `mission_events` has `DRIVER_ACCEPTED` with `metadata.driver`.
4. Patient: expected to remain on Searching (no realtime). Kill and reopen the app → expect the tracking route (P19).

## 8. Phase 5: DRIVER_ACCEPTED contract

**Mixed model.** Driver details follow **model A**: they exist only inside the event payload. Status recovery follows **model B**: it reads the `missions` row.

- `accept_offer` / `claim_emergency` → `_record_event(..., 'DRIVER_ACCEPTED', metadata = {driver: _driver_public_info(uid)})`. This is persisted in `mission_events.metadata` and published by the `mission_events_publish` trigger to `mission:<id>` via `publish_realtime`, which is a silent no-op when the vault secrets are absent.
- Patient: `translateLifecycleMessage` → `readDriverAccepted(data)` → `SERVER_MISSION_ASSIGNED { driver, maskedCall, etaMinutes }`.
- Resume (`useResumeActiveMission`) and snapshot (`fetchMissionSnapshot`) read only `missions` columns. They carry **no driver fields**.

Cold-resume gap (code-traced): the resume hook HYDRATEs to `en_route` and persists `lastSeq = state_version`. `state_version` always equals the last event's `seq` (`_record_event`). `[id]` then mounts with a non-idle machine, so `reconcile("auto")` → `fetchEventsAfter(state_version)` returns nothing → the driver is never replayed. The tracking screen has no driver card after restart. Not fixed here, because the contract is frozen.

| Field | Source today | In DRIVER_ACCEPTED? | Authoritative source to use |
|---|---|---|---|
| Ambulance type | `drivers.ais125_type` (also `missions.vehicle_type`) | Yes, `driver.ais125Type` | same |
| Plate | `driver_vehicles.registration_number` (active) | Yes, `vehicleRegistration` | same |
| Driver first name | `profiles.full_name` | Yes, but formatted as **"First L."** (`displayName`) | same |
| Make/model, colour | `driver_vehicles.make_model`, `.color` | Yes | same |
| Crew size | `driver_vehicles.crew_count` | Yes, `crewCount` | same |
| ETA | **Not produced.** The client reads `etaMinutes`, but the server sets it only on `TRANSPORT_STARTED` (driver-supplied) | No | Server-side routing from `drivers.current_location` → pickup (the same OSRM/Maps route the apps already call) |
| Distance | **Not produced** for the patient. The server already computes `st_distance(driver.current_location, pickup)` for offers and board | No | That same server computation at accept time, then live from driver telemetry |
| Masked phone | **Not produced anywhere.** The client reads `maskedCall.number`, and the call button is hidden when absent | No | A call-masking provider (none in the repo) |

## 9. Remaining blockers before Oracle

1. B1–B3 above (devices, DB visibility, one approved driver).
2. No staff-account provisioning procedure is documented.
3. Patient never leaves Searching without Centrifugo, and there is no polling fallback. This is accepted as-is per the task.
4. Cold-resume driver-card gap (section 8). It affects post-Oracle behaviour too, so decide on the contract (embed vs fetch) before Oracle.
5. Driver heartbeat stops when the app is backgrounded, so the driver drops out of dispatch after 30 s.
6. ETA, distance and masked phone have no producer.

## 10. Device-only UX issues

None observed yet. Nothing has run on a device.
