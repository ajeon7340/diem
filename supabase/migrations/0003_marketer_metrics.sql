-- =============================================================================
-- adfit — Migration 0003: the buyer-side half of the report
--
-- 0001 gave the report everything needed to describe an audience. None of it
-- answers the questions a marketer has to answer to release budget:
--
--   "Is 78.4 good?"            -> benchmarks        (percentile vs cohort)
--   "What does it cost?"       -> cost_efficiency   (CPM, cost per 1k engaged)
--   "Do sponsored posts work?" -> sponsored_performance (organic vs sponsored)
--   "What's the actual risk?"  -> brand_safety_flags (named, with severity)
--   "Who else have they run?"  -> category_exposure (saturation, exclusivity)
--   "What goes in the brief?"  -> recommended_actions (structured do / avoid)
--
-- All six are pipeline output, so they live alongside the existing jsonb
-- columns and inherit the same RLS: locked, readable only by the owner, a Pro
-- member, or a valid Track A token.
-- =============================================================================

alter table public.report_metrics
  add column benchmarks           jsonb not null default '{}'::jsonb,
  add column cost_efficiency      jsonb not null default '{}'::jsonb,
  add column sponsored_performance jsonb not null default '{}'::jsonb,
  add column brand_safety_flags   jsonb not null default '[]'::jsonb,
  add column category_exposure    jsonb not null default '[]'::jsonb,
  add column recommended_actions  jsonb not null default '[]'::jsonb;

comment on column public.report_metrics.benchmarks is
  'Percentile and cohort median per headline metric. A score with no cohort is '
  'not a decision input — this is what turns 78.4 into "top 12% for this niche".';
comment on column public.report_metrics.cost_efficiency is
  'Derived CPM and cost-per-1k-engaged from the creator''s stated minimum budget '
  'and median views. An estimate, not a quote — the UI must say so.';
comment on column public.report_metrics.sponsored_performance is
  'The evidence behind ad_fatigue_level: organic vs sponsored median views and '
  'sentiment over a stated window.';
comment on column public.report_metrics.category_exposure is
  'Recent sponsored categories. Drives competitor-saturation and exclusivity '
  'judgements that a single brand-safety score cannot express.';

-- Sorting the directory by cost is a first-class buyer workflow, so the derived
-- CPM is indexed rather than recomputed per query.
create index report_metrics_cpm_idx
  on public.report_metrics ((( cost_efficiency ->> 'estimatedCpm' )::numeric));

-- ---------------------------------------------------------------------------
-- Extend the shared serialiser. One definition of the wire shape, so the token
-- RPC and every other authorised path stay in step.
-- ---------------------------------------------------------------------------
create or replace function public.report_to_jsonb(r public.report_metrics)
returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'creatorId',            r.creator_id,
    'demographics',         r.demographics,
    'topCommentClusters',   r.top_comment_clusters,
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
    'modelVersion',         r.model_version,
    'commentsAnalyzed',     r.comments_analyzed,
    'lastAnalyzedAt',       r.last_analyzed_at
  );
$$;

revoke all on function public.report_to_jsonb(public.report_metrics)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Directory: surface cost so agencies can filter and sort on it.
--
-- Still security_invoker, so the Pro-plan RLS gate on report_metrics is
-- unchanged — a free account continues to see zero rows.
--
-- Dropped and recreated rather than replaced: CREATE OR REPLACE VIEW can only
-- append columns, and estimated_cpm belongs next to the other metrics.
-- ---------------------------------------------------------------------------
drop view if exists public.directory_listings;

create view public.directory_listings with (security_invoker = on) as
select
  p.id,
  p.handle,
  p.display_name,
  p.avatar_url,
  p.niche,
  p.is_verified,
  p.minimum_budget,
  p.total_followers,
  r.sentiment_score,
  r.purchase_intent_rate,
  r.brand_safety_score,
  r.engagement_rate,
  r.ad_fatigue_level,
  r.demographics,
  (r.cost_efficiency ->> 'estimatedCpm')::numeric as estimated_cpm,
  r.last_analyzed_at
from public.creator_public_profiles p
join public.report_metrics r on r.creator_id = p.id
where p.is_directory_visible = true;

grant select on public.directory_listings to authenticated;
