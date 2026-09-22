import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ContextBar } from '@/components/discovery/ContextBar';
import { FilterPanel } from '@/components/discovery/FilterPanel';
import { ResultsArea, type SearchRow } from '@/components/discovery/ResultsArea';
import { ModeForm } from '@/components/discovery/SearchForms';
import { WorkspaceLayout } from '@/components/shell/WorkspaceLayout';
import { getViewer } from '@/lib/access/viewer';
import { getCampaign, getCampaigns } from '@/lib/data/campaigns';
import { getBrands, pickBrand } from '@/lib/data/brands';
import { buildContext } from '@/lib/discovery/context';
import { getSavedCandidates, getSearches, getSearchJobs } from '@/lib/data/discovery';
import { nextStep } from '@/lib/channel/state';
import { searchState, SEARCH_STATE_LABEL } from '@/lib/discovery/state';
import { type DiscoveryMode } from '@/lib/discovery/types';

export const metadata: Metadata = { title: 'Discover creators' };
export const dynamic = 'force-dynamic';

const MODES: DiscoveryMode[] = ['criteria', 'similar', 'competitor'];

/**
 * Discovery: filters in one column, what came back in the other.
 *
 * THREE COLUMNS ACROSS THE PAGE, and they are three different kinds of thing:
 * the nav rail says where you are in the product, this page's filter column
 * says what you are asking of the index, and the results area says what came
 * back. The first is the shell's; the other two are this grid.
 *
 * `minmax(0, 1fr)` ON THE RESULTS TRACK. `1fr` floors at the content's
 * min-content width, so a wide row pushes the track past the viewport and the
 * whole page scrolls sideways; `minmax(0, 1fr)` lets it shrink and keeps any
 * overflow inside whatever declared it.
 */
export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: { mode?: string; campaign?: string; brand?: string };
}) {
  const viewer = await getViewer();
  if (!viewer.organization) {
    redirect(nextStep({ signedIn: Boolean(viewer.userId), hasWorkspace: false }, undefined));
  }

  const mode = (MODES as string[]).includes(searchParams.mode ?? '')
    ? (searchParams.mode as DiscoveryMode)
    : 'criteria';

  const [campaign, brands, campaigns, searches, saved] = await Promise.all([
    searchParams.campaign ? getCampaign(searchParams.campaign) : Promise.resolve(null),
    getBrands(viewer.organization.id),
    getCampaigns(viewer.organization.id),
    getSearches(viewer.organization.id, 12),
    getSavedCandidates(viewer.organization.id),
  ]);

  // The brand a campaign belongs to wins over the one in the URL: a campaign
  // selected for client A cannot be read against client B's profile.
  const brand = pickBrand(
    brands,
    campaign?.brandId ?? searchParams.brand ?? null,
    viewer.organization.defaultBrandId,
  );
  const context = buildContext({ mode, brand, campaign });
  const jobs = await getSearchJobs(searches.map((s) => s.id));

  const rows: SearchRow[] = searches.map((search) => ({
    id: search.id,
    mode: search.mode,
    asked: describe(search.params),
    state: SEARCH_STATE_LABEL[
      searchState(
        jobs.get(search.id) ?? [],
        search.emptyReason === null ? 1 : 0,
        search.collectedAt,
        search.emptyReason,
      )
    ],
    at: search.createdAt.slice(0, 10),
  }));

  return (
    <WorkspaceLayout bare>
      <div className="flex h-full min-w-0 flex-col">
        {campaign ? (
          <p className="border-b border-line bg-indigo-wash px-4 py-2 text-[12px] text-indigo sm:px-5">
            Searching for <strong className="font-semibold">{campaign.name}</strong>.{' '}
            <Link href="/discover" className="underline underline-offset-4">Clear</Link>
          </p>
        ) : null}

        {/* THE FILTER TRACK IS `auto`, NOT A FIXED 320px, so minimising the
            panel actually returns the width to the results: a fixed track goes
            on reserving its space whatever the column inside it does. The
            content track stays `minmax(0, 1fr)` so a wide row can never push
            the page sideways.

            Rows are named at mobile too: with the panel collapsed to a button,
            an auto row would otherwise share the height with the results and
            leave a gap between the two. */}
        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[auto_minmax(0,1fr)] lg:grid-rows-1">
          <FilterPanel
            mode={mode}
            campaignId={campaign?.id ?? null}
            brandId={context.brand?.id ?? null}
            modeExtra={
              <div className="space-y-3">
                <ContextBar
                  context={context}
                  brands={brands.map((b) => ({ id: b.id, name: b.name }))}
                  campaigns={campaigns.map((c) => ({ id: c.id, name: c.name, brandId: c.brandId }))}
                />
                <ModeForm
                  mode={mode}
                  campaignId={campaign?.id ?? null}
                  defaults={context.defaults}
                  context={context}
                />
              </div>
            }
          />

          <ResultsArea searches={rows} saved={saved} campaignId={campaign?.id ?? null} />
        </div>
      </div>
    </WorkspaceLayout>
  );
}

/** A one-line description of what was asked, from the stored parameters. */
function describe(params: Record<string, unknown>): string {
  const keywords = params.keywords;
  if (Array.isArray(keywords) && keywords.length) return keywords.join(', ');
  const categories = params.categories;
  if (Array.isArray(categories) && categories.length) return categories.join(', ');
  if (typeof params.channel === 'string' && params.channel) return params.channel;
  const competitors = params.knownCompetitors;
  if (Array.isArray(competitors) && competitors.length) return competitors.join(', ');
  if (typeof params.product === 'string' && params.product) return params.product.slice(0, 80);
  return 'No terms recorded';
}
