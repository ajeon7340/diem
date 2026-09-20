import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { cancelSearch } from '@/app/actions/discovery';
import { BrandList } from '@/components/discovery/BrandList';
import { EmptyState } from '@/components/discovery/EmptyState';
import { FilterPanel } from '@/components/discovery/FilterPanel';
import { ModeTabs } from '@/components/discovery/ModeTabs';
import { ResultList } from '@/components/discovery/ResultList';
import { ModeForm } from '@/components/discovery/SearchForms';
import { SiteHeader } from '@/components/shell/SiteHeader';
import { Badge } from '@/components/ui/Badge';
import { getViewer } from '@/lib/access/viewer';
import { getCampaigns } from '@/lib/data/campaigns';
import { getBrands, getCandidates, getSearch, getSearchJobs } from '@/lib/data/discovery';
import { describeJob } from '@/lib/ingest/jobs';
import { filterDefaults, filterSummary } from '@/lib/discovery/defaults';
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

/**
 * One search: the same two columns, with the filters that produced it still
 * filled in on the left and the creators on the right.
 *
 * The panel is refilled deliberately (`filterDefaults`). Narrowing a search you
 * are looking at is the commonest next action, and a blank form beside a result
 * set means retyping what you just typed.
 */
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

  // Both halves, chipped together above the list: a reader comparing two runs
  // needs to see what was asked, and the split between what YouTube narrowed
  // and what we narrowed afterwards is kept in the detail panel below.
  const conditions = [...(search.appliedFilters?.api ?? []), ...(search.appliedFilters?.post ?? [])].map(
    (condition) => ({ ...condition, value: condition.value.slice(0, 80) }),
  );

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 bg-paper">
        <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <Link href="/discover" className="text-[12px] text-ink-muted underline-offset-4 hover:underline">
              ← All searches
            </Link>
            <h1 className="text-xl font-semibold tracking-tight text-ink">
              {DISCOVERY_MODES[search.mode].label}
            </h1>
            <Badge
              tone={live ? 'indigo' : state === 'failed' ? 'rose' : state === 'partial' ? 'amber' : 'slate'}
            >
              {SEARCH_STATE_LABEL[state]}
            </Badge>
            <span className="tnum text-[11px] text-ink-faint">
              {search.collectedAt
                ? `collected ${search.collectedAt.slice(0, 16).replace('T', ' ')} UTC`
                : `started ${search.createdAt.slice(0, 16).replace('T', ' ')} UTC`}
            </span>
            {live ? (
              <form action={cancelSearch} className="ml-auto">
                <input type="hidden" name="searchId" value={search.id} />
                <button
                  type="submit"
                  className="min-h-8 rounded-lg border border-line-strong bg-surface px-2.5 text-[12px] font-medium text-ink hover:bg-paper"
                >
                  Cancel
                </button>
              </form>
            ) : null}
          </div>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
            <FilterPanel summary={filterSummary(search.mode, search.params)}>
              <div className="shrink-0 border-b border-line p-3">
                <ModeTabs mode={search.mode} />
                <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
                  Showing the filters this search ran with. Change them and search again.
                </p>
              </div>
              <ModeForm
                mode={search.mode}
                campaignId={search.campaignId}
                defaults={filterDefaults(search.mode, search.params)}
              />
            </FilterPanel>

            <div className="min-w-0 flex-1 space-y-4">
              {/* Observed events only. No percentage: a run does not know how
                  many queries it will make until a bound bites, and a bar that
                  fills to 60% and stops is a lie told confidently. */}
              {stage ? (
                <p className="rounded-xl border border-line bg-surface px-4 py-2.5 text-[12px] text-ink">{stage}</p>
              ) : null}
              {/* FOUR DIFFERENT THINGS, four different sentences. Searching,
                  nothing found, some requests failed but results came back, and
                  the search could not run at all are distinct events, and a
                  single "something went wrong" over all of them is what makes a
                  reader treat an outage as a finding about their market. The
                  coverage knows which it was, so it speaks in place of the
                  job's generic line whenever it can be more specific. */}
              {!live && search.coverage?.stoppedBecause === 'api_error' && candidates.length > 0 ? (
                <p className="rounded-xl border border-amber/30 bg-amber-wash px-4 py-2.5 text-[12px] leading-relaxed text-ink">
                  Some requests to YouTube did not complete. These are the creators the requests that
                  succeeded reached — not a smaller field.
                </p>
              ) : !live && job && !(job.status === 'partial' && search.coverage) ? (
                <p className="text-[12px] text-ink-muted">{describeJob(job)}</p>
              ) : !live && job?.status === 'partial' && search.coverage ? (
                <p className="rounded-xl border border-line bg-surface px-4 py-2.5 text-[12px] leading-relaxed text-ink-muted">
                  {coverageSentence(search.coverage)}
                </p>
              ) : null}

              {search.mode === 'competitor' ? (
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
              ) : null}

              {search.reference ? <ReferenceCard reference={search.reference} /> : null}

              {candidates.length > 0 ? (
                <ResultList
                  searchId={search.id}
                  candidates={candidates}
                  ranked={search.rankingEnabled}
                  campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
                  conditions={conditions}
                />
              ) : live ? (
                <div className="rounded-2xl border border-line bg-surface px-6 py-12 text-center">
                  <p className="text-[13px] text-ink-muted">
                    Searching. Results appear when the run commits — nothing partial is shown, because a
                    half-written result set describes no moment.
                  </p>
                </div>
              ) : (
                <EmptyState
                  reason={search.emptyReason ?? 'no_matches'}
                  detail={search.notes[0] ?? null}
                  action={{ href: `/discover?mode=${search.mode}`, label: 'Start another search' }}
                />
              )}

              {search.coverage || search.appliedFilters ? (
                <details className="rounded-xl border border-line bg-surface">
                  <summary className="cursor-pointer px-4 py-3 text-[12px] font-medium text-ink">
                    What this search did
                  </summary>
                  <div className="space-y-4 border-t border-line px-4 py-3.5">
                    {search.coverage ? (
                      <p className="tnum text-[12px] leading-relaxed text-ink-muted">
                        {coverageSentence(search.coverage)}
                      </p>
                    ) : null}
                    {search.coverage?.queries.length ? (
                      <p className="text-[12px] leading-relaxed text-ink-muted">
                        Queries sent: {search.coverage.queries.map((q) => `“${q}”`).join(', ')}
                      </p>
                    ) : null}

                    {search.appliedFilters ? (
                      <div className="grid gap-5 sm:grid-cols-2">
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
                      <ul className="space-y-1">
                        {search.notes.map((note) => (
                          <li key={note} className="text-[12px] leading-relaxed text-ink-muted">
                            {note}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </details>
              ) : null}

              <footer className="space-y-1.5 border-t border-line pt-4">
                <p className="text-[11px] leading-relaxed text-ink-muted">{DISCOVERY_NOT_A_RECOMMENDATION}</p>
                <p className="text-[11px] leading-relaxed text-ink-muted">
                  {search.mode === 'competitor' ? COLLABORATION_COVERAGE_DISCLAIMER : DISCOVERY_COVERAGE_DISCLAIMER}
                </p>
                <p className="text-[11px] leading-relaxed text-ink-muted">
                  {search.rankingEnabled ? DISCOVERY_DISCLOSURE : DISCOVERY_RANKING_WITHHELD}
                </p>
              </footer>
            </div>
          </div>
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
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        {reference.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={reference.avatar} alt="" width={40} height={40} className="h-10 w-10 rounded-full" />
        ) : null}
        <div className="min-w-0">
          <p className="rail">Reference channel</p>
          <h2 className="mt-0.5 text-[14px] font-semibold text-ink">{reference.title}</h2>
        </div>
        <p className="tnum ml-auto text-[11px] text-ink-faint">
          {reference.handle ? `${reference.handle} · ` : ''}
          {reference.subscribers === null
            ? 'subscribers hidden'
            : `${reference.subscribers.toLocaleString('en-US')} subs`}
          {' · '}
          {reference.sampleSize} upload{reference.sampleSize === 1 ? '' : 's'} sampled
        </p>
      </div>

      <p className="mt-2 text-[12px] text-ink-muted" title={SIMILARITY_LIMIT}>
        Compared on {reference.dimensions.map((d) => SIMILARITY_DIMENSION_LABEL[d]).join(', ')} — in what the
        channels publish, not in who watches.
      </p>

      {reference.missingEvidence.length ? (
        <ul className="mt-2 space-y-1">
          {reference.missingEvidence.map((missing) => (
            <li key={missing.dimension} className="text-[11px] leading-relaxed text-amber">
              {SIMILARITY_DIMENSION_LABEL[missing.dimension]} not evaluated — {missing.why}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
