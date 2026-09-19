import type { Metadata } from 'next';
import Link from 'next/link';

import { SiteHeader } from '@/components/shell/SiteHeader';
import { Panel } from '@/components/ui/Panel';
import { getViewer } from '@/lib/access/viewer';
import { getCampaigns } from '@/lib/data/campaigns';
import { isSupabaseConfigured } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Campaigns' };
export const dynamic = 'force-dynamic';

export default async function CampaignsPage() {
  const viewer = await getViewer();
  const campaigns = viewer.organization ? await getCampaigns(viewer.organization.id) : [];

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 bg-paper">
        <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="rail">
                {viewer.organization ? viewer.organization.name : 'Campaigns'}
              </p>
              <h1 className="mt-2 text-[24px] font-semibold tracking-tight text-ink">Campaigns</h1>
            </div>
            <Link
              href="/campaigns/new"
              className="inline-flex h-9 shrink-0 items-center rounded-md bg-indigo px-4 text-[13px] font-medium text-white transition-colors hover:bg-indigo-hover"
            >
              New campaign
            </Link>
          </div>

          {!isSupabaseConfigured() ? (
            <p className="mt-6 rounded-md border border-amber/30 bg-amber-wash px-3 py-2 text-[12px] text-ink-muted">
              No database is configured, so campaigns cannot be saved here. The analysis itself
              needs <code className="tnum">YOUTUBE_API_KEY</code> and a model key as well — see the
              README.
            </p>
          ) : null}

          <div className="mt-6 space-y-3">
            {campaigns.length === 0 ? (
              <Panel title="Nothing yet" meta="0">
                <div className="px-5 py-8 text-center">
                  <p className="mx-auto max-w-[48ch] text-[13px] leading-relaxed text-ink-muted">
                    A campaign holds one brief and the channels you are weighing against it. Paste
                    any YouTube channel — nobody has to have signed up, approved you, or connected
                    an account.
                  </p>
                  <Link
                    href="/campaigns/new"
                    className="mt-5 inline-flex h-9 items-center rounded-md bg-indigo px-4 text-[13px] font-medium text-white transition-colors hover:bg-indigo-hover"
                  >
                    Create a campaign
                  </Link>
                </div>
              </Panel>
            ) : (
              campaigns.map((campaign) => (
                <Link
                  key={campaign.id}
                  href={`/campaigns/${campaign.id}`}
                  className="block rounded-panel border border-line bg-surface px-5 py-4 transition-colors hover:border-line-strong"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <h2 className="truncate text-[14px] font-medium text-ink">{campaign.name}</h2>
                    <span className="tnum shrink-0 text-[11px] text-ink-faint">
                      {new Date(campaign.createdAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[12px] text-ink-muted">
                    {[campaign.brand, campaign.objective].filter(Boolean).join(' · ') ||
                      'No brief details yet'}
                  </p>
                </Link>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
