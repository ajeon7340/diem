-- =============================================================================
-- A channel can be DECLARED without being CONNECTED.
--
-- `social_accounts.access_token` was `not null`, so the only way to record a
-- channel's public figures was to hold an OAuth token for it. That forced a
-- false choice at signup: either invent a token — which makes the moderation
-- button look wired up and fail at the API instead of at the check — or store
-- no row, and then
--
--     creator_public_profiles.total_followers = coalesce(sum(...), 0)
--
-- publishes "Total audience 0" on the media kit of a channel with 474,000
-- subscribers, three lines above "Followers 474K" in the output panel. Zero
-- standing in for unknown, in the one place a buyer looks first.
--
-- 0022 already drew this distinction on `creators` ("Declared, not connected").
-- This extends it to the figures: subscriber and view counts are public and
-- readable with an API key, so a declared channel can carry real numbers while
-- holding no credential at all.
--
-- The check keeps the two states apart. A row with no token must hold no
-- scopes, so nothing can read a scope list as evidence of a grant that was
-- never given.
-- =============================================================================

alter table public.social_accounts
  alter column access_token drop not null;

alter table public.social_accounts
  add constraint social_accounts_declared_has_no_scopes
  check (access_token is not null or cardinality(scopes) = 0);

comment on column public.social_accounts.access_token is
  'Null when the channel is DECLARED (public figures read with an API key) rather '
  'than CONNECTED (creator completed OAuth). Every caller that acts on the '
  'creator''s behalf must treat null as not-connected, not as an expired token — '
  'see src/app/actions/moderate.ts. Phase 2 fills this in.';

comment on column public.social_accounts.follower_count is
  'Public subscriber count. Readable without OAuth, so it is present on declared '
  'rows too. Hidden subscriber counts stay absent rather than becoming 0 — see 0027.';
