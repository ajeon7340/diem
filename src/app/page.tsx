import Link from 'next/link';
import { SiteHeader } from '@/components/shell/SiteHeader';
export default function Home() {
 return <><SiteHeader /><main className="mx-auto max-w-3xl px-6 py-24">
 <p className="rail">For brands and agencies · YouTube</p>
 <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">Evaluate YouTube creators before reaching out.</h1>
 <p className="mt-6 max-w-xl text-lg text-ink-muted">Review recent content, public performance and sponsorship evidence. Build a shortlist around your campaign, with the sources and unknowns in view.</p>
 <form action="/channels" className="mt-9 flex flex-col gap-3 sm:flex-row"><label className="flex-1"><span className="sr-only">YouTube channel URL or @handle</span><input id="channel" name="channel" required maxLength={200} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="YouTube channel URL or @handle" className="w-full rounded-md border bg-surface p-3" /></label><button className="rounded-md bg-indigo px-5 py-3 text-white">Analyze channel</button></form>
 <p className="mt-5 text-sm"><Link href="/channels/sample" className="text-indigo underline-offset-4 hover:underline">View sample report</Link>{' '}
 {/* Said here, not only on the sample page itself. Somebody deciding whether
     to click needs to know it is a fixture before they read a figure and
     remember it as something we measured about a real creator. */}
 <span className="text-ink-muted">— a fictional channel with illustrative data, not a real creator.</span></p>
 <p className="mt-10 text-sm text-ink-muted">Public data from official YouTube APIs. Creators do not need to register, approve access or connect an account.</p>
 </main></>;
}
