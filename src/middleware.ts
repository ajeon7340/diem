import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * One job now: refresh the Supabase session cookie. Magic-link sessions
 * expire, and a Server Component cannot write cookies mid-render — so the
 * refresh has to happen here or a signed-in user silently becomes anonymous.
 *
 * TWO JOBS WENT WITH THE CREATOR HALF. It used to canonicalise `/handle` to
 * `/@handle`, which is what turned `/campaigns` into a 404 the first time that
 * route existed; and it marked `?token=` requests uncacheable, for the
 * time-limited report links a brand was sent. Neither route exists.
 */

export async function middleware(request: NextRequest) {
  const response = await refreshSession(request);
  if (request.nextUrl.pathname.startsWith('/shared/') || request.nextUrl.pathname.startsWith('/channels/') || request.nextUrl.pathname.startsWith('/campaigns/')) {
    response.headers.set('Cache-Control','private, no-store, max-age=0');
    response.headers.set('Referrer-Policy','no-referrer');
    response.headers.set('X-Robots-Tag','noindex, nofollow');
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
