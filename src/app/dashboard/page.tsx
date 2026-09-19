import { redirect } from 'next/navigation';

import { getViewer } from '@/lib/access/viewer';
import { isSupabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * `/dashboard` was a 404.
 *
 * Five pages live under it and none of them was `/dashboard` itself, so the one
 * URL a person types when they want "my stuff" returned nothing — and the site
 * header linked only two of the five, which meant Studio, Moderation and
 * Settings were reachable only from inside a page you had to already be on.
 *
 * Dispatches the same way `/auth/continue` does, for the same reason: one place
 * decides where an account belongs, so the answer cannot differ depending on
 * which door you came through.
 */
export default async function DashboardIndex() {
  if (!isSupabaseConfigured()) redirect('/dashboard/studio');

  const viewer = await getViewer();
  if (!viewer.userId) redirect('/signin');

  // Studio first for a creator: every other tab needs an advertiser to already
  // exist, and Studio is the one that pays them back on day one.
  if (viewer.creatorId) redirect('/dashboard/studio');
  // Was the directory, which answers "who could I buy from" and not "what
  // have I asked for" — the question a returning buyer actually has.
  if (viewer.organization) redirect('/dashboard/agency');
  redirect('/join');
}
