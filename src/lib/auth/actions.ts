'use server';

import { channelDestination } from '@/lib/channel/state';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { isMockEmail } from '@/lib/auth/mock';
import { emailSchema } from '@/lib/schemas';
import { createServiceClient, createSessionClient, isSupabaseConfigured } from '@/lib/supabase/server';

export interface MagicLinkState {
  status: 'idle' | 'sent' | 'error';
  email?: string;
  message?: string;
  /**
   * The sign-in link itself, shown on screen instead of emailed.
   *
   * Only ever set when `ADFIT_MOCK_EMAIL` is on. It is in the state — not
   * quietly followed — so the mock cannot be mistaken for the real thing: the
   * person signing in still has to click a link, and the screen says why they
   * are looking at one.
   */
  mockLink?: string;
}


/**
 * Where a given account type lands after clicking the emailed link.
 *
 * A link from /signin has no account type — it serves creators, agency owners,
 * and people who signed up but never onboarded alike — so it routes through
 * /auth/continue, which resolves the session and dispatches accordingly.
 */

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

  const next = channelDestination(formData.get('channel'), '/auth/continue');

  // Fixture mode: no auth provider to send through, so drop straight into
  // onboarding. The demo role is set when onboarding *completes* — setting it
  // here would make the onboarding guard think the account already exists.
  if (!isSupabaseConfigured()) {
    redirect(channelDestination(formData.get('channel'), '/onboarding/business'));
  }

  // Mocked delivery: mint the same one-time token Supabase would have emailed
  // and hand it over on screen. `/auth/mock` redeems it through verifyOtp, so
  // the resulting session is indistinguishable from a real sign-in.
  if (isMockEmail()) {
    const admin = createServiceClient();
    if (!admin) {
      return { status: 'error', message: 'Mock email is on but SUPABASE_SERVICE_ROLE_KEY is not set.' };
    }
    const { data, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: parsed.data,
    });
    if (linkError || !data.properties?.hashed_token) {
      // A magiclink for an address with no account fails here rather than
      // silently doing nothing — say so instead of claiming a link was sent.
      console.error('[auth] mock link failed', linkError?.message);
      return {
        status: 'error',
        message: `Could not mint a link for ${parsed.data}. In mock mode the account must already exist — create it in the Supabase dashboard, or use a seeded demo address.`,
      };
    }
    const link = `/auth/mock?token_hash=${encodeURIComponent(data.properties.hashed_token)}&next=${encodeURIComponent(next)}`;
    return { status: 'sent', email: parsed.data, mockLink: link };
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
