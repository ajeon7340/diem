'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { Search, X } from 'lucide-react';

import { cn } from '@/lib/cn';

const FIELD = cn(
  'h-9 w-full rounded-md border border-line bg-surface px-3 text-[12px] text-ink',
  'placeholder:text-ink-faint outline-none transition-colors',
  'focus:border-indigo focus:ring-2 focus:ring-indigo/20',
);

/**
 * Filters live in the URL, so a filtered directory is a shareable link and the
 * server does the querying. No client-side result state.
 */
export function DirectoryFilters({ niches }: { niches: string[] }) {
  const router = useRouter();
  const params = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      router.replace(`/directory?${next.toString()}`, { scroll: false });
    },
    [params, router],
  );

  const hasFilters = [
    'q',
    'niche',
    'minPurchaseIntent',
    'maxAdFatigue',
    'maxMinimumBudget',
    'maxCpm',
  ].some((key) => params.get(key));

  return (
    <div className="grid gap-3 border-b border-line px-5 py-4 sm:grid-cols-2 lg:grid-cols-5">
      <label className="relative lg:col-span-2">
        <span className="sr-only">Search creators</span>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint"
          aria-hidden
        />
        <input
          defaultValue={params.get('q') ?? ''}
          onChange={(event) => setParam('q', event.target.value)}
          placeholder="Search name or handle"
          className={cn(FIELD, 'pl-8')}
        />
      </label>

      <label>
        <span className="sr-only">Niche</span>
        <select
          value={params.get('niche') ?? ''}
          onChange={(event) => setParam('niche', event.target.value)}
          className={cn(FIELD, 'cursor-pointer')}
        >
          <option value="">All niches</option>
          {niches.map((niche) => (
            <option key={niche} value={niche}>
              {niche}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span className="sr-only">Minimum purchase intent</span>
        <select
          value={params.get('minPurchaseIntent') ?? ''}
          onChange={(event) => setParam('minPurchaseIntent', event.target.value)}
          className={cn(FIELD, 'tnum cursor-pointer')}
        >
          <option value="">Any purchase intent</option>
          <option value="0.1">≥ 10%</option>
          <option value="0.15">≥ 15%</option>
          <option value="0.2">≥ 20%</option>
          <option value="0.25">≥ 25%</option>
        </select>
      </label>

      <label>
        <span className="sr-only">Maximum ad fatigue</span>
        <select
          value={params.get('maxAdFatigue') ?? ''}
          onChange={(event) => setParam('maxAdFatigue', event.target.value)}
          className={cn(FIELD, 'cursor-pointer')}
        >
          <option value="">Any ad fatigue</option>
          <option value="low">Low only</option>
          <option value="moderate">Low or moderate</option>
        </select>
      </label>

      <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-5">
        <label className="flex-1">
          <span className="sr-only">Maximum minimum budget</span>
          <input
            defaultValue={params.get('maxMinimumBudget') ?? ''}
            onChange={(event) => setParam('maxMinimumBudget', event.target.value)}
            inputMode="numeric"
            placeholder="Budget ceiling (creator minimum at or below)"
            className={cn(FIELD, 'tnum')}
          />
        </label>

        <label className="flex-1">
          <span className="sr-only">Maximum estimated CPM</span>
          <input
            defaultValue={params.get('maxCpm') ?? ''}
            onChange={(event) => setParam('maxCpm', event.target.value)}
            inputMode="numeric"
            placeholder="Max estimated CPM"
            className={cn(FIELD, 'tnum')}
          />
        </label>

        <label className="w-[190px]">
          <span className="sr-only">Sort</span>
          <select
            value={params.get('sort') ?? 'purchase_intent'}
            onChange={(event) => setParam('sort', event.target.value)}
            className={cn(FIELD, 'cursor-pointer')}
          >
            <option value="purchase_intent">Sort: purchase intent</option>
            <option value="cpm">Sort: lowest CPM</option>
            <option value="followers">Sort: audience size</option>
            <option value="sentiment">Sort: sentiment</option>
            <option value="recent">Sort: recently analysed</option>
          </select>
        </label>

        {hasFilters ? (
          <button
            type="button"
            onClick={() => router.replace('/directory', { scroll: false })}
            className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[12px] text-ink-muted transition-colors hover:bg-paper hover:text-ink"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}
