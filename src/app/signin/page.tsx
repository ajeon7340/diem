import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthShell } from '@/components/auth/AuthShell';
import { MagicLinkForm } from '@/components/auth/MagicLinkForm';
import { isSupabaseConfigured } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  link_expired: 'That sign-in link has expired or was already used. Request a new one.',
  missing_code: 'That link was incomplete. Request a new one.',
};

export default function SignInPage({
  searchParams,
}: {
  searchParams: { error?: string; channel?: string };
}) {
  const error = searchParams.error ? ERRORS[searchParams.error] : undefined;

  return (
    <AuthShell
      eyebrow="Sign in"
      title="Welcome back"
      intro="We'll email you a one-time link. No password to remember."
      footer={
        <>
          New here?{' '}
          <Link href={`/join/business?channel=${encodeURIComponent(searchParams.channel ?? '')}`} className="text-indigo underline-offset-4 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      {error ? (
        <p className="mb-4 rounded-md border border-amber/30 bg-amber-wash px-3 py-2 text-[12px] text-amber">
          {error}
        </p>
      ) : null}
      <MagicLinkForm channel={searchParams.channel} accountType={null} demoMode={!isSupabaseConfigured()} />
    </AuthShell>
  );
}
