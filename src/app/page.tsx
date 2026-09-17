import Link from 'next/link';
import { ArrowRight, Check, Lock } from 'lucide-react';

import { SiteHeader } from '@/components/shell/SiteHeader';
import { Button } from '@/components/ui/Button';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import { DEMO_TOKENS } from '@/lib/data/fixtures';

export const dynamic = 'force-dynamic';

/**
 * Homepage. Serves both sides of the marketplace without going generic: one
 * shared problem statement up top, then explicit paths for the buyer and the
 * creator.
 *
 * Copy follows .agents/product-marketing.md — in particular the rule against
 * fabricated proof. This is pre-launch, so there are no customer counts, logos,
 * or testimonials anywhere on this page. Credibility comes from describing the
 * mechanism precisely and naming its limits.
 */

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'The creator connects their accounts',
    body: 'YouTube and Instagram, via OAuth. We read the analytics only they can see — not a scrape, not a panel estimate.',
  },
  {
    step: '02',
    title: 'We read the comment section',
    body: 'Every recent comment is clustered by intent — asking where to buy, questioning specs, pushing back on price — and scored for sentiment and brand safety.',
  },
  {
    step: '03',
    title: 'You ask. The creator approves.',
    body: 'Send a proposal free. When the creator approves, you get a time-limited link to the unblurred report and their answer on the deal.',
  },
];

const REPORT_ANSWERS = [
  ['Is this score any good?', 'Every metric carries its percentile and median against the creator’s category cohort.'],
  ['What does an outcome cost?', 'An estimated CPM and cost per thousand engaged viewers, derived from their published minimum.'],
  ['Do their sponsored posts work?', 'Paid posts measured against that creator’s own organic baseline — views and comment sentiment.'],
  ['What could go wrong?', 'Named risk flags with severity: profanity, controversy, disclosure, competitor conflict.'],
  ['Did my competitor just run?', 'Which categories they’ve already sold to, how recently, and what that means for exclusivity.'],
  ['What goes in the brief?', 'A structured do/avoid list drawn from what their audience actually responds to.'],
];

export default function HomePage() {
  const demoMode = !isSupabaseConfigured();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="relative flex-1">
        <div className="grid-rule pointer-events-none absolute inset-x-0 top-0 h-72" aria-hidden />

        {/* Above the fold: discomfort → vision → path */}
        <section className="relative mx-auto w-full max-w-shell px-5 pb-16 pt-20 sm:px-8 sm:pt-24">
          <p className="rail">Verified AI media kit &amp; collaboration hub</p>
          <h1 className="mt-4 max-w-[20ch] text-[36px] font-semibold leading-[1.08] tracking-tight text-ink sm:text-[46px]">
            A follower count won&apos;t tell you who&apos;s watching.
          </h1>
          <p className="mt-5 max-w-[60ch] text-[15px] leading-relaxed text-ink-muted">
            adfit reads a creator&apos;s own platform analytics and their comment section, then
            publishes a verified media kit: real demographics, what the audience actually asks for,
            brand-safety flags, and an estimated CPM. Locked by default — the creator decides who
            gets in.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/join/business">
              <Button size="lg">Read a creator&apos;s report</Button>
            </Link>
            <Link href="/join/creator">
              <Button size="lg" variant="secondary">
                Publish my media kit
              </Button>
            </Link>
          </div>
          <p className="tnum mt-3.5 text-[12px] text-ink-faint">
            Free for creators. Free for brands to propose. No password — we email a sign-in link.
          </p>
        </section>

        {/* Problem */}
        <section className="border-y border-line bg-surface">
          <div className="mx-auto w-full max-w-shell px-5 py-14 sm:px-8">
            <h2 className="max-w-[24ch] text-[22px] font-semibold leading-tight tracking-tight text-ink">
              A mid-size creator deal runs $15k–$50k. You approve it on a PDF.
            </h2>
            <div className="mt-8 grid gap-px bg-line sm:grid-cols-3">
              {[
                {
                  title: 'Media kits are self-reported',
                  body: 'A deck the creator made themselves, with screenshots you have no way to check. Unverifiable by construction.',
                },
                {
                  title: 'Audit tools guess from outside',
                  body: 'Scrapers catch obvious bot followers. They can’t see real demographics, and they never read the comment section.',
                },
                {
                  title: 'The mismatch shows up late',
                  body: 'You find out the audience was wrong after the invoice clears. Nobody gets fired for a bad Meta campaign — the data explains itself. Creator spend has no such defence.',
                },
              ].map((item) => (
                <div key={item.title} className="bg-surface px-5 py-5">
                  <h3 className="text-[14px] font-medium text-ink">{item.title}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* What the report answers */}
        <section className="mx-auto w-full max-w-shell px-5 py-16 sm:px-8">
          <h2 className="text-[22px] font-semibold tracking-tight text-ink">
            Six questions a media kit can&apos;t answer
          </h2>
          <p className="mt-2.5 max-w-[60ch] text-[13px] leading-relaxed text-ink-muted">
            The report is built around the things you have to defend in a budget meeting, not the
            things that are easy to screenshot.
          </p>

          <dl className="mt-8 grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
            {REPORT_ANSWERS.map(([question, answer]) => (
              <div key={question} className="bg-surface px-5 py-5">
                <dt className="text-[14px] font-medium text-ink">{question}</dt>
                <dd className="mt-2 text-[13px] leading-relaxed text-ink-muted">{answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* How it works */}
        <section className="border-y border-line bg-surface">
          <div className="mx-auto w-full max-w-shell px-5 py-14 sm:px-8">
            <h2 className="text-[22px] font-semibold tracking-tight text-ink">How it works</h2>
            <ol className="mt-8 grid gap-6 lg:grid-cols-3">
              {HOW_IT_WORKS.map((item) => (
                <li key={item.step}>
                  <span className="tnum text-[12px] text-indigo">{item.step}</span>
                  <h3 className="mt-2.5 text-[15px] font-medium tracking-tight text-ink">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">{item.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Two paths */}
        <section className="mx-auto w-full max-w-shell px-5 py-16 sm:px-8">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-panel border border-line bg-surface p-6">
              <p className="rail">For brands and agencies</p>
              <h3 className="mt-3 text-[17px] font-semibold tracking-tight text-ink">
                Know before you commit
              </h3>
              <ul className="mt-4 space-y-2.5">
                {[
                  'Open any creator link — no account needed',
                  'Send unlimited 1:1 proposals, free',
                  'Agencies: search and filter the directory, read opted-in creators instantly, brief many at once',
                ].map((point) => (
                  <li key={point} className="flex items-start gap-2.5 text-[13px] text-ink-muted">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald" aria-hidden />
                    {point}
                  </li>
                ))}
              </ul>
              <Link href="/join/business" className="mt-6 inline-block">
                <Button>Create a free workspace</Button>
              </Link>
            </div>

            <div className="rounded-panel border border-line bg-surface p-6">
              <p className="rail">For creators</p>
              <h3 className="mt-3 text-[17px] font-semibold tracking-tight text-ink">
                Get judged on your audience, not your follower count
              </h3>
              <ul className="mt-4 space-y-2.5">
                {[
                  'One link instead of emailing analytics screenshots',
                  'Sensitive metrics stay locked until you approve a brand',
                  'Agency directory is opt-in — off unless you turn it on',
                ].map((point) => (
                  <li key={point} className="flex items-start gap-2.5 text-[13px] text-ink-muted">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald" aria-hidden />
                    {point}
                  </li>
                ))}
              </ul>
              <Link href="/join/creator" className="mt-6 inline-block">
                <Button variant="secondary">Publish my media kit — free</Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Objection handling */}
        <section className="border-t border-line bg-surface">
          <div className="mx-auto w-full max-w-shell px-5 py-14 sm:px-8">
            <h2 className="text-[22px] font-semibold tracking-tight text-ink">
              What we don&apos;t claim
            </h2>
            <div className="mt-7 grid gap-px bg-line sm:grid-cols-3">
              {[
                {
                  title: 'CPM is an estimate',
                  body: 'Derived from the creator’s published minimum against their median views. It is not a rate card, and every panel that shows it says so.',
                },
                {
                  title: 'The qualitative read is model-generated',
                  body: 'Comment clustering and sentiment come from an LLM over public comments. The sample size, window, and model version ship with every report.',
                },
                {
                  title: 'Creators control their data',
                  body: 'Access is per-brand, time-limited, and revocable. If that sounds restrictive for buyers — it is the reason the 1st-party data exists at all.',
                },
              ].map((item) => (
                <div key={item.title} className="bg-surface px-5 py-5">
                  <h3 className="text-[14px] font-medium text-ink">{item.title}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto w-full max-w-shell px-5 py-16 sm:px-8">
          <div className="rounded-panel border border-line bg-indigo-wash px-6 py-10 text-center">
            <h2 className="mx-auto max-w-[24ch] text-[24px] font-semibold leading-tight tracking-tight text-ink">
              See a real report before you decide anything
            </h2>
            <p className="mx-auto mt-3 max-w-[52ch] text-[13px] leading-relaxed text-ink-muted">
              Every creator profile is public. Open one, read the teaser, and send a proposal — all
              of it free, none of it requiring an account.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link href="/@marahwoods">
                <Button size="lg">View a sample profile</Button>
              </Link>
              <Link href="/pricing">
                <Button size="lg" variant="secondary">
                  See pricing
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {demoMode ? <DemoRail /> : null}
      </main>
    </div>
  );
}

/** Fixture-mode only: a reviewer's index of every access state worth seeing. */
function DemoRail() {
  const links = [
    { href: '/@marahwoods', label: 'Public teaser', note: 'Anonymous — everything locked' },
    {
      href: `/@marahwoods?token=${DEMO_TOKENS.valid}`,
      label: 'Track A: approved token',
      note: 'Unblurred via a 1:1 grant',
    },
    {
      href: `/@marahwoods?token=${DEMO_TOKENS.expired}`,
      label: 'Track A: expired link',
      note: 'Named as expired, not a generic lock',
    },
    {
      href: `/@marahwoods?token=${DEMO_TOKENS.invalid}`,
      label: 'Track A: invalid link',
      note: 'Unknown or revoked token',
    },
    { href: '/@quietcircuit', label: 'Directory opt-out', note: 'Pro gets no instant access here' },
    {
      href: `/@fernpress?token=${DEMO_TOKENS.valid}`,
      label: 'Low-traction creator',
      note: '121 comments, never sponsored — report says so instead of guessing',
    },
    {
      href: `/@northvane?token=${DEMO_TOKENS.valid}`,
      label: 'Comments disabled',
      note: 'Zero comments — unmeasured, not zero-rated',
    },
    {
      href: `/@jooshica?token=${DEMO_TOKENS.valid}`,
      label: 'Real channel, public data only',
      note: '2.91M subs read from YouTube; no OAuth, no API key',
    },
    { href: '/directory', label: 'Track B: directory', note: 'Switch role to Pro agency above' },
    { href: '/dashboard/requests', label: 'Creator inbox', note: 'Switch role to Creator above' },
    { href: '/join', label: 'Registration', note: 'Creator and business sign-up' },
  ];

  return (
    <section className="mx-auto w-full max-w-shell px-5 pb-16 sm:px-8">
      <div className="rounded-panel border border-line bg-surface">
        <header className="flex items-center gap-2 border-b border-line px-5 py-3">
          <Lock className="h-3 w-3 text-ink-faint" aria-hidden />
          <h2 className="rail">Running on fixtures — no Supabase project configured</h2>
        </header>
        <ul className="grid sm:grid-cols-2">
          {links.map((link, index) => (
            <li key={link.href} className={index % 2 === 0 ? 'border-line sm:border-r' : undefined}>
              <Link
                href={link.href}
                className="group flex items-center justify-between gap-3 border-b border-line px-5 py-3.5 transition-colors hover:bg-paper"
              >
                <span>
                  <span className="block text-[13px] text-ink">{link.label}</span>
                  <span className="block text-[11px] text-ink-faint">{link.note}</span>
                </span>
                <ArrowRight
                  className="h-3.5 w-3.5 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
