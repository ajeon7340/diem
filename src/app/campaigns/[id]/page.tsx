import { createSessionClient } from '@/lib/supabase/server';
import { publicReport } from '@/lib/channel/report';
import { ChannelReport } from '@/components/channel/ChannelReport';
import { CampaignForm } from '@/components/campaign/CampaignForm';
import { LiveReport, PrintReport } from '@/components/channel/ReportActions';
import { AMENDMENT_ACCEPTED } from '@/lib/report/policy';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CandidateCard } from '@/components/campaign/CandidateCard';
import { ContentIdeas } from '@/components/campaign/ContentIdeas';
import { ReferenceBox } from '@/components/campaign/ReferenceBox';
import { SavedReferences } from '@/components/campaign/SavedReferences';
import { CandidateForm } from '@/components/campaign/CandidateForm';
import { ComparisonTable } from '@/components/campaign/ComparisonTable';
import { SiteHeader } from '@/components/shell/SiteHeader';
import { Panel } from '@/components/ui/Panel';
import { getViewer } from '@/lib/access/viewer';
import { getCampaign, getCandidates, getChannelJobs } from '@/lib/data/campaigns';
import { getReferences } from '@/lib/data/references';
import { CATEGORIES, REGIONS, fetchTrending } from '@/lib/youtube/trending';
import { standard, toRow } from '@/lib/report/candidate-compare';

export const metadata: Metadata = { title: 'Campaign' };
export const dynamic = 'force-dynamic';

export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { region?: string; category?: string };
}) {
  // RLS decides this, not a check here: a campaign belonging to another
  // organisation simply does not come back, and 404 is the honest answer —
  // "not allowed" would confirm the id exists.
  // Needed only for the brand field's label: an agency names a client there.
  const viewer = await getViewer();
  const campaign = await getCampaign(params.id);
  if (!campaign) notFound();

  const candidates = await getCandidates(campaign.id);
  const rows = candidates.map(toRow);
  const {data: publicRows} = candidates.length ? await createSessionClient().from('channel_analyses').select('*').in('channel_id',candidates.map(c=>c.channelId)) : {data:[]};
  const printReports = (publicRows??[]).map(r=>publicReport(r)).filter((r):r is NonNullable<typeof r>=>!!r);
  const jobs = await getChannelJobs(candidates.map((c) => c.channelId));
  const brief = standard(campaign);
  const stated = brief.filter((b) => b.value !== null);

  const region = REGIONS.some((r) => r.code === searchParams.region) ? searchParams.region! : 'KR';
  const category = CATEGORIES.some((c) => c.id === searchParams.category)
    ? searchParams.category!
    : null;

  // Both are auxiliary: a spent quota or an unreachable chart costs this page
  // one panel, never the candidate work it sits under.
  const [references, trending] = await Promise.all([
    AMENDMENT_ACCEPTED ? getReferences(campaign.id) : Promise.resolve([]),
    AMENDMENT_ACCEPTED ? fetchTrending(region, category).catch((e: unknown) => {
      console.error('[campaign] trending failed', e);
      return null;
    }) : Promise.resolve(null),
  ]);
  const readAt = new Date().toISOString();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 bg-paper">
        <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8">
          <Link
            href="/campaigns"
            className="text-[12px] text-ink-muted underline-offset-4 hover:underline"
          >
            ← All campaigns
          </Link>
          <h1 className="mt-3 text-[24px] font-semibold tracking-tight text-ink">
            {campaign.name}
          </h1>

          {/* The standard, printed. An unstated field shows as unstated: a
              comparison run against half a brief is still useful, one that
              hides which half was empty is not. */}
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
            {stated.length === 0 ? (
              <p className="text-[12px] text-ink-muted">
                This brief has only a name. Candidates can still be compared on their public
                figures — the written fit read will say it had little to go on.
              </p>
            ) : (
              stated.map((item) => (
                <div key={item.label} className={`max-w-[40ch] ${item.label==='Budget'?'print:hidden':''}`}>
                  <p className="rail">{item.label}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-ink">{item.value}</p>
                </div>
              ))
            )}
          </div>

          <div className="mt-6 print:hidden"><PrintReport/></div>
          <LiveReport active={[...jobs.values()].flat().some(j=>j.status==='queued'||j.status==='running')}/>
          <details className="mt-6 rounded border bg-surface p-5 print:hidden"><summary className="cursor-pointer text-sm">Edit campaign brief</summary><div className="mt-4"><CampaignForm campaign={campaign} customerType={viewer?.organization?.customerType??null}/></div></details>
          {!AMENDMENT_ACCEPTED&&<p className="mt-5 text-sm text-ink-muted">Suitability and comment analysis are gated until YouTube approval is configured. Public evidence is below.</p>}
          <div className="mt-8 space-y-4">
            <Panel title="Add a candidate" meta="no creator signup required">
              <CandidateForm campaignId={campaign.id} />
            </Panel>

            <ComparisonTable rows={rows} candidates={candidates} />

            {candidates.map((candidate, i) => (
              <details key={candidate.id} className="candidate-detail rounded border bg-surface p-4"><summary className="cursor-pointer text-sm">{candidate.analysis?.title??candidate.submittedAs??'Pending channel'}</summary><div className="mt-4"><CandidateCard
                campaignId={campaign.id}
                candidate={candidate}
                row={rows[i]}
                jobs={jobs.get(candidate.channelId) ?? []}
              /></div></details>
            ))}
          </div>

          <div className="campaign-print-details hidden print:block">{printReports.map(report=><div key={report.channelId} className="campaign-print-creator"><ChannelReport report={report}/></div>)}</div>
          <p className="mt-5 text-xs text-ink-muted">Generated {new Date().toISOString()}. PDFs exclude private notes, budgets and fees. Refresh or delete exports by each report’s printed deadline.</p>
          {/* Planning sits BELOW the candidate work, deliberately. Choosing who
              to brief is the decision this page exists for; what to make with
              them is the step after it, and putting it above would have a buyer
              planning content for someone they have not chosen. */}
          {AMENDMENT_ACCEPTED && <div className="mt-10 space-y-4 print:hidden">
            <p className="rail">Planning</p>
            <ReferenceBox
              campaignId={campaign.id}
              candidates={candidates.map((c) => ({
                id: c.id,
                title: c.analysis?.title ?? c.submittedAs ?? c.channelId,
              }))}
            />
            <SavedReferences
              references={references}
              candidates={candidates.map((c) => ({
                id: c.id,
                title: c.analysis?.title ?? c.submittedAs ?? c.channelId,
              }))}
            />
            <ContentIdeas data={trending} campaignId={campaign.id} readAt={readAt} />
          </div>}
        </div>
      </main>
    </div>
  );
}
