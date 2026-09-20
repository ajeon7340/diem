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
import { getViewer } from '@/lib/access/viewer';
import { getCampaign, getCandidates, getChannelJobs } from '@/lib/data/campaigns';
import { getBrands } from '@/lib/data/brands';
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
  const brands = viewer.organization
    ? (await getBrands(viewer.organization.id)).map((brand) => ({
        id: brand.id,
        name: brand.name,
        sells: brand.sells,
        customerNeeds: brand.customerNeeds,
      }))
    : [];
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
        <div className="workspace-page max-w-6xl">
          <Link
            href="/campaigns"
            className="text-[12px] text-ink-muted underline-offset-4 hover:underline"
          >
            ← All campaigns
          </Link>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="rail">Campaign</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">{campaign.name}</h1>
              <p className="mt-2 text-sm text-ink-muted">{candidates.length} of 5 candidates · decisions stay private to this workspace</p>
            </div>
            <div className="flex items-center gap-2 print:hidden"><a href="#add-candidate" className="primary-action">Add candidate</a><PrintReport /></div>
          </div>

          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 border-y border-line py-4">
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

          <LiveReport active={[...jobs.values()].flat().some(j=>j.status==='queued'||j.status==='running')}/>
          <details className="surface-card mt-6 print:hidden"><summary className="cursor-pointer px-5 py-4 text-sm font-medium text-ink">Campaign brief <span className="ml-2 font-normal text-ink-muted">Edit brand, audience, objective and budget</span></summary><div className="border-t border-line p-5"><CampaignForm campaign={campaign} brands={brands} customerType={viewer?.organization?.customerType??null}/></div></details>
          {!AMENDMENT_ACCEPTED&&<p className="mt-5 rounded-xl border border-amber/30 bg-amber-wash px-4 py-3 text-sm leading-relaxed text-ink-muted">Campaign-specific suitability is unavailable until YouTube approval is configured. You can still make decisions using the public report evidence below.</p>}
          <div className="mt-8 space-y-5">
            <section id="add-candidate" className="surface-card scroll-mt-8 print:hidden"><div className="border-b border-line px-5 py-4"><p className="rail">Add to this campaign</p><h2 className="mt-2 text-lg font-semibold text-ink">Add a YouTube channel</h2><p className="mt-1 text-sm text-ink-muted">Paste a URL or @handle. The public report is reused when it is still current.</p></div><div className="p-5"><CandidateForm campaignId={campaign.id} /></div></section>

            <section className="surface-card overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4"><div><p className="rail">Candidates</p><h2 className="mt-2 text-lg font-semibold text-ink">Make the shortlist</h2></div><p className="text-xs text-ink-muted">Review status is your decision, separate from analysis status.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-paper text-[11px] uppercase tracking-[0.08em] text-ink-faint"><tr><th className="px-5 py-3 font-medium">Channel</th><th className="px-5 py-3 font-medium">Analysis</th><th className="px-5 py-3 font-medium">Campaign evaluation</th><th className="px-5 py-3 font-medium">Review</th><th className="px-5 py-3 font-medium"><span className="sr-only">Open</span></th></tr></thead><tbody>{candidates.length ? candidates.map((candidate, i) => { const row = rows[i]; const active = (jobs.get(candidate.channelId) ?? []).some((job) => job.status === 'queued' || job.status === 'running'); const failed = (jobs.get(candidate.channelId) ?? []).some((job) => job.status === 'failed'); const analysisState = active ? 'In progress' : failed ? 'Needs attention' : row.missing ? 'Not collected' : 'Ready'; return <tr key={candidate.id} className="border-t border-line hover:bg-paper"><td className="px-5 py-4"><a href={`#candidate-${candidate.id}`} className="font-medium text-ink hover:text-indigo">{row.title}</a><p className="mt-1 text-xs text-ink-muted">{candidate.analysis?.handle ?? candidate.submittedAs ?? 'YouTube channel'}</p></td><td className="px-5 py-4 text-xs text-ink-muted">{analysisState}</td><td className="px-5 py-4 text-xs text-ink-muted">{candidate.fit ? candidate.fit.confidence === 'supported' ? 'Fit read ready' : 'Directional read' : 'Not evaluated'}</td><td className="px-5 py-4 text-xs font-medium text-ink">{candidate.status === 'shortlisted' ? 'Priority outreach' : candidate.status === 'considering' ? 'Undecided' : candidate.status === 'hold' ? 'Hold' : 'Excluded'}</td><td className="px-5 py-4 text-right"><a href={`#candidate-${candidate.id}`} className="text-xs font-medium text-indigo hover:underline">Review →</a></td></tr>; }) : <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-ink-muted">Add up to five candidates to compare their public evidence side by side.</td></tr>}</tbody></table></div></section>

            {candidates.length > 1 ? <details className="surface-card print:hidden"><summary className="cursor-pointer px-5 py-4 text-sm font-medium text-ink">Compare candidates <span className="ml-2 font-normal text-ink-muted">View evidence side by side</span></summary><div className="border-t border-line"><ComparisonTable rows={rows} candidates={candidates} /></div></details> : null}

            <div className="space-y-4">{candidates.map((candidate, i) => (
              <details key={candidate.id} className="candidate-detail surface-card overflow-hidden" open={candidates.length === 1}><summary className="cursor-pointer px-5 py-4 text-sm font-medium text-ink">{candidate.analysis?.title??candidate.submittedAs??'Pending channel'} <span className="ml-2 font-normal text-ink-muted">Candidate details and evidence</span></summary><div className="border-t border-line"><CandidateCard
                campaignId={campaign.id}
                candidate={candidate}
                row={rows[i]}
                jobs={jobs.get(candidate.channelId) ?? []}
              /></div></details>
            ))}</div>
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
