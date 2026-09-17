/**
 * Whether email delivery is mocked on this deployment.
 *
 * Supabase's built-in mailer allows about two messages an hour per project and
 * will not carry a real flow, so until SMTP is configured this is what makes
 * sign-in demonstrable end to end. It mints a REAL one-time token through the
 * admin API and shows the link instead of mailing it — the session that comes
 * out is the same session a real link produces, redeemed by the same
 * `verifyOtp` call. Nothing about the authentication is faked; only the inbox.
 *
 * Off unless explicitly switched on, so a deployment that forgets to set it
 * gets ordinary email rather than a sign-in link printed on a page.
 *
 * NOT in `lib/auth/actions.ts`, where it started: that file begins with
 * 'use server' and may export only async functions. React checks it when the
 * module is evaluated and throws at the POST, which is invisible to tsc, to
 * the build, and to every GET. `npm run verify:actions` caught this one.
 */
export function isMockEmail(): boolean {
  return process.env.ADFIT_MOCK_EMAIL === '1';
}
