import Link from 'next/link';

import { getViewer } from '@/lib/access/viewer';
import { getCreatorHandle } from '@/lib/data/requests';
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
  // The creator's own media kit is where everything about them actually is,
  // and nothing in the header linked it — so the only way to reach your own
  // profile was to remember your handle and type it.
  const ownHandle = viewer.creatorId ? await getCreatorHandle(viewer.creatorId) : null;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-shell items-center gap-4 px-5 py-3 sm:px-8">
        <Link href="/" className="tnum text-[13px] font-semibold tracking-tight text-ink">
          adfit
        </Link>

        <nav className="flex items-center gap-1 text-[12px]">
          <NavLink href="/directory">Directory</NavLink>
          {/* Pricing sells the agency plan. A signed-in creator is not the
              buyer, and the slot is better spent on their own pages. */}
          {viewer.creatorId ? null : <NavLink href="/pricing">Pricing</NavLink>}
          {/* One link per destination, across BOTH navs.
              Listing Studio, Requests and Offers here as well as in the
              dashboard tabs put the same four items on screen twice on every
              dashboard page — my own over-correction for the opposite problem,
              which was that none of them were reachable at all.
              The split that holds: the header carries where you are in the
              PRODUCT (the directory, your public page, your workspace); the
              tabs carry where you are inside the workspace. The media kit is
              the one creator surface that is not a dashboard section — it is
              the public page this whole thing produces — so it belongs here
              and not there. */}
          {viewer.creatorId ? (
            <>
              {ownHandle ? <NavLink href={`/@${ownHandle}`}>My media kit</NavLink> : null}
              <NavLink href="/dashboard">Dashboard</NavLink>
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
