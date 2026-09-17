-- =============================================================================
-- Just enough Supabase to replay this repo's migrations on a throwaway Postgres.
--
-- The migrations are the only place the access model actually exists — the
-- paywall IS an RLS policy, the column grants are what stop a creator awarding
-- themselves the verified badge — and until this file existed the only way to
-- find a syntax error in one of them was to run it against the live project.
--
-- This is NOT a Supabase emulator and must never grow into one. It creates the
-- four objects the migrations reference by name and nothing else: the roles
-- that grants and policies are written against, the `auth` schema, a stand-in
-- `auth.users` for the foreign keys, and `auth.uid()`.
--
-- What a clean replay proves: every statement parses, every object referenced
-- exists by the time it is referenced, every constraint and index builds, and
-- no migration depends on state a fresh database does not have.
--
-- What it does NOT prove: that a policy admits the right rows. `auth.uid()`
-- here returns a settable GUC rather than a decoded JWT claim, so RLS behaviour
-- must still be probed against a real project with a real anon key — which is
-- how the `creators` anon-SELECT hole in 0024 was found, and it would not have
-- been found here.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists auth;

-- The migrations reference `auth.users` for foreign keys only. Columns beyond
-- the primary key are not modelled, because nothing in this repo reads them.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid()
);

-- Supabase derives this from the request JWT. Here it reads a session GUC, so a
-- replay can set it to exercise a policy by hand:
--
--     set local request.jwt.claim.sub = '...uuid...';
create or replace function auth.uid()
returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
