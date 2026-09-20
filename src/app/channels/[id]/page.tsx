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
export const dynamic='force-dynamic';
export default async function ReportPage({params,searchParams}:{params:{id:string};searchParams:{format?:string}}) {
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
 const active=jobs.some(j=>j.status==='queued'||j.status==='running');
 const state=reportState(jobs,!!report,(report?.derivedAllowed && !report.comments ? 0 : report?.videos.length)??0,(report?.unreadable??0)>0);
 return <><SiteHeader/><main className="report-page mx-auto max-w-5xl px-6 py-10"><Link className="text-sm text-indigo print:hidden" href="/channels">← Channel analysis</Link><LiveReport active={active}/><div className="my-5 rounded border bg-indigo-wash p-4 text-sm print:hidden"><strong>{state}</strong>{active&&<span className="ml-2 text-ink-muted">Safe to leave — this continues in the background.</span>}<AnalysisProgress jobs={jobs}/>{report&&active&&<p className="mt-2 text-[12px] text-ink-muted">Results from {new Date(report.fetchedAt).toLocaleString('en-US')} stay below until the new ones land.</p>}{state==='Failed'&&<p className="mt-2">Collection failed. Nothing negative about this channel is implied.</p>}</div>
 <ReportActions channelId={params.id} campaigns={campaigns} days={report?.windowDays}/>
 {report?<><form className="my-5 flex items-center gap-3 text-sm print:hidden"><label>Content format <select name="format" defaultValue={searchParams.format??'all'} className="rounded border p-2"><option value="all">All formats</option><option value="short">Shorts / short videos (proxy)</option><option value="long">Long-form</option></select></label><button className="text-indigo">Apply view</button></form><ChannelReport report={report} format={['short','long'].includes(searchParams.format??'')?searchParams.format:'all'}/></>:<p className="py-6">No current report is available. {active?'Waiting for collection to complete.':'Start or refresh analysis to collect current evidence.'}</p>}
 <CollaborationRecords channelId={params.id} records={records??[]}/>
 </main></>;
}
