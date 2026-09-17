import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Building2, Video } from 'lucide-react';

import { SiteHeader } from '@/components/shell/SiteHeader';

export const metadata: Metadata = {
  title: 'Create an account',
  description: 'Register as a creator to publish a verified media kit, or as a brand to reach them.',
};

const PATHS = [
  {
    href: '/join/creator',
    icon: Video,
    eyebrow: 'Influencer',
    title: 'Publish a verified media kit',
    body: 'Connect YouTube or Instagram once. We verify the numbers only you can see, read your comment section, and give you one link to send every brand — instead of emailing screenshots.',
    points: [
      'Free, and free forever for creators',
      'You approve every brand individually',
      'Sensitive metrics stay locked until you say otherwise',
    ],
  },
  {
    href: '/join/business',
    icon: Building2,
    eyebrow: 'Brand or agency',
    title: 'Find and brief verified creators',
    body: 'Read a creator’s real demographics and comment intent before you commit budget. Proposals are free and need no account; agencies can subscribe for directory search and bulk briefs.',
    points: [
      'Unlimited 1:1 proposals on the free plan',
      'No account needed to view a creator link',
      'Pro Agency adds search, filters, and bulk outreach',
    ],
  },
];

export default function JoinPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="relative flex-1">
        <div className="grid-rule pointer-events-none absolute inset-x-0 top-0 h-48" aria-hidden />

        <div className="relative mx-auto w-full max-w-shell px-5 py-14 sm:px-8">
          <p className="rail">Create an account</p>
          <h1 className="mt-2.5 text-[26px] font-semibold tracking-tight text-ink">
            Which side of the table are you on?
          </h1>
          <p className="mt-2.5 max-w-[62ch] text-[13px] leading-relaxed text-ink-muted">
            Both take about a minute and neither needs a password.
          </p>

          <div className="mt-9 grid gap-4 lg:grid-cols-2">
            {PATHS.map((path) => (
              <Link
                key={path.href}
                href={path.href}
                className="group flex flex-col rounded-panel border border-line bg-surface p-6 transition-colors hover:border-indigo/40"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-paper">
                    <path.icon className="h-4 w-4 text-indigo" aria-hidden />
                  </span>
                  <span className="rail">{path.eyebrow}</span>
                </div>

                <h2 className="mt-4 text-[16px] font-semibold tracking-tight text-ink">
                  {path.title}
                </h2>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">{path.body}</p>

                <ul className="mt-5 space-y-2 border-t border-line pt-4">
                  {path.points.map((point) => (
                    <li key={point} className="flex items-start gap-2 text-[12px] text-ink-muted">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-indigo" aria-hidden />
                      {point}
                    </li>
                  ))}
                </ul>

                <span className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-indigo">
                  Continue
                  <ArrowRight
                    className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </span>
              </Link>
            ))}
          </div>

          <p className="mt-8 text-[12px] text-ink-muted">
            Already have an account?{' '}
            <Link href="/signin" className="text-indigo underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
