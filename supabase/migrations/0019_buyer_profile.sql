-- =============================================================================
-- adfit — Migration 0019: who is reading
--
-- The fit read is the one thing in this report that can say something the
-- tiles cannot, and its whole claim is that it is written for the buyer in
-- front of it. Until now `organizations` held a NAME. "Written for Northbeam
-- Media" over a paragraph that knows nothing about Northbeam Media is a
-- personalisation that is not one, and a reader spots it immediately.
--
-- These columns are what makes the read specific: what the buyer sells, who
-- they sell it to, and what they are trying to do. Every one of them is
-- optional. A half-filled profile produces a thinner read, which is correct —
-- and a buyer who fills nothing in should get a paragraph that says so rather
-- than one that invents a campaign for them.
--
-- COLUMN GRANTS, not just RLS, and for the same reason as 0001: `billing_plan`
-- stays out of client reach so an org admin cannot upgrade themselves, and
-- widening the grant to the whole table to add a description field would have
-- undone that. The grant below names the new columns and nothing else.
-- =============================================================================

alter table public.organizations
  add column industry    text check (char_length(industry) <= 80),
  add column sells       text check (char_length(sells) <= 400),
  add column audience    text check (char_length(audience) <= 400),
  add column categories  text[] not null default '{}',
  add column objectives  text[] not null default '{}';

comment on column public.organizations.sells is
  'What this buyer actually sells, in their own words. The single most useful field for the fit '
  'read: "a $40 refillable cleanser" and "enterprise payroll software" ask completely different '
  'questions of the same creator. Optional — an empty profile must produce a thinner paragraph '
  'that says so, never an invented campaign.';

comment on column public.organizations.categories is
  'CAMPAIGN_CATEGORIES they buy in. Fixed vocabulary rather than free text so the same word means '
  'the same thing across buyers — see src/types.';

comment on column public.organizations.objectives is
  'What they are buying for: awareness | consideration | conversion | launch | always_on. Changes '
  'the read more than any figure does — a creator who is wrong for direct response can be exactly '
  'right for a launch, and a pitch that ignores the objective is guessing at which one it is.';

-- Named columns only. `billing_plan` and `stripe_customer_id` stay unreachable
-- from a client: an org admin must not be able to upgrade their own plan, and
-- that guarantee is column-level, not policy-level.
grant update (name, industry, sells, audience, categories, objectives)
  on public.organizations to authenticated;
