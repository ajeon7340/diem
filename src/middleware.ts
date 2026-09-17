import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

import { RESERVED_HANDLES } from '@/lib/reserved-handles';

/**
 * Three jobs:
 *
 *  1. Refresh the Supabase session cookie. Magic-link sessions expire, and a
 *     Server Component cannot write cookies mid-render — so the refresh has to
 *     happen here or a signed-in user silently becomes anonymous.
 *  2. Canonicalise `/handle` to `/@handle` so the public URL has one form.
 *  3. Mark any request carrying `?token=` as private and uncacheable.
 *
 * Access *verification* deliberately does not happen here. Middleware runs at
 * the edge and would have to re-validate on every asset request; the check
 * belongs next to the data fetch, in `resolveProfileAccess`, where the verdict
 * and the render cannot diverge.
 */
const RESERVED_SEGMENTS = new Set<string>(RESERVED_HANDLES);

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 1) {
    const segment = segments[0];
    const isProfileLike =
      !RESERVED_SEGMENTS.has(segment.toLowerCase()) && !segment.includes('.');

    if (isProfileLike && !segment.startsWith('@')) {
      const url = request.nextUrl.clone();
      url.pathname = `/@${segment.toLowerCase()}`;
      return NextResponse.redirect(url, 308);
    }
  }

  const response = await refreshSession(request);

  if (searchParams.has('token')) {
    // Belt and braces alongside `export const dynamic = 'force-dynamic'`:
    // no shared cache should ever hold an unlocked render.
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    response.headers.set('Referrer-Policy', 'no-referrer');
  }

  return response;
}

/**
 * Touches `getUser()` so `@supabase/ssr` rotates an expiring token and writes
 * the refreshed cookie onto the outgoing response. No-op when the project is
 * unconfigured (fixture mode).
 */
async function refreshSession(request: NextRequest): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let response = NextResponse.next({ request });
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    // Same reason as lib/supabase/server.ts: never let a token check come out
    // of a cache. This one decides who the request is.
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.[^/]+$).*)'],
};
