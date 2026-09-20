-- =============================================================================
-- Discovery: finding creators instead of being handed them.
--
-- Until now a customer had to already know which channels to evaluate. Three
-- new ways in — search by criteria, find channels like a reference one, and
-- follow a competitor's public collaborations — and all three end in the same
-- place the old flow did: `workspace_channels`, `channel_analyses` and
-- `campaign_candidates`. NO SECOND REPORTING PIPELINE. A discovered channel is
-- the same channel a pasted URL produces, and the analysis it eventually gets
-- is the same row every other customer shares.
--
-- WHAT IS PRIVATE AND WHAT IS SHARED, restated because this feature is where
-- the line gets tested:
--
--   `channel_analyses` stays the only shared cache. It contains nothing any
--   customer supplied.
--
--   Everything here is ORG-PRIVATE, including the collaboration evidence —
--   which is a surprise until you see what it is keyed on. The rows are public
--   YouTube videos, but WHICH BRANDS somebody searched for is their competitive
--   position stated out loud, and a shared table of (brand, creator, video)
--   would let any customer read the competitor list of any other by looking at
--   what had been collected. The video metadata is cheap to re-fetch; the
--   brand list is not re-derivable and not ours to publish.
--
-- RETENTION. `collaboration_evidence.excerpt` is verbatim third-party text
-- fetched from the API with no user credentials: Non-Authorized Data, 30 days
-- under III.E.4.d, and no amendment extends verbatim text (see
-- VERBATIM_RETENTION_DAYS). The read policy enforces the deadline even if the
-- sweep is late, the same defence `channel_analyses` got in 0037.
--
-- ADDITIVE ONLY. No drop, no column removal, no data loss.
-- =============================================================================

-- --- A search somebody ran --------------------------------------------------

create table public.discovery_searches (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by      uuid not null references auth.users (id) on delete cascade,

  mode            text not null check (mode in ('criteria', 'similar', 'competitor')),

  /** Optional. Discovery may start from a brief, and must not require one. */
  campaign_id     uuid references public.campaigns (id) on delete set null,

  /** Exactly what was asked, so a result can be reproduced and re-read. */
  params          jsonb not null default '{}'::jsonb,

  /** Similar mode only. */
  reference_channel_id text,
  reference_profile    jsonb,

  /**
   * What the run actually reached — queries, calls, units, whether it was
   * truncated and by which bound. Stored with the results rather than
   * recomputed, because the answer changes as quota is spent elsewhere and a
   * result set has to keep describing the run that produced it.
   */
  coverage        jsonb,
  applied_filters jsonb,
  notes           jsonb not null default '[]'::jsonb,

  /** Set when the run produced nothing FOR A NAMEABLE REASON. Null is not
   *  "empty" — it is "this ran and there is something to show". */
  empty_reason    text,

  /** Whether our own scoring was permitted when this ran. A result collected
   *  under a different approval state must not silently read as though it had
   *  been scored. */
  ranking_enabled boolean not null default false,

  collected_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index discovery_searches_org_idx on public.discovery_searches (organization_id, created_at desc);
create index discovery_searches_campaign_idx on public.discovery_searches (campaign_id) where campaign_id is not null;

create trigger discovery_searches_set_updated_at
  before update on public.discovery_searches
  for each row execute function public.tg_set_updated_at();

-- --- What it found ----------------------------------------------------------

create table public.discovery_candidates (
  id          uuid primary key default gen_random_uuid(),
  search_id   uuid not null references public.discovery_searches (id) on delete cascade,

  /** The canonical YouTube channel id. UNIQUE PER SEARCH is the dedupe rule,
   *  enforced here rather than only in application code: one channel found by
   *  four queries is one candidate, and a list that repeats it is not a list of
   *  creators. */
  channel_id  text not null,

  /** Position as ranked, or as YouTube returned when ranking was withheld. */
  position    integer not null,
  /** Candidates sharing a group are NOT distinguished; their order inside it is
   *  arbitrary and the UI says so. Null when nothing was ranked. */
  tied_group  integer,

  /** The score, its coverage, its band and the signals behind it — or null,
   *  which means unranked and never means zero. */
  relevance   jsonb,

  reason      text not null,
  /** The retrieved videos the reason rests on. */
  evidence    jsonb not null default '[]'::jsonb,
  /** Identity and public figures as they stood when collected. */
  facts       jsonb not null default '{}'::jsonb,

  collected_at timestamptz not null default now(),
  unique (search_id, channel_id)
);

create index discovery_candidates_search_idx on public.discovery_candidates (search_id, position);
create index discovery_candidates_channel_idx on public.discovery_candidates (channel_id);

-- --- Step A: brands, and whether a human has confirmed them -----------------

create table public.competitor_brands (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  /**
   * ON DELETE SET NULL, not cascade, and the difference is a retention bug
   * avoided. The search is API-derived and expires on YouTube's 30-day clock;
   * a confirmed competitor list is the CUSTOMER'S OWN WORK and no YouTube
   * policy reaches it. Cascading would delete a brand list somebody assembled
   * by hand because a search that used it got old — the same over-purge
   * `purgeApiSourcedOpinion` exists to stop on the opinion corpus.
   */
  search_id       uuid references public.discovery_searches (id) on delete set null,
  campaign_id     uuid references public.campaigns (id) on delete set null,

  name            text not null check (char_length(name) between 1 and 120),
  relation        text not null default 'direct'
                  check (relation in ('direct', 'adjacent', 'uncertain')),
  rationale       text check (char_length(rationale) <= 1000),
  products        text[] not null default '{}'::text[],

  /** 'customer' is somebody typing a name they know. 'model' is a suggestion,
   *  and a suggestion is not a finding about the market. */
  source          text not null check (source in ('customer', 'model')),

  /**
   * THE GATE BETWEEN STEP A AND STEP B.
   *
   * Collaboration search runs against confirmed brands only. A model-proposed
   * name that nobody confirmed is a plausible string, and spending the day's
   * search budget on it would produce an empty result that reads as a finding
   * about a company that may not exist.
   */
  confirmed       boolean not null default false,
  confirmed_at    timestamptz,
  confirmed_by    uuid references auth.users (id) on delete set null,

  created_at      timestamptz not null default now(),

  -- Confirmation is an act by a person at a time, not a flag. Without this the
  -- column is settable by any update that happens to touch the row.
  constraint competitor_brands_confirmation_is_an_act
    check (confirmed = false or (confirmed_at is not null and confirmed_by is not null)),
  unique (organization_id, search_id, name)
);

create index competitor_brands_org_idx on public.competitor_brands (organization_id, created_at desc);

-- --- Step B: the public evidence -------------------------------------------

create table public.collaboration_evidence (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  search_id       uuid references public.discovery_searches (id) on delete cascade,
  brand_id        uuid references public.competitor_brands (id) on delete cascade,

  brand           text not null,
  /** Named only when the retrieved text named it. Null is not "no product". */
  product         text,

  channel_id      text not null,
  video_id        text not null,
  video_title     text not null,
  video_url       text not null,
  published_at    timestamptz,

  /** Which endpoint and which query produced this row. */
  source          text not null,
  /** Verbatim API Data. 30 days, and no amendment extends it. */
  excerpt         text,

  classification  text not null check (classification in
                    ('explicit_paid', 'affiliate', 'gifted', 'mention', 'customer_confirmed')),
  /**
   * What this class does not establish, stored with the row.
   *
   * Not a UI string: the same record is read by the campaign view, the export
   * and the candidate panel, and a caveat that lives in one component is a
   * caveat the other two ship without.
   */
  ambiguity       text not null,

  collected_at    timestamptz not null default now(),
  unique (search_id, brand, video_id)
);

create index collaboration_evidence_channel_idx on public.collaboration_evidence (organization_id, channel_id);
create index collaboration_evidence_collected_idx on public.collaboration_evidence (collected_at);

-- --- The workspace's saved candidates ---------------------------------------
--
-- Saving is CHEAP ON PURPOSE: a row here, and no analysis queued. The expensive
-- pass runs when somebody asks for it or adds the candidate to a campaign.
-- Shortlisting forty channels must not queue forty model passes.

create table public.workspace_candidates (
  organization_id uuid not null,
  channel_id      text not null,

  /** Where this came from, kept so a shortlist can still answer "why is this
   *  here?" a week later. Null after the search is deleted; the candidate
   *  survives it. */
  search_id       uuid references public.discovery_searches (id) on delete set null,
  discovery_mode  text check (discovery_mode in ('criteria', 'similar', 'competitor')),
  reason          text,
  evidence        jsonb not null default '[]'::jsonb,
  /** Identity and public figures as discovery saw them, so a saved candidate
   *  renders as a channel rather than as a bare id before anyone pays for an
   *  analysis. API Data, and swept on the same 30-day clock as `evidence`. */
  facts           jsonb not null default '{}'::jsonb,

  saved_at        timestamptz not null default now(),
  primary key (organization_id, channel_id),
  -- Inherits the workspace's channel list, so a saved candidate is always a
  -- channel this organisation may read jobs and shares for.
  foreign key (organization_id, channel_id)
    references public.workspace_channels (organization_id, channel_id) on delete cascade
);

-- --- Provenance on the campaign side ----------------------------------------

alter table public.campaign_candidates
  add column if not exists discovery_search_id uuid references public.discovery_searches (id) on delete set null,
  add column if not exists discovery_mode text check (discovery_mode in ('criteria', 'similar', 'competitor')),
  add column if not exists discovery_reason text,
  add column if not exists discovery_evidence jsonb;

comment on column public.campaign_candidates.discovery_reason is
  'Why discovery surfaced this channel. Kept apart from fit_summary: one says why it was '
  'found, the other says how it reads against this brief, and collapsing them would let a '
  'search match read as a recommendation.';

grant insert (discovery_search_id, discovery_mode, discovery_reason, discovery_evidence),
      update (discovery_search_id, discovery_mode, discovery_reason, discovery_evidence)
  on public.campaign_candidates to authenticated;

-- --- Jobs may now be about a search -----------------------------------------

alter table public.analysis_jobs add column if not exists search_id uuid
  references public.discovery_searches (id) on delete cascade;

alter table public.analysis_jobs drop constraint if exists analysis_jobs_has_a_subject;
alter table public.analysis_jobs
  add constraint analysis_jobs_has_a_subject
  check (num_nonnulls(creator_id, channel_id, search_id) = 1);

-- One live discovery job per search per kind. Same reason as the channel index:
-- a retried server action, or a customer clicking twice, must not queue the
-- same bounded-but-metered run again.
create unique index if not exists analysis_jobs_one_live_per_search
  on public.analysis_jobs (search_id, kind)
  where search_id is not null and status in ('queued', 'running');

comment on column public.analysis_jobs.search_id is
  'Set instead of creator_id or channel_id when the job is a discovery run. Exactly one of '
  'the three is always present — see analysis_jobs_has_a_subject.';

-- A cancelled or partial job is terminal and must carry its finish time, the
-- same as succeeded and failed. Restated because the constraint enumerates the
-- NON-terminal states and two new terminal ones just arrived.
alter table public.analysis_jobs drop constraint if exists analysis_jobs_terminal_has_finish;
alter table public.analysis_jobs
  add constraint analysis_jobs_terminal_has_finish
  check (status in ('queued', 'running') or finished_at is not null);

-- --- RLS --------------------------------------------------------------------

alter table public.discovery_searches      enable row level security;
alter table public.discovery_candidates    enable row level security;
alter table public.competitor_brands       enable row level security;
alter table public.collaboration_evidence  enable row level security;
alter table public.workspace_candidates    enable row level security;

create policy discovery_searches_org on public.discovery_searches
  for all to authenticated
  using (organization_id in (select public.user_org_ids()))
  with check (organization_id in (select public.user_org_ids()));

-- Candidates inherit their search's organisation. Which creators a search
-- surfaced for a competitor's brand is exactly as sensitive as the shortlist
-- it will become.
create policy discovery_candidates_org on public.discovery_candidates
  for all to authenticated
  using (
    search_id in (
      select id from public.discovery_searches
      where organization_id in (select public.user_org_ids())
    )
  )
  with check (
    search_id in (
      select id from public.discovery_searches
      where organization_id in (select public.user_org_ids())
    )
  );

create policy competitor_brands_org on public.competitor_brands
  for all to authenticated
  using (organization_id in (select public.user_org_ids()))
  with check (organization_id in (select public.user_org_ids()));

-- Stale verbatim excerpts are unservable even if the retention sweep misses a
-- run — the same read-path defence `channel_analyses` has.
create policy collaboration_evidence_org on public.collaboration_evidence
  for all to authenticated
  using (
    organization_id in (select public.user_org_ids())
    and collected_at > now() - interval '30 days'
  )
  with check (organization_id in (select public.user_org_ids()));

create policy workspace_candidates_org on public.workspace_candidates
  for all to authenticated
  using (organization_id in (select public.user_org_ids()))
  with check (organization_id in (select public.user_org_ids()));

revoke all on public.discovery_searches     from public, anon, authenticated;
revoke all on public.discovery_candidates   from public, anon, authenticated;
revoke all on public.competitor_brands      from public, anon, authenticated;
revoke all on public.collaboration_evidence from public, anon, authenticated;
revoke all on public.workspace_candidates   from public, anon, authenticated;

grant select, insert, update, delete on public.discovery_searches     to authenticated;
-- Results are written by the worker. A customer creating their own candidate
-- rows could put any channel on any search with any reason.
grant select                        on public.discovery_candidates    to authenticated;
grant select, insert, update, delete on public.competitor_brands      to authenticated;
grant select, delete                on public.collaboration_evidence  to authenticated;
grant select, insert, update, delete on public.workspace_candidates   to authenticated;

grant all on public.discovery_searches     to service_role;
grant all on public.discovery_candidates   to service_role;
grant all on public.competitor_brands      to service_role;
grant all on public.collaboration_evidence to service_role;
grant all on public.workspace_candidates   to service_role;

-- --- Queueing, idempotently -------------------------------------------------

create function public.queue_discovery_search(p_search uuid, p_kind public.analysis_job_kind)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_kind not in ('discover_criteria', 'discover_similar', 'discover_collabs') then
    return false;
  end if;
  -- Serialised on the search row so two submissions of the same form cannot
  -- both pass the existence check. The partial unique index is the backstop;
  -- this is what makes the common case return "already queued" instead of an
  -- error.
  perform pg_advisory_xact_lock(hashtext(p_search::text));
  if exists (
    select 1 from public.analysis_jobs
    where search_id = p_search and status in ('queued', 'running')
  ) then
    return false;
  end if;
  insert into public.analysis_jobs (search_id, kind, params) values (p_search, p_kind, '{}'::jsonb);
  return true;
end $$;

revoke all on function public.queue_discovery_search(uuid, public.analysis_job_kind) from public, anon, authenticated;
grant execute on function public.queue_discovery_search(uuid, public.analysis_job_kind) to service_role;

-- --- Cancelling -------------------------------------------------------------
--
-- Callable by the customer, unlike everything else that writes `analysis_jobs`,
-- because stopping work you asked for is not a privileged operation. Scoped to
-- their own organisation, and it only ever moves a job OUT of the active
-- states. The running worker discovers it on its next heartbeat — which already
-- returns false for a job that is no longer `running` — and stops with whatever
-- it has.

create function public.cancel_discovery_search(p_search uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
  perform 1 from public.discovery_searches
   where id = p_search and organization_id in (select public.user_org_ids());
  if not found then return false; end if;

  update public.analysis_jobs
     set status = 'cancelled', finished_at = now(), leased_until = null
   where search_id = p_search and status in ('queued', 'running');
  get diagnostics v_count = row_count;
  return v_count > 0;
end $$;

revoke all on function public.cancel_discovery_search(uuid) from public, anon;
grant execute on function public.cancel_discovery_search(uuid) to authenticated;

-- --- Committing a run's results --------------------------------------------
--
-- One RPC, one transaction, holding the lease. Same shape as
-- `commit_channel_collection` and for the same reason: a worker whose claim
-- expired mid-run must not overwrite the results of the worker that took over.
-- Candidates are replaced wholesale rather than merged — a re-run is a new
-- reading of a changing index, and half of one reading beside half of another
-- is a result set that describes no moment.

create function public.commit_discovery_results(
  p_job     uuid,
  p_worker  text,
  p_search  uuid,
  p_summary jsonb,
  p_rows    jsonb,
  p_evidence jsonb default '[]'::jsonb
)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  j public.analysis_jobs;
  v_org uuid;
begin
  select * into j from public.analysis_jobs where id = p_job for update;
  if j.id is null or j.worker is distinct from p_worker or j.status <> 'running'
     or j.leased_until <= now() or j.search_id is distinct from p_search then
    return false;
  end if;

  select organization_id into v_org from public.discovery_searches where id = p_search;
  if v_org is null then return false; end if;

  update public.discovery_searches
     set coverage        = p_summary -> 'coverage',
         applied_filters = p_summary -> 'appliedFilters',
         notes           = coalesce(p_summary -> 'notes', '[]'::jsonb),
         empty_reason    = nullif(p_summary ->> 'emptyReason', ''),
         reference_profile = p_summary -> 'reference',
         ranking_enabled = coalesce((p_summary ->> 'rankingEnabled')::boolean, false),
         collected_at    = now()
   where id = p_search;

  delete from public.discovery_candidates where search_id = p_search;
  insert into public.discovery_candidates (search_id, channel_id, position, tied_group, relevance, reason, evidence, facts)
  select p_search,
         row ->> 'channelId',
         (row ->> 'position')::integer,
         nullif(row ->> 'tiedGroup', '')::integer,
         row -> 'relevance',
         coalesce(row ->> 'reason', ''),
         coalesce(row -> 'evidence', '[]'::jsonb),
         coalesce(row -> 'facts', '{}'::jsonb)
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as row
   where row ->> 'channelId' is not null
  on conflict (search_id, channel_id) do nothing;

  delete from public.collaboration_evidence where search_id = p_search;
  insert into public.collaboration_evidence
    (organization_id, search_id, brand, product, channel_id, video_id, video_title, video_url,
     published_at, source, excerpt, classification, ambiguity, collected_at)
  select v_org,
         p_search,
         e ->> 'brand',
         nullif(e ->> 'product', ''),
         e ->> 'channelId',
         e ->> 'videoId',
         coalesce(e ->> 'videoTitle', ''),
         coalesce(e ->> 'videoUrl', ''),
         nullif(e ->> 'publishedAt', '')::timestamptz,
         coalesce(e ->> 'source', 'unknown'),
         nullif(e ->> 'excerpt', ''),
         coalesce(e ->> 'classification', 'mention'),
         coalesce(e ->> 'ambiguity', ''),
         now()
    from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb)) as e
   where e ->> 'brand' is not null and e ->> 'videoId' is not null
  on conflict (search_id, brand, video_id) do nothing;

  return true;
end $$;

revoke all on function public.commit_discovery_results(uuid, text, uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.commit_discovery_results(uuid, text, uuid, jsonb, jsonb, jsonb) to service_role;

comment on table public.discovery_searches is
  'One discovery run and what it reached. Org-private: which creators a brand is looking for, '
  'and which competitors it is following, are both competitive information.';

comment on table public.collaboration_evidence is
  'Public YouTube videos tying a brand to a creator, held per organisation rather than shared '
  'BECAUSE the brand list is the customer''s competitive position. Excerpts are verbatim '
  'Non-Authorized Data: 30 days, enforced in the read policy as well as by the sweep.';
