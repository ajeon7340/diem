import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthShell } from '@/components/auth/AuthShell';
import { MagicLinkForm } from '@/components/auth/MagicLinkForm';
import { isSupabaseConfigured } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Creator sign-up' };
export const dynamic = 'force-dynamic';

export default function JoinCreatorPage() {
  return (
    <AuthShell
      eyebrow="Influencer · Step 1 of 2"
      title="Publish a verified media kit"
      intro="Enter your email and we'll send a one-time sign-in link. You'll pick your handle on the next screen."
      footer={
        <>
          Registering a brand instead?{' '}
          <Link href="/join/business" className="text-indigo underline-offset-4 hover:underline">
            Create a business workspace
          </Link>
        </>
      }
    >
      <MagicLinkForm
        accountType="creator"
        label="Continue with email"
        demoMode={!isSupabaseConfigured()}
      />
    </AuthShell>
  );
}
