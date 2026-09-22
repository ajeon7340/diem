'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import {
  addCandidatesToCampaign,
  analyseCandidate,
  saveCandidates,
} from '@/app/actions/discovery';
import { INITIAL_DISCOVERY } from '@/app/actions/state';
import { ResultCard } from './ResultCard';

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

export function ResultList({
  searchId,
  candidates,
  ranked,
  campaigns,
}: {
  searchId: string;
  candidates: DiscoveryCandidate[];
  ranked: boolean;
  campaigns: { id: string; name: string }[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  /**
   * LIVE, BECAUSE THESE NEVER TOUCHED THE SEARCH.
   *
   * Subscriber count and typical views are read off rows that came back, not
   * asked of the index — `search.list` has no parameter for either. The two
   * controls live in the filter rail, which is where somebody looks for them;
   * the state lives above both columns. See `Narrowing`.
   */

  const [saveState, save] = useFormState(saveCandidates, INITIAL_DISCOVERY);
  const [campaignState, addToCampaign] = useFormState(addCandidatesToCampaign, INITIAL_DISCOVERY);

  const narrowed = candidates;

  const shown = narrowed;

  function toggle(channelId: string) {
    setSelected((current) =>
      current.includes(channelId) ? current.filter((id) => id !== channelId) : [...current, channelId],
    );
  }

  const message = saveState.message ?? campaignState.message;

  return (
    <div className="space-y-3">
      <div className="surface sticky top-2 z-10 bg-surface/95 px-3.5 py-2.5 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
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
