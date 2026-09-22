import { CollaborationRecords } from '@/components/channel/CollaborationRecords';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { WorkspaceLayout } from '@/components/shell/WorkspaceLayout';
import { Badge } from '@/components/ui/Badge';
import { ChannelReport } from '@/components/channel/ChannelReport';
import { LiveReport, ReportActions } from '@/components/channel/ReportActions';
import { getViewer } from '@/lib/access/viewer';
import { createSessionClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { getCampaigns,getChannelJobs } from '@/lib/data/campaigns';
import { publicReport } from '@/lib/channel/report';
import { reportState } from '@/lib/channel/state';
import { AnalysisProgress } from '@/components/channel/AnalysisProgress';
import { getBrands } from '@/lib/data/brands';
import { getRelevance } from '@/lib/data/relevance';
import { RelevanceLauncher } from '@/components/report/RelevanceLauncher';
import { RelevanceReport } from '@/components/report/RelevanceReport';
import { contextFingerprint, freshnessOf } from '@/lib/relevance/fingerprint';
import { requirementMatrix, type RelevanceContext } from '@/lib/relevance/requirements';
import { ReportTabs } from '@/components/report/ReportTabs';
import { ReportRange } from '@/components/report/ReportRange';
import { publishedRange } from '@/lib/channel/report';
export const dynamic='force-dynamic';
export default async function ReportPage({params,searchParams}:{params:{id:string};searchParams:{format?:string;view?:string;brand?:string;campaign?:string;from?:string;to?:string}}) {
 const viewer=await getViewer();if(!viewer.organization)redirect('/signin');if(!isSupabaseConfigured())notFound();
 const db=createSessionClient();
 const {data:row}=await db.from('channel_analyses').select('*').eq('channel_id',params.id).maybeSingle();
 const report=row?publicReport(row):null;
 const jobs=(await getChannelJobs([params.id])).get(params.id)??[];
 // A private pending reference is visible only to workspace members.
 const {data:ref}=await db.from('workspace_channels').select('channel_id').eq('channel_id',params.id).eq('organization_id',viewer.organization.id).maybeSingle();
 if(!report&&!ref)notFound();
 const {data:records}=await db.from('workspace_collaborations').select('id,brand,details,created_at').eq('channel_id',params.id).eq('organization_id',viewer.organization.id).order('created_at',{ascending:false});
 const campaigns=await getCampaigns(viewer.organization.id);
 // TWO REPORTS, TWO VIEWS. The channel overview needs no brand and is what a
 // shared link carries; the relevance analysis is about one brand's product and
 // contains the customer's own brief. Putting them on one page was how the
 // second started travelling with the first.
 const view=searchParams.view==='relevance'?'relevance':'overview';
 const brands=await getBrands(viewer.organization.id);
 const selectedBrand=brands.find(b=>b.id===searchParams.brand)??(brands.length===1?brands[0]:null);
 const selectedCampaign=searchParams.campaign?campaigns.find(c=>c.id===searchParams.campaign)??null:null;
 const stored=report&&selectedBrand?await getRelevance(viewer.organization.id,params.id,selectedBrand.id,selectedCampaign?.id??null):null;
 const context:RelevanceContext|null=selectedBrand?{brand:{id:selectedBrand.id,name:selectedBrand.name,sells:selectedBrand.sells,categories:selectedBrand.categories,customerNeeds:selectedBrand.customerNeeds,contentLanguages:selectedBrand.contentLanguages,markets:selectedBrand.markets},campaign:selectedCampaign?{id:selectedCampaign.id,name:selectedCampaign.name,product:selectedCampaign.product,useCase:selectedCampaign.useCase??null,objective:selectedCampaign.objective,avoidTopics:selectedCampaign.avoidTopics}:null}:null;
 const freshness=context&&report?freshnessOf(stored?{evidenceFetchedAt:stored.evidenceFetchedAt,contextFingerprint:stored.contextFingerprint}:null,report.fetchedAt,contextFingerprint(context)):'missing';
 const active=jobs.some(j=>j.status==='queued'||j.status==='running');
 const state=reportState(jobs,!!report,(report?.derivedAllowed && !report.comments ? 0 : report?.videos.length)??0,(report?.unreadable??0)>0);

 /*
  * THE DATE RANGE NARROWS THE SAMPLE, IT DOES NOT COLLECT ONE.
  *
  * Filtering here rather than in the browser means every figure — the
  * composition, the medians, the scatter, the representative uploads, the
  * limitations — is recomputed over the same filtered set. A client-side
  * filter that hid rows would leave the charts drawn over all of them.
  */
 const sampleSpan = publishedRange(report?.videos ?? []);
 const day = (value: string | undefined) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);
 const from = day(searchParams.from);
 const to = day(searchParams.to);
 const ranged = report && (from || to)
  ? {
     ...report,
     videos: report.videos.filter((v) => {
      const at = v.publishedAt.slice(0, 10);
      return (!from || at >= from) && (!to || at <= to);
     }),
    }
  : report;
 // The sampled range follows the filter, or the appendix would report dates
 // that are no longer in the report above it.
 const shown = ranged && ranged !== report
  ? { ...ranged, ...(() => { const r = publishedRange(ranged.videos); return { sampledStart: r.first, sampledEnd: r.last }; })() }
  : ranged;

 const overview = view === 'overview';
 const stateTone = active ? 'indigo' : state === 'Failed' ? 'rose' : state.startsWith('Partially') || state.includes('insufficient') ? 'amber' : report ? 'emerald' : 'slate';

 return (
  <WorkspaceLayout
   width="wide"
   header={{
    // IDENTITY, STATE AND ACTIONS IN ONE STRIP. They were a 340px rail beside
    // the report, so a document written to be read at a comfortable measure
    // had two-thirds of a laptop screen, and the rail said the channel's name
    // a second time next to the report's own header.
    icon: report?.avatar ? (
     // eslint-disable-next-line @next/next/no-img-element
     <img
      src={report.avatar}
      alt=""
      width={36}
      height={36}
      className="h-9 w-9 rounded-full outline outline-1 -outline-offset-1 outline-black/10"
     />
    ) : null,
    title: report?.title ?? params.id,
    meta: (
     <>
      {report?.handle ? <span>{report.handle}</span> : null}
      <Badge tone={stateTone}>{state}</Badge>
      {report ? (
       <span className="tnum">
        collected {new Date(report.fetchedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
       </span>
      ) : null}
      <Link href="/channels" className="text-indigo underline-offset-4 hover:underline">
       All reports
      </Link>
     </>
    ),
    secondary: (
     <ReportActions
      channelId={params.id}
      campaigns={campaigns}
      brands={brands.map((b) => ({ id: b.id, name: b.name }))}
      days={report?.windowDays}
      layout="inline"
     />
    ),
    tabs: (
     <ReportTabs
      channelId={params.id}
      view={view}
      brand={searchParams.brand ?? null}
      campaign={searchParams.campaign ?? null}
     />
    ),
   }}
  >
   <LiveReport active={active} />

   {/* Anything genuinely in flight or failed gets a line of its own, above the
       report. A finished collection says so in the header and nowhere else. */}
   {active ? (
    <div className="mb-4 rounded-[var(--r-md)] border border-line bg-surface px-3 py-2.5 print:hidden">
     <AnalysisProgress jobs={jobs} />
     <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
      Safe to leave — this continues in the background.
     </p>
    </div>
   ) : state === 'Failed' ? (
    <p className="mb-4 rounded-[var(--r-md)] border border-rose/30 bg-rose-wash px-3 py-2 text-[12px] text-ink print:hidden">
     Our collection failed. Nothing about this channel is implied.
    </p>
   ) : null}

   {overview ? (
    report ? (
     <div className="mx-auto max-w-[1080px]">
      {/* The filters sit with the report they filter, not in a rail. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 print:hidden">
       {sampleSpan.first && sampleSpan.last ? (
        <ReportRange
         from={from}
         to={to}
         min={sampleSpan.first.slice(0, 10)}
         max={sampleSpan.last.slice(0, 10)}
         shown={shown?.videos.length ?? 0}
         total={report.videos.length}
        />
       ) : null}
       <form className="flex items-center gap-2">
        {searchParams.brand ? <input type="hidden" name="brand" value={searchParams.brand} /> : null}
        {from ? <input type="hidden" name="from" value={from} /> : null}
        {to ? <input type="hidden" name="to" value={to} /> : null}
        <label className="sr-only" htmlFor="format">Format</label>
        <select
         id="format"
         name="format"
         defaultValue={searchParams.format ?? 'all'}
         className="min-h-8 rounded-[var(--r-md)] border border-line bg-surface px-2 text-[12px] text-ink"
        >
         <option value="all">All formats</option>
         <option value="short">Short, ≤3 min (proxy)</option>
         <option value="long">Long-form</option>
        </select>
        <button className="press min-h-8 rounded-[var(--r-md)] border border-line-strong bg-surface px-2.5 text-[12px] font-medium text-ink hover:bg-paper">
         Apply
        </button>
       </form>
      </div>
      {/* The rail already names the channel; the report's own header would be
          the same avatar, name and handle a second time. It still prints. */}
      <ChannelReport
       report={shown!}
       narrowed={shown!.videos.length !== report.videos.length ? report.videos.length : null}
       identity={false}
       format={['short', 'long'].includes(searchParams.format ?? '') ? searchParams.format : 'all'}
      />
     </div>
    ) : (
     /* FIVE STATES, and the one that used to be missing is `expired`. A row
        that exists but is past its 30-day deadline came back null from
        `publicReport` and rendered as "no current report", which reads as never
        collected — opposite events, identical sentence. */
     <div className="py-8 text-sm">
      <p className="font-medium">
       {row ? 'This report has passed its retention deadline' : active ? 'Collecting now' : state === 'Failed' ? 'Collection could not be completed' : 'Not collected yet'}
      </p>
      <p className="mt-1.5 max-w-[60ch] leading-relaxed text-ink-muted">
       {row
        ? 'Public data is deleted 30 days after collection. Refresh to collect it again.'
        : active
         ? 'Results appear when collection finishes.'
         : state === 'Failed'
          ? 'Our collection failed — this says nothing about the channel. Try again.'
          : 'Start analysis to collect this channel’s public evidence.'}
      </p>
     </div>
    )
   ) : (
    <div className="mx-auto max-w-[1080px] space-y-4">
     <div className="surface p-4 print:hidden">
      <RelevanceLauncher
       channelId={params.id}
       brands={brands.map((b) => ({ id: b.id, name: b.name }))}
       campaigns={campaigns.map((c) => ({ id: c.id, name: c.name, brandId: c.brandId }))}
       selectedBrand={selectedBrand?.id ?? null}
       selectedCampaign={selectedCampaign?.id ?? null}
       hasStored={Boolean(stored)}
      />
     </div>
     {!report ? (
      <p className="text-sm text-ink-muted">
       There is no current evidence for this channel, so there is nothing to read against a brand. Collect it first.
      </p>
     ) : !context ? (
      <p className="text-sm text-ink-muted">
       Choose a brand to analyse this channel against. The channel report needs no brand.
      </p>
     ) : (
      <RelevanceReport
       report={report}
       context={context}
       rows={stored?.matrix?.length ? stored.matrix : requirementMatrix(report, context)}
       narrative={stored?.narrative ?? null}
       freshness={freshness}
       writtenAt={stored?.createdAt ?? null}
       writtenAgainst={stored?.evidenceFetchedAt ?? null}
      />
     )}
    </div>
   )}

   <CollaborationRecords channelId={params.id} records={records ?? []} />
  </WorkspaceLayout>
 );
}
