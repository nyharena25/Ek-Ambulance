-- Phase B, item 3: a legitimate KYC approval workflow. The audit's F28 finding was that nothing in this
-- repository could ever move a driver's kyc_status from 'pending_verification' to 'approved' - the schema
-- (drivers.kyc_status, driver_documents.status/reviewed_at) already supports the review states, but no RPC
-- existed to transition them. This is the MVP path the audit's migration plan named: an authorized operator
-- runs these two functions from the Supabase Studio SQL editor (or any service_role-authenticated caller),
-- reviewing the driver's uploaded driver_documents rows first. A full admin UI, if the product wants one
-- later, would call the same two functions rather than duplicating this logic.
--
-- Locked to service_role only - deliberately NOT `grant ... to authenticated`. Postgres grants EXECUTE on a
-- newly created function to PUBLIC by default (no ALTER DEFAULT PRIVILEGES changes that in this project's
-- migrations), which would let any signed-in driver call this and approve themselves; the explicit revoke
-- below closes that. auth.uid() is null under a service_role call (no end-user JWT), so unlike every other
-- RPC in this schema, authorization here is enforced entirely by who can EXECUTE the function, not by a
-- caller-identity check inside it.

create function public.approve_kyc(p_driver_id uuid, p_kyc_reference text default null)
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

create function public.reject_kyc(p_driver_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.drivers;
begin
  if coalesce(btrim(p_reason), '') = '' then perform public._fail('reason_required', 'PT422'); end if;
  select * into d from public.drivers where id = p_driver_id for update;
  if not found then perform public._fail('driver_not_found', 'PT404'); end if;
  if d.kyc_status <> 'pending_verification' then
    perform public._fail('not_pending_verification', 'PT409', d.kyc_status);
  end if;

  -- is_verified must clear alongside kyc_status (drivers_verified_matches_kyc), and a driver who was
  -- somehow online cannot remain so once unverified (drivers_online_requires_verified) - both constraints
  -- are satisfied by the same statement rather than relying on a later presence write to catch it.
  update public.drivers
     set kyc_status = 'rejected',
         is_verified = false,
         is_online = false,
         kyc_reviewed_at = now(),
         kyc_reject_reason = p_reason
   where id = p_driver_id
  returning * into d;

  update public.driver_documents
     set status = 'rejected', reviewed_at = now(), rejection_reason = p_reason
   where driver_id = p_driver_id and status = 'uploaded';

  return jsonb_build_object('ok', true, 'driverId', d.id, 'kycStatus', d.kyc_status, 'kycRejectReason', d.kyc_reject_reason);
end;
$$;

revoke execute on function public.approve_kyc(uuid, text) from public, anon, authenticated;
revoke execute on function public.reject_kyc(uuid, text) from public, anon, authenticated;
grant execute on function public.approve_kyc(uuid, text) to service_role;
grant execute on function public.reject_kyc(uuid, text) to service_role;
