import type { Metadata } from 'next';
import Link from 'next/link';

import { CampaignForm } from '@/components/campaign/CampaignForm';
import { WorkspaceLayout } from '@/components/shell/WorkspaceLayout';
import { getViewer } from '@/lib/access/viewer';
import { getBrands } from '@/lib/data/brands';
import { isSupabaseConfigured } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'New campaign' };
export const dynamic = 'force-dynamic';

export default async function NewCampaignPage({searchParams}:{searchParams:{channelId?:string}}) {
  const viewer = await getViewer();

  // A campaign belongs to an organisation, so there has to be one. Said as a
  // next step rather than as a refusal — the workspace form is one field.
  if (!viewer.organization) {
    return (
      <Shell>
        <h2 className="text-[17px] font-semibold tracking-tight text-ink">
          Create a workspace first
        </h2>
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

  const brands = (await getBrands(viewer.organization.id)).map((brand) => ({
    id: brand.id,
    name: brand.name,
    sells: brand.sells,
    customerNeeds: brand.customerNeeds,
  }));

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
        <CampaignForm brands={brands} channelId={searchParams.channelId} customerType={viewer.organization.customerType} />
      </div>
    </Shell>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceLayout header={{ eyebrow: 'Campaigns', title: 'New campaign' }}>
      <div className="mx-auto w-full max-w-2xl">{children}</div>
    </WorkspaceLayout>
  );
}
