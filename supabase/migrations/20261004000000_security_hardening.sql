-- Security hardening. Tests: supabase/tests/security_hardening.behaviour.sql (plus the updated gps_fare / mission_api fixtures).
--
--  1. One open request per patient and a per-account creation limit (create_mission). A self-signed-up account could
--     open any number of `requesting` missions; each wave reserves every nearby driver (_driver_reserved), so a burst of
--     them made genuine requests nearby find no candidate and end as no_ambulance_available. Enforced in the RPC (the only
--     client path: missions has no client INSERT grant), serialised per patient with an advisory lock. Only statuses the
--     patient can cancel themselves (requesting / en_route / on_scene) block a new request, so a mission stuck after
--     pickup can never lock a patient out of booking.
--  2. create_mission input bounds: display text is truncated (an over-long geocoder address must never fail an emergency
--     booking), the duration range is checked, and the triage fields forwarded to every offered driver are bounded.
--  3. The billed distance no longer trusts device clocks or noisy fixes. Device-reported stage times are clamped between
--     the previous stage and the server's now() + 5 min (the same clock-skew allowance telemetry gets); telemetry outside
--     the mission's lifetime is rejected; the measured leg ignores fixes worse than 50 m and segments faster than
--     200 km/h, and can no longer overflow distance_km.
--  4. transition_mission: coordinate ranges, payload size and sign-off field lengths are validated.
--  5. Erasure and retention also remove the pickup address, route, free-text notes and the on-scene position, and coarsen
--     the stored pickup to ~1 km. Statutory fields (fare, distance, urgency, jurisdiction) stay.
--  6. KYC decisions record the reviewing staff member (drivers.kyc_reviewed_by).
--  7. Plates are unique after normalisation (spaces/hyphens/case), so the direct driver_vehicles grant cannot bypass the
--     duplicate check update_driver_profile applies.
--  8. record_consent / profiles.full_name: bounded text.
set search_path to public, extensions;

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
alter table public.drivers add column kyc_reviewed_by uuid references auth.users (id) on delete set null;
alter table public.missions add column personal_data_purged_at timestamptz;

do $$
declare v text;
begin
  select string_agg(n, ', ') into v from (
    select regexp_replace(upper(registration_number), '[ -]', '', 'g') as n from public.driver_vehicles
     group by 1 having count(*) > 1) s;
  if v is not null then
    raise exception 'registration numbers duplicated after normalisation; resolve before applying: %', v;
  end if;
end;
$$;
create unique index idx_driver_vehicles_registration_normalised
  on public.driver_vehicles (regexp_replace(upper(registration_number), '[ -]', '', 'g'));

-- NOT VALID: enforced for every new write, existing rows are left as they are.
alter table public.profiles add constraint profiles_full_name_length check (char_length(full_name) <= 100) not valid;

-- ---------------------------------------------------------------------------
-- Helpers (internal)
-- ---------------------------------------------------------------------------

-- A device-reported time, kept inside [p_lo, now() + 5 min]: never before the previous stage, never further ahead than the
-- clock skew ingest_telemetry accepts (a phone running fast must not lose the end of its billed track).
create function public._reported_ts(p_text text, p_lo timestamptz)
returns timestamptz
language sql
volatile
set search_path = ''
as $$ select least(greatest(public._ts(p_text), coalesce(p_lo, '-infinity'::timestamptz)), now() + interval '5 minutes') $$;

-- Triage: a bounded object. The keys every offered driver receives (primary_complaint, age_band, sex: short strings;
-- derived_flags: a short list of short strings) are typed and length-limited.
create function public._triage_valid(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'object'
     and pg_column_size(p) <= 4096
     and not exists (
       select 1 from jsonb_each(p) e
        where (e.key = 'derived_flags' and (jsonb_typeof(e.value) <> 'array' or jsonb_array_length(e.value) > 20
                 or exists (select 1 from jsonb_array_elements(e.value) f where jsonb_typeof(f) <> 'string' or char_length(f #>> '{}') > 64)))
           or (e.key in ('primary_complaint', 'age_band', 'sex') and (jsonb_typeof(e.value) <> 'string' or char_length(e.value #>> '{}') > 64)))
$$;

-- ---------------------------------------------------------------------------
-- create_mission: as 20260924000003 plus bounds, one active mission per patient and a creation limit.
-- ---------------------------------------------------------------------------
create or replace function public.create_mission(
  p_idempotency_key uuid,
  p_pickup_lat      double precision,
  p_pickup_lng      double precision,
  p_vehicle_type    public.ais125_vehicle_type,
  p_urgency         public.urgency_tier,
  p_triage          jsonb,
  p_distance_km     numeric,
  p_pickup_address  text default null,
  p_district        text default null,
  p_duration_min    integer default null,
  p_route_polyline  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_pt extensions.geography;
  v_zone public.jurisdiction_zone;
  v_active uuid;
  m public.missions;
begin
  if v_uid is null then perform public._fail('unauthenticated', 'PT401'); end if;
  if not exists (select 1 from public.profiles where id = v_uid and role = 'patient') then
    perform public._fail('not_a_patient', 'PT403');
  end if;
  if p_idempotency_key is null then perform public._fail('invalid_idempotency_key', 'PT422'); end if;
  if p_pickup_lat is null or p_pickup_lng is null or p_pickup_lat not between -90 and 90 or p_pickup_lng not between -180 and 180 then
    perform public._fail('invalid_pickup', 'PT422');
  end if;
  if p_distance_km is null or p_distance_km < 0 or p_distance_km > 9999.99 then
    perform public._fail('invalid_distance', 'PT422');
  end if;
  if p_triage is null or not public._triage_valid(p_triage) then
    perform public._fail('invalid_triage', 'PT422');
  end if;
  if p_duration_min not between 0 and 1440 then perform public._fail('invalid_request', 'PT422'); end if;

  -- Concurrent creates by one patient serialise here, so the checks below see each other's rows.
  perform pg_advisory_xact_lock(hashtextextended('create_mission:' || v_uid::text, 0));

  select * into m from public.missions where patient_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('replay', true, 'mission', public.mission_json(m));
  end if;

  -- Only a request the patient could cancel themselves blocks a new one (after pickup, cancel_mission refuses).
  select id into v_active from public.missions
   where patient_id = v_uid and status in ('requesting', 'en_route', 'on_scene') limit 1;
  if v_active is not null then
    perform public._fail('active_mission_exists', 'PT409', v_active::text);
  end if;
  -- A search the system ended (no ambulance available) does not count: the patient must always be able to try again.
  if (select count(*) from public.missions
       where patient_id = v_uid and created_at > now() - interval '1 hour' and cancelled_by is distinct from 'system') >= 10 then
    perform public._fail('too_many_requests', 'PT429');
  end if;

  v_pt := extensions.st_setsrid(extensions.st_makepoint(p_pickup_lng, p_pickup_lat), 4326)::extensions.geography;
  select j.zone into v_zone from public.jurisdictions j where extensions.st_covers(j.boundary, v_pt) limit 1;
  if v_zone is null then
    if not exists (select 1 from public.jurisdictions) then
      perform public._fail('jurisdictions_not_loaded', 'PT503');
    end if;
    perform public._fail('out_of_zone', 'PT422');
  end if;

  insert into public.missions (
    patient_id, status, urgency, vehicle_type, pickup_location, fare_details, idempotency_key, jurisdiction, district,
    pickup_address, distance_km, duration_min, route_polyline, triage, state_version
  ) values (
    v_uid, 'requesting', p_urgency, p_vehicle_type, v_pt, public.compute_statutory_fare(p_vehicle_type, v_zone, p_distance_km),
    p_idempotency_key, v_zone, left(p_district, 100), left(p_pickup_address, 300), p_distance_km, p_duration_min,
    left(p_route_polyline, 20000), p_triage, 0
  ) returning * into m;

  perform public._record_event(m.id, 'requesting', 'MISSION_REQUESTED', v_uid, 'patient', '{}'::jsonb);
  select * into m from public.missions where id = m.id;
  perform public.dispatch_next_wave(m.id);
  select * into m from public.missions where id = m.id;
  return jsonb_build_object('replay', false, 'mission', public.mission_json(m));
end;
$$;

-- ---------------------------------------------------------------------------
-- ingest_telemetry: as 20260924000003, plus a time window (the mission's lifetime, ±5 min of clock skew) and an accuracy
-- range. Rejected pings are counted, as before, so the client drops them from its queue.
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
-- transition_mission: as 20261003000000 plus input validation, server-bounded stage times and a filtered measured leg.
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
  v_lat double precision;
  v_lng double precision;
begin
  if v_uid is null then perform public._fail('unauthenticated', 'PT401'); end if;
  if p_event not in ('ON_SCENE', 'PATIENT_ON_BOARD', 'ARRIVED_HOSPITAL', 'COMPLETE', 'ABORT') then
    perform public._fail('unknown_event', 'PT422', p_event);
  end if;
  if jsonb_typeof(p) <> 'object' or pg_column_size(p) > 16384 then perform public._fail('invalid_payload', 'PT422'); end if;

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
    v_lat := (p -> 'location' ->> 'latitude')::double precision;
    v_lng := (p -> 'location' ->> 'longitude')::double precision;
    if v_lat not between -90 and 90 or v_lng not between -180 and 180 then perform public._fail('invalid_location', 'PT422'); end if;
    v_at := public._reported_ts(p ->> 'arrivedAt', m.accepted_at);
    e := public._record_event(m.id, 'on_scene', 'DRIVER_ARRIVED', v_uid, 'driver', jsonb_build_object(
      'location', jsonb_build_object('latitude', v_lat, 'longitude', v_lng),
      'arrivedAt', public.iso_utc(v_at),
      'distanceFromPickupM', round(extensions.st_distance(m.pickup_location,
        extensions.st_setsrid(extensions.st_makepoint(v_lng, v_lat), 4326)::extensions.geography))
    ), p_client_event_id);
    update public.missions set arrived_scene_at = v_at where id = m.id;

  elsif p_event = 'PATIENT_ON_BOARD' then
    if m.status <> 'on_scene' then perform public._fail('invalid_transition', 'PT409', m.status::text); end if;
    begin
      v_hosp := (p ->> 'hospitalId')::uuid;
    exception when others then
      perform public._fail('invalid_hospital', 'PT422');
    end;
    if p ? 'emergencyType' and (jsonb_typeof(p -> 'emergencyType') <> 'string' or char_length(p ->> 'emergencyType') > 40) then
      perform public._fail('invalid_payload', 'PT422');
    end if;
    v_at := public._reported_ts(p ->> 'onboardAt', coalesce(m.arrived_scene_at, m.accepted_at));
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
      'etaMinutes', case when jsonb_typeof(p -> 'etaMinutes') = 'number' and (p ->> 'etaMinutes')::numeric between 0 and 1440 then p -> 'etaMinutes' end,
      'wardStatus', 'Bed held',
      'vitals', v_vitals,
      'emergencyType', p -> 'emergencyType',
      'bypass', p -> 'bypass')), p_client_event_id);
    update public.missions set destination_hospital_id = h.id, onboard_at = v_at where id = m.id;

  elsif p_event = 'ARRIVED_HOSPITAL' then
    if m.status <> 'transporting' then perform public._fail('invalid_transition', 'PT409', m.status::text); end if;
    v_at := public._reported_ts(p ->> 'arrivedAt', m.onboard_at);
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
    if char_length(v_handoff ->> 'physicianName') > 200 or char_length(v_handoff ->> 'registrationNumber') > 200
       or char_length(v_handoff ->> 'department') > 200 then
      perform public._fail('handoff_invalid', 'PT422');
    end if;
    v_at := public._reported_ts(p ->> 'completedAt', m.arrived_hospital_at);
    -- D-2: the billable distance is measured from the transport leg (onboard -> hospital arrival, both now server-bounded).
    -- Fixes worse than 50 m and segments faster than 200 km/h are not distance. With no usable track it falls back to the
    -- pickup -> destination-hospital leg from canonical points; distanceSource says which.
    select round((coalesce(sum(seg), 0) / 1000)::numeric, 2) into v_km
      from (
        select extensions.st_distance(t.location, lag(t.location) over w) as seg,
               extract(epoch from t.recorded_at - lag(t.recorded_at) over w) as dt
          from public.telemetry_logs t
         where t.mission_id = m.id and t.driver_id = v_uid and t.recorded_at between m.onboard_at and m.arrived_hospital_at
           and (t.accuracy_m is null or t.accuracy_m <= 50)
        window w as (order by t.recorded_at)
      ) s where seg is not null and dt > 0 and seg / dt <= 200 / 3.6;
    if v_km is not null and v_km > 0 then
      v_source := 'measured';
      v_km := least(v_km, 9999.99);
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
-- set_driver_presence: as 20261003000000, but a half coordinate pair (latitude without longitude or the reverse) is
-- refused instead of silently refreshing presence on the old position.
-- ---------------------------------------------------------------------------
create or replace function public.set_driver_presence(
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
  if (p_lat is null) <> (p_lng is null) or (p_lat is not null and (p_lat not between -90 and 90 or p_lng not between -180 and 180)) then
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
-- Retention / erasure: also the pickup address, route, notes and on-scene position; the pickup is kept to ~1 km
-- (statutory reporting by area). Each mission is rewritten once (personal_data_purged_at).
-- ---------------------------------------------------------------------------
create or replace function public._strip_mission_personal_data(p_mission_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.telemetry_logs where mission_id = any (p_mission_ids);
  update public.missions
     set triage = '{}'::jsonb, pickup_address = null, route_polyline = null, cancel_note = null,
         pickup_location = extensions.st_snaptogrid(pickup_location::extensions.geometry, 0.01)::extensions.geography,
         personal_data_purged_at = now()
   where id = any (p_mission_ids) and personal_data_purged_at is null;
  update public.mission_events set metadata = metadata - array['vitals', 'handoff', 'emergencyType', 'bypass', 'location', 'note']
   where mission_id = any (p_mission_ids) and metadata ?| array['vitals', 'handoff', 'emergencyType', 'bypass', 'location', 'note'];
$$;

-- ---------------------------------------------------------------------------
-- record_consent: as 20260924000003 with bounded text fields.
-- ---------------------------------------------------------------------------
create or replace function public.record_consent(
  p_purpose        text,
  p_notice_version text,
  p_granted        boolean,
  p_locale         text default null,
  p_app_version    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  c public.consent_records;
begin
  if v_uid is null then perform public._fail('unauthenticated', 'PT401'); end if;
  if p_purpose not in ('geolocation', 'medical_data', 'driver_location', 'driver_credentials', 'third_party_llm')
     or coalesce(btrim(p_notice_version), '') = '' or char_length(p_notice_version) > 40 or p_granted is null
     or (p_locale is not null and p_locale not in ('en', 'hi')) or char_length(p_app_version) > 40 then
    perform public._fail('invalid_consent', 'PT422');
  end if;
  if not p_granted then
    update public.consent_records set withdrawn_at = now()
     where user_id = v_uid and purpose = p_purpose and granted and withdrawn_at is null;
  end if;
  insert into public.consent_records (user_id, purpose, notice_version, granted, locale, app_version)
  values (v_uid, p_purpose, p_notice_version, p_granted, p_locale, p_app_version)
  returning * into c;
  return jsonb_build_object('ok', true, 'id', c.id, 'grantedAt', public.iso_utc(c.granted_at));
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff KYC decisions name the reviewer. approve_kyc / reject_kyc are unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.staff_approve_kyc(p_driver_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
begin
  perform public._require_staff();
  if p_driver_id = (select auth.uid()) then perform public._fail('cannot_review_own_application', 'PT403'); end if;
  r := public.approve_kyc(p_driver_id, null);
  update public.drivers set kyc_reviewed_by = (select auth.uid()) where id = p_driver_id;
  return r;
end;
$$;

create or replace function public.staff_reject_kyc(p_driver_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
begin
  perform public._require_staff();
  if p_driver_id = (select auth.uid()) then perform public._fail('cannot_review_own_application', 'PT403'); end if;
  if char_length(p_reason) > 500 then perform public._fail('reason_too_long', 'PT422'); end if;
  r := public.reject_kyc(p_driver_id, btrim(p_reason));
  update public.drivers set kyc_reviewed_by = (select auth.uid()) where id = p_driver_id;
  return r;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: the two helpers are internal; redefined functions keep their grants (create or replace).
-- ---------------------------------------------------------------------------
revoke all on function public._reported_ts(text, timestamptz), public._triage_valid(jsonb) from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
