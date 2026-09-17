import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, Minus } from 'lucide-react';

import { SiteHeader } from '@/components/shell/SiteHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Free for creators, free for brands to propose. Pro Agency adds directory search, instant access to opted-in creators, and bulk briefs.',
};

/**
 * Pricing page. Its job is to answer "which one is me?" fast, so the plans are
 * ordered by who the reader is rather than by price, and the recommended plan
 * is the free one for most visitors — the paid tier only makes sense above a
 * throughput threshold, and saying so converts better than pushing it.
 *
 * Copy follows .agents/product-marketing.md. No invented customer counts or
 * testimonials: this is pre-launch.
 */

const PLANS = [
  {
    name: 'Creator',
    price: 'Free',
    cadence: 'always',
    tagline: 'For anyone publishing a media kit.',
    cta: { label: 'Publish my media kit', href: '/join/creator', variant: 'secondary' as const },
    features: [
      'Verified profile at /@yourhandle',
      'YouTube and Instagram connection',
      'Full AI ad-fit report on your own audience',
      'Approve or decline every brand individually',
      'Time-limited, revocable access links',
      'Optional agency directory listing',
    ],
    note: 'Free permanently. Creators are the supply side — charging them would be charging the wrong half of the marketplace.',
  },
  {
    name: 'Brand',
    price: 'Free',
    cadence: 'no account required to read',
    tagline: 'For in-house teams running a handful of creators.',
    highlight: true,
    cta: { label: 'Create a free workspace', href: '/join/business', variant: 'primary' as const },
    features: [
      'Open any creator link — no account needed',
      'Unlimited 1:1 proposals',
      'Full report on every creator who approves you',
      'Time-limited access links by email',
      'Workspace for your team’s proposal history',
    ],
    note: 'If you evaluate creators one at a time and already know who you’re considering, this is the whole product. Most teams never need more.',
  },
  {
    name: 'Pro Agency',
    price: 'Paid',
    cadence: 'per workspace',
    tagline: 'For agencies evaluating creators at volume.',
    cta: { label: 'Talk to us', href: '/join/business', variant: 'secondary' as const },
    features: [
      'Everything in Brand',
      'Directory search across opted-in creators',
      'Filter by purchase intent, ad fatigue, demographics, CPM ceiling',
      'Instant unlocked reports — no per-creator approval wait',
      'Bulk briefs to up to 100 creators at once',
    ],
    note: 'Worth it above roughly ten creator evaluations a quarter, when waiting on individual approvals becomes the bottleneck.',
  },
];

const COMPARISON: { label: string; creator: boolean | string; brand: boolean | string; pro: boolean | string }[] = [
  { label: 'Read a public creator teaser', creator: true, brand: true, pro: true },
  { label: 'Send 1:1 proposals', creator: false, brand: 'Unlimited', pro: 'Unlimited' },
  { label: 'Full report after creator approval', creator: 'Own only', brand: true, pro: true },
  { label: 'Directory search and filters', creator: false, brand: false, pro: true },
  { label: 'Instant access to opted-in creators', creator: false, brand: false, pro: true },
  { label: 'Bulk campaign briefs', creator: false, brand: false, pro: 'Up to 100' },
  { label: 'Connect YouTube / Instagram', creator: true, brand: false, pro: false },
  { label: 'Control who sees your metrics', creator: true, brand: false, pro: false },
];

const FAQ = [
  {
    q: 'Why is it free for brands?',
    a: 'The 1:1 funnel is how creators get value from being here — a brand that can’t reach them is worth nothing to them. We charge for volume and speed, not for access.',
  },
  {
    q: 'What stops a creator from inflating their own numbers?',
    a: 'They never touch them. Demographics come from OAuth-authorised platform analytics, and the qualitative scores are written by our pipeline. A creator can edit their bio and their minimum budget. They cannot edit a metric, and they cannot award themselves the verified badge.',
  },
  {
    q: 'Do I need Pro to read a specific creator I already know?',
    a: 'No. Open their link, send a proposal, and read the full report once they approve. Pro exists for discovery and throughput, not to paywall individual creators.',
  },
  {
    q: 'Can a creator hide from agencies?',
    a: 'Yes, and that’s the default. Directory listing is opt-in. A creator who leaves it off stays reachable by direct link and approves every brand one at a time.',
  },
  {
    q: 'What happens when an access link expires?',
    a: 'The report re-locks. Links are time-limited by design — the page tells the holder it expired rather than pretending it never existed, and you can request a fresh one.',
  },
];

function Cell({ value }: { value: boolean | string }) {
  if (value === true) return <Check className="mx-auto h-3.5 w-3.5 text-emerald" aria-label="Included" />;
  if (value === false) return <Minus className="mx-auto h-3.5 w-3.5 text-ink-faint" aria-label="Not included" />;
  return <span className="tnum text-[12px] text-ink">{value}</span>;
}

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="relative flex-1">
        <div className="grid-rule pointer-events-none absolute inset-x-0 top-0 h-48" aria-hidden />

        <div className="relative mx-auto w-full max-w-shell px-5 py-14 sm:px-8">
          <p className="rail">Pricing</p>
          <h1 className="mt-2.5 max-w-[22ch] text-[28px] font-semibold leading-tight tracking-tight text-ink">
            Free unless you&apos;re doing this at volume.
          </h1>
          <p className="mt-3 max-w-[60ch] text-[13px] leading-relaxed text-ink-muted">
            Creators never pay. Brands never pay to evaluate a creator they already know. The paid
            tier is for agencies who need to find creators rather than look them up.
          </p>

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={cn(
                  'flex flex-col rounded-panel border bg-surface p-6',
                  plan.highlight ? 'border-indigo' : 'border-line',
                )}
              >
                <div className="flex items-center gap-2.5">
                  <h2 className="text-[15px] font-semibold tracking-tight text-ink">{plan.name}</h2>
                  {plan.highlight ? <Badge tone="indigo">Most teams</Badge> : null}
                </div>
                <p className="mt-1.5 text-[12px] text-ink-muted">{plan.tagline}</p>

                <div className="mt-5 flex items-baseline gap-2">
                  <span className="tnum text-[28px] font-medium leading-none tracking-tight text-ink">
                    {plan.price}
                  </span>
                  <span className="text-[11px] text-ink-faint">{plan.cadence}</span>
                </div>

                <ul className="mt-5 flex-1 space-y-2.5 border-t border-line pt-5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-[12px] text-ink-muted">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald" aria-hidden />
                      {feature}
                    </li>
                  ))}
                </ul>

                <p className="mt-5 border-t border-line pt-4 text-[11px] leading-relaxed text-ink-faint">
                  {plan.note}
                </p>

                <Link href={plan.cta.href} className="mt-5">
                  <Button size="lg" variant={plan.cta.variant} className="w-full">
                    {plan.cta.label}
                  </Button>
                </Link>
              </div>
            ))}
          </div>

          <section className="mt-14">
            <h2 className="text-[18px] font-semibold tracking-tight text-ink">Side by side</h2>
            <div className="mt-5 overflow-x-auto rounded-panel border border-line bg-surface">
              <table className="w-full min-w-[620px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="rail px-5 py-3">Capability</th>
                    {['Creator', 'Brand', 'Pro Agency'].map((head) => (
                      <th key={head} scope="col" className="rail px-4 py-3 text-center">{head}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map((row) => (
                    <tr key={row.label} className="border-b border-line last:border-b-0">
                      <th scope="row" className="px-5 py-3 text-[13px] font-normal text-ink-muted">
                        {row.label}
                      </th>
                      <td className="px-4 py-3 text-center"><Cell value={row.creator} /></td>
                      <td className="px-4 py-3 text-center"><Cell value={row.brand} /></td>
                      <td className="px-4 py-3 text-center"><Cell value={row.pro} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-14">
            <h2 className="text-[18px] font-semibold tracking-tight text-ink">
              Questions worth asking
            </h2>
            <dl className="mt-5 grid gap-px bg-line sm:grid-cols-2">
              {FAQ.map((item) => (
                <div key={item.q} className="bg-surface px-5 py-5">
                  <dt className="text-[13px] font-medium text-ink">{item.q}</dt>
                  <dd className="mt-2 text-[12px] leading-relaxed text-ink-muted">{item.a}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="mt-12 rounded-panel border border-line bg-paper px-6 py-8 text-center">
            <h2 className="text-[17px] font-semibold tracking-tight text-ink">
              Start with a real profile
            </h2>
            <p className="mx-auto mt-2 max-w-[48ch] text-[12px] leading-relaxed text-ink-muted">
              Read a teaser, send a proposal, decide later whether you need the directory.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <Link href="/@marahwoods">
                <Button>View a sample profile</Button>
              </Link>
              <Link href="/join/business">
                <Button variant="secondary">Create a free workspace</Button>
              </Link>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
