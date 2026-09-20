import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthShell } from '@/components/auth/AuthShell';
import { MagicLinkForm } from '@/components/auth/MagicLinkForm';
import { isSupabaseConfigured } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Business sign-up' };
export const dynamic = 'force-dynamic';

export default function JoinBusinessPage({ searchParams }: { searchParams: { channel?: string } }) {
  return (
    <AuthShell
      eyebrow="Brand or agency · Step 1 of 2"
      title="Create a business workspace"
      intro="Enter your work email and we'll send a one-time sign-in link. You'll name your workspace on the next screen."
      footer={
        <>
          Already have a workspace?{' '}
          <Link href={`/signin?channel=${encodeURIComponent(searchParams.channel ?? '')}`} className="text-indigo underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <MagicLinkForm
        channel={searchParams.channel}
        accountType="business"
        label="Continue with email"
        demoMode={!isSupabaseConfigured()}
      />
    </AuthShell>
  );
}
