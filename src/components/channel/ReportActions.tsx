'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';
import { attachReport, shareReport, startChannel, retryChannel, type ChannelState } from '@/app/actions/channel';
function Submit({ text }: { text: string }) { const { pending }=useFormStatus(); return <button disabled={pending} className="inline-flex min-h-9 items-center rounded-lg border border-line-strong bg-surface px-2.5 text-[12px] font-medium text-ink hover:bg-paper disabled:opacity-50">{pending?'Please wait…':text}</button>; }
export function LiveReport({ active }: { active:boolean }) {
 const router=useRouter(); useEffect(()=> { if(!active)return; const timer=setInterval(()=>router.refresh(),5000);return()=>clearInterval(timer);},[active,router]); return null;
}
/**
 * Export, with the appendix as a choice.
 *
 * The appendix is the full sampled list, the age tables and the method — worth
 * having when somebody is checking the work, and three pages of noise when the
 * report is being sent to a colleague to glance at. The class goes on <html>
 * rather than on a wrapper so the print rule can reach it from anywhere the
 * report is rendered, and it is removed afterwards so the screen view is never
 * left altered by an export.
 */
export function PrintReport({ appendixToggle = true }: { appendixToggle?: boolean }) {
  const [withAppendix, setWithAppendix] = useState(true);

  function print() {
    const root = document.documentElement;
    root.classList.toggle('print-no-appendix', !withAppendix);
    try {
      window.print();
    } finally {
      root.classList.remove('print-no-appendix');
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2.5 print:hidden">
      <button type="button" onClick={print} className="rounded border px-3 py-2 text-sm text-indigo">
        Export PDF
      </button>
      {appendixToggle ? (
        <label className="flex items-center gap-1.5 text-[12px] text-ink-muted">
          <input
            type="checkbox"
            checked={withAppendix}
            onChange={(event) => setWithAppendix(event.target.checked)}
            className="h-3.5 w-3.5"
          />
          Include appendix
        </label>
      ) : null}
    </span>
  );
}
export function ReportActions({ channelId, campaigns, brands=[], days=90 }: { channelId:string; campaigns:{id:string;name:string}[]; brands?:{id:string;name:string}[]; days?:number }) {
 const [added,add]=useFormState<ChannelState,FormData>(attachReport,{});
 const [shared,share]=useFormState<ChannelState,FormData>(shareReport,{});
 const [updated,update]=useFormState<ChannelState,FormData>(startChannel,{});
 const [retried,retry]=useFormState<ChannelState,FormData>(retryChannel,{});
 return <div className="space-y-3 print:hidden">
 <div className="flex flex-wrap gap-2"><form action={update}><input type="hidden" name="channelId" value={channelId}/><input type="hidden" name="refresh" value="true"/><input type="hidden" name="days" value={days}/><Submit text="Refresh analysis"/></form><form action={retry}><input type="hidden" name="channelId" value={channelId}/><Submit text="Retry failed work"/></form></div>
 <div><PrintReport /></div>
 <details className="rounded-lg border border-line bg-paper p-3"><summary className="cursor-pointer text-[13px] font-medium text-ink">Add to campaign</summary><form action={add} className="mt-2.5 space-y-2"><input type="hidden" name="channelId" value={channelId}/><label className="sr-only" htmlFor="add-campaign">Campaign</label><select id="add-campaign" name="campaignId" required className="min-h-10 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px]"><option value="">Choose campaign</option>{campaigns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><div className="flex flex-wrap items-center gap-2"><Submit text="Add"/><Link className="text-[12px] text-indigo underline-offset-4 hover:underline" href={`/campaigns/new?channelId=${channelId}`}>New campaign</Link></div></form></details>
 <details className="rounded-lg border border-line bg-paper p-3"><summary className="cursor-pointer text-[13px] font-medium text-ink">Share report</summary>
 <form action={share} className="mt-3 space-y-3 text-sm"><input type="hidden" name="channelId" value={channelId}/>
  <fieldset><legend className="font-medium">What the link shows</legend>
   <label className="mt-1.5 flex items-center gap-2"><input type="checkbox" name="includeChannel" defaultChecked/>Channel report</label>
   <label className="mt-1 flex items-center gap-2"><input type="checkbox" name="includeRelevance"/>Brand relevance analysis</label>
   {brands.length>0?<label className="mt-1.5 block">Brand <select name="brandId" className="mt-1 min-h-10 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px]"><option value="">Choose a brand</option>{brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>:<p className="mt-1 text-[12px] text-ink-muted">No brand analyses saved yet.</p>}
   {/* Said where the decision is made, not in a footnote: a relevance analysis
       contains the brief, so sharing it shares what you are planning. */}
   <p className="mt-1.5 text-[12px] text-ink-muted">The relevance analysis includes your product and objective.</p>
  </fieldset>
  <label className="block">Optional campaign <select name="campaignId" className="mt-1 min-h-10 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px]"><option value="">None</option>{campaigns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
  <div className="flex flex-wrap gap-4">{['notes','budget','fee'].map(v=><label key={v} className="flex items-center gap-2"><input type="checkbox" name={v}/>Include {v === 'fee'?'quoted fee':v}</label>)}</div>
  <p className="text-[12px] text-ink-muted">Notes, budget and fees stay out unless ticked, whichever reports the link shows. Revoke in Settings.</p>
  <Submit text="Create share link"/></form>
 {shared.shareUrl && <Link href={shared.shareUrl} className="mt-3 block break-all text-indigo">{shared.shareUrl}</Link>}</details>
 {[added,shared,updated,retried].map((s,i)=>s.message&&<p key={i} role="status" className="text-[12px] leading-relaxed text-ink-muted">{s.message}</p>)}
 </div>;
}
