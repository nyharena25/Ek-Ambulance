-- Operational EMS tables: push tokens, dispatch waves, statutory mission audit trail, route telemetry.
-- Generated for manual `supabase db push`; not applied by tooling. Same conventions as the core migration:
-- (select auth.uid()) policies, `to authenticated` only, column-level grants, server-authoritative writes.
-- PostGIS lives in `extensions`, so spatial types are schema-qualified explicitly (no reliance on search_path).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.driver_push_tokens (
  id         uuid primary key default gen_random_uuid(),
  driver_id  uuid not null references auth.users (id) on delete cascade,
  token      text not null,
  platform   text not null check (platform in ('android', 'ios', 'web')),
  updated_at timestamptz not null default now(),
  -- the client upserts on (driver_id, token) when a token is re-registered
  unique (driver_id, token)
);

create table public.dispatch_waves (
  id                  uuid primary key default gen_random_uuid(),
  mission_id          uuid not null references public.missions (id) on delete cascade,
  wave_number         integer not null check (wave_number between 1 and 3),
  radius_km           numeric(4, 2) not null check (radius_km > 0),
  eligible_driver_ids uuid[] not null default '{}',
  status              text not null check (status in ('broadcasting', 'accepted', 'expired', 'exhausted')),
  created_at          timestamptz not null default now(),
  unique (mission_id, wave_number)
);

create table public.mission_events (
  id           uuid primary key default gen_random_uuid(),
  mission_id   uuid not null references public.missions (id) on delete cascade,
  from_status  public.mission_status,
  to_status    public.mission_status not null,
  -- set null, not the default no-action: an account erasure must not be blocked by (or delete) audit rows
  triggered_by uuid references auth.users (id) on delete set null,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create table public.telemetry_logs (
  id          bigint generated always as identity primary key,
  mission_id  uuid not null references public.missions (id) on delete cascade,
  driver_id   uuid references auth.users (id) on delete set null,
  location    extensions.geography(Point, 4326) not null,
  speed       numeric(5, 2) check (speed >= 0),
  heading     numeric(5, 2) check (heading >= 0 and heading <= 360),
  recorded_at timestamptz not null default now()
);

create trigger driver_push_tokens_set_updated_at
  before update on public.driver_push_tokens
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Indexes (policy columns + access paths)
-- ---------------------------------------------------------------------------
create index idx_mission_events_mission_time on public.mission_events (mission_id, created_at);
create index idx_dispatch_waves_eligible_drivers on public.dispatch_waves using gin (eligible_driver_ids);
create index idx_telemetry_mission_time on public.telemetry_logs (mission_id, recorded_at);

-- ---------------------------------------------------------------------------
-- Privileges: Supabase grants new public tables to anon/authenticated by default, so revoke first.
-- ---------------------------------------------------------------------------
revoke all on public.driver_push_tokens, public.dispatch_waves, public.mission_events, public.telemetry_logs
  from anon, authenticated;

grant select on public.driver_push_tokens to authenticated;
grant insert (driver_id, token, platform) on public.driver_push_tokens to authenticated;
grant update (token, platform) on public.driver_push_tokens to authenticated;

grant select on public.dispatch_waves to authenticated;
grant select on public.mission_events to authenticated;
-- telemetry_logs: no client access at all; pings are persisted server-side.

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.driver_push_tokens enable row level security;
alter table public.dispatch_waves     enable row level security;
alter table public.mission_events     enable row level security;
alter table public.telemetry_logs     enable row level security;

create policy push_tokens_select_own on public.driver_push_tokens
  for select to authenticated
  using (driver_id = (select auth.uid()));

create policy push_tokens_insert_own on public.driver_push_tokens
  for insert to authenticated
  with check (driver_id = (select auth.uid()));

create policy push_tokens_update_own on public.driver_push_tokens
  for update to authenticated
  using (driver_id = (select auth.uid()))
  with check (driver_id = (select auth.uid()));

-- A driver sees only waves they were actually offered; dispatchers use the service role (no dispatcher role exists yet).
create policy dispatch_waves_select_eligible on public.dispatch_waves
  for select to authenticated
  using (eligible_driver_ids @> array[(select auth.uid())]);

-- Participants only; missions is checked by id so the policy needs no columns the audit table lacks.
create policy mission_events_select_participant on public.mission_events
  for select to authenticated
  using (
    exists (
      select 1 from public.missions m
      where m.id = mission_events.mission_id
        and (m.patient_id = (select auth.uid()) or m.driver_id = (select auth.uid()))
    )
  );

-- telemetry_logs: RLS on with no policy = no authenticated access (deny by default).

-- ---------------------------------------------------------------------------
-- service_role: backend workers / Edge Functions administer these tables.
-- ---------------------------------------------------------------------------
grant all on table public.driver_push_tokens to service_role;
grant all on table public.dispatch_waves to service_role;
grant all on table public.mission_events to service_role;
grant all on table public.telemetry_logs to service_role;
