import type { ReactNode } from 'react';

import { AppShell } from './AppShell';
import { ContextWorkspace } from './ContextWorkspace';
import { PageHeader } from './PageHeader';
import { DemoRoleSwitcher } from './DemoRoleSwitcher';
import { getViewer } from '@/lib/access/viewer';
import { isSupabaseConfigured } from '@/lib/supabase/server';

/**
 * One shell for every workspace page: navigation on the left, a compact header
 * for the page's identity and primary action, then the work.
 *
 * WHY THE SHAPE IS SHARED. Discovery found the two-column idea first — filters
 * left, results right — and the rest of the product kept its own idea of a
 * page: `/channels` was a form above a table, `/campaigns` a narrow column,
 * `/campaigns/[id]` a stack of accordions, Settings a list. Four pages, four
 * layouts, one product.
 *
 * THREE LEVELS, KEPT APART:
 *
 *   the nav column   where you are in the application
 *   the header       what this page is, and the one action it is for
 *   the rail         the controls for THIS page — filters, a brief, sections
 *
 * The rail is not a second navigation and never carries the global links; that
 * is how a product ends up answering "where am I" in three places at once.
 *
 * STICKY ONLY WHERE IT EARNS IT. A rail that scrolls away on a campaign, where
 * the brief is the standard every decision is made against, is a rail you
 * scroll back up to; a rail pinned beside six rows of content wastes a screen.
 *
 * ON MOBILE the rail stacks above the work. No drawer here, unlike discovery:
 * these rails are short, and hiding a campaign's brief behind a button on the
 * page where it is the point would be worse than the scroll.
 */
export interface PageHeaderProps {
  icon?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  summary?: ReactNode;
  primary?: ReactNode;
  secondary?: ReactNode;
  tabs?: ReactNode;
}

export async function WorkspaceLayout({
  header,
  panel,
  children,
  sticky = false,
  width = 'default',
  bare = false,
}: {
  /** The compact page header. Omitted only where the page draws its own. */
  header?: PageHeaderProps;
  panel?: ReactNode;
  children: ReactNode;
  sticky?: boolean;
  /** 'wide' for tables that need the room — the campaign roster, the library. */
  width?: 'default' | 'wide';
  /**
   * The page draws its own header and main region.
   *
   * Used where the header's controls are stateful — a campaign's "Add
   * candidate" opens a dialog the page owns — so the header has to live inside
   * that client component rather than being composed around it.
   */
  bare?: boolean;
}) {
  const viewer = await getViewer();
  const demo = !isSupabaseConfigured();

  return (
    <AppShell
      workspace={viewer.organization?.name ?? null}
      plan={viewer.organization ? (viewer.isProAgency ? 'Pro Agency' : 'Free plan') : null}
      signedIn={viewer.userId !== null}
      navExtra={demo ? <DemoRoleSwitcher /> : null}
    >
      {header ? <PageHeader {...header} /> : null}
      {bare ? (
        children
      ) : (
      <main className="flex-1 px-4 py-5 sm:px-6 print:p-0">
        <div
          className={`mx-auto w-full print:max-w-none ${
            width === 'wide' ? 'max-w-[1480px]' : 'max-w-[1200px]'
          }`}
        >
          {panel ? (
            <ContextWorkspace sidebar={panel} sticky={sticky}>
              {children}
            </ContextWorkspace>
          ) : (
            children
          )}
        </div>
      </main>
      )}
    </AppShell>
  );
}

/**
 * A section of the rail. Plain, because the rail is already a column — wrapping
 * every group in its own bordered card is the "excessive cards" this visual
 * system is written against.
 */
export function PanelSection({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  /** A single control for this section, aligned with its heading. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`border-t border-line pt-4 first:border-0 first:pt-0 ${className ?? ''}`}>
      {title || action ? (
        <div className="mb-2.5 flex items-baseline justify-between gap-2">
          {title ? <h2 className="rail">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
