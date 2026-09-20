'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';
import { attachReport, shareReport, startChannel, retryChannel, type ChannelState } from '@/app/actions/channel';
function Submit({ text }: { text: string }) { const { pending }=useFormStatus(); return <button disabled={pending} className="rounded border px-3 py-2 text-sm text-indigo disabled:opacity-50">{pending?'Please wait…':text}</button>; }
export function LiveReport({ active }: { active:boolean }) {
 const router=useRouter(); useEffect(()=> { if(!active)return; const timer=setInterval(()=>router.refresh(),5000);return()=>clearInterval(timer);},[active,router]); return null;
}
export function PrintReport() { return <button className="rounded border px-3 py-2 text-sm text-indigo print:hidden" onClick={()=>window.print()}>Export PDF</button>; }
export function ReportActions({ channelId, campaigns, days=90 }: { channelId:string; campaigns:{id:string;name:string}[];days?:number }) {
 const [added,add]=useFormState<ChannelState,FormData>(attachReport,{});
 const [shared,share]=useFormState<ChannelState,FormData>(shareReport,{});
 const [updated,update]=useFormState<ChannelState,FormData>(startChannel,{});
 const [retried,retry]=useFormState<ChannelState,FormData>(retryChannel,{});
 return <div className="my-6 space-y-4 print:hidden">
 <div className="flex flex-wrap gap-3"><PrintReport /><form action={update}><input type="hidden" name="channelId" value={channelId}/><input type="hidden" name="refresh" value="true"/><input type="hidden" name="days" value={days}/><Submit text="Refresh analysis"/></form><form action={retry}><input type="hidden" name="channelId" value={channelId}/><Submit text="Retry failed work"/></form></div>
 <details className="rounded border bg-surface p-4"><summary className="cursor-pointer text-sm">Add to campaign</summary><form action={add} className="mt-3 flex flex-wrap gap-3"><input type="hidden" name="channelId" value={channelId}/><label className="sr-only" htmlFor="add-campaign">Campaign</label><select id="add-campaign" name="campaignId" required className="rounded border p-2 text-sm"><option value="">Choose campaign</option>{campaigns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><Submit text="Add to campaign"/><Link className="p-2 text-sm text-indigo" href={`/campaigns/new?channelId=${channelId}`}>New campaign</Link></form></details>
 <details className="rounded border bg-surface p-4"><summary className="cursor-pointer text-sm">Share report</summary><p className="my-3 text-sm">Public-source report only by default. Anyone with the generated link can read it. You can revoke links in Settings.</p><form action={share} className="space-y-3 text-sm"><input type="hidden" name="channelId" value={channelId}/><label>Optional campaign <select name="campaignId" className="rounded border p-2"><option value="">None — public report only</option>{campaigns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><div className="flex flex-wrap gap-4">{['notes','budget','fee'].map(v=><label key={v} className="flex items-center gap-2"><input type="checkbox" name={v}/>Include {v === 'fee'?'quoted fee':v}</label>)}</div><Submit text="Create share link"/></form>{shared.shareUrl && <Link href={shared.shareUrl} className="mt-3 block break-all text-indigo">{shared.shareUrl}</Link>}</details>
 {[added,shared,updated,retried].map((s,i)=>s.message&&<p key={i} role="status" className="text-sm">{s.message}</p>)}
 </div>;
}
