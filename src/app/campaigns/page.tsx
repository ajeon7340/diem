import type { Metadata } from 'next';
import Link from 'next/link';

import { FilterLinks } from '@/components/shell/FilterLinks';
import { PanelSection, WorkspaceLayout } from '@/components/shell/WorkspaceLayout';
import { Badge } from '@/components/ui/Badge';
import { getViewer } from '@/lib/access/viewer';
import { getBrands } from '@/lib/data/brands';
import { getCampaignSummaries, type CampaignSummary } from '@/lib/data/campaigns';
import { isSupabaseConfigured } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Campaigns' };
export const dynamic = 'force-dynamic';

/**
 * The campaign list, filtered on facts the database actually holds.
 *
 * THERE IS NO STORED CAMPAIGN STATUS, so none is shown. "Active" and "draft"
 * would be a lifecycle derived from a timestamp, and a campaign nobody touched
 * this month is not a draft — it is a campaign nobody touched this month. What
 * is stored is how many candidates it holds, how many of those were marked for
 * outreach, which brand it is for and when it last changed, and those answer
 * the question an invented status was standing in for.
 */
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'shortlisted', label: 'Has priority outreach' },
  { id: 'candidates', label: 'Has candidates' },
  { id: 'empty', label: 'No candidates yet' },
] as const;

type Filter = (typeof FILTERS)[number]['id'];

function bucketOf(campaign: CampaignSummary): Filter[] {
  const buckets: Filter[] = ['all'];
  if (campaign.shortlistedCount > 0) buckets.push('shortlisted');
  if (campaign.candidateCount > 0) buckets.push('candidates');
  else buckets.push('empty');
  return buckets;
}

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: { state?: string; brand?: string };
}) {
  const viewer = await getViewer();
  const [campaigns, brands] = viewer.organization
    ? await Promise.all([
        getCampaignSummaries(viewer.organization.id),
        getBrands(viewer.organization.id),
      ])
    : [[] as CampaignSummary[], []];

  const agency = viewer.organization?.customerType === 'agency';
  const brandFilter = brands.some((b) => b.id === searchParams.brand) ? searchParams.brand! : null;
  const active: Filter = FILTERS.some((f) => f.id === searchParams.state)
    ? (searchParams.state as Filter)
    : 'all';

  const byBrand = brandFilter ? campaigns.filter((c) => c.brandId === brandFilter) : campaigns;
  const counts = FILTERS.map((filter) => ({
    id: filter.id,
    label: filter.label,
    count: byBrand.filter((campaign) => bucketOf(campaign).includes(filter.id)).length,
  }));
  const shown = byBrand.filter((campaign) => bucketOf(campaign).includes(active));
  const selectedBrand = brands.find((b) => b.id === brandFilter) ?? null;

  function href(next: { state?: string; brand?: string | null }) {
    const params = new URLSearchParams();
    const state = next.state ?? active;
    const brand = next.brand === undefined ? brandFilter : next.brand;
    if (state && state !== 'all') params.set('state', state);
    if (brand) params.set('brand', brand);
    return params.toString() ? `/campaigns?${params}` : '/campaigns';
  }

  return (
    <WorkspaceLayout
      width="wide"
      panelLabel="Filters"
      header={{
        // The page is named ONCE. It used to be named three times: a rail card
        // headed "Campaigns", a sentence under it, and an "All campaigns"
        // heading beside the table.
        title: selectedBrand ? selectedBrand.name : 'Campaigns',
        eyebrow: selectedBrand ? (agency ? 'Client' : 'Brand') : undefined,
        meta: (
          <>
            <span className="tnum">
              {shown.length} {shown.length === 1 ? 'campaign' : 'campaigns'}
            </span>
            {selectedBrand ? (
              <Link href={href({ brand: null })} className="text-indigo underline-offset-4 hover:underline">
                {agency ? 'All clients' : 'All brands'}
              </Link>
            ) : null}
          </>
        ),
        primary: (
          <Link
            href="/campaigns/new"
            className="press inline-flex min-h-9 items-center rounded-[var(--r-md)] bg-indigo px-3 text-[13px] font-medium text-white hover:bg-indigo-hover"
          >
            New campaign
          </Link>
        ),
      }}
      panel={
        <div className="space-y-4">
          {brands.length > 0 ? (
            <PanelSection title={agency ? 'Client brand' : 'Brand'}>
              <ul className="space-y-0.5">
                <li>
                  <Link
                    href={href({ brand: null })}
                    aria-current={brandFilter === null ? 'true' : undefined}
                    className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[13px] transition-colors ${
                      brandFilter === null
                        ? 'bg-indigo-wash font-medium text-indigo'
                        : 'text-ink-muted hover:bg-paper hover:text-ink'
                    }`}
                  >
                    {agency ? 'All clients' : 'All brands'}
                    <span className="tnum text-[11px]">{campaigns.length}</span>
                  </Link>
                </li>
                {brands.map((brand) => {
                  const count = campaigns.filter((c) => c.brandId === brand.id).length;
                  return (
                    <li key={brand.id}>
                      <Link
                        href={href({ brand: brand.id })}
                        aria-current={brandFilter === brand.id ? 'true' : undefined}
                        className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors ${
                          brandFilter === brand.id
                            ? 'bg-indigo-wash font-medium text-indigo'
                            : 'text-ink-muted hover:bg-paper hover:text-ink'
                        }`}
                      >
                        <span className="truncate">{brand.name}</span>
                        <span className="tnum shrink-0 text-[11px]">{count}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </PanelSection>
          ) : null}

          <PanelSection title="Filter">
            <FilterLinks
              options={counts}
              active={active}
              hrefFor={(id) => href({ state: id })}
              legend="Filter campaigns"
            />
            <p className="mt-3 text-[11px] text-ink-faint">Filters by what each campaign holds.</p>
          </PanelSection>
        </div>
      }
    >
      {!isSupabaseConfigured() ? (
        <p className="mb-3 rounded-[var(--r-md)] border border-amber/30 bg-amber-wash px-3 py-2 text-[12px] text-ink-muted">
          Campaigns can’t be saved yet. Ask whoever administers this workspace to finish setup.
        </p>
      ) : null}

      <div className="surface overflow-hidden">
        {shown.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-[13px] font-medium text-ink">
              {campaigns.length === 0 ? 'No campaigns yet' : 'Nothing matches this filter'}
            </p>
            <p className="mx-auto mt-2 max-w-[52ch] text-[12px] leading-relaxed text-ink-muted">
              {campaigns.length === 0
                ? 'A campaign holds one brief and the channels you’re weighing against it.'
                : 'Try another filter, or clear the brand selection.'}
            </p>
            <Link
              href={campaigns.length === 0 ? '/campaigns/new' : '/campaigns'}
              className="press mt-4 inline-flex min-h-9 items-center rounded-[var(--r-md)] bg-indigo px-3 text-[13px] font-medium text-white hover:bg-indigo-hover"
            >
              {campaigns.length === 0 ? 'Create a campaign' : 'Show all campaigns'}
            </Link>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table min-w-[760px]">
              <caption className="sr-only">Campaigns in this workspace</caption>
              <thead>
                <tr>
                  <th scope="col">Campaign</th>
                  <th scope="col">{agency ? 'Client' : 'Brand'}</th>
                  <th scope="col">Objective</th>
                  <th scope="col" className="w-40">Candidates</th>
                  <th scope="col" className="w-32">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((campaign) => (
                  <tr key={campaign.id}>
                    <td>
                      <Link
                        href={`/campaigns/${campaign.id}`}
                        className="font-medium text-ink hover:text-indigo"
                      >
                        {campaign.name}
                      </Link>
                      {campaign.product ? (
                        <p className="mt-0.5 line-clamp-1 max-w-[42ch] text-[11px] text-ink-muted">
                          {campaign.product}
                        </p>
                      ) : null}
                    </td>
                    <td className="text-[12px] text-ink-muted">
                      {campaign.brandName ?? campaign.brand ?? <span className="text-ink-faint">Not set</span>}
                      {campaign.brandName === null && campaign.brand ? (
                        <span className="ml-1.5 text-[10px] text-ink-faint">unlinked</span>
                      ) : null}
                    </td>
                    <td className="text-[12px] text-ink-muted">
                      {campaign.objective ?? <span className="text-ink-faint">Not stated</span>}
                    </td>
                    <td>
                      <span className="tnum text-[12px] text-ink">{campaign.candidateCount} of 5</span>
                      {campaign.shortlistedCount > 0 ? (
                        <Badge tone="emerald" className="ml-2">
                          {campaign.shortlistedCount} priority
                        </Badge>
                      ) : null}
                    </td>
                    <td className="tnum text-[12px] text-ink-muted">
                      {new Date(campaign.lastActivityAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </WorkspaceLayout>
  );
}
