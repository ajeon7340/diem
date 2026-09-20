import Link from 'next/link';
import { AudioLines } from 'lucide-react';
import { WorkspaceNav } from './WorkspaceNav';

import { getViewer } from '@/lib/access/viewer';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/Badge';
import { DemoRoleSwitcher } from './DemoRoleSwitcher';

/**
 * Thin top rule. Always shows which of the access modes the page is rendering
 * under, so an entitlement bug is visible rather than silent.
 *
 * One nav now, because there is one kind of visitor. It used to fork on
 * `viewer.creatorId` and serve a creator their own six pages; that half of the
 * product is gone, and with it the only reason this component needed to know
 * who was asking beyond which organisation they belong to.
 */
export async function SiteHeader() {
  const viewer = await getViewer();
  const demoMode = !isSupabaseConfigured();
  const signedIn = viewer.userId !== null;

  return (
    <header className="print:hidden sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-4 px-5 py-4 sm:px-8">
        <Link href="/" aria-label="adfit home" className="mr-5 flex items-center gap-2.5 text-xl font-semibold tracking-tight text-ink">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo text-white"><AudioLines size={20} aria-hidden /></span>
          adfit<span className="text-indigo">.</span>
        </Link>
        <WorkspaceNav />

        <div className="ml-auto flex items-center gap-2.5">
          {viewer.organization ? (
            <span className="hidden sm:inline"><Badge tone={viewer.isProAgency ? 'indigo' : 'slate'}>
              {viewer.organization.name} · {viewer.isProAgency ? 'Pro Agency' : 'Free'}
            </Badge></span>
          ) : null}

          {demoMode ? <span className="hidden sm:inline"><DemoRoleSwitcher /></span> : null}

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
                href="/channels"
                className="rounded-md bg-indigo px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-indigo-hover"
              >
                New channel analysis
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
