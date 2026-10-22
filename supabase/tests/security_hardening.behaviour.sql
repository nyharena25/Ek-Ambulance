-- Behavioural checks for migration 20261004000000 (security hardening) plus the privilege invariants every migration must
-- keep: one active mission per patient (including a real two-session race), the creation limit, create_mission input
-- bounds, the server-bounded fare path (telemetry window, clamped stage times, accuracy and speed filters), complete
-- erasure, KYC reviewer accountability, normalised plates, bounded consent / profile text, and the grant / RLS surface.
--
-- LOCAL database only (creates users and missions, no clean-up). As `postgres`, after every migration is applied:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -q -f supabase/tests/security_hardening.behaviour.sql
-- now() is frozen inside a transaction, so time is moved by backdating rows, never by sleeping.
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

create extension if not exists dblink with schema extensions;
drop schema if exists sh cascade;
create schema sh;
grant usage on schema sh to authenticated, anon;

create function sh.eq(actual anyelement, expected anyelement, msg text) returns text language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FAIL %: expected %, got %', msg, expected, actual; end if;
  return 'ok ' || msg;
end $$;
create function sh.ok(cond boolean, msg text) returns text language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL %', msg; end if;
  return 'ok ' || msg;
end $$;
create function sh.raises(stmt text, state text, msg text) returns text language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlstate <> state then raise exception 'FAIL %: expected SQLSTATE % got % (%)', msg, state, sqlstate, sqlerrm; end if;
    return 'ok ' || msg;
  end;
  raise exception 'FAIL %: expected SQLSTATE % but the statement succeeded', msg, state;
end $$;
-- The machine code a refused RPC raised (_fail puts it in the message), or null when it succeeded.
create function sh.err(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return null;
exception when others then
  return sqlerrm;
end $$;
grant execute on all functions in schema sh to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 0. Privilege invariants (the whole public schema, not just this migration)
-- ---------------------------------------------------------------------------
select sh.eq((select string_agg(p.proname, ',') from pg_proc p
               where p.pronamespace = 'public'::regnamespace and p.prosecdef
                 and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')), null,
  'every SECURITY DEFINER function pins search_path');
select sh.eq((select string_agg(p.proname, ',') from pg_proc p
               where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'EXECUTE')), null,
  'anon can execute no public function');
select sh.eq((select string_agg(p.proname, ',') from pg_proc p
               where p.pronamespace = 'public'::regnamespace
                 and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')), null,
  'PUBLIC can execute no public function');
select sh.eq((select string_agg(p.proname, ',' order by p.proname) from pg_proc p
               where p.pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  'accept_offer,cancel_mission,claim_emergency,confirm_receipt,create_mission,decline_offer,dispatch_config,get_driver_profile,ingest_telemetry,is_staff,list_nearby_emergencies,list_open_offers,record_consent,request_erasure,set_driver_presence,staff_approve_kyc,staff_driver_activity,staff_driver_missions,staff_get_kyc_application,staff_list_kyc_applications,staff_reject_kyc,submit_kyc,transition_mission,update_driver_profile,upsert_driver_application',
  'authenticated executes exactly the client RPC surface (internal helpers stay private)');
select sh.eq((select string_agg(relname, ',') from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r', 'p') and not relrowsecurity), null,
  'RLS is enabled on every public table');
select sh.eq((select string_agg(table_name || ':' || privilege_type, ',') from information_schema.role_table_grants
               where table_schema = 'public' and grantee = 'anon'), null, 'anon holds no table privilege');
select sh.eq((select string_agg(table_name || ':' || privilege_type, ',' order by table_name, privilege_type) from information_schema.role_table_grants
               where table_schema = 'public' and grantee = 'authenticated' and privilege_type not in ('SELECT')), 'driver_push_tokens:DELETE',
  'authenticated has no table-wide write privilege except deleting its own push tokens');
select sh.ok(not has_table_privilege('authenticated', 'public.telemetry_logs', 'SELECT')
             and not has_table_privilege('authenticated', 'public.dispatch_waves', 'SELECT')
             and not has_table_privilege('authenticated', 'public.jurisdictions', 'SELECT'),
  'telemetry, dispatch waves and jurisdictions are not client-readable');
select sh.ok(not has_column_privilege('authenticated', 'public.missions', 'status', 'UPDATE')
             and not has_column_privilege('authenticated', 'public.missions', 'driver_id', 'UPDATE')
             and not has_column_privilege('authenticated', 'public.drivers', 'kyc_status', 'UPDATE')
             and not has_column_privilege('authenticated', 'public.drivers', 'is_verified', 'UPDATE')
             and not has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE')
             and not has_column_privilege('authenticated', 'public.driver_documents', 'status', 'UPDATE'),
  'no client can write a mission status, assignment, KYC decision, role or document review');
select sh.eq((select count(*)::int from storage.buckets where public), 0, 'no storage bucket is public');

-- ---------------------------------------------------------------------------
-- Fixtures. Pickup 28.5672 N 77.2100 E (Delhi); 0.009 deg of latitude is ~1 km.
-- ---------------------------------------------------------------------------
\set pa  '00000000-0000-4000-8000-00000000a8a1'
\set pr  '00000000-0000-4000-8000-00000000a8a2'
\set pl  '00000000-0000-4000-8000-00000000a8a3'
\set ps  '00000000-0000-4000-8000-00000000a8a4'
\set pb  '00000000-0000-4000-8000-00000000a8a5'
\set pf  '00000000-0000-4000-8000-00000000a8a6'
\set pt  '00000000-0000-4000-8000-00000000a8a7'
\set dd  '00000000-0000-4000-8000-00000000a8d1'
\set df  '00000000-0000-4000-8000-00000000a8d2'
\set dk  '00000000-0000-4000-8000-00000000a8d3'
\set dx  '00000000-0000-4000-8000-00000000a8d4'
\set dy  '00000000-0000-4000-8000-00000000a8d5'
\set st  '00000000-0000-4000-8000-00000000a8e1'

insert into auth.users (id, phone, raw_app_meta_data, raw_user_meta_data, aud, role) values
  (:'pa', '919876548001', '{}', '{}', 'authenticated', 'authenticated'),
  (:'pr', '919876548002', '{}', '{}', 'authenticated', 'authenticated'),
  (:'pl', '919876548003', '{}', '{}', 'authenticated', 'authenticated'),
  (:'ps', '919876548004', '{}', '{}', 'authenticated', 'authenticated'),
  (:'pb', '919876548005', '{}', '{}', 'authenticated', 'authenticated'),
  (:'pf', '919876548006', '{}', '{}', 'authenticated', 'authenticated'),
  (:'pt', '919876548007', '{}', '{}', 'authenticated', 'authenticated'),
  (:'dd', '919876548011', '{"role":"driver"}', '{}', 'authenticated', 'authenticated'),
  (:'df', '919876548012', '{"role":"driver"}', '{}', 'authenticated', 'authenticated'),
  (:'dk', '919876548013', '{"role":"driver"}', '{}', 'authenticated', 'authenticated'),
  (:'dx', '919876548014', '{"role":"driver"}', '{}', 'authenticated', 'authenticated'),
  (:'dy', '919876548015', '{"role":"driver"}', '{}', 'authenticated', 'authenticated'),
  (:'st', '919876548021', '{"role":"staff"}', '{}', 'authenticated', 'authenticated');
insert into public.drivers (id, license_number, ais125_type, kyc_status, is_verified, is_online) values
  (:'dd', 'SH-D', 'TYPE_D_ALS', 'approved', true, false),
  (:'df', 'SH-F', 'TYPE_C_BLS', 'approved', true, false),
  (:'dk', 'SH-K', 'TYPE_C_BLS', 'pending_verification', false, false),
  (:'dx', 'SH-X', 'TYPE_C_BLS', 'draft', false, false),
  (:'dy', 'SH-Y', 'TYPE_C_BLS', 'draft', false, false);

create function sh.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, false) $$;
create function sh.create(p_key uuid) returns jsonb language sql as $$
  select public.create_mission(p_key, 28.5672, 77.21, 'TYPE_D_ALS', 'CAT_1_IMMEDIATE', '{"primary_complaint":"chest_pain"}', 6.0) $$;
grant execute on all functions in schema sh to authenticated;

-- Driver D is online at the pickup, so a new ALS request stays `requesting` (active) instead of ending at once.
select sh.as_user(:'dd');
set role authenticated;
select sh.eq((public.set_driver_presence(true, 28.5672, 77.2100)) ->> 'ok', 'true', 'driver D online at the pickup');
reset role;

-- ---------------------------------------------------------------------------
-- 1. One active mission per patient
-- ---------------------------------------------------------------------------
select sh.as_user(:'pa');
set role authenticated;
select (sh.create('00000000-0000-4000-8000-00000000b001')) -> 'mission' ->> 'id' as ma \gset
select sh.eq((select status::text from public.missions where id = :'ma'), 'requesting', 'first request is active (a driver was asked)');
select sh.eq(sh.err($$select sh.create('00000000-0000-4000-8000-00000000b002')$$), 'active_mission_exists', 'a second request while one is active is refused');
select sh.eq((sh.create('00000000-0000-4000-8000-00000000b001')) ->> 'replay', 'true', 'the same idempotency key still replays the active request');
select sh.eq((public.cancel_mission(:'ma', 'changed_mind')) ->> 'status', 'cancelled', 'the patient cancels');
select (sh.create('00000000-0000-4000-8000-00000000b003')) -> 'mission' ->> 'id' as ma3 \gset
select sh.eq((select count(*)::int from public.missions where id = :'ma3'), 1, 'after the cancel a new request is accepted');
reset role;
select sh.eq((select count(*)::int from public.missions where patient_id = :'pa' and status not in ('completed', 'cancelled')), 1, 'patient A holds exactly one active mission');

-- A mission stuck after pickup (the patient cannot cancel it; nothing ends it yet) must never lock the patient out.
insert into public.missions (patient_id, status, urgency, vehicle_type, pickup_location, jurisdiction, triage, idempotency_key)
values (:'pt', 'transporting', 'CAT_1_IMMEDIATE', 'TYPE_D_ALS', extensions.st_geogfromtext('SRID=4326;POINT(77.2100 28.5672)'), 'DL', '{}', gen_random_uuid());
select sh.as_user(:'pt');
set role authenticated;
select sh.eq(sh.err($$select sh.create(gen_random_uuid())$$), null, 'a mission stuck in transporting does not block a new request');
reset role;

-- The same rule across two real sessions: B's create waits on A's per-patient lock, then sees A's committed mission.
-- Patient A ends their request first so driver D is free (an open offer reserves a driver).
select sh.as_user(:'pa');
set role authenticated;
select public.cancel_mission(:'ma3') \g /dev/null
reset role;
select sh.as_user(:'dd');
set role authenticated;
select public.set_driver_presence(true, 28.5672, 77.2100) \g /dev/null
reset role;
\if :{?race_conn}
\else
  select 'host=' || coalesce(host(inet_server_addr()), '127.0.0.1') || ' port=' || current_setting('port') || ' user=postgres password=postgres' as race_conn \gset
\endif
select extensions.dblink_connect('sa', :'race_conn' || ' dbname=' || current_database());
select extensions.dblink_connect('sb', :'race_conn' || ' dbname=' || current_database());
select extensions.dblink_exec('sa', 'begin');
select s from extensions.dblink('sa', format($q$select set_config('request.jwt.claims', '{"sub":"%s","role":"authenticated"}', true), (sh.create('00000000-0000-4000-8000-00000000b011')) -> 'mission' ->> 'status'$q$, :'pr')) as x(c text, s text);
select extensions.dblink_send_query('sb', format($q$select set_config('request.jwt.claims', '{"sub":"%s","role":"authenticated"}', false), sh.err('select sh.create(''00000000-0000-4000-8000-00000000b012'')')$q$, :'pr'));
select pg_sleep(0.5);
select sh.eq(extensions.dblink_is_busy('sb'), 1, 'B is blocked on the per-patient lock while A is uncommitted');
select extensions.dblink_exec('sa', 'commit');
select sh.eq((select e from extensions.dblink_get_result('sb') as x(c text, e text)), 'active_mission_exists', 'B is refused once A commits');
select extensions.dblink_disconnect('sa');
select extensions.dblink_disconnect('sb');
select sh.eq((select count(*)::int from public.missions where patient_id = :'pr'), 1, 'the race created exactly one mission');

-- ---------------------------------------------------------------------------
-- 2. Creation limit: 10 in an hour, not counting searches the system ended
-- ---------------------------------------------------------------------------
insert into public.missions (patient_id, status, urgency, vehicle_type, pickup_location, jurisdiction, triage, idempotency_key, cancelled_by, cancelled_at)
select :'pl', 'cancelled', 'CAT_1_IMMEDIATE', 'TYPE_D_ALS', extensions.st_geogfromtext('SRID=4326;POINT(77.2100 28.5672)'), 'DL', '{}', gen_random_uuid(), 'patient', now()
  from generate_series(1, 10);
insert into public.missions (patient_id, status, urgency, vehicle_type, pickup_location, jurisdiction, triage, idempotency_key, cancelled_by, cancelled_at)
select :'ps', 'cancelled', 'CAT_1_IMMEDIATE', 'TYPE_D_ALS', extensions.st_geogfromtext('SRID=4326;POINT(77.2100 28.5672)'), 'DL', '{}', gen_random_uuid(), 'system', now()
  from generate_series(1, 10);
select sh.as_user(:'pl');
set role authenticated;
select sh.eq(sh.err($$select sh.create(gen_random_uuid())$$), 'too_many_requests', '11th request in an hour is refused');
select sh.raises($$select sh.create(gen_random_uuid())$$, 'PT429', 'as HTTP 429');
reset role;
select sh.as_user(:'ps');
set role authenticated;
select sh.eq(sh.err($$select sh.create(gen_random_uuid())$$), null, 'searches that ended with no ambulance available never count: the patient can always retry');
reset role;

-- ---------------------------------------------------------------------------
-- 3. create_mission input bounds
-- ---------------------------------------------------------------------------
select sh.as_user(:'pb');
set role authenticated;
select sh.eq(sh.err(format($$select public.create_mission(gen_random_uuid(), 28.5672, 77.21, 'TYPE_D_ALS', 'CAT_1_IMMEDIATE', %L, 6.0)$$, jsonb_build_object('x', repeat('a', 5000)))), 'invalid_triage', 'triage over 4 KB refused');
select sh.eq(sh.err($$select public.create_mission(gen_random_uuid(), 28.5672, 77.21, 'TYPE_D_ALS', 'CAT_1_IMMEDIATE', '{"primary_complaint":{"x":1}}', 6.0)$$), 'invalid_triage', 'non-string triage value refused');
select sh.eq(sh.err(format($$select public.create_mission(gen_random_uuid(), 28.5672, 77.21, 'TYPE_D_ALS', 'CAT_1_IMMEDIATE', %L, 6.0)$$, jsonb_build_object('derived_flags', jsonb_build_array(repeat('x', 65))))), 'invalid_triage', 'over-long derived flag refused');
select sh.eq(sh.err($$select public.create_mission(gen_random_uuid(), 28.5672, 77.21, 'TYPE_D_ALS', 'CAT_1_IMMEDIATE', '{}', 6.0, null, null, 5000)$$), 'invalid_request', 'duration over a day refused');
select sh.eq(sh.err($$select public.create_mission(null, 28.5672, 77.21, 'TYPE_D_ALS', 'CAT_1_IMMEDIATE', '{}', 6.0)$$), 'invalid_idempotency_key', 'missing idempotency key refused');
select sh.eq((select count(*)::int from public.missions where patient_id = :'pb'), 0, 'no refused request wrote a mission');
-- Display text is truncated, never a reason to refuse an emergency (a geocoder address can be long).
select sh.eq(sh.err(format($$select public.create_mission(gen_random_uuid(), 28.5672, 77.21, 'TYPE_D_ALS', 'CAT_1_IMMEDIATE', '{"primary_complaint":"chest_pain"}', 6.0, %L)$$, repeat('a', 400))), null, 'an over-long address does not fail the booking');
reset role;
select sh.eq((select char_length(pickup_address) from public.missions where patient_id = :'pb'), 300, '... it is stored truncated to 300 characters');

-- ---------------------------------------------------------------------------
-- 4. The fare path: telemetry window, clamped stage times, accuracy and speed filters
-- ---------------------------------------------------------------------------
select (id) as aiims from public.hospitals where name = 'AIIMS New Delhi' \gset
insert into public.missions (patient_id, urgency, vehicle_type, pickup_location, jurisdiction, pickup_address, triage, idempotency_key)
values (:'pf', 'CAT_1_IMMEDIATE', 'TYPE_C_BLS', extensions.st_geogfromtext('SRID=4326;POINT(77.21234 28.56789)'), 'DL', 'Flat 4B, Example Road', '{}', gen_random_uuid())
returning id as mf \gset
-- Assigned an hour ago (time is moved by backdating rows).
update public.missions set driver_id = :'df', status = 'en_route', accepted_at = now() - interval '1 hour' where id = :'mf';

select sh.as_user(:'df');
set role authenticated;
select sh.eq(sh.err(format($$select public.transition_mission(%L, 'ON_SCENE', '{"location":{"latitude":95,"longitude":77.2}}')$$, :'mf')), 'invalid_location', 'an out-of-range on-scene latitude is refused');
select sh.eq(sh.err(format($$select public.transition_mission(%L, 'ON_SCENE', %L)$$, :'mf', jsonb_build_object('location', jsonb_build_object('latitude', 28.5679, 'longitude', 77.2123), 'pad', repeat('x', 20000)))), 'invalid_payload', 'an oversized payload is refused');
select sh.eq((public.transition_mission(:'mf', 'ON_SCENE', jsonb_build_object('location', jsonb_build_object('latitude', 28.5679, 'longitude', 77.2123), 'arrivedAt', '2099-01-01T00:00:00Z'))) ->> 'status', 'on_scene', 'on scene, with a device time in 2099');
reset role;
select sh.ok((select arrived_scene_at between now() - interval '1 minute' and now() + interval '5 minutes' from public.missions where id = :'mf'), 'a device time in 2099 is clamped to the server''s now() + 5 min clock-skew allowance');
update public.missions set arrived_scene_at = now() - interval '50 minutes' where id = :'mf';

select sh.as_user(:'df');
set role authenticated;
select sh.eq((public.transition_mission(:'mf', 'PATIENT_ON_BOARD', jsonb_build_object('hospitalId', :'aiims', 'onboardAt', now() - interval '40 minutes'))) ->> 'status', 'transporting', 'on board 40 minutes ago');
-- The transport leg: ~5.56 km per 3 min along a meridian (~111 km/h), a 111 km teleport and a fix with 500 m accuracy.
select sh.eq((public.ingest_telemetry(:'mf', jsonb_build_array(
    jsonb_build_object('latitude', 28.50, 'longitude', 77.20, 'timestamp', now() - interval '39 minutes'),
    jsonb_build_object('latitude', 28.55, 'longitude', 77.20, 'timestamp', now() - interval '36 minutes'),
    jsonb_build_object('latitude', 29.55, 'longitude', 77.20, 'timestamp', now() - interval '34 minutes 30 seconds'),
    jsonb_build_object('latitude', 28.60, 'longitude', 77.20, 'timestamp', now() - interval '33 minutes'),
    jsonb_build_object('latitude', 30.00, 'longitude', 77.20, 'timestamp', now() - interval '31 minutes 30 seconds', 'accuracy', 500),
    jsonb_build_object('latitude', 28.65, 'longitude', 77.20, 'timestamp', now() - interval '30 minutes', 'accuracy', 8),
    jsonb_build_object('latitude', 28.66, 'longitude', 77.20, 'timestamp', now() + interval '1 day'),
    jsonb_build_object('latitude', 28.66, 'longitude', 77.20, 'timestamp', now() - interval '2 hours'),
    jsonb_build_object('latitude', 28.66, 'longitude', 77.20, 'timestamp', now() - interval '30 minutes', 'accuracy', 100000))))
  ->> 'rejected', '3', 'a future ping, a ping before the acceptance and an impossible accuracy are rejected');
select sh.eq((public.transition_mission(:'mf', 'ARRIVED_HOSPITAL', jsonb_build_object('arrivedAt', now() - interval '29 minutes'))) ->> 'status', 'arrived_hospital', 'at the hospital');
select sh.eq(sh.err(format($$select public.transition_mission(%L, 'COMPLETE', %L)$$, :'mf', jsonb_build_object('handoff', jsonb_build_object('physicianName', repeat('d', 201), 'registrationNumber', 'R', 'department', 'ER')))), 'handoff_invalid', 'an over-long sign-off field is refused');
select sh.eq((public.transition_mission(:'mf', 'COMPLETE', '{"completedAt":"2000-01-01T00:00:00Z","handoff":{"physicianName":"Dr Test","registrationNumber":"REG-1","department":"ER"}}')) ->> 'status', 'completed', 'completed with a device time in 2000');
reset role;
select sh.eq((select count(*)::int from public.telemetry_logs where mission_id = :'mf'), 6, 'six pings stored (the teleport and the 500 m fix are track, not distance)');
select sh.eq((select completed_at = arrived_hospital_at from public.missions where id = :'mf'), true, 'a backdated completion is clamped to the hospital arrival (the purge clock cannot be wound back)');
select sh.eq((select metadata ->> 'distanceSource' from public.mission_events where mission_id = :'mf' and event_type = 'MISSION_COMPLETED'), 'measured', 'the fare is measured from the track');
select sh.ok((select distance_km from public.missions where id = :'mf') between 11.0 and 11.3, 'the teleport and the inaccurate fix add nothing: ~11.1 km billed (unfiltered: >300 km)');

-- ---------------------------------------------------------------------------
-- 5. Erasure removes the address, notes and positions; statutory fields stay
-- ---------------------------------------------------------------------------
insert into public.missions (patient_id, urgency, vehicle_type, pickup_location, jurisdiction, pickup_address, triage, idempotency_key)
values (:'pf', 'CAT_2_URGENT', 'TYPE_C_BLS', extensions.st_geogfromtext('SRID=4326;POINT(77.21234 28.56789)'), 'DL', 'Flat 4B, Example Road', '{}', gen_random_uuid())
returning id as mc \gset
select sh.as_user(:'pf');
set role authenticated;
select sh.eq((public.cancel_mission(:'mc', 'other', 'gate code 4321, flat 4B')) ->> 'status', 'cancelled', 'cancelled with a free-text note');
select (public.request_erasure()) ->> 'ok' \g /dev/null
reset role;
select public.process_erasure_requests() \g /dev/null
select sh.ok((select pickup_address is null and route_polyline is null and personal_data_purged_at is not null from public.missions where id = :'mf'), 'erasure removes the pickup address and route');
select sh.eq((select round(extensions.st_y(pickup_location::extensions.geometry)::numeric, 5) || ',' || round(extensions.st_x(pickup_location::extensions.geometry)::numeric, 5) from public.missions where id = :'mf'), '28.57000,77.21000', 'the stored pickup is coarsened to ~1 km');
select sh.ok((select not (metadata ? 'location') from public.mission_events where mission_id = :'mf' and event_type = 'DRIVER_ARRIVED'), 'the on-scene position is removed from the trail');
select sh.ok((select cancel_note is null from public.missions where id = :'mc'), 'the cancel note is removed');
select sh.ok((select not (metadata ? 'note') from public.mission_events where mission_id = :'mc' and event_type = 'MISSION_CANCELLED'), 'the note is removed from the trail');
select sh.ok((select final_fare_inr > 0 and distance_km between 11.0 and 11.3 and jurisdiction = 'DL' from public.missions where id = :'mf'), 'fare, distance and jurisdiction are retained (statutory)');

-- ---------------------------------------------------------------------------
-- 6. KYC decisions name the reviewer
-- ---------------------------------------------------------------------------
select sh.as_user(:'st');
set role authenticated;
select sh.eq(sh.err(format($$select public.staff_reject_kyc(%L, %L)$$, :'dk', repeat('r', 501))), 'reason_too_long', 'an over-long rejection reason is refused');
select sh.eq((public.staff_reject_kyc(:'dk', 'Registration certificate unreadable')) ->> 'kycStatus', 'rejected', 'staff rejects');
reset role;
select sh.eq((select kyc_reviewed_by from public.drivers where id = :'dk'), :'st'::uuid, 'the reviewing staff member is recorded');
select sh.as_user(:'dk');
set role authenticated;
select sh.raises(format($$update public.drivers set kyc_reviewed_by = null where id = %L$$, :'dk'), '42501', 'the driver cannot rewrite who reviewed them');
reset role;

-- ---------------------------------------------------------------------------
-- 7. Plates are unique after normalisation, also through the direct table grant
-- ---------------------------------------------------------------------------
select sh.as_user(:'dx');
set role authenticated;
insert into public.driver_vehicles (driver_id, registration_number, ais125_type) values (:'dx', 'SH77ZZ9901', 'TYPE_C_BLS');
reset role;
select sh.as_user(:'dy');
set role authenticated;
select sh.raises(format($$insert into public.driver_vehicles (driver_id, registration_number, ais125_type) values (%L, 'sh 77-zz 9901', 'TYPE_C_BLS')$$, :'dy'), '23505', 'the same plate with other spacing / case is refused');
reset role;

-- ---------------------------------------------------------------------------
-- 8. Bounded consent and profile text; consent is the caller's own, server-stamped
-- ---------------------------------------------------------------------------
select sh.as_user(:'pb');
set role authenticated;
select sh.eq(sh.err($$select public.record_consent('third_party_llm', 'v1', true, 'fr')$$), 'invalid_consent', 'unknown locale refused');
select sh.eq(sh.err(format($$select public.record_consent('third_party_llm', 'v1', true, 'en', %L)$$, repeat('9', 41))), 'invalid_consent', 'over-long app version refused');
select sh.eq(sh.err(format($$select public.record_consent('third_party_llm', %L, true)$$, repeat('9', 41))), 'invalid_consent', 'over-long notice version refused');
select sh.ok((public.record_consent('third_party_llm', '2026-10', true, 'en')) ->> 'grantedAt' ~ 'Z$', 'a valid grant is recorded with a server timestamp');
select sh.eq((select count(*)::int from public.consent_records where purpose = 'third_party_llm' and user_id = :'pb'), 1, 'recorded against the caller''s own account');
select sh.raises($$update public.consent_records set granted = true$$, '42501', 'consent rows cannot be edited by the client');
select sh.raises(format($$update public.profiles set full_name = %L where id = %L$$, repeat('n', 101), :'pb'), '23514', 'a profile name over 100 characters is refused');
select sh.eq((select count(*)::int from public.profiles where id = :'pb' and full_name is null), 1, 'nothing was written');
reset role;

drop schema sh cascade;
\echo ALL SECURITY HARDENING CHECKS PASSED
