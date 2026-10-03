-- Behavioural checks for migration 20261003000000 (dispatch hardening): server-side eligibility (type, presence, GPS fix
-- freshness, busy, jurisdiction, reservation), distance ordering, offer timeout = wave expiry, recorded declines, next
-- wave on all-declined / expiry, cancellation during search and offer, a real two-session acceptance race (dblink), the
-- one-active-mission-per-driver index, and re-dispatch after a driver abort.
--
-- LOCAL database only (creates users and missions, no clean-up). As `postgres`, after every migration is applied:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -q -f supabase/tests/dispatch_hardening.behaviour.sql
-- now() is frozen inside a transaction, so time is moved by backdating rows, never by sleeping.
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

drop schema if exists t cascade;
create schema t;
grant usage on schema t to authenticated, anon;
create extension if not exists dblink with schema extensions;

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
create function t.err(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return null;
exception when others then
  return sqlerrm;
end $$;
grant execute on all functions in schema t to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Fixtures. Pickups are in Delhi (DL) at 28.6000 N 77.2000 E. +0.009 deg latitude = ~1 km.
-- ---------------------------------------------------------------------------
\set p1 '00000000-0000-4000-8000-000000001a01'
\set da '00000000-0000-4000-8000-000000001d0a'
\set db '00000000-0000-4000-8000-000000001d0b'
\set dc '00000000-0000-4000-8000-000000001d0c'
\set dd '00000000-0000-4000-8000-000000001d0d'
\set de '00000000-0000-4000-8000-000000001d0e'
\set df '00000000-0000-4000-8000-000000001d0f'

insert into auth.users (id, phone, raw_app_meta_data, raw_user_meta_data, aud, role) values
  (:'p1', '919876520001', '{}',                '{}', 'authenticated', 'authenticated'),
  (:'da', '919876520011', '{"role":"driver"}', '{}', 'authenticated', 'authenticated'),
  (:'db', '919876520012', '{"role":"driver"}', '{}', 'authenticated', 'authenticated'),
  (:'dc', '919876520013', '{"role":"driver"}', '{}', 'authenticated', 'authenticated'),
  (:'dd', '919876520014', '{"role":"driver"}', '{}', 'authenticated', 'authenticated'),
  (:'de', '919876520015', '{"role":"driver"}', '{}', 'authenticated', 'authenticated'),
  (:'df', '919876520016', '{"role":"driver"}', '{}', 'authenticated', 'authenticated');

insert into public.drivers (id, license_number, ais125_type, kyc_status, is_verified, is_online, last_seen_at, location_fixed_at, current_location) values
  (:'da', 'DH-A', 'TYPE_D_ALS', 'approved', true, true, now(), now(), extensions.st_geogfromtext('SRID=4326;POINT(77.2000 28.6018)')), -- ~0.2 km
  (:'db', 'DH-B', 'TYPE_D_ALS', 'approved', true, true, now(), now(), extensions.st_geogfromtext('SRID=4326;POINT(77.2000 28.6090)')), -- ~1.0 km
  (:'dc', 'DH-C', 'TYPE_C_BLS', 'approved', true, true, now(), now(), extensions.st_geogfromtext('SRID=4326;POINT(77.2000 28.6005)')), -- wrong type
  (:'dd', 'DH-D', 'TYPE_D_ALS', 'approved', true, true, now(), now(), extensions.st_geogfromtext('SRID=4326;POINT(77.2000 28.6045)')), -- ~0.5 km
  (:'de', 'DH-E', 'TYPE_D_ALS', 'approved', true, true, now(), now(), extensions.st_geogfromtext('SRID=4326;POINT(77.2000 28.6300)')), -- ~3.3 km (wave 2)
  (:'df', 'DH-F', 'TYPE_D_ALS', 'approved', true, true, now(), now(), extensions.st_geogfromtext('SRID=4326;POINT(77.2000 28.6070)')); -- ~0.8 km

-- Missions are inserted directly (service role) so a test chooses who is eligible before the first wave opens.
create function t.mission(p_age_s integer default 0) returns uuid
language plpgsql as $$
declare v uuid;
begin
  insert into public.missions (patient_id, urgency, vehicle_type, pickup_location, jurisdiction, triage, idempotency_key, created_at, search_started_at)
  values ('00000000-0000-4000-8000-000000001a01', 'CAT_1_IMMEDIATE', 'TYPE_D_ALS',
          extensions.st_geogfromtext('SRID=4326;POINT(77.2000 28.6000)'), 'DL', '{}', gen_random_uuid(),
          now() - make_interval(secs => p_age_s), now() - make_interval(secs => p_age_s))
  returning id into v;
  perform public._record_event(v, 'requesting', 'MISSION_REQUESTED', null, 'patient', '{}'::jsonb);
  return v;
end $$;
create function t.wave(p_mission uuid) returns public.dispatch_waves language sql as $$
  select * from public.dispatch_waves w where w.mission_id = p_mission order by w.round desc, w.wave_number desc limit 1
$$;
create function t.as_user(p_user uuid) returns text language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, false);
$$;
-- Ends every open search so the next scenario starts from free drivers.
create function t.reset() returns void language sql as $$
  update public.dispatch_waves set status = 'expired' where status = 'broadcasting';
  update public.missions set status = 'cancelled', cancelled_at = now(), cancelled_by = 'system' where status not in ('cancelled', 'completed');
$$;
grant execute on all functions in schema t to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Config and offer timeout = wave expiry
-- ---------------------------------------------------------------------------
select t.eq((public.dispatch_config() ->> 'gpsFreshSeconds')::int, 30, 'GPS fix freshness window is 30 s');
select t.eq((public.dispatch_config() ->> 'offerTtlSeconds')::int, 15, 'offer TTL unchanged (15 s)');
select t.eq((public.dispatch_config() ->> 'waveWindowSeconds')::int, 45, 'board wave window unchanged (45 s)');

select t.mission() as m1 \gset
select t.eq(public.dispatch_next_wave(:'m1'), 1, 'first wave opens');
select t.eq((select extract(epoch from w.expires_at - w.created_at)::int from t.wave(:'m1') w), 15,
  'a wave expires when its offers do: no dead window between offer expiry and the next wave');

-- ---------------------------------------------------------------------------
-- Eligibility and ordering (server-side only)
-- ---------------------------------------------------------------------------
select t.eq((select eligible_driver_ids from t.wave(:'m1')), array[:'da', :'dd', :'df', :'db']::uuid[],
  'exact type, online, fresh, within 3 km, nearest first (wrong-type C excluded, E outside wave 1)');
select t.ok(not (select eligible_driver_ids from t.wave(:'m1')) @> array[:'dc']::uuid[], 'TYPE_C_BLS driver is never offered a TYPE_D_ALS mission');

-- Reservation: every wave-1 driver of m1 holds an open offer, so m2 (same pickup) does not get them.
select t.mission() as m2 \gset
select t.eq(public.dispatch_next_wave(:'m2'), 2, 'm2 finds nobody free within 3 km (all reserved by m1) and opens wave 2');
select t.eq((select eligible_driver_ids from t.wave(:'m2')), array[:'de']::uuid[],
  'two simultaneous missions never offer the same driver at once: m2 gets the next free candidate');
select t.reset();

-- Offline, stale presence, stale GPS fix, jurisdiction.
update public.drivers set is_online = false where id = :'da';
update public.drivers set last_seen_at = now() - interval '31 seconds' where id = :'db';
update public.drivers set location_fixed_at = now() - interval '31 seconds' where id = :'dd';
update public.drivers set service_zone = 'UP' where id = :'df';
update public.drivers set service_zone = 'DL' where id = :'de';
select t.mission() as m3 \gset
select t.eq(public.dispatch_next_wave(:'m3'), 2, 'nobody eligible within 3 km: escalates to wave 2');
select t.eq((select eligible_driver_ids from t.wave(:'m3')), array[:'de']::uuid[],
  'offline, stale presence, stale GPS fix and other-jurisdiction drivers are excluded; same-zone driver is offered');
select t.reset();

-- GPS freshness is the fix's age (device clock on both ends, so skew cancels), not the heartbeat time: re-sending an old fix
-- does not refresh it.
update public.drivers set is_online = true where id = :'da';
select t.as_user(:'da');
set role authenticated;
select t.eq((public.set_driver_presence(true, 28.6018, 77.2000, 120000)) ->> 'ok', 'true', 'heartbeat re-sending a 2-minute-old fix is accepted');
reset role;
select t.ok((select location_fixed_at < now() - interval '90 seconds' from public.drivers where id = :'da'), 'location_fixed_at keeps the fix time, not the heartbeat time');
select t.ok((select last_seen_at >= now() - interval '1 second' from public.drivers where id = :'da'), 'last_seen_at still records that the app is alive');
select t.mission() as m4 \gset
select public.dispatch_next_wave(:'m4');
select t.ok(not exists (select 1 from public.dispatch_waves where mission_id = :'m4' and :'da' = any (eligible_driver_ids)), 'an alive app with a stale GPS fix is not dispatched');
select t.reset();
select t.as_user(:'da');
set role authenticated;
select t.eq((public.set_driver_presence(true, 28.6018, 77.2000, -3600000)) ->> 'ok', 'true', 'a negative age (device clock stepped back) is accepted');
reset role;
select t.ok((select location_fixed_at <= now() from public.drivers where id = :'da'), 'and never stored in the future');
select t.as_user(:'da');
set role authenticated;
select public.set_driver_presence(true, 28.6018, 77.2000);
reset role;
select t.ok((select location_fixed_at > now() - interval '1 second' from public.drivers where id = :'da'), 'coordinates without a fix time (older app builds) count as a fix now');

-- Busy: a driver holding a mission is never offered another.
update public.drivers set last_seen_at = now(), location_fixed_at = now(), service_zone = null;
select t.mission() as mbusy \gset
update public.missions set driver_id = :'da', status = 'en_route' where id = :'mbusy';
select t.mission() as m5 \gset
select public.dispatch_next_wave(:'m5');
select t.ok(not exists (select 1 from public.dispatch_waves where mission_id = :'m5' and :'da' = any (eligible_driver_ids)), 'busy driver is not offered');

-- Invariant 1 at the storage level: a second active mission for the same driver is impossible.
select t.ok(t.err(format($$update public.missions set driver_id = %L, status = 'en_route' where id = %L$$, :'da', :'m5')) like '%missions_one_active_per_driver%',
  'unique index refuses a second active mission for one driver');
update public.missions set status = 'completed', completed_at = now() where id = :'mbusy';
select t.reset();

-- ---------------------------------------------------------------------------
-- Decline is recorded; a declined offer cannot be accepted; all declined -> next wave at once
-- ---------------------------------------------------------------------------
update public.drivers set is_online = false where id in (:'dd', :'df');
select t.mission() as m6 \gset
select public.dispatch_next_wave(:'m6');
select t.eq((select eligible_driver_ids from t.wave(:'m6')), array[:'da', :'db']::uuid[], 'wave 1 offers A and B');
select w.id as w6 from t.wave(:'m6') w \gset
select t.as_user(:'da');
set role authenticated;
select t.eq((public.decline_offer(:'w6', 'too_far')) ->> 'ok', 'true', 'A declines');
select t.eq(t.err(format('select public.accept_offer(%L)', :'w6')), 'offer_declined', 'a declined offer cannot later be accepted');
reset role;
select t.eq((select declined_driver_ids from public.dispatch_waves where id = :'w6'), array[:'da']::uuid[], 'decline is persisted');
-- Recovery read after a reconnect: B still sees the open offer, A (declined) does not; same payload as the push.
select t.as_user(:'db');
set role authenticated;
select t.eq((select count(*)::int from jsonb_array_elements((public.list_open_offers()) -> 'items') i where i ->> 'offerId' = :'w6'), 1,
  'list_open_offers returns the offer still open for B');
select t.ok((select (i ->> 'expiresAt') is not null and (i ->> 'requiredVehicleType') = 'TYPE_D_ALS' and (i ->> 'distanceKm') is not null
               from jsonb_array_elements((public.list_open_offers()) -> 'items') i where i ->> 'offerId' = :'w6'),
  'with the server expiry, the mission''s vehicle type and the computed distance');
reset role;
select t.as_user(:'da');
set role authenticated;
select t.eq((select count(*)::int from jsonb_array_elements((public.list_open_offers()) -> 'items')), 0, 'a declined offer is not recovered');
reset role;
select t.as_user(:'p1');
set role authenticated;
select t.ok(t.err('select public.list_open_offers()') like 'driver_profile_missing%', 'a patient has no offers to list');
reset role;
select t.eq((select status from public.dispatch_waves where id = :'w6'), 'broadcasting', 'wave stays open while B may still accept');
select t.as_user(:'db');
set role authenticated;
select public.decline_offer(:'w6', 'other');
reset role;
select t.eq((select status from public.dispatch_waves where id = :'w6'), 'expired', 'all declined: wave closed at once');
select t.eq((select wave_number from t.wave(:'m6')), 2, 'all declined: next wave opened without waiting for expiry');
select t.ok(not exists (select 1 from public.dispatch_waves where mission_id = :'m6' and wave_number > 1 and eligible_driver_ids && array[:'da', :'db']::uuid[]),
  'drivers who declined are not re-offered the same mission');
select t.reset();

-- A decliner is free for other missions at once (not reserved by an offer they refused).
select t.mission() as m7 \gset
select public.dispatch_next_wave(:'m7');
select w.id as w7 from t.wave(:'m7') w \gset
select t.as_user(:'da');
set role authenticated;
select public.decline_offer(:'w7', 'other');
reset role;
select t.mission() as m8 \gset
select public.dispatch_next_wave(:'m8');
select t.ok((select eligible_driver_ids from t.wave(:'m8')) @> array[:'da']::uuid[], 'a driver who declined m7 is offered m8');
select t.reset();

-- ---------------------------------------------------------------------------
-- Offer timeout: server-side, then next candidate; an expired offer cannot be accepted
-- ---------------------------------------------------------------------------
select t.mission() as m9 \gset
select public.dispatch_next_wave(:'m9');
select w.id as w9 from t.wave(:'m9') w \gset
update public.dispatch_waves set created_at = now() - interval '20 seconds', expires_at = now() - interval '5 seconds' where id = :'w9';
select t.as_user(:'da');
set role authenticated;
select t.eq(t.err(format('select public.accept_offer(%L)', :'w9')), 'offer_expired', 'an expired offer cannot be accepted (no client timer involved)');
reset role;
select t.ok(public.dispatch_tick() >= 1, 'dispatch_tick processes the expired wave');
select t.eq((select status from public.dispatch_waves where id = :'w9'), 'expired', 'expired wave marked expired');
select t.eq((select wave_number from t.wave(:'m9')), 2, 'next wave opened after expiry');
select t.eq((select eligible_driver_ids from t.wave(:'m9')), array[:'de']::uuid[], 'next wave offers the next candidate');
select t.eq((select status from public.missions where id = :'m9'), 'requesting'::public.mission_status, 'mission keeps searching with an active dispatch attempt');
select t.reset();

-- No candidates at all: terminal NO_AMBULANCE_AVAILABLE at once, never an endless search.
update public.drivers set is_online = false;
select t.mission() as m10 \gset
select t.eq(public.dispatch_next_wave(:'m10'), 0, 'no candidate in any wave');
select t.eq((select status from public.missions where id = :'m10'), 'cancelled'::public.mission_status, 'mission ends');
select t.eq((select metadata ->> 'reason' from public.mission_events where mission_id = :'m10' order by seq desc limit 1), 'no_ambulance_available', 'with the no_ambulance_available reason');
update public.drivers set is_online = true, last_seen_at = now(), location_fixed_at = now();

-- ---------------------------------------------------------------------------
-- Cancellation during search and during an offer
-- ---------------------------------------------------------------------------
select t.mission() as m11 \gset
select public.dispatch_next_wave(:'m11');
select w.id as w11 from t.wave(:'m11') w \gset
select t.as_user(:'p1');
set role authenticated;
select t.eq((public.cancel_mission(:'m11', 'changed_mind')) ->> 'status', 'cancelled', 'patient cancels while an offer is open');
reset role;
select t.as_user(:'da');
set role authenticated;
select t.eq(t.err(format('select public.accept_offer(%L)', :'w11')), 'mission_cancelled', 'cancelled mission cannot become accepted (distinct code)');
select t.eq(t.err(format('select public.claim_emergency(%L)', :'m11')), 'mission_cancelled', 'nor claimed from the board');
reset role;
select t.eq((select status from public.missions where id = :'m11'), 'cancelled'::public.mission_status, 'mission stays cancelled');
select t.eq(public.dispatch_next_wave(:'m11'), -1, 'no new wave for a cancelled mission');

-- ---------------------------------------------------------------------------
-- Acceptance race: two sessions accept the same offer at once; exactly one wins
-- ---------------------------------------------------------------------------
select t.mission() as m12 \gset
select public.dispatch_next_wave(:'m12');
select w.id as w12 from t.wave(:'m12') w \gset
-- Two real sessions back to this database. dblink refuses password-less (trust) loopback logins for non-superusers, so the
-- default reconnects to the server's own network address with the local Supabase default password; override with
-- -v race_conn='host=... port=... user=... password=...'.
\if :{?race_conn}
\else
  select 'host=' || coalesce(host(inet_server_addr()), '127.0.0.1') || ' port=' || current_setting('port') || ' user=postgres password=postgres' as race_conn \gset
\endif
select extensions.dblink_connect('ra', :'race_conn' || ' dbname=' || current_database());
select extensions.dblink_connect('rb', :'race_conn' || ' dbname=' || current_database());
-- Session A accepts inside an open transaction (holding the mission lock); B's accept must wait, then lose.
select extensions.dblink_exec('ra', 'begin');
select s from extensions.dblink('ra', format($q$select set_config('request.jwt.claims', '{"sub":"%s","role":"authenticated"}', true), (public.accept_offer('%s')) ->> 'status'$q$, :'da', :'w12')) as x(c text, s text);
select extensions.dblink_send_query('rb', format($q$select set_config('request.jwt.claims', '{"sub":"%s","role":"authenticated"}', false), t.err('select public.accept_offer(''%s'')')$q$, :'db', :'w12'));
select pg_sleep(0.5);
select t.eq(extensions.dblink_is_busy('rb'), 1, 'B is blocked on the mission row lock while A is uncommitted');
select extensions.dblink_exec('ra', 'commit');
select t.eq((select e from extensions.dblink_get_result('rb') as x(c text, e text)), 'offer_taken', 'B loses the race with offer_taken');
select extensions.dblink_disconnect('ra');
select extensions.dblink_disconnect('rb');
select t.eq((select driver_id from public.missions where id = :'m12'), :'da'::uuid, 'exactly one driver is assigned');
select t.eq((select count(*)::int from public.mission_events where mission_id = :'m12' and event_type = 'DRIVER_ACCEPTED'), 1, 'exactly one DRIVER_ACCEPTED event');

-- The winner cannot take a second mission through the offer path either.
select t.mission() as m13 \gset
insert into public.dispatch_waves (mission_id, wave_number, radius_km, eligible_driver_ids, status, expires_at) values (:'m13', 1, 3, array[:'da']::uuid[], 'broadcasting', now() + interval '15 seconds');
select w.id as w13 from t.wave(:'m13') w \gset
select t.as_user(:'da');
set role authenticated;
select t.eq(t.err(format('select public.accept_offer(%L)', :'w13')), 'already_on_mission', 'a driver on a mission cannot accept another offer');
reset role;
update public.missions set status = 'completed', completed_at = now() where id = :'m12';
select t.reset();

-- ---------------------------------------------------------------------------
-- A driver abort long after creation re-dispatches instead of ending the search
-- ---------------------------------------------------------------------------
select t.mission(600) as m14 \gset
select public.dispatch_next_wave(:'m14');
select w.id as w14 from t.wave(:'m14') w \gset
select t.as_user(:'dd');
set role authenticated;
select t.eq((public.accept_offer(:'w14')) ->> 'status', 'en_route', 'D accepts a mission created 10 minutes ago');
select t.eq((public.transition_mission(:'m14', 'ABORT', '{"reason":"vehicle_breakdown"}')) ->> 'status', 'requesting', 'D aborts before pickup');
reset role;
select t.eq((select status from public.missions where id = :'m14'), 'requesting'::public.mission_status, 'mission is searching again, not ended as no_ambulance_available');
select t.ok((select search_started_at > now() - interval '1 second' from public.missions where id = :'m14'), 'the search window restarts at the release');
select t.eq((select round::int from t.wave(:'m14')), 2, 'a new dispatch round');
select t.eq((select wave_number from t.wave(:'m14')), 1, 'starting again from the smallest radius');
select t.ok(not ((select eligible_driver_ids from t.wave(:'m14')) @> array[:'dd']::uuid[]), 'the driver who aborted is not re-offered');
select t.ok((select eligible_driver_ids from t.wave(:'m14')) @> array[:'da']::uuid[], 'other free drivers are offered again');

-- A release with nobody else free right now keeps searching (board + window) instead of ending at once.
update public.drivers set is_online = false where id <> :'de';
select t.mission() as m15 \gset
select public.dispatch_next_wave(:'m15');
select t.eq((select eligible_driver_ids from t.wave(:'m15')), array[:'de']::uuid[], 'only E is free (wave 2)');
select w.id as w15 from t.wave(:'m15') w \gset
select t.as_user(:'de');
set role authenticated;
select public.accept_offer(:'w15');
select t.eq((public.transition_mission(:'m15', 'ABORT', '{"reason":"driver_backed_out"}')) ->> 'status', 'requesting', 'E releases; nobody else is free');
reset role;
select t.eq((select status from public.missions where id = :'m15'), 'requesting'::public.mission_status, 'the released request keeps searching for its window');
update public.missions set search_started_at = now() - interval '6 minutes' where id = :'m15';
select public.dispatch_tick();
select t.eq((select metadata ->> 'reason' from public.mission_events where mission_id = :'m15' order by seq desc limit 1), 'no_ambulance_available', 'and ends only when the window closes');
update public.drivers set is_online = true;

-- Invariant 6: no requesting mission is past its search window without being ended.
select public.dispatch_tick();
select t.ok(not exists (
  select 1 from public.missions m where m.status = 'requesting'
     and m.search_started_at + make_interval(secs => (public.dispatch_config() ->> 'searchTtlSeconds')::int) <= now()
), 'dispatch_tick leaves no requesting mission past its search window');

drop schema t cascade;
select 'ALL DISPATCH HARDENING CHECKS PASSED';
