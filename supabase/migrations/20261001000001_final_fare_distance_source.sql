-- Final fare source (G4.7-C). The billed amount is unchanged: COMPLETE still measures the transport leg from the track and,
-- with fewer than two logged fixes in it, still bills the quoted distance (D-2). What changes is that the completion record
-- now says which one it is, as a first-class `distanceSource` ('measured' | 'estimate') next to distanceKm and finalFareInr.
-- Before, the source lived only in metadata.audit, which mission_events_publish strips from the wire, so a patient could not
-- tell a GPS-measured fare from the quote fallback. audit.distanceSource is kept for existing readers.
-- The body is otherwise unchanged from 20260924000003; create or replace keeps its grant.

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
    -- D-2: the billable distance is measured by the server from the transport leg (onboard -> hospital arrival);
    -- with fewer than two logged fixes it falls back to the quoted estimate, and the audit metadata says so.
    select round((coalesce(sum(seg), 0) / 1000)::numeric, 2) into v_km
      from (
        select extensions.st_distance(t.location, lag(t.location) over (order by t.recorded_at)) as seg
          from public.telemetry_logs t
         where t.mission_id = m.id and t.driver_id = v_uid and t.recorded_at between m.onboard_at and m.arrived_hospital_at
      ) s where seg is not null;
    if v_km is not null and v_km > 0 then v_source := 'measured'; else v_km := coalesce(m.distance_km, 0); end if;
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
