-- =============================================================================
-- Behavioural probe for the brand model (0041).
--
-- Four claims that live entirely in the database and cannot be asserted in
-- Node:
--
--   1. ONE AGENCY, MANY CLIENTS, and none of them visible to another
--      workspace. An agency's client list is the shape of their business.
--   2. A BRAND POINTER CANNOT CROSS A WORKSPACE. A foreign key checks that the
--      row exists, not whose it is, and RLS admits the CAMPAIGN rather than the
--      brand_id on it — so without the trigger one workspace could attach
--      another's brand and read the name back off a join.
--   3. SAVING TWICE IS SAVING ONCE. Onboarding retries, double submits and
--      re-run server actions must not leave two clients nobody can tell apart.
--   4. EDITING A BRAND DOES NOT REWRITE A BRIEF. A brand default is a starting
--      point; a campaign keeps its own copy from the moment it is written.
-- =============================================================================

\set ON_ERROR_STOP on

create temporary table pg_temp_brand_passed (label text);

create or replace function pg_temp.bcheck(p_label text, p_ok boolean)
returns void language plpgsql security definer as $$
begin
  if p_ok then
    insert into pg_temp_brand_passed values (p_label);
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
  v_brand1 uuid; v_brand2 uuid; v_brand_b uuid;
  v_camp   uuid; v_legacy uuid;
begin
  insert into auth.users default values returning id into v_user_a;
  insert into auth.users default values returning id into v_user_b;
  insert into public.organizations (name, customer_type) values ('Agency A', 'agency') returning id into v_org_a;
  insert into public.organizations (name, customer_type) values ('Agency B', 'agency') returning id into v_org_b;
  insert into public.organization_members (organization_id, user_id, role)
    values (v_org_a, v_user_a, 'owner'), (v_org_b, v_user_b, 'owner');

  -- Two clients in ONE agency workspace. This is the case the whole table
  -- exists for: no second architecture, no workspace per client.
  insert into public.brands (organization_id, name, sells, markets, content_languages)
    values (v_org_a, 'Northbeam', 'A refillable cleanser', '{GB}', '{en}') returning id into v_brand1;
  insert into public.brands (organization_id, name, sells, markets)
    values (v_org_a, 'Southline', 'A hand grinder', '{KR}') returning id into v_brand2;
  insert into public.brands (organization_id, name, sells)
    values (v_org_b, 'Someone else''s client', 'Something else') returning id into v_brand_b;

  insert into public.campaigns (organization_id, created_by, name, brand, brand_id, product)
    values (v_org_a, v_user_a, 'Spring launch', 'Northbeam', v_brand1, 'The C40 travel grinder')
    returning id into v_camp;

  -- A campaign from before brands existed: free text, no link. It must keep
  -- working untouched.
  insert into public.campaigns (organization_id, created_by, name, brand)
    values (v_org_a, v_user_a, 'Legacy campaign', 'Typed by hand') returning id into v_legacy;

  perform set_config('probe.buser_a', v_user_a::text, false);
  perform set_config('probe.buser_b', v_user_b::text, false);
  perform set_config('probe.borg_a', v_org_a::text, false);
  perform set_config('probe.bbrand1', v_brand1::text, false);
  perform set_config('probe.bbrand_b', v_brand_b::text, false);
  perform set_config('probe.bcamp', v_camp::text, false);
  perform set_config('probe.blegacy', v_legacy::text, false);
end $$;

-- --- One workspace, many brands ---------------------------------------------

do $$
declare v_a text := current_setting('probe.buser_a');
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_a, true);

  perform pg_temp.bcheck('an agency holds several client brands in one workspace',
    (select count(*) from public.brands) = 2);
  perform pg_temp.bcheck('and sees neither the other workspace''s brand',
    (select count(*) from public.brands where id = current_setting('probe.bbrand_b')::uuid) = 0);
  perform pg_temp.bcheck('a legacy campaign with no linked brand is still readable',
    (select brand = 'Typed by hand' and brand_id is null
       from public.campaigns where id = current_setting('probe.blegacy')::uuid));
end $$;
reset role;

do $$
declare v_b text := current_setting('probe.buser_b');
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_b, true);
  perform pg_temp.bcheck('the other agency sees none of A''s clients',
    (select count(*) from public.brands where organization_id = current_setting('probe.borg_a')::uuid) = 0);
  perform pg_temp.bcheck('and only its own',
    (select count(*) from public.brands) = 1);
end $$;
reset role;

-- --- A brand pointer cannot cross a workspace -------------------------------

do $$
declare v_a text := current_setting('probe.buser_a'); v_refused boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_a, true);
  begin
    update public.campaigns set brand_id = current_setting('probe.bbrand_b')::uuid
     where id = current_setting('probe.bcamp')::uuid;
  exception when check_violation then v_refused := true;
  end;
  perform pg_temp.bcheck('a campaign cannot be pointed at another workspace''s brand', v_refused);
  perform pg_temp.bcheck('and the original link is untouched',
    (select brand_id = current_setting('probe.bbrand1')::uuid
       from public.campaigns where id = current_setting('probe.bcamp')::uuid));
end $$;
reset role;

do $$
declare v_a text := current_setting('probe.buser_a'); v_refused boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_a, true);
  begin
    insert into public.discovery_searches (organization_id, created_by, mode, brand_id)
      values (current_setting('probe.borg_a')::uuid, current_setting('probe.buser_a')::uuid,
              'criteria', current_setting('probe.bbrand_b')::uuid);
  exception when check_violation then v_refused := true;
  end;
  perform pg_temp.bcheck('nor can a search', v_refused);
end $$;
reset role;

-- --- Saving twice is saving once --------------------------------------------

do $$
declare v_a text := current_setting('probe.buser_a'); v_first uuid; v_second uuid;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_a, true);

  v_first := public.save_brand(current_setting('probe.borg_a')::uuid, null, 'Retried Brand',
    'First description', '{}', null, null, '{}', '{}', false);
  -- The same form submitted again: different whitespace, different case, same
  -- brand. This is the onboarding retry.
  v_second := public.save_brand(current_setting('probe.borg_a')::uuid, null, '  retried brand  ',
    'Second description', '{}', null, null, '{}', '{}', false);

  perform pg_temp.bcheck('a repeated save returns the same brand', v_first = v_second);
  perform pg_temp.bcheck('and leaves one row, not two',
    (select count(*) from public.brands where organization_id = current_setting('probe.borg_a')::uuid
       and lower(btrim(name)) = 'retried brand') = 1);
  perform pg_temp.bcheck('with the newer description',
    (select sells = 'Second description' from public.brands where id = v_first));
  perform pg_temp.bcheck('and the brand step recorded as done',
    (select brand_setup_state = 'done' from public.organizations
      where id = current_setting('probe.borg_a')::uuid));
end $$;
reset role;

do $$
declare v_b text := current_setting('probe.buser_b'); v_refused boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_b, true);
  begin
    perform public.save_brand(current_setting('probe.borg_a')::uuid, null, 'Intruder',
      'x', '{}', null, null, '{}', '{}', false);
  exception when insufficient_privilege then v_refused := true;
  end;
  perform pg_temp.bcheck('a member of another workspace cannot save into this one', v_refused);

  begin
    perform public.save_brand(current_setting('probe.borg_a')::uuid,
      current_setting('probe.bbrand1')::uuid, 'Hijacked', 'x', '{}', null, null, '{}', '{}', false);
  exception when insufficient_privilege then v_refused := true;
  end;
  perform pg_temp.bcheck('nor edit a brand in it', v_refused);
end $$;
reset role;

-- --- Editing a brand does not rewrite a brief -------------------------------

do $$
declare v_a text := current_setting('probe.buser_a');
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_a, true);

  perform public.save_brand(current_setting('probe.borg_a')::uuid, current_setting('probe.bbrand1')::uuid,
    'Northbeam', 'COMPLETELY DIFFERENT PRODUCT', '{}', null, null, '{DE}', '{de}', false);

  perform pg_temp.bcheck('the campaign keeps the product it was written with',
    (select product = 'The C40 travel grinder' from public.campaigns
      where id = current_setting('probe.bcamp')::uuid));
  perform pg_temp.bcheck('and the brand name printed on the brief',
    (select brand = 'Northbeam' from public.campaigns where id = current_setting('probe.bcamp')::uuid));
end $$;
reset role;

-- --- Archiving keeps the history --------------------------------------------

do $$
declare v_a text := current_setting('probe.buser_a');
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_a, true);

  update public.brands set archived_at = now() where id = current_setting('probe.bbrand1')::uuid;

  perform pg_temp.bcheck('archiving a brand keeps its campaigns',
    (select count(*) from public.campaigns where brand_id = current_setting('probe.bbrand1')::uuid) = 1);
  perform pg_temp.bcheck('and the campaign still names the client',
    (select brand = 'Northbeam' from public.campaigns where id = current_setting('probe.bcamp')::uuid));
  perform pg_temp.bcheck('an archived brand is out of the live list',
    (select count(*) from public.brands where archived_at is null
       and organization_id = current_setting('probe.borg_a')::uuid) = 2);
end $$;
reset role;

do $$
begin
  raise notice '';
  raise notice '  % brand model checks passed', (select count(*) from pg_temp_brand_passed);
end $$;
