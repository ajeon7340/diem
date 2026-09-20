import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CampaignForm } from '@/components/campaign/CampaignForm';
import { CampaignWorkspace } from '@/components/campaign/CampaignWorkspace';
import { CampaignExport } from '@/components/campaign/CampaignExport';
import { ContentIdeas } from '@/components/campaign/ContentIdeas';
import { ReferenceBox } from '@/components/campaign/ReferenceBox';
import { SavedReferences } from '@/components/campaign/SavedReferences';
import { LiveReport } from '@/components/channel/ReportActions';
import { WorkspaceLayout } from '@/components/shell/WorkspaceLayout';
import { getViewer } from '@/lib/access/viewer';
import { presentCandidate } from '@/lib/campaign/presentation';
import { publicReport } from '@/lib/channel/report';
import { getBrands } from '@/lib/data/brands';
import {
  getCampaign,
  getCandidates,
  getChannelJobs,
} from '@/lib/data/campaigns';
import { getReferences } from '@/lib/data/references';
import { AMENDMENT_ACCEPTED } from '@/lib/report/policy';
import { createSessionClient } from '@/lib/supabase/server';
import { CATEGORIES, REGIONS, fetchTrending } from '@/lib/youtube/trending';

export const metadata: Metadata = { title: 'Campaign' };
export const dynamic = 'force-dynamic';

export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { region?: string; category?: string; view?: string };
}) {
  const viewer = await getViewer();
  // RLS scopes the campaign, candidates, jobs and evidence to this session.
  const campaign = await getCampaign(params.id);
  if (!campaign) notFound();
  const [candidates, brands] = await Promise.all([
    getCandidates(campaign.id),
    viewer.organization
      ? getBrands(viewer.organization.id)
      : Promise.resolve([]),
  ]);
  const ids = candidates.map((candidate) => candidate.channelId);
  const [jobs, { data: publicRows }] = await Promise.all([
    getChannelJobs(ids),
    ids.length
      ? createSessionClient()
          .from('channel_analyses')
          .select('*')
          .in('channel_id', ids)
      : Promise.resolve({ data: [] }),
  ]);
  // The public projection enforces retention and approval before reaching clients.
  const reports = (publicRows ?? [])
    .map((row) => publicReport(row))
    .filter((report): report is NonNullable<typeof report> => Boolean(report));
  const views = candidates.map((candidate) =>
    presentCandidate(
      candidate,
      jobs.get(candidate.channelId) ?? [],
      reports.find((report) => report.channelId === candidate.channelId) ??
        null,
    ),
  );
  const planningActive =
    AMENDMENT_ACCEPTED &&
    (searchParams.view === 'planning' ||
      Boolean(searchParams.region || searchParams.category));
  const region = REGIONS.some((item) => item.code === searchParams.region)
    ? searchParams.region!
    : 'KR';
  const category = CATEGORIES.some((item) => item.id === searchParams.category)
    ? searchParams.category!
    : null;
  // Auxiliary planning work is requested only when the user opens Planning.
  const [references, trending] = await Promise.all([
    planningActive ? getReferences(campaign.id) : Promise.resolve([]),
    planningActive
      ? fetchTrending(region, category).catch((error: unknown) => {
          console.error('[campaign] trending failed', error);
          return null;
        })
      : Promise.resolve(null),
  ]);
  const referenceCandidates = candidates.map((candidate) => ({
    id: candidate.id,
    title:
      candidate.analysis?.title ?? candidate.submittedAs ?? candidate.channelId,
  }));
  const brandName =
    brands.find((brand) => brand.id === campaign.brandId)?.name ??
    campaign.brand;

  return (
    <WorkspaceLayout width="wide">
      <LiveReport
        active={views.some(
          (view) => view.state === 'queued' || view.state === 'running',
        )}
      />
      <CampaignWorkspace
        campaign={campaign}
        candidates={views}
        brandName={brandName}
        canEvaluate={AMENDMENT_ACCEPTED}
        planningActive={planningActive}
        briefEditor={
          <CampaignForm
            campaign={campaign}
            brands={brands.map(({ id, name, sells, customerNeeds }) => ({
              id,
              name,
              sells,
              customerNeeds,
            }))}
            customerType={viewer.organization?.customerType ?? null}
          />
        }
        planning={
          planningActive ? (
            <>
              <ReferenceBox
                campaignId={campaign.id}
                candidates={referenceCandidates}
              />
              <SavedReferences
                references={references}
                candidates={referenceCandidates}
              />
              <ContentIdeas
                data={trending}
                campaignId={campaign.id}
                readAt={new Date().toISOString()}
              />
            </>
          ) : undefined
        }
      />
      <CampaignExport
        campaign={campaign}
        candidates={views}
        brandName={brandName}
      />
    </WorkspaceLayout>
  );
}
