-- =============================================================================
-- adfit — Migration 0028: the work that cannot finish while someone is waiting
--
-- THE HOLE
--
-- Signup runs the bounded public-data analysis inline (25 uploads, 600
-- comments, 2-3s, no model call) and lands the creator on a real report. The
-- classifier does not run, and nothing ever ran it. `scan:comments` is a CLI
-- someone types. So every creator who signed up got a report whose risk census
-- was permanently absent, and the only thing standing between them and the
-- figures was a person remembering to run a script against their handle.
--
-- It cannot be moved inline and it cannot be a request. Measured on @가재맨:
-- 6,369 comments, 43 model calls, 5m30s. That is past every serverless
-- execution limit this app deploys behind, and far past what anybody will hold
-- a signup form open for.
--
-- So it becomes a job: signup writes a row saying what is owed, a worker picks
-- it up, and the report fills in when the worker finishes. The creator is told
-- which of those states they are in rather than being shown an absence that
-- looks identical to a channel with no comments.
--
-- WHY A TABLE AND NOT A QUEUE SERVICE
--
-- The state has to survive a worker dying, and it has to be READABLE BY THE
-- PRODUCT: the profile page says "queued", "running for 4 minutes" or "failed"
-- by selecting it. A job whose state lives in a broker is a job the page
-- cannot describe, and "still generating" with no way to distinguish waiting
-- from broken is the exact sentence this phase existed to delete.
--
-- CLAIMING IS THE ONLY THING THAT MUST BE ATOMIC
--
-- Two workers running one classification is not a double-write, it is double
-- BILLING — 43 model calls charged twice for one answer. `claim_analysis_job`
-- is the only way to move a job into `running`, and it holds `for update skip
-- locked` so a second worker takes the next row instead of the same one.
--
-- A LEASE, NOT A FLAG
--
-- `status = 'running'` alone strands a job forever when a worker is killed
-- mid-run — and this worker runs for minutes, so that is not a rare window.
-- Every claim carries `leased_until`; the worker extends it as it goes, and a
-- claim whose lease has expired is available again. The attempt is counted
-- either way, so a job that kills its worker three times stops rather than
-- becoming an infinite retry against a metered API.
-- =============================================================================

create type public.analysis_job_kind as enum (
  -- The comment risk census: every comment on every video read by the model,
  -- written back as `comment_risks` + the moderation queue. `scan:comments`.
  'classify_comments',
  -- The two-axis pass: every comment placed on object x intent, written back as
  -- `comment_axes` plus everything derived from it — purchase intent and its
  -- interval, commercial density, sentiment. `scan:intent`.
  'classify_intent'
);

comment on type public.analysis_job_kind is
  'One value per long pass. A third pass is a new enum value and a new handler in the '
  'worker, NOT a second jobs table — the claiming, leasing and retry rules are the same '
  'work whatever is being computed.';

create type public.analysis_job_status as enum (
  'queued',
  'running',
  'succeeded',
  -- Terminal. Retries are exhausted, or the failure is one no retry fixes.
  'failed'
);

create table public.analysis_jobs (
  id            uuid primary key default gen_random_uuid(),
  creator_id    uuid not null references public.creators (id) on delete cascade,
  kind          public.analysis_job_kind not null,
  status        public.analysis_job_status not null default 'queued',

  /**
   * What the job was asked to do — `{"maxVideos": 30}` and the like.
   *
   * Stored rather than implied, because a census over 30 videos and a census
   * over all 1,379 produce different denominators, and a report that cannot
   * say which bound produced it cannot be compared with itself later.
   */
  params        jsonb not null default '{}'::jsonb,

  attempts      integer not null default 0,
  max_attempts  integer not null default 3 check (max_attempts >= 1),
  /** The last failure, in the worker's words. Shown to the creator only as a
   *  state, never as a message — a Postgres error is not a status line. */
  last_error    text,

  /** Which worker holds it, for reading logs. Not an authorisation. */
  worker        text,
  /** The claim expires here. A running job past this is free to take again. */
  leased_until  timestamptz,

  queued_at     timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz,

  /**
   * What it produced. Denormalised on purpose: the profile page says "6,369
   * comments read" the moment the job lands, without joining report_metrics,
   * and a succeeded job that wrote nothing stays distinguishable from one that
   * never ran.
   */
  comments_scanned integer,
  findings         integer,

  constraint analysis_jobs_running_has_lease
    check (status <> 'running' or leased_until is not null),
  constraint analysis_jobs_terminal_has_finish
    check (status in ('queued', 'running') or finished_at is not null)
);

-- ONE ACTIVE JOB PER CREATOR PER KIND.
--
-- Not a nicety: enqueue is called from signup, and a creator who signs up,
-- deletes and signs up again — or a retried server action — would otherwise
-- queue the same 5-minute metered pass twice. The partial index makes the
-- second insert a conflict the caller can ignore, which is why `enqueue` can
-- be `on conflict do nothing` and still be correct.
--
-- Terminal rows are deliberately outside the index: the history of what ran
-- against a creator is worth keeping, and a finished job must never block the
-- next one.
create unique index analysis_jobs_one_active_idx
  on public.analysis_jobs (creator_id, kind)
  where status in ('queued', 'running');

-- The worker's only query: the oldest claimable job.
create index analysis_jobs_claimable_idx
  on public.analysis_jobs (status, queued_at)
  where status in ('queued', 'running');

create index analysis_jobs_creator_idx
  on public.analysis_jobs (creator_id, queued_at desc);

-- =============================================================================
-- Claiming
-- =============================================================================

/**
 * Take the oldest job that is owed, atomically, and hold it for p_lease_seconds.
 *
 * Claimable is either of two things:
 *   - queued, and under its attempt limit;
 *   - running with an EXPIRED lease, which means the worker that held it died.
 *     Its attempt was already counted, so a job that crashes its worker walks
 *     towards `max_attempts` exactly as a job that fails cleanly does. A pass
 *     that reliably kills the process must not retry forever against a metered
 *     API; three deaths and it stops with the last error on the row.
 *
 * `skip locked` is what makes two workers safe. Without it the second blocks on
 * the first's row lock and then claims the same job the moment it commits.
 */
create or replace function public.claim_analysis_job(
  p_worker        text,
  p_lease_seconds integer default 900
)
returns public.analysis_jobs
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_job public.analysis_jobs;
begin
  select * into v_job
  from public.analysis_jobs
  where (
      (status = 'queued'  and attempts < max_attempts)
      or (status = 'running' and leased_until < now() and attempts < max_attempts)
    )
  order by queued_at
  for update skip locked
  limit 1;

  if v_job.id is null then
    return null;
  end if;

  update public.analysis_jobs
  set status       = 'running',
      attempts     = attempts + 1,
      worker       = p_worker,
      leased_until = now() + make_interval(secs => p_lease_seconds),
      started_at   = coalesce(started_at, now()),
      -- The previous attempt's error is not this attempt's error.
      last_error   = null
  where id = v_job.id
  returning * into v_job;

  return v_job;
end;
$$;

/**
 * Extend the lease on a job this worker still holds.
 *
 * Scoped to the worker name AND to `running`: a worker whose lease already
 * expired and was taken by somebody else must not be able to extend its way
 * back into a job another process is now running. Returns false when the claim
 * is gone, which is the worker's signal to stop and drop what it has rather
 * than write over a fresher run.
 */
create or replace function public.heartbeat_analysis_job(
  p_job_id        uuid,
  p_worker        text,
  p_lease_seconds integer default 900
)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ok boolean;
begin
  update public.analysis_jobs
  set leased_until = now() + make_interval(secs => p_lease_seconds)
  where id = p_job_id
    and worker = p_worker
    and status = 'running'
  returning true into v_ok;

  return coalesce(v_ok, false);
end;
$$;

-- Supabase grants EXECUTE on new public functions to anon and authenticated by
-- default, and `revoke ... from public` does not undo a role-specific default
-- grant (see 0001). Both of these move work into a paid pipeline, so they are
-- revoked by name and left to the service role, which holds them implicitly.
revoke all on function public.claim_analysis_job(text, integer)              from public, anon, authenticated;
revoke all on function public.heartbeat_analysis_job(uuid, text, integer)    from public, anon, authenticated;

-- And granted back to the one role that must have them, BY NAME.
--
-- `service_role` would keep these through Supabase's default privileges, so
-- this looks redundant — it is not. `revoke ... from public` above removes the
-- PUBLIC grant that some of that default rests on, and the worker is the only
-- thing standing between a signup and a report that never fills in. Depending
-- on an implicit default for it means the failure shows up as a worker that
-- claims nothing, on a project somebody else provisioned, with no statement
-- anywhere saying who was supposed to be able to call this.
grant execute on function public.claim_analysis_job(text, integer)           to service_role;
grant execute on function public.heartbeat_analysis_job(uuid, text, integer) to service_role;

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table public.analysis_jobs enable row level security;

-- The creator reads the state of their own work. That is the whole client-side
-- surface: the page needs to say "queued" rather than "still generating", and
-- nothing else about a job is anyone's business.
--
-- No INSERT, no UPDATE, no DELETE for anyone but the service role — same rule
-- as comment_moderation_queue and for a sharper reason. A row here SPENDS
-- MONEY: an insert a client controlled would let anyone queue an unbounded
-- number of metered classification runs against any creator they can name.
create policy analysis_jobs_owner_read on public.analysis_jobs
  for select to authenticated
  using (public.owns_creator(creator_id));

revoke all on public.analysis_jobs from public, anon;
grant select on public.analysis_jobs to authenticated;

comment on table public.analysis_jobs is
  'Long passes that cannot run inside a request: queued at signup, claimed by scripts/worker.ts '
  'under the service role, read back by the profile page so a creator sees "queued" or "running" '
  'instead of an absence. Clients hold SELECT on their own rows only — a row here causes metered '
  'model calls, so the ability to create one is not delegated to anybody who can name a creator.';

comment on column public.analysis_jobs.leased_until is
  'When this claim expires. A running job past it is claimable again, because the worker holding '
  'it is assumed dead — this pass runs for minutes, so a killed worker is a normal event and not '
  'a reason to strand the job forever. The attempt is already counted, so reclaiming is bounded.';

comment on column public.analysis_jobs.attempts is
  'Incremented on CLAIM, not on failure, so a job that kills its worker before it can report '
  'anything still walks towards max_attempts. Retrying a crash forever against a metered API is '
  'the expensive way to find out a channel breaks the fetcher.';
