'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { LoaderCircle, Play } from 'lucide-react';

import { explainTrendingVideo } from '@/app/actions/trending';
import { INITIAL_TRENDING_EXPLAIN } from '@/app/actions/state';
import type { TrendingVideo } from '@/lib/youtube/trending';
import { compactNumber, shortDate } from '@/lib/format';
import { cn } from '@/lib/cn';

const fmt = (s: number) =>
  s >= 3600
    ? `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`
    : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}`;

/**
 * The chart, playable here.
 *
 * Every row used to be an `<a target="_blank">` to youtube.com. A creator
 * researching what the region is watching left for YouTube on the first click
 * and had no reason to come back — the one page in this product that works
 * before any advertiser exists was a list of exit links.
 *
 * The player is `youtube-nocookie.com`, which is YouTube's own no-tracking
 * embed domain: the video still plays, the view still counts for the creator
 * who made it, and the reader is not handed a tracking cookie for browsing a
 * chart.
 *
 * THE SUMMARY IS ON REQUEST, not on select. It costs a model call, and a
 * creator clicking down a list of twelve to find one worth watching would pay
 * for twelve summaries to read one. Selecting plays; asking explains.
 */
export function TrendingPlayer({
  videos,
  niche,
  region,
  category,
}: {
  videos: TrendingVideo[];
  niche: string | null;
  /** Which chart these rows came from, so the summary can compare against it. */
  region: string;
  category: string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(videos[0]?.id ?? null);
  const [state, formAction] = useFormState(explainTrendingVideo, INITIAL_TRENDING_EXPLAIN);

  if (videos.length === 0) return null;
  const current = videos.find((v) => v.id === selectedId) ?? videos[0];
  // Only for the video it was asked about. Selecting a different row must not
  // show the previous row's summary under this one's title.
  const summary = state.videoId === current.id ? state : null;

  return (
    <div className="grid gap-px bg-line lg:grid-cols-[1fr_minmax(0,22rem)]">
      {/* The list. Buttons, not links: selecting is a change on this page. */}
      <ol className="divide-y divide-line bg-surface">
        {videos.map((v, i) => (
          <li key={v.id}>
            <button
              type="button"
              onClick={() => setSelectedId(v.id)}
              aria-current={v.id === current.id}
              className={cn(
                'flex w-full items-start gap-3 px-5 py-3 text-left transition-colors',
                v.id === current.id ? 'bg-indigo-wash' : 'hover:bg-paper',
              )}
            >
              <span className="tnum w-5 shrink-0 pt-0.5 text-[12px] text-ink-faint">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] leading-snug text-ink">{v.title}</span>
                <span className="tnum mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-faint">
                  <span className="text-ink-muted">{v.channelTitle}</span>
                  <span aria-hidden>·</span>
                  <span>{compactNumber(v.views)} views</span>
                  <span aria-hidden>·</span>
                  <span>{fmt(v.durationSec)}</span>
                  <span aria-hidden>·</span>
                  <span>{shortDate(v.publishedAt)}</span>
                </span>
              </span>
              {v.id === current.id ? (
                <Play className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo" aria-hidden />
              ) : null}
            </button>
          </li>
        ))}
      </ol>

      <div className="bg-surface">
        <div className="aspect-video w-full bg-ink/5">
          <iframe
            key={current.id}
            src={`https://www.youtube-nocookie.com/embed/${current.id}`}
            title={current.title}
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="h-full w-full"
          />
        </div>

        <div className="px-4 py-3">
          <p className="text-[13px] font-medium leading-snug text-ink">{current.title}</p>
          <p className="tnum mt-1 text-[11px] text-ink-faint">
            {current.channelTitle} · {compactNumber(current.views)} views ·{' '}
            {compactNumber(current.likes)} likes
          </p>

          {summary?.status === 'ok' && summary.summary ? (
            <dl className="mt-3 space-y-2.5">
              <div>
                <dt className="rail">What it is</dt>
                <dd className="mt-1 text-[12px] leading-relaxed text-ink-muted">
                  {summary.summary.what}
                </dd>
              </div>
              <div>
                <dt className="rail">Why it may be climbing</dt>
                <dd className="mt-1 text-[12px] leading-relaxed text-ink-muted">
                  {summary.summary.whyClimbing}
                </dd>
                {/* The measured figure it rests on, quoted. A mechanism with
                    nothing under it is a story. */}
                <dd className="tnum mt-1 text-[11px] leading-relaxed text-ink-faint">
                  {summary.summary.evidence}
                </dd>
              </div>
              {summary.summary.audience ? (
                <div>
                  <dt className="rail">What the comments react to</dt>
                  <dd className="mt-1 text-[12px] leading-relaxed text-ink-muted">
                    {summary.summary.audience}
                  </dd>
                </div>
              ) : null}
              {/* Absent rather than padded. "Nothing here transfers" is a
                  useful answer and a paragraph of reaching is not. */}
              {summary.summary.forYou ? (
                <div>
                  <dt className="rail text-indigo">For your channel</dt>
                  <dd className="mt-1 text-[12px] leading-relaxed text-ink-muted">
                    {summary.summary.forYou}
                  </dd>
                </div>
              ) : (
                <p className="text-[11px] leading-relaxed text-ink-faint">
                  Nothing here transfers to {niche ?? 'your niche'} — said rather than stretched.
                </p>
              )}
            </dl>
          ) : summary?.status === 'error' ? (
            <p className="mt-3 text-[11px] leading-relaxed text-amber">{summary.message}</p>
          ) : (
            <form action={formAction} className="mt-3">
              <input type="hidden" name="videoId" value={current.id} />
              <input type="hidden" name="niche" value={niche ?? ''} />
              <input type="hidden" name="region" value={region} />
              <input type="hidden" name="category" value={category ?? ''} />
              <AskButton />
            </form>
          )}

          {/* Said once, on the panel that shows the figures. A chart position
              is a fact about YouTube's ranker and about the channel's size —
              it is not a performance read, and nothing here has that channel's
              own baseline to make one. */}
          <p className="mt-3 border-t border-line pt-2.5 text-[11px] leading-relaxed text-ink-faint">
            A high count here reflects the channel&rsquo;s size as much as the video. Paste any
            video above to read it against its own channel instead.
          </p>
        </div>
      </div>
    </div>
  );
}


function AskButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5',
        'text-[12px] font-medium text-ink transition-colors hover:bg-paper disabled:opacity-50',
      )}
    >
      {pending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
      {pending ? 'Reading it' : 'Why is this trending?'}
    </button>
  );
}
