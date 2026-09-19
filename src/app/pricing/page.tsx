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
    'Free to analyse a channel and compare a shortlist. Paid tiers add analysis volume, saved campaigns and team access.',
};

/**
 * Pricing page.
 *
 * WHAT IS BEING SOLD CHANGED. The old tiers sold access to a directory of
 * creators who had opted in — a paywall over other people's participation,
 * which is worth nothing on the day nobody has signed up. What actually costs
 * us money is analysis: a YouTube read and thousands of comments through a
 * metered model, per channel. So the axis is analysis volume, saved campaigns,
 * reporting and team seats.
 *
 * NO NUMBERS ARE PRINTED HERE THAT WE HAVE NOT SET. Payment is not integrated
 * and the paid tiers are not priced, so this page says exactly that rather
 * than showing a figure that would be an invention. Same rule as the rest of
 * the site: no customer counts, no testimonials, no competitive claims, and
 * nothing about performance we have not measured.
 */

const PLANS = [
  {
    name: 'Analyse',
    price: 'Free',
    cadence: 'while we are in early access',
    tagline: 'For a shortlist you already have.',
    highlight: true,
    cta: { label: 'Create a campaign', href: '/campaigns/new', variant: 'primary' as const },
    features: [
      'Paste any public YouTube channel — no creator signup or approval',
      'Public read: uploads, reach, disclosed sponsorships, comment corpus',
      'One comparison table across the candidates on a campaign',
      'A written fit read against your brief, with its own confidence',
      'Your brief, notes and quoted fees stay inside your workspace',
    ],
    note: 'Analysis is metered on our side — a YouTube read plus thousands of comments through a model, per channel. Early access is free while we find out what a fair unit is.',
  },
  {
    name: 'Team',
    price: 'Not yet priced',
    cadence: 'pricing not set',
    tagline: 'For agencies running several campaigns at once.',
    cta: { label: 'Create a campaign', href: '/campaigns/new', variant: 'secondary' as const },
    features: [
      'Everything in Analyse',
      'Higher analysis volume and deeper comment reads per channel',
      'Several campaigns side by side, each with its own standard',
      'Shared workspace so a colleague sees the same shortlist',
      'Exportable candidate reports for internal approval',
    ],
    note: 'Payment is not integrated yet, so there is nothing to buy on this page. We would rather say that than print a number we have not committed to.',
  },
  {
    name: 'Creator',
    price: 'Free',
    cadence: 'always',
    tagline: 'Optional, for creators who want to add to their public read.',
    cta: { label: 'Claim my channel', href: '/join/creator', variant: 'secondary' as const },
    features: [
      'A profile at /@yourhandle that you control',
      'Your own view and engagement history',
      'A moderation queue over your comment section',
      'Approve or decline each brand individually',
      'Agency directory listing — opt-in, off by default',
    ],
    note: 'Free permanently. Nothing a buyer does requires a creator account; this adds what public data cannot reach.',
  },
];

const COMPARISON: { label: string; analyse: boolean | string; team: boolean | string; creator: boolean | string }[] = [
  { label: 'Analyse a channel nobody has signed up', analyse: true, team: true, creator: false },
  { label: 'Compare candidates on one brief', analyse: true, team: true, creator: false },
  { label: 'Written fit read per candidate', analyse: true, team: true, creator: false },
  { label: 'Analysis volume', analyse: 'Early access', team: 'Higher', creator: 'Own channel' },
  { label: 'Several campaigns at once', analyse: true, team: true, creator: false },
  { label: 'Shared workspace for a team', analyse: 'Owner only', team: true, creator: false },
  { label: 'Exportable candidate report', analyse: false, team: true, creator: false },
  { label: 'Moderation queue over your comments', analyse: false, team: false, creator: true },
  { label: 'Control who sees your locked metrics', analyse: false, team: false, creator: true },
];

const FAQ = [
  {
    q: 'Do the creators have to agree to this?',
    a: 'No, and nothing here asks them to. Everything analysed is public: uploads, view counts, the comment section, and YouTube’s own paid-placement disclosures. What we deliberately do NOT have without a creator account is their analytics — so we never state who watches, and never report a conversion.',
  },
  {
    q: 'What am I paying for, once there is something to pay for?',
    a: 'Analysis. Each channel is a YouTube read plus thousands of comments through a metered model, and that cost scales with how many candidates you compare and how deeply each is read. Not access to other people — the analysis of a public channel is shared between customers, so two agencies looking at the same creator do not pay for it twice.',
  },
  {
    q: 'Is my shortlist visible to other customers?',
    a: 'No. The channel analysis is shared; your campaign, your notes, the fee you were quoted and the read written against your brief are scoped to your workspace and enforced in the database, not in the interface.',
  },
  {
    q: 'Why is there no price on the Team tier?',
    a: 'Because we have not set one. Payment is not integrated and no checkout exists on this site. A figure here would be an invention, and this is the same page that promises we do not print figures we have not measured.',
  },
  {
    q: 'Can I get a CPM out of this?',
    a: 'Only if you enter a fee you were quoted. Nothing public reveals what a creator charges. Give us the fee and we divide it by their median views and show the arithmetic; give us none and the column stays empty.',
  },
  {
    q: 'What happens when a channel has almost no comments?',
    a: 'It says so. A candidate with a thin corpus is reported as insufficient evidence rather than as a weak fit — those are different purchases, and a dash is never rendered as a zero.',
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
            You pay for analysis, not for access to people.
          </h1>
          <p className="mt-3 max-w-[64ch] text-[13px] leading-relaxed text-ink-muted">
            Analysing a channel costs us a YouTube read and thousands of comments through a metered
            model, so that is what the tiers are about: how many candidates you compare, how deeply
            each is read, and who on your team can see it. Creators never pay. Nothing on this page
            can be bought yet — checkout is not built.
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
                  {plan.highlight ? <Badge tone="indigo">Start here</Badge> : null}
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
                    {['Analyse', 'Team', 'Creator'].map((head) => (
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
                      <td className="px-4 py-3 text-center"><Cell value={row.analyse} /></td>
                      <td className="px-4 py-3 text-center"><Cell value={row.team} /></td>
                      <td className="px-4 py-3 text-center"><Cell value={row.creator} /></td>
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
              Start with the shortlist you already have
            </h2>
            <p className="mx-auto mt-2 max-w-[52ch] text-[12px] leading-relaxed text-ink-muted">
              One brief, the channels you were sent, and a table that compares them on the same
              terms.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <Link href="/campaigns/new">
                <Button>Create a campaign</Button>
              </Link>
              <Link href="/@marahwoods">
                <Button variant="secondary">See a sample report</Button>
              </Link>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
