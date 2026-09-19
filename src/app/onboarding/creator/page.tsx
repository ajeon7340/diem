import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AuthShell } from '@/components/auth/AuthShell';
import { CreatorOnboardingForm } from '@/components/onboarding/CreatorOnboardingForm';
import { getViewer } from '@/lib/access/viewer';
import { getCreatorHandle } from '@/lib/data/requests';
import { isSupabaseConfigured } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Set up your media kit' };
export const dynamic = 'force-dynamic';

export default async function CreatorOnboardingPage() {
  // Fixture mode has no session to check; the form is the demo.
  if (isSupabaseConfigured()) {
    const viewer = await getViewer();
    if (!viewer.userId) redirect('/join/creator');

    // Already onboarded — send them to their own profile rather than letting
    // them hit the unique violation on `creators.user_id`.
    if (viewer.creatorId) {
      const handle = await getCreatorHandle(viewer.creatorId);
      redirect(handle ? `/@${handle}` : '/dashboard/requests');
    }
  }

  return (
    <AuthShell
      eyebrow="Creator · Step 2 of 2"
      title="Connect your channel"
      width="form"
      footer={null}
    >
      <CreatorOnboardingForm />
    </AuthShell>
  );
}
