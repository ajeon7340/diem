import type { Metadata } from 'next';
import Link from 'next/link';
import { Lock, Sparkles } from 'lucide-react';

import { getDirectory } from '@/lib/data/directory';
import { directoryFiltersSchema, firstParam } from '@/lib/schemas';
import type { DirectoryFilters } from '@/types';
import { SiteHeader } from '@/components/shell/SiteHeader';
import { DirectoryFilters as FilterRail } from '@/components/directory/DirectoryFilters';
import { DirectoryTable } from '@/components/directory/DirectoryTable';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'Creator directory',
  description: 'Search verified creators by purchase intent, ad fatigue, and audience match.',
};

/** Entitlement-dependent and filter-dependent: never cache. */
export const dynamic = 'force-dynamic';

export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const parsed = directoryFiltersSchema.safeParse({
    q: firstParam(searchParams.q),
    niche: firstParam(searchParams.niche),
    minPurchaseIntent: firstParam(searchParams.minPurchaseIntent),
    maxAdFatigue: firstParam(searchParams.maxAdFatigue),
    maxMinimumBudget: firstParam(searchParams.maxMinimumBudget),
    maxCpm: firstParam(searchParams.maxCpm),
    sort: firstParam(searchParams.sort),
  });

  const filters: DirectoryFilters = parsed.success ? parsed.data : {};
  const { listings, niches, entitled } = await getDirectory(filters);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="relative flex-1">
        <div className="grid-rule pointer-events-none absolute inset-x-0 top-0 h-48" aria-hidden />

        <div className="relative mx-auto w-full max-w-shell px-5 py-12 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="rail">Track B · Agency</p>
              <h1 className="mt-2 text-[24px] font-semibold tracking-tight text-ink">
                Creator directory
              </h1>
              <p className="mt-2 max-w-[64ch] text-[13px] leading-relaxed text-ink-muted">
                Creators who opted in to agency discovery. Their reports open immediately — no
                per-creator approval, no waiting on an inbox. Everyone here chose to be found.
              </p>
            </div>
            {entitled ? (
              <span className="tnum text-[12px] text-ink-faint">
                {listings.length} {listings.length === 1 ? 'creator' : 'creators'}
              </span>
            ) : null}
          </div>

          <div className="mt-8">
            {entitled ? (
              <Panel title="Directory" meta={filters.sort ?? 'purchase_intent'}>
                <FilterRail niches={niches} />
                {listings.length > 0 ? (
                  <DirectoryTable listings={listings} />
                ) : (
                  <p className="px-5 py-16 text-center text-[13px] text-ink-muted">
                    No creators match these filters.
                  </p>
                )}
              </Panel>
            ) : (
              <UpgradeWall />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

/**
 * Shown when `directory_listings` comes back empty because the viewer has no
 * Pro plan. The wall is the explanation, not the enforcement — RLS already
 * returned nothing before this rendered.
 */
function UpgradeWall() {
  return (
    <Panel title="Pro Agency" meta="LOCKED">
      <div className="flex flex-col items-center gap-5 px-6 py-16 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-paper">
          <Lock className="h-4 w-4 text-ink-faint" aria-hidden />
        </span>

        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-ink">
            Find creators instead of looking them up
          </h2>
          <p className="mx-auto mt-2 max-w-[54ch] text-[13px] leading-relaxed text-ink-muted">
            You already have everything you need to evaluate a creator you know. The directory is
            for the other problem — shortlisting from creators you haven&apos;t met, filtered by
            what their audience actually does, without waiting on individual approvals.
          </p>
        </div>

        <ul className="grid gap-2 text-left text-[12px] text-ink-muted sm:grid-cols-3">
          {[
            'Filter by purchase intent, ad fatigue, demographics, and CPM ceiling',
            'Read opted-in creators instantly — no approval wait',
            'Brief up to 100 creators from one composer',
          ].map((feature) => (
            <li key={feature} className="flex items-start gap-2 rounded-panel border border-line bg-paper px-3 py-2.5">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo" aria-hidden />
              {feature}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/pricing">
            <Button size="lg">Upgrade to Pro Agency</Button>
          </Link>
          <p className="text-[12px] text-ink-faint">
            Or open any creator link directly — 1:1 proposals are free, forever.
          </p>
        </div>
      </div>
    </Panel>
  );
}
