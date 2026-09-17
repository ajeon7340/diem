'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { emailSchema, ACCOUNT_TYPES, type AccountType } from '@/lib/schemas';
import { createSessionClient, isSupabaseConfigured } from '@/lib/supabase/server';

export interface MagicLinkState {
  status: 'idle' | 'sent' | 'error';
  email?: string;
  message?: string;
}

/**
 * Where a given account type lands after clicking the emailed link.
 *
 * A link from /signin has no account type — it serves creators, agency owners,
 * and people who signed up but never onboarded alike — so it routes through
 * /auth/continue, which resolves the session and dispatches accordingly.
 */
function destinationFor(accountType: AccountType | null): string {
  if (accountType === 'creator') return '/onboarding/creator';
  if (accountType === 'business') return '/onboarding/business';
  return '/auth/continue';
}

function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, '');

  const header = headers();
  const host = header.get('x-forwarded-host') ?? header.get('host') ?? 'localhost:3000';
  const protocol = header.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${protocol}://${host}`;
}

/**
 * Sends a passwordless sign-in link.
 *
 * `shouldCreateUser` is true for both register and sign-in: with magic links
 * the two are the same request, and refusing to create would leak which
 * addresses already hold an account. The response is identical either way.
 */
export async function sendMagicLink(
  _prev: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  const parsed = emailSchema.safeParse(formData.get('email'));
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Invalid email' };
  }

  const rawType = String(formData.get('accountType') ?? '');
  const accountType = (ACCOUNT_TYPES as readonly string[]).includes(rawType)
    ? (rawType as AccountType)
    : null;
  const next = destinationFor(accountType);

  // Fixture mode: no auth provider to send through, so drop straight into
  // onboarding. The demo role is set when onboarding *completes* — setting it
  // here would make the onboarding guard think the account already exists.
  if (!isSupabaseConfigured()) {
    redirect(next);
  }

  const supabase = createSessionClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    console.error('[auth] magic link failed', error.message);
    return { status: 'error', message: 'Could not send the link. Please try again.' };
  }

  return { status: 'sent', email: parsed.data };
}
