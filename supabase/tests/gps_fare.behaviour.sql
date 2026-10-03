-- Behavioural checks for the location and fare path (G4.7-C audit): who may write a driver's position, what dispatch reads,
-- what the mission track and the fare trust. Coordinates here are RPC inputs standing in for a device fix; no device GPS.
--
-- Runs against a LOCAL database only, after every migration is applied (`supabase db reset`). It creates users and
-- missions and does not clean up, so never point it at a real project. As `postgres`:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -q -f supabase/tests/gps_fare.behaviour.sql
-- Every check is a SELECT that raises on failure; the script prints `ok` per check and `ALL GPS AND FARE CHECKS PASSED`.
-- Checks marked "(recorded)" pin CURRENT behaviour the audit reports as a gap; they fail if that behaviour changes.
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

-- The error code a refused RPC raised (_fail puts it in the message).
create function t.err(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return null;
exception when others then
  return sqlerrm;
end $$;
grant execute on all functions in schema t to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Fixtures: two patients, two approved ALS drivers (A, B) and one unverified driver (U). No driver has a position until it
-- reports one through set_driver_presence. The pickup is 28.5672 N 77.2100 E; 0.009 deg of latitude is ~1 km.
-- ---------------------------------------------------------------------------
\set p1 '00000000-0000-4000-8000-000000004701'
\set da '00000000-0000-4000-8000-0000000047a1'
\set db '00000000-0000-4000-8000-0000000047b1'
\set du '00000000-0000-4000-8000-0000000047c1'

insert into auth.users (id, phone, raw_app_meta_data, raw_user_meta_data, aud, role) values
  (:'p1', '919876547001', '{}',                '{}', 'authenticated', 'authenticated'),
  (:'da', '919876547011', '{"role":"driver"}', '{}', 'authenticated', 'authenticated'),
  (:'db', '919876547012', '{"role":"driver"}', '{}', 'authenticated', 'authenticated'),
  (:'du', '919876547013', '{"role":"driver"}', '{}', 'authenticated', 'authenticated');
insert into public.drivers (id, license_number, ais125_type, kyc_status, is_verified, is_online) values
  (:'da', 'GPS-A', 'TYPE_D_ALS', 'approved', true, false),
  (:'db', 'GPS-B', 'TYPE_D_ALS', 'approved', true, false),
  (:'du', 'GPS-U', 'TYPE_D_ALS', 'draft', false, false);

\set jwt_p1 '{"sub":"00000000-0000-4000-8000-000000004701","role":"authenticated"}'
\set jwt_da '{"sub":"00000000-0000-4000-8000-0000000047a1","role":"authenticated"}'
\set jwt_db '{"sub":"00000000-0000-4000-8000-0000000047b1","role":"authenticated"}'
\set jwt_du '{"sub":"00000000-0000-4000-8000-0000000047c1","role":"authenticated"}'

-- A requesting mission at the pickup, inserted directly (service role) as the dispatch tests do.
create function t.mission(p_label text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.missions (patient_id, urgency, vehicle_type, pickup_location, jurisdiction, pickup_address, triage, idempotency_key)
  values ('00000000-0000-4000-8000-000000004701', 'CAT_1_IMMEDIATE', 'TYPE_D_ALS',
          extensions.st_geogfromtext('SRID=4326;POINT(77.2100 28.5672)'), 'DL', p_label, '{}', gen_random_uuid())
  returning id into v;
  return v;
end $$;
-- A driver's stored position as "lat,lng" (4 dp), or null.
create function t.at(p_driver uuid) returns text language sql as $$
  select round(extensions.st_y(current_location::extensions.geometry)::numeric, 4) || ',' ||
         round(extensions.st_x(current_location::extensions.geometry)::numeric, 4)
    from public.drivers where id = p_driver
$$;

-- ---------------------------------------------------------------------------
-- Who may write a driver's position
-- ---------------------------------------------------------------------------
set role anon;
select t.raises($$select public.set_driver_presence(true, 28.5752, 77.21)$$, '42501', 'anon cannot report a position');
reset role;

select set_config('request.jwt.claims', :'jwt_p1', false);
set role authenticated;
select t.eq(t.err($$select public.set_driver_presence(true, 28.5752, 77.21)$$), 'driver_profile_missing', 'a patient cannot report a driver position');
reset role;

select set_config('request.jwt.claims', :'jwt_du', false);
set role authenticated;
select t.eq(t.err($$select public.set_driver_presence(true, 28.5752, 77.21)$$), 'not_verified', 'an unverified driver cannot go online');
reset role;

select set_config('request.jwt.claims', :'jwt_da', false);
set role authenticated;
select t.eq(t.err($$select public.set_driver_presence(true, 90.5, 77.21)$$), 'invalid_location', 'latitude above 90 refused');
select t.eq(t.err($$select public.set_driver_presence(true, -90.5, 77.21)$$), 'invalid_location', 'latitude below -90 refused');
select t.eq(t.err($$select public.set_driver_presence(true, 28.5752, 180.5)$$), 'invalid_location', 'longitude above 180 refused');
select t.eq(t.err($$select public.set_driver_presence(true, 28.5752, -180.5)$$), 'invalid_location', 'longitude below -180 refused');
select t.eq(t.err($$select public.set_driver_presence(true, 28.5752, null)$$), 'invalid_location', 'a latitude without a longitude refused');
select t.raises(format($$update public.drivers set current_location = extensions.st_geogfromtext('SRID=4326;POINT(77.2 28.5)') where id = %L$$, :'da'), '42501', 'no direct write to drivers, own row included');
select t.raises(format($$update public.drivers set is_online = true, last_seen_at = now() where id = %L$$, :'db'), '42501', 'nor to another driver''s row');
select t.eq((public.set_driver_presence(true, 28.5752, 77.21)) ->> 'ok', 'true', 'A goes online at its reported fix (~0.9 km)');
reset role;
select t.eq(t.at(:'da'), '28.5752,77.2100', 'the stored position is exactly the reported one');
select t.eq(t.at(:'db'), null, 'A''s call wrote A''s row only (B still has no position)');
select t.eq(t.at(:'du'), null, 'the refused call wrote nothing for U');

select set_config('request.jwt.claims', :'jwt_da', false);
set role authenticated;
select t.eq((public.set_driver_presence(true, null, 77.5)) ->> 'ok', 'true', 'a longitude without a latitude is accepted (recorded)');
reset role;
select t.eq(t.at(:'da'), '28.5752,77.2100', '... and silently ignored: position unchanged while last_seen_at is refreshed (recorded)');

-- ---------------------------------------------------------------------------
-- What dispatch reads: drivers.current_location, used only while last_seen_at is under 30 s old
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', :'jwt_db', false);
set role authenticated;
select (public.set_driver_presence(true, 28.6752, 77.21)) ->> 'ok' as b_online \gset
reset role;
select t.mission('GA') as mga \gset
select t.eq(public.dispatch_next_wave(:'mga'), 1, 'GA: wave 1 opens');
select t.eq((select eligible_driver_ids from public.dispatch_waves where mission_id = :'mga' and wave_number = 1), array[:'da']::uuid[], 'A (0.9 km) is inside 3 km and asked; B (12 km) is not');

-- B drives in; its next heartbeat carries the new fix and the next evaluation uses it.
select set_config('request.jwt.claims', :'jwt_db', false);
set role authenticated;
select (public.set_driver_presence(true, 28.6072, 77.21)) ->> 'ok' as b_moved \gset
reset role;
select t.eq(t.at(:'db'), '28.6072,77.2100', 'B''s new position is stored');
update public.dispatch_waves set expires_at = now() - interval '1 second' where mission_id = :'mga' and status = 'broadcasting';
select t.eq(public.dispatch_next_wave(:'mga'), 2, 'GA: wave 2 opens');
select t.eq((select eligible_driver_ids from public.dispatch_waves where mission_id = :'mga' and wave_number = 2), array[:'db']::uuid[], 'B, now 4.4 km out, is asked in wave 2 (6 km)');

-- B holds GA's open wave-2 offer, which reserves it (20261003000000). The staleness check below is about A, so GA's offer is
-- set aside for it and reopened afterwards for B's accept.
select t.ok(public._driver_reserved(:'db', gen_random_uuid()), 'B is reserved by its open GA offer');
update public.dispatch_waves set status = 'expired' where mission_id = :'mga' and status = 'broadcasting';
-- A stale heartbeat takes a driver out of dispatch, wherever it last was.
update public.drivers set last_seen_at = now() - interval '31 seconds' where id = :'da';
select t.mission('GC') as mgc \gset
select t.eq(public.dispatch_next_wave(:'mgc'), 2, 'GC: wave 1 is empty (A is stale), wave 2 asks B');
select t.eq((select cardinality(eligible_driver_ids) from public.dispatch_waves where mission_id = :'mgc' and wave_number = 1), 0, 'A at 0.9 km is not asked with a 31 s old heartbeat');

-- A busy driver stays out (G4.7-B).
select id as wga2 from public.dispatch_waves where mission_id = :'mga' and wave_number = 2 \gset
update public.dispatch_waves set status = 'broadcasting', expires_at = now() + interval '15 seconds' where id = :'wga2';
select set_config('request.jwt.claims', :'jwt_db', false);
set role authenticated;
select t.eq((public.accept_offer(:'wga2')) ->> 'status', 'en_route', 'B takes GA');
reset role;
select set_config('request.jwt.claims', :'jwt_da', false);
set role authenticated;
select (public.set_driver_presence(true, 28.5752, 77.21)) ->> 'ok' as a_fresh \gset
reset role;
select t.mission('GD') as mgd \gset
select t.eq(public.dispatch_next_wave(:'mgd'), 1, 'GD: wave 1 opens');
select t.eq((select eligible_driver_ids from public.dispatch_waves where mission_id = :'mgd' and wave_number = 1), array[:'da']::uuid[], 'fresh A is asked again');
select t.eq((select count(*)::int from public.dispatch_waves where mission_id = :'mgd' and :'db' = any (eligible_driver_ids)), 0, 'busy B (4.4 km) is in no GD wave');

-- ---------------------------------------------------------------------------
-- The mission track: only the assigned driver writes it; what it trusts
-- ---------------------------------------------------------------------------
\set pings '[{"latitude":28.5700,"longitude":77.2100,"timestamp":"2026-10-01T10:01:00Z"},{"latitude":28.5800,"longitude":77.2100,"timestamp":"2026-10-01T10:02:00Z"}]'
set role anon;
select t.raises(format($$select public.ingest_telemetry(%L, %L)$$, :'mga', :'pings'), '42501', 'anon cannot write a track');
reset role;
select set_config('request.jwt.claims', :'jwt_p1', false);
set role authenticated;
select t.eq(t.err(format($$select public.ingest_telemetry(%L, %L)$$, :'mga', :'pings')), 'not_found', 'the patient cannot write the track of their own mission');
select t.raises($$select count(*) from public.telemetry_logs$$, '42501', 'and cannot read any track');
reset role;
select set_config('request.jwt.claims', :'jwt_da', false);
set role authenticated;
select t.eq(t.err(format($$select public.ingest_telemetry(%L, %L)$$, :'mga', :'pings')), 'not_found', 'a driver not assigned to GA cannot write its track');
reset role;
select set_config('request.jwt.claims', :'jwt_db', false);
set role authenticated;
select t.eq((public.ingest_telemetry(:'mga', '[{"latitude":90.5,"longitude":77.21,"timestamp":"2026-10-01T10:00:00Z"},{"latitude":28.57,"longitude":180.5,"timestamp":"2026-10-01T10:00:00Z"},{"latitude":28.57,"longitude":77.21,"timestamp":"not a time"}]')) ->> 'rejected', '3', 'bad latitude, bad longitude and a bad timestamp are rejected');
select t.eq((public.ingest_telemetry(:'mga', '[{"latitude":28.57,"longitude":77.21,"timestamp":"2019-01-01T00:00:00Z"}]')) ->> 'acknowledged', '1', 'a ping stamped years before the mission is accepted (recorded)');
select t.eq((public.ingest_telemetry(:'mga', '[{"latitude":28.57,"longitude":77.21,"timestamp":"2019-01-01T00:00:01Z","accuracy":5000}]')) ->> 'acknowledged', '1', 'a fix with 5 km accuracy is accepted as track (recorded)');
reset role;
select t.eq(t.at(:'db'), '28.6072,77.2100', 'the mission track never moves drivers.current_location (only the heartbeat does)');

-- ---------------------------------------------------------------------------
-- The fare. Quote: create_mission prices the distance the client sends. Final: COMPLETE measures the transport leg
-- (onboard -> hospital arrival, both times sent by the driver) from the track, else (20261003000000) the pickup -> hospital
-- leg from canonical points, labelled an estimate.
-- ---------------------------------------------------------------------------
select (id) as aiims from public.hospitals where name = 'AIIMS New Delhi' \gset
select set_config('request.jwt.claims', :'jwt_db', false);
set role authenticated;
select t.eq((public.transition_mission(:'mga', 'ON_SCENE', '{"location":{"latitude":28.5673,"longitude":77.2101}}')) ->> 'status', 'on_scene', 'GA: on scene');
select t.eq((public.transition_mission(:'mga', 'PATIENT_ON_BOARD', jsonb_build_object('hospitalId', :'aiims', 'onboardAt', '2020-01-01T00:00:00Z', 'etaMinutes', 10))) ->> 'status', 'transporting', 'GA: on board, with an onboardAt years in the past');
select t.eq((public.transition_mission(:'mga', 'ARRIVED_HOSPITAL', '{"arrivedAt":"2020-01-01T00:30:00Z"}')) ->> 'status', 'arrived_hospital', 'GA: at hospital');
reset role;
select t.eq((select onboard_at from public.missions where id = :'mga'), '2020-01-01T00:00:00Z'::timestamptz, 'the billing window starts where the driver says, unbounded by server time (recorded)');
select set_config('request.jwt.claims', :'jwt_db', false);
set role authenticated;
select t.eq((public.transition_mission(:'mga', 'COMPLETE', '{"handoff":{"physicianName":"Dr Test","registrationNumber":"REG-1","department":"ER"}}')) ->> 'status', 'completed', 'GA: completed');
reset role;
select t.eq((select metadata -> 'audit' ->> 'distanceSource' from public.mission_events where mission_id = :'mga' and event_type = 'MISSION_COMPLETED'), 'estimate', 'no track inside the window: the bill falls back to an estimate');
select t.eq((select metadata ->> 'distanceSource' from public.mission_events where mission_id = :'mga' and event_type = 'MISSION_COMPLETED'), 'estimate', 'the completion record says so as a first-class field (migration 20261001000001)');
-- The same filter mission_events_publish applies before the wire: the patient-facing copy still carries the source.
select t.eq((select (metadata - array['vitals', 'handoff', 'emergencyType', 'bypass', 'audit']) ->> 'distanceSource' from public.mission_events where mission_id = :'mga' and event_type = 'MISSION_COMPLETED'), 'estimate', 'and so does the copy the patient receives (audit stripped)');
select t.eq((select final_fare_inr from public.missions where id = :'mga'), 500, 'GA''s pickup -> hospital leg is inside the 5 km included: a base-only ALS fare (recorded)');

-- Neither the patient nor the driver can write a fare field.
select set_config('request.jwt.claims', :'jwt_p1', false);
set role authenticated;
select t.raises(format($$update public.missions set final_fare_inr = 1 where id = %L$$, :'mga'), '42501', 'the patient cannot write final_fare_inr');
select t.raises(format($$update public.missions set fare_details = '{}' where id = %L$$, :'mga'), '42501', 'the patient cannot write fare_details');
select t.raises(format($$update public.missions set distance_km = 0 where id = %L$$, :'mga'), '42501', 'the patient cannot write distance_km');
reset role;
select set_config('request.jwt.claims', :'jwt_db', false);
set role authenticated;
select t.raises(format($$update public.missions set final_fare_inr = 99999 where id = %L$$, :'mga'), '42501', 'the driver cannot write final_fare_inr');
reset role;

-- The quote is priced from the client's distance, within 0..9999.99 km.
select set_config('request.jwt.claims', :'jwt_p1', false);
set role authenticated;
select t.eq(t.err($$select public.create_mission(gen_random_uuid(), 28.5672, 77.21, 'TYPE_D_ALS', 'CAT_1_IMMEDIATE', '{}', -1)$$), 'invalid_distance', 'a negative distance is refused');
select t.eq(t.err($$select public.create_mission(gen_random_uuid(), 28.5672, 77.21, 'TYPE_D_ALS', 'CAT_1_IMMEDIATE', '{}', 10000)$$), 'invalid_distance', 'a distance over 9999.99 km is refused');
select (public.create_mission(gen_random_uuid(), 28.5672, 77.21, 'TYPE_D_ALS', 'CAT_1_IMMEDIATE', '{}', 0)) -> 'mission' as q0 \gset
-- Lucknow: 525.5 km is the patient app's own quote distance for this pickup (UP hub near Noida -> Lucknow, offline route estimate).
select (public.create_mission(gen_random_uuid(), 26.8467, 80.9462, 'TYPE_D_ALS', 'CAT_1_IMMEDIATE', '{}', 525.5)) -> 'mission' as ql \gset
reset role;
select t.eq((:'q0'::jsonb) #>> '{fareDetails,estimatedTotalInr}', '500', 'a 0 km quote is a base-only fare (recorded: the server prices the client''s distance)');
select t.eq((:'ql'::jsonb) ->> 'jurisdiction', 'UP', 'Lucknow is UP');
select t.eq((:'ql'::jsonb) #>> '{fareDetails,estimatedTotalInr}', '13513', 'Lucknow is priced at the client''s 525.5 km: INR 13513, the same figure the patient app quotes');
select t.eq((:'ql'::jsonb) ->> 'status', 'cancelled', 'nobody within 10 km of Lucknow: cancelled at once (no_ambulance_available)');

drop schema t cascade;
\echo ALL GPS AND FARE CHECKS PASSED
