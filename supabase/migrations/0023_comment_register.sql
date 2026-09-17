-- Comment register: how a section is WRITTEN, measured from the text.
--
-- Added so the report can say what kind of room a comment section is, rather
-- than only what is in it. The obvious fourth dimension — "this audience skews
-- older" — is deliberately absent and must stay absent: YouTube API Services
-- Developer Policies III.E.4.h(ii) forbids using derived metrics to profile on
-- protected attributes and names age explicitly, and an inference from writing
-- style would be a guess stacked on a guess besides. Register is a property of
-- the comments themselves, so it can be stated as a fact and checked by reading
-- them.
--
-- The whole payload is a single jsonb because it is one measurement with one
-- denominator: `scanned` is the register pass's own corpus and every share
-- divides by it. Splitting the shares into columns would let a later writer
-- update one and not the others, and produce shares that do not share a
-- denominator — which is the defect this codebase has now found in six places.
--
-- Shape (see CommentRegister in src/types/index.ts):
--   { scanned, formalShare, slangShare, emojiShare, medianLength }
--
-- NULL means the pass has not run. It never means "neutral" — the same rule as
-- comment_coverage and public_opinion.coveredPlatforms: checked-and-nothing-
-- there and never-checked are different facts and the UI distinguishes them.
--
-- No climate column, on purpose. The climate label and its sentence are DERIVED
-- at read time from this plus comment_risks plus comment_axes, exactly like
-- brand safety and purchase intent. A stored sentence outlives the numbers it
-- was written from and keeps asserting them, and nothing about reading it
-- reveals that it is stale.

alter table public.report_metrics
  add column if not exists comment_register jsonb;

comment on column public.report_metrics.comment_register is
  'How the comment section is written: {scanned, formalShare, slangShare, emojiShare, medianLength}. '
  'Shares divide by `scanned`, the register pass''s own corpus, never by comments_analyzed. '
  'NULL means the pass has not run, never that the section is neutral. '
  'NOT an inference about who is watching — see III.E.4.h(ii).';

-- The directory view derives the climate label the same way the report does, so
-- it needs the EVIDENCE, not a conclusion. comment_axes, comment_risks,
-- moderation and comment_register are added here for that reason — a stored
-- label would be a sentence's worth of drift away from the panel explaining it,
-- which is the same argument that removed brand_safety_score from this view in
-- 0015.
--
-- Rebuilt from 0015's definition rather than written fresh: the base is
-- `creator_public_profiles`, NOT `creators`, and that is load-bearing —
-- the profile view is what keeps columns a directory reader has no business
-- seeing out of reach. Selecting from `creators` here would quietly widen the
-- surface while looking like a refactor.
--
-- Still security_invoker, so Track B's paywall stays an RLS policy on
-- report_metrics: a free account joins against zero rows and the upgrade wall
-- is only an empty state. Dropped and recreated because CREATE OR REPLACE VIEW
-- can only append columns and these belong beside the corpus they describe.
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
  r.comment_axes,
  r.comment_risks,
  r.moderation,
  r.comment_register,
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
