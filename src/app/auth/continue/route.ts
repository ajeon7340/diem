import { nextStep } from '@/lib/channel/state';
import { NextResponse, type NextRequest } from 'next/server';

import { getViewer } from '@/lib/access/viewer';
import { isSupabaseConfigured } from '@/lib/supabase/server';

/**
 * Post-sign-in dispatcher for returning users.
 *
 * A magic link issued from /signin carries no account type, so the session is
 * resolved once here and the visitor is sent where they belong rather than
 * dumped on the marketing page.
 *
 * It used to have three destinations — a creator went to their own media kit,
 * an agency to the directory, an unfinished signup to the type chooser. Two of
 * those routes are gone; what is left is whether they have a workspace yet.
 */
export async function GET(request: NextRequest) {
  const { origin } = request.nextUrl;

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(
      `${origin}${nextStep({ signedIn: true, hasWorkspace: false }, request.nextUrl.searchParams.get('channel'))}`,
    );
  }

  const viewer = await getViewer();

  if (!viewer.userId) {
    return NextResponse.redirect(`${origin}/signin?error=link_expired`);
  }

  return NextResponse.redirect(
    `${origin}${nextStep(
      { signedIn: true, hasWorkspace: Boolean(viewer.organization) },
      request.nextUrl.searchParams.get('channel'),
    )}`,
  );
}
