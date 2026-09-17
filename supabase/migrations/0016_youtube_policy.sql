-- =============================================================================
-- adfit — Migration 0016: what the YouTube API Services Developer Policies
--                         actually let this report do
--
-- Three findings, three changes. The one thing NOT fixed here is the derived
-- metrics permission itself: purchase intent, sentiment and brand safety are
-- all computed FROM API Data, which III.E.4.h(ii) forbids outright —
--
--     "Your API Clients must not ... (ii) access or use API Data to create new
--      or derived data or metrics."
--
-- — and the fix for that is an account action, not a schema one: accept the
-- derived-metrics amendment at developers.google.com/youtube/terms/
-- derived-metrics-policy. Until that is accepted, every headline figure in this
-- report is out of policy. It is free and self-serve; there is no code path
-- that substitutes for it.
--
-- What the amendment does NOT cover is what follows.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Demographics move behind an express, per-organisation approval.
--
--     III.E.3.b: "API Clients must not display or allow access to Authorized
--     Data to anyone other than the authorizing user or agents expressly
--     approved by that user."
--
-- Demographics are Authorized Data — the one figure that genuinely requires
-- creator OAuth, which is exactly what makes it Authorized. The creator's OAuth
-- consent lets US fetch it; it is not consent for us to show it to a third
-- party. Those are different permissions, and only the second one is at issue
-- here.
--
-- Track A already satisfies the carve-out: a brand submits an access request
-- and the creator approves THAT brand by name. Track B did not — a pro_agency
-- member read any directory-visible creator instantly, and no creator ever
-- approved that organisation. That is the clause, violated, on the paid tier.
--
-- The fix is deliberately narrow. A pro agency still gets the whole report
-- immediately; only this one block waits on one click. Ninety per cent of the
-- Track B value is untouched, and the block that waits is the one no
-- competitor scraping public data can produce at all.
--
-- A blanket "I agree advertisers may see my data" checkbox at signup was
-- considered and rejected: "expressly approved" agents cannot be a class of
-- unknown future subscribers. This table names the organisation, records who
-- asked, and lets the creator revoke.
-- ---------------------------------------------------------------------------
create type public.grant_status as enum ('pending', 'approved', 'revoked');

create table public.demographics_grants (
  id              uuid primary key default gen_random_uuid(),
  creator_id      uuid not null references public.creators (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  status          public.grant_status not null default 'pending',
  requested_by    uuid references auth.users (id) on delete set null,
  requested_at    timestamptz not null default now(),
  decided_at      timestamptz,
  /** Every read, so the creator can see what their approval actually did. */
  view_count      integer not null default 0,
  last_viewed_at  timestamptz,
  unique (creator_id, organization_id)
);

create index demographics_grants_creator_idx
  on public.demographics_grants (creator_id, status);
create index demographics_grants_org_idx
  on public.demographics_grants (organization_id, status);

alter table public.demographics_grants enable row level security;

-- Both sides may READ the row. Neither may write it directly: an org that
-- could UPDATE status would approve its own request, which is the same class
-- of hole as an org admin self-upgrading billing_plan. Writes go through the
-- SECURITY DEFINER functions below and nowhere else.
create policy demographics_grants_creator_read on public.demographics_grants
  for select to authenticated
  using (public.owns_creator(creator_id));

create policy demographics_grants_org_read on public.demographics_grants
  for select to authenticated
  using (organization_id in (select public.user_org_ids()));

revoke all on public.demographics_grants from public, anon, authenticated;
grant select on public.demographics_grants to authenticated;

comment on table public.demographics_grants is
  'Express per-organisation approval to view a creator''s OAuth-derived demographics. '
  'Required by YouTube Developer Policies III.E.3.b: Authorized Data may only be shown to '
  'the authorizing user or agents expressly approved by that user. The creator''s OAuth '
  'consent permits US to fetch; it is not permission to show a third party. Track A''s '
  'per-brand approval already satisfies this; Track B did not, which is what this table '
  'fixes. Never grant INSERT or UPDATE to clients — an org that can write `status` approves '
  'its own request.';


-- A pro agency asks. It cannot approve, and it cannot ask on someone else's
-- behalf: the organisation is taken from the caller's membership, never from
-- an argument.
create or replace function public.request_demographics(p_creator_id uuid)
returns public.grant_status
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org_id  uuid;
  v_status  public.grant_status;
begin
  if not public.is_pro_agency() then
    raise exception 'pro_plan_required' using errcode = 'insufficient_privilege';
  end if;

  select organization_id into v_org_id
  from public.organization_members
  where user_id = auth.uid()
  limit 1;

  if v_org_id is null then
    raise exception 'no_organization' using errcode = 'insufficient_privilege';
  end if;

  -- A revoked grant may be asked for again; it returns to pending rather than
  -- silently reactivating, because a revocation is a decision and only the
  -- creator may reverse it.
  insert into public.demographics_grants (creator_id, organization_id, requested_by)
  values (p_creator_id, v_org_id, auth.uid())
  on conflict (creator_id, organization_id) do update
    set status       = case
                         when public.demographics_grants.status = 'revoked' then 'pending'
                         else public.demographics_grants.status
                       end,
        requested_at = case
                         when public.demographics_grants.status = 'revoked' then now()
                         else public.demographics_grants.requested_at
                       end
  returning status into v_status;

  return v_status;
end;
$$;

-- The creator decides. `owns_creator` is the gate, so an org member calling
-- this with someone else's grant id changes nothing.
create or replace function public.review_demographics_grant(
  p_grant_id uuid,
  p_approve  boolean
)
returns public.grant_status
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_creator_id uuid;
  v_status     public.grant_status;
begin
  select creator_id into v_creator_id
  from public.demographics_grants
  where id = p_grant_id;

  if v_creator_id is null or not public.owns_creator(v_creator_id) then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;

  update public.demographics_grants
  set status     = case when p_approve then 'approved' else 'revoked' end,
      decided_at = now()
  where id = p_grant_id
  returning status into v_status;

  return v_status;
end;
$$;

-- Reads the gate. Kept SECURITY DEFINER and STABLE so the server can ask
-- without the answer depending on which policies happen to apply.
create or replace function public.has_demographics_grant(p_creator_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.demographics_grants g
    where g.creator_id = p_creator_id
      and g.status = 'approved'
      and g.organization_id in (
        select organization_id from public.organization_members where user_id = auth.uid()
      )
  );
$$;

-- Supabase grants EXECUTE on new public functions to `anon` by default, and
-- `revoke ... from public` does NOT undo it. Every one by name — see 0002.
revoke all on function public.request_demographics(uuid)            from public, anon;
revoke all on function public.review_demographics_grant(uuid, boolean) from public, anon;
revoke all on function public.has_demographics_grant(uuid)          from public, anon;
grant execute on function public.request_demographics(uuid)            to authenticated;
grant execute on function public.review_demographics_grant(uuid, boolean) to authenticated;
grant execute on function public.has_demographics_grant(uuid)          to authenticated;


-- ---------------------------------------------------------------------------
-- 2. Stored API Data gets an expiry.
--
--     III.E.4.d: Non-Authorized Data may be kept "not longer than 30 calendar
--     days ... the API Client must either delete or refresh the stored data."
--
-- The comment corpus is Non-Authorized Data by definition — commentThreads.list
-- returns it with an API key and no User Credentials — and the creator cannot
-- consent on its behalf in any case, because it is twenty-one thousand other
-- people's writing. It was being stored indefinitely with no expiry concept at
-- all.
--
-- The derived-metrics amendment raises this to 36 months for statistical and
-- derived data once accepted. Both horizons are recorded so the deadline does
-- not silently depend on which paperwork is in force.
--
-- Nothing here deletes anything. It records WHEN a row falls out of policy, so
-- a refresh job and the UI have a date to act on rather than an assumption.
-- ---------------------------------------------------------------------------
alter table public.report_metrics
  add column data_fetched_at    timestamptz,
  add column data_refresh_due_at timestamptz;

comment on column public.report_metrics.data_fetched_at is
  'When the underlying YouTube API Data behind this row was last retrieved. Distinct from '
  'last_analyzed_at, which is when the model last ran: re-running analysis over a stale '
  'corpus does not refresh the corpus, and only the fetch date counts against the retention '
  'clock.';

comment on column public.report_metrics.data_refresh_due_at is
  'When this row must be deleted or refreshed to stay inside YouTube''s retention limits. '
  '30 days from data_fetched_at under the base Developer Policies (III.E.4.d); 36 months '
  'once the derived-metrics amendment is accepted. Past this date the row is out of policy '
  'and must not be served — see isStale/retention handling in src/lib/report/policy.ts.';

create index report_metrics_refresh_due_idx
  on public.report_metrics (data_refresh_due_at)
  where data_refresh_due_at is not null;


-- ---------------------------------------------------------------------------
-- 3. Cross-creator benchmarks are switched off, not deleted.
--
--     III.E.2: "Do not aggregate API Data except that you may only aggregate
--     API Data relating to YouTube channels that are under the same content
--     owner ... The API Client must not combine API Data from the different
--     content owners."
--
-- `benchmarks` ranks a creator against a cohort of others — 200 channels under
-- 200 different content owners. There is no self-serve amendment for this one;
-- the derived-metrics policy covers calculation and storage, not aggregation
-- across owners.
--
-- The column stays and the pipeline may keep writing it. A cohort built from
-- data creators supply directly — rather than from the API — would be outside
-- these policies entirely and could be switched back on without a migration.
-- The gate is BENCHMARKS_FROM_API_DATA in src/lib/report/policy.ts, and the UI
-- already renders a withheld percentile as "no cohort ranking yet", so
-- switching it off degrades honestly instead of leaving a hole.
-- ---------------------------------------------------------------------------
comment on column public.report_metrics.benchmarks is
  'Cohort ranking: {cohortLabel, cohortSize, metrics[{metric, value, cohortMedian, '
  'percentile}]}. NOT SERVED while the cohort is built from YouTube API Data — III.E.2 '
  'forbids combining API Data across content owners, and a category cohort is exactly that. '
  'Gated in the application by BENCHMARKS_FROM_API_DATA. Kept and still written because a '
  'cohort assembled from creator-supplied figures is outside the policy and re-enables this '
  'without schema work.';


-- ---------------------------------------------------------------------------
-- 4. The token path has to see the retention date too.
--
-- Without this the RPC payload carries no horizon, the read-path gate takes
-- its "never stamped" branch, and a Track A link keeps serving a corpus that
-- is out of policy — while the owner and Pro paths, which read the column
-- directly, correctly refuse. One serving path quietly exempt from a retention
-- rule is worse than none, because nothing in the product would show it.
-- ---------------------------------------------------------------------------
create or replace function public.report_to_jsonb(r public.report_metrics)
returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'creatorId',            r.creator_id,
    'demographics',         r.demographics,
    'topCommentClusters',   r.top_comment_clusters,
    'commentAxes',          r.comment_axes,
    'sentimentScore',       r.sentiment_score,
    'purchaseIntentRate',   r.purchase_intent_rate,
    'brandSafetyScore',     r.brand_safety_score,
    'engagementRate',       r.engagement_rate,
    'adFatigueLevel',       r.ad_fatigue_level,
    'aiSummary',            r.ai_summary,
    'benchmarks',           r.benchmarks,
    'costEfficiency',       r.cost_efficiency,
    'sponsoredPerformance', r.sponsored_performance,
    'brandSafetyFlags',     r.brand_safety_flags,
    'categoryExposure',     r.category_exposure,
    'recommendedActions',   r.recommended_actions,
    'platformBreakdown',    r.platform_breakdown,
    'publicOpinion',        r.public_opinion,
    'outputStats',          r.output_stats,
    'coverage',             r.comment_coverage,
    'promotions',           r.promotions,
    'dataRefreshDueAt',     r.data_refresh_due_at,
    'intent', jsonb_build_object(
      'rate',                 r.purchase_intent_rate,
      'ciLow',                r.purchase_intent_ci_low,
      'ciHigh',               r.purchase_intent_ci_high,
      'basis',                r.purchase_intent_basis,
      'commercialDensity',    r.commercial_density,
      'commentsScored',       r.intent_comments_scored,
      'postsScored',          r.intent_posts_scored,
      'productPostsAnalyzed', r.product_posts_analyzed,
      'dispersion',           r.intent_dispersion,
      'rubricVersion',        r.intent_rubric_version
    ),
    'modelVersion',         r.model_version,
    'commentsAnalyzed',     r.comments_analyzed,
    'lastAnalyzedAt',       r.last_analyzed_at
  );
$$;

revoke all on function public.report_to_jsonb(public.report_metrics)
  from public, anon, authenticated;
