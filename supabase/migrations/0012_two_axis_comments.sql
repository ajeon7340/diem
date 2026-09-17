-- =============================================================================
-- adfit — Migration 0012: comment clusters get a second axis
--
-- THE DEFECT
--
-- `top_comment_clusters[].intent` carried one enum — purchase / praise /
-- question / critique / reaction — which squeezed two independent questions
-- onto one list. "Asking where to buy this primer" and "asking who she is"
-- were both `question`, separated only by a free-text label. So the number a
-- media buyer most needs, the share of a comment section attached to something
-- purchasable, was not derivable at all: it had to be guessed from labels.
--
-- Measured properly on @jooshica6178's 21,330 comments, that share is 6.70%.
-- The single-axis model implied 0.59% — the one cluster labelled `purchase`.
-- An order of magnitude, in the direction that decides whether a brand buys
-- the channel for conversion or for reach.
--
-- THE FIX
--
--   object  creator | content | product | unclassified   — what it is about
--   intent  buy | request | ask | praise | criticise | react | unclassified
--
-- Both axes are exhaustive and single-label, so the cross-product is too:
-- collapse along either and the total is still 100%.
--
-- `request` is on the intent axis because the corpus put it there, not for
-- symmetry — 838 comments asking her to make a particular video. That is
-- neither a question nor applause, and it is the strongest non-purchase signal
-- a brand can act on: an audience that asks for tutorials will accept a
-- sponsored one.
--
-- WHAT IS NOT BACKFILLED
--
-- `object` is left NULL on every existing row. It cannot be recovered from a
-- single-axis label — `praise` says nothing about whether the praise was for
-- the creator or for the lipstick — and a guess would put fabricated figures
-- under a heading whose entire purpose is to be countable. The UI renders the
-- object rollup only where the column is populated, and says so where it is
-- not. Intent names ARE mapped, because that mapping is lossless.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Intent rename. Lossless, so it is applied in place.
-- ---------------------------------------------------------------------------
update public.report_metrics
set top_comment_clusters = (
  select coalesce(
    jsonb_agg(
      case
        when elem ->> 'intent' = 'purchase' then jsonb_set(elem, '{intent}', '"buy"')
        when elem ->> 'intent' = 'question' then jsonb_set(elem, '{intent}', '"ask"')
        when elem ->> 'intent' = 'critique' then jsonb_set(elem, '{intent}', '"criticise"')
        when elem ->> 'intent' in ('reaction', 'off_topic')
          then jsonb_set(elem, '{intent}', '"react"')
        else elem
      end
      order by ord
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(top_comment_clusters) with ordinality as t(elem, ord)
)
where jsonb_typeof(top_comment_clusters) = 'array'
  and jsonb_path_exists(
        top_comment_clusters,
        '$[*].intent ? (@ == "purchase" || @ == "question" || @ == "critique"'
        ' || @ == "reaction" || @ == "off_topic")'
      );

comment on column public.report_metrics.top_comment_clusters is
  'Comment clusters on two axes. `object` (creator|content|product|unclassified) is what '
  'the comment is about; `intent` (buy|request|ask|praise|criticise|react|unclassified) is '
  'what it wants. Both are exhaustive and single-label, so shares sum to 1 along either. '
  '`object` is NULL on rows written before migration 0012 and must not be guessed from '
  '`intent`. `sentiment` is NULL where the intent axis already carries valence — scoring '
  'it from the same lexicon that assigned the intent would restate the label, not confirm '
  'it. Render every cluster: filtering one out while keeping `comments_analyzed` as the '
  'denominator is what produced a 46% total under a 21,330 header. See migration 0011.';

-- ---------------------------------------------------------------------------
-- 2. Axis rollups.
--
-- Stored rather than summed from the clusters. Clusters are a readable summary:
-- cells under 2% are folded into an "other" group whose members no longer share
-- one object or one intent, so summing them yields a rollup that is close to
-- right and quietly wrong. These counts come from the classification pass.
-- ---------------------------------------------------------------------------
alter table public.report_metrics
  add column comment_axes jsonb;

comment on column public.report_metrics.comment_axes is
  'Per-axis totals over the whole analysed corpus: {object:[{key,count}], '
  'intent:[{key,count}], total}. Each axis sums to `total`. NULL until the creator has '
  'been through a two-axis classification pass — absent, not zero.';

-- ---------------------------------------------------------------------------
-- 3. Serialiser. Without this the column exists but never reaches a reader,
--    and the panel silently falls back to the single-axis view on exactly the
--    paths that are supposed to show the new one.
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
    'modelVersion',         r.model_version,
    'commentsAnalyzed',     r.comments_analyzed,
    'lastAnalyzedAt',       r.last_analyzed_at
  );
$$;

revoke all on function public.report_to_jsonb(public.report_metrics)
  from public, anon, authenticated;
