'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import {
  AudioLines,
  ChartNoAxesCombined,
  FolderOpen,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  Telescope,
  X,
} from 'lucide-react';

import { cn } from '@/lib/cn';

/**
 * The application's one navigation: a column, in three regions that cannot
 * push each other off the screen.
 *
 *   logo     shrink-0
 *   items    flex-1, scrolls on its own if it ever grows
 *   footer   shrink-0 — workspace, collapse, sign out
 *
 * THE FOOTER WAS BELOW THE FOLD. The column was a flex child that sized to its
 * content, so on a short viewport the workspace card and Sign out fell off the
 * bottom with no way to reach them. `h-dvh` on the column and `flex-1
 * overflow-y-auto` on the middle region means the two ends are always visible
 * and only the list in between ever scrolls.
 *
 * COLLAPSED KEEPS ITS NAMES. Icons carry `aria-label` and a `title` tooltip,
 * and `aria-current` still marks the page. An icon rail that drops its labels
 * is a rail only its author can use.
 *
 * DEFAULTS COLLAPSED ON DISCOVER, where the page itself has a 320px filter
 * column and the horizontal room is worth more than four words. The choice is
 * remembered from then on, so the default applies until somebody disagrees.
 */

const GROUPS = [
  {
    label: 'Find',
    links: [{ href: '/discover', label: 'Discover creators', short: 'Discover', icon: Telescope }],
  },
  {
    label: 'Evaluate',
    links: [
      { href: '/channels', label: 'Channel analysis', short: 'Channel analysis', icon: ChartNoAxesCombined },
      { href: '/campaigns', label: 'Campaigns', short: 'Campaigns', icon: FolderOpen },
    ],
  },
  {
    label: 'Workspace',
    links: [{ href: '/settings', label: 'Settings', short: 'Settings', icon: Settings2 }],
  },
];

const STORE = 'adfit:nav-collapsed';

export function AppNav({
  workspace,
  plan,
  signedIn,
  extra,
  open,
  onClose,
  collapsed,
  onCollapsedChange,
}: {
  workspace: string | null;
  plan: string | null;
  signedIn: boolean;
  extra?: React.ReactNode;
  open: boolean;
  onClose: () => void;
  collapsed: boolean;
  onCollapsedChange: (next: boolean) => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  function toggle() {
    const next = !collapsed;
    onCollapsedChange(next);
    try {
      window.localStorage.setItem(STORE, next ? '1' : '0');
    } catch {
      // A blocked storage API is not a reason to fail to render navigation.
    }
  }

  return (
    <>
      {/* z-index ONLY in the drawer case. The desktop layout is a grid and
          needs no stacking context at all. */}
      {open ? (
        <div className="fixed inset-0 z-30 bg-ink/30 md:hidden" onClick={onClose} aria-hidden />
      ) : null}

      <nav
        aria-label="Main"
        className={cn(
          'app-nav flex h-dvh flex-col',
          open ? 'fixed inset-y-0 left-0 z-40 flex w-[var(--rail)] !bg-paper shadow-[var(--shadow-overlay)]' : 'hidden',
          'md:static md:z-auto md:flex md:w-auto md:shadow-none',
        )}
      >
        <div className="flex h-[var(--header-h)] shrink-0 items-center gap-2 px-4">
          <Link
            href="/"
            aria-label="adfit home"
            className="flex min-w-0 items-center gap-2.5 text-[17px] font-semibold tracking-tight text-ink"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-indigo text-white">
              <AudioLines size={17} strokeWidth={2} aria-hidden />
            </span>
            {collapsed ? null : (
              <span className="truncate">
                adfit<span className="text-indigo">.</span>
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="press ml-auto flex h-8 w-8 items-center justify-center rounded-[var(--r-md)] text-ink-muted hover:bg-black/[0.04] hover:text-ink md:hidden"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2">
          {GROUPS.map((group) => (
            <div key={group.label} className="mb-3">
              {collapsed ? (
                <div className="mx-auto my-2 h-px w-6 bg-line" aria-hidden />
              ) : (
                <p className="px-2.5 pb-1.5 pt-2 text-[11px] font-medium text-ink-faint">{group.label}</p>
              )}
              <ul className="space-y-0.5">
                {group.links.map(({ href, label, short, icon: Icon }) => {
                  const active = pathname === href || pathname.startsWith(`${href}/`);
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        aria-current={active ? 'page' : undefined}
                        aria-label={label}
                        title={collapsed ? label : undefined}
                        onClick={onClose}
                        className={cn(
                          'press flex min-h-10 items-center gap-2.5 rounded-[var(--r-md)] px-2.5 text-[14px]',
                          'transition-colors duration-150',
                          collapsed && 'justify-center px-0',
                          active
                            ? 'bg-indigo font-medium text-white'
                            : 'font-normal text-ink-muted hover:bg-black/[0.04] hover:text-ink',
                        )}
                      >
                        <Icon size={17} strokeWidth={active ? 2 : 1.75} aria-hidden className="shrink-0" />
                        <span className={collapsed ? 'sr-only' : 'truncate'}>{short}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* SHRINK-0, so it is on the screen at every viewport height. */}
        <div className="shrink-0 space-y-2 border-t border-line p-2.5">
          {workspace ? (
            collapsed ? (
              <p
                title={`${workspace}${plan ? ` · ${plan}` : ''}`}
                className="mx-auto flex h-8 w-8 items-center justify-center rounded-[var(--r-md)] bg-black/[0.05] text-[12px] font-semibold text-ink"
              >
                {workspace.slice(0, 1).toUpperCase()}
                <span className="sr-only">
                  {workspace}
                  {plan ? `, ${plan}` : ''}
                </span>
              </p>
            ) : (
              <div className="rounded-[var(--r-md)] bg-black/[0.035] px-2.5 py-2">
                <p className="truncate text-[13px] font-medium text-ink" title={workspace}>
                  {workspace}
                </p>
                {plan ? <p className="mt-0.5 text-[11px] text-ink-faint">{plan}</p> : null}
              </div>
            )
          ) : null}
          {collapsed ? null : extra}

          <div className={cn('flex items-center gap-1', collapsed && 'flex-col')}>
            <button
              type="button"
              onClick={toggle}
              aria-pressed={collapsed}
              aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
              title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
              className="press hidden h-8 w-8 items-center justify-center rounded-[var(--r-md)] text-ink-faint hover:bg-black/[0.04] hover:text-ink md:flex"
            >
              {collapsed ? <PanelLeftOpen size={16} aria-hidden /> : <PanelLeftClose size={16} aria-hidden />}
            </button>
            {signedIn ? (
              <form action="/auth/signout" method="post" className={collapsed ? '' : 'ml-auto'}>
                <button
                  type="submit"
                  aria-label="Sign out"
                  title="Sign out"
                  className="press flex min-h-8 items-center gap-1.5 rounded-[var(--r-md)] px-2 text-[12px] text-ink-faint hover:bg-black/[0.04] hover:text-ink"
                >
                  {collapsed ? <LogOut size={15} aria-hidden /> : 'Sign out'}
                </button>
              </form>
            ) : (
              <Link
                href="/signin"
                aria-label="Sign in"
                title="Sign in"
                className={cn(
                  'press flex min-h-8 items-center gap-1.5 rounded-[var(--r-md)] px-2 text-[12px] text-ink-faint hover:bg-black/[0.04] hover:text-ink',
                  collapsed ? '' : 'ml-auto',
                )}
              >
                {collapsed ? <LogOut size={15} aria-hidden className="rotate-180" /> : 'Sign in'}
              </Link>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}

export { STORE as NAV_COLLAPSED_KEY };
