'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import {
  AudioLines,
  ChartNoAxesCombined,
  FolderOpen,
  LogOut,
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
 * ICONS ONLY, AND THERE IS NO EXPANDED STATE. Every page in this product now
 * has its own controls column, so a 232px strip of four words was a third
 * vertical band competing with them for the same screen — and a width that
 * could change was a width every layout had to be correct at twice.
 *
 * THE NAMES DO NOT GO AWAY WITH THE WIDTH. Each item carries `aria-label` and
 * a `title` tooltip, and `aria-current` marks the page. An icon rail that
 * drops its labels is a rail only its author can use.
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

export function AppNav({
  workspace,
  plan,
  signedIn,
  extra,
  open,
  onClose,
}: {
  workspace: string | null;
  plan: string | null;
  signedIn: boolean;
  extra?: React.ReactNode;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  // The drawer is the only place the labels appear: on a phone there is room,
  // and a 64px icon strip over the content would be worse than useless.
  const collapsed = !open;

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
        {/*
          * ONE HEADER BAND ACROSS ALL THREE COLUMNS.
          *
          * The rail's logo, a page's filter tabs and the results bar all sit on
          * `--header-h`, so the eye reads one horizontal line across the app
          * instead of three rows starting at three different heights.
          */}
        <div
          className={cn(
            'flex h-[var(--header-h)] shrink-0 items-center gap-2 px-3',
            collapsed && 'justify-center px-0',
          )}
        >
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
            {signedIn ? (
              <form action="/auth/signout" method="post" className={collapsed ? 'mx-auto' : 'w-full'}>
                <button
                  type="submit"
                  aria-label="Sign out"
                  title="Sign out"
                  className="press flex min-h-8 w-full items-center gap-1.5 rounded-[var(--r-md)] px-2 text-[12px] text-ink-faint hover:bg-black/[0.04] hover:text-ink"
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
                  collapsed ? 'mx-auto' : 'w-full',
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
