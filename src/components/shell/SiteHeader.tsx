import Link from 'next/link';

import { getViewer } from '@/lib/access/viewer';
import { getCreatorHandle } from '@/lib/data/requests';
import { CREATOR_NAV } from '@/lib/nav';
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

        <nav className="-mx-1 flex min-w-0 items-center gap-1 overflow-x-auto px-1 text-[12px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* A creator gets every one of their own pages here and no
              directory: the directory is where a brand shops for creators, and
              they are not shopping. Everyone else gets the public nav.

              TEMPORARY SHAPE. Everything is in one bar on purpose — it is the
              honest version while there are few enough sections to fit. When
              this stops fitting, the split to make is workspace-vs-public, not
              a second copy of the same links (see CREATOR_NAV). */}
          {viewer.creatorId ? (
            <>
              {ownHandle ? <NavLink href={`/@${ownHandle}`}>My media kit</NavLink> : null}
              {CREATOR_NAV.map((item) => (
                <NavLink key={item.href} href={item.href}>
                  {item.label}
                </NavLink>
              ))}
            </>
          ) : (
            <>
              <NavLink href="/directory">Directory</NavLink>
              {/* A buyer's own history had no link anywhere — the directory
                  answers "who could I buy from", not "what have I asked for". */}
              {viewer.organization ? <NavLink href="/dashboard/agency">Workspace</NavLink> : null}
              <NavLink href="/pricing">Pricing</NavLink>
            </>
          )}
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
