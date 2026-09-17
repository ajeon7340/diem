-- =============================================================================
-- adfit — Migration 0007: traceable evidence
--
-- Both qualitative panels rested on a single unattributed quote. For a product
-- whose entire claim is "do not take the creator's word for it", an unverifiable
-- quote is the weakest thing in the report — a buyer cannot tell a typical
-- comment from a cherry-picked one, and cannot check either.
--
-- No DDL: both are jsonb, and the shapes below extend the existing objects with
-- defaulted fields so rows written by the current pipeline still parse. The
-- contract lives here so the change is reviewable alongside the rest.
--
--   top_comment_clusters[].comments[]  — the creator's OWN posts and videos
--   public_opinion.themes[].mentions[] — third-party, off-platform discussion
--
-- Deliberately absent from both: the author. Comments and posts are public and
-- the permalink exposes whoever wrote them, but reprinting handles inside a
-- document that gets emailed around a buying team is a different act from
-- linking to the source.
-- =============================================================================

comment on column public.report_metrics.top_comment_clusters is
  'Intent clusters over comments on the creator''s own content. Each cluster carries '
  'commentCount, keyphrases[], and comments[] — {text, platform, postId, postTitle, '
  'likes, publishedAt, basis, url}. `basis` is representative | most_liked | most_recent '
  'so a reader can tell a typical comment from a loud one. `url` is a permalink built '
  'pipeline-side, since platform URL shapes change. No author field by design.';

comment on column public.report_metrics.public_opinion is
  'Off-platform sentiment. THIRD-PARTY derived, unlike every other column here. '
  'themes[].mentions[] carries {source, excerpt, url, publishedAt, engagement} so each '
  'theme is traceable to the discussion it was drawn from. No author field by design.';
