-- Extended search window: a request nobody took no longer dies at the end of the last offer wave (~135 s).
--
-- The offer waves (3 / 6 / 10 km, 45 s each) push to the drivers within range and are unchanged. What changed is the end:
-- when the last wave closes and drivers WERE asked, the request stays `requesting`, still visible on every eligible driver's
-- Booking board (green within 4 km, red within 7 km, fallback within 10 km; none of those bands has an upper age), until the
-- search window (dispatch_config().searchTtlSeconds = 345 s: the 45 s designed time + 5 minutes overdue, measured from
-- creation, so the signed timer never reads past -05:00) closes. dispatch_tick then ends it with the same
-- system cancel the patient already handles (reason no_ambulance_available).
-- With nobody to ask at any radius there is nothing to wait for, so that case still ends at once, as before.

create or replace function public.dispatch_config()
returns jsonb
language sql
immutable
set search_path = ''
as $$ select jsonb_build_object('offerTtlSeconds', 15, 'waveWindowSeconds', 45, 'radiiKm', jsonb_build_array(3, 6, 10), 'boardRadiiKm', jsonb_build_array(4, 7, 10), 'searchTtlSeconds', 345) $$;

-- The system end of a search: one place, used by exhaustion with nobody to ask and by the search window closing.
create function public._cancel_unanswered(p_mission_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.missions;
begin
  select * into m from public.missions where id = p_mission_id;
  perform public._record_event(p_mission_id, 'cancelled', 'MISSION_CANCELLED', null, 'system',
    jsonb_build_object('cancelledBy', 'system', 'reason', 'no_ambulance_available', 'fromState', m.status));
  update public.missions
     set cancelled_at = now(), cancelled_by = 'system', cancel_reason = 'other', cancel_note = 'no_ambulance_available'
   where id = p_mission_id;
end;
$$;

-- Opens the next wave for a `requesting` mission. Returns the wave number opened, 0 when nothing could be asked and the
-- mission was cancelled by `system`, -2 when the waves are used up but the request stays open for the search window, or
-- -1 when there was nothing to dispatch.
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
  win integer := (cfg ->> 'waveWindowSeconds')::integer;
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
    select coalesce(max(wave_number), 0) + 1 into n from public.dispatch_waves where mission_id = p_mission_id;
    if n > jsonb_array_length(cfg -> 'radiiKm') then
      update public.dispatch_waves set status = 'exhausted' where mission_id = p_mission_id and wave_number = n - 1;
      if now() < m.created_at + make_interval(secs => (cfg ->> 'searchTtlSeconds')::integer)
         and exists (select 1 from public.dispatch_waves x where x.mission_id = p_mission_id and cardinality(x.eligible_driver_ids) > 0) then
        return -2;
      end if;
      perform public._cancel_unanswered(p_mission_id);
      return 0;
    end if;

    radius := (cfg -> 'radiiKm' ->> (n - 1))::numeric;
    select coalesce(array_agg(d.id order by extensions.st_distance(d.current_location, m.pickup_location)), '{}'::uuid[])
      into ids
      from public.drivers d
     where d.is_online and d.is_verified
       and d.ais125_type = m.vehicle_type
       and d.last_seen_at > now() - interval '30 seconds'
       and extensions.st_dwithin(d.current_location, m.pickup_location, radius * 1000)
       and not exists (
         select 1 from public.dispatch_waves pw
          where pw.mission_id = m.id and d.id = any (pw.eligible_driver_ids)
       );

    insert into public.dispatch_waves (mission_id, wave_number, radius_km, eligible_driver_ids, status, expires_at)
    values (
      p_mission_id, n, radius, ids,
      case when cardinality(ids) = 0 then 'expired' else 'broadcasting' end,
      case when cardinality(ids) = 0 then now() else now() + make_interval(secs => win) end
    )
    returning * into w;

    if cardinality(ids) > 0 then
      for r in
        select d.id,
               round((extensions.st_distance(d.current_location, m.pickup_location) / 1000)::numeric, 1) as km
          from public.drivers d where d.id = any (ids)
      loop
        perform public.publish_realtime('driver:' || r.id || ':offers', jsonb_build_object(
          'v', 1,
          'type', 'offer',
          'offerId', w.id,
          'missionId', m.id,
          'waveNumber', n,
          'issuedAt', public.iso_utc(now()),
          'expiresAt', public.iso_utc(now() + make_interval(secs => ttl)),
          'urgency', m.urgency,
          'requiredVehicleType', m.vehicle_type,
          'jurisdiction', m.jurisdiction,
          'pickup', jsonb_strip_nulls(jsonb_build_object(
            'latitude', extensions.st_y(m.pickup_location::extensions.geometry),
            'longitude', extensions.st_x(m.pickup_location::extensions.geometry),
            'address', m.pickup_address)),
          'distanceKm', r.km,
          'patientSummary', jsonb_strip_nulls(jsonb_build_object(
            'primaryComplaint', m.triage -> 'primary_complaint',
            'derivedFlags', m.triage -> 'derived_flags',
            'ageBand', m.triage -> 'age_band',
            'sex', m.triage -> 'sex'))
        ));
      end loop;
      return n;
    end if;
  end loop;
end;
$$;

-- Escalation and the search window. Run every few seconds from pg_cron or a worker (service_role):
--   select cron.schedule('dispatch-tick', '5 seconds', 'select public.dispatch_tick()');
-- The search window closes to within one tick interval.
create or replace function public.dispatch_tick()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
  ttl integer := (public.dispatch_config() ->> 'searchTtlSeconds')::integer;
begin
  for r in
    select m.id from public.missions m
     where m.status = 'requesting'
       and exists (select 1 from public.dispatch_waves w where w.mission_id = m.id and w.status = 'broadcasting' and w.expires_at <= now())
     for update of m skip locked
  loop
    perform public._revoke_offers(r.id, 'expired');
    perform public.dispatch_next_wave(r.id);
    n := n + 1;
  end loop;

  for r in
    select m.id from public.missions m
     where m.status = 'requesting' and m.driver_id is null
       and m.created_at + make_interval(secs => ttl) <= now()
     for update of m skip locked
  loop
    perform public._revoke_offers(r.id, 'expired');
    update public.dispatch_waves set status = 'expired' where mission_id = r.id and status = 'broadcasting';
    perform public._cancel_unanswered(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Privileges: the helper is internal; the two redefined functions keep theirs (create or replace preserves them).
revoke all on function public._cancel_unanswered(uuid) from public, anon, authenticated;
grant execute on function public.dispatch_config() to authenticated;
grant execute on all functions in schema public to service_role;
