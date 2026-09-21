-- =============================================================================
-- Relevance analyses: the same evidence, read for one brand.
--
-- TWO REPORTS, NOT ONE LONGER ONE. A channel report describes a creator and is
-- reusable — the same facts answer every brand's first question. A relevance
-- analysis is about ONE brand's product against ONE snapshot of that evidence,
-- and it is worthless to anybody else. Storing the second inside the first is
-- how a shared channel link starts carrying somebody's brief.
--
-- `campaign_candidates.fit_summary` already held a campaign-scoped read. It
-- stays exactly as it is. What it could not express is the case this table
-- exists for: a brand with no campaign yet, which is most of them on the day
-- they first look at a creator.
--
-- STALENESS IS TWO CLOCKS, and both are stored rather than inferred:
--
--   `evidence_fetched_at` is the snapshot the analysis was written against. The
--   channel's data expires and is recollected; an analysis of the old snapshot
--   is not wrong, it is ABOUT SOMETHING THAT IS GONE, and it has to say so
--   rather than be silently reused.
--
--   `context_fingerprint` is the brief it was written against. Editing a
--   campaign's product changes the question, so the old answer is stale even
--   though every figure behind it is current. 0037 already established this
--   rule for `fit_summary`; this is the same rule for a wider surface.
--
-- Nothing here is ever readable outside the workspace: an agency's assessment
-- of a creator for a client is competitive information twice over.
-- =============================================================================

create table public.relevance_analyses (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,

  /** The channel this reads. Text, like every other channel reference here. */
  channel_id          text not null,

  brand_id            uuid not null references public.brands (id) on delete cascade,
  /** Null for a brand-level read, which is the common first question. */
  campaign_id         uuid references public.campaigns (id) on delete cascade,

  /** The evidence snapshot. Compared against channel_analyses.data_fetched_at. */
  evidence_fetched_at timestamptz not null,
  /** The brief. Compared against a fingerprint recomputed on read. */
  context_fingerprint text not null,

  /**
   * The requirement matrix: deterministic, evidence-cited, and produced
   * without any model. This is the half that survives when approval is not
   * configured, which is why it is stored separately from the narrative.
   */
  matrix              jsonb not null default '[]'::jsonb,

  /** The gated model reading, or null where approval is not configured. */
  narrative           jsonb,
  model               text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ONE ANALYSIS PER (workspace, channel, brand, campaign).
--
-- Two partial indexes rather than one constraint, because Postgres treats NULLs
-- as distinct: a single `unique (…, campaign_id)` would happily store five
-- brand-level analyses of the same channel and the page would pick one at
-- random.
create unique index relevance_one_per_campaign
  on public.relevance_analyses (organization_id, channel_id, brand_id, campaign_id)
  where campaign_id is not null;
create unique index relevance_one_per_brand
  on public.relevance_analyses (organization_id, channel_id, brand_id)
  where campaign_id is null;

create index relevance_channel_idx on public.relevance_analyses (organization_id, channel_id);

create trigger relevance_analyses_set_updated_at
  before update on public.relevance_analyses
  for each row execute function public.tg_set_updated_at();

-- The brand and the campaign must both belong to the workspace on the row.
-- `brand_belongs_to_owner` (0041) already checks the brand; the campaign needs
-- the same treatment, and a foreign key cannot express either.
create function public.relevance_context_in_workspace() returns trigger
language plpgsql set search_path = public as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.brands where id = new.brand_id;
  if v_org is distinct from new.organization_id then
    raise exception 'brand_not_in_workspace' using errcode = 'check_violation';
  end if;
  if new.campaign_id is not null then
    select organization_id into v_org from public.campaigns where id = new.campaign_id;
    if v_org is distinct from new.organization_id then
      raise exception 'campaign_not_in_workspace' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

create trigger relevance_context_check
  before insert or update of brand_id, campaign_id, organization_id on public.relevance_analyses
  for each row execute function public.relevance_context_in_workspace();

alter table public.relevance_analyses enable row level security;

create policy relevance_org on public.relevance_analyses
  for all to authenticated
  using (organization_id in (select public.user_org_ids()))
  with check (organization_id in (select public.user_org_ids()));

revoke all on public.relevance_analyses from public, anon, authenticated;
grant select, insert, update, delete on public.relevance_analyses to authenticated;
grant all on public.relevance_analyses to service_role;

-- --- Sharing a relevance analysis, separately from the channel report -------
--
-- `report_shares` already carries a channel and an optional campaign with
-- explicit opt-ins for notes, budget and fee. What it could not say is WHICH
-- REPORT the link is for. Choosing "both" must not become a way to attach a
-- brief to a link somebody thought was a channel report.

alter table public.report_shares
  add column if not exists include_channel boolean not null default true,
  add column if not exists include_relevance boolean not null default false,
  add column if not exists brand_id uuid references public.brands (id) on delete cascade;

comment on column public.report_shares.include_relevance is
  'Off by default. A relevance analysis contains the customer''s own brief read against a '
  'creator; it leaves the workspace only when somebody ticks this box.';

-- A link has to show something.
alter table public.report_shares drop constraint if exists report_shares_shows_something;
alter table public.report_shares
  add constraint report_shares_shows_something
  check (include_channel or include_relevance);

grant insert (include_channel, include_relevance, brand_id),
      update (include_channel, include_relevance, brand_id)
  on public.report_shares to authenticated;

comment on table public.relevance_analyses is
  'One brand''s read of one channel against one evidence snapshot. Workspace-private: an '
  'agency''s assessment of a creator for a client is competitive information twice over.';
