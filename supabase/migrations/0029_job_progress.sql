-- =============================================================================
-- How far along is it?
--
-- `analysis_jobs` could say queued, running, succeeded or failed, and the
-- profile said "running now — the figures appear here when it finishes". True,
-- and useless for the only question a creator actually has after two minutes
-- of it: is this nearly done, or is it stuck?
--
-- The passes have reported progress to their caller since they were written
-- (`onProgress(done, total)` in lib/ingest/classify.ts and intent.ts) and the
-- worker threw it away unless --verbose. These three columns are where it
-- goes, so the page can read it.
--
-- ON THE HEARTBEAT, NOT BESIDE IT. The worker already calls
-- `heartbeat_analysis_job` between batches to extend its lease, so progress
-- rides that same statement. A second write per batch would double the write
-- traffic of every long pass to report a number that is only interesting
-- alongside "is this claim still mine" anyway.
--
-- NULLABLE, and null is not zero. A job that has not reported yet has no
-- progress — showing 0 of 0, or a bar at 0%, would claim we know it has done
-- nothing. `progress_total` is also unknown until the corpus is fetched, which
-- on a large channel is the first minute of the run.
-- =============================================================================

alter table public.analysis_jobs
  add column progress_done  integer check (progress_done  >= 0),
  add column progress_total integer check (progress_total >= 0),
  -- Which phase of the pass is running. The fetch is a minute of silence on a
  -- big channel and reads as a hang without this.
  add column progress_stage text check (progress_stage in ('fetching', 'classifying', 'storing'));

comment on column public.analysis_jobs.progress_done is
  'Comments processed so far in the current stage. Null means the job has not reported '
  'yet — which is not the same as zero done, and must not render as a 0% bar. See 0029.';

-- The heartbeat now carries progress. Same claim check as before: a worker that
-- has lost its lease cannot write progress either, so a stale process cannot
-- keep a dead job looking alive.
create or replace function public.heartbeat_analysis_job(
  p_job_id        uuid,
  p_worker        text,
  p_lease_seconds integer default 900,
  p_done          integer default null,
  p_total         integer default null,
  p_stage         text    default null
)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ok boolean;
begin
  update public.analysis_jobs
  set leased_until   = now() + make_interval(secs => p_lease_seconds),
      -- coalesce so a beat that reports nothing leaves the last known figure
      -- standing rather than blanking the bar between batches.
      progress_done  = coalesce(p_done,  progress_done),
      progress_total = coalesce(p_total, progress_total),
      progress_stage = coalesce(p_stage, progress_stage)
  where id = p_job_id
    and worker = p_worker
    and status = 'running'
  returning true into v_ok;

  return coalesce(v_ok, false);
end;
$$;

-- Same lockdown as 0028, restated because the signature changed: a new
-- signature is a NEW function to Postgres, and it arrives with Supabase's
-- default grant to anon and authenticated already on it.
revoke all on function public.heartbeat_analysis_job(uuid, text, integer, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.heartbeat_analysis_job(uuid, text, integer, integer, integer, text)
  to service_role;

-- The three-argument version is gone; leaving it would keep an ungranted
-- overload around for a caller to resolve to by accident.
drop function if exists public.heartbeat_analysis_job(uuid, text, integer);

-- A job that finishes must not leave a half-finished bar behind it.
comment on column public.analysis_jobs.progress_stage is
  'fetching | classifying | storing. Cleared to null by the worker on a terminal '
  'status, so a succeeded job does not render as "classifying 4,800 of 6,369" forever.';
