import { nextStep } from '@/lib/channel/state';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AuthShell } from '@/components/auth/AuthShell';
import { BusinessOnboardingForm } from '@/components/onboarding/BusinessOnboardingForm';
import { getViewer } from '@/lib/access/viewer';
import { isSupabaseConfigured } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Create your workspace' };
export const dynamic = 'force-dynamic';

export default async function BusinessOnboardingPage({ searchParams }: { searchParams: { channel?: string } }) {
  if (isSupabaseConfigured()) {
    const viewer = await getViewer();
    if (!viewer.userId) redirect(nextStep({ signedIn: false, hasWorkspace: false }, searchParams.channel));
    // One org per user in the MVP; `create_organization` would reject a second.
    if (viewer.organization) {
      redirect(
        nextStep(
          { signedIn: true, hasWorkspace: true, brandSetup: viewer.organization.brandSetupState },
          searchParams.channel,
        ),
      );
    }
  }

  return (
    <AuthShell
      eyebrow="Step 1 of 2"
      width="form"
      title="Your workspace"
      intro="Two short steps. You can change either answer later in Settings."
      footer={null}
    >
      <BusinessOnboardingForm channel={searchParams.channel} />
    </AuthShell>
  );
}
