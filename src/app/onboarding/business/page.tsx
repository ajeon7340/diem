import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AuthShell } from '@/components/auth/AuthShell';
import { BusinessOnboardingForm } from '@/components/onboarding/BusinessOnboardingForm';
import { getViewer } from '@/lib/access/viewer';
import { isSupabaseConfigured } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Create your workspace' };
export const dynamic = 'force-dynamic';

export default async function BusinessOnboardingPage() {
  if (isSupabaseConfigured()) {
    const viewer = await getViewer();
    if (!viewer.userId) redirect('/join/business');
    // One org per user in the MVP; `create_organization` would reject a second.
    if (viewer.organization) redirect('/directory');
  }

  return (
    <AuthShell
      eyebrow="Brand or agency · Step 2 of 2"
      width="checklist"
      title="Name your workspace"
      footer={null}
    >
      <BusinessOnboardingForm />
    </AuthShell>
  );
}
