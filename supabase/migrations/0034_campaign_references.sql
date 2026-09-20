-- =============================================================================
-- adfit — Migration 0034: reference videos a buyer saved against a campaign
--
-- Studio's "why did that video do well" is the same question an advertiser asks
-- while planning a placement, and until now the answer vanished the moment the
-- page reloaded. A buyer would paste a link, read the numbers, and have nothing
-- to bring to the next conversation.
--
-- WHAT IS STORED, AND WHY EACH FIGURE IS DENORMALISED HERE
--
-- The whole read is kept, not just the video id. Re-deriving it later would
-- give a DIFFERENT answer — the channel's median moves every time they publish,
-- so a multiple computed in March and shown in June is a comparison against a
-- baseline that no longer exists. A saved reference is a measurement with a
-- date on it, and `analysed_at` is what makes it honest.
--
-- THE MULTIPLE IS AGAINST THE REFERENCE'S OWN CHANNEL. Never against the
-- candidate's, never against the campaign's other references. That rule is
-- III.E.2 and it is enforced in code by `withinOwner`, which throws; this table
-- stores the already-scoped result and has no column that could express a
-- cross-channel comparison.
--
-- `candidate_id` is nullable on purpose: a reference is often a competitor's
-- video or a format the buyer likes, belonging to the campaign rather than to
-- anyone they are considering. Attaching one to a candidate is a second,
-- narrower statement — "this is the kind of thing I want from THEM".
-- =============================================================================

create table public.campaign_references (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references public.campaigns (id) on delete cascade,

  /** Set when the buyer filed this against one candidate rather than the
   *  campaign at large. Cascades to null rather than deleting the reference:
   *  dropping a candidate should not silently bin the research. */
  candidate_id   uuid references public.campaign_candidates (id) on delete set null,

  video_id       text not null,
  title          text not null,
  channel_id     text not null,
  channel_title  text not null,
  published_at   timestamptz,
  duration_sec   integer check (duration_sec >= 0),

  views          bigint check (views >= 0),
  /** The reference channel's own median at the time of reading. Stored with
   *  the multiple so a reader can see what the multiple was against. */
  channel_median_views bigint check (channel_median_views >= 0),
  /** views / channel_median_views, inside one owner. Null when the channel had
   *  no median to compare against. */
  multiple       numeric(8, 2) check (multiple >= 0),
  engagement_rate numeric(6, 5) check (engagement_rate between 0 and 1),
  channel_median_engagement numeric(6, 5) check (channel_median_engagement between 0 and 1),
  /** Uploads the median was taken over. A multiple against four posts is not
   *  the same claim as one against fifty, and the panel says which. */
  sample_size    integer not null default 0 check (sample_size >= 0),

  /** The buyer's own words. The only field here they wrote. */
  note           text check (char_length(note) <= 2000),

  /** When the public data behind every figure above was read. Not decorative:
   *  the baseline it was measured against has moved since. */
  analysed_at    timestamptz not null,
  created_at     timestamptz not null default now(),
  unique (campaign_id, video_id)
);

create index campaign_references_campaign_idx
  on public.campaign_references (campaign_id, created_at desc);
create index campaign_references_candidate_idx
  on public.campaign_references (candidate_id)
  where candidate_id is not null;

alter table public.campaign_references enable row level security;

-- Same shape as candidates, same reason: which videos an agency is studying is
-- competitive information about an unannounced campaign.
create policy campaign_references_org_all on public.campaign_references
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

revoke all on public.campaign_references from public, anon, authenticated;
grant select, insert, update, delete on public.campaign_references to authenticated;

comment on table public.campaign_references is
  'Videos a buyer analysed while planning a campaign, with the read frozen at the time it was '
  'taken. Figures are denormalised deliberately: a channel median moves with every upload, so '
  'recomputing later would silently change what a saved multiple meant. See analysed_at.';

comment on column public.campaign_references.multiple is
  'views divided by THIS video''s own channel median, never another channel''s. Cross-owner '
  'aggregation is forbidden by YouTube III.E.2 and blocked in code by withinOwner(); no column '
  'here can express such a comparison.';
