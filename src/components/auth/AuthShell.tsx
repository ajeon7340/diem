import Link from 'next/link';
import type { ReactNode } from 'react';

import { SiteHeader } from '@/components/shell/SiteHeader';

/** Shared frame for every register / sign-in / onboarding screen. */
export function AuthShell({
  eyebrow,
  title,
  intro,
  children,
  aside,
  footer,
  width = 'narrow',
}: {
  eyebrow: string;
  title: string;
  intro?: string;
  children: ReactNode;
  aside?: ReactNode;
  footer?: ReactNode;
  width?: 'narrow' | 'form' | 'wide';
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="relative flex-1">
        <div className="grid-rule pointer-events-none absolute inset-x-0 top-0 h-48" aria-hidden />

        <div
          className={`relative mx-auto w-full px-5 py-6 sm:px-8 sm:py-8 ${
            // 'form' is for a screen that must not scroll: wide enough that the
            // paired fields actually sit side by side rather than wrapping into
            // twice the rows, which is what pushed creator signup off one page.
            width === 'wide' ? 'max-w-shell' : width === 'form' ? 'max-w-[680px]' : 'max-w-[460px]'
          }`}
        >
          <p className="rail">{eyebrow}</p>
          <h1 className="mt-2 text-[21px] font-semibold leading-tight tracking-tight text-ink sm:text-[24px]">
            {title}
          </h1>
          {intro ? (
            <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">{intro}</p>
          ) : null}

          <div className="mt-5 rounded-panel border border-line bg-surface p-5">{children}</div>

          {aside}

          {/* `footer ?? default` rendered the default for `footer={null}` as
              well as for an omitted one, so every onboarding screen showed
              "Already have an account? Sign in" to somebody who was signed in
              and half way through signing up. Explicit null now means none. */}
          {footer === undefined ? (
            <div className="mt-4 text-[12px] text-ink-muted">
              Already have an account?{' '}
              <Link href="/signin" className="text-indigo underline-offset-4 hover:underline">
                Sign in
              </Link>
            </div>
          ) : footer ? (
            <div className="mt-4 text-[12px] text-ink-muted">{footer}</div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
