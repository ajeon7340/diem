'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { LoaderCircle } from 'lucide-react';

import { explainOwnVideo, type ExplainState } from '@/app/actions/studio';
import { INITIAL_EXPLAIN } from '@/app/actions/state';
import type { ChannelVideo } from '@/lib/youtube/explain';
import { compactNumber, percent, shortDate } from '@/lib/format';
import { cn } from '@/lib/cn';

const fmt = (s: number) =>
  s >= 3600
    ? `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`
    : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}`;

/**
 * The creator's own uploads, each against their own median.
 *
 * The Studio panel showed the CONCLUSION — "shorter videos raise views 1.4x" —
 * and a best and worst three. That answers "what works on this channel" and
 * not "which of my videos worked", which is the question somebody opens their
 * own analytics with. The drivers are derived from these rows; showing the
 * finding without the evidence asks the creator to take it on trust.
 *
 * Reading one costs API units and two model calls, so it is on request. The
 * list itself is free — it comes from the same fetch the drivers already made.
 */
export function VideoList({
  videos,
  medianViews,
}: {
  videos: ChannelVideo[];
  medianViews: number;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [state, formAction] = useFormState(explainOwnVideo, INITIAL_EXPLAIN);

  if (videos.length === 0) return null;

  return (
    <ul className="divide-y divide-line">
      {videos.map((v) => {
        const open = openId === v.id;
        const read = state.status === 'ok' && state.result?.videoId === v.id ? state : null;

        return (
          <li key={v.id}>
            <button
              type="button"
              onClick={() => setOpenId(open ? null : v.id)}
              className={cn(
                'flex w-full items-start gap-3 px-5 py-3 text-left transition-colors',
                open ? 'bg-indigo-wash' : 'hover:bg-paper',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] leading-snug text-ink">{v.title}</span>
                <span className="tnum mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-faint">
                  <span>{shortDate(v.publishedAt)}</span>
                  <span aria-hidden>·</span>
                  <span>{fmt(v.durationSec)}</span>
                  <span aria-hidden>·</span>
                  <span>{compactNumber(v.views)} views</span>
                  <span aria-hidden>·</span>
                  <span>{percent(v.engagementRate, 2)} engaged</span>
                  {v.paidPlacement ? (
                    <>
                      <span aria-hidden>·</span>
                      <span className="text-amber">paid placement</span>
                    </>
                  ) : null}
                </span>
              </span>

              {/* Against their own median, which is the only comparison that
                  means anything here — a big number on a big channel is a fact
                  about the channel. */}
              <span
                className={cn(
                  'tnum shrink-0 text-[13px] font-medium',
                  v.multiple === null
                    ? 'text-ink-faint'
                    : v.multiple >= 1.5
                      ? 'text-emerald'
                      : v.multiple < 0.8
                        ? 'text-rose'
                        : 'text-ink',
                )}
              >
                {v.multiple === null ? '—' : `${v.multiple.toFixed(2)}×`}
              </span>
            </button>

            {open ? (
              <div className="border-t border-line bg-paper px-5 py-3">
                {read ? (
                  <Read state={read} />
                ) : (
                  <form action={formAction}>
                    <input type="hidden" name="videoId" value={v.id} />
                    <p className="text-[11px] leading-relaxed text-ink-muted">
                      Reads this video against the {compactNumber(medianViews)}-view median of your
                      recent uploads, and classifies <strong className="text-ink">this
                      video&rsquo;s own comments</strong> — not the channel&rsquo;s.
                    </p>
                    <ReadButton />
                    {state.status === 'error' && state.message ? (
                      <p className="mt-2 text-[11px] text-amber">{state.message}</p>
                    ) : null}
                  </form>
                )}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function ReadButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        'mt-2 inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5',
        'text-[12px] font-medium text-ink transition-colors hover:bg-paper disabled:opacity-50',
      )}
    >
      {pending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
      {pending ? 'Reading the video and its comments' : 'Read this video'}
    </button>
  );
}

function Read({ state }: { state: ExplainState }) {
  const r = state.result;
  const c = state.comments;
  if (!r) return null;

  return (
    <div className="space-y-3">
      {state.summary ? (
        <div>
          <p className="text-[13px] font-medium leading-snug text-ink">{state.summary.headline}</p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{state.summary.verdict}</p>
          <p className="tnum mt-1 text-[10px] text-ink-faint">
            Written by {state.summaryModel ?? 'a model'} from the figures · not a measurement
          </p>
        </div>
      ) : null}

      {/* THIS VIDEO'S comments, and the count says so. A per-video panel
          showing the channel's clusters would print shares of a denominator
          nobody on this row measured. */}
      {c === null ? (
        <p className="text-[11px] text-ink-faint">
          The comment pass did not run on this video.
        </p>
      ) : !c.readable ? (
        <p className="text-[11px] text-ink-faint">
          Comments are off or restricted on this video — which is not the same as nobody
          commenting.
        </p>
      ) : c.scanned === 0 ? (
        <p className="text-[11px] text-ink-faint">No comments on this video yet.</p>
      ) : (
        <div>
          <p className="rail">
            This video&rsquo;s comments · {compactNumber(c.scanned)} read
            {c.sentiment !== null ? ` · sentiment ${c.sentiment.toFixed(0)}/100` : ''}
          </p>
          <ul className="mt-1.5 space-y-1">
            {c.clusters.slice(0, 6).map((cluster) => (
              <li key={cluster.id} className="flex items-baseline gap-2 text-[12px]">
                <span className="tnum w-10 shrink-0 text-right text-ink-faint">
                  {Math.round(cluster.share * 100)}%
                </span>
                <span className="min-w-0 flex-1 truncate text-ink-muted">{cluster.label}</span>
                <span className="tnum shrink-0 text-[11px] text-ink-faint">
                  {compactNumber(cluster.commentCount)}
                </span>
              </li>
            ))}
          </ul>
          {c.clusters[0]?.comments[0]?.text ? (
            <p className="mt-2 border-l-2 border-line pl-2 text-[11px] leading-relaxed text-ink-muted">
              &ldquo;{c.clusters[0].comments[0].text.slice(0, 180)}&rdquo;
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
