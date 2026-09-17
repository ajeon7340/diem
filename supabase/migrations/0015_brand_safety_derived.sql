-- =============================================================================
-- adfit — Migration 0015: brand safety is derived, and incidence gets a basis
--
-- `brand_safety_score` has had no producer since 0001. Every reference in the
-- application read it, rendered it, or passed it along; nothing computed it.
-- The values it carried contradicted the evidence rendered directly beneath
-- them in the same panel:
--
--     marahwoods   94.1   medium competitor conflict at 22%   of sponsored posts
--     jooshica     68.0   medium authenticity scrutiny at 5.06% of comments
--
-- Same severity. A quarter of the incidence. Twenty-six points worse. There is
-- no weighting that produces both rows, which is the proof that no weighting
-- produced either. A figure out of 100 that moves against its own evidence is
-- worse than a missing one, because it reads like a grade — and this one also
-- sorted the directory and tripped a >= 85 threshold in the verdict strip.
--
-- TWO CHANGES.
--
-- 1. `incidence` gets a `basis`. The field was documented as "share of
--    analysed content OR comments", and the pipeline duly wrote both: profanity
--    as a share of comments, competitor conflict as a share of sponsored posts,
--    in the same array. Two denominators in one number means no formula can
--    combine them — which is one reason the score was never written. This is
--    the same defect as the purchase-intent denominator in 0013, in a
--    different column.
--
-- 2. The score is DERIVED FROM THE FLAGS at read time, by
--    src/lib/report/safety.ts, and no longer read from this column. Deriving
--    rather than storing is the point: stored-and-trusted is exactly how it
--    drifted from the flags. The headline figure and the panel beneath it can
--    no longer disagree, because one is a function of the other.
--
-- The column is kept and left in the payload. It is history — every row still
-- records what the pipeline once asserted — and dropping it would destroy the
-- only evidence of what a report claimed at the time it was served.
-- =============================================================================

comment on column public.report_metrics.brand_safety_flags is
  'Named risk flags: [{category, severity, incidence, basis, note}]. `basis` names what '
  '`incidence` is a share of — comments | posts | sponsored_posts — and is REQUIRED for new '
  'rows: 22% of sponsored posts and 22% of comments are not comparable quantities, and an '
  'array that mixes them silently cannot be scored. Absent on rows written before 0015; those '
  'are scored as `comments`, the strictest, so an unknown denominator cannot flatter a creator.';

comment on column public.report_metrics.brand_safety_score is
  'HISTORICAL. Kept for the record and still serialised, but NOT what the application renders: '
  'the score is derived from brand_safety_flags at read time by deriveBrandSafety() in '
  'src/lib/report/safety.ts. This column never had a producer, and the values written into it '
  'contradicted the flags beside them — 94.1 against a medium flag at 22% incidence, 68.0 '
  'against a medium flag at 5.06%. Do not add a writer for it without also deleting the '
  'derivation; two sources for one number is what this migration exists to end.';

-- Rows written before the basis existed. Nothing is inferred into them: the
-- pipeline knew which denominator it used and this migration does not, and
-- guessing per category would be the same class of invention the score was.
-- deriveBrandSafety() handles a null basis explicitly and strictly.
comment on column public.report_metrics.comments_analyzed is
  'Size of the analysed comment corpus. Also gates brand safety: most flags are read from '
  'comments, so a thin corpus raises fewer of them and an undefended score would RISE — '
  'absence of evidence rendering as safety. Below the sufficiency floor the derivation returns '
  'NULL rather than a flattering number.';

-- ---------------------------------------------------------------------------
-- The directory reads the same evidence, so it reaches the same number.
--
-- `toDirectoryListing` was reading brand_safety_score straight off this view.
-- With the profile deriving and the directory reading, one creator would carry
-- two different safety figures on two pages of the same product — the exact
-- disagreement this migration removes, reintroduced one level down. The view
-- now carries the flags and the corpus size, and the mapper derives from them
-- exactly as the report does.
--
-- Still security_invoker, so the Pro-plan gate on report_metrics is unchanged.
-- Dropped and recreated because CREATE OR REPLACE VIEW can only append columns
-- and these belong beside the score they replace.
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
  r.brand_safety_flags,
  r.comments_analyzed,
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
