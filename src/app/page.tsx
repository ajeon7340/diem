import Link from 'next/link';
import { SiteHeader } from '@/components/shell/SiteHeader';
export default function Home() {
 return <><SiteHeader /><main className="mx-auto max-w-3xl px-6 py-24">
 <p className="rail">For brands and agencies · YouTube</p>
 <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">Evaluate YouTube creators before reaching out.</h1>
 <p className="mt-6 max-w-xl text-lg text-ink-muted">Review recent content, public performance and sponsorship evidence. Build a shortlist around your campaign, with the sources and unknowns in view.</p>
 <form action="/channels" className="mt-9 flex flex-col gap-3 sm:flex-row"><label className="flex-1"><span className="sr-only">YouTube channel URL or @handle</span><input name="channel" required maxLength={200} placeholder="YouTube channel URL or @handle" className="w-full rounded-md border bg-surface p-3" /></label><button className="rounded-md bg-indigo px-5 py-3 text-white">Analyze channel</button></form>
 <Link href="/channels/sample" className="mt-5 inline-block text-indigo">View sample report</Link>
 <p className="mt-10 text-sm text-ink-muted">Public data from official YouTube APIs. Creators do not need to register, approve access or connect an account.</p>
 </main></>;
}
