-- =============================================================================
-- adfit — Migration 0004: formal offers
--
-- Closes the funnel. Every path through the product ended at a "Send formal
-- offer" button that pointed at a route which did not exist: a brand could read
-- the report and then had nowhere to act on it.
--
-- Two senders reach this table, and neither can INSERT directly:
--
--   Track A  a token holder with no account at all — writes through
--            submit_offer(), which re-validates the access token exactly the
--            way get_report_by_token() does.
--   Track B  a signed-in Pro Agency member — also routed through the RPC, so
--            status and provenance are set server-side in one place.
-- =============================================================================

create type public.offer_status as enum ('sent', 'accepted', 'declined', 'withdrawn');

create table public.offers (
  id                uuid primary key default gen_random_uuid(),
  creator_id        uuid not null references public.creators (id) on delete cascade,

  -- Provenance: which grant or which org this came through. Both nullable
  -- because a Pro member has no access_request, and a token holder has no org.
  access_request_id uuid references public.access_requests (id) on delete set null,
  organization_id   uuid references public.organizations (id) on delete set null,

  company_name      text not null check (char_length(company_name) between 1 and 120),
  sender_name       text not null check (char_length(sender_name) between 1 and 120),
  sender_email      citext not null check (sender_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),

  deliverables      text not null check (char_length(deliverables) between 1 and 2000),
  amount            numeric(12, 2) not null check (amount >= 0),
  currency          char(3) not null default 'USD',
  flight_start      date,
  flight_end        date,
  exclusivity_days  integer check (exclusivity_days between 0 and 730),
  usage_rights      text check (char_length(usage_rights) <= 500),
  notes             text check (char_length(notes) <= 2000),

  status            public.offer_status not null default 'sent',
  created_at        timestamptz not null default now(),
  responded_at      timestamptz,
  updated_at        timestamptz not null default now(),

  constraint flight_dates_ordered
    check (flight_start is null or flight_end is null or flight_start <= flight_end)
);

create index offers_creator_status_idx on public.offers (creator_id, status, created_at desc);
create index offers_org_idx on public.offers (organization_id) where organization_id is not null;

create trigger offers_set_updated_at
  before update on public.offers
  for each row execute function public.tg_set_updated_at();

-- Stamp the decision time wherever the status is changed from.
create or replace function public.tg_offer_on_status_change()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    new.responded_at := now();
  end if;
  return new;
end;
$$;

create trigger offers_on_status_change
  before update of status on public.offers
  for each row execute function public.tg_offer_on_status_change();

alter table public.offers enable row level security;

-- The creator owns their inbox and is the only party who may accept or decline.
create policy offers_creator_read on public.offers
  for select to authenticated using (public.owns_creator(creator_id));

create policy offers_creator_update on public.offers
  for update to authenticated
  using (public.owns_creator(creator_id))
  with check (public.owns_creator(creator_id));

-- The sending org can see what it sent, and withdraw it.
create policy offers_org_read on public.offers
  for select to authenticated
  using (organization_id in (select public.user_org_ids()));

create policy offers_org_update on public.offers
  for update to authenticated
  using (organization_id in (select public.user_org_ids()))
  with check (organization_id in (select public.user_org_ids()));

-- ---------------------------------------------------------------------------
-- RPC: send an offer
--
-- SECURITY DEFINER because the most important caller is anonymous: a Track A
-- token holder never creates an account. The token is the credential, and it is
-- validated here on exactly the terms get_report_by_token() uses — approved,
-- unexpired, and bound to this creator.
-- ---------------------------------------------------------------------------
create or replace function public.submit_offer(
  p_creator_handle   text,
  p_company_name     text,
  p_sender_name      text,
  p_sender_email     text,
  p_deliverables     text,
  p_amount           numeric,
  p_currency         char(3) default 'USD',
  p_flight_start     date default null,
  p_flight_end       date default null,
  p_exclusivity_days integer default null,
  p_usage_rights     text default null,
  p_notes            text default null,
  p_token            uuid default null
)
returns table (offer_id uuid, offer_status public.offer_status)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_creator public.creators%rowtype;
  v_request public.access_requests%rowtype;
  v_org_id  uuid;
begin
  select * into v_creator
  from public.creators
  where handle = lower(btrim(p_creator_handle, '@'));

  if not found then
    raise exception 'creator_not_found' using errcode = 'no_data_found';
  end if;

  -- Path 1: a valid Track A grant.
  if p_token is not null then
    select * into v_request
    from public.access_requests
    where access_token = p_token
      and creator_id = v_creator.id
      and status = 'approved'
      and expires_at > now();

    if not found then
      raise exception 'invalid_grant' using errcode = 'insufficient_privilege';
    end if;
  else
    -- Path 2: a signed-in Pro Agency member, and only for a creator who opted
    -- into the directory — the same condition that unlocked the report.
    select m.organization_id into v_org_id
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    where m.user_id = auth.uid() and o.billing_plan = 'pro_agency'
    limit 1;

    if v_org_id is null or not v_creator.is_directory_visible then
      raise exception 'invalid_grant' using errcode = 'insufficient_privilege';
    end if;
  end if;

  return query
  insert into public.offers (
    creator_id, access_request_id, organization_id,
    company_name, sender_name, sender_email,
    deliverables, amount, currency,
    flight_start, flight_end, exclusivity_days, usage_rights, notes
  )
  values (
    v_creator.id, v_request.id, coalesce(v_org_id, v_request.organization_id),
    btrim(p_company_name), btrim(p_sender_name), lower(btrim(p_sender_email)),
    btrim(p_deliverables), p_amount, coalesce(p_currency, 'USD'),
    p_flight_start, p_flight_end, p_exclusivity_days,
    nullif(btrim(p_usage_rights), ''), nullif(btrim(p_notes), '')
  )
  returning offers.id, offers.status;
end;
$$;

revoke all on function public.submit_offer(
  text, text, text, text, text, numeric, char, date, date, integer, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.submit_offer(
  text, text, text, text, text, numeric, char, date, date, integer, text, text, uuid
) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Privilege lockdown: clients read and respond, they never write rows.
-- ---------------------------------------------------------------------------
revoke all on public.offers from anon;
revoke insert, delete on public.offers from authenticated;
revoke update on public.offers from authenticated;
grant  update (status) on public.offers to authenticated;
