-- =============================================================================
-- adfit — Migration 0017: brand risk moves to the comment census
--
-- The off-platform pass could never answer "how much of this is a problem",
-- because it reads a search: seven videos out of an unknown number, chosen by
-- an unrecorded rule, so its totals describe the query rather than the
-- creator. 0011 and the passes after it walked that back until the panel
-- reported themes and evidence and stopped reporting volume at all.
--
-- The creator's own comment section has none of that trouble. It is a CENSUS —
-- every comment on every video — so "312 of 21,330" has a real denominator,
-- no selection rule to audit, and no query to be biased by. That is where a
-- brand-risk read belongs, and this migration is it.
--
-- THE RULE THIS SCHEMA ENCODES: a creator is not marked down for being a
-- target.
--
-- Slurs arrive under people, and more of them arrive the more visible the
-- person is. A score that counts what was done TO a creator rewards obscurity
-- and punishes reach — the same error as rendering a comments-disabled channel
-- as 0/100, which migration 0009 exists to prevent. So `comment_risks` splits
-- every category into what was found and `byCreator`, and only the second
-- reaches the rating. The rest is real and is reported, as an ad-adjacency and
-- moderation figure addressed to the buyer's placement decision rather than to
-- the creator's character.
-- =============================================================================

alter table public.report_metrics
  add column comment_risks jsonb not null default '[]'::jsonb,
  add column moderation    jsonb;

comment on column public.report_metrics.comment_risks is
  'Brand-risk categories counted over the WHOLE comment census: '
  '[{category, count, byCreator, hidden, example}] where category is '
  'hate | sexual | violence | illegal | spam. `count` is every such comment in the section — an '
  'ad-adjacency and moderation figure, NOT a judgement on the creator. `byCreator` is what the '
  'creator wrote or endorsed and is the ONLY part that moves their rating; see '
  'creatorRiskPenalty in src/lib/report/safety.ts. An empty array means the scan has not run and '
  'must never render as a clean section.';

comment on column public.report_metrics.moderation is
  'What the creator has already cleaned up: {foundTotal, visibleTotal, hiddenTotal, '
  'lastModeratedAt}. Both the found and the surviving totals are kept on purpose. Scoring only '
  'what survives lets a creator delete their way to a better number; scoring only the original '
  'punishes the ones who do the work. Keeping both credits the cleanup and closes the hole. '
  'NOTE that comment_risks.byCreator deliberately ignores `hidden` — deleting what you wrote does '
  'not unwrite it, or the rating would measure tidiness.';

-- Indexed because the moderation queue is the one view that asks "which
-- creators have unhandled risk", across creators, and it is the creator's own
-- dashboard doing the asking.
create index report_metrics_unmoderated_idx
  on public.report_metrics (((moderation ->> 'visibleTotal')::integer) desc nulls last)
  where moderation is not null;

-- ---------------------------------------------------------------------------
-- The serialiser. Without it the columns exist and never reach a reader.
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
    'commentRisks',         r.comment_risks,
    'moderation',           r.moderation,
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

-- ---------------------------------------------------------------------------
-- The moderation queue: individual risky comments the creator can act on.
--
-- Separate from `comment_risks`, which is the rollup a brand reads. This is the
-- working list, and it is CREATOR-ONLY — no agency, on any plan, sees the
-- individual comments. A brand needs to know a section carries 900 slurs so
-- they can price the placement; nothing about their decision requires reading
-- them, and handing an advertiser a browsable archive of abuse aimed at a
-- person is not a product feature.
-- ---------------------------------------------------------------------------
create type public.moderation_action as enum ('pending', 'hidden', 'kept', 'reported');

create table public.comment_moderation_queue (
  id            uuid primary key default gen_random_uuid(),
  creator_id    uuid not null references public.creators (id) on delete cascade,
  /** YouTube comment id — what setModerationStatus takes. */
  comment_id    text not null,
  video_id      text not null,
  video_title   text,
  excerpt       text not null check (char_length(excerpt) <= 800),
  category      text not null check (category in ('hate','sexual','violence','illegal','spam')),
  /** True when the creator wrote it. Shown differently; not actionable by hiding. */
  by_creator    boolean not null default false,
  likes         integer,
  published_at  timestamptz,
  status        public.moderation_action not null default 'pending',
  acted_at      timestamptz,
  created_at    timestamptz not null default now(),
  unique (creator_id, comment_id)
);

create index comment_moderation_queue_creator_idx
  on public.comment_moderation_queue (creator_id, status, created_at desc);

alter table public.comment_moderation_queue enable row level security;

-- The creator, and nobody else. Not the agency, not on the Pro plan.
create policy comment_moderation_queue_owner on public.comment_moderation_queue
  for all to authenticated
  using (public.owns_creator(creator_id))
  with check (public.owns_creator(creator_id));

revoke all on public.comment_moderation_queue from public, anon;
grant select, update on public.comment_moderation_queue to authenticated;

comment on table public.comment_moderation_queue is
  'Individual risky comments for the creator to action. CREATOR-ONLY by RLS: a brand reads the '
  'rollup in report_metrics.comment_risks so they can price a placement, and nothing about that '
  'decision requires reading the comments themselves. Handing an advertiser a browsable archive '
  'of abuse aimed at a person is not a feature. Clients hold SELECT and UPDATE only — rows are '
  'written by the scan worker under the service role, so a creator cannot manufacture or delete '
  'queue entries to shape what the rollup says.';
