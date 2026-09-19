import Link from 'next/link';
import { ArrowRight, Check, Lock } from 'lucide-react';

import { SiteHeader } from '@/components/shell/SiteHeader';
import { Button } from '@/components/ui/Button';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import { DEMO_TOKENS } from '@/lib/data/fixtures';

export const dynamic = 'force-dynamic';

/**
 * Homepage.
 *
 * WHO THIS IS FOR CHANGED. The page used to open on a two-sided marketplace —
 * a creator publishes a media kit, a brand asks for access, the creator
 * approves. Every one of those steps is a person who has to show up before the
 * buyer gets an answer, and the buyer is the one with the budget.
 *
 * So the required path is now: brief in, public channels in, comparison out.
 * No creator signup, no approval, no OAuth. The creator side still exists and
 * still works — it is linked below rather than removed — but it is no longer
 * standing between a customer and the thing they came for.
 *
 * Copy follows .agents/product-marketing.md, in particular the rule against
 * fabricated proof: no customer counts, no logos, no testimonials, no
 * performance or competitive claims. Credibility here is the mechanism stated
 * precisely and its limits named in the same breath.
 */

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Describe the campaign once',
    body: 'Brand, product, who you sell to, what you will not sit beside, budget. This becomes the single standard every candidate is compared against.',
  },
  {
    step: '02',
    title: 'Paste the channels you are weighing',
    body: 'Any public YouTube channel — a URL or a handle. Nobody has to sign up, approve you, or connect an account, so a shortlist you were sent this morning can be read this morning.',
  },
  {
    step: '03',
    title: 'Compare them on one table',
    body: 'Output and reach, what the comment section actually talks about, disclosed sponsorships, and a written read of each channel against your brief — with what it could not determine said out loud.',
  },
];

const REPORT_ANSWERS = [
  ['Does this channel make what we sell?', 'Topic overlap read from their uploads and from what their commenters bring up, not from a category tag somebody typed.'],
  ['What do their comments actually say?', 'Comments clustered by what they are about and what they are doing — asking where to buy, questioning a claim, pushing back. Always with the number of comments read.'],
  ['Have they run ads before?', 'Uploads carrying YouTube’s own paid-placement disclosure, kept separate from ones we merely infer are commercial.'],
  ['What could go wrong beside this ad?', 'Named findings from the comment corpus with the count they came from — and an explicit “nothing found in what was scanned” when that is the answer.'],
  ['What does it cost per thousand views?', 'Only when you enter a fee you were quoted: your figure divided by their median views. The arithmetic is shown; we never estimate a fee.'],
  ['What could we not determine?', 'Every report states its own confidence. A channel with 40 readable comments is an unknown, not a weak candidate, and those are different purchases.'],
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
          <p className="rail">Creator analysis for advertisers and agencies</p>
          <h1 className="mt-4 max-w-[20ch] text-[36px] font-semibold leading-[1.08] tracking-tight text-ink sm:text-[46px]">
            Compare every creator on your shortlist against one standard.
          </h1>
          <p className="mt-5 max-w-[62ch] text-[15px] leading-relaxed text-ink-muted">
            Describe the campaign, paste the YouTube channels you are considering, and get each one
            read against that brief — output and reach, what their comment section is actually
            about, disclosed sponsorships, and where the evidence runs out. No creator signup, no
            approval, no account linking.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/campaigns/new">
              <Button size="lg">Create a campaign</Button>
            </Link>
            <Link href="/campaigns">
              <Button size="lg" variant="secondary">
                Analyse a channel
              </Button>
            </Link>
          </div>
          <p className="tnum mt-3.5 text-[12px] text-ink-faint">
            Public YouTube data only. No password — we email a sign-in link.
          </p>
        </section>

        {/* Problem */}
        <section className="border-y border-line bg-surface">
          <div className="mx-auto w-full max-w-shell px-5 py-14 sm:px-8">
            <h2 className="max-w-[24ch] text-[22px] font-semibold leading-tight tracking-tight text-ink">
              You are asked to approve a creator deal on a deck the creator made.
            </h2>
            <div className="mt-8 grid gap-px bg-line sm:grid-cols-3">
              {[
                {
                  title: 'Media kits are self-reported',
                  body: 'Screenshots you have no way to check, in a format that differs per creator — so twelve candidates are twelve incomparable documents.',
                },
                {
                  title: 'Waiting on the creator blocks the decision',
                  body: 'Asking each one to sign up and connect an account puts your shortlist behind twelve other people’s inboxes. Public data does not need their permission.',
                },
                {
                  title: 'Nobody reads the comment section',
                  body: 'It is the one public thing that says what an audience brings up unprompted — and at a few thousand comments per channel it is not something a human reads across a shortlist.',
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
          <p className="mt-2.5 max-w-[64ch] text-[13px] leading-relaxed text-ink-muted">
            Built around what you have to defend in an approval meeting — and around saying which
            of it we could not measure, because a report that hides that is the one that loses an
            argument later.
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
              <p className="rail">For advertisers and agencies</p>
              <h3 className="mt-3 text-[17px] font-semibold tracking-tight text-ink">
                Decide without waiting on anybody
              </h3>
              <ul className="mt-4 space-y-2.5">
                {[
                  'Paste any public YouTube channel — no signup, approval or OAuth on their side',
                  'One comparison table across the whole shortlist, on your own brief',
                  'Your brief, your notes and the fees you were quoted stay inside your workspace',
                ].map((point) => (
                  <li key={point} className="flex items-start gap-2.5 text-[13px] text-ink-muted">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald" aria-hidden />
                    {point}
                  </li>
                ))}
              </ul>
              <Link href="/campaigns/new" className="mt-6 inline-block">
                <Button>Create a campaign</Button>
              </Link>
            </div>

            <div className="rounded-panel border border-line bg-surface p-6">
              {/* Still here, and still working. A creator account adds the
                  things public data cannot reach — their own analytics, their
                  moderation queue, a media kit they control — but nothing a
                  buyer does now depends on one existing. */}
              <p className="rail">For creators — optional</p>
              <h3 className="mt-3 text-[17px] font-semibold tracking-tight text-ink">
                Claim your channel and add what the public cannot see
              </h3>
              <ul className="mt-4 space-y-2.5">
                {[
                  'Buyers can already read your public channel here; an account is how you add to it',
                  'Your own view and engagement history, and a moderation queue over your comments',
                  'The agency directory is opt-in — off unless you turn it on',
                ].map((point) => (
                  <li key={point} className="flex items-start gap-2.5 text-[13px] text-ink-muted">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald" aria-hidden />
                    {point}
                  </li>
                ))}
              </ul>
              <Link href="/join/creator" className="mt-6 inline-block">
                <Button variant="secondary">Claim my channel — free</Button>
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
                  title: 'We never say who is watching',
                  body: 'Age, gender and location are not knowable from public data, and we do not estimate them. Comment figures describe the people who commented — a small, self-selected slice of an audience — and are labelled that way everywhere they appear.',
                },
                {
                  title: 'Nothing here measures conversion',
                  body: 'A comment asking where to buy something is interest expressed in a comment. It is not a purchase, not a sales prediction, and never rendered as a conversion rate.',
                },
                {
                  title: 'A CPM needs a fee you were quoted',
                  body: 'Nothing public reveals what a creator charges. Enter a fee and we divide it by their median views and show the arithmetic; enter none and the column stays empty rather than inventing one.',
                },
                {
                  title: 'Sponsorship is reported, not inferred as cause',
                  body: 'A video is called sponsored when YouTube’s own disclosure says so. A difference in views on those uploads is an observation about them, not a measured effect of sponsorship.',
                },
                {
                  title: 'The qualitative read is model-generated',
                  body: 'Clustering, sentiment and the written fit come from a model over public comments. The corpus size, the window and the model version ship with every report, and the read states its own confidence.',
                },
                {
                  title: 'Absence is shown as absence',
                  body: 'A pass that has not run shows a dash, not a zero. “Not scanned” and “nothing found” are different results and are never printed the same way.',
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
              Start with the shortlist you already have
            </h2>
            <p className="mx-auto mt-3 max-w-[56ch] text-[13px] leading-relaxed text-ink-muted">
              One brief, the channels you were sent, and a table that compares them on the same
              terms. The public figures land in seconds; the comment read follows.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link href="/campaigns/new">
                <Button size="lg">Create a campaign</Button>
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
