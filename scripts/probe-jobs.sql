-- =============================================================================
-- Behavioural probe for the job claim rules (0028, narrowed by 0035).
--
-- Run by `npm run verify:migrations` against the freshly replayed throwaway
-- database. The replay proves the SQL parses; this proves it DECIDES correctly,
-- which is the part that costs money when it is wrong: a claim that hands one
-- job to two workers bills a 43-call classification twice for one answer.
--
-- Every check raises an exception on failure, so ON_ERROR_STOP fails the run.
-- =============================================================================

\set ON_ERROR_STOP on

-- The total is COUNTED, never typed. A hand-written "31 passed" over 30 checks
-- is the same defect as a hand-typed brand safety score over the flags that
-- contradict it: a number nobody rederives drifts the moment a check is added.
create temporary table pg_temp_passed (label text);

create or replace function pg_temp.check(p_label text, p_ok boolean)
returns void language plpgsql as $$
begin
  if p_ok then
    insert into pg_temp_passed values (p_label);
    raise notice '  ok   %', p_label;
  else
    raise exception '  FAIL %', p_label;
  end if;
end;
$$;

do $$
declare
  v_job      public.analysis_jobs;
  v_job2     public.analysis_jobs;
  v_id       uuid;
  v_n        integer;
  v_ok       boolean;
begin
  -- A job's only subject is a public channel (0035). There is no creator
  -- table to hang one off any more, and `channel_id` is NOT NULL.
  insert into public.analysis_jobs (channel_id, kind) values ('UCprobe1', 'classify_comments');

  begin
    insert into public.analysis_jobs (channel_id, kind) values ('UCprobe1', 'classify_comments');
    perform pg_temp.check('a second active job is rejected', false);
  exception when unique_violation then
    perform pg_temp.check('a second active job is rejected', true);
  end;

  -- A different channel is unaffected — the index is per channel, not global.
  insert into public.analysis_jobs (channel_id, kind) values ('UCprobe2', 'classify_comments');
  perform pg_temp.check('another channel can queue at the same time', true);

  begin
    insert into public.analysis_jobs (kind) values ('classify_intent');
    perform pg_temp.check('a job cannot have no subject', false);
  exception when not_null_violation then
    perform pg_temp.check('a job cannot have no subject', true);
  end;

  -- ---------------------------------------------------------------------
  -- Claiming
  -- ---------------------------------------------------------------------
  v_job := public.claim_analysis_job('worker-a', 900);
  perform pg_temp.check('a queued job is claimable', v_job.id is not null);
  perform pg_temp.check('claiming sets running',      v_job.status = 'running');
  perform pg_temp.check('claiming counts the attempt', v_job.attempts = 1);
  perform pg_temp.check('claiming names the worker',   v_job.worker = 'worker-a');
  perform pg_temp.check('claiming takes a lease',      v_job.leased_until > now());
  perform pg_temp.check('claiming stamps started_at',  v_job.started_at is not null);

  -- The second worker must get the OTHER channel's job, never this one.
  v_job2 := public.claim_analysis_job('worker-b', 900);
  perform pg_temp.check('a second worker gets a different job', v_job2.id <> v_job.id);

  -- And a third finds nothing: both jobs are held and neither lease has expired.
  perform pg_temp.check(
    'a held job is not claimable twice',
    (public.claim_analysis_job('worker-c', 900)).id is null
  );

  -- ---------------------------------------------------------------------
  -- Heartbeat
  -- ---------------------------------------------------------------------
  perform pg_temp.check(
    'the holder can extend its lease',
    public.heartbeat_analysis_job(v_job.id, 'worker-a', 900)
  );
  perform pg_temp.check(
    'a stranger cannot extend someone else''s lease',
    not public.heartbeat_analysis_job(v_job.id, 'worker-z', 900)
  );

  -- ---------------------------------------------------------------------
  -- Lease expiry: a dead worker must not strand the job
  -- ---------------------------------------------------------------------
  update public.analysis_jobs set leased_until = now() - interval '1 minute' where id = v_job.id;

  v_job2 := public.claim_analysis_job('worker-d', 900);
  perform pg_temp.check('an expired lease is reclaimable', v_job2.id = v_job.id);
  perform pg_temp.check('reclaiming counts a second attempt', v_job2.attempts = 2);
  perform pg_temp.check('reclaiming reassigns the worker', v_job2.worker = 'worker-d');

  -- The worker it was taken from can no longer touch it.
  perform pg_temp.check(
    'the evicted worker cannot heartbeat',
    not public.heartbeat_analysis_job(v_job.id, 'worker-a', 900)
  );

  -- ---------------------------------------------------------------------
  -- Attempts are bounded
  -- ---------------------------------------------------------------------
  update public.analysis_jobs
    set leased_until = now() - interval '1 minute', attempts = max_attempts
    where id = v_job.id;
  perform pg_temp.check(
    'a job at its attempt limit is not reclaimed',
    (public.claim_analysis_job('worker-e', 900)).id is null
  );

  -- ---------------------------------------------------------------------
  -- Terminal rows free the slot and keep the history
  -- ---------------------------------------------------------------------
  update public.analysis_jobs
    set status = 'failed', finished_at = now(), last_error = 'probe'
    where id = v_job.id;

  insert into public.analysis_jobs (channel_id, kind) values ('UCprobe1', 'classify_comments');
  perform pg_temp.check('a finished job frees the slot', true);

  select count(*) into v_n from public.analysis_jobs where channel_id = 'UCprobe1';
  perform pg_temp.check('the failed attempt is kept as history', v_n = 2);

  -- ---------------------------------------------------------------------
  -- Constraints
  -- ---------------------------------------------------------------------
  begin
    update public.analysis_jobs set status = 'succeeded', finished_at = null where id = v_job.id;
    perform pg_temp.check('a terminal job must carry finished_at', false);
  exception when check_violation then
    perform pg_temp.check('a terminal job must carry finished_at', true);
  end;

  begin
    insert into public.analysis_jobs (channel_id, kind, status, leased_until)
      values ('UCprobe3', 'classify_comments', 'running', null);
    perform pg_temp.check('a running job must carry a lease', false);
  exception when check_violation then
    perform pg_temp.check('a running job must carry a lease', true);
  end;

  -- ---------------------------------------------------------------------
  -- One live job per channel per kind, per PASS
  -- ---------------------------------------------------------------------
  insert into public.analysis_jobs (channel_id, kind) values ('UCprobe1', 'classify_intent');
  insert into public.analysis_jobs (channel_id, kind) values ('UCprobe9', 'classify_comments');
  perform pg_temp.check('other channels and other kinds still queue', true);

  v_job := public.claim_analysis_job('worker-ch', 900);
  perform pg_temp.check('a channel job is claimable', v_job.id is not null);
  update public.analysis_jobs
    set status = 'succeeded', finished_at = now() where id = v_job.id;

  -- ---------------------------------------------------------------------
  -- Privileges: a row here spends money, so clients may only read
  -- ---------------------------------------------------------------------
  perform pg_temp.check(
    'authenticated cannot insert a job',
    not has_table_privilege('authenticated', 'public.analysis_jobs', 'insert')
  );
  perform pg_temp.check(
    'authenticated cannot update a job',
    not has_table_privilege('authenticated', 'public.analysis_jobs', 'update')
  );
  perform pg_temp.check(
    'authenticated may read its own',
    has_table_privilege('authenticated', 'public.analysis_jobs', 'select')
  );
  perform pg_temp.check(
    'anon holds nothing at all',
    not has_table_privilege('anon', 'public.analysis_jobs', 'select')
  );
  perform pg_temp.check(
    'anon cannot claim a job',
    not has_function_privilege('anon', 'public.claim_analysis_job(text, integer)', 'execute')
  );
  perform pg_temp.check(
    'authenticated cannot claim a job',
    not has_function_privilege('authenticated', 'public.claim_analysis_job(text, integer)', 'execute')
  );
  perform pg_temp.check(
    'authenticated cannot heartbeat a job',
    not has_function_privilege('authenticated', 'public.heartbeat_analysis_job(uuid, text, integer, integer, integer, text)', 'execute')
  );

  -- The other half of the same rule. Revoking from everyone is only correct if
  -- the worker itself can still call it; without this the failure mode is a
  -- worker that claims nothing, forever, silently.
  perform pg_temp.check(
    'the service role CAN claim a job',
    has_function_privilege('service_role', 'public.claim_analysis_job(text, integer)', 'execute')
  );
  perform pg_temp.check(
    'the service role CAN heartbeat a job',
    has_function_privilege('service_role', 'public.heartbeat_analysis_job(uuid, text, integer, integer, integer, text)', 'execute')
  );

  -- The invariant is not "one policy" — 0032 adds a second, for the customer
  -- watching a channel job they are waiting on. The invariant is that NO
  -- policy here grants anything but SELECT: a row in this table spends money.
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'analysis_jobs' and cmd <> 'SELECT';
  perform pg_temp.check('no policy grants more than SELECT', v_n = 0);

  -- NOT a count. The creator's read of their own job went with the creator
  -- table, and a second workspace-scoped read arrived alongside it; pinning
  -- the number just makes this fail whenever a legitimate policy is added.
  -- What must hold is that every policy is SELECT — asserted above — and that
  -- at least one path can actually see a job, or the page that reports "still
  -- running" silently reports nothing at all.
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'analysis_jobs' and cmd = 'SELECT';
  perform pg_temp.check('at least one read policy remains', v_n >= 1);

  -- And every one of them is scoped to the caller. `using (true)` here would
  -- tell one agency that somebody is evaluating a creator, which is exactly
  -- the competitive signal the private shortlist exists to hide.
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'analysis_jobs'
     and coalesce(qual, 'true') = 'true';
  perform pg_temp.check('no read policy is unscoped', v_n = 0);

  select relrowsecurity into v_ok from pg_class where oid = 'public.analysis_jobs'::regclass;
  perform pg_temp.check('row level security is on', v_ok);

  select count(*) into v_n from pg_temp_passed;
  raise notice '';
  raise notice '  % passed, 0 failed', v_n;
end
$$;
