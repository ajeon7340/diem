import { NextResponse, type NextRequest } from 'next/server';

import { getViewer } from '@/lib/access/viewer';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import { createSessionClient } from '@/lib/supabase/server';

/**
 * Post-sign-in dispatcher for returning users.
 *
 * A magic link issued from /signin carries no account type — the same link
 * serves a creator, an agency owner, and someone who signed up but never
 * finished onboarding. Rather than dumping all three on the home page, resolve
 * the session once and send each where they belong.
 */
export async function GET(request: NextRequest) {
  const { origin } = request.nextUrl;

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(`${origin}/`);
  }

  const viewer = await getViewer();

  if (!viewer.userId) {
    return NextResponse.redirect(`${origin}/signin?error=link_expired`);
  }

  if (viewer.creatorId) {
    const supabase = createSessionClient();
    const { data } = await supabase
      .from('creators')
      .select('handle')
      .eq('id', viewer.creatorId)
      .maybeSingle<{ handle: string }>();

    return NextResponse.redirect(`${origin}${data ? `/@${data.handle}` : '/dashboard/requests'}`);
  }

  if (viewer.organization) {
    return NextResponse.redirect(`${origin}/directory`);
  }

  // Authenticated but never onboarded — finish signing up rather than landing
  // on a marketing page with no account.
  return NextResponse.redirect(`${origin}/join`);
}
