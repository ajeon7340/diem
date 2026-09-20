-- =============================================================================
-- Behavioural probe for the advertiser flow's access model (0031, 0032).
--
-- The claim in the pivot is a permission claim: two agencies may evaluate the
-- same creator and must not learn anything about each other, while the
-- analysis itself is shared so neither pays twice. That is three separate
-- rules on three tables, and none of them is visible in a type or a test that
-- runs in Node — they live entirely in RLS.
--
-- Unlike probe-jobs, these are ROW-ADMISSION checks: the shim's `auth.uid()`
-- reads a GUC, so `set local role authenticated` plus a sub claim exercises a
-- policy the way a real request does. What this still cannot prove is that
-- Supabase issues the claim we think it does — that part stays a live check.
-- =============================================================================

\set ON_ERROR_STOP on

create temporary table pg_temp_passed (label text);

-- SECURITY DEFINER, unlike probe-jobs': these checks run after `set local
-- role authenticated`, and a temp table belongs to the session owner. Without
-- this the recorder itself fails with "permission denied", which reads as a
-- policy failure and is not one.
create or replace function pg_temp.check(p_label text, p_ok boolean)
returns void language plpgsql security definer as $$
begin
  if p_ok then
    insert into pg_temp_passed values (p_label);
    raise notice '  ok   %', p_label;
  else
    raise exception '  FAIL %', p_label;
  end if;
end;
$$;

-- Fixtures are written as the owner, before any role is assumed: this is the
-- state the world is in, not something either customer is proving they can do.
do $$
declare
  v_user_a uuid; v_user_b uuid;
  v_org_a  uuid; v_org_b  uuid;
  v_camp_a uuid; v_camp_b uuid;
begin
  insert into auth.users default values returning id into v_user_a;
  insert into auth.users default values returning id into v_user_b;
  insert into public.organizations (name) values ('Agency A') returning id into v_org_a;
  insert into public.organizations (name) values ('Agency B') returning id into v_org_b;
  insert into public.organization_members (organization_id, user_id, role)
    values (v_org_a, v_user_a, 'owner'), (v_org_b, v_user_b, 'owner');

  insert into public.campaigns (organization_id, created_by, name, brand, budget_total)
    values (v_org_a, v_user_a, 'Spring cleanser', 'Northbeam', 40000) returning id into v_camp_a;
  insert into public.campaigns (organization_id, created_by, name, brand)
    values (v_org_b, v_user_b, 'Competitor launch', 'Southline') returning id into v_camp_b;

  -- BOTH agencies are considering the SAME creator. This is the case the
  -- whole split exists for.
  insert into public.campaign_candidates (campaign_id, channel_id, proposed_fee, notes)
    values (v_camp_a, 'UCshared', 12000, 'A''s private note');
  insert into public.campaign_candidates (campaign_id, channel_id, notes)
    values (v_camp_b, 'UCshared', 'B''s private note');

  insert into public.channel_analyses (channel_id, title, comments_analyzed)
    values ('UCshared', 'A creator neither of them has met', 600);

  -- Both agencies saved the SAME reference video, with different reasoning.
  -- Which videos an agency is studying is competitive information about an
  -- unannounced campaign, so this is the case the policy exists for.
  insert into public.campaign_references
    (campaign_id, video_id, title, channel_id, channel_title, note, analysed_at)
    values (v_camp_a, 'vidSHARED', 'The format both of them noticed', 'UCref',
            'Somebody else entirely', 'A''s reason for saving it', now());
  insert into public.campaign_references
    (campaign_id, video_id, title, channel_id, channel_title, note, analysed_at)
    values (v_camp_b, 'vidSHARED', 'The format both of them noticed', 'UCref',
            'Somebody else entirely', 'B''s reason for saving it', now());

  -- And a job is running against that shared channel.
  insert into public.analysis_jobs (channel_id, kind) values ('UCshared', 'classify_intent');
  insert into public.analysis_jobs (channel_id, kind) values ('UCnobodys', 'classify_intent');

  perform set_config('probe.user_a', v_user_a::text, false);
  perform set_config('probe.user_b', v_user_b::text, false);
  perform set_config('probe.camp_a', v_camp_a::text, false);
end
$$;

do $$
declare
  v_a text := current_setting('probe.user_a');
  v_b text := current_setting('probe.user_b');
  v_camp_a uuid := current_setting('probe.camp_a')::uuid;
  v_n integer;
begin
  -- ---------------------------------------------------------------------
  -- The brief is the customer's alone
  -- ---------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_a, true);

  select count(*) into v_n from public.campaigns;
  perform pg_temp.check('A sees exactly its own campaign', v_n = 1);

  select count(*) into v_n from public.campaigns where brand = 'Southline';
  perform pg_temp.check('A cannot see B''s brief', v_n = 0);

  select count(*) into v_n from public.campaigns where budget_total is not null;
  perform pg_temp.check('A can read its own budget', v_n = 1);

  -- ---------------------------------------------------------------------
  -- The shortlist is competitive information
  -- ---------------------------------------------------------------------
  select count(*) into v_n from public.campaign_candidates;
  perform pg_temp.check('A sees one candidate, not both rows', v_n = 1);

  select count(*) into v_n from public.campaign_candidates where notes like 'B''s%';
  perform pg_temp.check('A cannot read B''s note on the same creator', v_n = 0);

  select count(*) into v_n from public.campaign_candidates where proposed_fee is not null;
  perform pg_temp.check('A sees the fee it was quoted', v_n = 1);

  -- ---------------------------------------------------------------------
  -- So is the research
  -- ---------------------------------------------------------------------
  select count(*) into v_n from public.campaign_references;
  perform pg_temp.check('A sees one reference, not both rows', v_n = 1);

  select count(*) into v_n from public.campaign_references where note like 'B''s%';
  perform pg_temp.check('A cannot read B''s reason for saving the same video', v_n = 0);

  -- The other direction, because a policy that leaks one way and not the
  -- other is a policy nobody tested twice.
  perform set_config('request.jwt.claim.sub', v_b, true);

  select count(*) into v_n from public.campaigns;
  perform pg_temp.check('B sees exactly its own campaign', v_n = 1);

  select count(*) into v_n from public.campaign_candidates where proposed_fee is not null;
  perform pg_temp.check('B cannot see the fee A was quoted', v_n = 0);

  select count(*) into v_n from public.campaign_references where note like 'A''s%';
  perform pg_temp.check('B cannot read A''s reason either', v_n = 0);

  -- Writing into somebody else's campaign must fail the WITH CHECK, not
  -- silently land in a row nobody can read back.
  begin
    insert into public.campaign_references
      (campaign_id, video_id, title, channel_id, channel_title, analysed_at)
      values (v_camp_a, 'vidSMUGGLED', 'Planted', 'UCref', 'Somebody else', now());
    perform pg_temp.check('B cannot file a reference into A''s campaign', false);
  exception when insufficient_privilege or check_violation then
    perform pg_temp.check('B cannot file a reference into A''s campaign', true);
  end;

  -- ---------------------------------------------------------------------
  -- The ANALYSIS is shared, deliberately
  --
  -- The inverse failure is just as real: if this were org-scoped, both
  -- agencies would pay for the same comment section and the pivot's cost
  -- story would be wrong.
  -- ---------------------------------------------------------------------
  select count(*) into v_n from public.channel_analyses where channel_id = 'UCshared';
  perform pg_temp.check('B reads the analysis A''s add paid for', v_n = 1);

  -- ---------------------------------------------------------------------
  -- Job visibility follows the candidate, not the channel
  -- ---------------------------------------------------------------------
  select count(*) into v_n from public.analysis_jobs where channel_id = 'UCshared';
  perform pg_temp.check('B sees the job for a channel on its own list', v_n = 1);

  select count(*) into v_n from public.analysis_jobs where channel_id = 'UCnobodys';
  perform pg_temp.check('and no job for a channel it never added', v_n = 0);

  -- ---------------------------------------------------------------------
  -- A customer may not write into the shared analysis
  --
  -- It is the one table here neither of them owns. A client INSERT would let
  -- one customer author the figures another customer reads.
  -- ---------------------------------------------------------------------
  perform pg_temp.check(
    'no client INSERT on channel_analyses',
    not has_table_privilege('authenticated', 'public.channel_analyses', 'insert')
  );
  perform pg_temp.check(
    'no client UPDATE on channel_analyses',
    not has_table_privilege('authenticated', 'public.channel_analyses', 'update')
  );
  perform pg_temp.check(
    'anon reads none of it',
    not has_table_privilege('anon', 'public.channel_analyses', 'select')
      and not has_table_privilege('anon', 'public.campaigns', 'select')
      and not has_table_privilege('anon', 'public.campaign_candidates', 'select')
      and not has_table_privilege('anon', 'public.campaign_references', 'select')
  );

  -- ---------------------------------------------------------------------
  -- A signed-out reader gets nothing at all
  -- ---------------------------------------------------------------------
  set local role anon;
  begin
    select count(*) into v_n from public.campaigns;
    perform pg_temp.check('anon cannot even select campaigns', false);
  exception when insufficient_privilege then
    perform pg_temp.check('anon cannot even select campaigns', true);
  end;

  reset role;
  select count(*) into v_n from pg_temp_passed;
  raise notice '';
  raise notice '  % passed, 0 failed', v_n;
end
$$;
