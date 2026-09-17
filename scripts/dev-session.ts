/**
 * Mint a browser session for a demo account, without sending an email.
 *
 * `scripts/seed.ts` creates its accounts under `@demo.adfit.invalid`, a domain
 * reserved by RFC 2606 precisely so no mail can ever reach it — which leaves no
 * way to sign in as one and no way to exercise the owner, agency and dashboard
 * branches at all. Supabase's built-in email service also caps at a couple of
 * messages an hour per project, so even a deliverable address cannot carry a
 * test run:
 *
 *     [auth] magic link failed  email rate limit exceeded
 *
 * So: set a password through the admin API, sign in with it, and let
 * `@supabase/ssr` encode the cookie itself. Hand-rolling its base64 framing and
 * chunking would only prove something about the hand-rolling.
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.scripts.json \
 *     scripts/dev-session.ts gajaeman@demo.adfit.invalid
 *
 * Prints one Cookie header. Pass it to curl, or paste the cookie into a
 * browser, and you are signed in as that account.
 *
 * REFUSES ANY ADDRESS OUTSIDE @demo.adfit.invalid. This script overwrites the
 * password of whatever account it is pointed at; the seed domain is the only
 * place where that is a harmless thing to do, and a typo pointed at a real
 * project must not be able to lock a real person out of their own account.
 */
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const email = process.argv[2];
const password = 'demo-password-not-a-secret-9917';

const DEMO_DOMAIN = '@demo.adfit.invalid';
if (!email || !email.endsWith(DEMO_DOMAIN)) {
  console.error(`  Refusing ${email || '(no address)'} — this script only touches ${DEMO_DOMAIN} accounts.`);
  console.error('  It resets the password of the account it is given. See the header.');
  process.exit(1);
}


async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  let user = list.users.find((u) => u.email === email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) { console.error('create:', error?.message); process.exit(1); }
    user = data.user;
  } else {
    const { error } = await admin.auth.admin.updateUserById(user.id, { password });
    if (error) { console.error('set password:', error.message); process.exit(1); }
  }

  const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session) { console.error('sign in:', error?.message); process.exit(1); }

  const jar: Record<string, string> = {};
  const ssr = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })),
      setAll: (l) => l.forEach(({ name, value }) => { jar[name] = value; }),
    },
  });
  await ssr.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  console.log(Object.entries(jar).map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join('; '));
}
main();
