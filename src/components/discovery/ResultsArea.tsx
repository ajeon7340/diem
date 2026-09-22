'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, X } from 'lucide-react';

import { chipsOf, clearChip, readFilters, writeFilters, EMPTY_FILTERS } from '@/lib/discovery/filters';
import { DISCOVERY_MODES, type DiscoveryMode } from '@/lib/discovery/types';
import { CAMPAIGN_CATEGORIES, CATEGORY_LABEL } from '@/types';
import { cn } from '@/lib/cn';

/**
 * What is applied, and what came back.
 *
 * THE CHIPS ARE THE POINT. A customer scrolling a list of results should not
 * have to look back at the filter column to remember what produced it, and a
 * condition set three sections down is otherwise invisible. Every chip clears
 * its own condition; a range clears both ends, because "10K–100K subscribers"
 * is one thought.
 *
 * THE URL IS THE STATE, here as in the panel, so these two cannot disagree
 * about what is applied. Clearing a chip is a `router.replace`, the same call
 * the panel makes.
 *
 * THE EMPTY STATE RUNS A SEARCH. A dashed box saying "Search by criteria" told
 * somebody what the page was called, not what to do on it. Four categories,
 * each one press away from a result.
 */

type Sort = 'recent' | 'oldest';

export interface SearchRow {
  id: string;
  mode: DiscoveryMode;
  asked: string;
  state: string;
  at: string;
}

export function ResultsArea({
  searches,
  saved,
  campaignId,
}: {
  searches: SearchRow[];
  saved: { channelId: string; title: string | null; handle: string | null; savedAt: string; avatar: string | null }[];
  campaignId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = readFilters(new URLSearchParams(params.toString()));
  const chips = chipsOf(filters);
  const [sort, setSort] = useState<Sort>('recent');

  const rows = [...searches].sort((a, b) =>
    sort === 'recent' ? b.at.localeCompare(a.at) : a.at.localeCompare(b.at),
  );

  function replace(next: URLSearchParams) {
    router.replace(`${pathname}?${next}`, { scroll: false });
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* Sticky, so what is applied travels with the list. */}
      {/* Same `--header-h` band as the rail's logo row and the filter tabs, so
          the three columns share one horizontal line. It grows only when the
          chips wrap, which is content, not chrome. */}
      <div className="sticky top-0 z-10 min-h-[var(--header-h)] border-b border-line bg-paper/95 px-4 py-2 backdrop-blur sm:px-5">
        <div className="flex min-h-[calc(var(--header-h)-1rem)] flex-wrap items-center gap-x-3 gap-y-2">
          <p className="tnum text-[12px] text-ink-muted">
            {rows.length} {rows.length === 1 ? 'search' : 'searches'}
          </p>
          {chips.length ? (
            <ul className="flex min-w-0 flex-wrap items-center gap-1">
              {chips.map((chip) => (
                <li key={chip.key}>
                  <button
                    type="button"
                    onClick={() =>
                      replace(writeFilters(clearChip(filters, chip.key), new URLSearchParams(params.toString())))
                    }
                    aria-label={`Clear filter: ${chip.label}`}
                    className="press inline-flex min-h-7 items-center gap-1 rounded-full border border-line bg-surface px-2 text-[11px] text-ink hover:border-line-strong"
                  >
                    {chip.label}
                    <X size={11} aria-hidden className="text-ink-faint" />
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() =>
                    replace(writeFilters(EMPTY_FILTERS, new URLSearchParams(params.toString())))
                  }
                  className="press min-h-7 px-1.5 text-[11px] text-indigo hover:underline"
                >
                  Clear all
                </button>
              </li>
            </ul>
          ) : (
            <p className="text-[11px] text-ink-faint">No filters applied</p>
          )}

          <label className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] text-ink-muted">
            <span className="sr-only sm:not-sr-only">Sort</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as Sort)}
              className="min-h-7 rounded-[var(--r-md)] border border-line bg-surface px-1.5 text-[12px] text-ink"
            >
              <option value="recent">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
        </div>
      </div>

      <div className="min-w-0 flex-1 px-4 py-4 sm:px-5">
        {rows.length === 0 ? (
          <div className="py-10 text-center">
            <h2 className="text-[17px] font-semibold tracking-tight text-ink">Start with a category</h2>
            <p className="mx-auto mt-1.5 max-w-[44ch] text-[13px] leading-relaxed text-ink-muted">
              Each one runs a search straight away. Narrow it from the filters afterwards.
            </p>
            <ul className="mx-auto mt-5 flex max-w-[460px] flex-wrap justify-center gap-2">
              {(['technology', 'beauty', 'gaming', 'food_beverage'] as const).map((id) => (
                <li key={id}>
                  <button
                    type="submit"
                    form="discovery-search"
                    name="categories"
                    value={id}
                    className="press inline-flex min-h-10 items-center rounded-[var(--r-md)] border border-line bg-surface px-3 text-[13px] font-medium text-ink hover:border-indigo hover:text-indigo"
                  >
                    {CATEGORY_LABEL[id]}
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[11px] text-ink-faint">
              Each search spends one of the day’s hundred. Changing a filter spends nothing.
            </p>
          </div>
        ) : (
          <ul className="min-w-0 space-y-2">
            {rows.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/discover/${row.id}`}
                  className="press surface group flex min-w-0 items-center gap-3 px-3.5 py-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">{row.asked}</span>
                    <span className="tnum mt-0.5 block text-[11px] text-ink-faint">
                      {DISCOVERY_MODES[row.mode].label} · {row.state} · {row.at}
                    </span>
                  </span>
                  <ArrowRight
                    size={15}
                    aria-hidden
                    className="shrink-0 text-ink-faint transition-transform duration-150 group-hover:translate-x-0.5"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}

        {saved.length ? (
          <section className="mt-6">
            <h2 className="rail">Saved candidates</h2>
            <ul className="surface mt-2 min-w-0 divide-y divide-line overflow-hidden">
              {saved.map((candidate) => (
                <li key={candidate.channelId} className="flex min-w-0 items-center gap-3 px-3.5 py-2.5">
                  {candidate.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={candidate.avatar} alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-full" />
                  ) : null}
                  <Link
                    href={`/channels/${candidate.channelId}`}
                    className="min-w-0 flex-1 truncate text-[13px] text-indigo underline-offset-4 hover:underline"
                  >
                    {candidate.title ?? candidate.channelId}
                    {candidate.handle ? (
                      <span className="ml-1.5 text-ink-muted">{candidate.handle}</span>
                    ) : null}
                  </Link>
                  <span className="tnum shrink-0 text-[11px] text-ink-faint">{candidate.savedAt.slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {campaignId ? (
          <p className={cn('mt-5 text-[11px] text-ink-faint')}>
            Results from this page are added to the selected campaign.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export { CAMPAIGN_CATEGORIES };
