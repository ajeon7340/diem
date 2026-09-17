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
  width?: 'narrow' | 'wide';
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="relative flex-1">
        <div className="grid-rule pointer-events-none absolute inset-x-0 top-0 h-48" aria-hidden />

        <div
          className={`relative mx-auto w-full px-5 py-14 sm:px-8 ${
            width === 'wide' ? 'max-w-shell' : 'max-w-[460px]'
          }`}
        >
          <p className="rail">{eyebrow}</p>
          <h1 className="mt-2.5 text-[24px] font-semibold leading-tight tracking-tight text-ink">
            {title}
          </h1>
          {intro ? (
            <p className="mt-2.5 text-[13px] leading-relaxed text-ink-muted">{intro}</p>
          ) : null}

          <div className="mt-8 rounded-panel border border-line bg-surface p-6">{children}</div>

          {aside}

          <div className="mt-6 text-[12px] text-ink-muted">
            {footer ?? (
              <>
                Already have an account?{' '}
                <Link href="/signin" className="text-indigo underline-offset-4 hover:underline">
                  Sign in
                </Link>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
