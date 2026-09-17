import Link from 'next/link';

import { getViewer } from '@/lib/access/viewer';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/Badge';
import { DemoRoleSwitcher } from './DemoRoleSwitcher';

/**
 * Thin top rule. Always shows which of the access modes the page is rendering
 * under, so an entitlement bug is visible rather than silent.
 */
export async function SiteHeader() {
  const viewer = await getViewer();
  const demoMode = !isSupabaseConfigured();
  const signedIn = viewer.userId !== null;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-shell items-center gap-4 px-5 py-3 sm:px-8">
        <Link href="/" className="tnum text-[13px] font-semibold tracking-tight text-ink">
          adfit
        </Link>

        <nav className="flex items-center gap-1 text-[12px]">
          <NavLink href="/directory">Directory</NavLink>
          <NavLink href="/pricing">Pricing</NavLink>
          {viewer.creatorId ? (
            <>
              <NavLink href="/dashboard/requests">Requests</NavLink>
              <NavLink href="/dashboard/offers">Offers</NavLink>
            </>
          ) : null}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          {viewer.organization ? (
            <Badge tone={viewer.isProAgency ? 'indigo' : 'slate'}>
              {viewer.organization.name} · {viewer.isProAgency ? 'Pro Agency' : 'Free'}
            </Badge>
          ) : null}

          {demoMode ? <DemoRoleSwitcher /> : null}

          {signedIn ? (
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-md px-2.5 py-1.5 text-[12px] text-ink-muted transition-colors hover:bg-paper hover:text-ink"
              >
                Sign out
              </button>
            </form>
          ) : (
            <>
              <NavLink href="/signin">Sign in</NavLink>
              <Link
                href="/join"
                className="rounded-md bg-indigo px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-indigo-hover"
              >
                Create account
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md px-2.5 py-1.5 text-[12px] text-ink-muted transition-colors hover:bg-paper hover:text-ink"
    >
      {children}
    </Link>
  );
}
