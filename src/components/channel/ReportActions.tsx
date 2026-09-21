'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';
import { attachReport, shareReport, startChannel, retryChannel, type ChannelState } from '@/app/actions/channel';
/** The quiet row: maintenance actions, not the reason anybody opened the page. */
function Quiet({ text }: { text: string }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="text-ink-muted underline-offset-4 hover:text-ink hover:underline disabled:opacity-50">
      {pending ? 'Working…' : text}
    </button>
  );
}

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
    <span className="inline-flex flex-wrap items-center gap-2 text-[12px] print:hidden">
      <button type="button" onClick={print} className="text-ink-muted underline-offset-4 hover:text-ink hover:underline">
        Export PDF
      </button>
      {appendixToggle ? (
        <label className="flex items-center gap-1.5 text-ink-faint">
          <input
            type="checkbox"
            checked={withAppendix}
            onChange={(event) => setWithAppendix(event.target.checked)}
            className="h-3.5 w-3.5"
          />
          with appendix
        </label>
      ) : null}
    </span>
  );
}
/**
 * Report actions, in two shapes.
 *
 * `stacked` is the rail form. `inline` is the page-header form: the same two
 * disclosures, opening downward as popovers so a header strip does not grow to
 * three rows when somebody opens Share. Same markup, same controls, same
 * permissions — only the box they sit in differs.
 */
export function ReportActions({ channelId, campaigns, brands=[], days=90, layout='stacked' }: { channelId:string; campaigns:{id:string;name:string}[]; brands?:{id:string;name:string}[]; days?:number; layout?:'stacked'|'inline' }) {
 const [added,add]=useFormState<ChannelState,FormData>(attachReport,{});
 const [shared,share]=useFormState<ChannelState,FormData>(shareReport,{});
 const [updated,update]=useFormState<ChannelState,FormData>(startChannel,{});
 const [retried,retry]=useFormState<ChannelState,FormData>(retryChannel,{});
 const inline = layout === 'inline';
 // In the header the disclosure body floats; in the rail it pushes the column.
 const shell = inline
  ? 'relative rounded-[var(--r-md)] border border-line-strong bg-surface'
  : 'rounded-lg border border-line bg-paper';
 const body = inline
  ? 'absolute right-0 top-[calc(100%+4px)] z-40 w-[320px] rounded-[var(--r-lg)] border border-line bg-surface p-3 shadow-[var(--shadow-overlay)]'
  : 'border-t border-line px-3 py-2.5';
 return <div className={inline ? 'flex flex-wrap items-center gap-2 print:hidden' : 'space-y-2.5 print:hidden'}>
 {/* TWO THINGS PEOPLE ACTUALLY COME HERE TO DO, then everything else as one
     quiet row. It was five controls of equal weight stacked vertically —
     two buttons, an export with a checkbox beside it, and two disclosures —
     which read as a toolbar nobody had edited. */}
 <details className={shell}><summary className={`cursor-pointer ${inline?'px-2.5 py-1.5 text-[12px]':'px-3 py-2 text-[13px]'} font-medium text-ink`}>Add to campaign</summary><form action={add} className={`space-y-2 ${body}`}><input type="hidden" name="channelId" value={channelId}/><label className="sr-only" htmlFor="add-campaign">Campaign</label><select id="add-campaign" name="campaignId" required className="min-h-10 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px]"><option value="">Choose campaign</option>{campaigns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><div className="flex flex-wrap items-center gap-2"><Submit text="Add"/><Link className="text-[12px] text-indigo underline-offset-4 hover:underline" href={`/campaigns/new?channelId=${channelId}`}>New campaign</Link></div></form></details>

 <details className={shell}><summary className={`cursor-pointer ${inline?'px-2.5 py-1.5 text-[12px]':'px-3 py-2 text-[13px]'} font-medium text-ink`}>Share report</summary>
  <form action={share} className={`space-y-3 text-[12px] ${body}`}><input type="hidden" name="channelId" value={channelId}/>
   <fieldset><legend className="font-medium text-ink">What the link shows</legend>
    <label className="mt-1.5 flex items-center gap-2"><input type="checkbox" name="includeChannel" defaultChecked/>Channel report</label>
    <label className="mt-1 flex items-center gap-2"><input type="checkbox" name="includeRelevance"/>Brand relevance</label>
    {brands.length>0?<label className="mt-1.5 block">Brand<select name="brandId" className="mt-1 min-h-10 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px]"><option value="">Choose a brand</option>{brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>:null}
    {/* Said where the decision is made: a relevance analysis contains the
        brief, so sharing it shares what you are planning. */}
    <p className="mt-1.5 text-ink-muted">The relevance analysis includes your product and objective.</p>
   </fieldset>
   <label className="block">Campaign<select name="campaignId" className="mt-1 min-h-10 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px]"><option value="">None</option>{campaigns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
   <div className="flex flex-wrap gap-x-4 gap-y-1">{['notes','budget','fee'].map(v=><label key={v} className="flex items-center gap-2"><input type="checkbox" name={v}/>{v === 'fee'?'Quoted fee':v[0].toUpperCase()+v.slice(1)}</label>)}</div>
   <p className="text-ink-muted">Notes, budget and fees stay out unless ticked. Revoke in Settings.</p>
   <Submit text="Create link"/></form>
  {shared.shareUrl && <Link href={shared.shareUrl} className={`block break-all text-[12px] text-indigo ${inline?'absolute right-0 top-[calc(100%+4px)] z-40 w-[320px] rounded-[var(--r-lg)] border border-line bg-surface p-3 shadow-[var(--shadow-overlay)]':'px-3 pb-2.5'}`}>{shared.shareUrl}</Link>}</details>

 <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] ${inline?'':'pt-0.5'}`}>
  <form action={update}><input type="hidden" name="channelId" value={channelId}/><input type="hidden" name="refresh" value="true"/><input type="hidden" name="days" value={days}/><Quiet text="Refresh"/></form>
  <form action={retry}><input type="hidden" name="channelId" value={channelId}/><Quiet text="Retry failed"/></form>
  <PrintReport />
 </div>
 {[added,shared,updated,retried].map((s,i)=>s.message&&<p key={i} role="status" className={`text-[12px] leading-relaxed text-ink-muted ${inline?'w-full':''}`}>{s.message}</p>)}
 </div>;
}
