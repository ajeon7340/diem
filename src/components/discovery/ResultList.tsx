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
 * The common results surface all three modes end in.
 *
 * SELECTION LIVES HERE and nowhere else, so "save these four" and "add these
 * two to a campaign" are one gesture over one list rather than four trips
 * through a card. The selected ids are posted as repeated `channelId` fields,
 * which is what a form does natively — no JSON body, no fetch, and the action
 * behaves identically with JavaScript switched off for a single row.
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
  const [saveState, save] = useFormState(saveCandidates, INITIAL_DISCOVERY);
  const [campaignState, addToCampaign] = useFormState(addCandidatesToCampaign, INITIAL_DISCOVERY);

  function toggle(channelId: string) {
    setSelected((current) =>
      current.includes(channelId) ? current.filter((id) => id !== channelId) : [...current, channelId],
    );
  }

  const message = saveState.message ?? campaignState.message;

  return (
    <div className="space-y-3">
      <div className="sticky top-16 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface/95 px-4 py-3 backdrop-blur">
        <label className="inline-flex items-center gap-2 text-[12px] text-ink">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={selected.length === candidates.length && candidates.length > 0}
            onChange={(event) =>
              setSelected(event.target.checked ? candidates.map((c) => c.channelId) : [])
            }
          />
          Select all
        </label>
        <span className="tnum text-[12px] text-ink-muted">
          {selected.length} of {candidates.length} selected
        </span>

        <form action={save} className="ml-auto">
          <input type="hidden" name="searchId" value={searchId} />
          {selected.map((id) => (
            <input key={id} type="hidden" name="channelId" value={id} />
          ))}
          <Action disabled={selected.length === 0}>Save to workspace</Action>
        </form>

        <form action={addToCampaign} className="flex items-center gap-2">
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
            className="min-h-9 rounded-lg border border-line bg-surface px-2 text-[12px]"
          >
            <option value="">Choose a campaign…</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
          <Action disabled={selected.length === 0 || campaigns.length === 0}>Add to campaign</Action>
        </form>
      </div>

      {message ? (
        <p role="status" className="rounded-xl border border-line bg-paper px-4 py-2 text-[12px] text-ink">
          {message}
        </p>
      ) : null}

      {candidates.map((candidate, index) => (
        <div key={candidate.channelId} className="flex items-start gap-3">
          <label className="mt-5 shrink-0">
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
                  className="inline-flex min-h-9 items-center rounded-lg border border-line-strong bg-surface px-3 text-[12px] font-medium text-ink hover:bg-paper"
                >
                  View analysis
                </button>
              </form>
              <span className="text-[11px] text-ink-faint">
                Saving costs nothing. Analysis reads the channel’s videos and comments.
              </span>
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
      className="inline-flex min-h-9 items-center rounded-lg bg-indigo px-3 text-[12px] font-medium text-white transition-colors hover:bg-indigo-hover disabled:bg-indigo/30"
    >
      {pending ? 'Working…' : children}
    </button>
  );
}
