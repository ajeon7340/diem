-- =============================================================================
-- adfit — Migration 0006: output and engagement volume
--
-- The report described who watches and what they say, but never how much the
-- creator actually publishes or how big their range is. A buyer sizing a flight
-- needs both: cadence tells them how long a campaign takes to land, and the gap
-- between median and peak tells them whether a good post is a fluke or a floor.
--
-- Replaces the single `activeAudienceRate` figure that previously stood in for
-- all of this in the demographics header.
-- =============================================================================

alter table public.report_metrics
  add column output_stats jsonb not null default '[]'::jsonb;

comment on column public.report_metrics.output_stats is
  'Per-platform publishing volume and engagement: lifetime and windowed post counts, '
  'cadence, and avg/median/peak for views, likes and comments. Peaks matter as much as '
  'averages — a creator whose best post is 6x their median is a different buy from one '
  'who is flat.';

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
    'outputStats',          r.output_stats,
    'modelVersion',         r.model_version,
    'commentsAnalyzed',     r.comments_analyzed,
    'lastAnalyzedAt',       r.last_analyzed_at
  );
$$;

revoke all on function public.report_to_jsonb(public.report_metrics)
  from public, anon, authenticated;
