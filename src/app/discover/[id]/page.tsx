import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { cancelSearch } from '@/app/actions/discovery';
import { BrandList } from '@/components/discovery/BrandList';
import { EmptyState } from '@/components/discovery/EmptyState';
import { ResultList } from '@/components/discovery/ResultList';
import { SiteHeader } from '@/components/shell/SiteHeader';
import { Badge } from '@/components/ui/Badge';
import { getViewer } from '@/lib/access/viewer';
import { getCampaigns } from '@/lib/data/campaigns';
import { getBrands, getCandidates, getSearch, getSearchJobs } from '@/lib/data/discovery';
import { describeJob } from '@/lib/ingest/jobs';
import { coverageSentence, searchStage, searchState, SEARCH_STATE_LABEL } from '@/lib/discovery/state';
import { DISCOVERY_MODES, SIMILARITY_DIMENSION_LABEL, SIMILARITY_LIMIT } from '@/lib/discovery/types';
import {
  COLLABORATION_COVERAGE_DISCLAIMER,
  COMPETITOR_SUGGESTIONS,
  DISCOVERY_COVERAGE_DISCLAIMER,
  DISCOVERY_DISCLOSURE,
  DISCOVERY_NOT_A_RECOMMENDATION,
  DISCOVERY_RANKING_WITHHELD,
} from '@/lib/report/policy';
import { aiConfigured } from '@/lib/ai/provider';

export const metadata: Metadata = { title: 'Discovery results' };
export const dynamic = 'force-dynamic';

export default async function DiscoveryResults({ params }: { params: { id: string } }) {
  const viewer = await getViewer();
  // RLS decides this. A search belonging to another organisation does not come
  // back, and 404 is the honest answer — "not allowed" would confirm the id.
  const search = await getSearch(params.id);
  if (!search) notFound();

  const [candidates, brands, jobs, campaigns] = await Promise.all([
    getCandidates(search.id),
    search.mode === 'competitor' ? getBrands(search.id) : Promise.resolve([]),
    getSearchJobs([search.id]),
    viewer.organization ? getCampaigns(viewer.organization.id) : Promise.resolve([]),
  ]);

  const searchJobs = jobs.get(search.id) ?? [];
  const job = searchJobs[0] ?? null;
  const state = searchState(searchJobs, candidates.length, search.collectedAt, search.emptyReason);
  const live = state === 'queued' || state === 'running';
  const stage = searchStage(job);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 bg-paper">
        <div className="workspace-page">
          <Link href="/discover" className="text-[12px] text-ink-muted underline-offset-4 hover:underline">
            ← All searches
          </Link>

          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="page-title">{DISCOVERY_MODES[search.mode].label}</h1>
              <p className="tnum mt-2 text-[12px] text-ink-faint">
                Started {search.createdAt.slice(0, 16).replace('T', ' ')} UTC
                {search.collectedAt
                  ? ` · collected ${search.collectedAt.slice(0, 16).replace('T', ' ')} UTC`
                  : ''}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge tone={live ? 'indigo' : state === 'failed' ? 'rose' : state === 'partial' ? 'amber' : 'slate'}>
                {SEARCH_STATE_LABEL[state]}
              </Badge>
              {live ? (
                <form action={cancelSearch}>
                  <input type="hidden" name="searchId" value={search.id} />
                  <button
                    type="submit"
                    className="min-h-9 rounded-lg border border-line-strong bg-surface px-3 text-[12px] font-medium text-ink hover:bg-paper"
                  >
                    Cancel
                  </button>
                </form>
              ) : null}
            </div>
          </div>

          {/* Observed events only. No percentage: this run does not know how
              many queries it will make until a bound bites, and a bar that
              fills to 60% and stops is a lie told confidently. */}
          {stage ? (
            <p className="mt-4 rounded-xl border border-line bg-surface px-4 py-2.5 text-[12px] text-ink">{stage}</p>
          ) : null}
          {!live && job ? (
            <p className="mt-4 text-[12px] text-ink-muted">{describeJob(job)}</p>
          ) : null}

          {search.mode === 'competitor' ? (
            <div className="mt-6">
              <BrandList
                searchId={search.id}
                brands={brands}
                suggestionsUnavailable={
                  !COMPETITOR_SUGGESTIONS
                    ? 'Automatic competitor suggestions are restricted until the derived-analysis approval is configured on this deployment. Entering competitors yourself works normally.'
                    : !aiConfigured()
                      ? 'No suggestion source is configured on this deployment, so competitors have to be entered by hand. Nothing else is consulted — adfit does not read competitors’ websites.'
                      : null
                }
              />
            </div>
          ) : null}

          {search.reference ? <ReferenceCard reference={search.reference} /> : null}

          {search.coverage || search.appliedFilters ? (
            <section className="surface-card mt-6 p-5">
              <h2 className="text-[15px] font-semibold text-ink">What this search did</h2>
              {search.coverage ? (
                <p className="tnum mt-2 text-[12px] leading-relaxed text-ink-muted">
                  {coverageSentence(search.coverage)}
                </p>
              ) : null}
              {search.coverage?.queries.length ? (
                <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
                  Queries sent: {search.coverage.queries.map((q) => `“${q}”`).join(', ')}
                </p>
              ) : null}

              {search.appliedFilters ? (
                <div className="mt-4 grid gap-5 sm:grid-cols-2">
                  <FilterColumn
                    title="Applied by YouTube"
                    note="Narrowed the whole index before anything came back."
                    items={search.appliedFilters.api}
                  />
                  <FilterColumn
                    title="Applied afterwards, by adfit"
                    note="Narrowed only the results this search retrieved — not all of YouTube."
                    items={search.appliedFilters.post}
                  />
                </div>
              ) : null}

              {search.notes.length ? (
                <ul className="mt-4 space-y-1">
                  {search.notes.map((note) => (
                    <li key={note} className="text-[12px] leading-relaxed text-ink-muted">
                      {note}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}

          <div className="mt-6">
            {candidates.length > 0 ? (
              <ResultList
                searchId={search.id}
                candidates={candidates}
                ranked={search.rankingEnabled}
                campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
              />
            ) : live ? (
              <div className="surface-card px-6 py-10 text-center">
                <p className="text-[13px] text-ink-muted">
                  The search is running. Results appear here when it commits — nothing partial is shown, because
                  a half-written result set describes no moment.
                </p>
              </div>
            ) : (
              <EmptyState
                reason={search.emptyReason ?? 'no_matches'}
                detail={search.notes[0] ?? null}
                action={{ href: `/discover?mode=${search.mode}`, label: 'Try another search' }}
              />
            )}
          </div>

          <footer className="mt-10 space-y-2 border-t border-line pt-5">
            <p className="text-[12px] leading-relaxed text-ink-muted">{DISCOVERY_NOT_A_RECOMMENDATION}</p>
            <p className="text-[12px] leading-relaxed text-ink-muted">
              {search.mode === 'competitor' ? COLLABORATION_COVERAGE_DISCLAIMER : DISCOVERY_COVERAGE_DISCLAIMER}
            </p>
            <p className="text-[12px] leading-relaxed text-ink-muted">
              {search.rankingEnabled ? DISCOVERY_DISCLOSURE : DISCOVERY_RANKING_WITHHELD}
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
}

function FilterColumn({
  title,
  note,
  items,
}: {
  title: string;
  note: string;
  items: { name: string; value: string }[];
}) {
  return (
    <div>
      <p className="rail">{title}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">{note}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-[12px] text-ink-muted">None.</p>
      ) : (
        <dl className="mt-2 space-y-1.5">
          {items.map((item) => (
            <div key={item.name}>
              <dt className="text-[11px] text-ink-faint">{item.name}</dt>
              <dd className="text-[12px] leading-relaxed text-ink">{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function ReferenceCard({
  reference,
}: {
  reference: NonNullable<Awaited<ReturnType<typeof getSearch>>>['reference'];
}) {
  if (!reference) return null;
  return (
    <section className="surface-card mt-6 p-5">
      <p className="rail">Reference channel</p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        {reference.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={reference.avatar} alt="" width={48} height={48} className="h-12 w-12 rounded-full" />
        ) : null}
        <div>
          <h2 className="text-[15px] font-semibold text-ink">{reference.title}</h2>
          <p className="tnum text-[12px] text-ink-muted">
            {reference.handle ? `${reference.handle} · ` : ''}
            {reference.subscribers === null
              ? 'Subscriber count hidden'
              : `${reference.subscribers.toLocaleString('en-US')} subscribers`}
            {' · '}profile built from {reference.sampleSize} recent upload
            {reference.sampleSize === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <p className="mt-3 text-[12px] text-ink-muted">
        Compared on:{' '}
        {reference.dimensions.map((d) => SIMILARITY_DIMENSION_LABEL[d]).join(', ')}
      </p>

      {reference.missingEvidence.length ? (
        <ul className="mt-2 space-y-1">
          {reference.missingEvidence.map((missing) => (
            <li key={missing.dimension} className="text-[12px] leading-relaxed text-amber">
              {SIMILARITY_DIMENSION_LABEL[missing.dimension]} not evaluated — {missing.why}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-3 max-w-[70ch] text-[12px] leading-relaxed text-ink-muted">{SIMILARITY_LIMIT}</p>
    </section>
  );
}
