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
 * What to tell someone whose link did not send.
 *
 * "Please try again" was the answer to every failure, and for the one that
 * actually happens it is the wrong instruction. Supabase's built-in email
 * service allows a couple of messages an hour per project — it is a testing
 * convenience, not a mailer — and past that every request returns
 *
 *     429  over_email_send_rate_limit  "email rate limit exceeded"
 *
 * Trying again is precisely what will not work, and a creator told to retry
 * will retry, fail, and conclude the product is broken. It is not their
 * address, their spam folder, or their timing: the project has no mail
 * provider configured. Say which of those it is.
 */
function magicLinkFailure(error: { code?: string; status?: number; message: string }): string {
  if (error.code === 'over_email_send_rate_limit' || error.status === 429) {
    return 'Sign-in email is rate-limited on this deployment and retrying will not clear it — the project has no mail provider configured yet. Please contact us and we will send you a link directly.';
  }
  // A redirect the project does not allow fails here rather than at the
  // callback, and the fix is a configuration change, not a retry.
  if (/redirect/i.test(error.message)) {
    return 'This sign-in link could not be issued for this address on this site. Please contact us — this is a configuration problem on our side, not yours.';
  }
  return 'Could not send the link. Please try again in a moment.';
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
    console.error('[auth] magic link failed', { code: error.code, status: error.status, message: error.message });
    return { status: 'error', message: magicLinkFailure(error) };
  }

  return { status: 'sent', email: parsed.data };
}
