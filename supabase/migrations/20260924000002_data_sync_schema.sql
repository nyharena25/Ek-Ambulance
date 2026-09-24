-- Data & sync schema (DATA_AND_SYNC_SPECIFICATION.md section 5). Generated for manual `supabase db push`; not applied by tooling.
-- Additive to 20260924000000 / 20260924000001: safe on populated tables (new NOT NULL columns are backfilled first)
-- and it never rewrites those files. Same conventions: (select auth.uid()) policies, `to authenticated` only,
-- column-level grants, server-authoritative writes.
set search_path to public, extensions;

-- ---------------------------------------------------------------------------
-- profiles (5.3.1)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column preferred_language text not null default 'en' check (preferred_language in ('en', 'hi')),
  add column anonymised_at      timestamptz;

-- dpdp_consent_at was client-writable, so it was worthless as evidence; consent lives in consent_records.
revoke update (dpdp_consent_at) on public.profiles from authenticated;
grant update (preferred_language) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- drivers (5.3.2)
-- ---------------------------------------------------------------------------
alter table public.drivers
  add column dl_expiry          date,
  add column dl_state           text,
  add column psv_badge_number   text,
  add column emt_level          text check (emt_level in ('EMT_P', 'EMT_A', 'EMT_B', 'FMR')),
  add column emt_council        text,
  add column emt_expiry         date,
  add column acls_certified     boolean not null default false,
  add column bls_certified      boolean not null default false,
  add column kyc_status         text not null default 'draft'
    check (kyc_status in ('draft', 'pending_verification', 'approved', 'rejected')),
  add column kyc_reference      text unique,
  add column kyc_submitted_at   timestamptz,
  add column kyc_reviewed_at    timestamptz,
  add column kyc_reject_reason  text,
  add column last_seen_at       timestamptz;

-- Backfill before the constraint: rows that were already verified are, by definition, approved.
update public.drivers set kyc_status = 'approved' where is_verified and kyc_status <> 'approved';
alter table public.drivers
  add constraint drivers_verified_matches_kyc check (is_verified = (kyc_status = 'approved'));

-- Presence moves server-side (R-05): a client could otherwise spoof its position or push one
-- through PostgREST every few seconds. Presence is written by public.set_driver_presence().
revoke update (is_online, current_location) on public.drivers from authenticated;
drop policy drivers_update_own on public.drivers;

-- ---------------------------------------------------------------------------
-- hospitals (5.3.3)
-- ---------------------------------------------------------------------------
alter table public.hospitals
  add column name_hi                text,
  add column category               text check (category in ('GOVERNMENT', 'PRIVATE')),
  add column trauma_bays_available  integer not null default 0 check (trauma_bays_available >= 0),
  add column ventilators_ready      integer not null default 0 check (ventilators_ready >= 0),
  add column inbound_count          integer not null default 0 check (inbound_count >= 0),
  add column specialities           text[] not null default '{}',
  add column specialities_hi        text[] not null default '{}',
  add column capacity_updated_at    timestamptz,
  -- G-22: one selectable rule for every client: is_active and available_capacity > 0.
  add column available_capacity     integer generated always as (total_capacity - held_capacity) stored;

-- ---------------------------------------------------------------------------
-- jurisdictions (5.3.9). Deliberately NOT seeded: the repository has no authoritative boundary
-- data, and seeding the client bounding boxes would re-create G-06 as "authoritative".
-- Until boundary rows are loaded, public.create_mission raises `jurisdictions_not_loaded`.
-- ---------------------------------------------------------------------------
create table public.jurisdictions (
  zone               public.jurisdiction_zone primary key,
  name               text not null,
  boundary           extensions.geography(MultiPolygon, 4326) not null,
  statutory_order_ref text not null,
  tariff_version     text not null
);
create index idx_jurisdictions_boundary on public.jurisdictions using gist (boundary);

-- ---------------------------------------------------------------------------
-- missions (5.3.4)
-- ---------------------------------------------------------------------------
create sequence public.mission_display_seq;

alter table public.missions
  add column display_ref           text,
  add column idempotency_key       uuid not null default gen_random_uuid(),
  add column jurisdiction          public.jurisdiction_zone,
  add column district              text,
  add column pickup_address        text,
  add column distance_km           numeric(6, 2) check (distance_km >= 0),
  add column duration_min          integer check (duration_min >= 0),
  add column route_polyline        text,
  add column triage                jsonb not null default '{}'::jsonb,
  add column state_version         integer not null default 0,
  add column accepted_at           timestamptz,
  add column arrived_scene_at      timestamptz,
  add column onboard_at            timestamptz,
  add column arrived_hospital_at   timestamptz,
  add column completed_at          timestamptz,
  add column cancelled_at          timestamptz,
  add column cancelled_by          text check (cancelled_by in ('patient', 'driver', 'system')),
  add column cancel_reason         text check (cancel_reason in ('changed_mind', 'found_alternative', 'duplicate_request', 'other')),
  add column cancel_note           text check (char_length(cancel_note) <= 500),
  add column final_fare_inr        integer check (final_fare_inr >= 0),
  add column receipt_path          text,
  add column dispute_flag          boolean not null default false,
  add column receipt_confirmed_at  timestamptz;

-- Backfill legacy rows (none are expected: nothing has ever inserted a mission), then enforce.
update public.missions m
   set jurisdiction = (select j.zone from public.jurisdictions j where extensions.st_covers(j.boundary, m.pickup_location) limit 1)
 where m.jurisdiction is null;
update public.missions set display_ref = 'MSN-LEGACY-' || lpad(nextval('public.mission_display_seq')::text, 6, '0')
 where display_ref is null;
alter table public.missions
  alter column display_ref set not null,
  alter column idempotency_key drop default,
  add constraint missions_display_ref_key unique (display_ref),
  add constraint missions_patient_idempotency_key unique (patient_id, idempotency_key),
  -- Anti-gouging guarantee, no longer only a TypeScript literal type. coalesce: a missing key fails, not passes.
  add constraint missions_fare_guard check (
    fare_details is null
    or coalesce(
         (fare_details ->> 'surgeMultiplier')::numeric = 1.0
         and (fare_details ->> 'surgeGougingAmountInr')::int = 0,
         false)
  );
-- Tighten only when no legacy row is left without a polygon match; a legacy null must not make the row un-updatable
-- (erasure and retention jobs update old missions). public.create_mission always sets jurisdiction.
do $$
begin
  alter table public.missions alter column jurisdiction set not null;
exception when not_null_violation then
  raise notice 'missions.jurisdiction left nullable: legacy rows need a manual jurisdiction backfill';
end $$;

create function public.missions_set_display_ref()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.display_ref is null then
    new.display_ref := format('MSN-%s-%s-%s', new.jurisdiction, to_char(new.created_at, 'YYYY'),
                              lpad(nextval('public.mission_display_seq')::text, 6, '0'));
  end if;
  return new;
end;
$$;
create trigger missions_set_display_ref
  before insert on public.missions
  for each row execute function public.missions_set_display_ref();

-- "Resume my active mission" becomes a one-row lookup. The `matched` pool index has no reader any more.
create index idx_missions_active_patient on public.missions (patient_id)
  where status not in ('completed', 'cancelled');
create index idx_missions_active_driver on public.missions (driver_id)
  where driver_id is not null and status not in ('completed', 'cancelled');
drop index public.idx_missions_matched;

-- R-06: a driver reads only the missions assigned to them. Offers reach drivers on driver:{id}:offers.
drop policy missions_select_driver on public.missions;
create policy missions_select_driver on public.missions
  for select to authenticated
  using (driver_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- mission_events (5.3.5)
-- ---------------------------------------------------------------------------
alter table public.mission_events
  add column seq             integer,
  add column event_type      text,
  add column actor_role      text check (actor_role in ('patient', 'driver', 'system')),
  add column client_event_id uuid;

-- Backfill legacy rows: a per-mission sequence in time order and the wire name of the status entered.
update public.mission_events e
   set seq = s.rn
  from (select id, row_number() over (partition by mission_id order by created_at, id) as rn from public.mission_events) s
 where e.id = s.id and e.seq is null;
update public.mission_events
   set event_type = case to_status
         when 'requesting'       then 'MISSION_REQUESTED'
         when 'matched'          then 'DRIVER_ACCEPTED'
         when 'en_route'         then 'DRIVER_ACCEPTED'
         when 'on_scene'         then 'DRIVER_ARRIVED'
         when 'transporting'     then 'TRANSPORT_STARTED'
         when 'arrived_hospital' then 'HOSPITAL_ARRIVED'
         when 'completed'        then 'MISSION_COMPLETED'
         when 'cancelled'        then 'MISSION_CANCELLED'
       end
 where event_type is null;
update public.mission_events set actor_role = 'system' where actor_role is null;
update public.missions m
   set state_version = coalesce((select max(e.seq) from public.mission_events e where e.mission_id = m.id), 0);

alter table public.mission_events
  alter column seq set not null,
  alter column event_type set not null,
  alter column actor_role set not null;
create unique index idx_mission_events_mission_seq on public.mission_events (mission_id, seq);
create unique index idx_mission_events_client_event on public.mission_events (mission_id, client_event_id)
  where client_event_id is not null;

-- R-08: the trail is statutory, so it is append-only. Still allowed: `metadata` edits (the erasure job
-- strips vitals/handoff keys) and `triggered_by` going to null (account erasure, on delete set null).
create function public.mission_events_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'mission_events is append-only' using errcode = '42501';
  end if;
  if (old.id, old.mission_id, old.from_status, old.to_status, old.created_at, old.seq, old.event_type, old.actor_role, old.client_event_id)
       is distinct from
     (new.id, new.mission_id, new.from_status, new.to_status, new.created_at, new.seq, new.event_type, new.actor_role, new.client_event_id)
     or (new.triggered_by is not null and new.triggered_by is distinct from old.triggered_by) then
    raise exception 'mission_events is append-only' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger mission_events_append_only
  before update or delete on public.mission_events
  for each row execute function public.mission_events_append_only();

-- ---------------------------------------------------------------------------
-- dispatch_waves (5.3.6)
-- ---------------------------------------------------------------------------
alter table public.dispatch_waves
  add column expires_at  timestamptz,
  add column accepted_by uuid references public.drivers (id) on delete set null;
update public.dispatch_waves set expires_at = created_at + interval '45 seconds' where expires_at is null;
alter table public.dispatch_waves alter column expires_at set not null;

-- R-06: an eligible driver could read the whole eligible_driver_ids array (every peer's id). Offers arrive
-- by channel and accept_offer() checks eligibility server-side, so clients get no access at all.
drop policy dispatch_waves_select_eligible on public.dispatch_waves;
revoke select on public.dispatch_waves from authenticated;

-- ---------------------------------------------------------------------------
-- driver_push_tokens (5.3.7)
-- ---------------------------------------------------------------------------
alter table public.driver_push_tokens
  add column token_type text not null default 'expo' check (token_type in ('expo', 'fcm', 'apns')),
  add column is_active  boolean not null default true;
grant delete on public.driver_push_tokens to authenticated;
create policy push_tokens_delete_own on public.driver_push_tokens
  for delete to authenticated
  using (driver_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- telemetry_logs (5.3.8)
-- ---------------------------------------------------------------------------
alter table public.telemetry_logs
  add column received_at timestamptz not null default now(),
  add column accuracy_m  numeric(6, 1),
  add column dead_zone   boolean not null default false;
-- A re-flushed batch must not create duplicates.
create unique index idx_telemetry_dedupe on public.telemetry_logs (mission_id, driver_id, recorded_at);

-- ---------------------------------------------------------------------------
-- consent_records, erasure_requests (5.3.9)
-- ---------------------------------------------------------------------------
create table public.consent_records (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  purpose        text not null check (purpose in ('geolocation', 'medical_data', 'driver_location', 'driver_credentials', 'third_party_llm')),
  notice_version text not null,
  granted        boolean not null,
  granted_at     timestamptz not null default now(),
  locale         text check (locale in ('en', 'hi')),
  app_version    text,
  withdrawn_at   timestamptz
);
create index idx_consent_records_user_purpose on public.consent_records (user_id, purpose, granted_at desc);

create table public.erasure_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  mission_id   uuid references public.missions (id) on delete set null,
  requested_at timestamptz not null default now(),
  due_at       timestamptz not null,
  status       text not null default 'queued' check (status in ('queued', 'processing', 'done', 'rejected')),
  completed_at timestamptz,
  scope        jsonb
);
create index idx_erasure_requests_user on public.erasure_requests (user_id, requested_at desc);
create index idx_erasure_requests_due on public.erasure_requests (due_at) where status = 'queued';

-- ---------------------------------------------------------------------------
-- driver_vehicles, driver_documents (5.3.9)
-- ---------------------------------------------------------------------------
create table public.driver_vehicles (
  id                  uuid primary key default gen_random_uuid(),
  driver_id           uuid not null references public.drivers (id) on delete cascade,
  registration_number text not null unique,
  make_model          text,
  manufacture_year    smallint check (manufacture_year between 1990 and 2100),
  vin                 text,
  ais125_type         public.ais125_vehicle_type not null,
  equipment_attested  jsonb not null default '[]'::jsonb,
  is_active           boolean not null default true
);
create unique index idx_driver_vehicles_one_active on public.driver_vehicles (driver_id) where is_active;

create table public.driver_documents (
  id               uuid primary key default gen_random_uuid(),
  driver_id        uuid not null references public.drivers (id) on delete cascade,
  slot             text not null check (slot in ('arai_certificate', 'fitness_permit', 'commercial_dl', 'emt_certificate', 'vehicle_rc', 'commercial_insurance', 'puc_certificate')),
  storage_path     text not null,
  file_name        text,
  size_bytes       integer check (size_bytes >= 0),
  mime_type        text,
  status           text not null default 'uploaded' check (status in ('uploaded', 'accepted', 'rejected')),
  rejection_reason text,
  uploaded_at      timestamptz not null default now(),
  reviewed_at      timestamptz,
  unique (driver_id, slot),
  -- Bind the row to the bucket path template {driver_id}/{slot}/{uuid}.{ext}.
  constraint driver_documents_path_matches check (storage_path like driver_id::text || '/' || slot || '/%')
);

-- Status is not client-writable, so a re-upload after a rejection must reset review state itself.
create function public.driver_documents_reset_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.storage_path is distinct from old.storage_path then
    new.status := 'uploaded';
    new.uploaded_at := now();
    new.reviewed_at := null;
    new.rejection_reason := null;
  end if;
  return new;
end;
$$;
create trigger driver_documents_reset_review
  before update on public.driver_documents
  for each row execute function public.driver_documents_reset_review();

-- ---------------------------------------------------------------------------
-- Privileges + RLS for the new tables
-- ---------------------------------------------------------------------------
revoke all on public.jurisdictions, public.consent_records, public.erasure_requests,
              public.driver_vehicles, public.driver_documents
  from anon, authenticated;
revoke all on sequence public.mission_display_seq from anon, authenticated;

grant select on public.consent_records, public.erasure_requests to authenticated;
grant select on public.driver_vehicles, public.driver_documents to authenticated;
grant insert (driver_id, registration_number, make_model, manufacture_year, vin, ais125_type, equipment_attested)
  on public.driver_vehicles to authenticated;
grant update (registration_number, make_model, manufacture_year, vin, ais125_type, equipment_attested)
  on public.driver_vehicles to authenticated;
grant insert (driver_id, slot, storage_path, file_name, size_bytes, mime_type)
  on public.driver_documents to authenticated;
grant update (storage_path, file_name, size_bytes, mime_type)
  on public.driver_documents to authenticated;

alter table public.jurisdictions    enable row level security;
alter table public.consent_records  enable row level security;
alter table public.erasure_requests enable row level security;
alter table public.driver_vehicles  enable row level security;
alter table public.driver_documents enable row level security;

-- jurisdictions: no client policy (server use only, ST_Covers(boundary, pickup)).
create policy consent_records_select_own on public.consent_records
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy erasure_requests_select_own on public.erasure_requests
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy driver_vehicles_select_own on public.driver_vehicles
  for select to authenticated
  using (driver_id = (select auth.uid()));
create policy driver_vehicles_insert_own on public.driver_vehicles
  for insert to authenticated
  with check (
    driver_id = (select auth.uid())
    and (select exists (select 1 from public.drivers d where d.id = (select auth.uid()) and d.kyc_status in ('draft', 'rejected')))
  );
create policy driver_vehicles_update_own on public.driver_vehicles
  for update to authenticated
  using (
    driver_id = (select auth.uid())
    and (select exists (select 1 from public.drivers d where d.id = (select auth.uid()) and d.kyc_status in ('draft', 'rejected')))
  )
  with check (driver_id = (select auth.uid()));

create policy driver_documents_select_own on public.driver_documents
  for select to authenticated
  using (driver_id = (select auth.uid()));
create policy driver_documents_insert_own on public.driver_documents
  for insert to authenticated
  with check (
    driver_id = (select auth.uid())
    and (select exists (select 1 from public.drivers d where d.id = (select auth.uid()) and d.kyc_status in ('draft', 'rejected')))
  );
create policy driver_documents_update_own on public.driver_documents
  for update to authenticated
  using (
    driver_id = (select auth.uid())
    and (select exists (select 1 from public.drivers d where d.id = (select auth.uid()) and d.kyc_status in ('draft', 'rejected')))
  )
  with check (driver_id = (select auth.uid()));

create index idx_dispatch_waves_accepted_by on public.dispatch_waves (accepted_by) where accepted_by is not null;

-- ---------------------------------------------------------------------------
-- service_role
-- ---------------------------------------------------------------------------
grant all on table public.jurisdictions to service_role;
grant all on table public.consent_records to service_role;
grant all on table public.erasure_requests to service_role;
grant all on table public.driver_vehicles to service_role;
grant all on table public.driver_documents to service_role;
grant usage on sequence public.mission_display_seq to service_role;
