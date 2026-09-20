import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { removeSavedCandidate } from '@/app/actions/discovery';
import { FilterPanel } from '@/components/discovery/FilterPanel';
import { ModeTabs } from '@/components/discovery/ModeTabs';
import { ModeForm } from '@/components/discovery/SearchForms';
import { StartGuide } from '@/components/discovery/StartGuide';
import { SiteHeader } from '@/components/shell/SiteHeader';
import { getViewer } from '@/lib/access/viewer';
import { getCampaign } from '@/lib/data/campaigns';
import { getSavedCandidates, getSearches, getSearchJobs } from '@/lib/data/discovery';
import { nextStep } from '@/lib/channel/state';
import { searchState, SEARCH_STATE_LABEL } from '@/lib/discovery/state';
import { DISCOVERY_MODES, type DiscoveryMode } from '@/lib/discovery/types';
import { DISCOVERY_COVERAGE_DISCLAIMER } from '@/lib/report/policy';

export const metadata: Metadata = { title: 'Discover creators' };
export const dynamic = 'force-dynamic';

const MODES: DiscoveryMode[] = ['criteria', 'similar', 'competitor'];

/**
 * Discovery before a search has run: the same two columns the results page
 * uses, with a start note where the creators will be.
 *
 * The heading is small and the introduction is one line. This is a workspace
 * somebody returns to, not a landing page — a 40px title and three paragraphs
 * of explanation push the first control below the fold every single visit.
 */
export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: { mode?: string; campaign?: string };
}) {
  const viewer = await getViewer();
  if (!viewer.organization) {
    redirect(nextStep({ signedIn: Boolean(viewer.userId), hasWorkspace: false }, undefined));
  }

  const mode = (MODES as string[]).includes(searchParams.mode ?? '')
    ? (searchParams.mode as DiscoveryMode)
    : 'criteria';

  const campaign = searchParams.campaign ? await getCampaign(searchParams.campaign) : null;
  const [searches, saved] = await Promise.all([
    getSearches(viewer.organization.id, 8),
    getSavedCandidates(viewer.organization.id),
  ]);
  const jobs = await getSearchJobs(searches.map((s) => s.id));

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 bg-paper">
        <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-ink">Discover creators</h1>
            <p className="text-[12px] text-ink-muted">
              Public YouTube data. No creator signs up. {DISCOVERY_COVERAGE_DISCLAIMER}
            </p>
          </div>

          {campaign ? (
            <p className="mb-4 rounded-lg border border-indigo/25 bg-indigo-wash px-3 py-2 text-[12px] text-indigo">
              Searching for <strong className="font-semibold">{campaign.name}</strong> — picks can be added
              straight to it.{' '}
              <Link href="/discover" className="underline underline-offset-4">
                Clear
              </Link>
            </p>
          ) : null}

          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
            <FilterPanel>
              <div className="shrink-0 border-b border-line p-3">
                <ModeTabs mode={mode} />
                <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">{DISCOVERY_MODES[mode].blurb}</p>
              </div>
              <ModeForm mode={mode} campaignId={campaign?.id ?? null} />
            </FilterPanel>

            <div className="min-w-0 flex-1 space-y-6">
              <StartGuide mode={mode} />

              <section>
                <h2 className="rail">Recent searches</h2>
                {searches.length === 0 ? (
                  <p className="mt-2 text-[12px] text-ink-muted">
                    A search you run is kept here with what it reached, so you can read it again without
                    spending the budget twice.
                  </p>
                ) : (
                  <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
                    {searches.map((search) => {
                      const state = searchState(
                        jobs.get(search.id) ?? [],
                        search.emptyReason === null ? 1 : 0,
                        search.collectedAt,
                        search.emptyReason,
                      );
                      return (
                        <li key={search.id}>
                          <Link
                            href={`/discover/${search.id}`}
                            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5 hover:bg-paper"
                          >
                            <span className="text-[13px] font-medium text-ink">
                              {DISCOVERY_MODES[search.mode].label}
                            </span>
                            <span className="min-w-0 truncate text-[12px] text-ink-muted">
                              {describe(search.params)}
                            </span>
                            <span className="tnum ml-auto shrink-0 text-[11px] text-ink-faint">
                              {SEARCH_STATE_LABEL[state]} · {search.createdAt.slice(0, 10)}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section>
                <h2 className="rail">Saved candidates</h2>
                {saved.length === 0 ? (
                  <p className="mt-2 text-[12px] text-ink-muted">
                    Saving costs nothing and starts no analysis. Candidates you keep from a search appear here.
                  </p>
                ) : (
                  <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
                    {saved.map((candidate) => (
                      <li key={candidate.channelId} className="flex flex-wrap items-start gap-3 px-3.5 py-2.5">
                        {candidate.avatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={candidate.avatar} alt="" width={32} height={32} className="h-8 w-8 rounded-full" />
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/channels/${candidate.channelId}`}
                            className="text-[13px] font-medium text-indigo underline-offset-4 hover:underline"
                          >
                            {candidate.title ?? candidate.channelId}
                          </Link>
                          {candidate.handle ? (
                            <span className="ml-2 text-[12px] text-ink-muted">{candidate.handle}</span>
                          ) : null}
                          {candidate.reason ? (
                            <p className="mt-0.5 line-clamp-1 text-[12px] text-ink-muted">{candidate.reason}</p>
                          ) : null}
                          <p className="tnum mt-0.5 text-[11px] text-ink-faint">
                            Saved {candidate.savedAt.slice(0, 10)}
                            {candidate.dataFetchedAt
                              ? ` · analysis read ${candidate.dataFetchedAt.slice(0, 10)}`
                              : ' · no analysis run yet'}
                          </p>
                        </div>
                        <form action={removeSavedCandidate}>
                          <input type="hidden" name="channelId" value={candidate.channelId} />
                          <button type="submit" className="min-h-8 rounded-lg px-2 text-[12px] text-ink-muted hover:text-rose">
                            Remove
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/** A one-line description of what was asked, from the stored parameters. */
function describe(params: Record<string, unknown>): string {
  const keywords = params.keywords;
  if (Array.isArray(keywords) && keywords.length) return keywords.join(', ');
  if (typeof params.channel === 'string' && params.channel) return params.channel;
  const competitors = params.knownCompetitors;
  if (Array.isArray(competitors) && competitors.length) return competitors.join(', ');
  if (typeof params.product === 'string' && params.product) return params.product.slice(0, 80);
  return 'No terms recorded';
}
