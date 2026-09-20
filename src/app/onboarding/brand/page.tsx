import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { skipBrandSetup } from '@/app/actions/brand';
import { AuthShell } from '@/components/auth/AuthShell';
import { BrandForm } from '@/components/brand/BrandForm';
import { getViewer } from '@/lib/access/viewer';
import { channelDestination, channelInput, nextStep } from '@/lib/channel/state';
import { getBrands } from '@/lib/data/brands';
import { isSupabaseConfigured } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Your brand' };
export const dynamic = 'force-dynamic';

/**
 * Step 2: the brand whose products are being promoted.
 *
 * SEPARATE FROM THE WORKSPACE, and the wording changes with the account type,
 * because they are genuinely different questions. A brand describes itself; an
 * agency describes a CLIENT, and prefilling the agency's own name into the
 * brand field would produce exactly the confusion this step exists to remove.
 *
 * SKIPPABLE IN ONE CLICK. Somebody who arrived with a channel to analyse should
 * reach their first report without writing a company description first — and
 * "Set up later" is recorded as an answer, so they are not asked again on the
 * next sign-in.
 *
 * RESUMABLE. A workspace whose brand step is still 'pending' is routed back
 * here by `nextStep`; anything already typed and saved comes back prefilled.
 */
export default async function BrandOnboardingPage({
  searchParams,
}: {
  searchParams: { channel?: string };
}) {
  const channel = channelInput(searchParams.channel);

  if (!isSupabaseConfigured()) {
    // Fixture mode has no workspace to attach a brand to, and a form that
    // cannot save is worse than one that is not offered.
    redirect(channelDestination(channel));
  }

  const viewer = await getViewer();
  if (!viewer.userId || !viewer.organization) {
    redirect(nextStep({ signedIn: Boolean(viewer.userId), hasWorkspace: false }, channel));
  }

  const brands = await getBrands(viewer.organization.id);
  const existing = brands[0] ?? null;
  const agency = viewer.organization.customerType === 'agency';

  return (
    <AuthShell
      eyebrow="Step 2 of 2"
      width="form"
      title={agency ? 'Add your first client brand' : 'Tell us about your brand'}
      intro={
        agency
          ? 'Discovery searches for the brand you pick, not for your agency. You can add more clients any time in Settings.'
          : 'Saved once and reused on every search, so you do not retype it. You can add more brands later.'
      }
      footer={null}
    >
      <BrandForm
        brand={existing}
        customerType={viewer.organization.customerType}
        workspaceName={viewer.organization.name}
        channel={channel || undefined}
        mode="onboarding"
        makeDefault
      />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <Link
          href={channelDestination(channel, '/onboarding/business')}
          className="text-[12px] text-ink-muted underline-offset-4 hover:underline"
        >
          ← Back
        </Link>

        <form action={skipBrandSetup}>
          <input type="hidden" name="channel" value={channel} />
          <button
            type="submit"
            className="text-[12px] text-ink-muted underline-offset-4 hover:text-ink hover:underline"
          >
            Set up later
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
