import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Check, CirclePlay, FileChartColumn, ListFilter, Search } from 'lucide-react';
import { SiteHeader } from '@/components/shell/SiteHeader';

export default function Home() {
  return <><SiteHeader /><main className="workspace-page">
    <section className="grid items-center gap-12 py-8 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:py-16">
      <div>
        <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted"><CirclePlay size={16} className="text-rose" aria-hidden /> Creator research, built for YouTube</p>
        <h1 className="max-w-[13ch] text-5xl font-semibold leading-[1.08] tracking-[-0.045em] sm:text-6xl">The right creator.<br /><span className="text-indigo">A clearer decision.</span></h1>
        <p className="mt-6 max-w-lg text-base leading-7 text-ink-muted">Go beyond the subscriber count. Review content, public performance and collaboration evidence before you reach out.</p>
        <form action="/channels" className="mt-8 rounded-2xl border border-line bg-surface p-2 shadow-sm">
          <label className="flex items-center gap-3 px-3"><Search size={19} className="shrink-0 text-ink-faint" aria-hidden /><span className="sr-only">YouTube channel URL or @handle</span><input name="channel" required maxLength={200} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="YouTube channel URL or @handle" className="min-w-0 flex-1 bg-transparent py-4 text-sm" /></label>
          <button className="primary-action w-full">Analyze a channel <ArrowRight size={16} aria-hidden /></button>
        </form>
        <p className="mt-4 flex items-center gap-2 text-xs text-ink-muted"><Check size={14} aria-hidden /> No creator signup or account connection needed.</p>
      </div>
      <div className="surface-card overflow-hidden shadow-[0_16px_60px_-30px_rgba(45,40,100,0.25)]">
        <div className="flex items-center justify-between border-b px-6 py-4"><span className="text-sm font-medium">Inside a creator report</span><span className="rounded-full bg-indigo-wash px-2.5 py-1 text-[11px] font-medium text-indigo">Report preview</span></div>
        <div className="p-6 sm:p-8">
          <div className="mb-7 flex items-center gap-4"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-wash text-indigo"><FileChartColumn size={27} aria-hidden /></div><div><h2 className="text-xl font-semibold tracking-tight">Evidence before outreach</h2><p className="mt-1 text-sm text-ink-muted">One report. A fuller picture.</p></div></div>
          {[
            ['01', 'Content & performance', 'See what they publish and how recent videos perform.'],
            ['02', 'Collaboration evidence', 'Review disclosed promotions and supporting videos.'],
            ['03', 'Questions worth asking', 'Keep missing information and next steps in view.'],
          ].map(([n,title,description])=><div key={n} className="flex gap-4 border-t py-5"><span className="tnum mt-1 text-xs text-indigo">{n}</span><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1.5 text-sm leading-6 text-ink-muted">{description}</p></div></div>)}
          <Link href="/channels/sample" className="mt-2 flex items-center justify-between rounded-xl bg-paper px-4 py-3 text-sm font-medium">Explore a sample report<ArrowUpRight size={17} aria-hidden /></Link>
          <p className="mt-3 text-xs leading-5 text-ink-muted">The sample uses a fictional channel and illustrative data.</p>
        </div>
      </div>
    </section>
    <section className="mt-8 border-t pt-9 pb-8"><p className="rail mb-6">From first look to shortlist</p><div className="grid gap-8 sm:grid-cols-3">{[
      {icon:Search,title:'Start with a channel',text:'Bring a creator you are considering. Review the public evidence in one place.'},
      {icon:FileChartColumn,title:'Understand the details',text:'Inspect sources, recent performance and the limits of what is known.'},
      {icon:ListFilter,title:'Build your shortlist',text:'Save candidates to a campaign and keep your brief and decisions together.'},
    ].map(({icon:Icon,title,text})=><div key={title}><Icon size={21} className="mb-4 text-indigo" aria-hidden /><h2 className="text-base font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-ink-muted">{text}</p></div>)}</div></section>
  </main></>;
}
