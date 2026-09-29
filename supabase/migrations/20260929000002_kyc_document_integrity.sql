-- Phase G3.1: KYC document integrity. submit_kyc counted required document rows whatever their status, so a rejected
-- driver could resubmit without replacing anything, and approve_kyc then approved an application whose documents
-- stayed 'rejected' (it only accepts rows still 'uploaded').
--
-- Invariant, enforced by BOTH submit_kyc and approve_kyc through one helper: every required slot has a document
-- whose status is not 'rejected' and whose file really exists in the driver-kyc-documents bucket. A replacement is
-- recognised by the existing driver_documents_reset_review trigger (a new storage_path resets status to 'uploaded');
-- the object check stops that reset from being triggered by pointing the row at a file that was never uploaded.
--
-- No existing row is changed. Safe to rerun: create-or-replace only; grants are idempotent.
-- Pre-existing records that violate the invariant are left as they are and must be reviewed by hand:
--   select d.id, d.kyc_status from public.drivers d
--    where d.kyc_status in ('pending_verification', 'approved') and not public._kyc_required_documents_valid(d.id);

create or replace function public._kyc_required_documents_valid(p_driver_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) = 3
    from public.driver_documents dd
   where dd.driver_id = p_driver_id
     and dd.slot in ('arai_certificate', 'fitness_permit', 'vehicle_rc')
     and dd.status in ('uploaded', 'accepted')
     and exists (select 1 from storage.objects o where o.bucket_id = 'driver-kyc-documents' and o.name = dd.storage_path);
$$;
revoke execute on function public._kyc_required_documents_valid(uuid) from public, anon, authenticated;
grant execute on function public._kyc_required_documents_valid(uuid) to service_role;

-- submit_kyc: identical to 20260924000003 except the document check.
create or replace function public.submit_kyc()
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
  -- G3.1: a rejected document (or a row whose file was never uploaded) must be replaced before resubmitting.
  if not public._kyc_required_documents_valid(v_uid) then perform public._fail('documents_invalid', 'PT422'); end if;
  v_ref := 'EK-KYC-' || lpad(nextval('public.kyc_reference_seq')::text, 6, '0');
  update public.drivers
     set kyc_status = 'pending_verification', kyc_submitted_at = now(), kyc_reference = coalesce(kyc_reference, v_ref),
         kyc_reject_reason = null
   where id = v_uid
  returning * into d;
  return jsonb_build_object('ok', true, 'kycStatus', d.kyc_status, 'kycReference', d.kyc_reference, 'submittedAt', public.iso_utc(d.kyc_submitted_at));
end;
$$;

-- approve_kyc: identical to 20260928000001 except the document check. The database refuses, not just the console.
create or replace function public.approve_kyc(p_driver_id uuid, p_kyc_reference text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.drivers;
begin
  select * into d from public.drivers where id = p_driver_id for update;
  if not found then perform public._fail('driver_not_found', 'PT404'); end if;
  if d.kyc_status <> 'pending_verification' then
    perform public._fail('not_pending_verification', 'PT409', d.kyc_status);
  end if;
  if not public._kyc_required_documents_valid(p_driver_id) then perform public._fail('documents_invalid', 'PT409'); end if;

  update public.drivers
     set kyc_status = 'approved',
         is_verified = true,
         kyc_reviewed_at = now(),
         kyc_reject_reason = null,
         kyc_reference = coalesce(p_kyc_reference, d.kyc_reference)
   where id = p_driver_id
  returning * into d;

  -- Mark every document the driver submitted for this cycle as reviewed; a document uploaded again after
  -- approval resets to 'uploaded' on its own (driver_documents_reset_review trigger), so this does not need
  -- to special-case a later re-upload.
  update public.driver_documents
     set status = 'accepted', reviewed_at = now(), rejection_reason = null
   where driver_id = p_driver_id and status = 'uploaded';

  return jsonb_build_object('ok', true, 'driverId', d.id, 'kycStatus', d.kyc_status, 'kycReviewedAt', public.iso_utc(d.kyc_reviewed_at));
end;
$$;

-- create or replace keeps existing grants; restated so a fresh database ends in the same state.
revoke execute on function public.approve_kyc(uuid, text) from public, anon, authenticated;
grant execute on function public.approve_kyc(uuid, text) to service_role;
grant execute on function public.submit_kyc() to authenticated;
