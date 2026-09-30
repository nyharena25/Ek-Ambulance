-- Busy-driver guard on the offer path (G4.7-B). A driver who holds a mission (public._driver_on_mission: assigned and not
-- completed/cancelled) could be put in another mission's wave and accept it, ending up assigned to two missions at once.
-- claim_emergency already refused this (already_on_mission); the offer path now enforces the same invariant twice:
--   dispatch_next_wave: a busy driver is not asked, so they get no offer and do not use up a wave.
--   accept_offer:       re-checked at accept time under the driver row lock, for an offer sent while the driver was still free.
-- The lock is the one claim_emergency takes (mission row, then driver row): two accepts by one driver serialise, and the
-- second one's check (a new statement, so a new READ COMMITTED snapshot) sees the first's committed assignment.
-- Both bodies are otherwise unchanged from 20260924000006 (dispatch_next_wave) and 20260924000005 (accept_offer);
-- create or replace keeps their existing grants. Timing, radii, presence and KYC rules are untouched.

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
       and not public._driver_on_mission(d.id)
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

create or replace function public.accept_offer(p_offer_id uuid, p_client_event_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  w public.dispatch_waves;
  m public.missions;
  d public.drivers;
  e public.mission_events;
  v_ttl integer := (public.dispatch_config() ->> 'offerTtlSeconds')::integer;
begin
  if v_uid is null then perform public._fail('unauthenticated', 'PT401'); end if;
  select * into w from public.dispatch_waves where id = p_offer_id;
  if not found then perform public._fail('offer_not_found', 'PT404'); end if;

  if p_client_event_id is not null then
    select * into e from public.mission_events
     where mission_id = w.mission_id and client_event_id = p_client_event_id and triggered_by = v_uid;
    if found then
      return jsonb_build_object('ok', true, 'status', e.to_status, 'seq', e.seq, 'eventId', e.id, 'replay', true);
    end if;
  end if;

  select * into m from public.missions where id = w.mission_id for update;
  select * into w from public.dispatch_waves where id = p_offer_id;
  if m.driver_id = v_uid and m.status = 'en_route' and w.accepted_by = v_uid then
    return jsonb_build_object('ok', true, 'status', m.status, 'seq', m.state_version, 'replay', true);
  end if;

  -- The driver row is locked too (as in claim_emergency), so two accepts by one driver serialise and the second sees the
  -- first as a held mission.
  select * into d from public.drivers where id = v_uid for update;
  if not found or not d.is_verified then perform public._fail('not_verified', 'PT403'); end if;
  if public._driver_on_mission(v_uid) then perform public._fail('already_on_mission', 'PT409'); end if;
  if not (v_uid = any (w.eligible_driver_ids)) then perform public._fail('not_eligible', 'PT403'); end if;
  if d.ais125_type <> m.vehicle_type then perform public._fail('not_eligible', 'PT403'); end if;

  if m.status <> 'requesting' or m.driver_id is not null or w.status = 'accepted' then
    perform public._fail(case when m.status = 'cancelled' then 'offer_expired' else 'offer_taken' end, 'PT409');
  end if;
  if w.status <> 'broadcasting' or now() >= w.created_at + make_interval(secs => v_ttl) then
    perform public._fail('offer_expired', 'PT409');
  end if;

  update public.dispatch_waves set status = 'accepted', accepted_by = v_uid where id = w.id;
  update public.missions set driver_id = v_uid, accepted_at = now() where id = m.id;

  e := public._record_event(m.id, 'en_route', 'DRIVER_ACCEPTED', v_uid, 'driver',
    jsonb_build_object('driver', public._driver_public_info(v_uid)),
    p_client_event_id);
  perform public._revoke_offers(m.id, 'taken', v_uid);
  return jsonb_build_object('ok', true, 'status', 'en_route', 'seq', e.seq, 'eventId', e.id);
end;
$$;
