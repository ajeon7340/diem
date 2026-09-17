-- =============================================================================
-- adfit — Migration 0021: verbatim comment text gets its own, shorter clock
--
-- THE DEFECT
--
-- 0016 recorded the derived-metrics amendment and moved the retention horizon
-- from 30 days to 36 calendar months. It moved it for EVERYTHING, and one
-- horizon was one too few.
--
-- The amendment raises statistical and derived data to 36 months. It does not
-- reclassify verbatim API Data as derived, and a comment somebody wrote under
-- a video does not become our statistic because we counted it. III.E.4.d still
-- applies to the text itself, unchanged:
--
--     Non-Authorized Data may be stored "not longer than 30 calendar days ...
--     the API Client must either delete or refresh the stored data."
--
-- So `scripts/retention.ts` opened by quoting the 30-day cap, correctly called
-- the comment corpus Non-Authorized Data — and then computed its deadline with
-- the amended 36-month figure. Text fetched 2026-09-12 would have been held
-- until 2029.
--
-- THE SPLIT
--
--   derived  36 months   shares, counts, labels, object/intent, every score
--   verbatim 30 days     comments[].text, .postTitle, .likes, .publishedAt,
--                        exampleComment, public_opinion excerpts
--
-- WHAT SURVIVES THE VERBATIM SWEEP, and why it is not a loophole:
--
-- Comment and video IDs, and the permalinks built from them. An ID is a
-- pointer, not the content. III.E.4.d governs stored API Data; a URL that
-- resolves against YouTube is the opposite of a private copy, because it shows
-- the reader whatever YouTube shows today — including nothing at all, if the
-- comment has since been deleted. The report keeps its ability to prove a
-- claim; it loses its ability to reprint someone's words back at them.
--
-- The panel says so outright rather than rendering an empty blockquote:
-- "Quote not stored — past the 30-day limit on holding YouTube comment text."
-- An evidence box that has quietly lost its evidence is worse than one that
-- admits it.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. The read path needs the fetch date, not just the derived deadline.
--
-- 0016 serialised `data_refresh_due_at` only. The verbatim deadline cannot be
-- back-computed from it without knowing which flag was in force when the row
-- was written, so the fetch date travels instead and each horizon is derived
-- from it independently.
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
    'dataFetchedAt',        r.data_fetched_at,
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
-- 2. Index the verbatim deadline the sweep actually scans on.
--
-- `data_refresh_due_at` is indexed already, but the verbatim sweep selects on
-- `data_fetched_at` — a different, much busier predicate, because it matches
-- rows 30 days old rather than three years old. Almost every live row is past
-- the verbatim horizon and inside the derived one, which is exactly the window
-- this migration exists to handle.
-- ---------------------------------------------------------------------------
create index if not exists report_metrics_fetched_at_idx
  on public.report_metrics (data_fetched_at)
  where data_fetched_at is not null;

comment on column public.report_metrics.data_fetched_at is
  'When the API corpus behind this row was read. TWO deadlines derive from it and they '
  'are not the same: verbatim text expires 30 days after it (III.E.4.d, which no '
  'amendment extends), while derived figures last until data_refresh_due_at. Re-running '
  'analysis over a cached corpus does not refresh it — only a new fetch does.';
