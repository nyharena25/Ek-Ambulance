-- Behavioural checks for staff KYC review (migration 20260929000001, Phase G3).
--
-- LOCAL database only. Everything runs in one transaction that is rolled back, so no fixture survives:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -q -f supabase/tests/kyc_admin.behaviour.sql
-- Prints `ok ...` per check and `ALL KYC ADMIN CHECKS PASSED`.
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

begin;

create schema kt;
grant usage on schema kt to authenticated, anon;
create function kt.eq(actual anyelement, expected anyelement, msg text) returns text language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FAIL %: expected %, got %', msg, expected, actual; end if;
  return 'ok ' || msg;
end $$;
create function kt.raises(stmt text, state text, msg text) returns text language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlstate <> state then raise exception 'FAIL %: expected SQLSTATE % got % (%)', msg, state, sqlstate, sqlerrm; end if;
    return 'ok ' || msg;
  end;
  raise exception 'FAIL %: expected SQLSTATE % but the statement succeeded', msg, state;
end $$;
grant execute on all functions in schema kt to authenticated, anon;

\set pat '00000000-0000-4000-8000-00000000f0a1'
\set d1  '00000000-0000-4000-8000-00000000f0b1'
\set d2  '00000000-0000-4000-8000-00000000f0b2'
\set st  '00000000-0000-4000-8000-00000000f0c1'
\set jwt_pat '{"sub":"00000000-0000-4000-8000-00000000f0a1","role":"authenticated"}'
\set jwt_d1  '{"sub":"00000000-0000-4000-8000-00000000f0b1","role":"authenticated"}'
\set jwt_d2  '{"sub":"00000000-0000-4000-8000-00000000f0b2","role":"authenticated"}'
\set jwt_st  '{"sub":"00000000-0000-4000-8000-00000000f0c1","role":"authenticated"}'

insert into auth.users (id, phone, raw_app_meta_data, raw_user_meta_data, aud, role) values
  (:'pat', '919876590001', '{}',                '{"role":"staff"}', 'authenticated', 'authenticated'),
  (:'d1',  '919876590011', '{"role":"driver"}', '{}',               'authenticated', 'authenticated'),
  (:'d2',  '919876590012', '{"role":"driver"}', '{}',               'authenticated', 'authenticated'),
  (:'st',  '919876590021', '{"role":"staff"}',  '{}',               'authenticated', 'authenticated');

-- Two submitted applications, built as submit_kyc leaves them.
insert into public.drivers (id, license_number, ais125_type, kyc_status, kyc_submitted_at, kyc_reference) values
  (:'d1', 'KT-DL-1', 'TYPE_C_BLS', 'pending_verification', now(), 'EK-KYC-KT0001'),
  (:'d2', 'KT-DL-2', 'TYPE_C_BLS', 'pending_verification', now(), 'EK-KYC-KT0002');
insert into public.driver_documents (driver_id, slot, storage_path, file_name)
select d, s, d::text || '/' || s || '/x.pdf', 'x.pdf'
  from unnest(array[:'d1', :'d2']::uuid[]) d, unnest(array['arai_certificate', 'fitness_permit', 'vehicle_rc']) s;
insert into storage.objects (bucket_id, name)
select 'driver-kyc-documents', storage_path from public.driver_documents where driver_id in (:'d1', :'d2');

select kt.eq((select role from public.profiles where id = :'st'), 'patient', 'staff keeps a patient profile (never the driver role)');
select kt.eq((select role from public.profiles where id = :'pat'), 'patient', 'staff in client-controlled user_metadata is ignored');

-- ---------------------------------------------------------------------------
-- anon
-- ---------------------------------------------------------------------------
set role anon;
select kt.raises($$select public.staff_list_kyc_applications()$$, '42501', 'anon cannot call staff_list_kyc_applications');
reset role;

-- ---------------------------------------------------------------------------
-- Patient (also carries "staff" in user_metadata, which must not count)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', :'jwt_pat', true);
set role authenticated;
select kt.eq(public.is_staff(), false, 'patient is not staff');
select kt.raises($$select public.staff_list_kyc_applications()$$, 'PT403', 'patient cannot list applications');
select kt.raises(format($$select public.staff_get_kyc_application(%L)$$, :'d1'), 'PT403', 'patient cannot inspect an application');
select kt.raises(format($$select public.staff_approve_kyc(%L)$$, :'d1'), 'PT403', 'patient cannot approve via staff RPC');
select kt.raises(format($$select public.staff_reject_kyc(%L, 'x')$$, :'d1'), 'PT403', 'patient cannot reject via staff RPC');
select kt.raises(format($$select public.approve_kyc(%L)$$, :'d1'), '42501', 'patient cannot call approve_kyc directly');
select kt.raises(format($$select public.reject_kyc(%L, 'x')$$, :'d1'), '42501', 'patient cannot call reject_kyc directly');
select kt.eq((select count(*)::int from storage.objects where bucket_id = 'driver-kyc-documents'), 0, 'patient reads no KYC objects');
select kt.eq((select count(*)::int from public.driver_documents), 0, 'patient reads no driver_documents rows');
select kt.raises(format($$update auth.users set raw_app_meta_data = '{"role":"driver"}' where id = %L$$, :'pat'), '42501', 'patient cannot grant itself the driver role');
select kt.raises(format($$update public.profiles set role = 'driver' where id = %L$$, :'pat'), '42501', 'patient cannot write profiles.role');
reset role;

-- ---------------------------------------------------------------------------
-- Driver d2 (pending)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', :'jwt_d2', true);
set role authenticated;
select kt.raises($$select public.staff_list_kyc_applications()$$, 'PT403', 'driver cannot list applications');
select kt.raises(format($$select public.staff_get_kyc_application(%L)$$, :'d1'), 'PT403', 'driver cannot inspect another application');
select kt.raises(format($$select public.staff_approve_kyc(%L)$$, :'d2'), 'PT403', 'driver cannot approve (own) application');
select kt.raises(format($$select public.staff_reject_kyc(%L, 'x')$$, :'d1'), 'PT403', 'driver cannot reject another application');
select kt.raises(format($$select public.approve_kyc(%L)$$, :'d2'), '42501', 'driver cannot call approve_kyc directly');
select kt.raises(format($$update public.drivers set kyc_status = 'approved' where id = %L$$, :'d2'), '42501', 'driver cannot write kyc_status');
select kt.raises(format($$update auth.users set raw_app_meta_data = '{"role":"staff"}' where id = %L$$, :'d2'), '42501', 'driver cannot grant itself staff');
select kt.eq((select count(*)::int from storage.objects where bucket_id = 'driver-kyc-documents' and name not like :'d2' || '/%'), 0, 'driver reads only its own KYC objects');
reset role;

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', :'jwt_st', true);
set role authenticated;
select kt.eq(public.is_staff(), true, 'staff is staff');
select kt.eq((select count(*)::int from jsonb_array_elements(public.staff_list_kyc_applications()) a
               where a ->> 'driverId' in (:'d1', :'d2')), 2, 'staff lists both pending applications');
select kt.eq((select (a ->> 'requiredUploaded')::int from jsonb_array_elements(public.staff_list_kyc_applications()) a
               where a ->> 'driverId' = :'d1'), 3, 'list reports required-document completion');
select kt.eq((select a ->> 'phone' from jsonb_array_elements(public.staff_list_kyc_applications()) a
               where a ->> 'driverId' = :'d1'), '+919876590011', 'list carries the real phone');
select kt.eq(jsonb_array_length(public.staff_get_kyc_application(:'d1') -> 'documents'), 3, 'staff inspects the document rows');
select kt.raises($$select public.staff_get_kyc_application(gen_random_uuid())$$, 'PT404', 'unknown application is PT404');
select kt.eq((select count(*)::int from storage.objects where bucket_id = 'driver-kyc-documents' and name like '%f0b%'), 6, 'staff reads every KYC object (signed URLs)');
select kt.raises(format($$insert into storage.objects (bucket_id, name) values ('driver-kyc-documents', %L)$$, :'d1' || '/vehicle_rc/y.pdf'), '42501', 'staff cannot write KYC objects');
select kt.raises(format($$update public.drivers set kyc_status = 'approved' where id = %L$$, :'d1'), '42501', 'staff has no direct write on drivers either');
select kt.raises(format($$select public.approve_kyc(%L)$$, :'d1'), '42501', 'staff cannot bypass the wrapper to approve_kyc');
select kt.raises(format($$select public.staff_approve_kyc(%L)$$, :'st'), 'PT403', 'staff cannot review their own id');

-- approve d1
select kt.eq(public.staff_approve_kyc(:'d1') ->> 'kycStatus', 'approved', 'staff approves a pending application');
select kt.raises(format($$select public.staff_approve_kyc(%L)$$, :'d1'), 'PT409', 'second approval is refused (not_pending_verification)');
select kt.raises(format($$select public.staff_reject_kyc(%L, 'late')$$, :'d1'), 'PT409', 'approved application cannot then be rejected');

-- reject d2
select kt.raises(format($$select public.staff_reject_kyc(%L, '   ')$$, :'d2'), 'PT422', 'rejection needs a reason');
select kt.eq(public.staff_reject_kyc(:'d2', '  RC is illegible  ') ->> 'kycRejectReason', 'RC is illegible', 'staff rejects with a trimmed reason');
reset role;

select kt.eq((select is_verified from public.drivers where id = :'d1'), true, 'approval sets is_verified');
select kt.eq((select count(*)::int from public.driver_documents where driver_id = :'d1' and status = 'accepted'), 3, 'approval accepts the documents');
select kt.eq((select raw_app_meta_data ->> 'role' from auth.users where id = :'d1'), 'driver', 'approval leaves the (already server-granted) driver role as is');
select kt.eq((select count(*)::int from public.driver_documents where driver_id = :'d2' and status = 'rejected'), 3, 'rejection marks the documents rejected');

-- The drivers see the real outcome through get_driver_profile.
select set_config('request.jwt.claims', :'jwt_d1', true);
set role authenticated;
select kt.eq((public.get_driver_profile()) ->> 'kycStatus', 'approved', 'approved driver sees approved');
select kt.eq((public.get_driver_profile()) ->> 'isVerified', 'true', 'approved driver is verified');
reset role;
select set_config('request.jwt.claims', :'jwt_d2', true);
set role authenticated;
select kt.eq((public.get_driver_profile()) ->> 'kycStatus', 'rejected', 'rejected driver sees rejected');
select kt.eq((public.get_driver_profile()) ->> 'kycRejectReason', 'RC is illegible', 'rejected driver sees the reason');
select kt.eq((public.get_driver_profile()) ->> 'regulatedEditable', 'true', 'rejected application is editable again');
reset role;

-- Revocation is immediate (auth.users, not a JWT claim that lives until refresh).
update auth.users set raw_app_meta_data = '{}' where id = :'st';
select set_config('request.jwt.claims', :'jwt_st', true);
set role authenticated;
select kt.raises($$select public.staff_list_kyc_applications()$$, 'PT403', 'revoked staff loses access at once');
select kt.eq((select count(*)::int from storage.objects where bucket_id = 'driver-kyc-documents' and name like '%f0b%'), 0, 'revoked staff loses document access at once');
reset role;

-- ---------------------------------------------------------------------------
-- G3.1 document integrity (migration 20260929000002). Staff role restored for the approval cases.
-- ---------------------------------------------------------------------------
update auth.users set raw_app_meta_data = '{"role":"staff"}' where id = :'st';
\set d3 '00000000-0000-4000-8000-00000000f0b3'
\set jwt_d3 '{"sub":"00000000-0000-4000-8000-00000000f0b3","role":"authenticated"}'
insert into auth.users (id, phone, raw_app_meta_data, raw_user_meta_data, aud, role) values
  (:'d3', '919876590013', '{"role":"driver"}', '{}', 'authenticated', 'authenticated');
insert into public.drivers (id, license_number, ais125_type, dl_expiry) values (:'d3', 'KT-DL-3', 'TYPE_C_BLS', current_date + 400);
insert into public.driver_vehicles (driver_id, registration_number, ais125_type) values (:'d3', 'KTDL0003', 'TYPE_C_BLS');
insert into public.driver_documents (driver_id, slot, storage_path)
select :'d3', s, :'d3' || '/' || s || '/v1.pdf' from unnest(array['arai_certificate', 'fitness_permit', 'vehicle_rc']) s;

-- The file behind a row must exist: the row alone is not a document.
select set_config('request.jwt.claims', :'jwt_d3', true);
set role authenticated;
select kt.raises($$select public.submit_kyc()$$, 'PT422', 'submit refused when the rows have no uploaded files');
insert into storage.objects (bucket_id, name) select 'driver-kyc-documents', storage_path from public.driver_documents where driver_id = :'d3';
-- Case D: normal first submission.
select kt.eq(public.submit_kyc() ->> 'kycStatus', 'pending_verification', 'D: draft with valid documents submits');
reset role;

-- Case C: approval cannot bypass an invalid document (a rejected required document on a pending application).
update public.driver_documents set status = 'rejected' where driver_id = :'d3' and slot = 'fitness_permit';
select set_config('request.jwt.claims', :'jwt_st', true);
set role authenticated;
select kt.raises(format($$select public.staff_approve_kyc(%L)$$, :'d3'), 'PT409', 'C: approval refused while a required document is rejected');
reset role;
select kt.raises(format($$select public.approve_kyc(%L)$$, :'d3'), 'PT409', 'C: approve_kyc itself refuses (not only the staff wrapper)');
select kt.eq((select kyc_status from public.drivers where id = :'d3'), 'pending_verification', 'C: application unchanged by the refused approval');
-- (the trigger resets status to 'uploaded' when the path changes; the file at the new path does not exist)
update public.driver_documents set storage_path = :'d3' || '/fitness_permit/missing.pdf' where driver_id = :'d3' and slot = 'fitness_permit';
select kt.raises(format($$select public.approve_kyc(%L)$$, :'d3'), 'PT409', 'C: approval refused when a required file is not in Storage');
update public.driver_documents set storage_path = :'d3' || '/fitness_permit/v1.pdf' where driver_id = :'d3' and slot = 'fitness_permit';

-- Staff rejects; every uploaded document becomes rejected.
select set_config('request.jwt.claims', :'jwt_st', true);
set role authenticated;
select kt.eq(public.staff_reject_kyc(:'d3', 'Fitness permit expired') ->> 'kycStatus', 'rejected', 'staff rejects d3');
reset role;

-- Case A: rejected documents cannot be resubmitted as they are.
select set_config('request.jwt.claims', :'jwt_d3', true);
set role authenticated;
select kt.raises($$select public.submit_kyc()$$, 'PT422', 'A: resubmission refused while documents are still rejected');
select kt.raises(format($$update public.driver_documents set status = 'uploaded' where driver_id = %L$$, :'d3'), '42501', 'A: driver cannot clear a rejection by writing status');
-- Pointing a row at a file that was never uploaded resets the status (trigger) but still does not count.
update public.driver_documents set storage_path = :'d3' || '/vehicle_rc/never-uploaded.pdf' where slot = 'vehicle_rc';
select kt.raises($$select public.submit_kyc()$$, 'PT422', 'A: a path with no uploaded file does not count as a replacement');

-- Case B: real replacements (upload, then point the row at it - the driver app's sequence) allow resubmission.
insert into storage.objects (bucket_id, name) values
  ('driver-kyc-documents', :'d3' || '/arai_certificate/v2.pdf'),
  ('driver-kyc-documents', :'d3' || '/fitness_permit/v2.pdf'),
  ('driver-kyc-documents', :'d3' || '/vehicle_rc/v2.pdf');
update public.driver_documents set storage_path = driver_id::text || '/' || slot || '/v2.pdf';
select kt.eq((select string_agg(distinct status, ',') from public.driver_documents), 'uploaded', 'B: replacements reset to uploaded');
select kt.eq(public.submit_kyc() ->> 'kycStatus', 'pending_verification', 'B: resubmission after replacing documents');
reset role;

-- Case E: normal approval.
select set_config('request.jwt.claims', :'jwt_st', true);
set role authenticated;
select kt.eq(public.staff_approve_kyc(:'d3') ->> 'kycStatus', 'approved', 'E: pending with valid documents is approved');
reset role;
select kt.eq((select string_agg(distinct status, ',') from public.driver_documents where driver_id = :'d3'), 'accepted', 'E: approved application has only accepted documents');

select 'ALL KYC ADMIN CHECKS PASSED';
rollback;
