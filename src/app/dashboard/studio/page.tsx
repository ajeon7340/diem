import type { Metadata } from 'next';
import Link from 'next/link';

import { getViewer } from '@/lib/access/viewer';
import { fixtureCreatorById } from '@/lib/data/fixtures';
import { SiteHeader } from '@/components/shell/SiteHeader';
import { ExplainBox } from '@/components/studio/ExplainBox';
import { TrendingList } from '@/components/studio/TrendingList';
import { Panel } from '@/components/ui/Panel';
import { fetchTrending } from '@/lib/youtube/trending';
import { CATEGORIES, REGIONS } from '@/lib/youtube/trending';

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

  const region = REGIONS.some((r) => r.code === searchParams.region)
    ? searchParams.region!
    : 'KR';
  const category = CATEGORIES.some((c) => c.id === searchParams.category)
    ? searchParams.category!
    : null;

  // Both calls are allowed to fail independently: a spent quota should cost the
  // page one panel, not all of it.
  // The own-channel analysis moved to /dashboard/videos, and with it the four
  // quota units it cost on every Studio load.
  const trending = await fetchTrending(region, category).catch((e: unknown) => {
    console.error('[studio] trending failed', e);
    return null;
  });

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 bg-paper">
        <div className="relative mx-auto w-full max-w-3xl px-5 py-12 sm:px-8">
          <p className="rail">Your channel</p>
          <h1 className="mt-2 text-[24px] font-semibold tracking-tight text-ink">Studio</h1>

          <p className="mt-6 max-w-[64ch] text-[13px] leading-relaxed text-ink-muted">
            What actually moves views on your channel, why any video did what it did, and what the
            region is watching. None of this needs a brand to be looking at you.
          </p>

          <div className="mt-8 space-y-4">
            {/* The per-video breakdown and the drivers derived from it moved
                to /dashboard/videos — its own question, and sharing a page
                made the first thing a creator saw a chart of other people's
                videos. A pointer rather than a duplicate. */}
            <Panel title="What moves views on your channel" meta="moved">
              <p className="px-5 py-6 text-center text-[12px] leading-relaxed text-ink-muted">
                Your uploads, each against your own median, now live in{' '}
                <Link
                  href="/dashboard/videos"
                  className="text-indigo underline-offset-4 hover:underline"
                >
                  Your videos
                </Link>{' '}
                — with the drivers beneath the posts they are measured from.
              </p>
            </Panel>

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
