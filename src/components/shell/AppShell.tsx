'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';

import { AppNav, NAV_COLLAPSED_KEY } from './AppNav';

/**
 * The frame every authenticated page renders inside.
 *
 * THREE BANDS, NOT FIVE. Navigation is the left column; the page's identity and
 * its primary action are the header strip; everything else is the page. What
 * this replaces is a top bar with the global links in it, a second row of
 * workspace badges, and a per-page rail that often repeated both — three
 * answers to "where am I" before any content.
 *
 * THE NAV IS CLIENT, THE PAGES ARE NOT. Only the collapse state and the mobile
 * drawer need JavaScript, so this is the one client boundary in the shell and
 * every page inside it stays a server component.
 */
export function AppShell({
  workspace,
  plan,
  signedIn,
  navExtra,
  children,
}: {
  workspace: string | null;
  plan: string | null;
  signedIn: boolean;
  navExtra?: ReactNode;
  children: ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();
  /*
   * COLLAPSE LIVES HERE, because the grid template that reads it is here. It
   * was inside the nav, where the column could change width without the track
   * that holds it changing with it — which is how a fixed-looking sidebar ends
   * up over the page.
   *
   * Discovery defaults to collapsed: that page has its own 320px filter
   * column, and the horizontal room is worth more there than four words.
   */
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(NAV_COLLAPSED_KEY);
    } catch {
      /* blocked storage is not a reason to fail to render */
    }
    setCollapsed(stored === null ? pathname.startsWith('/discover') : stored === '1');
  }, [pathname]);
  const opener = useRef<HTMLButtonElement>(null);

  function close() {
    setNavOpen(false);
    // Focus goes back to the control that opened the drawer, or a keyboard
    // user is left at the top of the document with no idea what happened.
    opener.current?.focus();
  }

  return (
    <div className="app-shell" data-collapsed={collapsed ? 'true' : 'false'}>
      <AppNav
        workspace={workspace}
        plan={plan}
        signedIn={signedIn}
        extra={navExtra}
        open={navOpen}
        onClose={close}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
      />
      <div className="app-main">
        {/* The mobile strip. On desktop the nav column carries the brand and
            this disappears entirely rather than becoming a second empty bar. */}
        <div className="app-header sticky top-0 z-20 flex h-[var(--header-h)] shrink-0 items-center gap-2 border-b border-line bg-surface/90 px-3 backdrop-blur md:hidden">
          <button
            ref={opener}
            type="button"
            onClick={() => setNavOpen(true)}
            aria-expanded={navOpen}
            aria-label="Open navigation"
            className="press flex h-9 w-9 items-center justify-center rounded-[var(--r-md)] text-ink-muted hover:bg-paper hover:text-ink"
          >
            <Menu size={18} aria-hidden />
          </button>
          <span className="text-[14px] font-semibold tracking-tight text-ink">
            adfit<span className="text-indigo">.</span>
          </span>
          {workspace ? (
            <span className="ml-auto truncate text-[12px] text-ink-faint">{workspace}</span>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}
