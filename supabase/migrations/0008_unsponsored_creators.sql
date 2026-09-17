-- =============================================================================
-- adfit — Migration 0008: creators who have never run an advertisement
--
-- Two corrections and one addition, all for the same case.
--
-- 1. ad_fatigue_level NULL now means "no basis to measure", not "unknown, call
--    it moderate". Ad fatigue is response decay across sponsored posts; with
--    zero sponsored posts there is no decay to measure. The application was
--    defaulting an absent value to 'moderate' and, worse, a creator with no
--    sponsorship history was being shown a reassuring 'low'. A fabricated
--    reassurance is the same failure as a confident verdict over forty
--    comments.
--
-- 2. cost_efficiency gains cohortMedianRetention. CPM is derived from median
--    views, and for a never-sponsored creator every one of those views is
--    organic. Sponsored posts systematically underperform organic, so that CPM
--    is the best case presented as the expected case. The cohort median
--    retention is real, computable data — it lets the UI state a realistic
--    figure instead of inventing a multiplier or staying silent.
--
-- No DDL: ad_fatigue_level is already nullable and cost_efficiency is jsonb.
-- =============================================================================

comment on column public.report_metrics.ad_fatigue_level is
  'Response decay across sponsored posts. NULL means there is no sponsored history to '
  'measure — it is not a neutral or low rating, and must not be rendered as one. The '
  'pipeline writes NULL whenever sponsored_performance is absent.';

comment on column public.report_metrics.cost_efficiency is
  'Derived CPM and cost-per-1k-engaged from the creator''s published minimum against '
  'median views. An estimate, not a quote. `cohortMedianRetention` (0-1) is the category''s '
  'typical sponsored-to-organic view retention: for a creator with no sponsored history '
  'the headline CPM is organic-only and therefore optimistic, and this is what makes the '
  'realistic figure statable rather than invented.';
