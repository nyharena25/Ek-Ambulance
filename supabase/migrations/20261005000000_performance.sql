-- Performance (no behaviour change). Measured locally with 5000 online + 1000 offline drivers and 300 open requests
-- (supabase/tests/performance.behaviour.sql asserts the plans and the unchanged results).
--
--  1. Dispatch candidates and the board's fallback check now use the spatial index on online drivers. _driver_dispatchable()
--     has a SET search_path clause, so Postgres cannot inline it; the planner never saw `is_online`, could not use the
--     partial GiST index idx_drivers_online_location (0 scans in every suite) and scanned every driver row per wave:
--     69.5 ms / 7832 buffers -> 1.0 ms / 190 buffers for a 3 km wave. `is_online and is_verified` are now stated in the
--     query as well; they are the same conditions _driver_dispatchable() already requires, so the candidate set, its
--     order (distance, then id) and the FOR UPDATE SKIP LOCKED claiming are unchanged.
--  2. ingest_telemetry inserts a batch in one statement. Before, every ping ran in its own subtransaction (BEGIN ... EXCEPTION
--     per row): up to 1000 per call, past the 64-subtransaction cache, which slows every other session's snapshot checks
--     while the batch is open. The per-ping path is kept as the fallback, so any batch the fast path cannot take whole
--     (a non-numeric string, a numeric overflow, an impossible date) gets exactly the old per-ping result.
--  3. Indexes with no reader and a write cost on hot paths are dropped (each query that touches these tables is listed):
--       idx_missions_active_driver          identical to the unique missions_one_active_per_driver (same columns, same predicate)
--       idx_telemetry_mission_time          (mission_id, recorded_at): the fare query filters mission_id + driver_id + recorded_at
--                                           and the purge deletes by mission_id; both use idx_telemetry_dedupe. Written per ping.
--       idx_dispatch_waves_eligible_drivers GIN on eligible_driver_ids: every reader uses `= any (...)` on a row already found by
--                                           mission or by the open-wave index, which a GIN index cannot serve. Written per wave.
--       idx_mission_events_mission_time     (mission_id, created_at): events are read by mission + seq / event type through
--                                           idx_mission_events_mission_seq. Written per lifecycle event.
set search_path to public, extensions;

create or replace function public.dispatch_next_wave(p_mission_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.missions;
  cfg jsonb := public.dispatch_config();
  ttl integer := (cfg ->> 'offerTtlSeconds')::integer;
  n integer;
  radius numeric;
  ids uuid[];
  w public.dispatch_waves;
  r record;
begin
  select * into m from public.missions where id = p_mission_id;
  if not found or m.status <> 'requesting' or m.driver_id is not null then return -1; end if;

  update public.dispatch_waves set status = 'expired' where mission_id = p_mission_id and status = 'broadcasting';

  loop
    select coalesce(max(wave_number), 0) + 1 into n from public.dispatch_waves where mission_id = p_mission_id and round = m.dispatch_round;
    if n > jsonb_array_length(cfg -> 'radiiKm') then
      update public.dispatch_waves set status = 'exhausted' where mission_id = p_mission_id and round = m.dispatch_round and wave_number = n - 1;
      -- Stays open for the search window (on the Booking board) when drivers were asked this round, or when it is a
      -- re-dispatch after a release: that patient already had an ambulance coming, so the request is not ended just because
      -- nobody else is free this second. dispatch_tick still ends it when the window closes.
      if now() < m.search_started_at + make_interval(secs => (cfg ->> 'searchTtlSeconds')::integer)
         and (m.dispatch_round > 1
              or exists (select 1 from public.dispatch_waves x where x.mission_id = p_mission_id and x.round = m.dispatch_round and cardinality(x.eligible_driver_ids) > 0)) then
        raise log 'dispatch waves_exhausted %', jsonb_build_object('mission_id', p_mission_id, 'round', m.dispatch_round);
        return -2;
      end if;
      raise log 'dispatch no_ambulance_available %', jsonb_build_object('mission_id', p_mission_id, 'round', m.dispatch_round);
      perform public._cancel_unanswered(p_mission_id);
      return 0;
    end if;

    radius := (cfg -> 'radiiKm' ->> (n - 1))::numeric;
    -- SKIP LOCKED: a driver row another transaction is claiming (an accept, a concurrent wave) is left to that transaction;
    -- the second wave then gets the next free candidate instead of waiting or double-offering.
    -- ponytail: a driver whose row is locked only by a heartbeat for those milliseconds also sits this wave out; the next
    -- wave (larger radius, same position) offers them again.
    select coalesce(array_agg(c.id order by c.dist, c.id), '{}'::uuid[]) into ids
      from (
        select d.id, extensions.st_distance(d.current_location, m.pickup_location) as dist
          from public.drivers d
         where d.is_online and d.is_verified and public._driver_dispatchable(d)
           and d.ais125_type = m.vehicle_type
           and (d.service_zone is null or d.service_zone = m.jurisdiction)
           and extensions.st_dwithin(d.current_location, m.pickup_location, radius * 1000)
           and not public._driver_on_mission(d.id)
           and not public._driver_reserved(d.id, m.id)
           and not exists (
             select 1 from public.dispatch_waves pw
              where pw.mission_id = m.id
                and ((pw.round = m.dispatch_round and d.id = any (pw.eligible_driver_ids)) or pw.accepted_by = d.id)
           )
         for update of d skip locked
      ) c;

    insert into public.dispatch_waves (mission_id, round, wave_number, radius_km, eligible_driver_ids, status, expires_at)
    values (
      p_mission_id, m.dispatch_round, n, radius, ids,
      case when cardinality(ids) = 0 then 'expired' else 'broadcasting' end,
      case when cardinality(ids) = 0 then now() else now() + make_interval(secs => ttl) end
    )
    returning * into w;
    raise log 'dispatch wave_opened %', jsonb_build_object('mission_id', p_mission_id, 'offer_id', w.id, 'round', w.round,
      'wave', n, 'radius_km', radius, 'candidate_count', cardinality(ids));

    if cardinality(ids) > 0 then
      for r in
        select d.id,
               round((extensions.st_distance(d.current_location, m.pickup_location) / 1000)::numeric, 1) as km
          from public.drivers d where d.id = any (ids)
      loop
        perform public.publish_realtime('driver:' || r.id || ':offers', public._offer_payload(w, m, r.km));
      end loop;
      return n;
    end if;
  end loop;
end;
$$;

create or replace function public._board_band(d public.drivers, m public.missions)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cfg jsonb := public.dispatch_config();
  win numeric := (cfg ->> 'waveWindowSeconds')::numeric;
  g numeric := (cfg -> 'boardRadiiKm' ->> 0)::numeric;
  r numeric := (cfg -> 'boardRadiiKm' ->> 1)::numeric;
  f numeric := (cfg -> 'boardRadiiKm' ->> 2)::numeric;
  km numeric;
  age numeric;
begin
  if m.status <> 'requesting' or m.driver_id is not null or m.vehicle_type <> d.ais125_type or d.current_location is null then
    return null;
  end if;
  km := extensions.st_distance(d.current_location, m.pickup_location) / 1000;
  age := extract(epoch from now() - m.search_started_at);
  if km <= g then return 'green'; end if;
  if km <= r then return case when age >= win then 'red' end; end if;
  if km <= f and age >= 2 * win and not exists (
    select 1 from public.drivers x
     where x.is_online and x.is_verified and public._driver_dispatchable(x) and x.ais125_type = m.vehicle_type
       and extensions.st_dwithin(x.current_location, m.pickup_location, r * 1000)
       and not public._driver_on_mission(x.id)
  ) then
    return 'fallback';
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- ingest_telemetry: as 20261004000000, with a one-statement fast path. The acceptance rules are the same expressions; the
-- per-ping loop below is unchanged and runs whenever the fast path raised.
-- ---------------------------------------------------------------------------
create or replace function public.ingest_telemetry(p_mission_id uuid, p_pings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  m public.missions;
  x jsonb;
  v_at timestamptz;
  v_from timestamptz;
  v_ack integer := 0;
  v_rej integer := 0;
begin
  if v_uid is null then perform public._fail('unauthenticated', 'PT401'); end if;
  if jsonb_typeof(p_pings) is distinct from 'array' or jsonb_array_length(p_pings) > 1000 then perform public._fail('invalid_batch', 'PT422'); end if;
  select * into m from public.missions where id = p_mission_id and driver_id = v_uid;
  if not found or m.status not in ('en_route', 'on_scene', 'transporting', 'arrived_hospital') then
    perform public._fail('not_found', 'PT404');
  end if;
  v_from := coalesce(m.accepted_at, m.created_at) - interval '5 minutes';

  -- Fast path: one statement, one subtransaction for the whole batch.
  begin
    with r as (
      select ping,
             not coalesce(
               jsonb_typeof(ping -> 'latitude') is distinct from 'number' or jsonb_typeof(ping -> 'longitude') is distinct from 'number'
               or (ping ->> 'latitude')::double precision not between -90 and 90
               or (ping ->> 'longitude')::double precision not between -180 and 180
               or (ping ? 'speed' and (ping ->> 'speed')::numeric < 0)
               or (ping ? 'heading' and (ping ->> 'heading')::numeric not between 0 and 360)
               or (ping ? 'accuracy' and (ping ->> 'accuracy')::numeric not between 0 and 99999), false)
             and coalesce((ping ->> 'timestamp')::timestamptz between v_from and now() + interval '5 minutes', false) as ok
        from jsonb_array_elements(p_pings) as e(ping)
    ), ins as (
      insert into public.telemetry_logs (mission_id, driver_id, location, speed, heading, recorded_at, accuracy_m, dead_zone)
      select m.id, v_uid,
        extensions.st_setsrid(extensions.st_makepoint((ping ->> 'longitude')::double precision, (ping ->> 'latitude')::double precision), 4326)::extensions.geography,
        (ping ->> 'speed')::numeric, (ping ->> 'heading')::numeric, (ping ->> 'timestamp')::timestamptz, (ping ->> 'accuracy')::numeric,
        coalesce((ping ->> 'deadZone')::boolean, false)
        from r where ok
      on conflict do nothing
    )
    select count(*) filter (where ok), count(*) filter (where not ok) into v_ack, v_rej from r;
    return jsonb_build_object('acknowledged', v_ack, 'rejected', v_rej);
  exception when others then
    v_ack := 0;
    v_rej := 0;
  end;

  -- Per-ping path (unchanged): a row that raises is counted as rejected, the others are stored.
  for x in select * from jsonb_array_elements(p_pings) loop
    begin
      if jsonb_typeof(x -> 'latitude') is distinct from 'number' or jsonb_typeof(x -> 'longitude') is distinct from 'number'
         or (x ->> 'latitude')::double precision not between -90 and 90
         or (x ->> 'longitude')::double precision not between -180 and 180
         or (x ? 'speed' and (x ->> 'speed')::numeric < 0)
         or (x ? 'heading' and (x ->> 'heading')::numeric not between 0 and 360)
         or (x ? 'accuracy' and (x ->> 'accuracy')::numeric not between 0 and 99999) then
        v_rej := v_rej + 1;
        continue;
      end if;
      v_at := (x ->> 'timestamp')::timestamptz;
      if v_at is null or v_at < v_from or v_at > now() + interval '5 minutes' then
        v_rej := v_rej + 1;
        continue;
      end if;
      insert into public.telemetry_logs (mission_id, driver_id, location, speed, heading, recorded_at, accuracy_m, dead_zone)
      values (m.id, v_uid,
        extensions.st_setsrid(extensions.st_makepoint((x ->> 'longitude')::double precision, (x ->> 'latitude')::double precision), 4326)::extensions.geography,
        (x ->> 'speed')::numeric, (x ->> 'heading')::numeric, v_at, (x ->> 'accuracy')::numeric,
        coalesce((x ->> 'deadZone')::boolean, false))
      on conflict do nothing;
      v_ack := v_ack + 1;
    exception when others then
      v_rej := v_rej + 1;
    end;
  end loop;
  return jsonb_build_object('acknowledged', v_ack, 'rejected', v_rej);
end;
$$;

-- ---------------------------------------------------------------------------
-- Unused indexes (see 3 above)
-- ---------------------------------------------------------------------------
drop index if exists public.idx_missions_active_driver;
drop index if exists public.idx_telemetry_mission_time;
drop index if exists public.idx_dispatch_waves_eligible_drivers;
drop index if exists public.idx_mission_events_mission_time;

-- Privileges: create or replace keeps every grant.
grant execute on all functions in schema public to service_role;
