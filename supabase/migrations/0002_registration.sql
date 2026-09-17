-- =============================================================================
-- adfit — Migration 0002: registration
--
-- Adds the two things signup needs that 0001 could not express:
--
--   1. A way to create the *first* organization. 0001 has no INSERT policy on
--      `organizations`, and `organization_members` only lets existing admins
--      write — so the first org and its first member were unreachable from any
--      client. A SECURITY DEFINER function does both in one transaction.
--
--   2. Reserved handles. A creator claiming `directory` or `dashboard` would
--      shadow a real route, so the constraint lives in the database rather than
--      only in form validation.
--
-- Creator signup needs no new SQL: 0001 already grants `authenticated` a
-- column-scoped INSERT on `creators` behind the `creators_owner_insert` policy,
-- which deliberately excludes `is_verified`.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Reserved handles
-- ---------------------------------------------------------------------------
-- IMMUTABLE so it can back a CHECK constraint. Keep in sync with
-- RESERVED_HANDLES in src/lib/reserved-handles.ts, which powers the route
-- canonicaliser in middleware and the inline form error.
-- Recreated safely on re-run; the CHECK constraint below is added only once.
create or replace function public.is_reserved_handle(p_handle text)
returns boolean
language sql immutable as $$
  select lower(p_handle) = any (array[
    'about', 'admin', 'api', 'auth', 'billing', 'dashboard', 'directory',
    'docs', 'help', 'join', 'login', 'logout', 'offers', 'onboarding',
    'pricing', 'privacy', 'settings', 'signin', 'signout', 'signup',
    'support', 'terms', 'www'
  ]);
$$;

do $$ begin
  alter table public.creators
    add constraint creators_handle_not_reserved
    check (not public.is_reserved_handle(handle::text));
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: create an organization and its owner membership
--
-- SECURITY DEFINER because the caller holds no INSERT on either table — which
-- is also what stops a client inventing a `pro_agency` org: `billing_plan` is
-- never taken from the caller, it takes the column default ('free') and only
-- the Stripe webhook (service role) can change it afterwards.
-- ---------------------------------------------------------------------------
create or replace function public.create_organization(p_name text)
returns table (organization_id uuid, organization_name text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id  uuid;
  v_name    text := btrim(p_name);
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'invalid_organization_name' using errcode = 'check_violation';
  end if;

  -- One org per user for the MVP. `getViewer()` resolves a single membership,
  -- and multi-org switching is a Phase 2 surface; fail loudly rather than
  -- create state the app cannot represent.
  if exists (select 1 from public.organization_members where user_id = v_user_id) then
    raise exception 'already_in_organization' using errcode = 'unique_violation';
  end if;

  insert into public.organizations (name)
  values (v_name)
  returning id into v_org_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org_id, v_user_id, 'owner');

  return query select v_org_id, v_name;
end;
$$;

-- Revoked from anon by name: a default privilege grant survives a revoke
-- from PUBLIC, and org creation must require a real session.
revoke all on function public.create_organization(text) from public, anon, authenticated;
grant execute on function public.create_organization(text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: handle availability
--
-- Handles are public (they are URLs), so this leaks nothing a visitor could not
-- learn by loading /@handle. It exists so the signup form can answer before
-- submit instead of surfacing a unique-violation.
-- ---------------------------------------------------------------------------
create or replace function public.is_handle_available(p_handle text)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  -- Normalise once, then apply both checks to the same value: '@dashboard'
  -- must read as reserved, not as a free handle that merely looks different.
  with normalised as (select lower(btrim(p_handle, '@')) as handle)
  select not public.is_reserved_handle(n.handle)
     and not exists (select 1 from public.creators c where c.handle = n.handle)
  from normalised n;
$$;

revoke all on function public.is_handle_available(text) from public, anon, authenticated;
grant execute on function public.is_handle_available(text) to anon, authenticated;
