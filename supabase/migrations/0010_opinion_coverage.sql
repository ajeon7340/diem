-- =============================================================================
-- adfit — Migration 0010: which platforms the off-platform pass actually read
--
-- public_opinion.themes told us what was found. Nothing recorded where we
-- looked, so the UI inferred coverage from results — and a platform with no
-- mentions rendered as "we checked, there was nothing there".
--
-- That is false whenever a platform could not be read at all. Reddit gates its
-- JSON endpoint and blocks several crawlers outright; a pass that never reached
-- it must not report silence as a finding. Same failure as coercing a missing
-- sentiment score to zero: absence of measurement presented as a measurement.
--
-- `coveredPlatforms` lists what the pass genuinely searched. A platform on the
-- monitored list but absent from this array renders as "not covered", never as
-- "nothing found".
--
-- LICENSING, not just access: Reddit's Responsible Builder Policy forbids
-- selling, licensing, sharing or otherwise commercialising Reddit data without
-- express written approval, and names ads targeting and ML analysis explicitly.
-- adfit does all three. Reddit must not appear in coveredPlatforms without that
-- approval however the data was obtained. Assume the same question applies to
-- X, TikTok and Instagram before adding them.
--
-- No DDL: public_opinion is jsonb and the field is defaulted.
-- =============================================================================

comment on column public.report_metrics.public_opinion is
  'Off-platform sentiment. THIRD-PARTY derived, unlike every other column here. '
  'themes[].mentions[] carries {source, excerpt, url, publishedAt, engagement} so each '
  'theme is traceable to the discussion it was drawn from. `coveredPlatforms` lists the '
  'platforms the pass actually read — a monitored platform missing from it was NOT '
  'searched, and must not be rendered as "nothing found". No author field by design.';
