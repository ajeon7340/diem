-- =============================================================================
-- adfit — Migration 0022: the channel a creator DECLARES, kept apart from the
--                         channel they CONNECT
--
-- THE HOLE
--
-- Creator onboarding wrote a `creators` row and nothing else. No channel was
-- recorded anywhere, so `getCreatorYouTubeHandle` found nothing, and Studio —
-- the one page that pays a creator back on day one, before any advertiser
-- exists — rendered its empty state for every real signup. Permanently, with
-- nothing in the product explaining why.
--
-- WHY NOT `social_accounts`
--
-- That table is OAuth credentials: `access_token` is NOT NULL and the file
-- comment says "never reaches a browser". A creator typing their @handle into
-- a signup form has authorised nothing, and writing them into that table would
-- collapse a distinction this product depends on elsewhere:
--
--     declared handle  → public data. Uploads, view counts, public comments.
--                        Non-Authorized Data under III.E.4.d. Enough for
--                        Studio, format drivers, and the comment corpus.
--     OAuth connection → Authorized Data. Demographics, and only demographics.
--                        Needs the creator's consent AND, to show a third
--                        party, their per-organisation approval (0016).
--
-- Collapsing them would let a declared handle look like consent. These columns
-- keep the weaker claim in the weaker place.
--
-- `channel_id` is stored alongside the handle because handles are mutable and
-- ids are not: a creator who renames should not silently lose their Studio.
-- =============================================================================

alter table public.creators
  add column youtube_handle     text,
  add column youtube_channel_id text,
  add column youtube_checked_at timestamptz;

comment on column public.creators.youtube_handle is
  'The @handle a creator declared at signup, normalised to @name. NOT a connection: '
  'public data only, and never a basis for serving Authorized Data. Verified against '
  'channels.list before it is written — an unresolvable handle leaves Studio empty '
  'forever and nothing downstream would say why.';

comment on column public.creators.youtube_channel_id is
  'Resolved UC... id for the declared handle. Handles are mutable and ids are not, so '
  'a rename does not cost the creator their analysis.';

comment on column public.creators.youtube_checked_at is
  'When the handle last resolved. NULL means never verified — the handle is a claim, '
  'not a fact, and the UI must not present it as connected.';

-- One creator, one declared channel; and two creators must not claim the same
-- one, which would let either of them publish the other's figures.
create unique index creators_youtube_channel_idx
  on public.creators (youtube_channel_id)
  where youtube_channel_id is not null;
