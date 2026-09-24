-- Storage buckets and folder-level policies (DATA_AND_SYNC_SPECIFICATION.md 5.4). Generated for manual
-- `supabase db push`; not applied by tooling. No bucket is public. Size limit and MIME list are bucket
-- settings, enforced by Storage rather than by the app.
--
-- Not created: `medical-prescriptions`. No UI produces those attachments and D-7's recommended default is to
-- drop the bucket until the product adds an attach step.
--
-- Uploads go straight from the device with the user's JWT. The receipts and emr-handoffs buckets have no
-- client insert/update/delete policy at all: service_role bypasses RLS, so the server generates and writes
-- those files. Hospital access to an EMR handoff is a time-limited signed URL, never a standing policy.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('driver-kyc-documents', 'driver-kyc-documents', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png']),
  ('receipts',             'receipts',             false, 1048576, array['application/pdf']),
  ('emr-handoffs',         'emr-handoffs',         false, 2097152, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- driver-kyc-documents: path {driver_id}/{slot}/{uuid}.{ext}. Read own always; write own only while the KYC
-- application is still editable (draft or rejected).
create policy kyc_docs_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'driver-kyc-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy kyc_docs_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'driver-kyc-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select exists (select 1 from public.drivers d where d.id = (select auth.uid()) and d.kyc_status in ('draft', 'rejected')))
  );

create policy kyc_docs_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'driver-kyc-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select exists (select 1 from public.drivers d where d.id = (select auth.uid()) and d.kyc_status in ('draft', 'rejected')))
  )
  with check (bucket_id = 'driver-kyc-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy kyc_docs_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'driver-kyc-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select exists (select 1 from public.drivers d where d.id = (select auth.uid()) and d.kyc_status in ('draft', 'rejected')))
  );

-- receipts, emr-handoffs: path {patient_id}/{mission_id}.pdf. The patient reads their own; nobody writes from a client.
create policy receipts_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy emr_handoffs_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'emr-handoffs' and (storage.foldername(name))[1] = (select auth.uid())::text);
