'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Link2, TriangleAlert } from 'lucide-react';

import { INITIAL_EXPLAIN, explainPastedVideo } from '@/app/actions/studio';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { DriverList } from './DriverList';
import { compactNumber, exactNumber, percent, shortDate } from '@/lib/format';
import { cn } from '@/lib/cn';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      <Link2 className="h-3.5 w-3.5" aria-hidden />
      {pending ? 'Reading…' : 'Analyse'}
    </Button>
  );
}

/**
 * Paste a link, get a read on why that video did what it did.
 *
 * THE BASELINE IS THE ANSWER. A view count alone is not a result: the first
 * video this was run against was number one on the Korean trending chart and
 * sitting at 0.3× its own channel's median — trending on the platform,
 * underperforming for the person who made it. Every figure here is against
 * that channel's own catalogue, which is also what keeps it inside III.E.2.
 *
 * Deliberately absent: any comparison to the viewer's own channel. That would
 * combine API Data across two content owners, and the rule is enforced in code
 * rather than remembered — `withinOwner` throws.
 */
export function ExplainBox() {
  const [state, action] = useFormState(explainPastedVideo, INITIAL_EXPLAIN);
  const r = state.result;

  return (
    <Panel
      title="Why did that video do well?"
      meta="4 quota units per look"
    >
      <form action={action} className="flex flex-wrap items-center gap-2 px-5 py-4">
        <input
          name="url"
          type="text"
          inputMode="url"
          placeholder="Paste a YouTube link — watch, Shorts or youtu.be"
          className={cn(
            'min-w-[240px] flex-1 rounded-md border border-line bg-surface px-3 py-2 text-[13px] text-ink',
            'placeholder:text-ink-faint focus:border-indigo/40 focus:outline-none focus:ring-2 focus:ring-indigo/20',
          )}
        />
        <Submit />
      </form>

      {state.status === 'error' ? (
        <p className="flex items-start gap-2 border-t border-line bg-amber-wash px-5 py-2.5 text-[12px] leading-relaxed text-ink-muted">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" aria-hidden />
          {state.message}
        </p>
      ) : null}

      {r ? (
        <div className="border-t border-line px-5 py-4">
          <p className="text-[14px] font-medium leading-snug text-ink">{r.title}</p>
          <p className="mt-1 text-[12px] text-ink-muted">
            {r.channelTitle}
            {r.subscribers !== null ? ` · ${compactNumber(r.subscribers)} subscribers` : ''} ·{' '}
            {shortDate(r.publishedAt)}
          </p>

          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-4">
            <div>
              <div className="rail">Views</div>
              <div className="tnum mt-1.5 text-[22px] font-medium leading-none text-ink">
                {compactNumber(r.views)}
              </div>
            </div>
            <div>
              <div className="rail">Against its own channel</div>
              <div
                className={cn(
                  'tnum mt-1.5 text-[22px] font-medium leading-none',
                  r.multiple === null
                    ? 'text-ink-faint'
                    : r.multiple >= 1.5
                      ? 'text-emerald'
                      : r.multiple < 0.8
                        ? 'text-rose'
                        : 'text-ink',
                )}
              >
                {r.multiple === null ? '—' : `${r.multiple.toFixed(2)}×`}
              </div>
              <p className="mt-1.5 text-[11px] text-ink-faint">
                median {compactNumber(r.channelMedianViews)} over {r.sampleSize} posts
              </p>
            </div>
            <div>
              <div className="rail">Engagement</div>
              <div className="tnum mt-1.5 text-[22px] font-medium leading-none text-ink">
                {percent(r.engagementRate, 2)}
              </div>
              <p className="mt-1.5 text-[11px] text-ink-faint">
                their median {percent(r.channelMedianEngagement, 2)}
              </p>
            </div>
          </div>

          {/* The honest reading of a trending video that is below its own bar. */}
          {r.multiple !== null && r.multiple < 1 ? (
            <p className="mt-4 rounded-md bg-paper px-3 py-2 text-[12px] leading-relaxed text-ink-muted">
              This post is <strong className="font-medium text-ink">below</strong> what that channel
              normally does. A large view count on a large channel is not evidence a format worked —
              it is evidence the channel is large.
            </p>
          ) : null}

          <p className="rail mt-5 mb-2">What moves views on {r.channelTitle}</p>
          <DriverList drivers={r.drivers} />

          <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-ink-faint">
            Everything above is measured inside {r.channelTitle}&rsquo;s own catalogue
            ({exactNumber(r.sampleSize)} recent posts). It is deliberately not compared against your
            channel: YouTube&rsquo;s terms permit aggregating data within one channel owner and not
            across two, so the two reads sit side by side and you draw the comparison.
          </p>
        </div>
      ) : null}
    </Panel>
  );
}
