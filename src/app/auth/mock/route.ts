import { NextResponse, type NextRequest } from 'next/server';

import { isMockEmail } from '@/lib/auth/mock';
import { createSessionClient, isSupabaseConfigured } from '@/lib/supabase/server';

/**
 * Redeem a mocked sign-in link.
 *
 * The delivery is mocked; the authentication is not. `sendMagicLink` minted a
 * real one-time token through the admin API, and this exchanges it through the
 * same `verifyOtp` call Supabase's own hosted link lands on. What comes out is
 * an ordinary session cookie with an ordinary expiry — there is no bypass here
 * and no branch anywhere else in the app that knows this route exists.
 *
 * Gated on ADFIT_MOCK_EMAIL. Without it the route 404s rather than 403s: a
 * disabled mock should not advertise itself.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  if (!isMockEmail() || !isSupabaseConfigured()) {
    return new NextResponse('Not found', { status: 404 });
  }

  const tokenHash = searchParams.get('token_hash');
  const raw = searchParams.get('next') ?? '/';
  // Same-origin absolute paths only — an open redirect here would authenticate
  // a victim and then bounce them to a look-alike host.
  const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';

  if (!tokenHash) {
    return NextResponse.redirect(`${origin}/signin?error=missing_code`);
  }

  const supabase = createSessionClient();
  const { error } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash });

  if (error) {
    console.error('[auth] mock verify failed', error.message);
    return NextResponse.redirect(`${origin}/signin?error=link_expired`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
