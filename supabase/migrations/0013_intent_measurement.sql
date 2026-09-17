-- =============================================================================
-- adfit — Migration 0013: purchase intent becomes a measurement
--
-- `purchase_intent_rate` has been a column with no producer since 0001. Every
-- value in the app is a fixture, and on /@jooshica it is the purchase cluster's
-- share copied across — 0.281 beside a cluster at 0.28. Shipping that as the
-- headline figure a brand releases budget against fails three separate ways,
-- and each one is a WRONG answer rather than a vague one.
--
-- 1. IT MEASURED CONTENT MIX, NOT THE AUDIENCE.
--    A reaction channel that never holds a product cannot produce purchase
--    comments. /@ffion reads 0.59% and the note says "very low product intent",
--    but nothing was measured about that audience's willingness to buy — only
--    about what gets filmed. 0012's object axis is the fix, and this migration
--    is the fix reaching the number: the headline denominator is now comments
--    ABOUT A PRODUCT, which asks whether the audience moves when a product is
--    in frame. The mix-dependent reading survives as `commercial_density`,
--    because it is also true and also useful — it is a different question. On
--    the first channel measured, the two were 6.7% and 0.6%.
--
-- 2. IT WAS BINARY.
--    "where do I buy" and "how does it hold up after a year" were one bucket.
--    Weights now sit on the object x intent cross-product; see INTENT_WEIGHTS
--    in src/lib/report/intent.ts, which is the rubric of record.
--
-- 3. IT CARRIED NO PRECISION.
--    /@fernpress reports 34% from 41 comments at the same visual weight as 22%
--    from twelve thousand. sufficiency.ts answers that with a cliff at 100
--    comments; the honest answer is an interval. 34% of 41 is 21%-49%, and
--    stating that is more useful than withholding it, because it is a fact
--    rather than a refusal. The directory filter changes meaning as a result:
--    a floor is a question about EVIDENCE, so it is asked of the lower bound.
--
-- WHAT THIS NUMBER IS NOT. A rate over comments is comparative, never
-- absolute. Commenters are a self-selected fraction of a percent of viewers,
-- skewed toward the engaged; 28% of comments is not 28% of buyers and no
-- column here turns it into one. It is meaningful against a cohort, and it
-- becomes VALID only when checked against realised outcomes — which needs
-- campaign results this product does not collect yet. Until it has them, the
-- only claim the UI may make is "this is what the comment section says".
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. The cross-product. 0012 stores each axis separately, and the rate cannot
--    be recovered from that.
--
--    Marginals say 12% of comments are `buy` and 30% are about a `product`.
--    They cannot say how many are BOTH, which is the only cell that matters:
--    `buy` aimed at a creator is merch, and no arithmetic over two margins
--    recovers the joint distribution. Without `cells`, the headline number is
--    not reproducible from stored data — and evidence that cannot be recomputed
--    is the one thing this report does not ship.
--
--    Absent, not empty, on rows written before the classifier emits it: an
--    empty grid would read as "we classified and found nothing".
-- ---------------------------------------------------------------------------
comment on column public.report_metrics.comment_axes is
  'Comment classification rollups. `object` and `intent` are the per-axis totals, each '
  'summing to `total`. `cells` is the object x intent cross-product — [{object,intent,count}] '
  'summing to `total` as well — and it is what purchase_intent_rate is computed from. The '
  'margins CANNOT produce it: they say how many comments are `buy` and how many are about a '
  '`product`, never how many are both. NULL until a two-axis pass has run; a missing `cells` '
  'means the pass predates the cross-product, not that every cell is zero.';

-- ---------------------------------------------------------------------------
-- 2. Per-post scored comments — the worker's input, kept so the headline is
--    reproducible and auditable rather than merely asserted.
--
--    Deliberately NOT added to report_to_jsonb. It is evidence for a recompute,
--    not something a report renders, and serialising a few hundred posts into
--    every payload would ship tens of kilobytes nobody reads. Same rule as the
--    unrendered pipeline columns: stored, not shipped.
-- ---------------------------------------------------------------------------
alter table public.report_metrics
  add column intent_samples jsonb;

comment on column public.report_metrics.intent_samples is
  'Per-post classified comments behind purchase_intent_rate: [{postId, views, cells, '
  'productBearing}]. Worker input retained for reproducibility — NOT serialised into the '
  'report payload. Giveaway and contest posts must be excluded upstream: they manufacture '
  'purchase-shaped text ("me please", "entered!") in volume and are the fastest way to make '
  'this number meaningless. Creator replies, repeat-author spam and affiliate drop-link bots '
  'are excluded for the same reason.';

-- ---------------------------------------------------------------------------
-- 3. The measurement.
--
--    purchase_intent_rate keeps its column and its meaning as the headline
--    point estimate. Everything added here is the context without which that
--    point estimate is not a decision input.
-- ---------------------------------------------------------------------------
alter table public.report_metrics
  add column purchase_intent_ci_low  numeric,
  add column purchase_intent_ci_high numeric,
  add column purchase_intent_basis   text,
  add column commercial_density      numeric,
  add column intent_comments_scored  integer,
  add column intent_posts_scored     integer,
  add column product_posts_analyzed  integer,
  add column intent_dispersion       numeric,
  add column intent_rubric_version   text;

alter table public.report_metrics
  add constraint report_metrics_intent_basis_chk
    check (purchase_intent_basis is null
           or purchase_intent_basis in ('product_comments', 'all_comments')),
  add constraint report_metrics_intent_ci_chk
    check (purchase_intent_ci_low is null
           or purchase_intent_ci_high is null
           or purchase_intent_rate is null
           or (purchase_intent_ci_low <= purchase_intent_rate
               and purchase_intent_rate <= purchase_intent_ci_high));

-- NO BACKFILL, on purpose.
--
-- Existing rows carry a rate computed by no one knows what, over no one knows
-- which denominator. Stamping them 'all_comments' would assert something
-- untrue, and stamping them with the current rubric version would make a
-- fixture look like a measurement. They keep their rate and get NULL context,
-- which reads as "computed before the rubric existed" — the same discipline as
-- coveredPlatforms in 0010: never present an absence of measurement as one.

comment on column public.report_metrics.purchase_intent_rate is
  'Weighted buying signal over the basis denominator, 0-1. Computed from comment_axes.cells '
  'by INTENT_WEIGHTS in src/lib/report/intent.ts. View-weighted across posts, because a brand '
  'buys exposure rather than comments. NULL means no readable comments — not a zero, and not '
  'a low rating. Comparative, not absolute: commenters are a self-selected sliver of viewers, '
  'so this is never a conversion forecast.';

comment on column public.report_metrics.purchase_intent_basis is
  'Which denominator the rate was computed over. product_comments = of the comments attached '
  'to something purchasable, how much wants to buy it (the headline). all_comments = '
  'commercial density, which moves with what the creator films. A rate whose basis is unknown '
  'is worse than no rate, so this travels with it. NULL on rows written before 0013.';

comment on column public.report_metrics.commercial_density is
  'The same weighted computation over EVERY classified comment, 0-1. Equal to '
  'purchase_intent_rate when basis is all_comments. Kept beside the headline because the gap '
  'between them is the read: a low density with a high rate is a creator who rarely holds a '
  'product but converts when they do.';

comment on column public.report_metrics.purchase_intent_ci_low is
  'Wilson 95% lower bound on purchase_intent_rate. Wilson rather than Wald because the long '
  'tail lives at small n, where Wald returns bounds outside [0,1]. Narrowed by the effective '
  'sample size, not the raw comment count: the estimate is view-weighted, so a rate resting on '
  'one viral post gets a visibly wider interval. THIS is what directory floors are asked of — '
  'a filter is a question about evidence, and 34% from 41 comments must not outrank 22% from '
  'twelve thousand.';

comment on column public.report_metrics.intent_dispersion is
  'Standard deviation of the per-post rate, unweighted across posts. 14% across forty posts '
  'and 14% from one post at 60% are different buys — the same reason output_stats prints peak '
  'beside median. NULL below three scored posts, which cannot describe a spread.';

comment on column public.report_metrics.product_posts_analyzed is
  'Posts in the window that carried something purchasable, from `promotions`. Not a filter — '
  'the object axis does that job better — but the difference between "no product comments '
  'because nothing was for sale" and "a product post whose comments stayed cold" is a real '
  'finding, and only this column can tell them apart.';

comment on column public.report_metrics.intent_rubric_version is
  'The INTENT_WEIGHTS version the rate was computed under. A rubric change silently restates '
  'every historical rate and makes cohort medians incomparable across time, so the version '
  'travels with the number. Distinct from model_version: a classifier can be retrained against '
  'an unchanged rubric, and the rubric revised without touching the classifier.';

-- ---------------------------------------------------------------------------
-- 4. Promotions — what they have sold, and for whom.
--
--    A jsonb column rather than a table, deliberately. Every other block the
--    pipeline writes lives this way, and it inherits the whole access model
--    unchanged: the Pro-plan RLS gate on report_metrics, the token RPC, the
--    column grants. A new table would mean new policies and a new chance to
--    leak the thing 0001 was built to protect.
--
--    It earns its place three times over: it is the answer to "what has this
--    creator actually sold", it is the evidence under category_exposure —
--    which today asserts saturation without showing the posts — and it is
--    where `productBearing` comes from.
--
--    `disclosure` is the provenance field and it is not optional. "#ad in the
--    description" and "a model thought this looked sponsored" are different
--    claims, and a report that cannot tell them apart will eventually tell a
--    brand their competitor ran a campaign that never happened.
-- ---------------------------------------------------------------------------
alter table public.report_metrics
  add column promotions jsonb not null default '[]'::jsonb;

comment on column public.report_metrics.promotions is
  'Past sponsored and product-bearing posts, newest first: [{postId, platform, url, title, '
  'publishedAt, brand, product, category, disclosure, views, sponsoredRetention}]. '
  '`disclosure` is explicit | affiliate | inferred and must be rendered — an inferred '
  'promotion is a guess, and presenting it as a disclosed one would report a competitor '
  'campaign that never ran. `brand` or `product` may be null when a post is clearly '
  'commercial but the advertiser is not identifiable; null renders as "unidentified", never '
  'as an empty row. Feeds category_exposure and the productBearing flag on intent_samples.';

-- ---------------------------------------------------------------------------
-- 5. Serialiser. Without this the columns exist and never reach a reader.
--    intent_samples is excluded by design — see 2.
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
-- 6. Directory. Still security_invoker, so the Pro-plan gate is unchanged and
--    a free account continues to join against zero rows.
--
--    Dropped and recreated rather than replaced: CREATE OR REPLACE VIEW can
--    only append columns, and the bound belongs beside the rate it qualifies.
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
  r.purchase_intent_ci_low,
  r.purchase_intent_basis,
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

-- The filter moves to the lower bound, so that is what gets the index.
create index report_metrics_intent_floor_idx
  on public.report_metrics (purchase_intent_ci_low desc nulls last);
