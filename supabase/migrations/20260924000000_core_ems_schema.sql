-- Core EMS schema + RLS. Generated for manual `supabase db push`; not applied by tooling.
-- Every policy uses the (select auth.uid()) form so Postgres evaluates it once per
-- statement (InitPlan) instead of once per row, and targets `to authenticated` only.

-- ---------------------------------------------------------------------------
-- Extensions (in `extensions`, not `public`, so spatial_ref_sys is not exposed via PostgREST)
-- ---------------------------------------------------------------------------
create extension if not exists postgis with schema extensions;
create extension if not exists "pgcrypto" with schema extensions;
-- Supabase enables pg_net by default; declaring it stops migra from emitting `drop extension pg_net`.
create extension if not exists "pg_net" with schema extensions;
set search_path to public, extensions;

-- ---------------------------------------------------------------------------
-- Enums (values mirror @sahayak/domain: AIS125VehicleType, UrgencyTier, Jurisdiction)
-- ---------------------------------------------------------------------------
create type public.ais125_vehicle_type as enum ('TYPE_A_MFR', 'TYPE_B_PTA', 'TYPE_C_BLS', 'TYPE_D_ALS');
create type public.urgency_tier as enum ('CAT_1_IMMEDIATE', 'CAT_2_URGENT', 'CAT_3_DELAYED');
create type public.jurisdiction_zone as enum ('DL', 'UP');
create type public.mission_status as enum (
  'requesting',
  'matched',
  'en_route',
  'on_scene',
  'transporting',
  'arrived_hospital',
  'completed',
  'cancelled'
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  phone           text not null unique check (phone ~ '^\+?[1-9][0-9]{7,14}$'),
  role            text not null check (role in ('patient', 'driver')),
  full_name       text,
  dpdp_consent_at timestamptz,
  created_at      timestamptz not null default now()
);

create table public.drivers (
  id               uuid primary key references auth.users (id) on delete cascade,
  license_number   text not null unique,
  emt_cert_id      text,
  ais125_type      public.ais125_vehicle_type not null,
  is_verified      boolean not null default false,
  is_online        boolean not null default false,
  current_location extensions.geography(Point, 4326),
  constraint drivers_online_requires_verified check (not is_online or is_verified)
);

create table public.hospitals (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique,
  zone           public.jurisdiction_zone not null,
  location       extensions.geography(Point, 4326) not null,
  trauma_level   smallint not null check (trauma_level between 1 and 3),
  total_capacity integer not null default 0 check (total_capacity >= 0),
  held_capacity  integer not null default 0 check (held_capacity >= 0),
  is_active      boolean not null default true,
  constraint hospitals_held_within_total check (held_capacity <= total_capacity)
);

create table public.missions (
  id                      uuid primary key default gen_random_uuid(),
  -- restrict, not cascade: mission records are statutory and must outlive an account deletion request handler
  patient_id              uuid not null references public.profiles (id) on delete restrict,
  driver_id               uuid references public.drivers (id) on delete set null,
  destination_hospital_id uuid references public.hospitals (id) on delete set null,
  status                  public.mission_status not null default 'requesting',
  urgency                 public.urgency_tier not null,
  vehicle_type            public.ais125_vehicle_type not null,
  pickup_location         extensions.geography(Point, 4326) not null,
  fare_details            jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger missions_set_updated_at
  before update on public.missions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Indexes (policy columns + spatial)
-- ---------------------------------------------------------------------------
create index idx_hospitals_location on public.hospitals using gist (location);
create index idx_drivers_online_location on public.drivers using gist (current_location) where is_online;
create index idx_missions_patient_id on public.missions (patient_id, created_at desc);
create index idx_missions_driver_id on public.missions (driver_id) where driver_id is not null;
create index idx_missions_matched on public.missions (created_at) where status = 'matched' and driver_id is null;
create index idx_missions_destination_hospital_id on public.missions (destination_hospital_id) where destination_hospital_id is not null;

-- ---------------------------------------------------------------------------
-- Privileges: RLS is row-level only, so column-level grants stop a user from
-- editing their own `role` / `is_verified` / licence fields. INSERT/DELETE and
-- mission writes are intentionally service-role only (server-authoritative).
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.drivers, public.hospitals, public.missions from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, dpdp_consent_at) on public.profiles to authenticated;

grant select on public.drivers to authenticated;
grant update (is_online, current_location) on public.drivers to authenticated;

grant select on public.hospitals to authenticated;
grant select on public.missions to authenticated;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles  enable row level security;
alter table public.drivers   enable row level security;
alter table public.hospitals enable row level security;
alter table public.missions  enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy drivers_select_own on public.drivers
  for select to authenticated
  using (id = (select auth.uid()));

create policy drivers_update_own on public.drivers
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy hospitals_select_active on public.hospitals
  for select to authenticated
  using (is_active = true);

create policy missions_select_patient on public.missions
  for select to authenticated
  using (patient_id = (select auth.uid()));

-- Assigned driver, or a verified driver browsing the unassigned `matched` pool.
create policy missions_select_driver on public.missions
  for select to authenticated
  using (
    driver_id = (select auth.uid())
    or (
      status = 'matched'
      and driver_id is null
      and (select exists (
        select 1 from public.drivers d
        where d.id = (select auth.uid()) and d.is_verified
      ))
    )
  );

-- Patients read only the vehicle-level facts of their own mission's driver.
-- A row policy on `drivers` cannot hide licence/cert/location columns, so this
-- narrow view (runs as owner, filtered by the caller's uid) is the safe path.
create view public.assigned_driver_vehicle with (security_invoker = false) as
  select m.id as mission_id, d.id as driver_id, d.ais125_type, d.is_verified
  from public.missions m
  join public.drivers d on d.id = m.driver_id
  where m.patient_id = (select auth.uid());

revoke all on public.assigned_driver_vehicle from anon, authenticated;
grant select on public.assigned_driver_vehicle to authenticated;

-- ---------------------------------------------------------------------------
-- Seed: regional trauma centres. POINT(longitude latitude). trauma_level from the
-- apps' RANKED_TRAUMA_CENTRES presets; total_capacity = those presets' demo ICU-bed
-- counts (placeholders, not verified real figures).
-- ---------------------------------------------------------------------------
insert into public.hospitals (name, zone, location, trauma_level, total_capacity) values
  ('AIIMS New Delhi',                  'DL', extensions.st_geogfromtext('SRID=4326;POINT(77.2100 28.5672)'), 1, 30),
  ('Safdarjung Hospital',              'DL', extensions.st_geogfromtext('SRID=4326;POINT(77.2075 28.5694)'), 1, 24),
  ('Sharda Hospital Greater Noida',    'UP', extensions.st_geogfromtext('SRID=4326;POINT(77.4820 28.4732)'), 2, 10),
  ('Fortis Hospital Noida Sector 62',  'UP', extensions.st_geogfromtext('SRID=4326;POINT(77.3732 28.6189)'), 2, 12)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- service_role: backend workers / Edge Functions administer these tables; anon and authenticated stay under RLS + the column grants above.
-- ---------------------------------------------------------------------------
grant all on table public.profiles to service_role;
grant all on table public.drivers to service_role;
grant all on table public.hospitals to service_role;
grant all on table public.missions to service_role;
