'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  AudioLines,
  ChartNoAxesCombined,
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  Telescope,
  X,
} from 'lucide-react';

import { cn } from '@/lib/cn';

/**
 * The application's one navigation: a persistent column on the left.
 *
 * IT WAS IN THE TOP BAR, AND EVERY PAGE ALSO HAD A RAIL. So a workspace page
 * carried two horizontal bands of chrome and a left column before any of its
 * own content, and "where am I" and "what can I do here" were answered in
 * three places. Global navigation is now the left column and nothing else;
 * the page's own controls stay in its rail; the header carries the page's
 * identity and its primary action.
 *
 * COLLAPSIBLE, AND THE CHOICE PERSISTS. Somebody who knows the four
 * destinations wants the horizontal room back for a comparison table. The
 * state is written to localStorage, read before paint by the inline script in
 * the layout so the column does not jump on the first frame.
 *
 * COLLAPSED STILL HAS LABELS. The icons keep their accessible names, the
 * tooltip is a native `title`, and `aria-current` still marks the page — an
 * icon rail that drops its labels is a rail only its author can use.
 *
 * ON MOBILE IT IS A DRAWER, closed by Escape or the backdrop, with focus moved
 * into it and returned to the button afterwards.
 */

/**
 * Grouped, because four flat links say nothing about how the work is shaped.
 *
 * FIND is where you go without a name in mind; EVALUATE is what you do once
 * you have one. The group labels cost a line each and turn a list into a
 * description of the workflow.
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
}: {
  workspace: string | null;
  plan: string | null;
  signedIn: boolean;
  /** Demo-mode controls, rendered only where the page supplies them. */
  extra?: React.ReactNode;
  /** Mobile drawer state, owned by the shell. */
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORE) === '1');
    } catch {
      // A blocked storage API is not a reason to fail to render navigation.
    }
  }, []);

  function toggle() {
    setCollapsed((was) => {
      const next = !was;
      try {
        window.localStorage.setItem(STORE, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  // Escape closes the mobile drawer; the shell returns focus to its opener.
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
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-ink/30 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      ) : null}

      <nav
        aria-label="Main"
        data-collapsed={collapsed ? 'true' : 'false'}
        className={cn(
          'app-nav shrink-0 flex-col',
          // Drawer below lg, column at lg and up. The drawer DOES get a surface
          // and a shadow, because it floats over the page; the column does not,
          // because it is the page's own frame.
          open
            ? 'fixed inset-y-0 left-0 z-50 flex w-[var(--nav-w)] !bg-paper shadow-[var(--shadow-overlay)]'
            : 'hidden',
          'lg:static lg:z-auto lg:flex lg:shadow-none',
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
            className="press ml-auto flex h-8 w-8 items-center justify-center rounded-[var(--r-md)] text-ink-muted hover:bg-black/[0.04] hover:text-ink lg:hidden"
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
                        title={collapsed ? label : undefined}
                        onClick={onClose}
                        className={cn(
                          'press flex min-h-10 items-center gap-2.5 rounded-[var(--r-md)] px-2.5 text-[14px]',
                          'transition-colors duration-150',
                          collapsed && 'justify-center px-0',
                          // The item you are on is FILLED, not tinted. A wash
                          // that is two shades from the ground is a state
                          // somebody has to look for.
                          active
                            ? 'bg-indigo font-medium text-white'
                            : 'font-normal text-ink-muted hover:bg-black/[0.04] hover:text-ink',
                        )}
                      >
                        {/* 1.75px beside 400-weight text, 2px beside the
                            filled active item, which reads heavier. */}
                        <Icon
                          size={17}
                          strokeWidth={active ? 2 : 1.75}
                          aria-hidden
                          className="shrink-0"
                        />
                        <span className={collapsed ? 'sr-only' : 'truncate'}>{short}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* WORKSPACE CONTEXT LIVES HERE, ONCE. It used to be a badge in the top
            bar AND a line in three page rails. This is the one place that says
            which workspace you are in. */}
        <div className="shrink-0 space-y-2 p-2.5 pt-0">
          {workspace && !collapsed ? (
            <div className="rounded-[var(--r-md)] bg-black/[0.035] px-2.5 py-2">
              <p className="truncate text-[13px] font-medium text-ink" title={workspace}>
                {workspace}
              </p>
              {plan ? <p className="mt-0.5 text-[11px] text-ink-faint">{plan}</p> : null}
            </div>
          ) : null}
          {collapsed ? null : extra}

          <div className={cn('flex items-center gap-1', collapsed && 'flex-col')}>
            <button
              type="button"
              onClick={toggle}
              aria-pressed={collapsed}
              title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
              className="press hidden h-8 w-8 items-center justify-center rounded-[var(--r-md)] text-ink-faint hover:bg-black/[0.04] hover:text-ink lg:flex"
            >
              {collapsed ? <PanelLeftOpen size={16} aria-hidden /> : <PanelLeftClose size={16} aria-hidden />}
              <span className="sr-only">{collapsed ? 'Expand navigation' : 'Collapse navigation'}</span>
            </button>
            {signedIn ? (
              <form action="/auth/signout" method="post" className={collapsed ? '' : 'ml-auto'}>
                <button
                  type="submit"
                  title="Sign out"
                  className="press flex min-h-8 items-center rounded-[var(--r-md)] px-2 text-[12px] text-ink-faint hover:bg-black/[0.04] hover:text-ink"
                >
                  {collapsed ? <span className="sr-only">Sign out</span> : 'Sign out'}
                  {collapsed ? <span aria-hidden>↩</span> : null}
                </button>
              </form>
            ) : (
              <Link
                href="/signin"
                className={cn(
                  'press flex min-h-8 items-center rounded-[var(--r-md)] px-2 text-[12px] text-ink-faint hover:bg-black/[0.04] hover:text-ink',
                  collapsed ? '' : 'ml-auto',
                )}
              >
                {collapsed ? <span className="sr-only">Sign in</span> : 'Sign in'}
                {collapsed ? <span aria-hidden>→</span> : null}
              </Link>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}
