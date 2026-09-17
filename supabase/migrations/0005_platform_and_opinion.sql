-- =============================================================================
-- adfit — Migration 0005: per-platform analysis and public opinion
--
-- Two blind spots in the report as it stands:
--
-- 1. PLATFORM. Everything is aggregated across YouTube and Instagram, but the
--    two audiences behave nothing alike — long-form comment sections ask spec
--    questions and convert; feed comments react. A buyer allocating budget has
--    to know which surface is worth buying, and at what cost.
--
-- 2. PUBLIC OPINION (여론). Every existing signal is 1st-party, drawn from the
--    creator's own channels. A creator can run a warm comment section and still
--    be the subject of a hostile thread elsewhere. `brand_safety_flags` cannot
--    see that by construction, because it only reads comments the creator's own
--    moderation touches.
--
-- Provenance differs between them, and the UI must say so: platform_breakdown
-- is 1st-party like the rest of the report; public_opinion is derived from
-- public third-party sources and is explicitly not creator-authorised data.
-- =============================================================================

alter table public.report_metrics
  add column platform_breakdown jsonb not null default '[]'::jsonb,
  add column public_opinion     jsonb not null default '{}'::jsonb;

comment on column public.report_metrics.platform_breakdown is
  'Per-platform commercial read: reach, engagement, intent, sponsored retention and '
  'derived CPM for each connected account. Answers "which surface do I buy?", which '
  'the aggregate figures cannot.';

comment on column public.report_metrics.public_opinion is
  'Off-platform sentiment: what the wider public conversation says about this creator. '
  'THIRD-PARTY derived, unlike every other column here — sourced from public web '
  'discussion, not from creator-authorised analytics. The UI must label it as such.';

-- ---------------------------------------------------------------------------
-- Extend the shared serialiser so both reach every authorised path at once.
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
    'platformBreakdown',    r.platform_breakdown,
    'publicOpinion',        r.public_opinion,
    'modelVersion',         r.model_version,
    'commentsAnalyzed',     r.comments_analyzed,
    'lastAnalyzedAt',       r.last_analyzed_at
  );
$$;

revoke all on function public.report_to_jsonb(public.report_metrics)
  from public, anon, authenticated;

-- Agencies filter on reputation risk, so the net score is worth an index.
create index report_metrics_opinion_idx
  on public.report_metrics ((( public_opinion ->> 'netSentiment' )::numeric));
