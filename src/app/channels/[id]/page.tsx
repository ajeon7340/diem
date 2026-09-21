import { CollaborationRecords } from '@/components/channel/CollaborationRecords';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { SiteHeader } from '@/components/shell/SiteHeader';
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
export const dynamic='force-dynamic';
export default async function ReportPage({params,searchParams}:{params:{id:string};searchParams:{format?:string;view?:string;brand?:string;campaign?:string}}) {
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
 return <><SiteHeader/><main className="report-page mx-auto max-w-5xl px-6 py-10"><Link className="text-sm text-indigo print:hidden" href="/channels">← Channel analysis</Link><LiveReport active={active}/><div className="my-5 rounded border bg-indigo-wash p-4 text-sm print:hidden"><strong>{state}</strong>{active&&<span className="ml-2 text-ink-muted">Safe to leave — this continues in the background.</span>}<AnalysisProgress jobs={jobs}/>{report&&active&&<p className="mt-2 text-[12px] text-ink-muted">Results from {new Date(report.fetchedAt).toLocaleString('en-US')} stay below until the new ones land.</p>}{state==='Failed'&&<p className="mt-2">Collection failed. Nothing negative about this channel is implied.</p>}</div>
 <ReportActions channelId={params.id} campaigns={campaigns} brands={brands.map(b=>({id:b.id,name:b.name}))} days={report?.windowDays}/>
 <ReportTabs channelId={params.id} view={view} brand={searchParams.brand??null} campaign={searchParams.campaign??null}/>
 {view==='overview'?(report?<><form className="my-5 flex items-center gap-3 text-sm print:hidden"><label>Content format <select name="format" defaultValue={searchParams.format??'all'} className="rounded border p-2"><option value="all">All formats</option><option value="short">Shorts / short videos (proxy)</option><option value="long">Long-form</option></select></label><button className="text-indigo">Apply view</button></form><ChannelReport report={report} format={['short','long'].includes(searchParams.format??'')?searchParams.format:'all'}/></>:
 /* FIVE STATES, and the one that used to be missing is `expired`. A row that
    exists but is past its 30-day deadline came back null from `publicReport`
    and rendered as "no current report", which reads as never collected —
    opposite events, identical sentence. */
 <div className="py-6 text-sm"><p className="font-medium">{row?'This report has passed its retention deadline':active?'Collecting now':state==='Failed'?'Collection could not be completed':'Not collected yet'}</p><p className="mt-1.5 max-w-[60ch] leading-relaxed text-ink-muted">{row
  ?`Public data is deleted 30 days after collection. Refresh to collect it again.`
  :active
   ?'Results appear when collection finishes.'
   :state==='Failed'
    ?'Our collection failed — this says nothing about the channel. Try again.'
    :'Start analysis to collect this channel’s public evidence.'}</p></div>)
 :<div className="my-5 space-y-5">
  <div className="rounded-xl border border-line bg-surface p-4 print:hidden"><RelevanceLauncher channelId={params.id} brands={brands.map(b=>({id:b.id,name:b.name}))} campaigns={campaigns.map(c=>({id:c.id,name:c.name,brandId:c.brandId}))} selectedBrand={selectedBrand?.id??null} selectedCampaign={selectedCampaign?.id??null} hasStored={Boolean(stored)}/></div>
  {!report?<p className="text-sm text-ink-muted">There is no current evidence for this channel, so there is nothing to read against a brand. Collect it first.</p>
   :!context?<p className="text-sm text-ink-muted">Choose a brand to analyse this channel against. The channel report needs no brand.</p>
   :<RelevanceReport report={report} context={context} rows={stored?.matrix?.length?stored.matrix:requirementMatrix(report,context)} narrative={stored?.narrative??null} freshness={freshness} writtenAt={stored?.createdAt??null} writtenAgainst={stored?.evidenceFetchedAt??null}/>}
 </div>}
 <CollaborationRecords channelId={params.id} records={records??[]}/>
 </main></>;
}
