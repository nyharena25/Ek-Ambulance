-- Phase G3: staff KYC review. approve_kyc/reject_kyc (20260928000001) stay the only code that changes KYC state and
-- stay locked to service_role; this migration adds a signed-in staff path to them, so review no longer needs the
-- Studio SQL editor.
--
-- Staff identity is granted the same way the driver role is: app_metadata.role = 'staff', which only service_role
-- can write. is_staff() reads auth.users rather than the JWT claim, so revoking the role takes effect at once
-- instead of at the next token refresh. profiles.role is untouched: handle_new_user maps any role other than
-- 'driver' to 'patient', so a staff account keeps an ordinary patient profile and can never pass the driver checks.
-- Grant / revoke (service_role or SQL editor only; the user signs in once by phone OTP first):
--   update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"staff"}' where phone = '91XXXXXXXXXX';
--   update auth.users set raw_app_meta_data = raw_app_meta_data - 'role' where phone = '91XXXXXXXXXX';
-- The review console is apps/admin.
--
-- Approval does NOT grant app_metadata.role = 'driver'. A driver already holds that role before they can apply
-- (upsert_driver_application requires it); approval sets is_verified, which gates going online. Unchanged here.
--
-- Safe to rerun: every object is create-or-replace / drop-if-exists, and grants are idempotent.

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select u.raw_app_meta_data ->> 'role' = 'staff' from auth.users u where u.id = (select auth.uid())), false);
$$;

create or replace function public._require_staff()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then perform public._fail('unauthenticated', 'PT401'); end if;
  if not public.is_staff() then perform public._fail('not_staff', 'PT403'); end if;
end;
$$;

-- "Required" means exactly what submit_kyc enforces; other uploaded slots are listed as they are.
create or replace function public.staff_list_kyc_applications(p_status text default 'pending_verification')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._require_staff();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'driverId', d.id,
             'phone', p.phone,
             'fullName', p.full_name,
             'kycStatus', d.kyc_status,
             'kycReference', d.kyc_reference,
             'ais125Type', d.ais125_type,
             'serviceZone', d.service_zone,
             'submittedAt', public.iso_utc(d.kyc_submitted_at),
             'reviewedAt', public.iso_utc(d.kyc_reviewed_at),
             'requiredUploaded', (select count(*) from public.driver_documents dd
                                   where dd.driver_id = d.id and dd.slot in ('arai_certificate', 'fitness_permit', 'vehicle_rc')),
             'requiredTotal', 3,
             'documentCount', (select count(*) from public.driver_documents dd where dd.driver_id = d.id))
           order by d.kyc_submitted_at nulls last, d.id)
      from public.drivers d
      left join public.profiles p on p.id = d.id
     where p_status is null or d.kyc_status = p_status), '[]'::jsonb);
end;
$$;

create or replace function public.staff_get_kyc_application(p_driver_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d public.drivers;
  p public.profiles;
  v public.driver_vehicles;
begin
  perform public._require_staff();
  select * into d from public.drivers where id = p_driver_id;
  if not found then perform public._fail('driver_not_found', 'PT404'); end if;
  select * into p from public.profiles where id = p_driver_id;
  select * into v from public.driver_vehicles where driver_id = p_driver_id and is_active;

  return jsonb_build_object(
    'driverId', d.id,
    'phone', p.phone,
    'fullName', p.full_name,
    'kycStatus', d.kyc_status,
    'kycReference', d.kyc_reference,
    'kycRejectReason', d.kyc_reject_reason,
    'submittedAt', public.iso_utc(d.kyc_submitted_at),
    'reviewedAt', public.iso_utc(d.kyc_reviewed_at),
    'isVerified', d.is_verified,
    'ais125Type', d.ais125_type,
    'serviceZone', d.service_zone,
    'licenseNumber', d.license_number,
    'dlExpiry', d.dl_expiry,
    'dlState', d.dl_state,
    'psvBadgeNumber', d.psv_badge_number,
    'emtLevel', d.emt_level,
    'emtCertId', d.emt_cert_id,
    'emtCouncil', d.emt_council,
    'emtExpiry', d.emt_expiry,
    'aclsCertified', d.acls_certified,
    'blsCertified', d.bls_certified,
    'vehicle', case when v.id is null then null else jsonb_build_object(
      'registrationNumber', v.registration_number,
      'makeModel', v.make_model,
      'manufactureYear', v.manufacture_year,
      'vin', v.vin,
      'ais125Type', v.ais125_type,
      'equipmentAttested', v.equipment_attested) end,
    'requiredSlots', jsonb_build_array('arai_certificate', 'fitness_permit', 'vehicle_rc'),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slot', dd.slot,
               'storagePath', dd.storage_path,
               'fileName', dd.file_name,
               'sizeBytes', dd.size_bytes,
               'mimeType', dd.mime_type,
               'status', dd.status,
               'rejectionReason', dd.rejection_reason,
               'uploadedAt', public.iso_utc(dd.uploaded_at),
               'reviewedAt', public.iso_utc(dd.reviewed_at)) order by dd.slot)
        from public.driver_documents dd where dd.driver_id = p_driver_id), '[]'::jsonb));
end;
$$;

-- The wrappers own the staff check; the state change itself stays in approve_kyc / reject_kyc.
create or replace function public.staff_approve_kyc(p_driver_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._require_staff();
  if p_driver_id = (select auth.uid()) then perform public._fail('cannot_review_own_application', 'PT403'); end if;
  return public.approve_kyc(p_driver_id, null);
end;
$$;

create or replace function public.staff_reject_kyc(p_driver_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._require_staff();
  if p_driver_id = (select auth.uid()) then perform public._fail('cannot_review_own_application', 'PT403'); end if;
  return public.reject_kyc(p_driver_id, btrim(p_reason));
end;
$$;

revoke execute on function public.is_staff(), public._require_staff(),
  public.staff_list_kyc_applications(text), public.staff_get_kyc_application(uuid),
  public.staff_approve_kyc(uuid), public.staff_reject_kyc(uuid, text) from public, anon, authenticated;
grant execute on function public.is_staff(), public.staff_list_kyc_applications(text), public.staff_get_kyc_application(uuid),
  public.staff_approve_kyc(uuid), public.staff_reject_kyc(uuid, text) to authenticated;
grant execute on function public.is_staff(), public._require_staff(),
  public.staff_list_kyc_applications(text), public.staff_get_kyc_application(uuid),
  public.staff_approve_kyc(uuid), public.staff_reject_kyc(uuid, text) to service_role;

-- Staff read any KYC document (for signed URLs, created with the staff member's own JWT). No write policy.
drop policy if exists kyc_docs_select_staff on storage.objects;
create policy kyc_docs_select_staff on storage.objects
  for select to authenticated
  using (bucket_id = 'driver-kyc-documents' and (select public.is_staff()));

-- get_driver_profile: add kycRejectReason so a rejected driver sees why. Otherwise identical to 20260924000005.
create or replace function public.get_driver_profile()
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
    'kycRejectReason', d.kyc_reject_reason,
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
