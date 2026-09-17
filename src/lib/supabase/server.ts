import 'server-only';

import { cookies } from 'next/headers';
import { createServerClient as createSSRClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * The app ships with fixtures so `npm run dev` works before anyone provisions a
 * project. Every data-layer entry point branches on this — it never mixes
 * fixture data with live rows.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(URL && ANON_KEY);
}

/**
 * Supabase reads must never enter Next's Data Cache.
 *
 * `export const dynamic = 'force-dynamic'` on the profile page turns off the
 * FULL ROUTE cache, and the comment there says why: "a cached unlocked render
 * would serve one brand's paid report to the next anonymous visitor." It does
 * not turn off the DATA cache. Next patches global `fetch`, and supabase-js
 * issues a plain GET for every `.select()`, so the row itself is cached on
 * disk under `.next/cache/fetch-cache` and replayed on later requests.
 *
 * Measured, not theorised: a creator's bio was changed directly in Postgres,
 * the anon client confirmed the new value, and the profile page kept rendering
 * the old one across a cache-busting query string, a full server restart, and
 * a rebuild. Deleting `.next/cache/fetch-cache` fixed it instantly.
 *
 * Two consequences, and the second is the serious one:
 *
 *   1. Staleness. A report that was just re-analysed, a handle that was just
 *      claimed, an access grant that was just revoked — none of it lands.
 *   2. Cross-visitor reuse. The anon client sends the same headers for every
 *      visitor, so one entry serves all of them. That is tolerable for the
 *      public teaser and is NOT tolerable for anything the gatekeeper decided,
 *      which is most of what this app does.
 *
 * `no-store` on every request opts the whole client out. It costs nothing that
 * was ever safe to keep: none of these reads are public, static, or shared.
 */
function uncachedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, cache: 'no-store' });
}

function requireEnv(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

/**
 * Anonymous, cookie-free client for the public teaser and the token RPC. No
 * session lookup, so the response stays cacheable.
 */
export function createAnonClient(): SupabaseClient {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL', URL),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: uncachedFetch },
    },
  );
}

/**
 * Session-aware client. RLS resolves `auth.uid()` from the forwarded cookie,
 * so this is the client that carries the owner and Pro-agency entitlements —
 * the directory and the unlocked report for opted-in creators both come back
 * through it, or come back empty, with no application-side plan check.
 */
export function createSessionClient(): SupabaseClient {
  const cookieStore = cookies();

  return createSSRClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL', URL),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY),
    {
      global: { fetch: uncachedFetch },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called during a Server Component render — refreshed cookies are
            // written on the middleware pass instead. Safe to ignore.
          }
        },
      },
    },
  );
}


/**
 * Service-role client. Bypasses RLS entirely.
 *
 * Exactly one caller is allowed to use it from a request path: the signup
 * analysis, which writes `report_metrics` and `social_accounts` for the
 * creator row the same request just created. Those two tables are
 * worker-written by design — a creator has no INSERT on either, and giving
 * them one would let anyone write their own audience figures, which is the
 * whole point of the report.
 *
 * The key is server-only (no NEXT_PUBLIC_ prefix, and this module imports
 * 'server-only'), so it cannot reach a browser bundle. Never pass a value from
 * the request into a query on this client without scoping it to a row the
 * caller was just proven to own.
 */
export function createServiceClient(): SupabaseClient | null {
  if (!URL || !SERVICE_KEY) return null;
  return createClient(URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: uncachedFetch },
  });
}
