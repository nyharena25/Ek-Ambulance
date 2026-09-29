-- Phase A (production infrastructure readiness): enables pg_cron/pg_net and schedules the
-- three background jobs HANDOVER.md's "Ops steps required before this works end to end"
-- (section 25, "Ops steps... 2. Schedule the jobs") already named as outstanding:
-- dispatch_tick (wave escalation + search-window close), process_erasure_requests and
-- purge_expired_personal_data (DPDP retention, 5.6). Purely additive: creates two
-- extensions (if not already present) and (re)schedules three named jobs idempotently.
-- Does not touch any existing table, row, or already-applied migration.
--
-- pg_net is also required by public.publish_realtime() (20260924000003_mission_api.sql),
-- which reads two Vault secrets (centrifugo_api_url, centrifugo_api_key, still unset as of
-- this migration) and calls net.http_post. Enabling pg_net here is a prerequisite for that
-- function to ever leave its current silent no-op state, independent of pg_cron.
--
-- Schedules match the concrete examples HANDOVER.md itself proposed at lines 1652-1653 and
-- 1015 (mission_api.sql comment): dispatch_tick every minute (pg_cron's supported minimum
-- granularity without a seconds-capable build), erasure/retention jobs hourly/daily. These
-- cadences are operational defaults, not a hard requirement from the spec beyond
-- dispatch_tick's; ops may retune them without another migration by calling
-- cron.schedule() directly, though keeping schedule changes in migrations is preferred for
-- history.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Idempotent (re)schedule: unschedule any existing job with the same name first, since
-- cron.schedule()'s upsert-by-name behaviour differs across pg_cron versions. Safe to run
-- more than once; a re-run just re-applies the same schedule.
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'dispatch_tick';
  perform cron.unschedule(jobid) from cron.job where jobname = 'process_erasure_requests';
  perform cron.unschedule(jobid) from cron.job where jobname = 'purge_expired_personal_data';
end;
$$;

-- Wave escalation (45s bands) and search-window close (dispatch_config().searchTtlSeconds).
-- Every minute is pg_cron's standard granularity; HANDOVER.md:1653 names this exact command.
select cron.schedule('dispatch_tick', '* * * * *', $$select public.dispatch_tick()$$);

-- DPDP erasure requests (5.6): process pending deletions hourly.
select cron.schedule('process_erasure_requests', '0 * * * *', $$select public.process_erasure_requests()$$);

-- DPDP retention purge: daily, off-peak (03:00 UTC), default 30-day retention per the
-- function's own signature (purge_expired_personal_data(p_retention interval default '30 days')).
select cron.schedule('purge_expired_personal_data', '0 3 * * *', $$select public.purge_expired_personal_data()$$);
