import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getViewer } from '@/lib/access/viewer';
import { getCreatorYouTubeHandle } from '@/lib/data/requests';
import { SiteHeader } from '@/components/shell/SiteHeader';
import { DriverList } from '@/components/studio/DriverList';
import { VideoList } from '@/components/studio/VideoList';
import { Panel } from '@/components/ui/Panel';
import { analyseOwnChannel, type ChannelAnalysis } from '@/lib/youtube/explain';
import { YouTubeError } from '@/lib/youtube/client';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import { compactNumber } from '@/lib/format';

export const metadata: Metadata = { title: 'Your videos' };
export const dynamic = 'force-dynamic';

/**
 * Every upload, each against this channel's own median.
 *
 * Its own tab because it is its own question. Studio answers "what is the
 * region watching and what works here"; this answers "which of my videos
 * worked, and what did people say under them" — and the second is what a
 * creator opens their analytics for. Sharing a page made the first thing a
 * creator saw a chart of other people's videos.
 *
 * The drivers move here too. They are DERIVED from these rows, and a
 * conclusion printed on a different page from its evidence asks to be taken on
 * trust.
 */
export default async function VideosPage() {
  const viewer = await getViewer();
  if (isSupabaseConfigured()) {
    if (!viewer.userId) redirect('/signin');
    if (!viewer.creatorId) redirect(viewer.organization ? '/dashboard/agency' : '/join');
  }

  const handle = viewer.creatorId ? await getCreatorYouTubeHandle(viewer.creatorId) : null;

  const mine = handle
    ? await analyseOwnChannel(handle)
        .then((s) => ({ ok: true as const, value: s.value, reason: null as string | null }))
        .catch((e: unknown) => {
          console.error('[videos] own channel failed', e);
          return {
            ok: false as const,
            reason: e instanceof YouTubeError ? e.reason : null,
            value: null as ChannelAnalysis | null,
          };
        })
    : { ok: false as const, reason: 'no_handle', value: null as ChannelAnalysis | null };

  const analysis = mine.ok ? mine.value : null;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 bg-paper">
        <div className="relative mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
          <p className="rail">Your channel</p>
          <h1 className="mt-2 text-[24px] font-semibold tracking-tight text-ink">Your videos</h1>
          <p className="mt-3 max-w-[64ch] text-[13px] leading-relaxed text-ink-muted">
            Every upload against your own median, newest first. Open one to read why it did what it
            did and what its own comment section said.
          </p>

          <div className="mt-6 space-y-4">
            {analysis && analysis.videos.length > 0 ? (
              <>
                <Panel
                  title="Every upload"
                  meta={`${analysis.videos.length} posts · median ${compactNumber(analysis.medianViews)} views`}
                >
                  <div className="flex flex-wrap gap-x-8 gap-y-3 border-b border-line px-5 py-3">
                    <Stat label="Median views" value={compactNumber(analysis.medianViews)} />
                    <Stat
                      label="Best ÷ median"
                      value={analysis.spread === null ? '—' : `${analysis.spread.toFixed(1)}×`}
                      hint={
                        analysis.spread !== null && analysis.spread > 5
                          ? 'a good post is a spike, not a floor'
                          : 'your posts land in a tight band'
                      }
                    />
                    {analysis.subscribers !== null ? (
                      <Stat label="Subscribers" value={compactNumber(analysis.subscribers)} />
                    ) : null}
                  </div>
                  <VideoList videos={analysis.videos} medianViews={analysis.medianViews} />
                </Panel>

                {/* The conclusion, under the evidence it is drawn from. */}
                <Panel
                  title="What moves views on your channel"
                  meta={`across the ${analysis.sampleSize} above`}
                >
                  <div className="px-5 py-4">
                    <DriverList drivers={analysis.drivers} />
                  </div>
                </Panel>
              </>
            ) : (
              <Panel
                title="Every upload"
                meta={
                  mine.ok && analysis?.videos.length === 0
                    ? 'no posts yet'
                    : mine.reason === 'no_handle'
                      ? 'not connected'
                      : 'unavailable'
                }
              >
                {/* Naming the failure matters: "unavailable" over a fictional
                    demo channel and "unavailable" over a spent quota are
                    different problems with different fixes. */}
                <p className="px-5 py-8 text-center text-[12px] leading-relaxed text-ink-muted">
                  {mine.reason === 'no_handle' ? (
                    <>
                      No channel connected.{' '}
                      <Link
                        href="/dashboard/settings"
                        className="text-indigo underline-offset-4 hover:underline"
                      >
                        Add one in Settings
                      </Link>{' '}
                      and this fills in.
                    </>
                  ) : mine.reason === 'quotaExceeded' ? (
                    'The daily YouTube quota is spent. It resets at midnight Pacific — nothing is wrong with your channel.'
                  ) : mine.ok ? (
                    'No public uploads yet. This page needs posts to compare against each other.'
                  ) : (
                    'Could not read your channel just now.'
                  )}
                </p>
              </Panel>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="rail">{label}</div>
      <div className="tnum mt-1 text-[20px] font-medium leading-none text-ink">{value}</div>
      {hint ? <p className="mt-1 text-[11px] text-ink-faint">{hint}</p> : null}
    </div>
  );
}
