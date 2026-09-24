-- Driver Booking board, claim, and profile (driver app: Booking and Profile pages).
--
-- The board is a per-caller PULL, never a broadcast: the spec rejects publishing open missions to every driver
-- (DATA_AND_SYNC_SPECIFICATION.md 6.4.4, G-23, R-06), so `missions` RLS is not widened and no channel is added.
-- `list_nearby_emergencies` computes what the calling driver may see; `claim_emergency` re-checks all of it under a row lock.
-- Timing and radii come from dispatch_config(); @sahayak/domain boardBand() is the reference for _board_band().

-- ---------------------------------------------------------------------------
-- Configuration: adds the board radii (green 4 km, red 7 km, home-screen fallback 10 km). radiiKm (the offer waves) is unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.dispatch_config()
returns jsonb
language sql
immutable
set search_path = ''
as $$ select jsonb_build_object('offerTtlSeconds', 15, 'waveWindowSeconds', 45, 'radiiKm', jsonb_build_array(3, 6, 10), 'boardRadiiKm', jsonb_build_array(4, 7, 10)) $$;

-- ---------------------------------------------------------------------------
-- Columns. Clients cannot write these directly (the existing column grants do not list them): update_driver_profile is the path.
-- ---------------------------------------------------------------------------
alter table public.drivers
  add column service_zone public.jurisdiction_zone,
  add column hospital_id  uuid references public.hospitals (id) on delete set null;

alter table public.driver_vehicles
  add column color      text check (char_length(color) <= 30),
  add column crew_count smallint check (crew_count between 1 and 12);

create index idx_drivers_hospital_id on public.drivers (hospital_id) where hospital_id is not null;
create index idx_missions_open_board on public.missions using gist (pickup_location) where status = 'requesting' and driver_id is null;

-- ---------------------------------------------------------------------------
-- Helpers (internal: not client-callable)
-- ---------------------------------------------------------------------------

-- A driver holds a mission from the moment it is claimed until it completes or is cancelled.
create function public._driver_on_mission(p_driver uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.missions m
     where m.driver_id = p_driver and m.status not in ('completed', 'cancelled')
  )
$$;

-- What the patient may see of the accepting crew. First name and initial only; every field is omitted when unknown.
create function public._driver_public_info(p_driver uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'displayName', case when p.full_name is null or btrim(p.full_name) = '' then null
                        when position(' ' in btrim(p.full_name)) = 0 then btrim(p.full_name)
                        else split_part(btrim(p.full_name), ' ', 1) || ' ' || left(reverse(split_part(reverse(btrim(p.full_name)), ' ', 1)), 1) || '.' end,
    'vehicleRegistration', v.registration_number,
    'makeModel', v.make_model,
    'color', v.color,
    'crewCount', v.crew_count,
    'ais125Type', d.ais125_type))
  from public.drivers d
  left join public.profiles p on p.id = d.id
  left join public.driver_vehicles v on v.driver_id = d.id and v.is_active
  where d.id = p_driver
$$;

-- Which board section a driver may see this mission in, or null. Same rule as boardBand() in @sahayak/domain:
--   green    within boardRadiiKm[0] at any age (an overdue one shows here with a negative timer)
--   red      within boardRadiiKm[1] once one wave window has passed with no taker
--   fallback within boardRadiiKm[2] once two have passed and no free ambulance of that type is within boardRadiiKm[1]
create function public._board_band(d public.drivers, m public.missions)
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
  age := extract(epoch from now() - m.created_at);
  if km <= g then return 'green'; end if;
  if km <= r then return case when age >= win then 'red' end; end if;
  if km <= f and age >= 2 * win and not exists (
    select 1 from public.drivers x
     where x.is_online and x.is_verified and x.ais125_type = m.vehicle_type
       and x.last_seen_at > now() - interval '30 seconds'
       and extensions.st_dwithin(x.current_location, m.pickup_location, r * 1000)
       and not public._driver_on_mission(x.id)
  ) then
    return 'fallback';
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- list_nearby_emergencies: the caller's board. Only this driver's vehicle type, only what _board_band allows, oldest first.
-- A driver who is offline or whose position is stale gets an empty list (they are not in the pool), not an error.
-- ---------------------------------------------------------------------------
create function public.list_nearby_emergencies()
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
  if not d.is_online or d.current_location is null or d.last_seen_at is null or d.last_seen_at <= now() - interval '30 seconds' then
    return jsonb_build_object('ok', true, 'serverNow', public.iso_utc(now()), 'items', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(s.item order by s.created_at, s.id), '[]'::jsonb) into v_items
    from (
      select m.id, m.created_at, jsonb_strip_nulls(jsonb_build_object(
        'missionId', m.id,
        'createdAt', public.iso_utc(m.created_at),
        'dueAt', public.iso_utc(m.created_at + make_interval(secs => v_win)),
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
         and extensions.st_dwithin(d.current_location, m.pickup_location, v_max * 1000)
         and b.band is not null
       order by m.created_at, m.id
       limit 50
    ) s;

  return jsonb_build_object('ok', true, 'serverNow', public.iso_utc(now()), 'items', v_items);
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_emergency: take a mission from the board. accept_offer needs a wave whose eligible list names the caller, which a
-- red-section driver (or one who drove into range later) was never on, so this re-checks everything itself under a row lock.
-- ---------------------------------------------------------------------------
create function public.claim_emergency(p_mission_id uuid, p_client_event_id uuid default null)
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

  -- The driver row is locked too, so two claims by one driver serialise and the second sees the first as a held mission.
  select * into d from public.drivers where id = v_uid for update;
  if not found or not d.is_verified then perform public._fail('not_verified', 'PT403'); end if;
  if public._driver_on_mission(v_uid) then perform public._fail('already_on_mission', 'PT409'); end if;
  if m.status <> 'requesting' or m.driver_id is not null then
    perform public._fail(case when m.status = 'cancelled' then 'offer_expired' else 'offer_taken' end, 'PT409');
  end if;
  if d.ais125_type <> m.vehicle_type then perform public._fail('not_eligible', 'PT403'); end if;
  if not d.is_online or d.last_seen_at is null or d.last_seen_at <= now() - interval '30 seconds' then
    perform public._fail('not_online', 'PT403');
  end if;
  if public._board_band(d, m) is null then perform public._fail('not_in_range', 'PT403'); end if;

  update public.missions set driver_id = v_uid, accepted_at = now() where id = m.id;
  e := public._record_event(m.id, 'en_route', 'DRIVER_ACCEPTED', v_uid, 'driver',
    jsonb_build_object('driver', public._driver_public_info(v_uid)), p_client_event_id);
  perform public._revoke_offers(m.id, 'taken', v_uid);
  update public.dispatch_waves set status = 'expired' where mission_id = m.id and status = 'broadcasting';
  return jsonb_build_object('ok', true, 'status', 'en_route', 'seq', e.seq, 'eventId', e.id);
end;
$$;

-- accept_offer, unchanged except that the accepting crew's details now come from _driver_public_info, so an offer accepted
-- from a push and a mission claimed from the board tell the patient the same things (plate, make, colour, crew size).
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

  e := public._record_event(m.id, 'en_route', 'DRIVER_ACCEPTED', v_uid, 'driver',
    jsonb_build_object('driver', public._driver_public_info(v_uid)),
    p_client_event_id);
  perform public._revoke_offers(m.id, 'taken', v_uid);
  return jsonb_build_object('ok', true, 'status', 'en_route', 'seq', e.seq, 'eventId', e.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Driver profile
-- ---------------------------------------------------------------------------
create function public.get_driver_profile()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  d public.drivers;
  p public.profiles;
  v public.driver_vehicles;
  h public.hospitals;
begin
  if v_uid is null then perform public._fail('unauthenticated', 'PT401'); end if;
  select * into d from public.drivers where id = v_uid;
  if not found then perform public._fail('driver_profile_missing', 'PT403'); end if;
  select * into p from public.profiles where id = v_uid;
  select * into v from public.driver_vehicles where driver_id = v_uid and is_active;
  select * into h from public.hospitals where id = d.hospital_id;

  return jsonb_build_object(
    'ok', true,
    'fullName', p.full_name,
    'phone', p.phone,
    'serviceZone', d.service_zone,
    'hospitalId', d.hospital_id,
    'hospitalName', h.name,
    'isVerified', d.is_verified,
    'kycStatus', d.kyc_status,
    'ais125Type', d.ais125_type,
    'onMission', public._driver_on_mission(v_uid),
    -- Plate and make/model come from the RC document, so they are only editable while the KYC application is.
    'regulatedEditable', d.kyc_status in ('draft', 'rejected'),
    'vehicle', case when v.id is null then null else jsonb_strip_nulls(jsonb_build_object(
      'registrationNumber', v.registration_number,
      'makeModel', v.make_model,
      'manufactureYear', v.manufacture_year,
      'color', v.color,
      'crewCount', v.crew_count)) end);
end;
$$;

-- Partial update: only the keys present are written. Refused while the driver holds a mission (profile_locked).
create function public.update_driver_profile(p_profile jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  p jsonb := coalesce(p_profile, '{}'::jsonb);
  veh jsonb := coalesce(p -> 'vehicle', '{}'::jsonb);
  d public.drivers;
  v public.driver_vehicles;
  v_name text;
  v_zone public.jurisdiction_zone;
  v_hosp uuid;
  v_reg text;
  v_make text;
  v_color text;
  v_year smallint;
  v_crew smallint;
begin
  if v_uid is null then perform public._fail('unauthenticated', 'PT401'); end if;
  if jsonb_typeof(p) <> 'object' or jsonb_typeof(veh) <> 'object' then perform public._fail('invalid_profile', 'PT422'); end if;
  select * into d from public.drivers where id = v_uid for update;
  if not found then perform public._fail('driver_profile_missing', 'PT403'); end if;
  if public._driver_on_mission(v_uid) then perform public._fail('profile_locked', 'PT409'); end if;

  if p ? 'fullName' then
    v_name := btrim(coalesce(p ->> 'fullName', ''));
    if char_length(v_name) not between 2 and 80 then perform public._fail('invalid_name', 'PT422'); end if;
    update public.profiles set full_name = v_name where id = v_uid;
  end if;

  if p ? 'serviceZone' then
    if p ->> 'serviceZone' not in ('DL', 'UP') then perform public._fail('invalid_zone', 'PT422'); end if;
    v_zone := (p ->> 'serviceZone')::public.jurisdiction_zone;
    update public.drivers set service_zone = v_zone where id = v_uid;
  end if;

  if p ? 'hospitalId' then
    if jsonb_typeof(p -> 'hospitalId') = 'null' then
      v_hosp := null;
    else
      if (p ->> 'hospitalId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        perform public._fail('invalid_hospital', 'PT422');
      end if;
      v_hosp := (p ->> 'hospitalId')::uuid;
      if not exists (select 1 from public.hospitals h where h.id = v_hosp and h.is_active) then
        perform public._fail('invalid_hospital', 'PT422');
      end if;
    end if;
    update public.drivers set hospital_id = v_hosp where id = v_uid;
  end if;

  if veh <> '{}'::jsonb then
    select * into v from public.driver_vehicles where driver_id = v_uid and is_active for update;
    v_reg := upper(btrim(coalesce(veh ->> 'registrationNumber', v.registration_number, '')));
    v_make := nullif(btrim(coalesce(veh ->> 'makeModel', v.make_model, '')), '');
    v_color := nullif(btrim(coalesce(veh ->> 'color', v.color, '')), '');
    v_year := coalesce((veh ->> 'manufactureYear')::smallint, v.manufacture_year);
    v_crew := coalesce((veh ->> 'crewCount')::smallint, v.crew_count);

    if v_reg !~ '^[A-Z0-9][A-Z0-9 -]{3,14}$' then perform public._fail('invalid_registration', 'PT422'); end if;
    if char_length(coalesce(v_make, '')) > 80 or char_length(coalesce(v_color, '')) > 30 then perform public._fail('invalid_vehicle', 'PT422'); end if;
    if v_year is not null and v_year not between 1990 and 2100 then perform public._fail('invalid_vehicle', 'PT422'); end if;
    if v_crew is not null and v_crew not between 1 and 12 then perform public._fail('invalid_crew_count', 'PT422'); end if;
    -- Plate and make/model are attested by the RC document: after the KYC application is submitted they change only through review.
    -- submit_kyc requires an active vehicle, so a submitted driver normally has one; a driver approved without one still cannot
    -- register an unreviewed plate here (the patient uses the plate to recognise the ambulance), so creating it is locked too.
    if d.kyc_status not in ('draft', 'rejected')
       and (v.id is null or v_reg is distinct from v.registration_number or v_make is distinct from v.make_model or v_year is distinct from v.manufacture_year) then
      perform public._fail('kyc_locked', 'PT409');
    end if;

    -- The column is unique on the exact text, so "DL 01 AB 1234" and "DL01AB1234" would both pass it: compare without spaces and hyphens.
    if exists (
      select 1 from public.driver_vehicles o
       where o.driver_id <> v_uid
         and regexp_replace(upper(o.registration_number), '[ -]', '', 'g') = regexp_replace(v_reg, '[ -]', '', 'g')
    ) then
      perform public._fail('registration_in_use', 'PT409');
    end if;

    begin
      if v.id is null then
        insert into public.driver_vehicles (driver_id, registration_number, make_model, manufacture_year, color, crew_count, ais125_type)
        values (v_uid, v_reg, v_make, v_year, v_color, v_crew, d.ais125_type);
      else
        update public.driver_vehicles
           set registration_number = v_reg, make_model = v_make, manufacture_year = v_year, color = v_color, crew_count = v_crew
         where id = v.id;
      end if;
    exception when unique_violation then
      perform public._fail('registration_in_use', 'PT409');
    end;
  end if;

  return public.get_driver_profile();
end;
$$;

-- A driver's own name cannot be changed under them mid-mission through the table grant either (the RPC above is the sanctioned path).
create function public._lock_driver_name_on_mission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'driver' and (select auth.uid()) = new.id and public._driver_on_mission(new.id) then
    perform public._fail('profile_locked', 'PT409');
  end if;
  return new;
end;
$$;
create trigger profiles_lock_driver_name
  before update of full_name on public.profiles
  for each row when (old.full_name is distinct from new.full_name)
  execute function public._lock_driver_name_on_mission();

-- A confirmed phone change (GoTrue phone_change) reaches profiles.phone; handle_new_user only runs on insert. A driver
-- mid-mission cannot complete one: the raise below surfaces to GoTrue as a failed update. The number is unique, so a clash
-- with another profile never blocks authentication.
create function public.sync_profile_phone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.phone is null or new.phone = '' or new.phone is not distinct from old.phone then return new; end if;
  if public._driver_on_mission(new.id) then perform public._fail('profile_locked', 'PT409'); end if;
  update public.profiles set phone = '+' || ltrim(new.phone, '+') where id = new.id;
  return new;
exception when unique_violation then
  return new;
end;
$$;
create trigger on_auth_user_phone_changed
  after update of phone on auth.users
  for each row execute function public.sync_profile_phone();

-- ---------------------------------------------------------------------------
-- Privileges: new public functions are executable by anon/authenticated by default, so revoke first and grant the client surface.
-- ---------------------------------------------------------------------------
revoke all on function
  public._driver_on_mission(uuid),
  public._driver_public_info(uuid),
  public._board_band(public.drivers, public.missions),
  public._lock_driver_name_on_mission(),
  public.sync_profile_phone(),
  public.list_nearby_emergencies(),
  public.claim_emergency(uuid, uuid),
  public.get_driver_profile(),
  public.update_driver_profile(jsonb)
from public, anon, authenticated;

grant execute on function public.list_nearby_emergencies() to authenticated;
grant execute on function public.claim_emergency(uuid, uuid) to authenticated;
grant execute on function public.get_driver_profile() to authenticated;
grant execute on function public.update_driver_profile(jsonb) to authenticated;
grant execute on function public.accept_offer(uuid, uuid) to authenticated;
grant execute on function public.dispatch_config() to authenticated;

grant execute on all functions in schema public to service_role;
