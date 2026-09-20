import { NextResponse, type NextRequest } from 'next/server';

import { createSessionClient, isSupabaseConfigured } from '@/lib/supabase/server';

/**
 * Magic-link landing. Exchanges the one-time code for a session, then forwards
 * to whichever onboarding step the link was issued for.
 *
 * `next` is validated as a same-origin absolute path before use — an open
 * redirect here would let an attacker mint a link that authenticates the victim
 * and then bounces them to a look-alike host.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const raw = searchParams.get('next') ?? '/';
  const next = raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('\\') && !/[\r\n]/.test(raw) ? raw : '/';

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/signin?error=missing_code&channel=${encodeURIComponent(new URL(next, origin).searchParams.get('channel') ?? '')}`);
  }

  const supabase = createSessionClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[auth] code exchange failed', error.message);
    return NextResponse.redirect(`${origin}/signin?error=link_expired&channel=${encodeURIComponent(new URL(next, origin).searchParams.get('channel') ?? '')}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
