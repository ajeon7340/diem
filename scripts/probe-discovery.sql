-- =============================================================================
-- Behavioural probe for discovery's access model (0039, 0040).
--
-- Three claims, none of them visible in a type or in a test that runs in Node,
-- because all three live in RLS and in constraints:
--
--   1. WHICH CREATORS A BRAND IS LOOKING FOR is org-private, and so is which
--      COMPETITORS it is following. A shared collaboration cache would let any
--      customer read any other customer's competitor list by reading what had
--      been collected for it.
--   2. A CUSTOMER CANNOT WRITE THEIR OWN RESULTS. `discovery_candidates` has no
--      insert grant: a row there says a search found a channel, and being able
--      to forge one makes every result meaningless.
--   3. CONFIRMATION IS AN ACT BY A PERSON. A brand row cannot be `confirmed`
--      without recording who confirmed it and when, because Step B searches
--      only confirmed brands and "confirmed" arriving as a default is how an
--      invented name reaches a query.
--
-- Same shape as probe-campaigns: `set local role authenticated` with a sub
-- claim exercises the policy the way a request does.
-- =============================================================================

\set ON_ERROR_STOP on

create temporary table pg_temp_discovery_passed (label text);

create or replace function pg_temp.dcheck(p_label text, p_ok boolean)
returns void language plpgsql security definer as $$
begin
  if p_ok then
    insert into pg_temp_discovery_passed values (p_label);
    raise notice '  ok   %', p_label;
  else
    raise exception '  FAIL %', p_label;
  end if;
end;
$$;

do $$
declare
  v_user_a uuid; v_user_b uuid;
  v_org_a  uuid; v_org_b  uuid;
  v_camp_a uuid;
  v_search_a uuid; v_search_b uuid;
  v_brand_a uuid;
begin
  insert into auth.users default values returning id into v_user_a;
  insert into auth.users default values returning id into v_user_b;
  insert into public.organizations (name) values ('Discovery A') returning id into v_org_a;
  insert into public.organizations (name) values ('Discovery B') returning id into v_org_b;
  insert into public.organization_members (organization_id, user_id, role)
    values (v_org_a, v_user_a, 'owner'), (v_org_b, v_user_b, 'owner');

  insert into public.campaigns (organization_id, created_by, name)
    values (v_org_a, v_user_a, 'Grinder launch') returning id into v_camp_a;

  insert into public.discovery_searches (organization_id, created_by, mode, params)
    values (v_org_a, v_user_a, 'competitor', '{"knownCompetitors":["Comandante"]}'::jsonb)
    returning id into v_search_a;
  insert into public.discovery_searches (organization_id, created_by, mode, params)
    values (v_org_b, v_user_b, 'criteria', '{"keywords":["kettles"]}'::jsonb)
    returning id into v_search_b;

  -- Written as the owner: the worker is the only thing that writes results.
  insert into public.discovery_candidates (search_id, channel_id, position, reason, facts)
    values (v_search_a, 'UCdiscovered00000000000a', 0, 'Named Comandante in a retrieved title.',
            '{"title":"Barista"}'::jsonb);

  insert into public.competitor_brands (organization_id, search_id, name, source, confirmed, confirmed_at, confirmed_by)
    values (v_org_a, v_search_a, 'Comandante', 'customer', true, now(), v_user_a)
    returning id into v_brand_a;

  insert into public.collaboration_evidence
    (organization_id, search_id, brand_id, brand, channel_id, video_id, video_title, video_url,
     source, excerpt, classification, ambiguity)
  values (v_org_a, v_search_a, v_brand_a, 'Comandante', 'UCdiscovered00000000000a', 'vid1',
          'Comandante C40 review', 'https://www.youtube.com/watch?v=vid1',
          'search.list q="Comandante"', 'A year with the Comandante C40', 'mention',
          'The brand is named and nothing establishes a commercial relationship.');

  -- Saved to the workspace. The composite key onto workspace_channels is what
  -- keeps a saved candidate and a readable channel the same notion.
  insert into public.workspace_channels (organization_id, channel_id)
    values (v_org_a, 'UCdiscovered00000000000a');
  insert into public.workspace_candidates (organization_id, channel_id, search_id, discovery_mode, reason)
    values (v_org_a, 'UCdiscovered00000000000a', v_search_a, 'competitor', 'Named Comandante.');

  perform set_config('probe.duser_a', v_user_a::text, false);
  perform set_config('probe.duser_b', v_user_b::text, false);
  perform set_config('probe.dsearch_a', v_search_a::text, false);
  perform set_config('probe.dsearch_b', v_search_b::text, false);
  perform set_config('probe.dcamp_a', v_camp_a::text, false);
  perform set_config('probe.dbrand_a', v_brand_a::text, false);
end $$;

-- --- The owning organisation ------------------------------------------------

do $$
declare v_a text := current_setting('probe.duser_a');
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_a, true);

  perform pg_temp.dcheck('A sees its own search',
    (select count(*) from public.discovery_searches) = 1);
  perform pg_temp.dcheck('and the candidates it found',
    (select count(*) from public.discovery_candidates) = 1);
  perform pg_temp.dcheck('and its own confirmed brand',
    (select count(*) from public.competitor_brands where confirmed) = 1);
  perform pg_temp.dcheck('and the collaboration evidence collected for it',
    (select count(*) from public.collaboration_evidence) = 1);
  perform pg_temp.dcheck('and the candidate it saved',
    (select count(*) from public.workspace_candidates) = 1);
end $$;
reset role;

-- --- The other organisation, on the same data -------------------------------

do $$
declare v_b text := current_setting('probe.duser_b');
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_b, true);

  perform pg_temp.dcheck('B cannot see A''s search',
    (select count(*) from public.discovery_searches
      where id = current_setting('probe.dsearch_a')::uuid) = 0);
  perform pg_temp.dcheck('nor which creators it surfaced',
    (select count(*) from public.discovery_candidates) = 0);
  -- The one that is not obvious. The videos are public; the LIST OF BRANDS
  -- somebody is following is their competitive position stated out loud.
  perform pg_temp.dcheck('nor which competitors A is following',
    (select count(*) from public.competitor_brands) = 0);
  perform pg_temp.dcheck('nor the collaboration evidence collected for them',
    (select count(*) from public.collaboration_evidence) = 0);
  perform pg_temp.dcheck('nor A''s saved shortlist',
    (select count(*) from public.workspace_candidates) = 0);
  perform pg_temp.dcheck('B does see its own search',
    (select count(*) from public.discovery_searches) = 1);
end $$;
reset role;

-- --- A customer cannot forge a result ---------------------------------------

do $$
declare v_a text := current_setting('probe.duser_a'); v_denied boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_a, true);
  begin
    insert into public.discovery_candidates (search_id, channel_id, position, reason)
      values (current_setting('probe.dsearch_a')::uuid, 'UCforged000000000000000a', 0, 'I put myself here');
  exception when insufficient_privilege or others then v_denied := true;
  end;
  perform pg_temp.dcheck('a customer cannot write their own search results', v_denied);
end $$;
reset role;

-- --- Confirmation is an act, not a default ----------------------------------

do $$
declare v_a text := current_setting('probe.duser_a'); v_rejected boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_a, true);
  begin
    insert into public.competitor_brands (organization_id, search_id, name, source, confirmed)
      select organization_id, id, 'Invented Co', 'model', true
        from public.discovery_searches where id = current_setting('probe.dsearch_a')::uuid;
  exception when check_violation then v_rejected := true;
  end;
  perform pg_temp.dcheck('a brand cannot be confirmed without a person and a time', v_rejected);

  -- The same row, unconfirmed, is fine: that is what a suggestion is.
  insert into public.competitor_brands (organization_id, search_id, name, source, confirmed)
    select organization_id, id, 'Invented Co', 'model', false
      from public.discovery_searches where id = current_setting('probe.dsearch_a')::uuid;
  perform pg_temp.dcheck('an unconfirmed suggestion is storable',
    (select count(*) from public.competitor_brands where not confirmed) = 1);
end $$;
reset role;

-- --- One channel per search, however many queries found it ------------------

do $$
declare v_duplicated boolean := false;
begin
  begin
    insert into public.discovery_candidates (search_id, channel_id, position, reason)
      values (current_setting('probe.dsearch_a')::uuid, 'UCdiscovered00000000000a', 1, 'found again');
  exception when unique_violation then v_duplicated := true;
  end;
  perform pg_temp.dcheck('one channel cannot appear twice in one search', v_duplicated);
end $$;

-- --- Discovery carries into a campaign, with its provenance -----------------

do $$
declare v_a text := current_setting('probe.duser_a');
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_a, true);

  insert into public.campaign_candidates
    (campaign_id, channel_id, discovery_search_id, discovery_mode, discovery_reason)
  values (current_setting('probe.dcamp_a')::uuid, 'UCdiscovered00000000000a',
          current_setting('probe.dsearch_a')::uuid, 'competitor', 'Named Comandante in a retrieved title.');

  perform pg_temp.dcheck('a discovered candidate joins the campaign with its source',
    (select discovery_mode = 'competitor' and discovery_reason is not null
       from public.campaign_candidates where channel_id = 'UCdiscovered00000000000a'));
  -- The two must stay apart: one says why a search surfaced it, the other how
  -- it reads against this brief. Collapsing them lets a match read as advice.
  perform pg_temp.dcheck('and its fit against the brief is still unwritten',
    (select fit_summary is null from public.campaign_candidates
      where channel_id = 'UCdiscovered00000000000a'));
end $$;
reset role;

-- --- Expiry is enforced on read, not only by the sweep ----------------------

do $$
declare v_a text := current_setting('probe.duser_a');
begin
  update public.collaboration_evidence set collected_at = now() - interval '31 days';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_a, true);
  perform pg_temp.dcheck('evidence past 30 days is unreadable even if the sweep is late',
    (select count(*) from public.collaboration_evidence) = 0);
end $$;
reset role;

-- --- A confirmed brand list outlives the search that used it ----------------

do $$
begin
  delete from public.discovery_searches where id = current_setting('probe.dsearch_a')::uuid;
  perform pg_temp.dcheck('deleting an expired search takes its candidates with it',
    (select count(*) from public.discovery_candidates) = 0);
  -- The customer's own work. No YouTube policy reaches a list of competitors
  -- somebody typed, and cascading here would delete it on YouTube's clock.
  perform pg_temp.dcheck('but the confirmed competitor list survives',
    (select count(*) from public.competitor_brands where name = 'Comandante') = 1);
  perform pg_temp.dcheck('and the saved candidate survives, unlinked',
    (select search_id is null from public.workspace_candidates
      where channel_id = 'UCdiscovered00000000000a'));
end $$;

do $$
begin
  raise notice '';
  raise notice '  % discovery access checks passed', (select count(*) from pg_temp_discovery_passed);
end $$;
