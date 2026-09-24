-- Server-authoritative Mission API (DATA_AND_SYNC_SPECIFICATION.md 6.4.5, 7.1, 7.5). Generated for manual
-- `supabase db push`; not applied by tooling.
--
-- "The server" is Postgres: SECURITY DEFINER functions exposed through PostgREST /rest/v1/rpc/*. Each state change
-- is one transaction: conditional update of the mission row + one mission_events row (seq = state_version + 1).
-- The publish leg is a pg_net trigger on mission_events that POSTs the wire envelope to Centrifugo. Its URL and
-- API key are read from Supabase Vault (`centrifugo_api_url`, `centrifugo_api_key`); when they are absent the
-- trigger does nothing, so local development without a publisher keeps working.
--
-- Errors: PostgREST maps SQLSTATE 'PTnnn' to HTTP nnn. `message` carries the machine code (offer_taken,
-- invalid_transition, ...), `detail` carries context (for example the mission's current status).
set search_path to public, extensions;

create sequence public.kyc_reference_seq;
create sequence public.anonymised_phone_seq;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function public.iso_utc(p_ts timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$ select to_char(p_ts at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') $$;

create function public._fail(p_code text, p_status text, p_detail text default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_detail is null then
    raise exception using errcode = p_status, message = p_code;
  end if;
  raise exception using errcode = p_status, message = p_code, detail = p_detail;
end;
$$;

create function public._ts(p_text text)
returns timestamptz
language plpgsql
volatile
set search_path = ''
as $$
begin
  if p_text is null or p_text = '' then return now(); end if;
  return p_text::timestamptz;
exception when others then
  perform public._fail('invalid_timestamp', 'PT422', p_text);
  return now();
end;
$$;

-- Statutory tariff (mirrors packages/domain/src/pricing; supabase/tests/data_sync_schema.test.ts fails on drift).
create function public.compute_statutory_fare(
  p_vehicle_type public.ais125_vehicle_type,
  p_zone         public.jurisdiction_zone,
  p_distance_km  numeric
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_base integer;
  v_per_km integer;
  v_care text;
  v_extra numeric;
  v_extra_fare integer;
begin
  case p_vehicle_type
    when 'TYPE_D_ALS' then v_base := 500; v_per_km := 25; v_care := 'ALS';
    when 'TYPE_C_BLS' then v_base := 300; v_per_km := 15; v_care := 'BLS';
    when 'TYPE_B_PTA' then v_base := 200; v_per_km := 12; v_care := 'PTA';
    else                   v_base := 150; v_per_km := 8;  v_care := 'PTA';
  end case;
  v_extra := greatest(0, round(p_distance_km - 5.0, 1));
  v_extra_fare := round(v_extra * v_per_km);
  return jsonb_build_object(
    'vehicleType', p_vehicle_type,
    'careLevel', v_care,
    'jurisdiction', p_zone,
    'totalDistanceKm', p_distance_km,
    'initialIncludedKm', 5.0,
    'baseFareInr', v_base,
    'billableAdditionalKm', v_extra,
    'perKmRateInr', v_per_km,
    'additionalDistanceFareInr', v_extra_fare,
    'emtParamedicChargesInr', 0,
    'surgeMultiplier', 1.0,
    'surgeGougingAmountInr', 0,
    'estimatedTotalInr', v_base + v_extra_fare,
    'currency', 'INR',
    'tariffVersion', '2026-04-01',
    'statutoryOrderRef', case p_zone
      when 'DL' then 'Delhi Transport Dept Gazette Order F.No.19(13)/Tpt/Ops/2021'
      else 'Uttar Pradesh Motor Vehicles (Ambulance Tariff) Schedule 2024'
    end,
    'mandateDeclaration', 'Regulated Non-Surge Emergency Pricing under State Mandate',
    'hindiMandateDeclaration', 'शासकीय आदेशानुसार नियंत्रित बिना-सर्ज आपातकालीन दरें',
    'computedAt', public.iso_utc(now())
  );
end;
$$;

create function public.mission_json(m public.missions)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', m.id,
    'displayRef', m.display_ref,
    'status', m.status,
    'stateVersion', m.state_version,
    'jurisdiction', m.jurisdiction,
    'vehicleType', m.vehicle_type,
    'urgency', m.urgency,
    'fareDetails', m.fare_details,
    'createdAt', public.iso_utc(m.created_at)
  )
$$;

-- Fire-and-forget: a publish problem must never roll back or block the state change that caused it.
create function public.publish_realtime(p_channel text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'centrifugo_api_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'centrifugo_api_key';
  if v_url is null or v_key is null then return; end if;
  perform net.http_post(
    url := v_url || '/api/publish',
    body := jsonb_build_object('channel', p_channel, 'data', p_data),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'apikey ' || v_key)
  );
exception when others then
  raise warning 'publish_realtime skipped for %: %', p_channel, sqlerrm;
end;
$$;

-- The single writer of lifecycle state (7.1). The caller holds the mission row lock.
create function public._record_event(
  p_mission_id      uuid,
  p_to              public.mission_status,
  p_event_type      text,
  p_actor           uuid,
  p_actor_role      text,
  p_metadata        jsonb,
  p_client_event_id uuid default null
)
returns public.mission_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.missions;
  e public.mission_events;
begin
  select * into m from public.missions where id = p_mission_id;
  insert into public.mission_events (mission_id, from_status, to_status, triggered_by, metadata, seq, event_type, actor_role, client_event_id)
  values (p_mission_id, m.status, p_to, p_actor, coalesce(p_metadata, '{}'::jsonb), m.state_version + 1, p_event_type, p_actor_role, p_client_event_id)
  returning * into e;
  update public.missions set status = p_to, state_version = e.seq where id = p_mission_id;
  return e;
end;
$$;

-- Wire envelope (6.4.3). Keys that are audit or clinical detail stay in mission_events.metadata and never
-- reach the channel: the patient is one subscriber, and handoff/vitals are not part of the wire contract.
create function public.mission_events_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver uuid;
begin
  if new.event_type = 'MISSION_REQUESTED' then return new; end if;
  select driver_id into v_driver from public.missions where id = new.mission_id;
  perform public.publish_realtime(
    'mission:' || new.mission_id,
    jsonb_build_object(
      'v', 1,
      'type', 'lifecycle',
      'event', new.event_type,
      'eventId', new.id,
      'seq', new.seq,
      'missionId', new.mission_id,
      'state', new.to_status,
      'timestamp', public.iso_utc(new.created_at),
      'data', new.metadata - array['vitals', 'handoff', 'emergencyType', 'bypass', 'audit']
    ) || case when v_driver is not null then jsonb_build_object('driverId', v_driver) else '{}'::jsonb end
  );
  return new;
end;
$$;
create trigger mission_events_publish
  after insert on public.mission_events
  for each row execute function public.mission_events_publish();

create function public._release_hospital_hold(p_mission_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.hospitals h
     set held_capacity = greatest(h.held_capacity - 1, 0), capacity_updated_at = now()
    from public.missions m
   where m.id = p_mission_id and m.destination_hospital_id = h.id
$$;

-- ---------------------------------------------------------------------------
-- Dispatch: waves, offers, escalation (5.3.6, 6.4.4, D-5). Presence is drivers.last_seen_at (30 s freshness);
-- Redis GEO (6.6) is the scale-out path and is not required for correctness.
-- ---------------------------------------------------------------------------
create function public.dispatch_config()
returns jsonb
language sql
immutable
set search_path = ''
as $$ select jsonb_build_object('offerTtlSeconds', 15, 'waveWindowSeconds', 45, 'radiiKm', jsonb_build_array(3, 6, 10)) $$;

create function public._revoke_offers(p_mission_id uuid, p_reason text, p_except uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  w record;
  d uuid;
begin
  for w in
    select id, eligible_driver_ids from public.dispatch_waves
     where mission_id = p_mission_id and status in ('broadcasting', 'accepted', 'expired')
       and created_at > now() - interval '5 minutes'
  loop
    foreach d in array w.eligible_driver_ids loop
      if p_except is null or d <> p_except then
        perform public.publish_realtime('driver:' || d || ':offers',
          jsonb_build_object('v', 1, 'type', 'offer_revoked', 'offerId', w.id, 'reason', p_reason));
      end if;
    end loop;
  end loop;
end;
$$;

-- Opens the next wave for a `requesting` mission. Returns the wave number opened, 0 when every wave found no
-- driver (the mission is then cancelled by `system`), or -1 when there was nothing to dispatch.
create function public.dispatch_next_wave(p_mission_id uuid)
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
      perform public._record_event(p_mission_id, 'cancelled', 'MISSION_CANCELLED', null, 'system',
        jsonb_build_object('cancelledBy', 'system', 'reason', 'no_ambulance_available', 'fromState', m.status));
      update public.missions
         set cancelled_at = now(), cancelled_by = 'system', cancel_reason = 'other', cancel_note = 'no_ambulance_available'
       where id = p_mission_id;
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

-- Escalation. Run every few seconds from pg_cron or a worker (service_role):
--   select cron.schedule('dispatch-tick', '5 seconds', 'select public.dispatch_tick()');
create function public.dispatch_tick()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
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
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profile provisioning from the verified auth event (R-04, G-11). The role comes from raw_app_meta_data (only
-- service_role can set it), never raw_user_meta_data, which the client controls. profiles.role is the single
-- authority afterwards; every RPC below checks it.
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.phone is null or new.phone = '' then return new; end if;
  -- An OTP signup inserts the user before staff can set app_metadata.role, so the role is re-applied whenever
  -- raw_app_meta_data changes. It only ever comes from that server-controlled field.
  insert into public.profiles (id, phone, role)
  values (new.id, '+' || ltrim(new.phone, '+'), case when new.raw_app_meta_data ->> 'role' = 'driver' then 'driver' else 'patient' end)
  on conflict (id) do update
     set role = excluded.role
   where public.profiles.role is distinct from excluded.role
     and new.raw_app_meta_data ? 'role';
  return new;
exception when unique_violation then
  -- another profile already owns this phone number: never block authentication over it
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert or update of raw_app_meta_data on auth.users
  for each row execute function public.handle_new_user();

-- One-shot backfill (G-11): users created before this trigger existed have no profile row.
insert into public.profiles (id, phone, role)
select u.id, '+' || ltrim(u.phone, '+'), case when u.raw_app_meta_data ->> 'role' = 'driver' then 'driver' else 'patient' end
  from auth.users u
 where u.phone is not null and u.phone <> ''
   and not exists (select 1 from public.profiles p where p.id = u.id or p.phone = '+' || ltrim(u.phone, '+'))
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Patient RPCs
-- ---------------------------------------------------------------------------
create function public.create_mission(
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
  m public.missions;
begin
  if v_uid is null then perform public._fail('unauthenticated', 'PT401'); end if;
  if not exists (select 1 from public.profiles where id = v_uid and role = 'patient') then
    perform public._fail('not_a_patient', 'PT403');
  end if;
  if p_pickup_lat is null or p_pickup_lng is null or p_pickup_lat not between -90 and 90 or p_pickup_lng not between -180 and 180 then
    perform public._fail('invalid_pickup', 'PT422');
  end if;
  if p_distance_km is null or p_distance_km < 0 or p_distance_km > 9999.99 then
    perform public._fail('invalid_distance', 'PT422');
  end if;
  if p_triage is null or jsonb_typeof(p_triage) <> 'object' then
    perform public._fail('invalid_triage', 'PT422');
  end if;

  select * into m from public.missions where patient_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('replay', true, 'mission', public.mission_json(m));
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
    p_idempotency_key, v_zone, p_district, p_pickup_address, p_distance_km, p_duration_min, p_route_polyline, p_triage, 0
  ) returning * into m;

  perform public._record_event(m.id, 'requesting', 'MISSION_REQUESTED', v_uid, 'patient', '{}'::jsonb);
  select * into m from public.missions where id = m.id;
  perform public.dispatch_next_wave(m.id);
  select * into m from public.missions where id = m.id;
  return jsonb_build_object('replay', false, 'mission', public.mission_json(m));
end;
$$;

create function public.cancel_mission(p_mission_id uuid, p_reason text default 'changed_mind', p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  m public.missions;
  e public.mission_events;
  v_from public.mission_status;
begin
  if v_uid is null then perform public._fail('unauthenticated', 'PT401'); end if;
  if p_reason is null or p_reason not in ('changed_mind', 'found_alternative', 'duplicate_request', 'other') then
    perform public._fail('invalid_reason', 'PT422');
  end if;
  if p_note is not null and char_length(p_note) > 500 then perform public._fail('note_too_long', 'PT422'); end if;

  select * into m from public.missions where id = p_mission_id and patient_id = v_uid for update;
  if not found then perform public._fail('not_found', 'PT404'); end if;
  if m.status = 'cancelled' then
    return jsonb_build_object('ok', true, 'status', m.status, 'seq', m.state_version, 'replay', true);
  end if;
  if m.status in ('transporting', 'arrived_hospital', 'completed') then
    perform public._fail('invalid_transition', 'PT409', m.status::text);
  end if;

  v_from := m.status;
  e := public._record_event(m.id, 'cancelled', 'MISSION_CANCELLED', v_uid, 'patient',
    jsonb_strip_nulls(jsonb_build_object('cancelledBy', 'patient', 'reason', p_reason, 'note', p_note, 'fromState', v_from)));
  update public.missions
     set cancelled_at = now(), cancelled_by = 'patient', cancel_reason = p_reason, cancel_note = p_note
   where id = m.id;
  update public.dispatch_waves set status = 'expired' where mission_id = m.id and status = 'broadcasting';
  perform public._revoke_offers(m.id, 'cancelled');
  return jsonb_build_object('ok', true, 'status', 'cancelled', 'seq', e.seq, 'eventId', e.id);
end;
$$;

-- Patient acknowledgement after completion (7.1): stored as columns, not a status. Safe to repeat; a dispute stays raised.
create function public.confirm_receipt(p_mission_id uuid, p_dispute boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  m public.missions;
begin
  if v_uid is null then perform public._fail('unauthenticated', 'PT401'); end if;
  select * into m from public.missions where id = p_mission_id and patient_id = v_uid for update;
  if not found then perform public._fail('not_found', 'PT404'); end if;
  if m.status <> 'completed' then perform public._fail('invalid_transition', 'PT409', m.status::text); end if;
  update public.missions
     set receipt_confirmed_at = coalesce(receipt_confirmed_at, now()),
         dispute_flag = dispute_flag or coalesce(p_dispute, false)
   where id = m.id
  returning * into m;
  return jsonb_build_object('ok', true, 'receiptConfirmedAt', public.iso_utc(m.receipt_confirmed_at), 'disputeFlag', m.dispute_flag);
end;
$$;

-- ---------------------------------------------------------------------------
-- Driver RPCs
-- ---------------------------------------------------------------------------
create function public.accept_offer(p_offer_id uuid, p_client_event_id uuid default null)
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
  v_name text;
  v_reg text;
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

  select * into d from public.drivers where id = v_uid;
  if not found or not d.is_verified then perform public._fail('not_verified', 'PT403'); end if;
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

  select full_name into v_name from public.profiles where id = v_uid;
  select registration_number into v_reg from public.driver_vehicles where driver_id = v_uid and is_active;
  e := public._record_event(m.id, 'en_route', 'DRIVER_ACCEPTED', v_uid, 'driver',
    jsonb_build_object('driver', jsonb_strip_nulls(jsonb_build_object(
      -- First name and initial only. Nothing collects a driver name today, so this is omitted when unknown.
      'displayName', case when v_name is null or btrim(v_name) = '' then null
                          when position(' ' in btrim(v_name)) = 0 then btrim(v_name)
                          else split_part(btrim(v_name), ' ', 1) || ' ' || left(reverse(split_part(reverse(btrim(v_name)), ' ', 1)), 1) || '.' end,
      'vehicleRegistration', v_reg,
      'ais125Type', d.ais125_type))),
    p_client_event_id);
  perform public._revoke_offers(m.id, 'taken', v_uid);
  return jsonb_build_object('ok', true, 'status', 'en_route', 'seq', e.seq, 'eventId', e.id);
end;
$$;

-- Validates and acknowledges. Escalation is by wave window (dispatch_tick); nothing is persisted per decline.
create function public.decline_offer(p_offer_id uuid, p_reason text default 'other')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  w public.dispatch_waves;
begin
  if v_uid is null then perform public._fail('unauthenticated', 'PT401'); end if;
  if p_reason is null or p_reason not in ('too_far', 'vehicle_issue', 'patient_onboard', 'break', 'other') then
    perform public._fail('invalid_reason', 'PT422');
  end if;
  select * into w from public.dispatch_waves where id = p_offer_id;
  if not found or not (v_uid = any (w.eligible_driver_ids)) then perform public._fail('offer_not_found', 'PT404'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

create function public.transition_mission(
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

-- Presence heartbeat and go-online (R-05). Redis GEO/presence (6.6) is the scale-out path.
create function public.set_driver_presence(
  p_online boolean,
  p_lat    double precision default null,
  p_lng    double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  d public.drivers;
begin
  if v_uid is null then perform public._fail('unauthenticated', 'PT401'); end if;
  select * into d from public.drivers where id = v_uid;
  if not found then perform public._fail('driver_profile_missing', 'PT403'); end if;
  if p_online and not d.is_verified then perform public._fail('not_verified', 'PT403'); end if;
  if p_lat is not null and (p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180) then
    perform public._fail('invalid_location', 'PT422');
  end if;
  update public.drivers
     set is_online = p_online,
         last_seen_at = now(),
         current_location = coalesce(
           case when p_lat is not null then extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography end,
           current_location)
   where id = v_uid;
  return jsonb_build_object('ok', true, 'isOnline', p_online);
end;
$$;

-- Acknowledged batch upload of GPS fixes (7.7). Duplicates are acknowledged (idempotent re-flush); malformed rows are
-- rejected permanently, so the client may drop both counts from its queue.
create function public.ingest_telemetry(p_mission_id uuid, p_pings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  m public.missions;
  x jsonb;
  v_ack integer := 0;
  v_rej integer := 0;
begin
  if v_uid is null then perform public._fail('unauthenticated', 'PT401'); end if;
  if jsonb_typeof(p_pings) is distinct from 'array' or jsonb_array_length(p_pings) > 1000 then perform public._fail('invalid_batch', 'PT422'); end if;
  select * into m from public.missions where id = p_mission_id and driver_id = v_uid;
  if not found or m.status not in ('en_route', 'on_scene', 'transporting', 'arrived_hospital') then
    perform public._fail('not_found', 'PT404');
  end if;
  for x in select * from jsonb_array_elements(p_pings) loop
    begin
      if jsonb_typeof(x -> 'latitude') is distinct from 'number' or jsonb_typeof(x -> 'longitude') is distinct from 'number'
         or (x ->> 'latitude')::double precision not between -90 and 90
         or (x ->> 'longitude')::double precision not between -180 and 180
         or (x ? 'speed' and (x ->> 'speed')::numeric < 0)
         or (x ? 'heading' and (x ->> 'heading')::numeric not between 0 and 360) then
        v_rej := v_rej + 1;
        continue;
      end if;
      insert into public.telemetry_logs (mission_id, driver_id, location, speed, heading, recorded_at, accuracy_m, dead_zone)
      values (m.id, v_uid,
        extensions.st_setsrid(extensions.st_makepoint((x ->> 'longitude')::double precision, (x ->> 'latitude')::double precision), 4326)::extensions.geography,
        (x ->> 'speed')::numeric, (x ->> 'heading')::numeric, public._ts(x ->> 'timestamp'), (x ->> 'accuracy')::numeric,
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
-- Driver KYC (5.3.2, 5.3.9, R-10). Vehicles and documents are written directly under RLS; the drivers row itself has
-- no client write grant, so it is created and edited only here, and only while the application is draft/rejected.
-- ---------------------------------------------------------------------------
create function public.upsert_driver_application(p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  d public.drivers;
begin
  if v_uid is null then perform public._fail('unauthenticated', 'PT401'); end if;
  if not exists (select 1 from public.profiles where id = v_uid and role = 'driver') then
    perform public._fail('not_a_driver', 'PT403');
  end if;
  if coalesce(btrim(p_fields ->> 'licenseNumber'), '') = '' or p_fields ->> 'ais125Type' is null then
    perform public._fail('application_incomplete', 'PT422');
  end if;
  insert into public.drivers (id, license_number, ais125_type, dl_expiry, dl_state, psv_badge_number, emt_level, emt_cert_id,
                              emt_council, emt_expiry, acls_certified, bls_certified)
  values (v_uid, upper(btrim(p_fields ->> 'licenseNumber')), (p_fields ->> 'ais125Type')::public.ais125_vehicle_type,
          (p_fields ->> 'dlExpiry')::date, p_fields ->> 'dlState', p_fields ->> 'psvBadgeNumber', p_fields ->> 'emtLevel',
          p_fields ->> 'emtNumber', p_fields ->> 'emtCouncil', (p_fields ->> 'emtExpiry')::date,
          coalesce((p_fields ->> 'aclsCertified')::boolean, false), coalesce((p_fields ->> 'blsCertified')::boolean, false))
  on conflict (id) do update
     set license_number = excluded.license_number, ais125_type = excluded.ais125_type, dl_expiry = excluded.dl_expiry,
         dl_state = excluded.dl_state, psv_badge_number = excluded.psv_badge_number, emt_level = excluded.emt_level,
         emt_cert_id = excluded.emt_cert_id, emt_council = excluded.emt_council, emt_expiry = excluded.emt_expiry,
         acls_certified = excluded.acls_certified, bls_certified = excluded.bls_certified
   where public.drivers.kyc_status in ('draft', 'rejected')
  returning * into d;
  if not found then perform public._fail('kyc_locked', 'PT409'); end if;
  return jsonb_build_object('ok', true, 'kycStatus', d.kyc_status);
end;
$$;

create function public.submit_kyc()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  d public.drivers;
  v_ref text;
begin
  if v_uid is null then perform public._fail('unauthenticated', 'PT401'); end if;
  select * into d from public.drivers where id = v_uid for update;
  if not found then perform public._fail('driver_profile_missing', 'PT403'); end if;
  if d.kyc_status not in ('draft', 'rejected') then perform public._fail('kyc_locked', 'PT409', d.kyc_status); end if;
  -- D-UX-04: an expired licence used to pass because the date was only checked for being non-empty.
  if d.dl_expiry is null or d.dl_expiry <= current_date then perform public._fail('dl_expired', 'PT422'); end if;
  if d.emt_expiry is not null and d.emt_expiry <= current_date then perform public._fail('emt_expired', 'PT422'); end if;
  if d.ais125_type = 'TYPE_D_ALS' and not d.acls_certified then perform public._fail('acls_required', 'PT422'); end if;
  if not exists (select 1 from public.driver_vehicles where driver_id = v_uid and is_active) then
    perform public._fail('vehicle_missing', 'PT422');
  end if;
  if (select count(*) from public.driver_documents
       where driver_id = v_uid and slot in ('arai_certificate', 'fitness_permit', 'vehicle_rc')) < 3 then
    perform public._fail('documents_missing', 'PT422');
  end if;
  v_ref := 'EK-KYC-' || lpad(nextval('public.kyc_reference_seq')::text, 6, '0');
  update public.drivers
     set kyc_status = 'pending_verification', kyc_submitted_at = now(), kyc_reference = coalesce(kyc_reference, v_ref),
         kyc_reject_reason = null
   where id = v_uid
  returning * into d;
  return jsonb_build_object('ok', true, 'kycStatus', d.kyc_status, 'kycReference', d.kyc_reference, 'submittedAt', public.iso_utc(d.kyc_submitted_at));
end;
$$;

-- ---------------------------------------------------------------------------
-- DPDP (5.3.9, R-13). Timestamps are set here, from the JWT, so a client cannot forge them.
-- ---------------------------------------------------------------------------
create function public.record_consent(
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
     or coalesce(btrim(p_notice_version), '') = '' or p_granted is null then
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

create function public.request_erasure(p_mission_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  r public.erasure_requests;
begin
  if v_uid is null then perform public._fail('unauthenticated', 'PT401'); end if;
  if p_mission_id is not null and not exists (select 1 from public.missions where id = p_mission_id and patient_id = v_uid) then
    perform public._fail('not_found', 'PT404');
  end if;
  select * into r from public.erasure_requests
   where user_id = v_uid and status = 'queued' and mission_id is not distinct from p_mission_id;
  if not found then
    insert into public.erasure_requests (user_id, mission_id, due_at)
    values (v_uid, p_mission_id, now() + interval '72 hours')
    returning * into r;
  end if;
  return jsonb_build_object('ok', true, 'id', r.id, 'dueAt', public.iso_utc(r.due_at));
end;
$$;

-- ---------------------------------------------------------------------------
-- Retention and erasure jobs (5.6). service_role only; schedule with pg_cron, for example hourly.
-- The fare ledger, urgency and distance metrics stay (statutory); personal content goes.
-- ---------------------------------------------------------------------------
create function public._strip_mission_personal_data(p_mission_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.telemetry_logs where mission_id = any (p_mission_ids);
  update public.missions set triage = '{}'::jsonb where id = any (p_mission_ids) and triage <> '{}'::jsonb;
  update public.mission_events set metadata = metadata - array['vitals', 'handoff', 'emergencyType', 'bypass']
   where mission_id = any (p_mission_ids) and metadata ?| array['vitals', 'handoff', 'emergencyType', 'bypass'];
$$;

create function public.purge_expired_personal_data(p_retention interval default interval '30 days')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  select coalesce(array_agg(id), '{}') into v_ids from public.missions
   where status in ('completed', 'cancelled') and coalesce(completed_at, cancelled_at, updated_at) < now() - p_retention;
  perform public._strip_mission_personal_data(v_ids);
  return cardinality(v_ids);
end;
$$;

create function public.process_erasure_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.erasure_requests;
  v_ids uuid[];
  n integer := 0;
begin
  for r in select * from public.erasure_requests where status = 'queued' order by due_at for update skip locked loop
    select coalesce(array_agg(id), '{}') into v_ids from public.missions
     where patient_id = r.user_id and status in ('completed', 'cancelled') and (r.mission_id is null or id = r.mission_id);
    perform public._strip_mission_personal_data(v_ids);
    if r.mission_id is null then
      update public.profiles
         set full_name = null, phone = '+999' || lpad(nextval('public.anonymised_phone_seq')::text, 10, '0'), anonymised_at = now()
       where id = r.user_id and role = 'patient' and anonymised_at is null;
    end if;
    update public.erasure_requests set status = 'done', completed_at = now(),
           scope = jsonb_build_object('missions', cardinality(v_ids)) where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: Supabase grants EXECUTE on new public functions to anon/authenticated by default, so revoke first,
-- then grant exactly the client surface. Internal functions are reachable only through these (SECURITY DEFINER)
-- or by service_role.
-- ---------------------------------------------------------------------------
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant execute on function public.create_mission(uuid, double precision, double precision, public.ais125_vehicle_type, public.urgency_tier, jsonb, numeric, text, text, integer, text) to authenticated;
grant execute on function public.cancel_mission(uuid, text, text) to authenticated;
grant execute on function public.confirm_receipt(uuid, boolean) to authenticated;
grant execute on function public.accept_offer(uuid, uuid) to authenticated;
grant execute on function public.decline_offer(uuid, text) to authenticated;
grant execute on function public.transition_mission(uuid, text, jsonb, uuid) to authenticated;
grant execute on function public.set_driver_presence(boolean, double precision, double precision) to authenticated;
grant execute on function public.ingest_telemetry(uuid, jsonb) to authenticated;
grant execute on function public.upsert_driver_application(jsonb) to authenticated;
grant execute on function public.submit_kyc() to authenticated;
grant execute on function public.record_consent(text, text, boolean, text, text) to authenticated;
grant execute on function public.request_erasure(uuid) to authenticated;
grant execute on function public.dispatch_config() to authenticated;

grant execute on all functions in schema public to service_role;
grant usage on sequence public.kyc_reference_seq, public.anonymised_phone_seq to service_role;
