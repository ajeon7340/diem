-- =============================================================================
-- The creator half of the product is removed.
--
-- NUMBERED 0038, NOT 0035. A migration with that number exists and is a no-op
-- reserving it; this work was written there first and a concurrent branch
-- replaced it. Renumbering rather than reclaiming the slot is deliberate — it
-- lands after 0036 and 0037, both of which were written against a schema that
-- still had `creators`, and neither of which references it. Ordering after
-- them means their additions apply cleanly and this removes what is left.
--
-- WHY. 0031 pivoted the customer to the advertiser and deliberately deleted
-- nothing: the media kit, the directory, the access requests and the offers
-- all still worked, and keeping them cost nothing while the new flow was
-- unproven. It is proven — an advertiser analyses any public channel with no
-- creator involved at all — and what is left behind is not a spare feature but
-- a second, larger surface with its own tables, policies and failure modes
-- that nothing in the product reaches.
--
-- WHAT IS DESTROYED, stated plainly rather than discovered afterwards:
-- 7 creators, 7 reports, 59 moderation-queue rows, 1 access request, 1 offer
-- and 1 legacy campaign brief. They were dumped to
-- `backups/creator-tables-2026-09-19.json` before this first ran. Every one is
-- re-derivable from public data by adding the channel as a candidate — except
-- the moderation actions, which were a creator's own decisions about their own
-- comment section and have no meaning without them.
--
-- IDEMPOTENT throughout, because this has already been applied to at least one
-- live project under its old number.
--
-- WHAT SURVIVES: `organizations`, `organization_members`, `campaigns`,
-- `campaign_candidates`, `campaign_references`, `workspace_channels`,
-- `report_shares`, `channel_analyses` and `analysis_jobs`.
-- =============================================================================

-- --- Views first: they depend on the tables ---------------------------------
--
-- `directory_listings` is built on `creator_public_profiles`, so the dependent
-- is named before the thing it depends on and the order needs no `cascade`.
-- It is still passed on the base view, because a view added later that nobody
-- remembered must not block the migration halfway through.

drop view if exists public.directory_listings;
drop view if exists public.demographics_grant_inbox;
drop view if exists public.creator_public_profiles cascade;

-- --- `analysis_jobs` loses its second subject -------------------------------
--
-- 0031 widened a job to point at a creator OR a channel, under a check
-- constraint enforcing exactly one. There is one kind of subject again, so the
-- constraint and the column go. `channel_id` becomes NOT NULL, which is the
-- statement the worker already relies on: it branches on `channel_id` and
-- would analyse nothing at all for a row without one.

delete from public.analysis_jobs where channel_id is null;

-- The creator's read of their own job. Dropped by name rather than by
-- cascading off the column, so removing it is a decision in this file and not
-- a side effect noticed later.
drop policy if exists analysis_jobs_owner_read on public.analysis_jobs;

alter table public.analysis_jobs
  drop constraint if exists analysis_jobs_has_a_subject,
  drop column if exists creator_id;

alter table public.analysis_jobs alter column channel_id set not null;

-- `analysis_jobs_one_active_idx` is not dropped here: it was partial on
-- (creator_id, kind), so it went with the column above.

comment on column public.analysis_jobs.channel_id is
  'The public YouTube channel this job analyses. The only subject a job has had '
  'since the creator half was removed.';

-- --- One function has to go BEFORE the tables -------------------------------
--
-- `report_to_jsonb(report_metrics)` takes a row type, and a row type IS the
-- table. Dropping the table first fails on a function depending on it.
-- Everything else goes after, because those are depended on BY the policies on
-- those tables — drop `owns_creator` first and nine policies object.

drop function if exists public.report_to_jsonb(public.report_metrics);

-- --- The tables -------------------------------------------------------------
--
-- ONE statement, not ten. They reference each other — `fit_summaries` points
-- at both `creators` and `campaign_briefs`, `offers` at `access_requests` — so
-- dropped one at a time there is no order that works without `cascade`, and
-- `cascade` is the thing to avoid here: it would silently take anything else
-- that happened to depend on one of them. Naming them together lets Postgres
-- resolve the graph among exactly these tables and fail loudly if something
-- outside the list depends on one.
--
-- Their policies, indexes and triggers go with them.

drop table if exists
  public.campaign_brief_recipients,
  public.campaign_briefs,
  public.comment_moderation_queue,
  public.demographics_grants,
  public.fit_summaries,
  public.offers,
  public.access_requests,
  public.report_metrics,
  public.social_accounts,
  public.creators;

-- --- Then the functions the dropped policies used ---------------------------

drop function if exists public.tg_access_request_on_status_change();
drop function if exists public.tg_offer_on_status_change();
drop function if exists public.has_demographics_grant(uuid);
drop function if exists public.owns_creator(uuid);
drop function if exists public.is_reserved_handle(text);

-- `is_pro_agency()` STAYS. It reads `organizations.billing_plan` and knows
-- nothing about creators; it is what a paid tier will be gated on.

-- Anything the drops above could not resolve by signature — an overload, or a
-- function whose arguments changed since the migration that created it. A
-- leftover SECURITY DEFINER function against a table that no longer exists is
-- not harmless: it is an error surface holding elevated rights.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'request_creator_access', 'request_demographics', 'review_demographics_grant',
        'submit_offer', 'get_report_by_token', 'report_to_jsonb', 'has_demographics_grant',
        'owns_creator', 'is_handle_available', 'is_reserved_handle'
      )
  loop
    execute format('drop function if exists %s cascade', r.sig);
  end loop;
end
$$;

-- --- Enums that no surviving column uses ------------------------------------

do $$
declare r record;
begin
  for r in
    select t.typname
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typtype = 'e'
      and not exists (
        select 1 from pg_attribute a
        join pg_class c on c.oid = a.attrelid
        join pg_namespace cn on cn.oid = c.relnamespace
        where a.atttypid = t.oid and not a.attisdropped and c.relkind in ('r', 'v', 'm')
          and cn.nspname not in ('pg_catalog', 'information_schema')
      )
  loop
    execute format('drop type if exists public.%I cascade', r.typname);
  end loop;
end
$$;
