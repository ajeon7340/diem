-- =============================================================================
-- Creator signup was impossible. Two migrations added columns and granted
-- UPDATE on them without granting INSERT.
--
--     [creators] insert failed  permission denied for table creators
--
-- 0001 locked this table down deliberately: `revoke insert, update, delete …
-- from authenticated`, then column-level grants that leave `is_verified` out,
-- so a creator cannot create a self-verified row. That is right and stays.
--
-- What it could not anticipate is that a COLUMN-LEVEL grant has to be extended
-- every time a column is added, and twice it was not:
--
--   0020  added budget_min, budget_max, budget_negotiable
--         and granted UPDATE on them — not INSERT
--   0022  added youtube_handle, youtube_channel_id, youtube_checked_at
--         and granted neither
--
-- Postgres rejects the whole statement if any one column in it is ungranted,
-- so `/onboarding/creator` returned "Could not create your profile. Please try
-- again." for every real signup — and trying again could never work. The
-- fixture path writes no row, so it passed; the failure needs a database.
--
-- The three YouTube columns are self-declared, exactly like `youtube_handle`
-- was designed to be (0022: "Declared, not connected"). A creator can name any
-- channel; naming it proves nothing, because `is_verified` remains outside
-- every grant and only the ingestion worker can set it. That separation is
-- what makes it safe to let a creator write these at all.
-- =============================================================================

grant insert (budget_min, budget_max, budget_negotiable,
              youtube_handle, youtube_channel_id, youtube_checked_at)
  on public.creators to authenticated;

-- 0022 granted no UPDATE on these either, so a creator could declare a channel
-- at signup and never change it. /dashboard/settings offers the field.
grant update (youtube_handle, youtube_channel_id, youtube_checked_at)
  on public.creators to authenticated;

comment on column public.creators.youtube_channel_id is
  'Resolved from the declared handle at signup. Self-declared like the handle '
  'itself: it is not evidence of ownership, and is_verified stays service-role '
  'only. See 0022 and 0025.';
