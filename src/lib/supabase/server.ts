import 'server-only';

import { cookies } from 'next/headers';
import { createServerClient as createSSRClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * The app ships with fixtures so `npm run dev` works before anyone provisions a
 * project. Every data-layer entry point branches on this — it never mixes
 * fixture data with live rows.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(URL && ANON_KEY);
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
    { auth: { persistSession: false, autoRefreshToken: false } },
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

