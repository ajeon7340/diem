import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { cancelSearch } from '@/app/actions/discovery';
import { BrandList } from '@/components/discovery/BrandList';
import { EmptyState } from '@/components/discovery/EmptyState';
import { ContextBar } from '@/components/discovery/ContextBar';
import { FilterPanel } from '@/components/discovery/FilterPanel';
import { NarrowingProvider, PerformanceFilters } from '@/components/discovery/Narrowing';
import { DiscoverPanel } from '@/components/discovery/DiscoverPanel';
import { ModeForm } from '@/components/discovery/SearchForms';
import { WorkspaceLayout } from '@/components/shell/WorkspaceLayout';
import { Badge } from '@/components/ui/Badge';
import { getViewer } from '@/lib/access/viewer';
import { getCampaign, getCampaigns } from '@/lib/data/campaigns';
import { getBrands as getWorkspaceBrands, pickBrand } from '@/lib/data/brands';
import { buildContext } from '@/lib/discovery/context';
import { countRunsToday, getBrands, getCandidates, getSearch, getSearchJobs } from '@/lib/data/discovery';
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
import { SEARCH_CALLS_PER_DAY } from '@/lib/youtube/quota';

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

  const [candidates, competitorBrands, jobs, campaigns, workspaceBrands, campaign, runsUsed] = await Promise.all([
    getCandidates(search.id),
    search.mode === 'competitor' ? getBrands(search.id) : Promise.resolve([]),
    getSearchJobs([search.id]),
    viewer.organization ? getCampaigns(viewer.organization.id) : Promise.resolve([]),
    viewer.organization ? getWorkspaceBrands(viewer.organization.id) : Promise.resolve([]),
    search.campaignId ? getCampaign(search.campaignId) : Promise.resolve(null),
    viewer.organization ? countRunsToday(viewer.organization.id) : Promise.resolve(0),
  ]);

  // The context this search RAN under, not the one selected now — the panel
  // beside a stored result has to describe that result.
  const brand = pickBrand(
    workspaceBrands,
    search.brandId ?? campaign?.brandId ?? null,
    viewer.organization?.defaultBrandId ?? null,
  );
  const context = buildContext({ mode: search.mode, brand, campaign, searchParams: search.params });

  const searchJobs = jobs.get(search.id) ?? [];
  const job = searchJobs[0] ?? null;
  const state = searchState(searchJobs, candidates.length, search.collectedAt, search.emptyReason);
  const live = state === 'queued' || state === 'running';
  const stage = searchStage(job);

  return (
    <WorkspaceLayout
      width="wide"
      bare
      header={{
        eyebrow: 'Discovery',
        title: DISCOVERY_MODES[search.mode].label,
        meta: (
          <>
            <Badge
              tone={live ? 'indigo' : state === 'failed' ? 'rose' : state === 'partial' ? 'amber' : 'slate'}
            >
              {SEARCH_STATE_LABEL[state]}
            </Badge>
            <span className="tnum">
              {search.collectedAt
                ? `collected ${search.collectedAt.slice(0, 16).replace('T', ' ')} UTC`
                : `started ${search.createdAt.slice(0, 16).replace('T', ' ')} UTC`}
            </span>
            <Link href="/discover" className="text-indigo underline-offset-4 hover:underline">
              All searches
            </Link>
          </>
        ),
        primary: live ? (
          <form action={cancelSearch}>
            <input type="hidden" name="searchId" value={search.id} />
            <button
              type="submit"
              className="press inline-flex min-h-9 items-center rounded-[var(--r-md)] border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink hover:bg-paper"
            >
              Cancel search
            </button>
          </form>
        ) : undefined,
      }}
    >
      <main className="flex-1 px-4 py-5 sm:px-6">
        <div className="mx-auto w-full max-w-[1480px]">
          {/* The provider wraps BOTH columns: the performance filters render in
              the rail, the rows they hide are in the list beside it. */}
          <NarrowingProvider>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
            <FilterPanel
              mode={search.mode}
              campaignId={search.campaignId}
              brandId={context.brand?.id ?? null}
              modeExtra={
                <div className="space-y-3">
                  <ContextBar
                    context={context}
                    brands={workspaceBrands.map((b) => ({ id: b.id, name: b.name }))}
                    campaigns={campaigns.map((c) => ({ id: c.id, name: c.name, brandId: c.brandId }))}
                  />
                  <ModeForm
                    mode={search.mode}
                    campaignId={search.campaignId}
                    defaults={context.defaults}
                    context={context}
                  />
                </div>
              }
            />
            {candidates.length > 0 ? (
              <div className="lg:hidden">
                <PerformanceFilters />
              </div>
            ) : null}

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
                  Some requests didn’t complete. These are the creators the rest reached.
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
                  brands={competitorBrands}
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
                <DiscoverPanel
                  state={live ? 'running' : 'results'}
                  candidates={candidates}
                  runId={search.id}
                  searchId={search.id}
                  campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
                  runsUsed={runsUsed}
                  runsPerDay={SEARCH_CALLS_PER_DAY}
                  ranked={search.rankingEnabled}
                />
              ) : live ? (
                <div className="rounded-2xl border border-line bg-surface px-6 py-12 text-center">
                  <p className="text-[13px] text-ink-muted">
                    Searching. Results appear when it finishes.
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
                          note="Narrowed the search itself."
                          items={search.appliedFilters.api}
                        />
                        <FilterColumn
                          title="Applied afterwards"
                          note="Narrowed the results, not all of YouTube."
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

              {/* One paragraph, three facts. Stacked as three they read as three
                  warnings about the same thing and got skipped as a block. */}
              <footer className="border-t border-line pt-4">
                <p className="text-[11px] leading-relaxed text-ink-muted">
                  {DISCOVERY_NOT_A_RECOMMENDATION}{' '}
                  {search.mode === 'competitor' ? COLLABORATION_COVERAGE_DISCLAIMER : DISCOVERY_COVERAGE_DISCLAIMER}{' '}
                  {search.rankingEnabled ? DISCOVERY_DISCLOSURE : DISCOVERY_RANKING_WITHHELD}
                </p>
              </footer>
            </div>
          </div>
          </NarrowingProvider>
        </div>
      </main>
    </WorkspaceLayout>
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
