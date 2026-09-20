-- =============================================================================
-- Brands: the thing a campaign is FOR, kept apart from the workspace that runs
-- it.
--
-- Four concepts were collapsed into two. `organizations` held both "who is
-- using adfit" and "what they sell" (0019: industry, sells, audience), which is
-- right for a brand and actively wrong for an agency — an agency's own
-- description is "we are a media agency in Seoul", and using that as product
-- context for their client's grinder campaign produces a read about the wrong
-- company. `campaigns.brand` held a NAME and nothing else, so the same client's
-- description was retyped into every campaign.
--
--   workspace  the company or agency using adfit            organizations
--   brand      whose product is being promoted              brands      ← new
--   campaign   one product, brief and objective             campaigns
--   search     throwaway topics and filters                 discovery_searches
--
-- An agency holds many brands in one workspace. So does a brand workspace —
-- companies have product lines and sub-brands, and needing a second
-- architecture for that would be a worse answer than one that already works.
--
-- NOTHING IS INFERRED AND NOTHING IS MERGED. `campaigns.brand` is free text
-- somebody typed, and two campaigns reading "Northbeam" may be two different
-- clients at two different agencies or one client typed twice. A migration that
-- created a brand per distinct string and linked campaigns to it would silently
-- merge client relationships on a string match, which is a data-integrity
-- failure dressed as a convenience. `brand_id` starts NULL on every existing
-- row and a person links them, one at a time, in Settings.
--
-- ADDITIVE ONLY. No drop, no column removal, no data loss. `organizations.sells`
-- and the rest of 0019 stay exactly where they are and keep working.
-- =============================================================================

create table public.brands (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,

  name            text not null check (char_length(btrim(name)) between 1 and 120),

  /** What this brand sells, in a person's own words. The single most useful
   *  field downstream: "a £180 hand grinder" and "enterprise payroll" ask
   *  completely different questions of the same creator. */
  sells           text check (char_length(sells) <= 600),

  /** CAMPAIGN_CATEGORIES plus anything the customer typed. Free-form on
   *  purpose: a fixed list cannot anticipate every product, and forcing a
   *  wrong-but-nearby category is worse than recording the right words. */
  categories      text[] not null default '{}'::text[],

  /** A reference somebody saved. NOTHING READS IT. It is not fetched, not
   *  scraped and not enriched — there is no supported enrichment feature here,
   *  and inventing profile fields from a page nobody authorised us to read is
   *  the opposite of what this table is for. */
  website         text check (char_length(website) <= 400),

  customer_needs  text check (char_length(customer_needs) <= 600),

  /**
   * DEFAULT MARKETS AND CONTENT LANGUAGES ARE SEARCH PREFERENCES.
   *
   * ISO 3166-1 alpha-2 and ISO 639-1, because that is what `search.list` takes
   * as `regionCode` and `relevanceLanguage`. They say which results this
   * customer wants YouTube to prefer. They say NOTHING about who watches a
   * channel that comes back — that is Analytics data behind each creator's own
   * grant, and no surface may present these as audience demographics.
   */
  markets           text[] not null default '{}'::text[],
  content_languages text[] not null default '{}'::text[],

  /** Archived, never deleted: a brand's campaigns and their history outlive the
   *  relationship, and a client who leaves must not take the record of what was
   *  run for them with it. */
  archived_at     timestamptz,

  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ONE BRAND PER NAME PER WORKSPACE, case- and space-insensitively.
--
-- This is what makes onboarding idempotent. A retried server action, a
-- double-submitted form or a customer who presses Continue twice must not leave
-- an agency with "Northbeam" and "northbeam " as two clients — and nobody
-- notices two rows that render identically until their campaigns are split
-- across both.
create unique index brands_one_per_name on public.brands (organization_id, lower(btrim(name)));
create index brands_org_idx on public.brands (organization_id, archived_at nulls first, created_at);

create trigger brands_set_updated_at
  before update on public.brands
  for each row execute function public.tg_set_updated_at();

-- --- The workspace's own pointers -------------------------------------------

alter table public.organizations
  add column if not exists default_brand_id uuid references public.brands (id) on delete set null;

/**
 * Where brand setup got to.
 *
 * 'pending' is NOT 'skipped'. Somebody who has not reached the step yet should
 * be taken back to it; somebody who chose "Set up later" has answered, and
 * putting them through it again every visit is the product arguing with their
 * decision. Defaulting existing workspaces to 'skipped' is deliberate for the
 * same reason — they never saw the step, and they must not be interrupted by it
 * on their next sign-in.
 */
alter table public.organizations
  add column if not exists brand_setup_state text not null default 'skipped'
  check (brand_setup_state in ('pending', 'skipped', 'done'));

comment on column public.organizations.brand_setup_state is
  'pending = has not finished the brand step; skipped = chose Set up later; done = saved a brand. '
  'Existing workspaces default to skipped because they never saw the step.';

-- --- What a campaign and a search are for ------------------------------------

alter table public.campaigns
  add column if not exists brand_id uuid references public.brands (id) on delete set null;

comment on column public.campaigns.brand_id is
  'The brand this campaign is for. NULL on every campaign that predates brands, and never '
  'backfilled by matching campaigns.brand as a string — see the header of 0041. The brief''s own '
  'product, use case, audience and objective stay on the campaign: a brand default is a starting '
  'point, not an inheritance, and editing the brand must not rewrite a brief somebody approved.';

alter table public.discovery_searches
  add column if not exists brand_id uuid references public.brands (id) on delete set null;

create index campaigns_brand_idx on public.campaigns (brand_id) where brand_id is not null;
create index discovery_searches_brand_idx on public.discovery_searches (brand_id) where brand_id is not null;

/**
 * A brand pointer must point inside the same workspace.
 *
 * A foreign key cannot say this — it checks the row exists, not whose it is —
 * and RLS does not either, because the policy admits the CAMPAIGN and the
 * brand_id is just a column on it. Without this, one workspace could attach
 * another's brand id to its own campaign and read the name back off a join.
 */
create function public.brand_belongs_to_owner() returns trigger
language plpgsql set search_path = public as $$
declare v_org uuid; v_brand_org uuid;
begin
  if new.brand_id is null then return new; end if;
  v_org := new.organization_id;
  select organization_id into v_brand_org from public.brands where id = new.brand_id;
  if v_brand_org is null or v_brand_org <> v_org then
    raise exception 'brand_not_in_workspace' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger campaigns_brand_in_workspace
  before insert or update of brand_id, organization_id on public.campaigns
  for each row execute function public.brand_belongs_to_owner();

create trigger discovery_searches_brand_in_workspace
  before insert or update of brand_id, organization_id on public.discovery_searches
  for each row execute function public.brand_belongs_to_owner();

-- --- RLS --------------------------------------------------------------------

alter table public.brands enable row level security;

-- A brand profile is the customer's own commercial description and, for an
-- agency, the identity of a client. Neither belongs in any shared cache and
-- neither is visible outside the workspace.
create policy brands_org on public.brands
  for all to authenticated
  using (organization_id in (select public.user_org_ids()))
  with check (organization_id in (select public.user_org_ids()));

revoke all on public.brands from public, anon, authenticated;
grant select, insert, update, delete on public.brands to authenticated;
grant all on public.brands to service_role;

-- Named columns only, the same rule 0019 set: widening this to the whole table
-- to add a pointer would put `billing_plan` back in client reach.
grant update (default_brand_id, brand_setup_state) on public.organizations to authenticated;
grant insert (brand_id), update (brand_id) on public.campaigns to authenticated;

-- --- Idempotent save ---------------------------------------------------------
--
-- Through a function rather than a REST upsert because the conflict target is a
-- functional index, and because this is where "does this workspace own this
-- brand" is decided once instead of at three call sites.

create function public.save_brand(
  p_org uuid,
  p_id uuid,
  p_name text,
  p_sells text,
  p_categories text[],
  p_website text,
  p_customer_needs text,
  p_markets text[],
  p_languages text[],
  p_make_default boolean default false
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_first boolean;
begin
  if p_org not in (select public.user_org_ids()) then
    raise exception 'not_a_member' using errcode = 'insufficient_privilege';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 120 then
    raise exception 'invalid_brand_name' using errcode = 'check_violation';
  end if;

  v_first := not exists (select 1 from public.brands where organization_id = p_org);

  if p_id is not null then
    update public.brands set
      name = v_name, sells = p_sells, categories = coalesce(p_categories, '{}'),
      website = p_website, customer_needs = p_customer_needs,
      markets = coalesce(p_markets, '{}'), content_languages = coalesce(p_languages, '{}')
    where id = p_id and organization_id = p_org
    returning id into v_id;
    if v_id is null then
      raise exception 'brand_not_in_workspace' using errcode = 'insufficient_privilege';
    end if;
  else
    -- The idempotent path. A second submission of the same form updates the row
    -- it created rather than adding a twin nobody can tell apart.
    insert into public.brands
      (organization_id, name, sells, categories, website, customer_needs, markets, content_languages, created_by)
    values
      (p_org, v_name, p_sells, coalesce(p_categories, '{}'), p_website, p_customer_needs,
       coalesce(p_markets, '{}'), coalesce(p_languages, '{}'), auth.uid())
    on conflict (organization_id, lower(btrim(name))) do update set
      sells = excluded.sells, categories = excluded.categories, website = excluded.website,
      customer_needs = excluded.customer_needs, markets = excluded.markets,
      content_languages = excluded.content_languages,
      -- An archived brand somebody re-adds by name comes back rather than
      -- failing on a row they cannot see.
      archived_at = null
    returning id into v_id;
  end if;

  -- The first brand a workspace saves becomes its default. After that only an
  -- explicit request moves it: silently repointing the default when somebody
  -- edits their third client is how the wrong brand ends up on a search.
  if p_make_default or v_first then
    update public.organizations set default_brand_id = v_id where id = p_org;
  end if;
  update public.organizations set brand_setup_state = 'done'
   where id = p_org and brand_setup_state <> 'done';

  return v_id;
end $$;

revoke all on function public.save_brand(uuid, uuid, text, text, text[], text, text, text[], text[], boolean) from public, anon;
grant execute on function public.save_brand(uuid, uuid, text, text, text[], text, text, text[], text[], boolean) to authenticated;

comment on table public.brands is
  'The brand a campaign is for. Workspace-private: an agency''s client list and every brand''s '
  'commercial description are competitive information, and neither ever enters the shared '
  'channel_analyses cache.';
