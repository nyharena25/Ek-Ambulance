-- Behavioural checks for migrations 20260924000000..4 (DATA_AND_SYNC_SPECIFICATION.md sections 5-7).
--
-- Runs against a LOCAL database only (`supabase start`, or a scratch supabase/postgres container). It creates
-- users and missions and does not clean up, so never point it at a real project. As `postgres`:
--   supabase db reset && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -q -f supabase/tests/mission_api.behaviour.sql
-- Every check is a SELECT that raises on failure; the script prints `ok` per check and `ALL BEHAVIOUR CHECKS PASSED`.
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

drop schema if exists t cascade;
create schema t;
grant usage on schema t to authenticated, anon;

create function t.eq(actual anyelement, expected anyelement, msg text) returns text language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL %: expected %, got %', msg, expected, actual;
  end if;
  return 'ok ' || msg;
end $$;

create function t.ok(cond boolean, msg text) returns text language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL %', msg; end if;
  return 'ok ' || msg;
end $$;

-- Runs a statement and requires it to fail with the given SQLSTATE (PT409 = HTTP 409, 42501 = permission denied ...).
create function t.raises(stmt text, state text, msg text) returns text language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlstate <> state then raise exception 'FAIL %: expected SQLSTATE % got % (%)', msg, state, sqlstate, sqlerrm; end if;
    return 'ok ' || msg;
  end;
  raise exception 'FAIL %: expected SQLSTATE % but the statement succeeded', msg, state;
end $$;
grant execute on all functions in schema t to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Fixtures. Synthetic ids only.
-- ---------------------------------------------------------------------------
\set p1 '00000000-0000-4000-8000-0000000000a1'
\set p2 '00000000-0000-4000-8000-0000000000a2'
\set d1 '00000000-0000-4000-8000-0000000000b1'
\set d2 '00000000-0000-4000-8000-0000000000b2'
\set d3 '00000000-0000-4000-8000-0000000000b3'
\set spoof '00000000-0000-4000-8000-0000000000c1'
\set k1 '00000000-0000-4000-8000-0000000000e1'
\set k2 '00000000-0000-4000-8000-0000000000e2'
\set k3 '00000000-0000-4000-8000-0000000000e3'
\set k4 '00000000-0000-4000-8000-0000000000e4'

insert into auth.users (id, phone, raw_app_meta_data, raw_user_meta_data, aud, role) values
  (:'p1',    '919876500001', '{}',                    '{}',                    'authenticated', 'authenticated'),
  (:'p2',    '919876500002', '{}',                    '{}',                    'authenticated', 'authenticated'),
  (:'d1',    '919876500011', '{"role":"driver"}',     '{}',                    'authenticated', 'authenticated'),
  (:'d2',    '919876500012', '{"role":"driver"}',     '{}',                    'authenticated', 'authenticated'),
  (:'d3',    '919876500013', '{"role":"driver"}',     '{}',                    'authenticated', 'authenticated'),
  -- role in client-controlled user_metadata must be ignored
  (:'spoof', '919876500099', '{}',                    '{"role":"driver"}',     'authenticated', 'authenticated');

select t.eq((select role from public.profiles where id = :'p1'), 'patient', 'profile provisioned for a patient');
select t.eq((select role from public.profiles where id = :'d1'), 'driver', 'driver role comes from app_metadata');
select t.eq((select role from public.profiles where id = :'spoof'), 'patient', 'raw_user_meta_data role is ignored');
select t.eq((select phone from public.profiles where id = :'p1'), '+919876500001', 'phone normalised to E.164');

-- An OTP signup has no role yet; staff set app_metadata afterwards and the profile must follow (advisor item 3).
insert into auth.users (id, phone, raw_app_meta_data, raw_user_meta_data, aud, role)
  values ('00000000-0000-4000-8000-0000000000c2', '919876500098', '{"provider":"phone"}', '{}', 'authenticated', 'authenticated');
select t.eq((select role from public.profiles where id = '00000000-0000-4000-8000-0000000000c2'), 'patient', 'OTP signup starts as a patient');
update auth.users set raw_app_meta_data = '{"provider":"phone","role":"driver"}' where id = '00000000-0000-4000-8000-0000000000c2';
select t.eq((select role from public.profiles where id = '00000000-0000-4000-8000-0000000000c2'), 'driver', 'role set later in app_metadata reaches profiles');
update auth.users set raw_user_meta_data = '{"role":"patient"}' where id = '00000000-0000-4000-8000-0000000000c2';
select t.eq((select role from public.profiles where id = '00000000-0000-4000-8000-0000000000c2'), 'driver', 'user_metadata edits never change the role');
delete from auth.users where id = '00000000-0000-4000-8000-0000000000c2';

-- Drivers: application through the RPC (drivers has no client write grant), vehicle + documents under RLS.
\set jwt_d1 '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}'
\set jwt_d2 '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}'
\set jwt_d3 '{"sub":"00000000-0000-4000-8000-0000000000b3","role":"authenticated"}'
\set jwt_p1 '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}'
\set jwt_p2 '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}'

select set_config('request.jwt.claims', :'jwt_p1', false);
set role authenticated;
select t.raises($$select public.upsert_driver_application('{"licenseNumber":"DL1","ais125Type":"TYPE_D_ALS"}')$$, 'PT403', 'a patient cannot start a driver application');
reset role;

select set_config('request.jwt.claims', :'jwt_d1', false);
set role authenticated;
select t.raises($$select public.upsert_driver_application('{"ais125Type":"TYPE_D_ALS"}')$$, 'PT422', 'application needs a licence number');
select t.eq((public.upsert_driver_application('{"licenseNumber":"dl-0420250001","ais125Type":"TYPE_D_ALS","dlExpiry":"2020-01-01","emtLevel":"EMT_P","aclsCertified":true}')) ->> 'kycStatus', 'draft', 'driver application saved as draft');
select t.raises($$select public.submit_kyc()$$, 'PT422', 'submit_kyc rejects an expired licence (dl_expired)');
select t.eq((select count(*)::int from public.drivers), 1, 'driver sees only their own row');
select t.raises($$update public.drivers set is_verified = true$$, '42501', 'driver cannot self-verify');
select t.raises($$update public.drivers set is_online = true$$, '42501', 'driver cannot write is_online directly (R-05)');
select t.raises($$update public.drivers set current_location = null$$, '42501', 'driver cannot write current_location directly (R-05)');
select t.raises($$select public.set_driver_presence(true, 28.5, 77.2)$$, 'PT403', 'unverified driver cannot go online');
insert into public.driver_vehicles (driver_id, registration_number, ais125_type) values (:'d1', 'DL01AB1234', 'TYPE_D_ALS');
select t.raises(format($$insert into public.driver_vehicles (driver_id, registration_number, ais125_type) values (%L, 'DL01AB9999', 'TYPE_D_ALS')$$, :'d2'), '42501', 'driver cannot create a vehicle for another driver');
reset role;
update public.drivers set dl_expiry = current_date + 400 where id = :'d1';

select set_config('request.jwt.claims', :'jwt_d1', false);
set role authenticated;
select t.raises($$select public.submit_kyc()$$, 'PT422', 'submit_kyc rejects missing mandatory documents');
insert into public.driver_documents (driver_id, slot, storage_path, file_name) values
  (:'d1', 'arai_certificate', :'d1' || '/arai_certificate/a.pdf', 'a.pdf'),
  (:'d1', 'fitness_permit',   :'d1' || '/fitness_permit/b.pdf',   'b.pdf'),
  (:'d1', 'vehicle_rc',       :'d1' || '/vehicle_rc/c.pdf',       'c.pdf');
select t.raises(format($$insert into public.driver_documents (driver_id, slot, storage_path) values (%L, 'commercial_dl', 'elsewhere/x.pdf')$$, :'d1'), '23514', 'document path must match {driver_id}/{slot}/...');
select t.raises(format($$update public.driver_documents set status = 'accepted' where driver_id = %L$$, :'d1'), '42501', 'driver cannot mark their own document accepted');
select t.raises($$select public.submit_kyc()$$, 'PT422', 'submit_kyc rejects document rows with no uploaded file (G3.1)');
insert into storage.objects (bucket_id, name) select 'driver-kyc-documents', storage_path from public.driver_documents;
select t.eq((public.submit_kyc()) ->> 'kycStatus', 'pending_verification', 'complete application moves to pending_verification');
select t.ok((select kyc_reference from public.drivers) ~ '^EK-KYC-\d{6}$', 'kyc reference issued');
select t.raises($$select public.upsert_driver_application('{"licenseNumber":"X","ais125Type":"TYPE_D_ALS"}')$$, 'PT409', 'application locked after submit (kyc_locked)');
select t.raises(format($$insert into public.driver_vehicles (driver_id, registration_number, ais125_type) values (%L, 'DL01AB0002', 'TYPE_D_ALS')$$, :'d1'), '42501', 'vehicle writes blocked once pending');
reset role;

-- Staff approval (service_role territory): is_verified only moves together with kyc_status.
select t.raises(format($$update public.drivers set is_verified = true where id = %L$$, :'d1'), '23514', 'is_verified must match kyc_status = approved');
update public.drivers set kyc_status = 'approved', is_verified = true where id = :'d1';

-- Two more approved ALS drivers (d2, d3) so a wave has a race and an ineligible driver.
insert into public.drivers (id, license_number, ais125_type, kyc_status, is_verified) values
  (:'d2', 'DL-2', 'TYPE_D_ALS', 'approved', true),
  (:'d3', 'DL-3', 'TYPE_D_ALS', 'approved', true);

-- Storage: kyc bucket policies on the stub (or real) storage.objects. d1 is approved => locked.
select set_config('request.jwt.claims', :'jwt_d1', false);
set role authenticated;
select t.raises(format($$insert into storage.objects (bucket_id, name) values ('driver-kyc-documents', %L)$$, :'d1' || '/vehicle_rc/new.pdf'), '42501', 'kyc upload blocked once the application is no longer editable');
reset role;
select set_config('request.jwt.claims', :'jwt_d2', false);
set role authenticated;
select t.raises(format($$insert into storage.objects (bucket_id, name) values ('driver-kyc-documents', %L)$$, :'d1' || '/vehicle_rc/steal.pdf'), '42501', 'kyc upload into another driver folder denied');
reset role;
update public.drivers set kyc_status = 'draft', is_verified = false where id = :'d3';
select set_config('request.jwt.claims', :'jwt_d3', false);
set role authenticated;
insert into storage.objects (bucket_id, name) values ('driver-kyc-documents', :'d3' || '/vehicle_rc/ok.pdf');
select t.eq((select count(*)::int from storage.objects where bucket_id = 'driver-kyc-documents'), 1, 'draft driver uploads and reads only their own kyc object');
reset role;
update public.drivers set kyc_status = 'approved', is_verified = true where id = :'d3';

-- ---------------------------------------------------------------------------
-- create_mission
-- ---------------------------------------------------------------------------
-- Boundaries ship with migration 20260929000000 (geoBoundaries IND ADM1); no test rows are inserted here.
select t.eq((select string_agg(zone::text || ':' || name, ',' order by zone) from public.jurisdictions), 'DL:NCT of Delhi,UP:Uttar Pradesh', 'fresh database ships the DL and UP boundaries');
select t.ok((select bool_and(extensions.st_isvalid(boundary::extensions.geometry)) from public.jurisdictions), 'shipped boundaries are valid geometries');
select t.ok((select extensions.st_npoints(boundary::extensions.geometry) > 1000 from public.jurisdictions where zone = 'DL'), 'DL is a real boundary, not a bounding box');
select t.eq((select round(extensions.st_area(extensions.st_intersection(a.boundary::extensions.geometry, b.boundary::extensions.geometry)::extensions.geography)::numeric)
               from public.jurisdictions a, public.jurisdictions b where a.zone = 'DL' and b.zone = 'UP'), 0::numeric, 'DL and UP do not overlap (zone lookup is unambiguous)');

-- The fail-closed guard still holds when boundary rows are missing (rolled back).
begin;
delete from public.jurisdictions;
select set_config('request.jwt.claims', :'jwt_p1', false);
set role authenticated;
select t.raises(format($$select public.create_mission(%L, 28.5672, 77.21, 'TYPE_D_ALS', 'CAT_1_IMMEDIATE', '{}', 8.4)$$, :'k1'), 'PT503', 'create_mission refuses when jurisdiction boundaries are missing');
reset role;
rollback;

-- G-06 regressions against the shipped polygons: the old client boxes put Noida in DL and Gurugram/Faridabad in DL.
select set_config('request.jwt.claims', :'jwt_p1', false);
set role authenticated;
select t.raises(format($$select public.create_mission(%L, 28.4595, 77.0266, 'TYPE_D_ALS', 'CAT_1_IMMEDIATE', '{}', 8.4)$$, :'k1'), 'PT422', 'Gurugram (Haryana) is out_of_zone');
select t.raises(format($$select public.create_mission(%L, 28.4089, 77.3178, 'TYPE_D_ALS', 'CAT_1_IMMEDIATE', '{}', 8.4)$$, :'k1'), 'PT422', 'Faridabad (Haryana) is out_of_zone');
select t.raises(format($$select public.create_mission(%L, 30.3165, 78.0322, 'TYPE_D_ALS', 'CAT_1_IMMEDIATE', '{}', 8.4)$$, :'k1'), 'PT422', 'Dehradun (Uttarakhand) is out_of_zone');
reset role;
begin;
select set_config('request.jwt.claims', :'jwt_p1', false);
set role authenticated;
select t.eq((public.create_mission(gen_random_uuid(), 28.5708, 77.3261, 'TYPE_D_ALS', 'CAT_1_IMMEDIATE', '{}', 8.4)) -> 'mission' -> 'fareDetails' ->> 'jurisdiction', 'UP', 'Noida Sector 18 resolves to UP');
reset role;
rollback;
begin;
select set_config('request.jwt.claims', :'jwt_p1', false);
set role authenticated;
select t.eq((public.create_mission(gen_random_uuid(), 26.8467, 80.9462, 'TYPE_D_ALS', 'CAT_1_IMMEDIATE', '{}', 8.4)) -> 'mission' -> 'fareDetails' ->> 'jurisdiction', 'UP', 'Lucknow resolves to UP');
reset role;
rollback;

-- Presence: d1 and d3 are online and near AIIMS, d2 is online but ~25 km away (outside the 3 km wave).
select set_config('request.jwt.claims', :'jwt_d1', false);
set role authenticated;
select t.eq((public.set_driver_presence(true, 28.5680, 77.2110)) ->> 'isOnline', 'true', 'verified driver goes online through the RPC');
reset role;
select set_config('request.jwt.claims', :'jwt_d3', false);
set role authenticated;
select public.set_driver_presence(true, 28.5690, 77.2120);
reset role;
select set_config('request.jwt.claims', :'jwt_d2', false);
set role authenticated;
select public.set_driver_presence(true, 28.7900, 77.2900);
reset role;

select set_config('request.jwt.claims', :'jwt_d1', false);
set role authenticated;
select t.raises(format($$select public.create_mission(%L, 28.5672, 77.21, 'TYPE_D_ALS', 'CAT_1_IMMEDIATE', '{}', 8.4)$$, :'k1'), 'PT403', 'a driver cannot create a mission (not_a_patient)');
reset role;

select set_config('request.jwt.claims', :'jwt_p1', false);
set role authenticated;
select t.raises(format($$select public.create_mission(%L, 19.0, 72.8, 'TYPE_D_ALS', 'CAT_1_IMMEDIATE', '{}', 8.4)$$, :'k1'), 'PT422', 'pickup outside every boundary is refused (out_of_zone)');
select t.raises(format($$select public.create_mission(%L, 28.5672, 77.21, 'TYPE_D_ALS', 'CAT_1_IMMEDIATE', '[]', 8.4)$$, :'k1'), 'PT422', 'triage must be an object');
select (public.create_mission(:'k1', 28.5672, 77.21, 'TYPE_D_ALS', 'CAT_1_IMMEDIATE',
  '{"primary_complaint":"chest_pain","derived_flags":["chest_pain"],"engine_version":"1"}', 8.4, 'Hauz Khas Village')) -> 'mission' ->> 'id' as m1 \gset
select (public.create_mission(:'k1', 28.5672, 77.21, 'TYPE_D_ALS', 'CAT_1_IMMEDIATE', '{}', 8.4)) ->> 'replay' as replay \gset
select t.eq(:'replay'::text, 'true', 'same idempotency key returns the existing mission (replay)');
select t.eq((select count(*)::int from public.missions), 1, 'replay did not create a second mission');
select t.ok((select display_ref from public.missions) ~ '^MSN-DL-\d{4}-\d{6}$', 'display_ref generated');
select t.eq((select state_version from public.missions), 1, 'creation writes event seq 1');
select t.eq((select (fare_details ->> 'estimatedTotalInr')::int from public.missions), 585, 'server-computed fare: ALS at 8.4 km = Rs 585 (5 km included)');
select t.eq((select fare_details ->> 'jurisdiction' from public.missions), 'DL', 'jurisdiction resolved server-side from the polygon');
reset role;

select t.eq((select count(*)::int from public.dispatch_waves where mission_id = :'m1'), 1, 'wave 1 opened on creation');
select t.eq((select cardinality(eligible_driver_ids) from public.dispatch_waves where mission_id = :'m1'), 2, 'wave 1 offers exactly the two online ALS drivers within 3 km');
select t.ok(not ((select eligible_driver_ids from public.dispatch_waves where mission_id = :'m1') @> array[:'d2'::uuid]), 'far driver is not in wave 1');
select id as offer1 from public.dispatch_waves where mission_id = :'m1' \gset

-- RLS: isolation and the closed pool (R-06)
select set_config('request.jwt.claims', :'jwt_p2', false);
set role authenticated;
select t.eq((select count(*)::int from public.missions), 0, 'another patient sees no missions');
select t.eq((select count(*)::int from public.mission_events), 0, 'another patient sees no events');
reset role;
select set_config('request.jwt.claims', :'jwt_d1', false);
set role authenticated;
select t.eq((select count(*)::int from public.missions), 0, 'an offered driver cannot read the unassigned mission (pool closed)');
select t.raises($$select * from public.dispatch_waves$$, '42501', 'drivers have no access to dispatch_waves (peer ids stay hidden)');
select t.raises($$select public.publish_realtime('x', '{}')$$, '42501', 'internal functions are not callable by clients');
select t.raises($$select public._record_event(gen_random_uuid(), 'cancelled', 'X', null, 'system', '{}')$$, '42501', '_record_event is not callable by clients');
reset role;

-- ---------------------------------------------------------------------------
-- accept_offer: the race, eligibility, idempotency
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', :'jwt_d2', false);
set role authenticated;
select t.raises(format($$select public.accept_offer(%L)$$, :'offer1'), 'PT403', 'a driver outside the wave cannot accept (not_eligible)');
reset role;

select set_config('request.jwt.claims', :'jwt_d1', false);
set role authenticated;
select (public.accept_offer(:'offer1', :'k2')) ->> 'seq' as accept_seq \gset
select t.eq(:'accept_seq'::text, '2', 'accept advances the mission to seq 2');
select t.eq((public.accept_offer(:'offer1', :'k2')) ->> 'replay', 'true', 'accept with the same client event id is idempotent');
select t.eq((select status::text from public.missions where id = :'m1'), 'en_route', 'accept sets en_route (matched stays unused, D-4)');
select t.eq((select driver_id::text from public.missions where id = :'m1'), :'d1', 'accepting driver assigned');
reset role;

select set_config('request.jwt.claims', :'jwt_d3', false);
set role authenticated;
select t.raises(format($$select public.accept_offer(%L)$$, :'offer1'), 'PT409', 'the losing driver gets 409 (offer_taken)');
reset role;

select set_config('request.jwt.claims', :'jwt_p1', false);
set role authenticated;
select t.eq((select count(*)::int from public.mission_events where mission_id = :'m1'), 2, 'patient reads the event trail (seq 1..2)');
select t.eq((select metadata -> 'driver' ->> 'ais125Type' from public.mission_events where mission_id = :'m1' and seq = 2), 'TYPE_D_ALS', 'DRIVER_ACCEPTED carries the driver tier');
select t.ok((select metadata -> 'driver' ->> 'vehicleRegistration' from public.mission_events where mission_id = :'m1' and seq = 2) is not null, 'DRIVER_ACCEPTED carries the registration on file');
select t.ok((select not (metadata -> 'driver' ? 'displayName') from public.mission_events where mission_id = :'m1' and seq = 2), 'no driver name is invented when none is on file');
select t.raises(format($$select public.transition_mission(%L, 'ON_SCENE', '{}')$$, :'m1'), 'PT404', 'a patient cannot drive driver transitions');
reset role;

-- ---------------------------------------------------------------------------
-- transition_mission: full happy path + guards
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', :'jwt_d3', false);
set role authenticated;
select t.raises(format($$select public.transition_mission(%L, 'ON_SCENE', '{}')$$, :'m1'), 'PT404', 'unassigned driver cannot transition (not_found)');
select t.eq((select count(*)::int from public.missions where id = :'m1'), 0, 'unassigned driver cannot read the mission (Current Mission lookup returns nothing for a stale or foreign id)');
reset role;

select set_config('request.jwt.claims', :'jwt_d1', false);
set role authenticated;
select t.raises(format($$select public.transition_mission(%L, 'PATIENT_ON_BOARD', '{}')$$, :'m1'), 'PT409', 'cannot skip a state (invalid_transition)');
select t.raises(format($$select public.transition_mission(%L, 'ON_SCENE', '{}')$$, :'m1'), 'PT422', 'ON_SCENE needs a location');
select t.raises(format($$select public.transition_mission(%L, 'TELEPORT', '{}')$$, :'m1'), 'PT422', 'unknown event refused');
select t.eq((public.transition_mission(:'m1', 'ON_SCENE', '{"location":{"latitude":28.5673,"longitude":77.2101},"arrivedAt":"2026-09-24T08:37:11.900Z"}', :'k3')) ->> 'seq', '3', 'ON_SCENE -> seq 3');
select t.eq((public.transition_mission(:'m1', 'ON_SCENE', '{"location":{"latitude":28.5673,"longitude":77.2101}}', :'k3')) ->> 'replay', 'true', 'transition replay by client event id creates no event');
select t.raises(format($$select public.transition_mission(%L, 'ON_SCENE', '{"location":{"latitude":28.5,"longitude":77.2}}')$$, :'m1'), 'PT409', 'a second ON_SCENE is invalid_transition');
select (id) as aiims from public.hospitals where name = 'AIIMS New Delhi' \gset
select t.raises(format($$select public.transition_mission(%L, 'PATIENT_ON_BOARD', '{"hospitalId":"00000000-0000-4000-8000-000000000000"}')$$, :'m1'), 'PT409', 'unknown hospital refused');
select t.raises(format($$select public.transition_mission(%L, 'PATIENT_ON_BOARD', jsonb_build_object('hospitalId', %L, 'vitals', '{"spO2":140}'::jsonb))$$, :'m1', :'aiims'), 'PT422', 'out-of-range vitals refused (no silent coercion)');
reset role;
select held_capacity as held0 from public.hospitals where id = :'aiims' \gset

select set_config('request.jwt.claims', :'jwt_d1', false);
set role authenticated;
select t.eq((public.transition_mission(:'m1', 'PATIENT_ON_BOARD', jsonb_build_object('hospitalId', :'aiims', 'onboardAt', '2026-09-24T09:00:00Z', 'etaMinutes', 11, 'vitals', '{"pulse":88,"spO2":94}'::jsonb, 'emergencyType', 'trauma'))) ->> 'seq', '4', 'PATIENT_ON_BOARD -> seq 4');
reset role;
select t.eq((select held_capacity from public.hospitals where id = :'aiims'), :held0 + 1, 'server takes the hospital hold at TRANSPORT_STARTED');
select t.eq((select destination_hospital_id::text from public.missions where id = :'m1'), :'aiims', 'destination recorded');

select set_config('request.jwt.claims', :'jwt_p1', false);
set role authenticated;
select t.raises(format($$select public.cancel_mission(%L)$$, :'m1'), 'PT409', 'patient cancel refused once transporting');
select t.eq((select metadata -> 'vitals' ->> 'pulse' from public.mission_events where mission_id = :'m1' and seq = 4), '88', 'vitals persisted on the on-board event (5.6)');
reset role;

select set_config('request.jwt.claims', :'jwt_d1', false);
set role authenticated;
select t.eq((public.transition_mission(:'m1', 'ARRIVED_HOSPITAL', '{"arrivedAt":"2026-09-24T09:10:00Z"}')) ->> 'seq', '5', 'ARRIVED_HOSPITAL -> seq 5');
select t.eq((select event_type from public.mission_events where mission_id = :'m1' and seq = 5), 'HOSPITAL_ARRIVED', 'HOSPITAL_ARRIVED is its own wire event');
select t.raises(format($$select public.transition_mission(%L, 'COMPLETE', '{}')$$, :'m1'), 'PT422', 'COMPLETE refused without a sign-off (handoff_incomplete)');
select t.raises(format($$select public.transition_mission(%L, 'COMPLETE', '{"handoff":{"physicianName":" ","registrationNumber":"R","department":"ER"}}')$$, :'m1'), 'PT422', 'blank physician name refused');
-- Live pings: ~11.1 km along a meridian inside the transport leg, uploaded twice (idempotent re-flush).
select t.eq((public.ingest_telemetry(:'m1', '[{"latitude":28.50,"longitude":77.20,"timestamp":"2026-09-24T09:01:00Z","speed":40,"heading":10},{"latitude":28.55,"longitude":77.20,"timestamp":"2026-09-24T09:02:00Z"},{"latitude":28.60,"longitude":77.20,"timestamp":"2026-09-24T09:03:00Z","deadZone":true},{"latitude":200,"longitude":77.2,"timestamp":"2026-09-24T09:04:00Z"}]')) ->> 'acknowledged', '3', 'batch ingest acknowledges the valid pings');
select t.eq((public.ingest_telemetry(:'m1', '[{"latitude":28.50,"longitude":77.20,"timestamp":"2026-09-24T09:01:00Z"}]')) ->> 'acknowledged', '1', 're-flushed duplicate is acknowledged');
reset role;
select t.eq((select count(*)::int from public.telemetry_logs where mission_id = :'m1'), 3, 'duplicates and the invalid fix were not stored twice');
select t.eq((select count(*)::int from public.telemetry_logs where mission_id = :'m1' and dead_zone), 1, 'dead_zone flag stored');

select set_config('request.jwt.claims', :'jwt_d1', false);
set role authenticated;
select (public.transition_mission(:'m1', 'COMPLETE', '{"completedAt":"2026-09-24T09:11:00Z","handoff":{"physicianName":"Dr Test","registrationNumber":"REG-1","department":"Emergency","emtSigned":true}}')) ->> 'seq' as complete_seq \gset
reset role;
select t.eq(:'complete_seq'::text, '6', 'COMPLETE -> seq 6');
select t.eq((select status::text from public.missions where id = :'m1'), 'completed', 'mission completed');
select t.eq((select metadata -> 'audit' ->> 'distanceSource' from public.mission_events where mission_id = :'m1' and seq = 6), 'measured', 'billable distance measured from telemetry, not the quote');
select t.eq((select metadata ->> 'distanceSource' from public.mission_events where mission_id = :'m1' and seq = 6), 'measured', 'the completion record names the source as a first-class field');
select t.ok((select distance_km from public.missions where id = :'m1') between 11.0 and 11.3, 'measured transport leg is ~11.1 km');
select t.ok((select final_fare_inr from public.missions where id = :'m1') between 640 and 665, 'final fare recomputed by the server from the measured distance');
select t.eq((select (metadata ->> 'finalFareInr')::int from public.mission_events where mission_id = :'m1' and seq = 6), (select final_fare_inr from public.missions where id = :'m1'), 'event finalFareInr equals the stored fare');
select t.eq((select held_capacity from public.hospitals where id = :'aiims'), :held0, 'hold released on completion');
select set_config('request.jwt.claims', :'jwt_p2', false);
set role authenticated;
select t.raises(format($$select public.confirm_receipt(%L)$$, :'m1'), 'PT404', 'another patient cannot confirm a receipt');
reset role;
select set_config('request.jwt.claims', :'jwt_p1', false);
set role authenticated;
select t.ok((public.confirm_receipt(:'m1', false)) ->> 'receiptConfirmedAt' ~ 'Z$', 'patient confirms the receipt (server timestamp)');
select t.eq((public.confirm_receipt(:'m1', true)) ->> 'disputeFlag', 'true', 'a later dispute is recorded');
select t.eq((public.confirm_receipt(:'m1', false)) ->> 'disputeFlag', 'true', 'a raised dispute stays raised');
reset role;
select t.eq((select count(*)::int from public.missions where id = :'m1' and receipt_confirmed_at is not null and dispute_flag), 1, 'receipt_confirmed_at + dispute_flag stored on the mission');
select t.ok((select metadata ? 'handoff' from public.mission_events where mission_id = :'m1' and seq = 6), 'sign-off retained in the audit metadata');

-- Wire envelope: capture what the trigger would POST (Vault secrets present, request read before commit).
begin;
select vault.create_secret('http://centrifugo.invalid:8000', 'centrifugo_api_url');
select vault.create_secret('test-api-key', 'centrifugo_api_key');
select set_config('request.jwt.claims', :'jwt_p1', true);
set local role authenticated;
select (public.create_mission(:'k4', 28.5672, 77.21, 'TYPE_D_ALS', 'CAT_1_IMMEDIATE', '{"primary_complaint":"chest_pain","derived_flags":["chest_pain","cardiac_arrest"]}', 8.4, 'Hauz Khas Village')) -> 'mission' ->> 'id' as m4 \gset
reset role;
select t.ok((select count(*) from net.http_request_queue where url = 'http://centrifugo.invalid:8000/api/publish' and convert_from(body, 'utf8')::jsonb ->> 'channel' like 'driver:%:offers') = 2, 'one offer per eligible driver is queued for driver:{id}:offers');
select convert_from(body, 'utf8')::jsonb -> 'data' as offer from net.http_request_queue where convert_from(body, 'utf8')::jsonb ->> 'channel' = 'driver:' || :'d1' || ':offers' \gset
select t.eq(:'offer'::jsonb ->> 'type', 'offer', 'offer.type');
select t.eq(:'offer'::jsonb ->> 'v', '1', 'offer.v');
select t.eq(:'offer'::jsonb ->> 'requiredVehicleType', 'TYPE_D_ALS', 'offer.requiredVehicleType');
select t.eq(:'offer'::jsonb -> 'patientSummary' ->> 'primaryComplaint', 'chest_pain', 'offer.patientSummary carries only reported triage content');
select t.ok(not (:'offer'::jsonb -> 'patientSummary' ? 'ageBand'), 'no invented age/sex (D-6): absent when not captured');
select t.ok((:'offer'::jsonb ->> 'expiresAt')::timestamptz - (:'offer'::jsonb ->> 'issuedAt')::timestamptz = interval '15 seconds', 'offer expiresAt = issuedAt + 15 s');
select t.ok((:'offer'::jsonb ->> 'issuedAt') ~ 'Z$', 'timestamps are ISO 8601 UTC with a Z suffix');
select set_config('request.jwt.claims', :'jwt_p1', true);
set local role authenticated;
select public.cancel_mission(:'m4', 'found_alternative', 'Family arranged own transport');
reset role;
select convert_from(body, 'utf8')::jsonb -> 'data' as env from net.http_request_queue where convert_from(body, 'utf8')::jsonb ->> 'channel' = 'mission:' || :'m4' \gset
select t.eq(:'env'::jsonb ->> 'type', 'lifecycle', 'lifecycle envelope type');
select t.eq(:'env'::jsonb ->> 'event', 'MISSION_CANCELLED', 'lifecycle envelope event');
select t.eq(:'env'::jsonb ->> 'seq', '2', 'lifecycle envelope seq (creation is seq 1)');
select t.eq(:'env'::jsonb ->> 'state', 'cancelled', 'lifecycle envelope state');
select t.eq(:'env'::jsonb -> 'data' ->> 'cancelledBy', 'patient', 'MISSION_CANCELLED.data.cancelledBy');
select t.eq(:'env'::jsonb -> 'data' ->> 'fromState', 'requesting', 'MISSION_CANCELLED.data.fromState');
select t.ok(not (:'env'::jsonb ? 'driverId'), 'no driverId on a cancel before assignment');
select t.eq((select count(*)::int from net.http_request_queue where convert_from(body, 'utf8')::jsonb ->> 'channel' like 'driver:%:offers' and convert_from(body, 'utf8')::jsonb -> 'data' ->> 'type' = 'offer_revoked'), 2, 'offer_revoked (cancelled) goes to both offered drivers');
rollback;

-- ---------------------------------------------------------------------------
-- Cancel, abort/re-dispatch, exhaustion
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', :'jwt_p1', false);
set role authenticated;
select (public.create_mission('00000000-0000-4000-8000-0000000000e5', 28.5672, 77.21, 'TYPE_D_ALS', 'CAT_2_URGENT', '{}', 6.0)) -> 'mission' ->> 'id' as m5 \gset
select t.eq((public.cancel_mission(:'m5', 'changed_mind')) ->> 'status', 'cancelled', 'patient cancels while requesting');
select t.eq((public.cancel_mission(:'m5', 'changed_mind')) ->> 'replay', 'true', 'cancel is idempotent');
select t.raises(format($$select public.cancel_mission(%L, 'nonsense')$$, :'m5'), 'PT422', 'cancel reason validated');
select t.eq((select cancelled_by from public.missions where id = :'m5'), 'patient', 'cancelled_by recorded');
select t.raises(format($$select public.confirm_receipt(%L)$$, :'m5'), 'PT409', 'a receipt can only be confirmed for a completed mission');
reset role;
select t.eq((select count(*)::int from public.dispatch_waves where mission_id = :'m5' and status = 'broadcasting'), 0, 'cancel closes the broadcasting wave');

select set_config('request.jwt.claims', :'jwt_p1', false);
set role authenticated;
select (public.create_mission('00000000-0000-4000-8000-0000000000e6', 28.5672, 77.21, 'TYPE_D_ALS', 'CAT_1_IMMEDIATE', '{}', 6.0)) -> 'mission' ->> 'id' as m6 \gset
reset role;
select id as offer6 from public.dispatch_waves where mission_id = :'m6' \gset
select set_config('request.jwt.claims', :'jwt_d1', false);
set role authenticated;
select public.accept_offer(:'offer6');
select t.eq((public.transition_mission(:'m6', 'ABORT', '{"reason":"vehicle_breakdown"}')) ->> 'status', 'requesting', 'release with drivers already asked keeps the request open (search window)');
reset role;
select t.ok(exists (select 1 from public.mission_events where mission_id = :'m6' and event_type = 'DRIVER_RELEASED'), 'DRIVER_RELEASED emitted before re-dispatch (D-3)');
select t.eq((select status::text from public.missions where id = :'m6'), 'requesting', 'the last wave finding nobody new does not cancel: the request stays on the Booking board');
select t.ok((select driver_id is null from public.missions where id = :'m6'), 'driver cleared on release');
-- 20261003000000: a release starts a new dispatch round (waves from the smallest radius again), never re-offering the releaser.
select t.eq((select max(round)::int from public.dispatch_waves where mission_id = :'m6'), 2, 'release opens a second dispatch round');
select t.ok(not exists (select 1 from public.dispatch_waves where mission_id = :'m6' and round = 2 and :'d1' = any (eligible_driver_ids)), 'the releasing driver is not re-offered');
-- Only when the search window (from the release) closes does the system end it.
update public.missions set search_started_at = now() - interval '11 minutes' where id = :'m6';
select t.ok(public.dispatch_tick() >= 1, 'dispatch_tick ends a request nobody took once the search window is over');
select t.eq((select event_type from public.mission_events where mission_id = :'m6' order by seq desc limit 1), 'MISSION_CANCELLED', 'the end is a system MISSION_CANCELLED');
select t.eq((select cancelled_by from public.missions where id = :'m6'), 'system', 'cancelled_by = system');
select t.eq((select cancel_note from public.missions where id = :'m6'), 'no_ambulance_available', 'patient-facing end state reason recorded');

-- Nobody online at all: create_mission itself returns the ended search (client must persist seq 1 and replay the cancel)
create temp table _was_online as select id from public.drivers where is_online;
update public.drivers set is_online = false where is_online;
select set_config('request.jwt.claims', :'jwt_p1', false);
set role authenticated;
select (public.create_mission('00000000-0000-4000-8000-0000000000ea', 28.5672, 77.21, 'TYPE_D_ALS', 'CAT_1_IMMEDIATE', '{}', 6.0)) -> 'mission' ->> 'id' as m10 \gset
reset role;
select t.eq((select status::text from public.missions where id = :'m10'), 'cancelled', 'no driver online: the mission is cancelled inside create_mission');
select t.eq((select state_version from public.missions where id = :'m10'), 2, 'creation is seq 1, the system cancel is seq 2');
select t.eq((select seq from public.mission_events where mission_id = :'m10' and event_type = 'MISSION_CANCELLED'), 2, 'the cancel is replayable from seq 1');
update public.drivers set is_online = true where id in (select id from _was_online);
drop table _was_online;

-- tick escalates an expired wave
select set_config('request.jwt.claims', :'jwt_p1', false);
set role authenticated;
select (public.create_mission('00000000-0000-4000-8000-0000000000e7', 28.5672, 77.21, 'TYPE_D_ALS', 'CAT_1_IMMEDIATE', '{}', 6.0)) -> 'mission' ->> 'id' as m7 \gset
reset role;
update public.dispatch_waves set expires_at = now() - interval '1 second' where mission_id = :'m7' and status = 'broadcasting';
select t.eq(public.dispatch_tick(), 1, 'dispatch_tick escalates one expired wave');
select t.eq((select count(*)::int from public.dispatch_waves where mission_id = :'m7'), 3, 'escalation walked through the remaining waves');

-- accept after expiry
select set_config('request.jwt.claims', :'jwt_p1', false);
set role authenticated;
select (public.create_mission('00000000-0000-4000-8000-0000000000e8', 28.5672, 77.21, 'TYPE_D_ALS', 'CAT_1_IMMEDIATE', '{}', 6.0)) -> 'mission' ->> 'id' as m8 \gset
reset role;
update public.dispatch_waves set created_at = now() - interval '20 seconds', expires_at = now() - interval '5 seconds' where mission_id = :'m8';
select id as offer8 from public.dispatch_waves where mission_id = :'m8' \gset
select set_config('request.jwt.claims', :'jwt_d3', false);
set role authenticated;
select t.raises(format($$select public.accept_offer(%L)$$, :'offer8'), 'PT409', 'an offer older than 15 s cannot be accepted (offer_expired)');
reset role;

-- ---------------------------------------------------------------------------
-- Append-only trail, grants, DPDP
-- ---------------------------------------------------------------------------
select t.raises(format($$update public.mission_events set seq = 99 where mission_id = %L$$, :'m1'), '42501', 'mission_events is append-only (update)');
select t.raises(format($$delete from public.mission_events where mission_id = %L$$, :'m1'), '42501', 'mission_events is append-only (delete)');
select t.raises(format($$delete from public.missions where id = %L$$, :'m1'), '42501', 'a mission with a trail cannot be deleted');
select t.raises(format($$update public.missions set fare_details = fare_details || '{"surgeMultiplier":1.5}' where id = %L$$, :'m1'), '23514', 'anti-gouging check: surge multiplier != 1.0 rejected');
select t.raises(format($$update public.missions set fare_details = '{"baseFareInr":500}' where id = %L$$, :'m1'), '23514', 'anti-gouging check: missing keys do not pass');

select set_config('request.jwt.claims', :'jwt_p1', false);
set role authenticated;
select t.raises($$update public.profiles set dpdp_consent_at = now()$$, '42501', 'dpdp_consent_at is no longer client-writable');
select t.raises($$update public.profiles set role = 'driver'$$, '42501', 'role is not client-writable');
update public.profiles set preferred_language = 'hi';
select t.eq((select preferred_language from public.profiles), 'hi', 'preferred_language is client-writable');
select t.raises($$update public.profiles set preferred_language = 'fr'$$, '23514', 'language limited to en/hi');
select t.raises($$select public.record_consent('nonsense', 'v1', true)$$, 'PT422', 'unknown consent purpose refused');
select t.ok((public.record_consent('geolocation', '2026-09', true, 'hi', '1.0.0')) ->> 'grantedAt' ~ 'Z$', 'consent recorded with a server timestamp');
select public.record_consent('geolocation', '2026-09', false);
select t.eq((select count(*)::int from public.consent_records), 2, 'consent history is append-only from the client side');
select t.eq((select count(*)::int from public.consent_records where withdrawn_at is not null), 1, 'withdrawal stamps the earlier grant');
select t.raises($$insert into public.consent_records (user_id, purpose, notice_version, granted) values (auth.uid(), 'geolocation', 'v', true)$$, '42501', 'clients cannot insert consent rows directly');
select public.request_erasure();
select t.eq((public.request_erasure()) ->> 'ok', 'true', 'erasure request is idempotent');
select t.eq((select count(*)::int from public.erasure_requests), 1, 'one queued erasure request');
select t.ok((select due_at - requested_at from public.erasure_requests) between interval '71 hours 59 minutes' and interval '72 hours 1 minute', 'due_at = requested_at + 72 h');
reset role;
select set_config('request.jwt.claims', :'jwt_p2', false);
set role authenticated;
select t.eq((select count(*)::int from public.consent_records), 0, 'consent rows are private to their owner');
select t.eq((select count(*)::int from public.erasure_requests), 0, 'erasure rows are private to their owner');
reset role;

-- Erasure job (runs after the append-only checks: it edits `metadata` only, which the trigger allows).
select t.eq(public.process_erasure_requests(), 1, 'erasure job processes the queued request');
select t.ok((select anonymised_at is not null and full_name is null and phone like '+999%' from public.profiles where id = :'p1'), 'profile anonymised with a tombstone phone');
select t.eq((select triage from public.missions where id = :'m1'), '{}'::jsonb, 'triage removed from the erased patient''s missions');
select t.eq((select count(*)::int from public.telemetry_logs where mission_id = :'m1'), 0, 'GPS breadcrumbs removed');
select t.ok((select final_fare_inr from public.missions where id = :'m1') > 0, 'fare ledger retained (statutory)');
select t.ok((select not (metadata ? 'handoff') and not (metadata ? 'vitals') from public.mission_events where mission_id = :'m1' and seq in (4, 6) limit 1), 'vitals/handoff removed from the trail on erasure (metadata edits stay allowed)');

-- Storage buckets
select t.eq((select count(*)::int from storage.buckets where id in ('driver-kyc-documents', 'receipts', 'emr-handoffs') and public = false), 3, 'three private buckets');
select t.eq((select file_size_limit from storage.buckets where id = 'driver-kyc-documents'), 5242880::bigint, 'kyc bucket limited to 5 MB');
select t.eq((select allowed_mime_types from storage.buckets where id = 'receipts'), array['application/pdf'], 'receipts bucket is PDF only');
select t.eq((select count(*)::int from storage.buckets where id = 'medical-prescriptions'), 0, 'medical-prescriptions dropped (D-7)');
select set_config('request.jwt.claims', :'jwt_p1', false);
set role authenticated;
select t.raises(format($$insert into storage.objects (bucket_id, name) values ('receipts', %L)$$, :'p1' || '/x.pdf'), '42501', 'clients cannot write receipts');
select t.raises(format($$insert into storage.objects (bucket_id, name) values ('emr-handoffs', %L)$$, :'p1' || '/x.pdf'), '42501', 'clients cannot write EMR handoffs');
reset role;

-- anon has nothing
set role anon;
select t.raises($$select * from public.missions$$, '42501', 'anon cannot read missions');
select t.raises($$select public.create_mission(gen_random_uuid(), 1, 1, 'TYPE_D_ALS', 'CAT_1_IMMEDIATE', '{}', 1)$$, '42501', 'anon cannot execute create_mission');
reset role;

drop schema t cascade;
\echo ALL BEHAVIOUR CHECKS PASSED
