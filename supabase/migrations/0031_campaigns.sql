-- =============================================================================
-- The product turns around: the customer is the advertiser, not the creator.
--
-- Everything analytical here already worked without a creator account —
-- `analyzeChannel`, `fetchAllComments`, `classifyAxes`, `buildClusters` and the
-- promotions scan all take a channel identifier and read public data. What was
-- creator-coupled was the STORAGE: every row hung off `creators.id`, so a
-- channel nobody had signed up could be analysed but not kept.
--
-- Three tables, and the split between them is the point:
--
--   channel_analyses     PUBLIC data about a public channel. Not owned by any
--                        customer, and deliberately readable by every
--                        authenticated user: two agencies evaluating the same
--                        creator should not pay twice to read the same
--                        comment section, and nothing in here came from either
--                        of them.
--   campaigns            The CUSTOMER's brief — brand, product, audience,
--                        objective, what to avoid, budget. Org-private.
--   campaign_candidates  Which channels this customer is considering, their
--                        notes, the fee they were quoted, and the written read
--                        of that channel against THIS brief. Org-private.
--
-- A customer's shortlist is competitive information. That an agency is looking
-- at a creator, what they budgeted, and what our read said, must never be
-- visible to another agency — while the underlying channel analysis is shared
-- by design. That is the whole reason these are separate tables rather than
-- one wide one.
--
-- NOTHING IS DELETED. `creators`, `report_metrics`, the directory, the access
-- requests and the offers all stay exactly as they are: they still work, the
-- seeded demo data still renders, and a creator who signed up still has a
-- media kit. The new flow simply does not require any of it.
-- =============================================================================

-- --- Public channel analysis, owned by nobody -------------------------------

create table public.channel_analyses (
  -- The YouTube channel id, not a uuid: it is the natural key, it is stable
  -- across renames, and two customers analysing the same channel must land on
  -- the same row without a lookup.
  channel_id        text primary key,
  handle            text,
  title             text not null,
  avatar_url        text,
  description       text,
  subscribers       bigint check (subscribers >= 0),

  /** Everything the public-data pass produces. Same shapes as report_metrics,
   *  deliberately: the mappers, the zod schemas and the panels are reused
   *  rather than reimplemented. */
  output_stats      jsonb not null default '[]'::jsonb,
  platform_breakdown jsonb not null default '[]'::jsonb,
  promotions        jsonb not null default '[]'::jsonb,
  comment_coverage  jsonb not null default '{}'::jsonb,
  comment_register  jsonb,
  comment_risks     jsonb not null default '[]'::jsonb,
  moderation        jsonb,
  comment_axes      jsonb,
  top_comment_clusters jsonb not null default '[]'::jsonb,
  sentiment_score   double precision check (sentiment_score between 0 and 100),
  purchase_intent_rate double precision check (purchase_intent_rate between 0 and 1),
  purchase_intent_basis text,
  intent_comments_scored integer,
  product_posts_analyzed integer,
  engagement_rate   double precision check (engagement_rate between 0 and 1),
  comments_analyzed integer not null default 0 check (comments_analyzed >= 0),

  /** Provenance, because the report has to state it. */
  model_version     text,
  analysed_at       timestamptz,
  data_fetched_at   timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index channel_analyses_handle_idx on public.channel_analyses (lower(handle));
create index channel_analyses_fetched_idx on public.channel_analyses (data_fetched_at);

create trigger channel_analyses_set_updated_at
  before update on public.channel_analyses
  for each row execute function public.tg_set_updated_at();

-- --- The customer's brief ---------------------------------------------------

create table public.campaigns (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by      uuid not null references auth.users (id) on delete cascade,

  name            text not null check (char_length(name) between 2 and 120),
  brand           text check (char_length(brand) <= 120),
  product         text check (char_length(product) <= 2000),
  audience        text check (char_length(audience) <= 2000),
  objective       text check (char_length(objective) <= 200),
  /** Subjects this advertiser does not want their ad beside. Free text on
   *  purpose: a fixed list cannot anticipate what a given brand must avoid. */
  avoid_topics    text check (char_length(avoid_topics) <= 2000),

  budget_total    numeric(12, 2) check (budget_total >= 0),
  budget_currency char(3) not null default 'USD',

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index campaigns_org_idx on public.campaigns (organization_id, created_at desc);

create trigger campaigns_set_updated_at
  before update on public.campaigns
  for each row execute function public.tg_set_updated_at();

-- --- Who this customer is considering ---------------------------------------

create table public.campaign_candidates (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references public.campaigns (id) on delete cascade,
  channel_id    text not null,

  /** What the customer typed, kept verbatim so a failed lookup can be shown
   *  back to them as what they entered rather than as a normalised guess. */
  submitted_as  text,

  /** The fee this candidate quoted, if any. The ONLY basis on which a CPM may
   *  be computed for them — see the note on `channel_analyses`: nothing public
   *  reveals what a creator charges, and inventing one is the failure mode
   *  this column exists to avoid. */
  proposed_fee  numeric(12, 2) check (proposed_fee >= 0),
  fee_currency  char(3) not null default 'USD',

  notes         text check (char_length(notes) <= 4000),
  status        text not null default 'considering'
                check (status in ('considering', 'shortlisted', 'rejected')),

  /** The written read of THIS channel against THIS brief. Campaign-specific,
   *  so it cannot live on the shared channel row. */
  fit_summary   jsonb,
  fit_model     text,
  fit_written_at timestamptz,

  added_at      timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (campaign_id, channel_id)
);

create index campaign_candidates_campaign_idx on public.campaign_candidates (campaign_id, added_at);
create index campaign_candidates_channel_idx on public.campaign_candidates (channel_id);

create trigger campaign_candidates_set_updated_at
  before update on public.campaign_candidates
  for each row execute function public.tg_set_updated_at();

-- --- Jobs may now be about a channel rather than a creator ------------------
--
-- The worker, the lease, the claim and the retry rules are unchanged; only
-- what a job POINTS AT is widened. A second jobs table would have duplicated
-- all of that for no reason.

alter table public.analysis_jobs
  alter column creator_id drop not null,
  add column channel_id text;

alter table public.analysis_jobs
  add constraint analysis_jobs_has_a_subject
  check (num_nonnulls(creator_id, channel_id) = 1);

-- The partial unique index that stops a second job being queued for the same
-- subject has to cover the new one too.
create unique index if not exists analysis_jobs_one_live_per_channel
  on public.analysis_jobs (channel_id, kind)
  where channel_id is not null and status in ('queued', 'running');

comment on column public.analysis_jobs.channel_id is
  'Set instead of creator_id when the job is about a public channel nobody has signed up. '
  'Exactly one of the two is always present — see analysis_jobs_has_a_subject.';

-- --- RLS --------------------------------------------------------------------

alter table public.channel_analyses      enable row level security;
alter table public.campaigns             enable row level security;
alter table public.campaign_candidates   enable row level security;

-- Public analysis of a public channel. Readable by any signed-in user
-- BECAUSE it is public: it contains nothing any customer supplied, and making
-- each org re-fetch the same comment section would multiply the API cost by
-- the number of customers for an identical answer. Written by the worker only.
create policy channel_analyses_read on public.channel_analyses
  for select to authenticated using (true);

-- The brief is the customer's. `user_org_ids()` is the same membership check
-- every other org-scoped policy here uses.
create policy campaigns_org_all on public.campaigns
  for all to authenticated
  using (organization_id in (select public.user_org_ids()))
  with check (organization_id in (select public.user_org_ids()));

-- Candidates inherit the campaign's organisation. A shortlist is competitive
-- information: which creators an agency is looking at, what they budgeted and
-- what our read said must not be visible to another agency.
create policy campaign_candidates_org_all on public.campaign_candidates
  for all to authenticated
  using (
    campaign_id in (
      select id from public.campaigns where organization_id in (select public.user_org_ids())
    )
  )
  with check (
    campaign_id in (
      select id from public.campaigns where organization_id in (select public.user_org_ids())
    )
  );

revoke all on public.channel_analyses    from public, anon, authenticated;
revoke all on public.campaigns           from public, anon, authenticated;
revoke all on public.campaign_candidates from public, anon, authenticated;

grant select on public.channel_analyses to authenticated;
-- The customer owns their own briefs and shortlists outright.
grant select, insert, update, delete on public.campaigns to authenticated;
grant select, insert, update, delete on public.campaign_candidates to authenticated;

comment on table public.channel_analyses is
  'Public-data analysis of a public YouTube channel, keyed by channel id and shared across '
  'customers. Contains nothing any customer supplied. Worker-written: no client INSERT.';

comment on table public.campaigns is
  'An advertiser or agency brief. Org-private — a competitor must not learn what a brand is '
  'planning or budgeting.';

comment on table public.campaign_candidates is
  'Channels one customer is considering for one campaign, with their notes, the fee they were '
  'quoted, and the read of that channel against that brief. Org-private for the same reason.';
