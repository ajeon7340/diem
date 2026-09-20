import { previewChannel } from '@/app/actions/channel';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/shell/SiteHeader';
import { ChannelEntry } from '@/components/channel/ChannelEntry';
import { getViewer } from '@/lib/access/viewer';
import { channelDestination } from '@/lib/channel/state';
import { createSessionClient, isSupabaseConfigured } from '@/lib/supabase/server';
export const dynamic='force-dynamic';
export default async function Channels({searchParams}:{searchParams:{channel?:string}}) {
 const viewer=await getViewer();
 if(!viewer.organization) redirect(channelDestination(searchParams.channel,viewer.userId?'/onboarding/business':'/join/business'));
 let reports:{channel_id:string;title:string;handle:string|null}[]=[];
 let pending:string[]=[];
 if(isSupabaseConfigured()) {
  const db=createSessionClient();
  const {data:refs}=await db.from('workspace_channels').select('channel_id').eq('organization_id',viewer.organization.id).order('created_at',{ascending:false});
  const ids=(refs??[]).map(r=>r.channel_id);
  if(ids.length){const {data}=await db.from('channel_analyses').select('channel_id,title,handle').in('channel_id',ids);reports=data??[];pending=ids.filter(id=>!reports.some(r=>r.channel_id===id));}
 }
 const form = new FormData(); form.set('channel',searchParams.channel??'');
 const resolved=searchParams.channel?await previewChannel({},form):{};
 return <><SiteHeader/><main className="mx-auto max-w-4xl px-6 py-10"><p className="rail">Channel analysis</p><h1 className="my-4 text-3xl font-semibold">New channel analysis</h1><p className="mb-6 text-sm text-ink-muted">Resolve a YouTube channel, confirm it, then start. No creator registration or access approval is needed.</p><ChannelEntry initial={searchParams.channel} resolved={resolved}/><h2 className="mb-4 mt-12 text-lg font-semibold">Workspace reports</h2><div className="divide-y rounded border bg-surface">{reports.map(r=><Link key={r.channel_id} href={`/channels/${r.channel_id}`} className="block p-4 text-sm text-indigo">{r.title} <span className="text-ink-muted">{r.handle}</span></Link>)}{pending.map(id=><Link key={id} href={`/channels/${id}`} className="block p-4 text-sm text-indigo">Open pending or expired channel report</Link>)}{!reports.length&&!pending.length&&<p className="p-5 text-sm text-ink-muted">Your first report will appear here. <Link href="/channels/sample" className="text-indigo">View sample report</Link></p>}</div></main></>;
}
