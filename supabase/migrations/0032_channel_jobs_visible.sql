-- =============================================================================
-- Two things 0031 left the advertiser flow unable to do.
--
-- 1. A customer who has just added a candidate cannot see that the analysis is
--    running. `analysis_jobs_owner_read` is `owns_creator(creator_id)`, and a
--    channel job has no creator_id at all — so the one surface that answers
--    "is something happening, or is this it" returns nothing, and a candidate
--    mid-classification is indistinguishable from one whose comments could not
--    be read. That distinction is the whole point of representing absence.
--
-- 2. `intent_rubric_version` exists on `report_metrics` and not on
--    `channel_analyses`, so the channel intent pass had nowhere to record
--    which rubric produced a rate. A rate whose rubric is unknown cannot be
--    compared against one from a later rubric, and comparing candidates is
--    what this table is for.
-- =============================================================================

alter table public.channel_analyses
  add column if not exists intent_rubric_version text;

comment on column public.channel_analyses.intent_rubric_version is
  'Which intent rubric produced purchase_intent_rate. Two candidates scored under different '
  'rubrics are not comparable, and without this nothing can tell.';

-- A job about a channel is readable by anyone who has that channel on one of
-- their own campaigns. Deliberately NOT `using (true)` for channel jobs: the
-- row would then tell one agency that somebody is evaluating a creator, which
-- is exactly the competitive signal `campaign_candidates` is private to hide.
--
-- Still SELECT only. A row here spends money; nothing about the insert path
-- changes, and the client cannot reach it.
create policy analysis_jobs_candidate_read on public.analysis_jobs
  for select to authenticated
  using (
    channel_id is not null
    and channel_id in (
      select c.channel_id
      from public.campaign_candidates c
      join public.campaigns ca on ca.id = c.campaign_id
      where ca.organization_id in (select public.user_org_ids())
    )
  );
