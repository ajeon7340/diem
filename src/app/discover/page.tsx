import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { SiteHeader } from '@/components/shell/SiteHeader';
import { ModeTabs } from '@/components/discovery/ModeTabs';
import { ModeForm } from '@/components/discovery/SearchForms';
import { getViewer } from '@/lib/access/viewer';
import { getCampaign, getCampaigns } from '@/lib/data/campaigns';
import { getSavedCandidates, getSearches, getSearchJobs } from '@/lib/data/discovery';
import { nextStep } from '@/lib/channel/state';
import { searchState, SEARCH_STATE_LABEL } from '@/lib/discovery/state';
import { DISCOVERY_MODES, type DiscoveryMode } from '@/lib/discovery/types';
import {
  DISCOVERY_COVERAGE_DISCLAIMER,
  DISCOVERY_NOT_A_RECOMMENDATION,
  DISCOVERY_RANKING,
} from '@/lib/report/policy';
import { removeSavedCandidate } from '@/app/actions/discovery';

export const metadata: Metadata = { title: 'Discover creators' };
export const dynamic = 'force-dynamic';

const MODES: DiscoveryMode[] = ['criteria', 'similar', 'competitor'];

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: { mode?: string; campaign?: string };
}) {
  const viewer = await getViewer();
  // Same journey the channel page uses, so a visitor who lands here from a link
  // is routed through sign-in and workspace naming rather than shown an empty
  // page they cannot act on.
  if (!viewer.organization) {
    redirect(nextStep({ signedIn: Boolean(viewer.userId), hasWorkspace: false }, undefined));
  }

  const mode = (MODES as string[]).includes(searchParams.mode ?? '')
    ? (searchParams.mode as DiscoveryMode)
    : 'criteria';

  const campaign = searchParams.campaign ? await getCampaign(searchParams.campaign) : null;
  const [searches, saved, campaigns] = await Promise.all([
    getSearches(viewer.organization.id),
    getSavedCandidates(viewer.organization.id),
    getCampaigns(viewer.organization.id),
  ]);
  const jobs = await getSearchJobs(searches.map((s) => s.id));

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 bg-paper">
        <div className="workspace-page">
          <p className="rail">Discover creators</p>
          <h1 className="page-title mt-2">Find creators to evaluate</h1>
          <p className="mt-3 max-w-[70ch] text-[13px] leading-relaxed text-ink-muted">
            Three ways in, all of them public. Nobody has to have signed up, approved you or connected an
            account. {DISCOVERY_COVERAGE_DISCLAIMER}
          </p>

          {campaign ? (
            <p className="mt-4 rounded-xl border border-indigo/25 bg-indigo-wash px-4 py-2.5 text-[12px] text-indigo">
              Searching for <strong className="font-semibold">{campaign.name}</strong>. Candidates you pick can be
              added straight to it, and the brief travels with the search.{' '}
              <Link href="/discover" className="underline underline-offset-4">
                Search without a campaign
              </Link>
            </p>
          ) : null}

          <div className="mt-8">
            <ModeTabs mode={mode} />
            <div className="surface-card mt-4 p-5 sm:p-6">
              <h2 className="text-[15px] font-semibold text-ink">{DISCOVERY_MODES[mode].label}</h2>
              <p className="mb-5 mt-1 text-[12px] text-ink-muted">{DISCOVERY_MODES[mode].blurb}</p>
              <ModeForm mode={mode} campaignId={campaign?.id ?? null} />
            </div>
          </div>

          <p className="mt-4 max-w-[70ch] text-[12px] leading-relaxed text-ink-muted">
            {DISCOVERY_NOT_A_RECOMMENDATION}
            {DISCOVERY_RANKING ? '' : ' Ranking is not enabled on this deployment, so results stay in the order YouTube returned them.'}
          </p>

          <section className="mt-12">
            <h2 className="text-[15px] font-semibold text-ink">Recent searches</h2>
            {searches.length === 0 ? (
              <p className="mt-2 text-[13px] text-ink-muted">
                Nothing yet. A search you run is kept here with what it reached, so you can read it again
                without spending the budget twice.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
                {searches.map((search) => {
                  const state = searchState(
                    jobs.get(search.id) ?? [],
                    // Counting rows here would mean a second query per search
                    // for a list view; the state function treats a committed
                    // run with no `empty_reason` as completed, which is what a
                    // row with candidates always is.
                    search.emptyReason === null ? 1 : 0,
                    search.collectedAt,
                    search.emptyReason,
                  );
                  return (
                    <li key={search.id}>
                      <Link href={`/discover/${search.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-paper">
                        <span className="text-[13px] font-medium text-ink">
                          {DISCOVERY_MODES[search.mode].label}
                        </span>
                        <span className="truncate text-[12px] text-ink-muted">{describe(search.params)}</span>
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

          <section className="mt-12">
            <h2 className="text-[15px] font-semibold text-ink">Saved candidates</h2>
            <p className="mt-1 max-w-[70ch] text-[12px] text-ink-muted">
              Saved without starting an analysis. Open one to read the channel, or add it to a campaign — either
              starts the public read.
            </p>
            {saved.length === 0 ? (
              <p className="mt-3 text-[13px] text-ink-muted">
                Nothing saved yet. Candidates you keep from a search appear here.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
                {saved.map((candidate) => (
                  <li key={candidate.channelId} className="flex flex-wrap items-start gap-3 px-4 py-3">
                    {candidate.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={candidate.avatar} alt="" width={36} height={36} className="h-9 w-9 rounded-full" />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <Link href={`/channels/${candidate.channelId}`} className="text-[13px] font-medium text-indigo underline-offset-4 hover:underline">
                        {candidate.title ?? candidate.channelId}
                      </Link>
                      {candidate.handle ? (
                        <span className="ml-2 text-[12px] text-ink-muted">{candidate.handle}</span>
                      ) : null}
                      {candidate.reason ? (
                        <p className="mt-1 max-w-[70ch] text-[12px] leading-relaxed text-ink-muted">{candidate.reason}</p>
                      ) : null}
                      <p className="tnum mt-1 text-[11px] text-ink-faint">
                        Saved {candidate.savedAt.slice(0, 10)}
                        {candidate.dataFetchedAt
                          ? ` · analysis read ${candidate.dataFetchedAt.slice(0, 10)}`
                          : ' · no analysis run yet'}
                      </p>
                    </div>
                    <form action={removeSavedCandidate}>
                      <input type="hidden" name="channelId" value={candidate.channelId} />
                      <button type="submit" className="min-h-9 rounded-lg px-2 text-[12px] text-ink-muted hover:text-rose">
                        Remove
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {campaigns.length === 0 ? (
            <p className="mt-10 text-[12px] text-ink-muted">
              No campaigns yet.{' '}
              <Link href="/campaigns/new" className="text-indigo underline-offset-4 hover:underline">
                Create one
              </Link>{' '}
              to compare candidates against a brief.
            </p>
          ) : null}
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
