'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Link2, TriangleAlert, Check } from 'lucide-react';

import { analyseReference, saveReference } from '@/app/actions/reference';
import { INITIAL_REFERENCE } from '@/app/actions/state';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { compactNumber, percent, shortDate } from '@/lib/format';
import { cn } from '@/lib/cn';

const FIELD =
  'w-full rounded-md border border-line bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-indigo/40 focus:outline-none focus:ring-2 focus:ring-indigo/20';

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      <Link2 className="h-3.5 w-3.5" aria-hidden />
      {pending ? pendingLabel : label}
    </Button>
  );
}

/**
 * Reference analysis — why a video did what it did, while planning a campaign.
 *
 * THE BASELINE IS THE ANSWER, and it is always that video's OWN channel. On the
 * first run against the Korean trending chart the number-one video sat at 0.30x
 * its own channel's median while another chart entry was at 25.7x: trending on
 * the platform and underperforming for the person who made it. Raw view counts
 * cannot tell those apart, and a buyer picking a format off a view count picks
 * the bigger channel rather than the better format.
 *
 * Deliberately absent: any comparison against the campaign's candidates. That
 * would combine API data across content owners, which III.E.2 forbids and
 * `withinOwner` throws on. The reads sit side by side; the buyer compares.
 */
export function ReferenceBox({
  campaignId,
  candidates,
}: {
  campaignId: string;
  candidates: Array<{ id: string; title: string }>;
}) {
  const [state, analyse] = useFormState(analyseReference, INITIAL_REFERENCE);
  const [saved, save] = useFormState(saveReference, INITIAL_REFERENCE);
  const r = saved.result ?? state.result;
  const channelId = saved.channelId ?? state.channelId;
  const isSaved = saved.saved;

  return (
    <Panel title="Reference analysis" meta="any public video · 4 quota units">
      <p className="border-b border-line px-5 py-3 text-[12px] leading-relaxed text-ink-muted">
        Paste a video you want this campaign to look like — a competitor&rsquo;s, a format you
        liked, anything public. It is read against that video&rsquo;s own channel, which is the
        only baseline that means anything.
      </p>

      <form action={analyse} className="flex flex-wrap items-center gap-2 px-5 py-3.5">
        <input
          name="url"
          type="text"
          inputMode="url"
          placeholder="https://www.youtube.com/watch?v=…"
          className={cn(FIELD, 'min-w-[240px] flex-1')}
        />
        <Submit label="Analyse" pendingLabel="Reading…" />
      </form>

      {state.status === 'error' || saved.status === 'error' ? (
        <p className="flex items-start gap-2 border-t border-line bg-amber-wash px-5 py-2.5 text-[12px] leading-relaxed text-ink-muted">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" aria-hidden />
          {state.status === 'error' ? state.message : saved.message}
        </p>
      ) : null}

      {r && channelId ? (
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
              <div className="tnum mt-1.5 text-[20px] font-medium leading-none text-ink">
                {compactNumber(r.views)}
              </div>
            </div>
            <div>
              <div className="rail">Against its own channel</div>
              <div
                className={cn(
                  'tnum mt-1.5 text-[20px] font-medium leading-none',
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
              <div className="tnum mt-1.5 text-[20px] font-medium leading-none text-ink">
                {percent(r.engagementRate, 2)}
              </div>
              <p className="mt-1.5 text-[11px] text-ink-faint">
                their median {percent(r.channelMedianEngagement, 2)}
              </p>
            </div>
          </div>

          {r.multiple !== null && r.multiple < 1 ? (
            <p className="mt-4 rounded-md bg-paper px-3 py-2 text-[12px] leading-relaxed text-ink-muted">
              This post is <strong className="font-medium text-ink">below</strong> what that channel
              normally does. A large view count on a large channel is evidence the channel is large,
              not that the format worked.
            </p>
          ) : null}

          {isSaved ? (
            <p className="mt-4 flex items-center gap-2 text-[12px] text-emerald">
              <Check className="h-3.5 w-3.5" aria-hidden />
              {saved.message}
            </p>
          ) : (
            <form action={save} className="mt-4 space-y-2 border-t border-line pt-3.5">
              <input type="hidden" name="campaignId" value={campaignId} />
              <input type="hidden" name="channelId" value={channelId} />
              <input type="hidden" name="analysis" value={JSON.stringify(r)} />
              <div className="flex flex-wrap items-center gap-2">
                <select name="candidateId" className={cn(FIELD, 'max-w-[220px]')} defaultValue="">
                  <option value="">Save to the campaign</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      Against {c.title}
                    </option>
                  ))}
                </select>
                <input
                  name="note"
                  type="text"
                  maxLength={2000}
                  placeholder="Why this one (optional)"
                  className={cn(FIELD, 'min-w-[180px] flex-1')}
                />
                <Submit label="Save" pendingLabel="Saving…" />
              </div>
              {/* The figures are frozen on save, and the panel says so, because
                  the channel median behind the multiple moves every time they
                  publish. A saved number is a measurement with a date. */}
              <p className="text-[11px] leading-relaxed text-ink-faint">
                Saved with today&rsquo;s reading. The channel&rsquo;s median moves as they publish,
                so the multiple is kept with the baseline it was measured against.
              </p>
            </form>
          )}
        </div>
      ) : null}
    </Panel>
  );
}
