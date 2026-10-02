-- Staff driver activity (operations history) for apps/admin. Read-only: nothing here writes, and every figure is a row the
-- mission lifecycle already stores. No new data is recorded.
--
-- Unit of history = an ASSIGNMENT: one DRIVER_ACCEPTED event (accept_offer or claim_emergency, triggered_by = the driver),
-- ended by the next MISSION_COMPLETED / MISSION_CANCELLED / DRIVER_RELEASED event of that mission (the only three events
-- that end a driver's hold). Events, not missions.driver_id, because a driver abort before pickup nulls driver_id and
-- accepted_at (transition_mission ABORT), so a released mission is only traceable through the audit trail.
--
-- Sources:
--   times     mission_events.created_at (server now()); offer = dispatch_waves.created_at of the wave the driver accepted.
--             The device-reported times (arrivedAt / onboardAt / completedAt metadata, mirrored in missions.arrived_scene_at
--             etc.) are returned as reported, never used for a duration.
--   fare      missions.final_fare_inr (written only by transition_mission COMPLETE via compute_statutory_fare);
--             estimate = missions.fare_details ->> 'estimatedTotalInr' (the create_mission quote, never overwritten).
--   distance  missions.distance_km after COMPLETE = the billed transport leg (onboard -> hospital); its source is the
--             MISSION_COMPLETED metadata distanceSource ('measured' | 'estimate', audit.distanceSource on older rows).
--             Quote = fare_details ->> 'totalDistanceKm'. The leg to the pickup is never measured, so it is not reported.
-- Days are Asia/Kolkata calendar days, and an assignment belongs to the day it was accepted.

create index if not exists idx_mission_events_driver_accepts
  on public.mission_events (triggered_by, created_at) where event_type = 'DRIVER_ACCEPTED';

-- Internal (not security definer, not client-callable): runs with the rights of the staff RPC that calls it. One driver.
create or replace function public._driver_assignments(p_driver uuid, p_from timestamptz, p_to timestamptz)
returns table (
  driver_id       uuid,
  mission_id      uuid,
  offered_at      timestamptz,
  accepted_at     timestamptz,
  on_scene_at     timestamptz,
  transport_at    timestamptz,
  hospital_at     timestamptz,
  ended_at        timestamptz,
  outcome         text,
  cancelled_by    text,
  end_reason      text,
  distance_source text,
  last_event_at   timestamptz
)
language sql
stable
set search_path = ''
as $$
  select a.triggered_by, a.mission_id,
         (select w.created_at from public.dispatch_waves w
           where w.mission_id = a.mission_id and w.accepted_by = a.triggered_by and w.created_at <= a.created_at
           order by w.created_at desc limit 1),
         a.created_at, s.on_scene_at, s.transport_at, s.hospital_at, t.created_at,
         case t.event_type when 'MISSION_COMPLETED' then 'completed' when 'MISSION_CANCELLED' then 'cancelled'
                           when 'DRIVER_RELEASED' then 'released' else 'in_progress' end,
         t.metadata ->> 'cancelledBy',
         t.metadata ->> 'reason',
         case when t.event_type = 'MISSION_COMPLETED'
              then coalesce(t.metadata ->> 'distanceSource', t.metadata -> 'audit' ->> 'distanceSource') end,
         s.last_event_at
    from public.mission_events a
    left join lateral (
      select x.seq, x.created_at, x.event_type, x.metadata from public.mission_events x
       where x.mission_id = a.mission_id and x.seq > a.seq
         and x.event_type in ('MISSION_COMPLETED', 'MISSION_CANCELLED', 'DRIVER_RELEASED')
       order by x.seq limit 1) t on true
    cross join lateral (
      select min(y.created_at) filter (where y.event_type = 'DRIVER_ARRIVED')    as on_scene_at,
             min(y.created_at) filter (where y.event_type = 'TRANSPORT_STARTED') as transport_at,
             min(y.created_at) filter (where y.event_type = 'HOSPITAL_ARRIVED')  as hospital_at,
             max(y.created_at)                                                   as last_event_at
        from public.mission_events y
       where y.mission_id = a.mission_id and y.seq >= a.seq and (t.seq is null or y.seq <= t.seq)) s
   -- Sargable on idx_mission_events_driver_accepts even in a generic plan (no "param is null or" branches).
   where a.event_type = 'DRIVER_ACCEPTED' and a.triggered_by = p_driver
     and a.created_at >= coalesce(p_from, '-infinity') and a.created_at < coalesce(p_to, 'infinity');
$$;

create or replace function public._activity_range_check(p_from date, p_to date)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 366 then
    perform public._fail('invalid_range', 'PT422');
  end if;
end;
$$;

-- Lifetime, selected range, today and one row per day of the range (zero-filled), all from one totals expression.
create or replace function public.staff_driver_activity(p_driver_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d public.drivers;
  p public.profiles;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_totals jsonb;
begin
  perform public._require_staff();
  perform public._activity_range_check(p_from, p_to);
  select * into d from public.drivers where id = p_driver_id;
  if not found then perform public._fail('driver_not_found', 'PT404'); end if;
  select * into p from public.profiles where id = p_driver_id;

  with r as (
    select a.*, m.final_fare_inr, m.distance_km, (m.fare_details ->> 'estimatedTotalInr')::numeric as estimated_fare_inr
      from public._driver_assignments(p_driver_id, null, null) a
      join public.missions m on m.id = a.mission_id
  ), s(kind, label, lo, hi) as (
    select 'lifetime', null, null::timestamptz, null::timestamptz
    union all select 'range', null, p_from::timestamp at time zone 'Asia/Kolkata', (p_to + 1)::timestamp at time zone 'Asia/Kolkata'
    union all select 'today', to_char(v_today, 'YYYY-MM-DD'), v_today::timestamp at time zone 'Asia/Kolkata', (v_today + 1)::timestamp at time zone 'Asia/Kolkata'
    union all select 'day', to_char(dd, 'YYYY-MM-DD'), dd at time zone 'Asia/Kolkata', (dd + interval '1 day') at time zone 'Asia/Kolkata'
      from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') dd
  ), t as (
    -- ponytail: every scope joins every assignment (nested loop); fine per driver, pre-bucket by day if one driver has 10k+.
    select s.kind, s.label, jsonb_build_object(
             'date', s.label,
             'accepted', count(r.mission_id),
             'completed', count(*) filter (where r.outcome = 'completed'),
             'cancelled', count(*) filter (where r.outcome = 'cancelled'),
             'cancelledByDriver', count(*) filter (where r.outcome = 'cancelled' and r.cancelled_by = 'driver'),
             'released', count(*) filter (where r.outcome = 'released'),
             'inProgress', count(*) filter (where r.outcome = 'in_progress'),
             'finalFareInr', coalesce(sum(r.final_fare_inr) filter (where r.outcome = 'completed'), 0),
             'estimatedFareInr', coalesce(sum(r.estimated_fare_inr) filter (where r.outcome = 'completed'), 0),
             'avgFinalFareInr', round(avg(r.final_fare_inr) filter (where r.outcome = 'completed'), 2),
             'distanceKm', coalesce(sum(r.distance_km) filter (where r.outcome = 'completed'), 0),
             'measuredDistanceKm', coalesce(sum(r.distance_km) filter (where r.outcome = 'completed' and r.distance_source = 'measured'), 0),
             'estimateDistanceKm', coalesce(sum(r.distance_km) filter (where r.outcome = 'completed' and r.distance_source = 'estimate'), 0),
             'estimateDistanceMissions', count(*) filter (where r.outcome = 'completed' and r.distance_source = 'estimate'),
             'avgDistanceKm', round(avg(r.distance_km) filter (where r.outcome = 'completed'), 2),
             'avgCompletedDurationS', round(avg(extract(epoch from r.ended_at - r.accepted_at)) filter (where r.outcome = 'completed')),
             'recordedTimeS', coalesce(round(sum(extract(epoch from r.ended_at - r.accepted_at)) filter (where r.ended_at is not null)), 0),
             'firstActivityAt', public.iso_utc(min(r.accepted_at)),
             'lastActivityAt', public.iso_utc(max(r.last_event_at))) as totals
      from s
      left join r on (s.lo is null or r.accepted_at >= s.lo) and (s.hi is null or r.accepted_at < s.hi)
     group by s.kind, s.label
  )
  select jsonb_build_object(
           'lifetime', (select totals from t where kind = 'lifetime'),
           'range', (select totals from t where kind = 'range'),
           'today', (select totals from t where kind = 'today'),
           'days', (select jsonb_agg(totals order by label desc) from t where kind = 'day'))
    into v_totals;

  return v_totals || jsonb_build_object(
    'driverId', d.id,
    'timeZone', 'Asia/Kolkata',
    'accountCreatedAt', public.iso_utc(p.created_at),
    'isOnline', d.is_online,
    'lastSeenAt', public.iso_utc(d.last_seen_at),
    'onMission', public._driver_on_mission(d.id));
end;
$$;

-- One page of the driver's assignments with the mission's lifecycle. Patient identity, triage, vitals, handoff and free-text
-- notes are never returned; event metadata is reduced to an allow-list of codes and device-reported times.
create or replace function public.staff_driver_missions(
  p_driver_id    uuid,
  p_from         date,
  p_to           date,
  p_outcome      text default null,
  p_vehicle_type public.ais125_vehicle_type default null,
  p_limit        integer default 50,
  p_offset       integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_res jsonb;
begin
  perform public._require_staff();
  perform public._activity_range_check(p_from, p_to);
  if p_outcome is not null and p_outcome not in ('completed', 'cancelled', 'released', 'in_progress') then
    perform public._fail('invalid_outcome', 'PT422');
  end if;
  if not exists (select 1 from public.drivers where id = p_driver_id) then perform public._fail('driver_not_found', 'PT404'); end if;

  with r as (
    select a.*, m.display_ref, m.vehicle_type, m.urgency, m.status, m.pickup_address, m.pickup_location,
           m.destination_hospital_id, m.created_at, m.final_fare_inr, m.distance_km, m.fare_details
      from public._driver_assignments(p_driver_id, p_from::timestamp at time zone 'Asia/Kolkata', (p_to + 1)::timestamp at time zone 'Asia/Kolkata') a
      join public.missions m on m.id = a.mission_id
     where (p_outcome is null or a.outcome = p_outcome)
       and (p_vehicle_type is null or m.vehicle_type = p_vehicle_type)
  )
  select jsonb_build_object(
    'total', (select count(*) from r),
    'rows', coalesce((
      select jsonb_agg(x.j order by x.accepted_at desc)
        from (
          select r.accepted_at, jsonb_build_object(
                   'missionId', r.mission_id,
                   'displayRef', r.display_ref,
                   'vehicleType', r.vehicle_type,
                   'urgency', r.urgency,
                   'missionStatus', r.status,
                   'outcome', r.outcome,
                   'cancelledBy', r.cancelled_by,
                   'endReason', r.end_reason,
                   'pickupAddress', r.pickup_address,
                   'pickupLat', extensions.st_y(r.pickup_location::extensions.geometry),
                   'pickupLng', extensions.st_x(r.pickup_location::extensions.geometry),
                   'destination', (select h.name from public.hospitals h where h.id = r.destination_hospital_id),
                   'requestedAt', public.iso_utc(r.created_at),
                   'offeredAt', public.iso_utc(r.offered_at),
                   'acceptedAt', public.iso_utc(r.accepted_at),
                   'onSceneAt', public.iso_utc(r.on_scene_at),
                   'transportAt', public.iso_utc(r.transport_at),
                   'hospitalAt', public.iso_utc(r.hospital_at),
                   'endedAt', public.iso_utc(r.ended_at),
                   'finalFareInr', case when r.outcome = 'completed' then r.final_fare_inr end,
                   'estimatedFareInr', (r.fare_details ->> 'estimatedTotalInr')::numeric,
                   'billedDistanceKm', case when r.outcome = 'completed' then r.distance_km end,
                   'quotedDistanceKm', (r.fare_details ->> 'totalDistanceKm')::numeric,
                   'distanceSource', r.distance_source,
                   'events', (
                     select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                              'seq', e.seq,
                              'eventType', e.event_type,
                              'toStatus', e.to_status,
                              'actorRole', e.actor_role,
                              'byThisDriver', e.triggered_by = p_driver_id,
                              'at', public.iso_utc(e.created_at),
                              'reportedAt', coalesce(e.metadata ->> 'arrivedAt', e.metadata ->> 'onboardAt', e.metadata ->> 'completedAt'),
                              'reason', e.metadata ->> 'reason',
                              'cancelledBy', e.metadata ->> 'cancelledBy',
                              'distanceSource', coalesce(e.metadata ->> 'distanceSource', e.metadata -> 'audit' ->> 'distanceSource')))
                            order by e.seq)
                       from public.mission_events e where e.mission_id = r.mission_id)) as j
            from r
           order by r.accepted_at desc
           limit greatest(1, least(coalesce(p_limit, 50), 100)) offset greatest(0, coalesce(p_offset, 0))
        ) x), '[]'::jsonb))
    into v_res;
  return v_res;
end;
$$;

revoke execute on function public._driver_assignments(uuid, timestamptz, timestamptz), public._activity_range_check(date, date),
  public.staff_driver_activity(uuid, date, date),
  public.staff_driver_missions(uuid, date, date, text, public.ais125_vehicle_type, integer, integer) from public, anon, authenticated;
grant execute on function public.staff_driver_activity(uuid, date, date),
  public.staff_driver_missions(uuid, date, date, text, public.ais125_vehicle_type, integer, integer) to authenticated;
grant execute on function public._driver_assignments(uuid, timestamptz, timestamptz), public._activity_range_check(date, date),
  public.staff_driver_activity(uuid, date, date),
  public.staff_driver_missions(uuid, date, date, text, public.ais125_vehicle_type, integer, integer) to service_role;
