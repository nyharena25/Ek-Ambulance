-- Behavioural checks for the staff driver activity RPCs (migration 20261002000000).
--
-- LOCAL database only. One transaction, rolled back, so no fixture survives:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -q -f supabase/tests/driver_activity.behaviour.sql
-- Prints `ok ...` per check and `ALL DRIVER ACTIVITY CHECKS PASSED`.
--
-- now() is frozen inside a transaction, so lifecycle events are inserted directly (as postgres) with explicit server times
-- and seq, the way _record_event would have written them. The append-only trigger only blocks UPDATE/DELETE.
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

begin;

create schema at;
grant usage on schema at to authenticated, anon;
create function at.eq(actual anyelement, expected anyelement, msg text) returns text language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FAIL %: expected %, got %', msg, expected, actual; end if;
  return 'ok ' || msg;
end $$;
create function at.raises(stmt text, state text, msg text) returns text language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlstate <> state then raise exception 'FAIL %: expected SQLSTATE % got % (%)', msg, state, sqlstate, sqlerrm; end if;
    return 'ok ' || msg;
  end;
  raise exception 'FAIL %: expected SQLSTATE % but the statement succeeded', msg, state;
end $$;
grant execute on all functions in schema at to authenticated, anon;

\set pat '00000000-0000-4000-8000-00000000a0a1'
\set d1  '00000000-0000-4000-8000-00000000a0b1'
\set d2  '00000000-0000-4000-8000-00000000a0b2'
\set st  '00000000-0000-4000-8000-00000000a0c1'
\set jwt_pat '{"sub":"00000000-0000-4000-8000-00000000a0a1","role":"authenticated"}'
\set jwt_d1  '{"sub":"00000000-0000-4000-8000-00000000a0b1","role":"authenticated"}'
\set jwt_st  '{"sub":"00000000-0000-4000-8000-00000000a0c1","role":"authenticated"}'

insert into auth.users (id, phone, raw_app_meta_data, raw_user_meta_data, aud, role) values
  (:'pat', '919876591001', '{}',                '{}', 'authenticated', 'authenticated'),
  (:'d1',  '919876591011', '{"role":"driver"}', '{}', 'authenticated', 'authenticated'),
  (:'d2',  '919876591012', '{"role":"driver"}', '{}', 'authenticated', 'authenticated'),
  (:'st',  '919876591021', '{"role":"staff"}',  '{}', 'authenticated', 'authenticated');
insert into public.drivers (id, license_number, ais125_type, kyc_status, is_verified) values
  (:'d1', 'AT-DL-1', 'TYPE_D_ALS', 'approved', true),
  (:'d2', 'AT-DL-2', 'TYPE_D_ALS', 'approved', true);

-- A mission row as the lifecycle leaves it. The quote (fare_details) is what create_mission stored.
create function at.mission(p_label text, p_status public.mission_status, p_driver uuid, p_est int, p_quote_km numeric,
                           p_final int, p_km numeric) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.missions (patient_id, urgency, vehicle_type, pickup_location, jurisdiction, pickup_address, triage,
                               idempotency_key, status, driver_id, fare_details, final_fare_inr, distance_km, cancel_note)
  values ('00000000-0000-4000-8000-00000000a0a1', 'CAT_1_IMMEDIATE', 'TYPE_D_ALS',
          extensions.st_geogfromtext('SRID=4326;POINT(77.2100 28.5672)'), 'DL', p_label,
          '{"primary_complaint":"private triage"}', gen_random_uuid(), p_status, p_driver,
          jsonb_build_object('estimatedTotalInr', p_est, 'totalDistanceKm', p_quote_km, 'surgeMultiplier', 1.0, 'surgeGougingAmountInr', 0),
          p_final, p_km, 'private patient note')
  returning id into v;
  return v;
end $$;
create function at.ev(p_m uuid, p_seq int, p_type text, p_to public.mission_status, p_by uuid, p_role text, p_at timestamptz,
                      p_meta jsonb default '{}') returns void language sql as $$
  insert into public.mission_events (mission_id, seq, event_type, to_status, triggered_by, actor_role, created_at, metadata)
  values (p_m, p_seq, p_type, p_to, p_by, p_role, p_at, p_meta);
$$;

create temp table ms (k text primary key, id uuid);
insert into ms values
  ('m1', at.mission('M1 offer, completed, measured',          'completed', :'d1', 550, 10, 600, 12.5)),
  ('m2', at.mission('M2 claim, crosses midnight, estimate',   'completed', :'d1', 280, 4, 300, 4.0)),
  ('m3', at.mission('M3 released by d1, completed by d2',     'completed', :'d2', 700, 20, 900, 25.0)),
  ('m4', at.mission('M4 patient cancels before arrival',      'cancelled', :'d1', 400, 6, null, 6)),
  ('m5', at.mission('M5 driver aborts after pickup',          'cancelled', :'d1', 400, 6, null, 6)),
  ('m6', at.mission('M6 accepted today, in progress',         'en_route',  :'d1', 400, 6, null, 6));

-- M1: offered 09:59:30 (wave), accepted 10:00, on scene 10:10, transport 10:20, hospital 10:40, completed 10:45 (IST).
insert into public.dispatch_waves (mission_id, wave_number, radius_km, eligible_driver_ids, status, accepted_by, created_at, expires_at)
select id, 1, 3, array[:'d1']::uuid[], 'accepted', :'d1', '2025-09-01 09:59:30+05:30', '2025-09-01 10:00:15+05:30' from ms where k = 'm1';
select at.ev(id, 1, 'MISSION_REQUESTED', 'requesting', :'pat', 'patient', '2025-09-01 09:59:00+05:30'),
       at.ev(id, 2, 'DRIVER_ACCEPTED', 'en_route', :'d1', 'driver', '2025-09-01 10:00:00+05:30', '{"driver":{"name":"x"}}'),
       at.ev(id, 3, 'DRIVER_ARRIVED', 'on_scene', :'d1', 'driver', '2025-09-01 10:10:00+05:30', '{"arrivedAt":"2025-09-01T04:39:00.000Z"}'),
       at.ev(id, 4, 'TRANSPORT_STARTED', 'transporting', :'d1', 'driver', '2025-09-01 10:20:00+05:30', '{"vitals":{"pulse":"private"}}'),
       at.ev(id, 5, 'HOSPITAL_ARRIVED', 'arrived_hospital', :'d1', 'driver', '2025-09-01 10:40:00+05:30'),
       at.ev(id, 6, 'MISSION_COMPLETED', 'completed', :'d1', 'driver', '2025-09-01 10:45:00+05:30',
             '{"distanceSource":"measured","finalFareInr":600,"handoff":{"physicianName":"private"}}')
  from ms where k = 'm1';
-- M2: board claim (no wave) at 23:50, completed 00:30 the next day; older completion row with only audit.distanceSource.
select at.ev(id, 1, 'MISSION_REQUESTED', 'requesting', :'pat', 'patient', '2025-09-01 23:49:00+05:30'),
       at.ev(id, 2, 'DRIVER_ACCEPTED', 'en_route', :'d1', 'driver', '2025-09-01 23:50:00+05:30'),
       at.ev(id, 3, 'DRIVER_ARRIVED', 'on_scene', :'d1', 'driver', '2025-09-01 23:58:00+05:30'),
       at.ev(id, 4, 'TRANSPORT_STARTED', 'transporting', :'d1', 'driver', '2025-09-02 00:05:00+05:30'),
       at.ev(id, 5, 'HOSPITAL_ARRIVED', 'arrived_hospital', :'d1', 'driver', '2025-09-02 00:25:00+05:30'),
       at.ev(id, 6, 'MISSION_COMPLETED', 'completed', :'d1', 'driver', '2025-09-02 00:30:00+05:30', '{"audit":{"distanceSource":"estimate"}}')
  from ms where k = 'm2';
-- M3: d1 accepts 08:00 and backs out 08:05; d2 accepts 08:10 and completes 08:50.
select at.ev(id, 1, 'MISSION_REQUESTED', 'requesting', :'pat', 'patient', '2025-09-02 07:59:00+05:30'),
       at.ev(id, 2, 'DRIVER_ACCEPTED', 'en_route', :'d1', 'driver', '2025-09-02 08:00:00+05:30'),
       at.ev(id, 3, 'DRIVER_RELEASED', 'requesting', :'d1', 'driver', '2025-09-02 08:05:00+05:30', '{"reason":"vehicle_breakdown"}'),
       at.ev(id, 4, 'DRIVER_ACCEPTED', 'en_route', :'d2', 'driver', '2025-09-02 08:10:00+05:30', '{"driver":{"name":"d2 private"}}'),
       at.ev(id, 5, 'DRIVER_ARRIVED', 'on_scene', :'d2', 'driver', '2025-09-02 08:20:00+05:30'),
       at.ev(id, 6, 'TRANSPORT_STARTED', 'transporting', :'d2', 'driver', '2025-09-02 08:25:00+05:30'),
       at.ev(id, 7, 'HOSPITAL_ARRIVED', 'arrived_hospital', :'d2', 'driver', '2025-09-02 08:45:00+05:30'),
       at.ev(id, 8, 'MISSION_COMPLETED', 'completed', :'d2', 'driver', '2025-09-02 08:50:00+05:30', '{"distanceSource":"measured"}')
  from ms where k = 'm3';
-- M4: accepted 09:00, patient cancels 09:03 (never arrived: on-scene must read as not recorded).
select at.ev(id, 1, 'MISSION_REQUESTED', 'requesting', :'pat', 'patient', '2025-09-02 08:59:00+05:30'),
       at.ev(id, 2, 'DRIVER_ACCEPTED', 'en_route', :'d1', 'driver', '2025-09-02 09:00:00+05:30'),
       at.ev(id, 3, 'MISSION_CANCELLED', 'cancelled', :'pat', 'patient', '2025-09-02 09:03:00+05:30',
             '{"cancelledBy":"patient","reason":"changed_mind","note":"private patient note"}')
  from ms where k = 'm4';
-- M5: accepted 12:00, on scene 12:10, transport 12:20, driver aborts 12:30 (incident).
select at.ev(id, 1, 'MISSION_REQUESTED', 'requesting', :'pat', 'patient', '2025-09-02 11:59:00+05:30'),
       at.ev(id, 2, 'DRIVER_ACCEPTED', 'en_route', :'d1', 'driver', '2025-09-02 12:00:00+05:30'),
       at.ev(id, 3, 'DRIVER_ARRIVED', 'on_scene', :'d1', 'driver', '2025-09-02 12:10:00+05:30'),
       at.ev(id, 4, 'TRANSPORT_STARTED', 'transporting', :'d1', 'driver', '2025-09-02 12:20:00+05:30'),
       at.ev(id, 5, 'MISSION_CANCELLED', 'cancelled', :'d1', 'driver', '2025-09-02 12:30:00+05:30',
             '{"cancelledBy":"driver","reason":"vehicle_breakdown","fromState":"transporting"}')
  from ms where k = 'm5';
-- M6: accepted now (today), nothing after.
select at.ev(id, 1, 'MISSION_REQUESTED', 'requesting', :'pat', 'patient', now() - interval '1 minute'),
       at.ev(id, 2, 'DRIVER_ACCEPTED', 'en_route', :'d1', 'driver', now())
  from ms where k = 'm6';

-- ---------------------------------------------------------------------------
-- Authorization
-- ---------------------------------------------------------------------------
set role anon;
select at.raises(format($$select public.staff_driver_activity(%L, '2025-09-01', '2025-09-02')$$, :'d1'), '42501', 'anon cannot call staff_driver_activity');
select at.raises(format($$select public.staff_driver_missions(%L, '2025-09-01', '2025-09-02')$$, :'d1'), '42501', 'anon cannot call staff_driver_missions');
reset role;

select set_config('request.jwt.claims', :'jwt_pat', true);
set role authenticated;
select at.raises(format($$select public.staff_driver_activity(%L, '2025-09-01', '2025-09-02')$$, :'d1'), 'PT403', 'patient is refused activity');
select at.raises(format($$select public.staff_driver_missions(%L, '2025-09-01', '2025-09-02')$$, :'d1'), 'PT403', 'patient is refused missions');
select at.raises(format($$select * from public._driver_assignments(%L, null, null)$$, :'d1'), '42501', 'the history helper is not client-callable');
reset role;

select set_config('request.jwt.claims', :'jwt_d1', true);
set role authenticated;
select at.raises(format($$select public.staff_driver_activity(%L, '2025-09-01', '2025-09-02')$$, :'d1'), 'PT403', 'a driver cannot read even their own history through the staff RPC');
select at.raises(format($$select public.staff_driver_missions(%L, '2025-09-01', '2025-09-02')$$, :'d2'), 'PT403', 'a driver cannot read another driver');
reset role;

-- ---------------------------------------------------------------------------
-- Staff: aggregation
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', :'jwt_st', true);
set role authenticated;
create temp table a1 as select public.staff_driver_activity(:'d1', '2025-09-01', '2025-09-02') j;
select at.eq(j #>> '{range,accepted}', '5', 'range: five assignments accepted') from a1;
select at.eq(j #>> '{range,completed}', '2', 'range: completed counts only this driver''s completions (M3 went to d2)') from a1;
select at.eq(j #>> '{range,cancelled}', '2', 'range: cancelled while held') from a1;
select at.eq(j #>> '{range,cancelledByDriver}', '1', 'range: driver abort after pickup kept apart from patient cancel') from a1;
select at.eq(j #>> '{range,released}', '1', 'range: release before pickup is its own outcome') from a1;
select at.eq(j #>> '{range,inProgress}', '0', 'range: nothing open in range') from a1;
select at.eq((j #>> '{range,finalFareInr}')::numeric, 900::numeric, 'fare: final fares of completed missions only (600 + 300)') from a1;
select at.eq((j #>> '{range,estimatedFareInr}')::numeric, 830::numeric, 'fare: create_mission quotes of the same missions (550 + 280)') from a1;
select at.eq((j #>> '{range,avgFinalFareInr}')::numeric, 450::numeric, 'fare: average per completed task') from a1;
select at.eq((j #>> '{range,distanceKm}')::numeric, 16.5::numeric, 'distance: billed km of completed missions (12.5 + 4)') from a1;
select at.eq((j #>> '{range,measuredDistanceKm}')::numeric, 12.5::numeric, 'distance: GPS-measured part') from a1;
select at.eq((j #>> '{range,estimateDistanceKm}')::numeric, 4.0::numeric, 'distance: quote-fallback part (legacy audit.distanceSource read)') from a1;
select at.eq(j #>> '{range,estimateDistanceMissions}', '1', 'distance: one completion billed on the quote') from a1;
select at.eq((j #>> '{range,avgDistanceKm}')::numeric, 8.25::numeric, 'distance: average per completed task') from a1;
select at.eq(j #>> '{range,avgCompletedDurationS}', '2550', 'duration: average accept -> complete (45 min, 40 min)') from a1;
select at.eq(j #>> '{range,recordedTimeS}', '7380', 'duration: sum of every ended hold (2700+2400+300+180+1800)') from a1;

select at.eq(jsonb_array_length(j -> 'days'), 2, 'daily: one row per day of the range') from a1;
select at.eq(j #>> '{days,0,date}', '2025-09-02', 'daily: newest day first') from a1;
select at.eq(j #>> '{days,1,accepted}', '2', 'daily: M2 accepted 23:50 IST stays on 09-01 though it ended after midnight') from a1;
select at.eq((j #>> '{days,1,finalFareInr}')::numeric, 900::numeric, 'daily: 09-01 fare') from a1;
select at.eq(j #>> '{days,1,lastActivityAt}', '2025-09-01T19:00:00.000Z', 'daily: last activity is M2''s 00:30 IST completion') from a1;
select at.eq(j #>> '{days,0,completed}', '0', 'daily: 09-02 has no completion of d1') from a1;
select at.eq(j #>> '{days,0,recordedTimeS}', '2280', 'daily: 09-02 recorded time (300+180+1800)') from a1;
select at.eq(j #>> '{days,0,firstActivityAt}', '2025-09-02T02:30:00.000Z', 'daily: first activity 08:00 IST') from a1;
select at.eq(j #>> '{days,0,lastActivityAt}', '2025-09-02T07:00:00.000Z', 'daily: last activity 12:30 IST') from a1;

select at.eq(j #>> '{lifetime,accepted}', '6', 'lifetime: includes today''s open assignment') from a1;
select at.eq(j #>> '{lifetime,inProgress}', '1', 'lifetime: open assignment is in progress, never counted as ended') from a1;
select at.eq((j #>> '{lifetime,finalFareInr}')::numeric, 900::numeric, 'lifetime fare') from a1;
select at.eq(j #>> '{today,accepted}', '1', 'today: only the assignment accepted today') from a1;
select at.eq(j #>> '{today,date}', to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD'), 'today: dated in IST') from a1;

create temp table a2 as select public.staff_driver_activity(:'d1', '2025-09-03', '2025-09-03') j;
select at.eq(j #>> '{range,accepted}', '0', 'date filter: an empty day is zero, not missing') from a2;
select at.eq(j #>> '{days,0,distanceKm}', '0', 'date filter: zero-filled day row') from a2;
select at.eq(j #>> '{range,avgCompletedDurationS}', null, 'no completions: average is null (not recorded), never 0') from a2;
select at.eq(public.staff_driver_activity(:'d2', '2025-09-01', '2025-09-02') #>> '{range,finalFareInr}', '900', 'd2 gets the M3 fare d1 released');

-- ---------------------------------------------------------------------------
-- Staff: mission history
-- ---------------------------------------------------------------------------
create temp table h1 as select public.staff_driver_missions(:'d1', '2025-09-01', '2025-09-02') j;
select at.eq(j ->> 'total', '5', 'history: five assignments in range') from h1;
select at.eq(j #>> '{rows,0,pickupAddress}', 'M5 driver aborts after pickup', 'history: newest accept first') from h1;
create temp table hr as select r from h1, jsonb_array_elements(j -> 'rows') r;
create function pg_temp.row_of(p text) returns jsonb language sql as $$ select r from hr where r ->> 'pickupAddress' like p || '%' $$;
select at.eq(pg_temp.row_of('M1') ->> 'offeredAt', '2025-09-01T04:29:30.000Z', 'offer time = accepted wave creation');
select at.eq(pg_temp.row_of('M2') ->> 'offeredAt', null, 'board claim has no offer time');
select at.eq(pg_temp.row_of('M4') ->> 'onSceneAt', null, 'missing arrival stays null');
select at.eq(pg_temp.row_of('M3') ->> 'finalFareInr', null, 'released mission shows no fare for d1');
select at.eq(pg_temp.row_of('M3') ->> 'billedDistanceKm', null, 'released mission shows no distance for d1');
select at.eq(pg_temp.row_of('M3') ->> 'outcome', 'released', 'released outcome');
select at.eq(pg_temp.row_of('M2') ->> 'distanceSource', 'estimate', 'distance source per mission');
select at.eq(pg_temp.row_of('M1') ->> 'estimatedFareInr', '550', 'estimate fare next to final');
select at.eq(pg_temp.row_of('M1') ->> 'finalFareInr', '600', 'final fare per mission');
select at.eq(pg_temp.row_of('M2') ->> 'destination', null, 'no destination hospital recorded -> null');
select at.eq(jsonb_array_length(pg_temp.row_of('M3') -> 'events'), 8, 'lifecycle: whole mission trail');
select at.eq((pg_temp.row_of('M3') -> 'events') @> '[{"eventType":"DRIVER_ACCEPTED","byThisDriver":false}]', true, 'lifecycle: other driver''s accept is marked');
select at.eq((pg_temp.row_of('M1') -> 'events') @> '[{"eventType":"DRIVER_ARRIVED","reportedAt":"2025-09-01T04:39:00.000Z"}]', true, 'lifecycle: device-reported time kept apart');
select at.eq((select count(*)::int from hr where r::text ~ 'private'), 0, 'privacy: no note, triage, vitals, handoff or driver info');
select at.eq((select count(*)::int from hr where r ? 'patientId' or r ? 'triage'), 0, 'privacy: no patient id or triage key');

select at.eq(public.staff_driver_missions(:'d1', '2025-09-01', '2025-09-02', 'completed') ->> 'total', '2', 'filter: completed');
select at.eq(public.staff_driver_missions(:'d1', '2025-09-01', '2025-09-02', 'released') ->> 'total', '1', 'filter: released');
select at.eq(public.staff_driver_missions(:'d1', '2025-09-01', '2025-09-01') ->> 'total', '2', 'filter: single day');
select at.eq(public.staff_driver_missions(:'d1', '2025-09-01', '2025-09-02', null, 'TYPE_C_BLS') ->> 'total', '0', 'filter: ambulance type');
select at.eq(jsonb_array_length(public.staff_driver_missions(:'d1', '2025-09-01', '2025-09-02', null, null, 2, 0) -> 'rows'), 2, 'pagination: page size');
select at.eq(public.staff_driver_missions(:'d1', '2025-09-01', '2025-09-02', null, null, 2, 4) #>> '{rows,0,pickupAddress}', 'M1 offer, completed, measured', 'pagination: offset');
select at.raises(format($$select public.staff_driver_missions(%L, '2025-09-01', '2025-09-02', 'bogus')$$, :'d1'), 'PT422', 'unknown outcome refused');
select at.raises(format($$select public.staff_driver_activity(%L, '2025-09-02', '2025-09-01')$$, :'d1'), 'PT422', 'from after to refused');
select at.raises(format($$select public.staff_driver_activity(%L, '2024-01-01', '2025-09-01')$$, :'d1'), 'PT422', 'range over 366 days refused');
select at.raises($$select public.staff_driver_activity(gen_random_uuid(), '2025-09-01', '2025-09-02')$$, 'PT404', 'unknown driver');
reset role;

select 'ALL DRIVER ACTIVITY CHECKS PASSED';
rollback;
