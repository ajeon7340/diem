import type { Metadata } from 'next';
import Link from 'next/link';

import { CampaignForm } from '@/components/campaign/CampaignForm';
import { SiteHeader } from '@/components/shell/SiteHeader';
import { getViewer } from '@/lib/access/viewer';
import { isSupabaseConfigured } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'New campaign' };
export const dynamic = 'force-dynamic';

export default async function NewCampaignPage() {
  const viewer = await getViewer();

  // A campaign belongs to an organisation, so there has to be one. Said as a
  // next step rather than as a refusal — the workspace form is one field.
  if (!viewer.organization) {
    return (
      <Shell>
        <p className="rail">Campaigns</p>
        <h1 className="mt-2 text-[24px] font-semibold tracking-tight text-ink">
          Create a workspace first
        </h1>
        <p className="mt-3 max-w-[56ch] text-[13px] leading-relaxed text-ink-muted">
          A campaign belongs to a company or agency, so that your briefs, your shortlists and the
          fees you were quoted stay yours. It takes one field.
        </p>
        <Link
          href="/onboarding/business"
          className="mt-6 inline-flex h-10 items-center rounded-md bg-indigo px-4 text-[13px] font-medium text-white transition-colors hover:bg-indigo-hover"
        >
          Create a workspace
        </Link>
        {!isSupabaseConfigured() ? (
          <p className="mt-6 rounded-md border border-amber/30 bg-amber-wash px-3 py-2 text-[12px] text-ink-muted">
            This deployment has no database configured, so nothing can be saved. See the README for
            the four variables it needs.
          </p>
        ) : null}
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="rail">New campaign</p>
      <h1 className="mt-2 text-[24px] font-semibold tracking-tight text-ink">
        What are you buying for?
      </h1>
      <p className="mt-2 max-w-[60ch] text-[13px] leading-relaxed text-ink-muted">
        This is the standard every candidate gets compared against. You add the channels next.
      </p>
      <div className="mt-6">
        <CampaignForm />
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 bg-paper">
        <div className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8">{children}</div>
      </main>
    </div>
  );
}
