-- =============================================================================
-- A creator was being asked to release their audience data to "An organisation".
--
-- `demographics_grants` exists because YouTube Developer Policy III.E.3.b wants
-- a creator's express approval for a NAMED company — not a general release. The
-- dashboard could not name it: the inbox query embeds `organizations(name)`,
-- and `organizations_member_read` scopes that table to orgs the caller belongs
-- to. A creator belongs to none, so the embed came back null and the card fell
-- through to its placeholder:
--
--     An organisation  pending
--     Wants to see your audience age, gender and geography.
--
-- The mapper's comment says the creator "is owed the name when we have it".
-- We have it. It was one join away and the join was the thing RLS refused.
--
-- Approving an unnamed party is not the consent this table was built to record,
-- so this is a correctness problem with the policy requirement, not a polish
-- issue. Found by running the flow end to end against a real project; the
-- fixture path returns [] from this query and renders no card at all.
--
-- An owner-rights view, for the same reason `creator_public_profiles` is one:
-- a security_invoker view would hit exactly the RLS that hides the name. The
-- exposure is one column — the organisation's name — to the one creator that
-- organisation has already asked, and the WHERE clause is what enforces that.
-- =============================================================================

create view public.demographics_grant_inbox as
select
  g.id,
  g.creator_id,
  g.organization_id,
  o.name as organization_name,
  g.status,
  g.requested_at,
  g.decided_at,
  g.view_count,
  g.last_viewed_at
from public.demographics_grants g
join public.organizations o on o.id = g.organization_id
-- Owner rights means RLS on the tables above does not run, so the row filter
-- has to be here and has to be the only way in. `owns_creator` reads auth.uid()
-- from the request JWT, which an owner-rights view does not change.
where public.owns_creator(g.creator_id);

comment on view public.demographics_grant_inbox is
  'The creator side of demographics_grants, with the requesting organisation NAMED. '
  'Owner-rights on purpose: organizations_member_read hides the name from the one '
  'person whose decision depends on it. Restricted to the caller''s own creator rows '
  'by the WHERE clause — see 0026.';

revoke all on public.demographics_grant_inbox from public, anon;
grant select on public.demographics_grant_inbox to authenticated;
