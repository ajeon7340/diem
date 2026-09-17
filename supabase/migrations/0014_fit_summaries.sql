-- =============================================================================
-- adfit — Migration 0014: why this creator, for this brand
--
-- The report states figures and lets the buyer draw the conclusion. That rule
-- was earned: a written verdict ("Strong commercial fit"), per-platform prose
-- reads and a do/avoid brief were all removed because they restated the tiles
-- in a more confident voice than the tiles deserved.
--
-- This is not that feature coming back, and one property is what makes the
-- difference: a row here is keyed to the ORGANISATION READING IT, and
-- optionally to the brief they are reading it against. Half its input is not
-- in the report at all, so it says something no tile can. The test, whenever
-- this is edited: if the paragraph would read identically to every viewer, it
-- has decayed back into the thing that was deleted, and it should be.
--
-- WHY THIS IS NOT A COLUMN ON report_metrics
--
-- This text is derived from locked metrics. 0001 keeps those from an
-- unauthorised browser with RLS and column-level GRANTs — a creator cannot
-- self-verify, an org admin cannot self-upgrade, and `anon` holds no table
-- privilege at all. Prose derived from those numbers is a SIDE CHANNEL around
-- every one of those grants: "converts unusually well for her size" restates
-- the percentile that the grant withholds, in a form no column check can see.
--
-- On report_metrics it would ride along with the row wherever the row goes,
-- including any future teaser or partial-access path. Keyed to the reading org
-- and gated on membership, it cannot: a viewer who is not in the org gets no
-- row, and a creator's own dashboard does not surface it (see below). The
-- generator is given the gatekeeper's already-resolved payload — never the raw
-- row — so it cannot describe what its reader was not entitled to see.
--
-- The creator deliberately cannot read these. It is an agency's working note
-- about a purchase they are considering; publishing it to the subject would
-- both chill the note and leak the agency's campaign intent. If that is
-- revisited, it is a product decision, not a policy tweak.
-- =============================================================================

create table public.fit_summaries (
  id              uuid primary key default gen_random_uuid(),
  creator_id      uuid not null references public.creators (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- Which brief it was read against. Null is a general read of the creator
  -- against the org's own profile, which is a weaker claim and says so.
  brief_id        uuid references public.campaign_briefs (id) on delete cascade,

  summary         text not null check (char_length(summary) between 1 and 1200),

  -- Every assertion with the figure it rests on: [{text, metric, value}].
  -- The report's other evidence is checkable — comment quotes link to the
  -- comment, opinion themes link to the thread — and a generated paragraph is
  -- the one place where an unsupported sentence is invisible. Storing the
  -- citation makes the prose auditable against the row it came from, and lets
  -- the UI drop a claim whose figure no longer matches instead of rendering it.
  claims          jsonb not null default '[]'::jsonb,

  -- Never 'insufficient'. A fluent paragraph about a creator with 41 comments
  -- is exactly the authoritative-looking noise sufficiency.ts exists to stop,
  -- so the generator refuses rather than hedging, and no row is written.
  confidence      text not null check (confidence in ('sufficient', 'limited')),

  model_version   text not null,
  rubric_version  text,

  -- The report this described. When the pipeline re-analyses the creator, this
  -- falls behind report_metrics.last_analyzed_at and the summary is stale —
  -- which the UI must say, because prose carries no visible date and a reader
  -- has no other way to tell that the figures underneath it moved.
  report_analyzed_at timestamptz,

  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);

-- One current summary per (creator, org, brief). NULLS NOT DISTINCT so the
-- general read — brief_id null — is also unique rather than accumulating a new
-- row per regeneration.
create unique index fit_summaries_scope_idx
  on public.fit_summaries (creator_id, organization_id, brief_id) nulls not distinct;

create index fit_summaries_org_idx on public.fit_summaries (organization_id, created_at desc);

alter table public.fit_summaries enable row level security;

-- Read and write are both scoped to the org's own rows. Writing additionally
-- requires the paid plan, matching campaign_briefs: this is a Track B feature
-- and a free account must not be able to spend inference against it.
create policy fit_summaries_org_read on public.fit_summaries
  for select to authenticated
  using (organization_id in (select public.user_org_ids()));

create policy fit_summaries_org_write on public.fit_summaries
  for all to authenticated
  using (organization_id in (select public.user_org_ids()))
  with check (
    organization_id in (select public.user_org_ids())
    and public.is_pro_agency()
  );

-- `anon` gets nothing here, like every other locked surface. Stated explicitly
-- rather than relying on the default: this table holds the one form of locked
-- data that looks harmless in a log.
revoke all on public.fit_summaries from public, anon;
grant select, insert, update, delete on public.fit_summaries to authenticated;

comment on table public.fit_summaries is
  'Per-organisation read of why a creator fits THAT buyer, optionally against one of their '
  'campaign briefs. Deliberately not a column on report_metrics: the text is derived from '
  'locked metrics, so storing it with the report would carry it past the column GRANTs and '
  'RLS that keep those metrics from unauthorised readers. Generated from the gatekeeper''s '
  'resolved payload, never the raw row. Creators cannot read rows about themselves.';

comment on column public.fit_summaries.claims is
  'Each assertion with the figure behind it: [{text, metric, value}]. The UI verifies every '
  'claim against the live report before rendering and drops any whose value has moved — a '
  'generated sentence is the one piece of evidence in this report that cannot be checked by '
  'following a link.';

comment on column public.fit_summaries.report_analyzed_at is
  'The report version this described. Behind report_metrics.last_analyzed_at means stale, and '
  'the UI must say so: prose carries no visible date, so a reader cannot otherwise tell that '
  'the figures under it have moved.';
