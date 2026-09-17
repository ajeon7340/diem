-- =============================================================================
-- adfit — Migration 0009: creators whose comments cannot be read
--
-- Comments can be absent for several reasons — the creator disabled them, the
-- account is too new to have any, or our access is restricted. Every
-- qualitative score in the report is derived from that corpus, and when it is
-- empty the application was coercing NULL to 0 and rendering:
--
--     purchase intent 0.0%   sentiment 0.0   brand safety 0.0/100
--
-- which reads as a toxic audience that never buys. The truth is "not measured".
-- This is the same failure as the ad-fatigue default in 0008, on the three
-- headline figures at once, and it would actively damage a creator for turning
-- comments off.
--
-- NULL in any of these columns now means "no basis", never a low rating.
--
-- `comment_coverage` records how much of the corpus we could actually read, so
-- partial coverage is visible too: comments readable on 3 of 40 posts is a
-- biased sample, not merely a small one.
--
-- No DDL: all four score columns are already nullable, and coverage is jsonb.
-- =============================================================================

alter table public.report_metrics
  add column comment_coverage jsonb not null default '{}'::jsonb;

comment on column public.report_metrics.comment_coverage is
  'How much of the comment corpus was readable: {postsAnalyzed, postsWithComments, reason}. '
  '`reason` is disabled | none_yet | restricted when comments are missing, else null. '
  'Partial coverage matters as much as none — a sample drawn from 3 of 40 posts is biased, '
  'not just small.';

comment on column public.report_metrics.sentiment_score is
  'Weighted positivity of the comment corpus, 0-100. NULL means there were no readable '
  'comments to score — not a zero, and not a low rating.';

comment on column public.report_metrics.purchase_intent_rate is
  'Share of comments expressing buying intent, 0-1. NULL means no readable comments.';

comment on column public.report_metrics.brand_safety_score is
  'Toxicity and controversy read over the comment corpus, 0-100, higher is safer. NULL '
  'means no readable comments — the creator is not unsafe, they are unassessed.';

create or replace function public.report_to_jsonb(r public.report_metrics)
returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'creatorId', r.creator_id, 'demographics', r.demographics,
    'topCommentClusters', r.top_comment_clusters, 'coverage', r.comment_coverage,
    'sentimentScore', r.sentiment_score, 'purchaseIntentRate', r.purchase_intent_rate,
    'brandSafetyScore', r.brand_safety_score, 'engagementRate', r.engagement_rate,
    'adFatigueLevel', r.ad_fatigue_level, 'aiSummary', r.ai_summary,
    'benchmarks', r.benchmarks, 'costEfficiency', r.cost_efficiency,
    'sponsoredPerformance', r.sponsored_performance, 'brandSafetyFlags', r.brand_safety_flags,
    'categoryExposure', r.category_exposure, 'recommendedActions', r.recommended_actions,
    'platformBreakdown', r.platform_breakdown, 'publicOpinion', r.public_opinion,
    'outputStats', r.output_stats, 'modelVersion', r.model_version,
    'commentsAnalyzed', r.comments_analyzed, 'lastAnalyzedAt', r.last_analyzed_at
  );
$$;

revoke all on function public.report_to_jsonb(public.report_metrics)
  from public, anon, authenticated;
