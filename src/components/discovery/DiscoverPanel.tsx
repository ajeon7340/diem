'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, X } from 'lucide-react';

import { ChatComposer, type Turn } from './ChatComposer';
import { ResultList } from './ResultList';
import { ResultRows } from './ResultRows';
import { useFilterState } from './useFilterState';
import { chipsOf, loosest, type FilterState, type NarrowFilters } from '@/lib/discovery/filter-state';
import { isNarrowing, narrow } from '@/lib/discovery/narrow';
import type { DiscoveryCandidate } from '@/lib/discovery/types';
import { cn } from '@/lib/cn';

/**
 * The main panel, in four states.
 *
 *   idle                 no run yet — the composer fills the panel
 *   running              skeleton rows, because a spinner over an empty area
 *                        says "wait" and says nothing about what is coming
 *   results              the list, with the composer collapsed to a bar
 *   empty-after-narrow   rows exist but the narrow filters hid them all. NOT
 *                        the idle state: a customer who has 229 candidates and
 *                        a filter that hides them needs the count and a way
 *                        back, not an invitation to start over
 *
 * NARROWING NEVER FETCHES. `candidates` is whatever the last run returned and
 * it is never mutated or trimmed; `narrow()` reports which pass. That is what
 * keeps "142 shown · 87 hidden" true and what makes relaxing a filter instant.
 *
 * `useDeferredValue` ON THE NARROWED LIST so typing in a range field stays
 * responsive on a large candidate set: the input updates on every keystroke,
 * the list catches up. The COUNT animates; the rows do not, because reordering
 * animations on a list somebody is scanning make it harder to read, not easier.
 */

export type RunState = 'idle' | 'running' | 'results';

/**
 * Two orderings, and neither re-queries.
 *
 * The one the search produced — our ranking where it is permitted, YouTube's
 * own order where it is not — and a reorder by the one figure we hold for
 * every candidate. There is no "by engagement" and no "by best fit", because
 * neither exists.
 */
type Order = 'search' | 'subscribers';

export function DiscoverPanel({
  state,
  candidates,
  runId,
  runsUsed,
  runsPerDay,
  ranked,
  searchId = null,
  campaigns = [],
}: {
  state: RunState;
  /** The last run's candidates, in full. Never filtered before it gets here. */
  candidates: DiscoveryCandidate[];
  runId: string | null;
  runsUsed: number;
  runsPerDay: number;
  ranked: boolean;
  /** Present on a run's own page, where a candidate can be saved or added. */
  searchId?: string | null;
  campaigns?: { id: string; name: string }[];
}) {
  const { filters, query, apply, clear, undo, canUndo } = useFilterState();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [order, setOrder] = useState<Order>('search');
  const [runPrompt, setRunPrompt] = useState<string[] | null>(null);

  const outcome = useMemo(() => narrow(candidates, filters), [candidates, filters]);
  const ordered = useMemo(
    () =>
      order === 'search'
        ? outcome.shown
        // A hidden subscriber count sorts LAST rather than as zero: it is an
        // unanswered question, not a small number.
        : [...outcome.shown].sort((a, b) => (b.subscribers ?? -1) - (a.subscribers ?? -1)),
    [outcome.shown, order],
  );
  const shown = useDeferredValue(ordered);
  const chips = chipsOf(filters);
  const runsLeft = Math.max(runsPerDay - runsUsed, 0);

  function onPatch(patch: Partial<FilterState>) {
    const result = apply(patch);
    // A run key changed: the state moves, the search does NOT. Spending one of
    // the day's hundred is always a decision somebody makes on purpose.
    setRunPrompt(result.needsRun ? result.changed : null);
    return result;
  }

  const narrowed = isNarrowing(filters);
  const emptyAfterNarrow = state === 'results' && candidates.length > 0 && shown.length === 0;
  const worst = loosest(outcome.removedBy);

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* The header band: what is applied, what is shown, what a run costs. */}
      <div className="sticky top-0 z-10 min-h-[var(--header-h)] border-b border-line bg-paper/95 px-4 py-2 backdrop-blur sm:px-5">
        <div className="flex min-h-[calc(var(--header-h)-1rem)] flex-wrap items-center gap-x-3 gap-y-2">
          <p className="tnum text-[12px] text-ink-muted" aria-live="polite">
            {state === 'running' ? (
              'Searching…'
            ) : candidates.length === 0 ? (
              'No run yet'
            ) : (
              <>
                <span className="font-medium text-ink transition-[color] duration-150">{shown.length}</span> shown
                {outcome.hidden > 0 ? <span className="text-ink-faint"> · {outcome.hidden} hidden by filters</span> : null}
              </>
            )}
          </p>

          {chips.length ? (
            <ul className="flex min-w-0 flex-wrap items-center gap-1">
              {chips.map((chip) => (
                <li key={chip.key}>
                  <button
                    type="button"
                    onClick={() => {
                      clear(chip.key);
                      // Removing a RUN chip changes the question, so it asks
                      // before spending; removing a narrow one is instant.
                      setRunPrompt(chip.tier === 'run' ? [chip.key] : null);
                    }}
                    aria-label={`Clear filter: ${chip.label}`}
                    title={chip.tier === 'run' ? 'Changing this needs a new search' : 'Applies instantly'}
                    className={cn(
                      'press inline-flex min-h-7 items-center gap-1 rounded-full border px-2 text-[11px]',
                      chip.tier === 'run'
                        ? 'border-indigo/30 bg-indigo-wash text-indigo'
                        : 'border-line bg-surface text-ink hover:border-line-strong',
                    )}
                  >
                    {chip.label}
                    <X size={11} aria-hidden className="opacity-60" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {candidates.length > 0 ? (
            <label className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] text-ink-muted">
              <span className="sr-only sm:not-sr-only">Sort</span>
              <select
                value={order}
                onChange={(event) => setOrder(event.target.value as Order)}
                title="Reorders the results already on this page. It does not run a new search."
                className="min-h-7 rounded-[var(--r-md)] border border-line bg-surface px-1.5 text-[12px] text-ink"
              >
                <option value="search">{ranked ? 'Match strength' : 'Search order'}</option>
                <option value="subscribers">Subscribers, high to low</option>
              </select>
            </label>
          ) : null}

          {/* THE BUDGET IS SHOWN ONCE, HERE, and never moves when a narrow
              filter changes — that it costs nothing is the entire point. */}
          {state !== 'idle' ? (
            <p
              className="tnum shrink-0 text-[11px] text-ink-faint"
              title="Counted for this workspace. The hundred-a-day bound belongs to the API project and is shared across everything using it."
            >
              {runsLeft} of {runsPerDay} runs left today
            </p>
          ) : null}
        </div>

        {/* A run filter moved. Nothing has been searched; this asks. */}
        {runPrompt ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--r-md)] border border-indigo/25 bg-indigo-wash px-2.5 py-2">
            <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-indigo">
              {runPrompt.join(', ')} changed. These decide what YouTube is asked for, so the results
              below are still the previous search.
            </p>
            {runsLeft > 0 ? (
              <button
                type="submit"
                form="discovery-search"
                className="press inline-flex min-h-8 shrink-0 items-center rounded-[var(--r-md)] bg-indigo px-2.5 text-[12px] font-medium text-white hover:bg-indigo-hover"
              >
                Re-run search (uses 1 of {runsPerDay})
              </button>
            ) : (
              <p className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-amber">
                <AlertTriangle size={13} aria-hidden />
                No runs left today. The hundred-a-day bound resets at midnight Pacific.
              </p>
            )}
            <button
              type="button"
              onClick={() => setRunPrompt(null)}
              aria-label="Dismiss"
              className="press flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-indigo/70 hover:bg-indigo/10"
            >
              <X size={13} aria-hidden />
            </button>
          </div>
        ) : null}
      </div>

      <div className="min-w-0 flex-1 px-4 py-4 sm:px-5">
        {state === 'idle' ? (
          <div className="py-10 text-center">
            <h2 className="text-[20px] font-semibold tracking-tight text-ink">
              Describe who you are looking for
            </h2>
            <p className="mx-auto mt-1.5 max-w-[46ch] text-[13px] leading-relaxed text-ink-muted">
              It fills the filters on the left. Nothing is searched until you press Search.
            </p>
            <div className="mt-5">
              <ChatComposer
                variant="hero"
                query={query}
                onPatch={onPatch}
                onUndo={undo}
                canUndo={canUndo}
                turns={turns}
                onTurn={(turn) => setTurns((all) => [...all, turn])}
              />
            </div>
          </div>
        ) : state === 'running' ? (
          <ul className="space-y-2" aria-label="Searching">
            {Array.from({ length: 5 }, (_, i) => (
              <li key={i} className="surface flex items-center gap-3 px-3.5 py-3">
                <span className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-black/[0.06]" />
                <span className="min-w-0 flex-1 space-y-1.5">
                  <span className="block h-3 w-1/3 animate-pulse rounded bg-black/[0.06]" />
                  <span className="block h-2.5 w-2/3 animate-pulse rounded bg-black/[0.04]" />
                </span>
              </li>
            ))}
          </ul>
        ) : emptyAfterNarrow ? (
          <div className="py-10 text-center">
            <h2 className="tnum text-[17px] font-semibold tracking-tight text-ink">
              0 of {candidates.length} match your filters
            </h2>
            <p className="mx-auto mt-1.5 max-w-[46ch] text-[13px] leading-relaxed text-ink-muted">
              The search found {candidates.length}. Your narrowing hides all of them — none of it
              was lost, and relaxing a filter brings them straight back.
            </p>
            {worst ? (
              <button
                type="button"
                onClick={() => clear(worst as keyof FilterState)}
                className="press mt-4 inline-flex min-h-9 items-center rounded-[var(--r-md)] bg-indigo px-3 text-[13px] font-medium text-white hover:bg-indigo-hover"
              >
                Relax {LABEL[worst]} — it hides {outcome.removedBy[worst]}
              </button>
            ) : null}
          </div>
        ) : (
          <>
            {/* On a run's own page the rows carry selection, save and
                add-to-campaign; on any other surface they are read-only. The
                list is the NARROWED one either way, and nothing was dropped
                from the array to produce it. */}
            {searchId ? (
              <ResultList searchId={searchId} candidates={shown} ranked={ranked} campaigns={campaigns} />
            ) : (
              <ResultRows candidates={shown} ranked={ranked} runId={runId} />
            )}
            {outcome.unmeasured > 0 && narrowed ? (
              <p className="tnum mt-3 text-[11px] text-ink-faint">
                {outcome.unmeasured} kept with a figure the filter could not read. A hidden count is
                not a failing one.
              </p>
            ) : null}
          </>
        )}
      </div>

      {/* The composer, collapsed, still usable for refinement. */}
      {state === 'results' ? (
        <div className="sticky bottom-0 border-t border-line bg-paper/95 px-4 py-2.5 backdrop-blur sm:px-5">
          <ChatComposer
            variant="bar"
            query={query}
            onPatch={onPatch}
            onUndo={undo}
            canUndo={canUndo}
            turns={turns}
            onTurn={(turn) => setTurns((all) => [...all, turn])}
          />
        </div>
      ) : null}

      {runId ? (
        <p className="px-4 pb-3 text-[11px] text-ink-faint sm:px-5">
          <Link href={`/discover/${runId}`} className="text-indigo underline-offset-4 hover:underline">
            Open the full result page
          </Link>{' '}
          for coverage, applied conditions and saving.
        </p>
      ) : null}
    </div>
  );
}

const LABEL: Record<keyof NarrowFilters, string> = {
  subscriberMin: 'the subscriber range',
  subscriberMax: 'the subscriber range',
  avgViewsMin: 'the views range',
  avgViewsMax: 'the views range',
  lastUploadWithinDays: 'the last-upload window',
  excludedKeywords: 'the excluded keywords',
};
