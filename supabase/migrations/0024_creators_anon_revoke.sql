-- =============================================================================
-- anon must reach `creators` only through the view built for it.
--
-- `creator_public_profiles` carries this comment since 0001:
--
--     'Everything anon may read. Locked metrics are absent from the projection
--      entirely, so they are never serialised to an unauthorised browser…'
--
-- That was not true of the live database. 0001 revoked insert, update and
-- delete on public.creators from anon and left SELECT in place, and the policy
-- `creators_public_read` is `to anon, authenticated using (true)` — so an
-- anonymous client could read the base table directly and get every column the
-- view was written to omit:
--
--     user_id, youtube_channel_id, youtube_checked_at, updated_at,
--     budget_min, budget_max, budget_negotiable
--
-- `user_id` is the one that matters: it is the auth.users id, and publishing it
-- next to a public handle links a creator's public profile to their auth
-- identity for anyone who calls the REST endpoint. Nothing in the app reads it
-- from a browser; it is there because the grant was table-wide and the view was
-- assumed to be the only door.
--
-- Found by asking the anon key for it against a real project. No fixture can
-- catch this: the entire class of defect lives in grants that only exist in
-- Postgres.
--
-- Safe because `creator_public_profiles` is an OWNER-RIGHTS view — 0001 says so
-- and says why — so it keeps returning rows after anon loses the base table.
-- The directory view is `security_invoker` and is unaffected: it was already
-- granted to `authenticated` only.
-- =============================================================================

revoke select on public.creators from anon;

-- The policy is now unreachable for anon, but leaving `to anon` on it would
-- keep saying that anonymous row access is intended. It is not.
drop policy if exists creators_public_read on public.creators;

create policy creators_public_read on public.creators
  for select to authenticated using (true);

comment on policy creators_public_read on public.creators is
  'Signed-in readers only. Anonymous visitors read public.creator_public_profiles, '
  'which projects the public columns and omits user_id — see 0024.';
