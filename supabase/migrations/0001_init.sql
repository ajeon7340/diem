-- =============================================================================
-- adfit — Verified AI Media Kit & Collaboration Hub
-- Migration 0001: schema, RLS, and the dual-track access model.
--
-- Two funnels share one report table:
--
--   Track A (free, 1:1 inbound)  brand → access_requests → creator approves
--                                → time-limited access_token unlocks the report
--   Track B (paid, outbound)     pro_agency org member → instant access to any
--                                creator with is_directory_visible = true
--
-- Both are enforced in Postgres, not in the app. The paywall for Track B *is*
-- an RLS policy on report_metrics, which is why the directory view can be a
-- plain security_invoker view: a free account simply sees zero rows.
--
-- RLS is row-level, but this product also needs column-level gating (public
-- teaser vs. locked report on the same creator). That split is expressed as
-- two views + one SECURITY DEFINER RPC, with anon holding no privilege on any
-- table that contains locked data.
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.social_platform        as enum ('youtube', 'instagram');
create type public.ad_fatigue_level       as enum ('low', 'moderate', 'high');
create type public.access_request_status  as enum ('pending', 'approved', 'rejected');
create type public.billing_plan           as enum ('free', 'pro_agency');
create type public.org_role               as enum ('owner', 'admin', 'member');
create type public.brief_status           as enum ('sent', 'viewed', 'accepted', 'declined');

-- ---------------------------------------------------------------------------
-- Shared trigger
-- ---------------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- 1. creators
-- =============================================================================
create table public.creators (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null unique references auth.users (id) on delete cascade,
  handle               citext not null unique
                         check (handle ~ '^[a-z0-9_](?:[a-z0-9_.]{1,28})[a-z0-9_]$'),
  display_name         text not null check (char_length(display_name) between 1 and 80),
  avatar_url           text,
  niche                text check (char_length(niche) <= 60),
  bio                  text check (char_length(bio) <= 500),
  is_verified          boolean not null default false,
  -- Track B opt-in. False means: reachable at /@handle, invisible to the
  -- directory, and never instantly unlocked for agencies.
  is_directory_visible boolean not null default false,
  minimum_budget       integer check (minimum_budget >= 0),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index creators_directory_idx
  on public.creators (niche, minimum_budget)
  where is_directory_visible = true;

create trigger creators_set_updated_at
  before update on public.creators
  for each row execute function public.tg_set_updated_at();

comment on column public.creators.is_verified is
  'Set only by the ingestion worker (service role) once 1st-party OAuth data is confirmed.';
comment on column public.creators.minimum_budget is
  'Shown on the proposal form so brands self-select. Advisory — it does not block a request.';

-- =============================================================================
-- 2. social_accounts — OAuth credentials. Never reaches a browser.
-- =============================================================================
create table public.social_accounts (
  id               uuid primary key default gen_random_uuid(),
  creator_id       uuid not null references public.creators (id) on delete cascade,
  platform         public.social_platform not null,
  channel_id       text not null,
  channel_handle   text,
  access_token     text not null,
  refresh_token    text,
  token_expires_at timestamptz,
  follower_count   bigint not null default 0 check (follower_count >= 0),
  scopes           text[] not null default '{}',
  stats_summary    jsonb not null default '{}'::jsonb,
  last_synced_at   timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (creator_id, platform, channel_id)
);

create index social_accounts_creator_idx on public.social_accounts (creator_id);

create trigger social_accounts_set_updated_at
  before update on public.social_accounts
  for each row execute function public.tg_set_updated_at();

comment on table public.social_accounts is
  'Token columns are plaintext for MVP velocity. Before ingesting a live creator token, '
  'move access_token/refresh_token into Supabase Vault (pgsodium) and keep only the secret '
  'id here. RLS keeps them off the API either way — no role but the owner and the service '
  'role can read this table.';
comment on column public.social_accounts.follower_count is
  'Denormalised out of stats_summary so the directory can sort and filter on it.';

-- =============================================================================
-- 3. report_metrics — output of the AI pipeline. One current row per creator.
-- =============================================================================
create table public.report_metrics (
  id                   uuid primary key default gen_random_uuid(),
  creator_id           uuid not null unique references public.creators (id) on delete cascade,

  -- PUBLIC teaser surface (2–3 chips). Deliberately claims, never figures.
  teaser_highlights    jsonb not null default '[]'::jsonb,

  -- LOCKED surface
  demographics         jsonb not null default '{}'::jsonb,
  top_comment_clusters jsonb not null default '[]'::jsonb,
  sentiment_score      double precision check (sentiment_score between 0 and 100),
  purchase_intent_rate double precision check (purchase_intent_rate between 0 and 1),
  brand_safety_score   double precision check (brand_safety_score between 0 and 100),
  engagement_rate      double precision check (engagement_rate between 0 and 1),
  ad_fatigue_level     public.ad_fatigue_level,
  ai_summary           text,

  -- Provenance
  model_version        text,
  comments_analyzed    integer not null default 0 check (comments_analyzed >= 0),
  last_analyzed_at     timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint teaser_highlights_is_short_array
    check (jsonb_typeof(teaser_highlights) = 'array'
           and jsonb_array_length(teaser_highlights) <= 3)
);

-- Directory filter predicates.
create index report_metrics_fit_idx
  on public.report_metrics (purchase_intent_rate desc, ad_fatigue_level);
create index report_metrics_demographics_idx
  on public.report_metrics using gin (demographics jsonb_path_ops);

create trigger report_metrics_set_updated_at
  before update on public.report_metrics
  for each row execute function public.tg_set_updated_at();

-- =============================================================================
-- 4. organizations & organization_members
-- =============================================================================
create table public.organizations (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (char_length(name) between 1 and 120),
  billing_plan       public.billing_plan not null default 'free',
  stripe_customer_id text unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.tg_set_updated_at();

comment on column public.organizations.billing_plan is
  'Written only by the Stripe webhook (service role). No client-facing policy grants '
  'UPDATE on this table — otherwise an org admin could grant themselves pro_agency.';

create table public.organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  role            public.org_role not null default 'member',
  created_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index organization_members_user_idx on public.organization_members (user_id);

-- =============================================================================
-- 5. access_requests — Track A, the free 1:1 inbound proposal.
-- =============================================================================
create table public.access_requests (
  id                 uuid primary key default gen_random_uuid(),
  creator_id         uuid not null references public.creators (id) on delete cascade,

  requester_name     text not null check (char_length(requester_name) between 1 and 120),
  requester_email    citext not null check (requester_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  company_name       text not null check (char_length(company_name) between 1 and 120),
  campaign_objective text not null check (char_length(campaign_objective) between 1 and 200),
  proposed_budget    numeric(12, 2) check (proposed_budget >= 0),
  budget_currency    char(3) not null default 'USD',
  pitch_note         text check (char_length(pitch_note) <= 2000),

  -- Set to the requester's org when a signed-in agency user submits, so the
  -- proposal also appears in that org's outbound history.
  organization_id    uuid references public.organizations (id) on delete set null,

  status             public.access_request_status not null default 'pending',
  access_token       uuid not null unique default gen_random_uuid(),
  expires_at         timestamptz,

  created_at         timestamptz not null default now(),
  responded_at       timestamptz,
  first_viewed_at    timestamptz,
  view_count         integer not null default 0,
  updated_at         timestamptz not null default now(),

  -- An approved request without a deadline is a permanent grant; forbid it.
  constraint approved_requests_expire
    check (status <> 'approved' or expires_at is not null)
);

create index access_requests_creator_status_idx
  on public.access_requests (creator_id, status, created_at desc);
create index access_requests_token_idx on public.access_requests (access_token);
create index access_requests_org_idx on public.access_requests (organization_id)
  where organization_id is not null;

-- One live ask per brand contact per creator; re-asking updates the pitch.
create unique index access_requests_one_pending_per_email
  on public.access_requests (creator_id, requester_email)
  where status = 'pending';

create trigger access_requests_set_updated_at
  before update on public.access_requests
  for each row execute function public.tg_set_updated_at();

-- Approval side effects live in the database so the invariant holds no matter
-- which client flips the status: rotate the secret, stamp a deadline, reset the
-- view counter.
create or replace function public.tg_access_request_on_status_change()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    new.responded_at := now();

    if new.status = 'approved' then
      new.access_token    := gen_random_uuid();
      new.expires_at      := coalesce(new.expires_at, now() + interval '14 days');
      new.view_count      := 0;
      new.first_viewed_at := null;
    else
      new.expires_at := null;
    end if;
  end if;

  return new;
end;
$$;

create trigger access_requests_on_status_change
  before update of status on public.access_requests
  for each row execute function public.tg_access_request_on_status_change();

-- =============================================================================
-- 6. campaign_briefs — Track B bulk outbound.
-- =============================================================================
create table public.campaign_briefs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  title           text not null check (char_length(title) between 1 and 140),
  objective       text not null check (char_length(objective) between 1 and 200),
  brief_note      text check (char_length(brief_note) <= 4000),
  budget_min      integer check (budget_min >= 0),
  budget_max      integer check (budget_max >= 0),
  budget_currency char(3) not null default 'USD',
  created_at      timestamptz not null default now(),
  constraint budget_range_ordered check (budget_min is null or budget_max is null or budget_min <= budget_max)
);

create table public.campaign_brief_recipients (
  id         uuid primary key default gen_random_uuid(),
  brief_id   uuid not null references public.campaign_briefs (id) on delete cascade,
  creator_id uuid not null references public.creators (id) on delete cascade,
  status     public.brief_status not null default 'sent',
  sent_at    timestamptz not null default now(),
  unique (brief_id, creator_id)
);

create index campaign_brief_recipients_creator_idx
  on public.campaign_brief_recipients (creator_id, sent_at desc);

-- =============================================================================
-- Entitlement helpers
--
-- SECURITY DEFINER and STABLE: they are referenced from RLS policies on the
-- very tables they read, so running them as the caller would recurse.
-- =============================================================================
create or replace function public.user_org_ids()
returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select organization_id from public.organization_members where user_id = auth.uid();
$$;

create or replace function public.is_pro_agency()
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    where m.user_id = auth.uid() and o.billing_plan = 'pro_agency'
  );
$$;

create or replace function public.user_org_role(p_organization_id uuid)
returns public.org_role
language sql stable security definer set search_path = public, pg_temp as $$
  select role from public.organization_members
  where user_id = auth.uid() and organization_id = p_organization_id;
$$;

create or replace function public.owns_creator(p_creator_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.creators where id = p_creator_id and user_id = auth.uid()
  );
$$;

-- Supabase's default privileges grant EXECUTE on new functions in `public` to
-- both anon and authenticated, and `revoke ... from public` does NOT undo a
-- role-specific default grant. Every function above must therefore be revoked
-- from anon by name. Their internal `auth.uid()` guards already return
-- empty/false for an anonymous caller, so this is defence in depth — but the
-- privilege layer should not be the weaker of the two.
revoke all on function public.user_org_ids()            from public, anon;
revoke all on function public.is_pro_agency()           from public, anon;
revoke all on function public.user_org_role(uuid)       from public, anon;
revoke all on function public.owns_creator(uuid)        from public, anon;
grant execute on function public.user_org_ids()      to authenticated;
grant execute on function public.is_pro_agency()     to authenticated;
grant execute on function public.user_org_role(uuid) to authenticated;
grant execute on function public.owns_creator(uuid)  to authenticated;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.creators                 enable row level security;
alter table public.social_accounts          enable row level security;
alter table public.report_metrics           enable row level security;
alter table public.organizations            enable row level security;
alter table public.organization_members     enable row level security;
alter table public.access_requests          enable row level security;
alter table public.campaign_briefs          enable row level security;
alter table public.campaign_brief_recipients enable row level security;

-- --- creators: identity is public; only the owner writes. -------------------
create policy creators_public_read on public.creators
  for select to anon, authenticated using (true);

create policy creators_owner_insert on public.creators
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy creators_owner_update on public.creators
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- --- social_accounts: owner only. No anon policy exists at all. -------------
create policy social_accounts_owner_all on public.social_accounts
  for all to authenticated
  using (public.owns_creator(creator_id))
  with check (public.owns_creator(creator_id));

-- --- report_metrics: the locked surface. ------------------------------------
-- Track B's paywall is this policy. A free-plan account matches neither and
-- therefore sees zero rows — including through the directory view.
create policy report_metrics_owner_read on public.report_metrics
  for select to authenticated
  using (public.owns_creator(creator_id));

create policy report_metrics_pro_agency_read on public.report_metrics
  for select to authenticated
  using (
    public.is_pro_agency()
    and exists (
      select 1 from public.creators c
      where c.id = report_metrics.creator_id and c.is_directory_visible = true
    )
  );

-- --- organizations: members read; billing is service-role only. -------------
create policy organizations_member_read on public.organizations
  for select to authenticated
  using (id in (select public.user_org_ids()));

create policy organizations_admin_update on public.organizations
  for update to authenticated
  using (public.user_org_role(id) in ('owner', 'admin'))
  -- billing_plan is guarded by a column-level REVOKE further down, so an admin
  -- can rename the org but cannot sell themselves a Pro plan.
  with check (public.user_org_role(id) in ('owner', 'admin'));

create policy organization_members_read on public.organization_members
  for select to authenticated
  using (organization_id in (select public.user_org_ids()));

create policy organization_members_admin_write on public.organization_members
  for all to authenticated
  using (public.user_org_role(organization_id) in ('owner', 'admin'))
  with check (public.user_org_role(organization_id) in ('owner', 'admin'));

-- --- access_requests: creator inbox + submitting org's outbox. --------------
-- No INSERT policy: brands write through request_creator_access() only.
create policy access_requests_creator_read on public.access_requests
  for select to authenticated
  using (public.owns_creator(creator_id));

create policy access_requests_creator_update on public.access_requests
  for update to authenticated
  using (public.owns_creator(creator_id))
  with check (public.owns_creator(creator_id));

create policy access_requests_org_read on public.access_requests
  for select to authenticated
  using (organization_id in (select public.user_org_ids()));

-- --- campaign_briefs: pro-plan org members only. ----------------------------
create policy campaign_briefs_org_all on public.campaign_briefs
  for all to authenticated
  using (organization_id in (select public.user_org_ids()))
  with check (organization_id in (select public.user_org_ids()) and public.is_pro_agency());

create policy campaign_brief_recipients_org_read on public.campaign_brief_recipients
  for select to authenticated
  using (
    brief_id in (
      select id from public.campaign_briefs
      where organization_id in (select public.user_org_ids())
    )
  );

-- A bulk brief may only target creators who opted into the directory.
create policy campaign_brief_recipients_org_insert on public.campaign_brief_recipients
  for insert to authenticated
  with check (
    public.is_pro_agency()
    and brief_id in (
      select id from public.campaign_briefs
      where organization_id in (select public.user_org_ids())
    )
    and exists (
      select 1 from public.creators c
      where c.id = creator_id and c.is_directory_visible = true
    )
  );

-- The targeted creator sees briefs addressed to them.
create policy campaign_brief_recipients_creator_read on public.campaign_brief_recipients
  for select to authenticated
  using (public.owns_creator(creator_id));

-- =============================================================================
-- Public teaser surface
--
-- Owner-rights view on purpose: anon holds no privilege on report_metrics or
-- social_accounts, so a security_invoker view would either fail or require
-- granting anon table-wide access to locked columns. The projection below is
-- the entire public API for an anonymous visitor.
-- =============================================================================
create view public.creator_public_profiles as
select
  c.id,
  c.handle,
  c.display_name,
  c.avatar_url,
  c.niche,
  c.bio,
  c.is_verified,
  c.is_directory_visible,
  c.minimum_budget,
  c.created_at,
  coalesce(f.total_followers, 0)               as total_followers,
  coalesce(f.platforms, '[]'::jsonb)           as platforms,
  coalesce(r.teaser_highlights, '[]'::jsonb)   as teaser_highlights,
  r.last_analyzed_at,
  (r.id is not null)                           as has_report
from public.creators c
left join lateral (
  select
    sum(sa.follower_count)::bigint as total_followers,
    jsonb_agg(
      jsonb_build_object(
        'platform', sa.platform,
        'handle', sa.channel_handle,
        'followerCount', sa.follower_count,
        'statsSummary', sa.stats_summary
      ) order by sa.follower_count desc
    ) as platforms
  from public.social_accounts sa
  where sa.creator_id = c.id
) f on true
left join public.report_metrics r on r.creator_id = c.id;

comment on view public.creator_public_profiles is
  'Everything anon may read. Locked metrics are absent from the projection entirely, so '
  'they are never serialised to an unauthorised browser and blurred client-side.';

grant select on public.creator_public_profiles to anon, authenticated;

-- =============================================================================
-- Directory (Track B)
--
-- security_invoker = on, so report_metrics RLS runs as the caller. That single
-- setting is the subscription gate: a free account joins against zero visible
-- rows and the directory comes back empty.
-- =============================================================================
create view public.directory_listings with (security_invoker = on) as
select
  p.id,
  p.handle,
  p.display_name,
  p.avatar_url,
  p.niche,
  p.is_verified,
  p.minimum_budget,
  p.total_followers,
  r.sentiment_score,
  r.purchase_intent_rate,
  r.brand_safety_score,
  r.engagement_rate,
  r.ad_fatigue_level,
  r.demographics,
  r.last_analyzed_at
from public.creator_public_profiles p
join public.report_metrics r on r.creator_id = p.id
where p.is_directory_visible = true;

grant select on public.directory_listings to authenticated;

-- =============================================================================
-- RPC: brands submit a 1:1 access request (Track A)
--
-- SECURITY DEFINER so anon can write without holding INSERT on the table —
-- which also means status, access_token, and expires_at cannot be forged.
-- =============================================================================
create or replace function public.request_creator_access(
  p_handle             text,
  p_company_name       text,
  p_requester_name     text,
  p_requester_email    text,
  p_campaign_objective text,
  p_proposed_budget    numeric  default null,
  p_budget_currency    char(3)  default 'USD',
  p_pitch_note         text     default null
)
returns table (request_id uuid, request_status public.access_request_status)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_creator_id uuid;
  v_org_id     uuid;
begin
  select id into v_creator_id
  from public.creators
  where handle = lower(btrim(p_handle, '@'));

  if v_creator_id is null then
    raise exception 'creator_not_found' using errcode = 'no_data_found';
  end if;

  -- Attribute the proposal to the submitter's org when they are signed in.
  select organization_id into v_org_id
  from public.organization_members
  where user_id = auth.uid()
  limit 1;

  return query
  insert into public.access_requests as ar (
    creator_id, company_name, requester_name, requester_email,
    campaign_objective, proposed_budget, budget_currency, pitch_note, organization_id
  )
  values (
    v_creator_id, btrim(p_company_name), btrim(p_requester_name),
    lower(btrim(p_requester_email)), btrim(p_campaign_objective),
    p_proposed_budget, coalesce(p_budget_currency, 'USD'),
    nullif(btrim(p_pitch_note), ''), v_org_id
  )
  on conflict (creator_id, requester_email) where status = 'pending'
  do update set
    company_name       = excluded.company_name,
    requester_name     = excluded.requester_name,
    campaign_objective = excluded.campaign_objective,
    proposed_budget    = excluded.proposed_budget,
    budget_currency    = excluded.budget_currency,
    pitch_note         = excluded.pitch_note
  returning ar.id, ar.status;
end;
$$;

revoke all on function public.request_creator_access(text, text, text, text, text, numeric, char, text) from public, anon, authenticated;
grant execute on function public.request_creator_access(text, text, text, text, text, numeric, char, text) to anon, authenticated;

-- =============================================================================
-- Shared serialiser for the locked payload.
--
-- One definition of the report's wire shape, so the token RPC and any future
-- path (pro-agency export, dashboard preview) cannot drift apart. It takes an
-- already-authorised row — it performs no access check of its own, which is why
-- it is not granted to anon.
-- =============================================================================
create or replace function public.report_to_jsonb(r public.report_metrics)
returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'creatorId',          r.creator_id,
    'demographics',       r.demographics,
    'topCommentClusters', r.top_comment_clusters,
    'sentimentScore',     r.sentiment_score,
    'purchaseIntentRate', r.purchase_intent_rate,
    'brandSafetyScore',   r.brand_safety_score,
    'engagementRate',     r.engagement_rate,
    'adFatigueLevel',     r.ad_fatigue_level,
    'aiSummary',          r.ai_summary,
    'modelVersion',       r.model_version,
    'commentsAnalyzed',   r.comments_analyzed,
    'lastAnalyzedAt',     r.last_analyzed_at
  );
$$;

revoke all on function public.report_to_jsonb(public.report_metrics)
  from public, anon, authenticated;

-- =============================================================================
-- RPC: token holders read the full report (Track A, post-approval)
--
-- One round trip: validate the token, bind it to the requested handle, enforce
-- the deadline, record the view, return the payload.
--
-- `expired` is reported distinctly from `invalid` on purpose — whoever holds an
-- expired link already had a real grant, and "ask for a renewal" is a better
-- dead end than a generic lock. A v4 UUID is not guessable, so this leaks
-- nothing to someone who never received a link.
-- =============================================================================
create or replace function public.get_report_by_token(p_handle text, p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_request public.access_requests%rowtype;
  v_creator public.creators%rowtype;
  v_report  public.report_metrics%rowtype;
begin
  if p_token is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into v_request from public.access_requests where access_token = p_token;

  if not found or v_request.status <> 'approved' then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- A grant for creator A must not unblur creator B.
  select * into v_creator
  from public.creators
  where id = v_request.creator_id and handle = lower(btrim(p_handle, '@'));

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  if v_request.expires_at is null or v_request.expires_at <= now() then
    return jsonb_build_object('status', 'expired');
  end if;

  update public.access_requests
  set view_count = view_count + 1,
      first_viewed_at = coalesce(first_viewed_at, now())
  where id = v_request.id;

  select * into v_report from public.report_metrics where creator_id = v_creator.id;

  if v_report.id is null then
    return jsonb_build_object('status', 'report_pending');
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'grant', jsonb_build_object(
      'requestId',   v_request.id,
      'companyName', v_request.company_name,
      'expiresAt',   v_request.expires_at,
      'viewCount',   v_request.view_count + 1
    ),
    'report', public.report_to_jsonb(v_report)
  );
end;
$$;

revoke all on function public.get_report_by_token(text, uuid) from public, anon, authenticated;
grant execute on function public.get_report_by_token(text, uuid) to anon, authenticated;

-- =============================================================================
-- Privilege lockdown
--
-- Supabase grants ALL on new public tables to anon/authenticated by default.
-- Everything holding locked data or credentials is revoked from anon here; the
-- two views and two RPCs above are anon's entire surface.
-- =============================================================================
revoke insert, update, delete on public.creators from anon;

-- A creator owns their presentation, not their credibility. `is_verified` is
-- the product's core trust primitive and is writable only by the ingestion
-- worker (service role) after 1st-party OAuth data is confirmed — so the RLS
-- policy above is paired with column-level grants that leave it out. The same
-- narrowing on INSERT stops a self-verified row being created outright.
revoke insert, update, delete on public.creators from authenticated;
grant insert (user_id, handle, display_name, avatar_url, niche, bio,
              is_directory_visible, minimum_budget)
  on public.creators to authenticated;
grant update (handle, display_name, avatar_url, niche, bio,
              is_directory_visible, minimum_budget)
  on public.creators to authenticated;
revoke all on public.social_accounts           from anon;
revoke all on public.report_metrics            from anon;
revoke all on public.access_requests           from anon;
revoke all on public.organizations             from anon, authenticated;
revoke all on public.organization_members      from anon;
revoke all on public.campaign_briefs           from anon;
revoke all on public.campaign_brief_recipients from anon;

-- Members read their org and admins rename it; only the Stripe webhook
-- (service role) may touch the plan or the customer id.
grant select on public.organizations to authenticated;
grant update (name) on public.organizations to authenticated;

-- Creators approve/reject from the dashboard; nothing else is theirs to write.
revoke insert, delete on public.access_requests from authenticated;
revoke update on public.access_requests from authenticated;
grant  update (status, expires_at) on public.access_requests to authenticated;

-- The pipeline owns report contents; clients only ever read.
revoke insert, update, delete on public.report_metrics from authenticated;
