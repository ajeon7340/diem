import type { Metadata } from 'next';
import Link from 'next/link';

import { getViewer } from '@/lib/access/viewer';
import { fixtureCreatorById } from '@/lib/data/fixtures';
import { getCreatorYouTubeHandle } from '@/lib/data/requests';
import { SiteHeader } from '@/components/shell/SiteHeader';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { DriverList } from '@/components/studio/DriverList';
import { ExplainBox } from '@/components/studio/ExplainBox';
import { TrendingList } from '@/components/studio/TrendingList';
import { Panel } from '@/components/ui/Panel';
import { analyseOwnChannel, type ChannelAnalysis } from '@/lib/youtube/explain';
import { YouTubeError } from '@/lib/youtube/client';
import { fetchTrending } from '@/lib/youtube/trending';
import { CATEGORIES, REGIONS } from '@/lib/youtube/trending';
import { compactNumber } from '@/lib/format';

export const metadata: Metadata = { title: 'Studio' };
export const dynamic = 'force-dynamic';

/**
 * The creator's own workbench.
 *
 * adfit is a two-sided market and supply has to arrive first, but every other
 * page in this dashboard requires a brand to have already shown up. This one
 * does not: it reads the creator's own catalogue, explains anybody's video
 * against its own channel, and shows what the region is watching. All of it is
 * useful on a platform with zero advertisers, which is the only condition that
 * matters at the start.
 *
 * It also sits on the right side of every policy line we have hit. Analysis
 * within one channel is explicitly permitted where cross-channel aggregation
 * is not; the trending chart is YouTube's own published list rather than
 * anything we aggregate. The constraints that block the buyer-facing cohort do
 * not reach here.
 */
export default async function StudioPage({
  searchParams,
}: {
  searchParams: { region?: string; category?: string };
}) {
  const viewer = await getViewer();

  if (!viewer.creatorId) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="rail">Creator only</p>
          <h1 className="mt-3 text-xl font-semibold tracking-tight text-ink">
            Sign in as a creator
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
            Studio reads your own channel. No agency sees this page on any plan.
          </p>
          <Link href="/" className="mt-6 text-[13px] text-indigo underline-offset-4 hover:underline">
            Back to adfit
          </Link>
        </main>
      </div>
    );
  }

  const creator = fixtureCreatorById(viewer.creatorId);
  const handle = await getCreatorYouTubeHandle(viewer.creatorId);

  const region = REGIONS.some((r) => r.code === searchParams.region)
    ? searchParams.region!
    : 'KR';
  const category = CATEGORIES.some((c) => c.id === searchParams.category)
    ? searchParams.category!
    : null;

  // Both calls are allowed to fail independently: a spent quota should cost the
  // page one panel, not all of it.
  const [mine, trending] = await Promise.all([
    handle
      ? analyseOwnChannel(handle)
          .then((s) => ({ ok: true as const, value: s.value, reason: null as string | null }))
          .catch((e: unknown) => {
            console.error('[studio] own channel failed', e);
            const reason = e instanceof YouTubeError ? e.reason : null;
            return { ok: false as const, reason, value: null as ChannelAnalysis | null };
          })
      : Promise.resolve({ ok: false as const, reason: 'no_handle', value: null as ChannelAnalysis | null }),
    fetchTrending(region, category).catch((e: unknown) => {
      console.error('[studio] trending failed', e);
      return null;
    }),
  ]);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 bg-paper">
        <div className="relative mx-auto w-full max-w-3xl px-5 py-12 sm:px-8">
          <p className="rail">Your channel</p>
          <h1 className="mt-2 text-[24px] font-semibold tracking-tight text-ink">Studio</h1>
          <DashboardNav active="/dashboard/studio" />

          <p className="mt-6 max-w-[64ch] text-[13px] leading-relaxed text-ink-muted">
            What actually moves views on your channel, why any video did what it did, and what the
            region is watching. None of this needs a brand to be looking at you.
          </p>

          <div className="mt-8 space-y-4">
            {mine.ok && mine.value && mine.value.sampleSize > 0 ? (
              <Panel
                title="What moves views on your channel"
                meta={`${mine.value.sampleSize} recent posts · ${mine.value.units} units`}
              >
                <div className="flex flex-wrap gap-x-8 gap-y-4 border-b border-line px-5 py-4">
                  <div>
                    <div className="rail">Median views</div>
                    <div className="tnum mt-1.5 text-[22px] font-medium leading-none text-ink">
                      {compactNumber(mine.value.medianViews)}
                    </div>
                  </div>
                  <div>
                    <div className="rail">Best ÷ median</div>
                    <div className="tnum mt-1.5 text-[22px] font-medium leading-none text-ink">
                      {mine.value.spread === null ? '—' : `${mine.value.spread.toFixed(1)}×`}
                    </div>
                    <p className="mt-1.5 text-[11px] text-ink-faint">
                      {mine.value.spread !== null && mine.value.spread > 5
                        ? 'a good post is a spike, not a floor'
                        : 'your posts land in a tight band'}
                    </p>
                  </div>
                  {mine.value.subscribers !== null ? (
                    <div>
                      <div className="rail">Subscribers</div>
                      <div className="tnum mt-1.5 text-[22px] font-medium leading-none text-ink">
                        {compactNumber(mine.value.subscribers)}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="px-5 py-4">
                  <DriverList drivers={mine.value.drivers} />
                </div>
              </Panel>
            ) : (
              <Panel
                title="What moves views on your channel"
                meta={
                  mine.ok && mine.value?.sampleSize === 0
                    ? 'no posts yet'
                    : mine.reason === 'no_handle'
                      ? 'not connected'
                      : 'unavailable'
                }
              >
                {/* Naming the failure matters here. "Unavailable" over a
                    fictional demo channel and "unavailable" over a spent quota
                    are different problems with different fixes, and a creator
                    who cannot tell them apart assumes the product is broken. */}
                <p className="px-5 py-8 text-center text-[12px] leading-relaxed text-ink-muted">
                  {mine.ok && mine.value?.sampleSize === 0 ? (
                    <>
                      No public uploads on{' '}
                      <span className="tnum text-ink">{handle}</span> yet. This panel needs posts to
                      compare against each other — it fills in once you publish.
                    </>
                  ) : mine.reason === 'no_handle' ? (
                    'Connect a YouTube channel in Settings and this fills in.'
                  ) : mine.reason === 'quotaExceeded' ? (
                    <>
                      The daily YouTube quota is spent. It resets at midnight Pacific — nothing is
                      wrong with your channel.
                    </>
                  ) : mine.reason === 'notFound' ? (
                    <>
                      YouTube has no channel at{' '}
                      <span className="tnum text-ink">{handle}</span>. If you are on the demo
                      account that is expected — the sample creators are fictional. The box below
                      runs the same analysis on any real video.
                    </>
                  ) : (
                    'Could not read your channel just now.'
                  )}
                </p>
              </Panel>
            )}

            <ExplainBox />

            {trending ? (
              <TrendingList data={trending} niche={creator?.niche ?? null} />
            ) : (
              <Panel title="Trending now" meta="unavailable">
                <p className="px-5 py-8 text-center text-[12px] leading-relaxed text-ink-muted">
                  YouTube&rsquo;s chart could not be read just now.
                </p>
              </Panel>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
