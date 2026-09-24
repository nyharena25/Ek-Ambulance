-- Behavioural checks for migration 20260924000005 (driver Booking board, claim, profile).
--
-- Runs against a LOCAL database only, after every migration is applied (`supabase db reset`). It creates users and
-- missions and does not clean up, so never point it at a real project. As `postgres`:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -q -f supabase/tests/driver_board.behaviour.sql
-- Every check is a SELECT that raises on failure; the script prints `ok` per check and `ALL BOARD CHECKS PASSED`.
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
-- Fixtures. All drivers are approved TYPE_D_ALS unless noted. d1 is the caller, parked at 28.5355 N 77.3910 E.
-- One degree of latitude is ~111.2 km, so +0.027 = ~3.0 km, +0.045 = ~5.0 km, +0.072 = ~8.0 km, +0.100 = ~11.1 km north of d1.
-- ---------------------------------------------------------------------------
\set p1 '00000000-0000-4000-8000-000000000a01'
\set d1 '00000000-0000-4000-8000-000000000d01'
\set d2 '00000000-0000-4000-8000-000000000d02'
\set d3 '00000000-0000-4000-8000-000000000d03'
\set d4 '00000000-0000-4000-8000-000000000d04'

insert into auth.users (id, phone, raw_app_meta_data, raw_user_meta_data, aud, role) values
  (:'p1', '919876509001', '{}',                '{}', 'authenticated', 'authenticated'),
  (:'d1', '919876509011', '{"role":"driver"}', '{}', 'authenticated', 'authenticated'),
  (:'d2', '919876509012', '{"role":"driver"}', '{}', 'authenticated', 'authenticated'),
  (:'d3', '919876509013', '{"role":"driver"}', '{}', 'authenticated', 'authenticated'),
  (:'d4', '919876509014', '{"role":"driver"}', '{}', 'authenticated', 'authenticated');

insert into public.drivers (id, license_number, ais125_type, kyc_status, is_verified, is_online, last_seen_at, current_location) values
  (:'d1', 'DL-BOARD-1', 'TYPE_D_ALS', 'approved', true, true, now(), extensions.st_geogfromtext('SRID=4326;POINT(77.3910 28.5355)')),
  -- d2 is parked at the far pickup (8 km north of d1): a free ambulance within 7 km of it
  (:'d2', 'DL-BOARD-2', 'TYPE_D_ALS', 'approved', true, true, now(), extensions.st_geogfromtext('SRID=4326;POINT(77.3910 28.6075)')),
  -- d3 is also close to d1 and competes for the same emergencies
  (:'d3', 'DL-BOARD-3', 'TYPE_D_ALS', 'approved', true, true, now(), extensions.st_geogfromtext('SRID=4326;POINT(77.3915 28.5360)')),
  (:'d4', 'DL-BOARD-4', 'TYPE_C_BLS',  'approved', true, true, now(), extensions.st_geogfromtext('SRID=4326;POINT(77.3910 28.5355)'));

insert into public.driver_vehicles (driver_id, registration_number, make_model, ais125_type) values
  (:'d1', 'DL01AB1111', 'Force Traveller', 'TYPE_D_ALS'),
  (:'d3', 'DL01AB3333', 'Tata Winger', 'TYPE_D_ALS');
update public.profiles set full_name = 'Asha Verma' where id = :'d1';

-- mission(lat offset, age seconds, vehicle type) -> id. Inserted directly (service role): create_mission needs loaded jurisdiction boundaries.
create function t.mission(p_lat_offset double precision, p_age_s integer, p_type public.ais125_vehicle_type, p_label text) returns uuid
language plpgsql as $$
declare v uuid;
begin
  insert into public.missions (patient_id, urgency, vehicle_type, pickup_location, jurisdiction, pickup_address, triage, idempotency_key, created_at)
  values ('00000000-0000-4000-8000-000000000a01', 'CAT_1_IMMEDIATE', p_type,
          extensions.st_geogfromtext('SRID=4326;POINT(77.3910 ' || (28.5355 + p_lat_offset) || ')'), 'DL', p_label,
          '{"primary_complaint":"chest_pain","derived_flags":["cardiac"]}', gen_random_uuid(), now() - make_interval(secs => p_age_s))
  returning id into v;
  return v;
end $$;

select t.mission(0.027, 10,  'TYPE_D_ALS', 'A 3km new')            as ma \gset
select t.mission(0.027, 200, 'TYPE_D_ALS', 'B 3km overdue')        as mb \gset
select t.mission(0.045, 20,  'TYPE_D_ALS', 'C 5km young')          as mc \gset
select t.mission(0.045, 60,  'TYPE_D_ALS', 'D 5km old')            as md \gset
select t.mission(0.072, 60,  'TYPE_D_ALS', 'E 8km young')          as me \gset
select t.mission(0.072, 100, 'TYPE_D_ALS', 'F 8km old')            as mf \gset
select t.mission(0.009, 10,  'TYPE_C_BLS', 'G 1km other type')     as mg \gset
select t.mission(0.100, 300, 'TYPE_D_ALS', 'H 11km')               as mh \gset

\set jwt_d1 '{"sub":"00000000-0000-4000-8000-000000000d01","role":"authenticated"}'
\set jwt_d3 '{"sub":"00000000-0000-4000-8000-000000000d03","role":"authenticated"}'
\set jwt_d4 '{"sub":"00000000-0000-4000-8000-000000000d04","role":"authenticated"}'
\set jwt_p1 '{"sub":"00000000-0000-4000-8000-000000000a01","role":"authenticated"}'

-- ---------------------------------------------------------------------------
-- Config
-- ---------------------------------------------------------------------------
select t.eq((public.dispatch_config()) -> 'boardRadiiKm', '[4, 7, 10]'::jsonb, 'board radii are 4 / 7 / 10 km');
select t.eq((public.dispatch_config()) -> 'radiiKm', '[3, 6, 10]'::jsonb, 'offer wave radii are unchanged');
select t.eq((public.dispatch_config()) ->> 'searchTtlSeconds', '345', 'a request nobody took stays open until its timer would read -05:00');

-- ---------------------------------------------------------------------------
-- Who can list
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', :'jwt_p1', false);
set role authenticated;
select t.raises($$select public.list_nearby_emergencies()$$, 'PT403', 'a patient cannot list the board (no driver profile)');
reset role;

select set_config('request.jwt.claims', :'jwt_d1', false);
set role authenticated;
select t.eq((select count(*)::int from jsonb_array_elements((public.list_nearby_emergencies()) -> 'items')), 3, 'd1 sees exactly A, B (green) and D (red)');
select t.eq((public.list_nearby_emergencies()) #>> '{items,0,missionId}', :'mb', 'oldest first: B (200 s) leads');
select t.eq((public.list_nearby_emergencies()) #>> '{items,1,missionId}', :'md', 'then D (60 s)');
select t.eq((public.list_nearby_emergencies()) #>> '{items,2,missionId}', :'ma', 'then A (10 s)');
select t.eq((public.list_nearby_emergencies()) #>> '{items,0,band}', 'green', 'B is green even though it is long overdue (timer goes negative)');
select t.eq((public.list_nearby_emergencies()) #>> '{items,1,band}', 'red', 'D (5 km, one window old) is red');
select t.eq((public.list_nearby_emergencies()) #>> '{items,2,band}', 'green', 'A (3 km, new) is green');
select t.ok(((public.list_nearby_emergencies()) #>> '{items,0,dueAt}')::timestamptz < now(), 'B dueAt is in the past: the client shows a negative timer');
select t.ok(((public.list_nearby_emergencies()) #>> '{items,2,dueAt}')::timestamptz > now(), 'A dueAt is still ahead: the client shows a green timer');
select t.eq((public.list_nearby_emergencies()) #>> '{items,2,pickup,address}', 'A 3km new', 'the pickup address is carried');
select t.eq((public.list_nearby_emergencies()) #>> '{items,2,patientSummary,primaryComplaint}', 'chest_pain', 'the patient summary is carried');
select t.ok(not ((public.list_nearby_emergencies()) ->> 'items') like '%' || :'mc' || '%', 'C (5 km, 20 s) is hidden: the near wave is still open');
select t.ok(not ((public.list_nearby_emergencies()) ->> 'items') like '%' || :'me' || '%', 'E (8 km, 60 s) is hidden');
select t.ok(not ((public.list_nearby_emergencies()) ->> 'items') like '%' || :'mf' || '%', 'F (8 km, 100 s) is hidden while d2, a free ambulance, is within 7 km of it');
select t.ok(not ((public.list_nearby_emergencies()) ->> 'items') like '%' || :'mg' || '%', 'G is hidden: only the correspondent vehicle type is offered');
select t.ok(not ((public.list_nearby_emergencies()) ->> 'items') like '%' || :'mh' || '%', 'H (11 km) is never shown');
reset role;

select set_config('request.jwt.claims', :'jwt_d4', false);
set role authenticated;
select t.eq((select count(*)::int from jsonb_array_elements((public.list_nearby_emergencies()) -> 'items')), 1, 'the BLS crew sees only the BLS emergency (G)');
reset role;

-- An offline driver, and one whose position is stale, are not in the pool: an empty board, not an error.
update public.drivers set is_online = false where id = :'d3';
select set_config('request.jwt.claims', :'jwt_d3', false);
set role authenticated;
select t.eq((public.list_nearby_emergencies()) -> 'items', '[]'::jsonb, 'an offline driver sees an empty board');
reset role;
update public.drivers set is_online = true, last_seen_at = now() - interval '2 minutes' where id = :'d3';
set role authenticated;
select t.eq((public.list_nearby_emergencies()) -> 'items', '[]'::jsonb, 'a driver with a stale position sees an empty board');
reset role;
update public.drivers set last_seen_at = now() where id = :'d3';

-- ---------------------------------------------------------------------------
-- Fallback (7-10 km): only when no free ambulance of the type is within 7 km of the pickup
-- ---------------------------------------------------------------------------
insert into public.missions (patient_id, driver_id, status, urgency, vehicle_type, pickup_location, jurisdiction, idempotency_key)
values (:'p1', :'d2', 'en_route', 'CAT_1_IMMEDIATE', 'TYPE_D_ALS', extensions.st_geogfromtext('SRID=4326;POINT(77.5 28.7)'), 'DL', gen_random_uuid());
select set_config('request.jwt.claims', :'jwt_d1', false);
set role authenticated;
select t.eq((select b ->> 'band' from jsonb_array_elements((public.list_nearby_emergencies()) -> 'items') b where b ->> 'missionId' = :'mf'), 'fallback', 'F becomes a fallback once d2 (the only ambulance near it) is busy');
select t.ok(not ((public.list_nearby_emergencies()) ->> 'items') like '%' || :'me' || '%', 'E (8 km, 60 s) stays hidden: one window is not enough for the fallback');
reset role;

-- ---------------------------------------------------------------------------
-- Claim
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', :'jwt_d1', false);
set role authenticated;
select t.raises(format($$select public.claim_emergency(%L)$$, :'mc'), 'PT403', 'C is not claimable: outside the caller band');
select t.raises(format($$select public.claim_emergency(%L)$$, :'mg'), 'PT403', 'G is not claimable: wrong vehicle type');
select t.raises(format($$select public.claim_emergency(%L)$$, gen_random_uuid()), 'PT404', 'an unknown mission is not found');
select t.eq((public.claim_emergency(:'md', '00000000-0000-4000-8000-0000000000f1')) ->> 'status', 'en_route', 'd1 claims the red emergency D');
select t.eq((public.claim_emergency(:'md', '00000000-0000-4000-8000-0000000000f1')) ->> 'replay', 'true', 'a repeated claim with the same client event id is a replay');
select t.raises(format($$select public.claim_emergency(%L)$$, :'ma'), 'PT409', 'a driver who holds a mission cannot claim another (already_on_mission)');
reset role;

select t.eq((select driver_id from public.missions where id = :'md'), :'d1'::uuid, 'the mission now belongs to d1');
select t.eq((select status::text from public.missions where id = :'md'), 'en_route', 'and is en_route');
select t.eq((select metadata -> 'driver' ->> 'vehicleRegistration' from public.mission_events where mission_id = :'md' and event_type = 'DRIVER_ACCEPTED'), 'DL01AB1111', 'the accept event tells the patient the plate');
select t.eq((select metadata -> 'driver' ->> 'displayName' from public.mission_events where mission_id = :'md' and event_type = 'DRIVER_ACCEPTED'), 'Asha V.', 'first name and initial only');

select set_config('request.jwt.claims', :'jwt_d3', false);
set role authenticated;
select t.raises(format($$select public.claim_emergency(%L)$$, :'md'), 'PT409', 'a second crew loses the race (offer_taken)');
select t.ok(not ((public.list_nearby_emergencies()) ->> 'items') like '%' || :'md' || '%', 'a claimed emergency leaves everyone else''s board');
reset role;

-- ---------------------------------------------------------------------------
-- Profile: read, edit, validation, lock
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', :'jwt_d3', false);
set role authenticated;
select t.eq((public.get_driver_profile()) ->> 'onMission', 'false', 'd3 is free');
select t.eq((public.get_driver_profile()) ->> 'regulatedEditable', 'false', 'plate and make are locked once the KYC application is approved');
select t.eq(
  (public.update_driver_profile('{"fullName":"  Ravi Kumar  ","serviceZone":"UP","vehicle":{"crewCount":3,"color":"White"}}')) ->> 'fullName',
  'Ravi Kumar', 'name is trimmed and saved');
select t.eq((public.get_driver_profile()) ->> 'serviceZone', 'UP', 'service area saved');
select t.eq((public.get_driver_profile()) #>> '{vehicle,crewCount}', '3', 'crew size saved');
select t.eq((public.get_driver_profile()) #>> '{vehicle,color}', 'White', 'colour saved');
select t.eq((public.get_driver_profile()) #>> '{vehicle,registrationNumber}', 'DL01AB3333', 'the plate is untouched');
select t.eq((public.update_driver_profile(jsonb_build_object('hospitalId', (select id from public.hospitals where name = 'AIIMS New Delhi')))) ->> 'hospitalName', 'AIIMS New Delhi', 'affiliated hospital saved');
select t.eq((public.update_driver_profile('{"hospitalId":null}')) ->> 'hospitalId', null, 'affiliated hospital can be cleared');
select t.raises($$select public.update_driver_profile('{"fullName":"x"}')$$, 'PT422', 'name too short');
select t.raises($$select public.update_driver_profile('{"serviceZone":"MH"}')$$, 'PT422', 'unknown service area');
select t.raises($$select public.update_driver_profile('{"hospitalId":"00000000-0000-4000-8000-00000000ffff"}')$$, 'PT422', 'unknown hospital');
select t.raises($$select public.update_driver_profile('{"vehicle":{"crewCount":0}}')$$, 'PT422', 'crew size below 1');
select t.raises($$select public.update_driver_profile('{"vehicle":{"crewCount":13}}')$$, 'PT422', 'crew size above 12');
select t.raises($$select public.update_driver_profile('{"vehicle":{"registrationNumber":"!!"}}')$$, 'PT422', 'malformed plate');
select t.raises($$select public.update_driver_profile('{"vehicle":{"registrationNumber":"DL01AB9999"}}')$$, 'PT409', 'plate change refused after KYC approval (kyc_locked)');
select t.raises($$select public.update_driver_profile('[]')$$, 'PT422', 'the patch must be an object');
reset role;

-- An approved driver with no vehicle on file (staff approved them directly) cannot register an unreviewed plate.
select set_config('request.jwt.claims', :'jwt_d4', false);
set role authenticated;
select t.raises($$select public.update_driver_profile('{"vehicle":{"registrationNumber":"DL01AB4444","crewCount":2}}')$$, 'PT409', 'an approved driver cannot create a vehicle record (kyc_locked)');
select t.eq((public.update_driver_profile('{"fullName":"Meera Nair"}')) ->> 'fullName', 'Meera Nair', 'their name is still editable');
reset role;
select t.eq((select count(*)::int from public.driver_vehicles where driver_id = :'d4'), 0, 'and no vehicle row was created');

-- Vehicle plate is unique across drivers, and editable while the application is a draft.
update public.drivers set kyc_status = 'draft', is_verified = false, is_online = false where id = :'d3';
select set_config('request.jwt.claims', :'jwt_d3', false);
set role authenticated;
select t.eq((public.get_driver_profile()) ->> 'regulatedEditable', 'true', 'a draft application may edit plate and make');
select t.raises($$select public.update_driver_profile('{"vehicle":{"registrationNumber":"dl 01 ab 1111"}}')$$, 'PT409', 'a plate another driver holds is refused (registration_in_use)');
select t.eq((public.update_driver_profile('{"vehicle":{"registrationNumber":"dl 01 ab 3434","makeModel":"Force Traveller"}}')) #>> '{vehicle,registrationNumber}', 'DL 01 AB 3434', 'plate is normalised to upper case');
reset role;
update public.drivers set kyc_status = 'approved', is_verified = true, is_online = true where id = :'d3';

-- The lock: d1 holds mission D.
select set_config('request.jwt.claims', :'jwt_d1', false);
set role authenticated;
select t.eq((public.get_driver_profile()) ->> 'onMission', 'true', 'd1 is on a mission');
select t.raises($$select public.update_driver_profile('{"fullName":"Someone Else"}')$$, 'PT409', 'the profile cannot be changed during an emergency (profile_locked)');
select t.raises($$select public.update_driver_profile('{"vehicle":{"crewCount":5}}')$$, 'PT409', 'nor the vehicle details');
select t.raises(format($$update public.profiles set full_name = 'Direct Edit' where id = %L$$, :'d1'), 'PT409', 'the table grant is locked mid-mission too');
reset role;
select t.eq((select full_name from public.profiles where id = :'d1'), 'Asha Verma', 'the name is unchanged');

-- A phone change confirmed by GoTrue reaches profiles.phone, and is refused mid-mission.
update auth.users set phone = '919876509099' where id = :'d3';
select t.eq((select phone from public.profiles where id = :'d3'), '+919876509099', 'a confirmed phone change is mirrored to profiles');
select t.raises(format($$update auth.users set phone = '919876509098' where id = %L$$, :'d1'), 'PT409', 'a phone change is refused mid-mission');

-- The mission ends: the lock lifts.
update public.missions set status = 'cancelled', cancelled_at = now() where id = :'md';
select set_config('request.jwt.claims', :'jwt_d1', false);
set role authenticated;
select t.eq((public.update_driver_profile('{"fullName":"Asha Verma-Singh"}')) ->> 'fullName', 'Asha Verma-Singh', 'the profile is editable again once the mission ends');
reset role;

-- ---------------------------------------------------------------------------
-- Search window: the auto-cancel is lengthened. Drivers were asked and nobody took it -> the request stays open past the
-- last offer wave (on the Booking board) until the window closes; with nobody to ask at any radius it still ends at once.
-- ---------------------------------------------------------------------------
update public.drivers set is_online = true, last_seen_at = now() where id in (:'d1', :'d2', :'d3');
select t.mission(0.009, 0, 'TYPE_D_ALS', 'S1 1km asked') as ms1 \gset
select t.eq(public.dispatch_next_wave(:'ms1'), 1, 'wave 1 reaches the drivers within 3 km');
update public.dispatch_waves set expires_at = now() - interval '1 second' where mission_id = :'ms1' and status = 'broadcasting';
select t.ok(public.dispatch_tick() >= 1, 'the tick walks on to wave 3 (the only driver left is 8 km away)');
select t.eq((select status from public.dispatch_waves where mission_id = :'ms1' and wave_number = 3), 'broadcasting', 'wave 3 is broadcasting');
update public.dispatch_waves set expires_at = now() - interval '1 second' where mission_id = :'ms1' and status = 'broadcasting';
select t.ok(public.dispatch_tick() >= 1, 'wave 3 closes');
select t.eq((select status::text from public.missions where id = :'ms1'), 'requesting', 'the offer waves are used up but the request stays open (no more cancel at ~135 s)');
select t.eq((select status from public.dispatch_waves where mission_id = :'ms1' and wave_number = 3), 'exhausted', 'wave 3 is marked exhausted');
select t.eq((select count(*)::int from public.mission_events where mission_id = :'ms1' and event_type = 'MISSION_CANCELLED'), 0, 'and no cancel was recorded');
select set_config('request.jwt.claims', :'jwt_d1', false);
set role authenticated;
select t.eq((select b ->> 'band' from jsonb_array_elements((public.list_nearby_emergencies()) -> 'items') b where b ->> 'missionId' = :'ms1'), 'green', 'it is on the caller''s board, still green, long after its designed time');
reset role;
select t.eq(public.dispatch_tick(), 0, 'inside the window the tick leaves it alone');
update public.missions set created_at = now() - interval '11 minutes' where id = :'ms1';
select t.ok(public.dispatch_tick() >= 1, 'once the window is over the tick ends it');
select t.eq((select status::text from public.missions where id = :'ms1'), 'cancelled', 'cancelled');
select t.eq((select cancelled_by from public.missions where id = :'ms1'), 'system', 'by the system');
select t.eq((select cancel_note from public.missions where id = :'ms1'), 'no_ambulance_available', 'with the reason the patient app already shows');

select t.mission(0.2, 0, 'TYPE_D_ALS', 'S2 22km away') as ms2 \gset
select t.eq(public.dispatch_next_wave(:'ms2'), 0, 'nobody within 10 km to ask: nothing to wait for');
select t.eq((select status::text from public.missions where id = :'ms2'), 'cancelled', 'so it ends at once, as before');

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
set role anon;
select t.raises($$select public.list_nearby_emergencies()$$, '42501', 'anon cannot list the board');
select t.raises($$select public.claim_emergency(gen_random_uuid())$$, '42501', 'anon cannot claim');
select t.raises($$select public.update_driver_profile('{}')$$, '42501', 'anon cannot edit a profile');
reset role;
set role authenticated;
select t.raises($$select public._board_band(null::public.drivers, null::public.missions)$$, '42501', 'the band helper is internal');
select t.raises($$select public._driver_on_mission(gen_random_uuid())$$, '42501', 'the mission-held helper is internal');
select t.raises($$select public._cancel_unanswered(gen_random_uuid())$$, '42501', 'the system-cancel helper is internal');
select t.raises($$select public.dispatch_tick()$$, '42501', 'a client cannot run the dispatch tick');
reset role;

drop schema t cascade;
\echo ALL BOARD CHECKS PASSED
