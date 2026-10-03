-- Behavioural checks for the hospital handoff (transition_mission PATIENT_ON_BOARD): only a canonical hospitals.id is accepted,
-- the mission stores that foreign key, and the event names the hospital from the table, never from the client. The valid
-- hospital is looked up from the catalog by name at run time (no hard-coded id).
--
-- LOCAL database only (creates users and missions, no clean-up). As `postgres`, after every migration is applied:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -q -f supabase/tests/hospital_handoff.behaviour.sql
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

drop schema if exists t cascade;
create schema t;
grant usage on schema t to authenticated, anon;
create function t.eq(actual anyelement, expected anyelement, msg text) returns text language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FAIL %: expected %, got %', msg, expected, actual; end if;
  return 'ok ' || msg;
end $$;
create function t.ok(cond boolean, msg text) returns text language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL %', msg; end if;
  return 'ok ' || msg;
end $$;
-- "<SQLSTATE> <code>" of a refused statement, or null when it succeeded.
create function t.err(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return null;
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;
grant execute on all functions in schema t to authenticated, anon;

\set p1 '00000000-0000-4000-8000-000000002a01'
\set d1 '00000000-0000-4000-8000-000000002d01'
insert into auth.users (id, phone, raw_app_meta_data, raw_user_meta_data, aud, role) values
  (:'p1', '919876530001', '{}',                '{}', 'authenticated', 'authenticated'),
  (:'d1', '919876530011', '{"role":"driver"}', '{}', 'authenticated', 'authenticated');
insert into public.drivers (id, license_number, ais125_type, kyc_status, is_verified, is_online, last_seen_at, current_location) values
  (:'d1', 'UP-HOSP-1', 'TYPE_C_BLS', 'approved', true, true, now(), extensions.st_geogfromtext('SRID=4326;POINT(77.4800 28.4700)'));

-- The registered catalog the app now reads (hospitals_select_active).
select t.ok((select count(*) from public.hospitals where is_active) >= 1, 'the catalog has active hospitals');
select id as sharda, name as sharda_name from public.hospitals where name ilike 'Sharda Hospital%' and is_active \gset
select t.ok(:'sharda' ~* '^[0-9a-f-]{36}$', 'Sharda Hospital is registered in the catalog with a canonical uuid');
select t.eq((select count(*)::int from public.hospitals where name ilike 'Jaypee%'), 0,
  'Jaypee Hospital is NOT in the catalog: the app must not offer it until it is registered');

-- A mission on scene, assigned to d1 (service role).
create function t.on_scene() returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.missions (patient_id, driver_id, urgency, vehicle_type, pickup_location, jurisdiction, triage, idempotency_key)
  values ('00000000-0000-4000-8000-000000002a01', '00000000-0000-4000-8000-000000002d01', 'CAT_2_URGENT', 'TYPE_C_BLS',
          extensions.st_geogfromtext('SRID=4326;POINT(77.4800 28.4700)'), 'UP', '{}', gen_random_uuid())
  returning id into v;
  perform public._record_event(v, 'requesting', 'MISSION_REQUESTED', null, 'patient', '{}'::jsonb);
  perform public._record_event(v, 'en_route', 'DRIVER_ACCEPTED', null, 'driver', '{}'::jsonb);
  perform public._record_event(v, 'on_scene', 'DRIVER_ARRIVED', null, 'driver', '{}'::jsonb);
  return v;
end $$;
select t.on_scene() as m1 \gset
\set jwt_d1 '{"sub":"00000000-0000-4000-8000-000000002d01","role":"authenticated"}'

select set_config('request.jwt.claims', :'jwt_d1', false);
set role authenticated;
-- Rejections: nothing but a registered, active hospitals.id starts transport.
select t.eq(t.err(format($$select public.transition_mission(%L, 'PATIENT_ON_BOARD', '{"hospitalId":"hosp_sharda_gnoida"}')$$, :'m1')), 'PT422 invalid_hospital',
  'a client-side preset id (the old RANKED_TRAUMA_CENTRES id) is refused');
select t.eq(t.err(format($$select public.transition_mission(%L, 'PATIENT_ON_BOARD', %L)$$, :'m1', json_build_object('hospitalId', :'sharda_name'))), 'PT422 invalid_hospital',
  'the display name in hospitalId is refused');
select t.eq(t.err(format($$select public.transition_mission(%L, 'PATIENT_ON_BOARD', %L)$$, :'m1', json_build_object('hospital', :'sharda_name'))), 'PT409 invalid_hospital',
  'a display-name-only payload (no hospitalId) is refused');
select t.eq(t.err(format($$select public.transition_mission(%L, 'PATIENT_ON_BOARD', '{"hospitalId":"not-a-uuid"}')$$, :'m1')), 'PT422 invalid_hospital',
  'an invalid uuid is refused');
select t.eq(t.err(format($$select public.transition_mission(%L, 'PATIENT_ON_BOARD', '{"hospitalId":"6f0c1e9a-0000-4000-8000-00000000dead"}')$$, :'m1')), 'PT409 invalid_hospital',
  'a well-formed uuid that is no hospital is refused');
select t.eq(t.err(format($$select public.transition_mission(%L, 'PATIENT_ON_BOARD', %L)$$, :'m1', json_build_object('hospitalId', :'m1'))), 'PT409 invalid_hospital',
  'an id from another table (the mission''s own id) is refused');
select t.eq(t.err(format($$select public.transition_mission(%L, 'PATIENT_ON_BOARD', %L)$$, :'m1', json_build_object('hospitalId', :'d1'))), 'PT409 invalid_hospital',
  'an id from another table (the driver''s id) is refused');
reset role;
select t.eq((select status from public.missions where id = :'m1'), 'on_scene'::public.mission_status, 'every refusal leaves the mission on scene');
select t.eq((select destination_hospital_id from public.missions where id = :'m1'), null::uuid, 'and stores no destination');

-- Inactive (unregistered) hospital: refused even with its real id (rolled back).
begin;
update public.hospitals set is_active = false where id = :'sharda';
select set_config('request.jwt.claims', :'jwt_d1', false);
set role authenticated;
select t.eq(t.err(format($$select public.transition_mission(%L, 'PATIENT_ON_BOARD', %L)$$, :'m1', json_build_object('hospitalId', :'sharda'))), 'PT409 invalid_hospital',
  'an inactive hospital is refused');
select t.eq((select count(*)::int from public.hospitals where id = :'sharda'), 0, 'and is hidden from the driver catalog (RLS)');
reset role;
rollback;

-- Valid: the canonical id from the catalog.
select held_capacity as held_before from public.hospitals where id = :'sharda' \gset
select set_config('request.jwt.claims', :'jwt_d1', false);
set role authenticated;
select t.eq((public.transition_mission(:'m1', 'PATIENT_ON_BOARD', json_build_object('hospitalId', :'sharda')::jsonb)) ->> 'status', 'transporting',
  'the registered hospital''s canonical id starts transport');
reset role;
select t.eq((select destination_hospital_id from public.missions where id = :'m1'), :'sharda'::uuid, 'the mission stores the hospitals foreign key');
select t.eq((select metadata -> 'destination' ->> 'hospitalId' from public.mission_events where mission_id = :'m1' and event_type = 'TRANSPORT_STARTED'), :'sharda',
  'TRANSPORT_STARTED carries the same id');
select t.eq((select metadata -> 'destination' ->> 'name' from public.mission_events where mission_id = :'m1' and event_type = 'TRANSPORT_STARTED'), :'sharda_name',
  'and the name read from the hospitals row, not from the client');
select t.eq((select held_capacity from public.hospitals where id = :'sharda'), :held_before + 1, 'a bed is held at that hospital');
select t.ok(not ((select metadata from public.mission_events where mission_id = :'m1' and event_type = 'TRANSPORT_STARTED') ? 'etaMinutes'),
  'no ETA is recorded when the client sent none');

-- Reconnect: the destination reloads from the relationship.
select t.eq((select h.name from public.missions m join public.hospitals h on h.id = m.destination_hospital_id where m.id = :'m1'), :'sharda_name',
  'missions.destination_hospital_id resolves to the hospital after a reconnect');

-- Final fare without a GPS track (invariant: never from an invented or wrong-leg distance). The booking quote here is 525.5 km
-- (the approach from a placeholder hub); the bill must use the pickup -> registered hospital leg the server computes.
update public.missions set distance_km = 525.5 where id = :'m1';
select round((extensions.st_distance(m.pickup_location, h.location) / 1000)::numeric, 2) as leg_km
  from public.missions m join public.hospitals h on h.id = m.destination_hospital_id where m.id = :'m1' \gset
select set_config('request.jwt.claims', :'jwt_d1', false);
set role authenticated;
select public.transition_mission(:'m1', 'ARRIVED_HOSPITAL', '{}');
select t.eq((public.transition_mission(:'m1', 'COMPLETE',
  '{"handoff":{"physicianName":"Dr Test","registrationNumber":"UPMC-1","department":"Emergency"}}')) ->> 'status', 'completed', 'completes with no GPS track');
reset role;
select t.eq((select distance_km from public.missions where id = :'m1'), :'leg_km'::numeric, 'billed distance is the pickup -> hospital leg from canonical points');
select t.ok(:'leg_km'::numeric < 525.5, 'not the 525.5 km booking quote');
select t.eq((select metadata ->> 'distanceSource' from public.mission_events where mission_id = :'m1' and event_type = 'MISSION_COMPLETED'), 'estimate', 'and labelled an estimate');
select t.eq((select final_fare_inr from public.missions where id = :'m1'),
  ((public.compute_statutory_fare('TYPE_C_BLS', 'UP', :'leg_km'::numeric)) ->> 'estimatedTotalInr')::int, 'final fare priced on that leg');

-- G: every active registered hospital is accepted by its catalog id (each attempt rolled back in a subtransaction).
create function t.each_hospital_accepted() returns int language plpgsql as $$
declare h record; v uuid; r jsonb; d uuid; n int := 0;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000002d01","role":"authenticated"}', true);
  for h in select id, name from public.hospitals where is_active and held_capacity < total_capacity order by name loop
    begin
      v := t.on_scene();
      -- Two statements on purpose: a subquery in the same expression would read the snapshot from before the UPDATE.
      r := public.transition_mission(v, 'PATIENT_ON_BOARD', jsonb_build_object('hospitalId', h.id));
      select destination_hospital_id into d from public.missions where id = v;
      if r ->> 'status' is distinct from 'transporting' or d is distinct from h.id then
        raise exception 'FAIL % (%): got % with destination %', h.name, h.id, r, d;
      end if;
      raise exception using errcode = 'P0001', message = 'rollback';
    exception when raise_exception then
      if sqlerrm <> 'rollback' then raise; end if;
    end;
    n := n + 1;
  end loop;
  return n;
end $$;
select t.eq(t.each_hospital_accepted(), (select count(*)::int from public.hospitals where is_active and held_capacity < total_capacity),
  'G: every active registered hospital starts transport by its catalog id');

drop schema t cascade;
select 'ALL HOSPITAL HANDOFF CHECKS PASSED';
