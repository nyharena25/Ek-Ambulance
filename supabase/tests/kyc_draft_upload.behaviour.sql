-- Behavioural checks for the driver application's draft-before-upload order (no migration change: this pins the
-- existing policies the driver app relies on). Every KYC write policy (driver-kyc-documents objects,
-- driver_documents, driver_vehicles) requires the caller's drivers row in draft/rejected, so the app creates that
-- draft with upsert_driver_application before the first upload - and the draft must never be dispatchable.
--
-- LOCAL database only. Everything runs in one transaction that is rolled back, so no fixture survives:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -q -f supabase/tests/kyc_draft_upload.behaviour.sql
-- Prints `ok ...` per check and `ALL KYC DRAFT UPLOAD CHECKS PASSED`.
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

begin;

create schema kd;
grant usage on schema kd to authenticated, anon;
create function kd.eq(actual anyelement, expected anyelement, msg text) returns text language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FAIL %: expected %, got %', msg, expected, actual; end if;
  return 'ok ' || msg;
end $$;
create function kd.raises(stmt text, state text, msg text) returns text language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlstate <> state then raise exception 'FAIL %: expected SQLSTATE % got % (%)', msg, state, sqlstate, sqlerrm; end if;
    return 'ok ' || msg;
  end;
  raise exception 'FAIL %: expected SQLSTATE % but the statement succeeded', msg, state;
end $$;
grant execute on all functions in schema kd to authenticated, anon;

\set pat '00000000-0000-4000-8000-00000000d0a1'
\set drv '00000000-0000-4000-8000-00000000d0b1'
\set jwt_drv '{"sub":"00000000-0000-4000-8000-00000000d0b1","role":"authenticated"}'
\set obj '00000000-0000-4000-8000-00000000d0b1/commercial_dl/00000000-0000-4000-8000-0000000000f1.png'

insert into auth.users (id, phone, raw_app_meta_data, raw_user_meta_data, aud, role) values
  (:'pat', '919876580001', '{}',                '{}', 'authenticated', 'authenticated'),
  (:'drv', '919876580011', '{"role":"driver"}', '{}', 'authenticated', 'authenticated');

select kd.eq((select role from public.profiles where id = :'drv'), 'driver', 'driver-role profile exists');
select kd.eq((select count(*)::int from public.drivers where id = :'drv'), 0, 'no drivers row before the application starts');

-- ---------------------------------------------------------------------------
-- 1. Driver-role user with no drivers row cannot upload (the device failure: Storage 403 "new row violates RLS").
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', :'jwt_drv', true);
set role authenticated;
select kd.raises(format($$insert into storage.objects (bucket_id, name) values ('driver-kyc-documents', %L)$$, :'obj'),
  '42501', 'no drivers row: KYC object upload refused');
select kd.raises(format($$insert into public.driver_documents (driver_id, slot, storage_path, file_name) values (%L, 'commercial_dl', %L, 'dl.png')$$, :'drv', :'obj'),
  '42501', 'no drivers row: driver_documents insert refused');

-- ---------------------------------------------------------------------------
-- 2. The Step 1 draft (the app's exact field subset), then the same upload is allowed.
-- ---------------------------------------------------------------------------
select kd.eq(public.upsert_driver_application(jsonb_build_object(
  'licenseNumber', 'UP1620190012345', 'ais125Type', 'TYPE_B_PTA', 'dlExpiry', '2030-08-14',
  'dlState', 'Uttar Pradesh', 'psvBadgeNumber', 'PSV-4411')) ->> 'kycStatus', 'draft', 'Step 1 draft created via upsert_driver_application');

insert into storage.objects (bucket_id, name) values ('driver-kyc-documents', :'obj');
select kd.eq((select count(*)::int from storage.objects where bucket_id = 'driver-kyc-documents' and name = :'obj'), 1,
  'draft exists: upload allowed, and the owner can read the created object back (SELECT policy)');
insert into public.driver_documents (driver_id, slot, storage_path, file_name, size_bytes, mime_type)
values (:'drv', 'commercial_dl', :'obj', 'dl.png', 2048, 'image/png');
select kd.eq((select count(*)::int from public.driver_documents where driver_id = :'drv'), 1, 'draft exists: driver_documents insert allowed');

-- The final Submit calls the same RPC again with the full application: it updates the draft in place.
select kd.eq(public.upsert_driver_application(jsonb_build_object(
  'licenseNumber', 'UP1620190012345', 'ais125Type', 'TYPE_C_BLS', 'dlExpiry', '2030-08-14', 'dlState', 'Uttar Pradesh',
  'psvBadgeNumber', 'PSV-4411', 'emtLevel', 'EMT_B', 'emtNumber', 'HSSC-1', 'emtCouncil', 'HSSC')) ->> 'kycStatus', 'draft',
  'final values overwrite the draft');
reset role;
select kd.eq((select ais125_type::text from public.drivers where id = :'drv'), 'TYPE_C_BLS', 'the final type replaced the draft type');

-- ---------------------------------------------------------------------------
-- 3. The draft can never go online.
-- ---------------------------------------------------------------------------
select kd.eq((select kyc_status || '/' || is_verified || '/' || is_online from public.drivers where id = :'drv'), 'draft/false/false',
  'draft is unverified and offline');
set role authenticated;
select kd.raises($$select public.set_driver_presence(true, 28.5355, 77.3910)$$, 'PT403', 'draft driver cannot go online (not_verified)');
select kd.raises($$select public.list_nearby_emergencies()$$, 'PT403', 'draft driver cannot see the booking board');
reset role;
select kd.raises(format($$update public.drivers set is_online = true where id = %L$$, :'drv'), '23514',
  'even a direct write cannot put an unverified driver online (drivers_online_requires_verified)');

-- ---------------------------------------------------------------------------
-- 4. The draft is never dispatch-eligible, even with a fresh position right at the pickup.
-- ---------------------------------------------------------------------------
update public.drivers
   set current_location = extensions.st_geogfromtext('SRID=4326;POINT(77.3910 28.5355)'), last_seen_at = now()
 where id = :'drv';
create temp table kd_mission on commit drop as
with m as (
  insert into public.missions (patient_id, urgency, vehicle_type, pickup_location, jurisdiction, pickup_address, triage, idempotency_key)
  values (:'pat', 'CAT_1_IMMEDIATE', 'TYPE_C_BLS', extensions.st_geogfromtext('SRID=4326;POINT(77.3910 28.5355)'), 'DL', 'KD pickup', '{}', gen_random_uuid())
  returning id)
select id from m;
select public.dispatch_next_wave(id) from kd_mission \g /dev/null
select kd.eq((select count(*)::int from public.dispatch_waves w where w.mission_id = (select id from kd_mission)), 3,
  'dispatch ran every wave for a matching mission at the draft driver''s position');
select kd.eq((select count(*)::int from public.dispatch_waves w
               where w.mission_id = (select id from kd_mission) and :'drv'::uuid = any (w.eligible_driver_ids)), 0,
  'draft driver is in no dispatch wave');

select 'ALL KYC DRAFT UPLOAD CHECKS PASSED';
rollback;
