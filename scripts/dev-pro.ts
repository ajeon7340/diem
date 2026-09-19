/**
 * Grant an org Pro Agency status, without Stripe.
 *
 * `organizations.billing_plan` is written only by the Stripe webhook, and no
 * such webhook exists yet — nothing in the product can move an org off `free`.
 * That makes Track B (instant directory access, bulk campaign briefs)
 * unreachable through the app at all, the same gap `dev-session.ts` closes for
 * magic-link email: a real mechanism that has no way to be exercised in this
 * environment.
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.scripts.json \
 *     scripts/dev-pro.ts marahwoods-agency@demo.adfit.invalid
 *
 * REFUSES ANY ADDRESS OUTSIDE @demo.adfit.invalid, and REFUSES an org whose
 * name does not start with "Demo ". Both guards exist for the same reason:
 * this writes directly through the service role, bypassing the exact RLS rule
 * the column grant in 0001 exists to enforce, and a typo pointed at a real
 * org must not be able to hand a real advertiser free access to every locked
 * report on the platform.
 */
import { createClient } from '@supabase/supabase-js';

const email = process.argv[2];

const DEMO_DOMAIN = '@demo.adfit.invalid';
if (!email || !email.endsWith(DEMO_DOMAIN)) {
  console.error(`  Refusing ${email || '(no address)'} — this script only touches ${DEMO_DOMAIN} accounts.`);
  process.exit(1);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const user = list.users.find((u) => u.email === email);
  if (!user) {
    console.error(`  No account for ${email} yet — run dev-session.ts first to create it.`);
    process.exit(1);
  }

  const { data: membership, error: memberError } = await admin
    .from('organization_members')
    .select('organization_id, organizations(id, name, billing_plan)')
    .eq('user_id', user.id)
    .maybeSingle<{
      organization_id: string;
      organizations: { id: string; name: string; billing_plan: string } | null;
    }>();

  if (memberError || !membership?.organizations) {
    console.error(`  ${email} has no organization yet — complete /onboarding/business first.`);
    process.exit(1);
  }

  const org = membership.organizations;
  if (!org.name.startsWith('Demo ')) {
    console.error(
      `  Refusing "${org.name}" — this script only upgrades organizations named "Demo …", ` +
        `so a real workspace created by a real user cannot be granted Pro by a typo.`,
    );
    process.exit(1);
  }

  const { error } = await admin
    .from('organizations')
    .update({ billing_plan: 'pro_agency' })
    .eq('id', org.id);

  if (error) {
    console.error('  update failed:', error.message);
    process.exit(1);
  }

  console.log(`  "${org.name}" (${org.id}) is now pro_agency.`);
}
main();
