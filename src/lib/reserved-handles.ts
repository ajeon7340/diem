/**
 * Handles that would shadow a real route. Kept in sync with
 * `public.is_reserved_handle()` in supabase/migrations/0002_registration.sql —
 * the database is the enforcement point (a CHECK constraint on `creators`);
 * this copy powers the route canonicaliser in middleware and the inline form
 * error, so the user is told before they submit.
 */
export const RESERVED_HANDLES = [
  'about',
  'admin',
  'api',
  'auth',
  'billing',
  'dashboard',
  'directory',
  'docs',
  'help',
  'join',
  'login',
  'logout',
  'offers',
  'onboarding',
  'pricing',
  'privacy',
  'settings',
  'signin',
  'signout',
  'signup',
  'support',
  'terms',
  'www',
] as const;

const RESERVED = new Set<string>(RESERVED_HANDLES);

export function isReservedHandle(handle: string): boolean {
  return RESERVED.has(handle.trim().replace(/^@+/, '').toLowerCase());
}
