-- =============================================================================
-- `campaigns` becomes a reserved handle.
--
-- The middleware treats any unreserved single path segment as a creator handle
-- and 308s it to /@segment. With the campaign flow live that turned the
-- product's main page into a redirect to a profile that does not exist — a 404
-- on /campaigns, reproduced the first time the route was requested.
--
-- The list exists in two places by design (see lib/reserved-handles.ts): this
-- function is the enforcement point, a CHECK constraint on `creators`, and the
-- TypeScript copy is what tells someone before they submit the form. They must
-- be changed together, which is what this migration is doing.
--
-- Existing rows are not re-validated by adding to the function: a creator who
-- already holds 'campaigns' would keep it. Nobody does — the handle would have
-- had to be taken before the route existed — and the check below says so
-- rather than assuming it.
-- =============================================================================

create or replace function public.is_reserved_handle(p_handle text)
returns boolean
language sql immutable as $$
  select lower(p_handle) = any (array[
    'about', 'admin', 'api', 'auth', 'billing', 'campaigns', 'dashboard',
    'directory', 'docs', 'help', 'join', 'login', 'logout', 'offers',
    'onboarding', 'pricing', 'privacy', 'settings', 'signin', 'signout',
    'signup', 'support', 'terms', 'www'
  ]);
$$;

do $$
declare v_n integer;
begin
  select count(*) into v_n from public.creators where lower(handle::text) = 'campaigns';
  if v_n > 0 then
    raise exception
      'A creator already holds the handle "campaigns"; rename them before reserving it.';
  end if;
end
$$;
