'use client';

import { useMemo, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import {
  addCandidatesToCampaign,
  analyseCandidate,
  saveCandidates,
} from '@/app/actions/discovery';
import { INITIAL_DISCOVERY } from '@/app/actions/state';
import { ResultCard } from './ResultCard';
import { useNarrowing } from './Narrowing';
import { inRange, medianViews, rangeIsSet } from '@/lib/discovery/ranges';
import type { DiscoveryCandidate } from '@/lib/discovery/types';

/**
 * The results column: what was found, what it was found under, and what to do
 * with it.
 *
 * SELECTION LIVES HERE and nowhere else, so "save these four" and "add these
 * two to a campaign" are one gesture over one list. Selected ids post as
 * repeated `channelId` fields, which is what a form does natively — no JSON
 * body, no fetch, and a single row still works with JavaScript off.
 *
 * ON SORTING. There is exactly one ordering the SEARCH produces — our ranking
 * where it is permitted, YouTube's own order where it is not — and that is the
 * default and says which it is. The only other option reorders the rows already
 * on this page by subscriber count. That is a real operation over data already
 * retrieved, and it is labelled as reordering THESE results rather than
 * offered as a way to search. No option here re-queries anything, and none
 * pretends to sort by something we did not measure: there is no "by engagement"
 * or "by best fit", because neither exists.
 */

type Order = 'search' | 'subscribers';

export function ResultList({
  searchId,
  candidates,
  ranked,
  campaigns,
  conditions,
}: {
  searchId: string;
  candidates: DiscoveryCandidate[];
  ranked: boolean;
  campaigns: { id: string; name: string }[];
  /** Applied conditions, shown as chips above the list. */
  conditions: { name: string; value: string }[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [order, setOrder] = useState<Order>('search');
  /**
   * LIVE, BECAUSE THESE NEVER TOUCHED THE SEARCH.
   *
   * Subscriber count and typical views are read off rows that came back, not
   * asked of the index — `search.list` has no parameter for either. The two
   * controls live in the filter rail, which is where somebody looks for them;
   * the state lives above both columns. See `Narrowing`.
   */
  const { subscribers, views } = useNarrowing();
  const [saveState, save] = useFormState(saveCandidates, INITIAL_DISCOVERY);
  const [campaignState, addToCampaign] = useFormState(addCandidatesToCampaign, INITIAL_DISCOVERY);

  // Unmeasured is kept, never dropped: a hidden subscriber count is not a small
  // one, and a channel whose retrieved videos reported no views has not failed
  // the filter. How many were kept that way is COUNTED and printed, so "12 of
  // 40" never quietly includes rows the filter could not actually judge.
  const { narrowed, unjudged } = useMemo(() => {
    const kept: DiscoveryCandidate[] = [];
    let unjudged = 0;
    for (const candidate of candidates) {
      const bySubs = inRange(candidate.subscribers, subscribers);
      if (bySubs === false) continue;
      const byViews = inRange(medianViews(candidate.evidence.map((e) => e.views)), views);
      if (byViews === false) continue;
      if (bySubs === null || byViews === null) unjudged += 1;
      kept.push(candidate);
    }
    return { narrowed: kept, unjudged };
  }, [candidates, subscribers, views]);

  const shown = useMemo(() => {
    if (order === 'search') return narrowed;
    return [...narrowed].sort((a, b) => (b.subscribers ?? -1) - (a.subscribers ?? -1));
  }, [narrowed, order]);

  function toggle(channelId: string) {
    setSelected((current) =>
      current.includes(channelId) ? current.filter((id) => id !== channelId) : [...current, channelId],
    );
  }

  const message = saveState.message ?? campaignState.message;

  return (
    <div className="space-y-3">
      <div className="surface sticky top-2 z-10 bg-surface/95 px-3.5 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="text-[13px] font-semibold text-ink">
            {narrowed.length === candidates.length
              ? `${candidates.length} creator${candidates.length === 1 ? '' : 's'}`
              : `${narrowed.length} of ${candidates.length} creators`}
          </h2>
          <span className="text-[11px] text-ink-faint">
            {ranked ? 'ranked by adfit' : 'in the order YouTube returned'}
          </span>
          {/* Said out loud rather than folded into the count: with a range set,
              these are rows the filter could not judge, kept because a hidden
              figure is not a failing one. */}
          {unjudged > 0 && (rangeIsSet(subscribers) || rangeIsSet(views)) ? (
            <span className="tnum text-[11px] text-ink-faint">
              {unjudged} with figures hidden, kept
            </span>
          ) : null}

          <label className="ml-auto flex items-center gap-2 text-[11px] text-ink-muted">
            <span className="sr-only sm:not-sr-only">Order</span>
            <select
              value={order}
              onChange={(event) => setOrder(event.target.value as Order)}
              className="min-h-8 rounded-lg border border-line bg-surface px-2 text-[12px] text-ink"
              title="Reorders the results already on this page. It does not run a new search."
            >
              <option value="search">{ranked ? 'Match strength' : 'Search order'}</option>
              <option value="subscribers">Subscribers, high to low</option>
            </select>
          </label>
        </div>

        {conditions.length ? (
          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {conditions.map((condition) => (
              <li
                key={`${condition.name}-${condition.value}`}
                className="rounded-md border border-line bg-paper px-2 py-1 text-[11px] text-ink-muted"
                title={condition.name}
              >
                <span className="text-ink-faint">{condition.name}:</span> {condition.value}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
          <label className="inline-flex items-center gap-2 text-[12px] text-ink">
            {/* Select all selects what is SHOWN. Selecting rows a filter has
                hidden, and then saving them, is how somebody ends up with a
                shortlist they never saw. */}
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={narrowed.length > 0 && selected.length === narrowed.length}
              onChange={(event) => setSelected(event.target.checked ? narrowed.map((c) => c.channelId) : [])}
            />
            Select all
          </label>
          <span className="tnum text-[11px] text-ink-faint">{selected.length} selected</span>

          <form action={save} className="ml-auto">
            <input type="hidden" name="searchId" value={searchId} />
            {selected.map((id) => (
              <input key={id} type="hidden" name="channelId" value={id} />
            ))}
            <Action disabled={selected.length === 0}>Save</Action>
          </form>

          <form action={addToCampaign} className="flex items-center gap-1.5">
            <input type="hidden" name="searchId" value={searchId} />
            {selected.map((id) => (
              <input key={id} type="hidden" name="channelId" value={id} />
            ))}
            <label className="sr-only" htmlFor="campaignId">
              Campaign
            </label>
            <select
              id="campaignId"
              name="campaignId"
              defaultValue=""
              className="min-h-8 max-w-[10rem] rounded-lg border border-line bg-surface px-2 text-[12px]"
            >
              <option value="">Campaign…</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
            <Action disabled={selected.length === 0 || campaigns.length === 0}>Add</Action>
          </form>
        </div>
      </div>

      {message ? (
        <p role="status" className="rounded-xl border border-line bg-surface px-4 py-2.5 text-[12px] text-ink">
          {message}
        </p>
      ) : null}

      {shown.map((candidate, index) => (
        <div key={candidate.channelId} className="flex items-start gap-2.5">
          <label className="mt-4 shrink-0">
            <span className="sr-only">Select {candidate.title}</span>
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={selected.includes(candidate.channelId)}
              onChange={() => toggle(candidate.channelId)}
            />
          </label>
          <div className="min-w-0 flex-1">
            <ResultCard
              candidate={candidate}
              position={index}
              ranked={ranked}
              selected={selected.includes(candidate.channelId)}
            >
              <form action={analyseCandidate}>
                <input type="hidden" name="channelId" value={candidate.channelId} />
                <button
                  type="submit"
                  className="inline-flex min-h-8 items-center rounded-lg border border-line-strong bg-surface px-2.5 text-[12px] font-medium text-ink hover:bg-paper"
                  title="Opens the channel's full report. Collection runs if there is none yet — saving a candidate does not."
                >
                  View analysis
                </button>
              </form>
            </ResultCard>
          </div>
        </div>
      ))}
    </div>
  );
}

function Action({ children, disabled }: { children: React.ReactNode; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex min-h-8 items-center rounded-lg bg-indigo px-2.5 text-[12px] font-medium text-white transition-colors hover:bg-indigo-hover disabled:bg-indigo/30"
    >
      {pending ? '…' : children}
    </button>
  );
}
