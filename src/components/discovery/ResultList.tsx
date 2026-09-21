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
import { SUBSCRIBER_BANDS, VIEW_BANDS, band, inBand, medianViews } from '@/lib/discovery/ranges';
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
   * Subscriber count and typical views are applied to rows that came back, not
   * to the index — `search.list` has no parameter for either. They used to sit
   * in the search form, where changing one meant spending another of the day's
   * hundred searches to re-narrow results already on the screen. Here they
   * narrow instantly and cost nothing.
   *
   * The filters that DO change the query — category, location, language — stay
   * in the form, because changing them genuinely means asking YouTube a
   * different question.
   */
  const [subs, setSubs] = useState('any');
  const [views, setViews] = useState('any');
  const [saveState, save] = useFormState(saveCandidates, INITIAL_DISCOVERY);
  const [campaignState, addToCampaign] = useFormState(addCandidatesToCampaign, INITIAL_DISCOVERY);

  const narrowed = useMemo(() => {
    const subBand = band(SUBSCRIBER_BANDS, subs);
    const viewBand = band(VIEW_BANDS, views);
    return candidates.filter((candidate) => {
      // Unmeasured is kept, never dropped: a hidden subscriber count is not a
      // small one, and a channel whose retrieved videos reported no views has
      // not failed the filter.
      const bySubs = inBand(candidate.subscribers, subBand);
      if (bySubs === false) return false;
      const byViews = inBand(medianViews(candidate.evidence.map((e) => e.views)), viewBand);
      return byViews !== false;
    });
  }, [candidates, subs, views]);

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
      <div className="sticky top-[4.5rem] z-10 rounded-xl border border-line bg-surface/95 px-3.5 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="text-[13px] font-semibold text-ink">
            {narrowed.length === candidates.length
              ? `${candidates.length} creator${candidates.length === 1 ? '' : 's'}`
              : `${narrowed.length} of ${candidates.length} creators`}
          </h2>
          <span className="text-[11px] text-ink-faint">
            {ranked ? 'ranked by adfit' : 'in the order YouTube returned'}
          </span>

          <label className="ml-auto flex items-center gap-1.5 text-[11px] text-ink-muted">
            <span className="sr-only sm:not-sr-only">Subscribers</span>
            <select
              value={subs}
              onChange={(event) => setSubs(event.target.value)}
              className="min-h-8 rounded-lg border border-line bg-surface px-2 text-[12px] text-ink"
              title="Narrows the results already on this page. No new search runs."
            >
              {SUBSCRIBER_BANDS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.id === 'any' ? 'Any size' : option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5 text-[11px] text-ink-muted">
            <span className="sr-only sm:not-sr-only">Views</span>
            <select
              value={views}
              onChange={(event) => setViews(event.target.value)}
              className="min-h-8 rounded-lg border border-line bg-surface px-2 text-[12px] text-ink"
              title="Median views of the videos this search retrieved. Narrows this page only."
            >
              {VIEW_BANDS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.id === 'any' ? 'Any views' : option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-[11px] text-ink-muted">
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
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={selected.length === candidates.length && candidates.length > 0}
              onChange={(event) => setSelected(event.target.checked ? candidates.map((c) => c.channelId) : [])}
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
