-- Dispatch hardening. The wave design (3 / 6 / 10 km broadcast waves, Booking board, 345 s search window) is kept; this
-- closes the gaps an audit of the as-built SQL found. Tests: supabase/tests/dispatch_hardening.behaviour.sql.
--
--  1. Dead window. Offers died 15 s after a wave opened (accept_offer checked created_at + offerTtl) but the wave stayed
--     `broadcasting` for 45 s and dispatch_tick ran once a minute, so every wave had 30-60 s where nobody could accept and
--     nothing escalated. A wave now expires with its offers (expires_at = created_at + offerTtlSeconds), accept_offer reads
--     that single expires_at, and dispatch_tick runs every 5 s. waveWindowSeconds still drives the board bands only.
--  2. Declines were not recorded (decline_offer persisted nothing), so a driver could decline then accept, and a wave whose
--     every driver declined still waited out its timer. Declines are stored on the wave; a declined offer is refused
--     (offer_declined); when every eligible driver has declined the next wave opens at once.
--  3. Reservation. Broadcast waves could offer one driver several missions at once; the app shows only one, so the others
--     waited for nothing. A driver holding an open, undeclined offer is not a candidate for another mission. Candidate
--     rows are claimed with FOR UPDATE SKIP LOCKED so two concurrent waves never both take the same free driver.
--  4. GPS freshness. last_seen_at was refreshed by every heartbeat, and the driver app re-sends its last fix, so an old
--     position looked fresh. drivers.location_fixed_at now records when the position was measured: the client sends the
--     fix's AGE (both ends of it read from the device clock, so a skewed phone clock cancels out) and the server subtracts it
--     from its own now(). Eligibility needs both a live app (last_seen_at) and a fresh fix (gpsFreshSeconds = 30).
--  5. Jurisdiction. A driver whose profile names a service zone is offered only missions in that zone (null = any).
--  6. Invariant "one active mission per driver" is now also a unique index, under the existing lock-based checks.
--  7. Re-dispatch. Wave numbers were capped at 3 per mission and the search window ran from created_at, so a driver abort
--     after ~6 minutes ended the request as no_ambulance_available without asking anyone. Returning to `requesting` starts
--     a new dispatch round (waves 1..3 again, window measured from missions.search_started_at); the driver who released
--     the mission is never re-offered it.
--  8. accept_offer / claim_emergency report a cancelled mission as mission_cancelled (was offer_expired).
-- 11. Final fare without a GPS track: the pickup -> destination-hospital leg from canonical points, not the booking quote.
-- 10. list_open_offers(): a driver whose socket was down re-reads the offers still open for them (same payload as the push).
--  9. `raise log` diagnostics keyed by mission_id / offer_id (no patient data) for the dispatch pipeline.
set search_path to public, extensions;

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
create or replace function public.dispatch_config()
returns jsonb
language sql
immutable
set search_path = ''
as $$ select jsonb_build_object('offerTtlSeconds', 15, 'waveWindowSeconds', 45, 'radiiKm', jsonb_build_array(3, 6, 10), 'boardRadiiKm', jsonb_build_array(4, 7, 10), 'searchTtlSeconds', 345, 'gpsFreshSeconds', 30, 'presenceFreshSeconds', 30) $$;

alter table public.drivers add column location_fixed_at timestamptz;
update public.drivers set location_fixed_at = last_seen_at where current_location is not null;

-- A position written without an explicit fix time (direct service-role writes, older code paths) counts as measured now.
create function public._drivers_stamp_fix()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.current_location is distinct from (case when tg_op = 'UPDATE' then old.current_location end)
     and new.location_fixed_at is not distinct from (case when tg_op = 'UPDATE' then old.location_fixed_at end) then
    new.location_fixed_at := now();
  end if;
  return new;
end;
$$;
create trigger drivers_stamp_fix
  before insert or update of current_location on public.drivers
  for each row execute function public._drivers_stamp_fix();

alter table public.missions
  add column search_started_at timestamptz,
  add column dispatch_round    smallint not null default 1 check (dispatch_round >= 1);
update public.missions set search_started_at = created_at where search_started_at is null;
alter table public.missions alter column search_started_at set default now(), alter column search_started_at set not null;

-- Back to `requesting` (DRIVER_RELEASED) opens a new dispatch round with a fresh search window.
create function public._missions_new_dispatch_round()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'requesting' and old.status <> 'requesting' then
    new.search_started_at := now();
    new.dispatch_round := old.dispatch_round + 1;
  end if;
  return new;
end;
$$;
create trigger missions_new_dispatch_round
  before update of status on public.missions
  for each row execute function public._missions_new_dispatch_round();

alter table public.dispatch_waves
  add column round               smallint not null default 1 check (round >= 1),
  add column declined_driver_ids uuid[]   not null default '{}';
alter table public.dispatch_waves drop constraint dispatch_waves_mission_id_wave_number_key;
alter table public.dispatch_waves add constraint dispatch_waves_mission_round_wave_key unique (mission_id, round, wave_number);
create index idx_dispatch_waves_open on public.dispatch_waves (expires_at) where status = 'broadcasting';

do $$
declare v text;
begin
  select string_agg(driver_id || ' -> ' || ids, '; ') into v from (
    select driver_id, string_agg(id::text, ',') as ids from public.missions
     where driver_id is not null and status not in ('completed', 'cancelled')
     group by driver_id having count(*) > 1) s;
  if v is not null then
    raise exception 'drivers assigned to more than one active mission; resolve before applying: %', v;
  end if;
end;
$$;
create unique index missions_one_active_per_driver on public.missions (driver_id)
  where driver_id is not null and status not in ('completed', 'cancelled');

-- ---------------------------------------------------------------------------
-- Eligibility, in one place: a live app, a fresh GPS fix, verified and online. Busy, type, range, zone and reservation are
-- checked by the callers that know the mission.
-- ---------------------------------------------------------------------------
create function public._driver_dispatchable(d public.drivers)
returns boolean
language sql
stable
set search_path = ''
as $$
  select d.is_online and d.is_verified and d.current_location is not null
     and d.last_seen_at > now() - make_interval(secs => (public.dispatch_config() ->> 'presenceFreshSeconds')::integer)
     and d.location_fixed_at > now() - make_interval(secs => (public.dispatch_config() ->> 'gpsFreshSeconds')::integer)
$$;

-- An open, undeclined offer on another mission reserves the driver until it is accepted, declined or expires.
create function public._driver_reserved(p_driver uuid, p_except_mission uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.dispatch_waves w
     where w.status = 'broadcasting' and w.expires_at > now() and w.mission_id <> p_except_mission
       and p_driver = any (w.eligible_driver_ids) and not (p_driver = any (w.declined_driver_ids))
  )
$$;

-- ---------------------------------------------------------------------------
-- Presence: p_fix_age_ms is how long ago the device measured the position (device clock minus device fix time, so clock
-- skew cancels). Omitted (older builds) = measured now. A negative age (clock stepped back) counts as now.
-- ---------------------------------------------------------------------------
drop function public.set_driver_presence(boolean, double precision, double precision);
create function public.set_driver_presence(
  p_online boolean,
  p_lat    double precision default null,
  p_lng    double precision default null,
  p_fix_age_ms bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  d public.drivers;
  v_pt extensions.geography;
begin
  if v_uid is null then perform public._fail('unauthenticated', 'PT401'); end if;
  select * into d from public.drivers where id = v_uid;
  if not found then perform public._fail('driver_profile_missing', 'PT403'); end if;
  if p_online and not d.is_verified then perform public._fail('not_verified', 'PT403'); end if;
  if p_lat is not null and (p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180) then
    perform public._fail('invalid_location', 'PT422');
  end if;
  if p_lat is not null then
    v_pt := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  end if;
  update public.drivers
     set is_online = p_online,
         last_seen_at = now(),
         current_location = coalesce(v_pt, current_location),
         location_fixed_at = case when v_pt is null then location_fixed_at
                                  else now() - make_interval(secs => greatest(coalesce(p_fix_age_ms, 0), 0) / 1000.0) end
   where id = v_uid;
  return jsonb_build_object('ok', true, 'isOnline', p_online);
end;
$$;

-- ---------------------------------------------------------------------------
-- The offer a driver sees, in one place: the live publish (dispatch_next_wave) and the recovery read after a reconnect
-- (list_open_offers) send exactly the same payload. Clinical content is the triage summary only.
-- ---------------------------------------------------------------------------
create function public._offer_payload(w public.dispatch_waves, m public.missions, p_km numeric)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'v', 1,
    'type', 'offer',
    'offerId', w.id,
    'missionId', m.id,
    'waveNumber', w.wave_number,
    'issuedAt', public.iso_utc(w.created_at),
    'expiresAt', public.iso_utc(w.expires_at),
    'urgency', m.urgency,
    'requiredVehicleType', m.vehicle_type,
    'jurisdiction', m.jurisdiction,
    'pickup', jsonb_strip_nulls(jsonb_build_object(
      'latitude', extensions.st_y(m.pickup_location::extensions.geometry),
      'longitude', extensions.st_x(m.pickup_location::extensions.geometry),
      'address', m.pickup_address)),
    'distanceKm', p_km,
    'estimatedFareInr', (m.fare_details ->> 'estimatedTotalInr')::numeric,
    'patientSummary', jsonb_strip_nulls(jsonb_build_object(
      'primaryComplaint', m.triage -> 'primary_complaint',
      'derivedFlags', m.triage -> 'derived_flags',
      'ageBand', m.triage -> 'age_band',
      'sex', m.triage -> 'sex'))
  )
$$;

-- Offers still open for the caller (broadcasting, unexpired, not declined), for a driver whose socket was down when they
-- were published. The server decides; the client only re-reads what it was already sent.
create function public.list_open_offers()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  d public.drivers;
  v_items jsonb;
begin
  if v_uid is null then perform public._fail('unauthenticated', 'PT401'); end if;
  select * into d from public.drivers where id = v_uid;
  if not found then perform public._fail('driver_profile_missing', 'PT403'); end if;
  select coalesce(jsonb_agg(public._offer_payload(w, m,
           case when d.current_location is null then null
                else round((extensions.st_distance(d.current_location, m.pickup_location) / 1000)::numeric, 1) end)
         order by w.expires_at), '[]'::jsonb)
    into v_items
    from public.dispatch_waves w
    join public.missions m on m.id = w.mission_id
   where w.status = 'broadcasting' and w.expires_at > now()
     and v_uid = any (w.eligible_driver_ids) and not (v_uid = any (w.declined_driver_ids))
     and m.status = 'requesting' and m.driver_id is null;
  return jsonb_build_object('ok', true, 'serverNow', public.iso_utc(now()), 'items', v_items);
end;
$$;

-- ---------------------------------------------------------------------------
-- dispatch_next_wave: as 20261001000000 plus rounds, one-TTL waves, fresh-fix / zone / reservation filters, row claiming.
-- Returns the wave number opened, 0 when nothing could be asked and the mission was cancelled by `system`, -2 when the
-- waves are used up but the request stays open on the board for the search window, -1 when there was nothing to dispatch.
-- ---------------------------------------------------------------------------
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
         where public._driver_dispatchable(d)
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

-- ---------------------------------------------------------------------------
-- accept_offer: as 20261001000000 plus offer_declined, mission_cancelled, and expiry read from the wave's expires_at.
-- ---------------------------------------------------------------------------
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

  if m.status = 'cancelled' then perform public._fail('mission_cancelled', 'PT409'); end if;
  if m.status <> 'requesting' or m.driver_id is not null or w.status = 'accepted' then perform public._fail('offer_taken', 'PT409'); end if;
  if v_uid = any (w.declined_driver_ids) then perform public._fail('offer_declined', 'PT409'); end if;
  if w.status <> 'broadcasting' or now() >= w.expires_at then perform public._fail('offer_expired', 'PT409'); end if;

  update public.dispatch_waves set status = 'accepted', accepted_by = v_uid where id = w.id;
  update public.missions set driver_id = v_uid, accepted_at = now() where id = m.id;

  e := public._record_event(m.id, 'en_route', 'DRIVER_ACCEPTED', v_uid, 'driver',
    jsonb_build_object('driver', public._driver_public_info(v_uid)),
    p_client_event_id);
  perform public._revoke_offers(m.id, 'taken', v_uid);
  raise log 'dispatch offer_accepted %', jsonb_build_object('mission_id', m.id, 'offer_id', w.id, 'event_id', e.id, 'seq', e.seq);
  return jsonb_build_object('ok', true, 'status', 'en_route', 'seq', e.seq, 'eventId', e.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- decline_offer: recorded on the wave; the last decline of a wave opens the next one at once.
-- ---------------------------------------------------------------------------
create or replace function public.decline_offer(p_offer_id uuid, p_reason text default 'other')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  w public.dispatch_waves;
  m public.missions;
begin
  if v_uid is null then perform public._fail('unauthenticated', 'PT401'); end if;
  if p_reason is null or p_reason not in ('too_far', 'vehicle_issue', 'patient_onboard', 'break', 'other') then
    perform public._fail('invalid_reason', 'PT422');
  end if;
  select * into w from public.dispatch_waves where id = p_offer_id;
  if not found or not (v_uid = any (w.eligible_driver_ids)) then perform public._fail('offer_not_found', 'PT404'); end if;

  -- Same lock order as accept_offer (mission first), so a decline and an accept on one wave serialise.
  select * into m from public.missions where id = w.mission_id for update;
  update public.dispatch_waves
     set declined_driver_ids = case when v_uid = any (declined_driver_ids) then declined_driver_ids else declined_driver_ids || v_uid end
   where id = p_offer_id
  returning * into w;
  raise log 'dispatch offer_declined %', jsonb_build_object('mission_id', w.mission_id, 'offer_id', w.id, 'reason', p_reason);

  if w.status = 'broadcasting' and m.status = 'requesting' and m.driver_id is null
     and w.eligible_driver_ids <@ w.declined_driver_ids then
    update public.dispatch_waves set status = 'expired' where id = w.id;
    perform public.dispatch_next_wave(m.id);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- dispatch_tick: as 20260924000006 with the search window measured from search_started_at.
-- ---------------------------------------------------------------------------
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
    raise log 'dispatch offer_expired %', jsonb_build_object('mission_id', r.id);
    perform public._revoke_offers(r.id, 'expired');
    perform public.dispatch_next_wave(r.id);
    n := n + 1;
  end loop;

  for r in
    select m.id from public.missions m
     where m.status = 'requesting' and m.driver_id is null
       and m.search_started_at + make_interval(secs => ttl) <= now()
     for update of m skip locked
  loop
    raise log 'dispatch search_window_closed %', jsonb_build_object('mission_id', r.id);
    perform public._revoke_offers(r.id, 'expired');
    update public.dispatch_waves set status = 'expired' where mission_id = r.id and status = 'broadcasting';
    perform public._cancel_unanswered(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Board: same rules as 20260924000005, with the shared presence/fix check and the round's search start for the bands.
-- ---------------------------------------------------------------------------
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
     where public._driver_dispatchable(x) and x.ais125_type = m.vehicle_type
       and extensions.st_dwithin(x.current_location, m.pickup_location, r * 1000)
       and not public._driver_on_mission(x.id)
  ) then
    return 'fallback';
  end if;
  return null;
end;
$$;

create or replace function public.list_nearby_emergencies()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  cfg jsonb := public.dispatch_config();
  d public.drivers;
  v_win integer := (cfg ->> 'waveWindowSeconds')::integer;
  v_max numeric := (cfg -> 'boardRadiiKm' ->> 2)::numeric;
  v_items jsonb;
begin
  if v_uid is null then perform public._fail('unauthenticated', 'PT401'); end if;
  select * into d from public.drivers where id = v_uid;
  if not found then perform public._fail('driver_profile_missing', 'PT403'); end if;
  if not d.is_verified then perform public._fail('not_verified', 'PT403'); end if;
  if not coalesce(public._driver_dispatchable(d), false) then
    return jsonb_build_object('ok', true, 'serverNow', public.iso_utc(now()), 'items', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(s.item order by s.search_started_at, s.id), '[]'::jsonb) into v_items
    from (
      select m.id, m.search_started_at, jsonb_strip_nulls(jsonb_build_object(
        'missionId', m.id,
        'createdAt', public.iso_utc(m.search_started_at),
        'dueAt', public.iso_utc(m.search_started_at + make_interval(secs => v_win)),
        'distanceKm', round((extensions.st_distance(d.current_location, m.pickup_location) / 1000)::numeric, 1),
        'band', b.band,
        'urgency', m.urgency,
        'requiredVehicleType', m.vehicle_type,
        'pickup', jsonb_strip_nulls(jsonb_build_object(
          'latitude', extensions.st_y(m.pickup_location::extensions.geometry),
          'longitude', extensions.st_x(m.pickup_location::extensions.geometry),
          'address', m.pickup_address)),
        'patientSummary', jsonb_strip_nulls(jsonb_build_object(
          'primaryComplaint', m.triage -> 'primary_complaint',
          'derivedFlags', m.triage -> 'derived_flags',
          'ageBand', m.triage -> 'age_band',
          'sex', m.triage -> 'sex')))) as item
        from public.missions m
        cross join lateral (select public._board_band(d, m) as band) b
       where m.status = 'requesting' and m.driver_id is null
         and m.vehicle_type = d.ais125_type
         and (d.service_zone is null or d.service_zone = m.jurisdiction)
         and extensions.st_dwithin(d.current_location, m.pickup_location, v_max * 1000)
         and b.band is not null
       order by m.search_started_at, m.id
       limit 50
    ) s;

  return jsonb_build_object('ok', true, 'serverNow', public.iso_utc(now()), 'items', v_items);
end;
$$;

create or replace function public.claim_emergency(p_mission_id uuid, p_client_event_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  m public.missions;
  d public.drivers;
  e public.mission_events;
begin
  if v_uid is null then perform public._fail('unauthenticated', 'PT401'); end if;

  if p_client_event_id is not null then
    select * into e from public.mission_events
     where mission_id = p_mission_id and client_event_id = p_client_event_id and triggered_by = v_uid;
    if found then
      return jsonb_build_object('ok', true, 'status', e.to_status, 'seq', e.seq, 'eventId', e.id, 'replay', true);
    end if;
  end if;

  select * into m from public.missions where id = p_mission_id for update;
  if not found then perform public._fail('not_found', 'PT404'); end if;
  if m.driver_id = v_uid and m.status = 'en_route' then
    return jsonb_build_object('ok', true, 'status', m.status, 'seq', m.state_version, 'replay', true);
  end if;

  select * into d from public.drivers where id = v_uid for update;
  if not found or not d.is_verified then perform public._fail('not_verified', 'PT403'); end if;
  if public._driver_on_mission(v_uid) then perform public._fail('already_on_mission', 'PT409'); end if;
  if m.status = 'cancelled' then perform public._fail('mission_cancelled', 'PT409'); end if;
  if m.status <> 'requesting' or m.driver_id is not null then perform public._fail('offer_taken', 'PT409'); end if;
  if d.ais125_type <> m.vehicle_type then perform public._fail('not_eligible', 'PT403'); end if;
  if not coalesce(public._driver_dispatchable(d), false) then perform public._fail('not_online', 'PT403'); end if;
  if d.service_zone is not null and d.service_zone <> m.jurisdiction then perform public._fail('not_in_range', 'PT403'); end if;
  if public._board_band(d, m) is null then perform public._fail('not_in_range', 'PT403'); end if;

  update public.missions set driver_id = v_uid, accepted_at = now() where id = m.id;
  e := public._record_event(m.id, 'en_route', 'DRIVER_ACCEPTED', v_uid, 'driver',
    jsonb_build_object('driver', public._driver_public_info(v_uid)), p_client_event_id);
  perform public._revoke_offers(m.id, 'taken', v_uid);
  update public.dispatch_waves set status = 'expired' where mission_id = m.id and status = 'broadcasting';
  raise log 'dispatch board_claimed %', jsonb_build_object('mission_id', m.id, 'event_id', e.id, 'seq', e.seq);
  return jsonb_build_object('ok', true, 'status', 'en_route', 'seq', e.seq, 'eventId', e.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- transition_mission: as 20261001000001, except the no-track fallback of COMPLETE (invariant: a final fare is never
-- computed from an invented or wrong-leg distance).
-- ---------------------------------------------------------------------------
create or replace function public.transition_mission(
  p_mission_id      uuid,
  p_event           text,
  p_payload         jsonb default '{}'::jsonb,
  p_client_event_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  m public.missions;
  e public.mission_events;
  p jsonb := coalesce(p_payload, '{}'::jsonb);
  v_at timestamptz;
  v_hosp uuid;
  h record;
  v_vitals jsonb;
  v_handoff jsonb;
  v_km numeric;
  v_source text := 'estimate';
  v_fare jsonb;
  v_reason text;
begin
  if v_uid is null then perform public._fail('unauthenticated', 'PT401'); end if;
  if p_event not in ('ON_SCENE', 'PATIENT_ON_BOARD', 'ARRIVED_HOSPITAL', 'COMPLETE', 'ABORT') then
    perform public._fail('unknown_event', 'PT422', p_event);
  end if;

  if p_client_event_id is not null then
    select * into e from public.mission_events
     where mission_id = p_mission_id and client_event_id = p_client_event_id and triggered_by = v_uid;
    if found then
      return jsonb_build_object('ok', true, 'status', e.to_status, 'seq', e.seq, 'eventId', e.id, 'replay', true);
    end if;
  end if;

  select * into m from public.missions where id = p_mission_id and driver_id = v_uid for update;
  if not found then perform public._fail('not_found', 'PT404'); end if;

  if p_event = 'ON_SCENE' then
    if m.status <> 'en_route' then perform public._fail('invalid_transition', 'PT409', m.status::text); end if;
    if jsonb_typeof(p -> 'location' -> 'latitude') is distinct from 'number' or jsonb_typeof(p -> 'location' -> 'longitude') is distinct from 'number' then
      perform public._fail('invalid_location', 'PT422');
    end if;
    v_at := public._ts(p ->> 'arrivedAt');
    e := public._record_event(m.id, 'on_scene', 'DRIVER_ARRIVED', v_uid, 'driver', jsonb_build_object(
      'location', jsonb_build_object('latitude', (p -> 'location' ->> 'latitude')::double precision, 'longitude', (p -> 'location' ->> 'longitude')::double precision),
      'arrivedAt', public.iso_utc(v_at),
      'distanceFromPickupM', round(extensions.st_distance(m.pickup_location,
        extensions.st_setsrid(extensions.st_makepoint((p -> 'location' ->> 'longitude')::double precision, (p -> 'location' ->> 'latitude')::double precision), 4326)::extensions.geography))
    ), p_client_event_id);
    update public.missions set arrived_scene_at = v_at where id = m.id;

  elsif p_event = 'PATIENT_ON_BOARD' then
    if m.status <> 'on_scene' then perform public._fail('invalid_transition', 'PT409', m.status::text); end if;
    begin
      v_hosp := (p ->> 'hospitalId')::uuid;
    exception when others then
      perform public._fail('invalid_hospital', 'PT422');
    end;
    v_at := public._ts(p ->> 'onboardAt');
    v_vitals := p -> 'vitals';
    if v_vitals is not null and jsonb_typeof(v_vitals) = 'object' then
      if (v_vitals ? 'pulse' and (v_vitals ->> 'pulse')::numeric not between 0 and 300)
         or (v_vitals ? 'spO2' and (v_vitals ->> 'spO2')::numeric not between 0 and 100)
         or (v_vitals ? 'systolic' and (v_vitals ->> 'systolic')::numeric not between 40 and 300)
         or (v_vitals ? 'diastolic' and (v_vitals ->> 'diastolic')::numeric not between 20 and 200)
         or (v_vitals ? 'gcs' and (v_vitals ->> 'gcs')::numeric not between 3 and 15) then
        perform public._fail('invalid_vitals', 'PT422');
      end if;
    else
      v_vitals := null;
    end if;
    -- G-22: the hold is taken here, on the server, by one rule: is_active and available_capacity > 0.
    update public.hospitals set held_capacity = held_capacity + 1, capacity_updated_at = now()
     where id = v_hosp and is_active and held_capacity < total_capacity
    returning id, name, extensions.st_y(location::extensions.geometry) as lat, extensions.st_x(location::extensions.geometry) as lng into h;
    if not found then
      perform public._fail(case when exists (select 1 from public.hospitals where id = v_hosp and is_active) then 'hospital_at_capacity' else 'invalid_hospital' end, 'PT409');
    end if;
    e := public._record_event(m.id, 'transporting', 'TRANSPORT_STARTED', v_uid, 'driver', jsonb_strip_nulls(jsonb_build_object(
      'destination', jsonb_build_object('hospitalId', h.id, 'name', h.name, 'latitude', h.lat, 'longitude', h.lng),
      'onboardAt', public.iso_utc(v_at),
      'etaMinutes', case when jsonb_typeof(p -> 'etaMinutes') = 'number' then p -> 'etaMinutes' end,
      'wardStatus', 'Bed held',
      'vitals', v_vitals,
      'emergencyType', p -> 'emergencyType',
      'bypass', p -> 'bypass')), p_client_event_id);
    update public.missions set destination_hospital_id = h.id, onboard_at = v_at where id = m.id;

  elsif p_event = 'ARRIVED_HOSPITAL' then
    if m.status <> 'transporting' then perform public._fail('invalid_transition', 'PT409', m.status::text); end if;
    v_at := public._ts(p ->> 'arrivedAt');
    e := public._record_event(m.id, 'arrived_hospital', 'HOSPITAL_ARRIVED', v_uid, 'driver',
      jsonb_build_object('arrivedAt', public.iso_utc(v_at), 'hospitalId', m.destination_hospital_id), p_client_event_id);
    update public.missions set arrived_hospital_at = v_at where id = m.id;

  elsif p_event = 'COMPLETE' then
    if m.status <> 'arrived_hospital' then perform public._fail('invalid_transition', 'PT409', m.status::text); end if;
    v_handoff := p -> 'handoff';
    -- D-UX-03: a statutory sign-off cannot be completed with blank physician details.
    if v_handoff is null or jsonb_typeof(v_handoff) <> 'object'
       or coalesce(btrim(v_handoff ->> 'physicianName'), '') = ''
       or coalesce(btrim(v_handoff ->> 'registrationNumber'), '') = ''
       or coalesce(btrim(v_handoff ->> 'department'), '') = '' then
      perform public._fail('handoff_incomplete', 'PT422');
    end if;
    v_at := public._ts(p ->> 'completedAt');
    -- D-2: the billable distance is measured by the server from the transport leg (onboard -> hospital arrival). With
    -- fewer than two logged fixes it falls back to the same leg estimated from canonical points the server holds: the
    -- straight line from the pickup to the registered destination hospital (never the booking quote, which is the approach
    -- from a placeholder hub, and never a default). distanceSource says which.
    select round((coalesce(sum(seg), 0) / 1000)::numeric, 2) into v_km
      from (
        select extensions.st_distance(t.location, lag(t.location) over (order by t.recorded_at)) as seg
          from public.telemetry_logs t
         where t.mission_id = m.id and t.driver_id = v_uid and t.recorded_at between m.onboard_at and m.arrived_hospital_at
      ) s where seg is not null;
    if v_km is not null and v_km > 0 then
      v_source := 'measured';
    else
      -- A deleted hospital row (FK set null) leaves no second point: base fare only (0 km), still labelled an estimate.
      select coalesce(round((extensions.st_distance(m.pickup_location, h2.location) / 1000)::numeric, 2), 0) into v_km
        from (select 1) one left join public.hospitals h2 on h2.id = m.destination_hospital_id;
    end if;
    v_fare := public.compute_statutory_fare(m.vehicle_type, m.jurisdiction, v_km);
    e := public._record_event(m.id, 'completed', 'MISSION_COMPLETED', v_uid, 'driver', jsonb_build_object(
      'completedAt', public.iso_utc(v_at),
      'distanceKm', v_km,
      'finalFareInr', (v_fare ->> 'estimatedTotalInr')::integer,
      'distanceSource', v_source,
      'fareDetails', v_fare,
      'receiptPath', null,
      'handoff', v_handoff,
      'audit', jsonb_build_object('distanceSource', v_source)), p_client_event_id);
    update public.missions
       set completed_at = v_at, distance_km = v_km, final_fare_inr = (v_fare ->> 'estimatedTotalInr')::integer
     where id = m.id;
    perform public._release_hospital_hold(m.id);

  else -- ABORT
    v_reason := coalesce(p ->> 'reason', 'other');
    if v_reason not in ('driver_backed_out', 'vehicle_breakdown', 'other') then perform public._fail('invalid_reason', 'PT422'); end if;
    if m.status in ('en_route', 'on_scene') then
      -- D-3: before pickup a driver abort re-dispatches; the patient goes back to matching (DRIVER_RELEASED).
      update public.missions set driver_id = null, accepted_at = null where id = m.id;
      e := public._record_event(m.id, 'requesting', 'DRIVER_RELEASED', v_uid, 'driver',
        jsonb_build_object('reason', v_reason), p_client_event_id);
      perform public.dispatch_next_wave(m.id);
    elsif m.status in ('transporting', 'arrived_hospital') then
      -- D-3: after pickup this is an incident; the patient sees a cancelled state that points to 108.
      e := public._record_event(m.id, 'cancelled', 'MISSION_CANCELLED', v_uid, 'driver',
        jsonb_build_object('cancelledBy', 'driver', 'reason', v_reason, 'fromState', m.status), p_client_event_id);
      update public.missions set cancelled_at = now(), cancelled_by = 'driver', cancel_reason = 'other', cancel_note = v_reason where id = m.id;
      perform public._release_hospital_hold(m.id);
    else
      perform public._fail('invalid_transition', 'PT409', m.status::text);
    end if;
  end if;

  select * into m from public.missions where id = m.id;
  return jsonb_build_object('ok', true, 'status', m.status, 'seq', e.seq, 'eventId', e.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Escalation cadence: every 5 s (pg_cron >= 1.5 interval syntax). A wave now lasts one offer TTL (15 s).
-- ---------------------------------------------------------------------------
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'dispatch_tick';
end;
$$;
select cron.schedule('dispatch_tick', '5 seconds', $$select public.dispatch_tick()$$);

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function
  public._drivers_stamp_fix(),
  public._missions_new_dispatch_round(),
  public._driver_dispatchable(public.drivers),
  public._driver_reserved(uuid, uuid),
  public._offer_payload(public.dispatch_waves, public.missions, numeric),
  public.list_open_offers(),
  public.set_driver_presence(boolean, double precision, double precision, bigint)
from public, anon, authenticated;
grant execute on function public.list_open_offers() to authenticated;
grant execute on function public.set_driver_presence(boolean, double precision, double precision, bigint) to authenticated;
grant execute on function public.dispatch_config() to authenticated;
grant execute on all functions in schema public to service_role;
