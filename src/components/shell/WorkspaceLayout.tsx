import type { ReactNode } from 'react';

import { SiteHeader } from './SiteHeader';
import { ContextWorkspace } from './ContextWorkspace';

/**
 * One shell for every workspace page: a contextual rail on the left, the work
 * on the right.
 *
 * WHY THE SHAPE IS SHARED. Discovery found it first — filters on the left,
 * results on the right — and the rest of the product kept its own idea of a
 * page: `/channels` was a form above a table, `/campaigns` a narrow column,
 * `/campaigns/[id]` a stack of accordions, Settings a list. Four pages, four
 * layouts, one product. A customer moving between them re-learns where the
 * primary action lives every time.
 *
 * THE RAIL IS NOT A SECOND NAVIGATION. The top nav says which part of the
 * product you are in; this says what you can do while you are here — the
 * controls, the context and the primary action for THIS page. Duplicating the
 * global links into it would make the header decorative and give every page two
 * answers to "where am I".
 *
 * STICKY ONLY WHERE IT EARNS IT. A rail that scrolls away on a campaign, where
 * the brief is the standard every decision is made against, is a rail you
 * scroll back up to; a rail pinned on a page with six rows of content is a
 * rail that wastes a screen. `sticky` is a prop, not a default.
 *
 * ON MOBILE IT STACKS. Below `lg` the rail sits above the work area at full
 * width. No drawer here, unlike discovery: these rails are short, and hiding a
 * campaign's brief behind a button on the page where it is the point would be
 * worse than the scroll.
 */
export function WorkspaceLayout({
  panel,
  children,
  sticky = false,
  width = 'default',
}: {
  panel?: ReactNode;
  children: ReactNode;
  sticky?: boolean;
  /** 'wide' for tables that need the room — the campaign roster, the library. */
  width?: 'default' | 'wide';
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 bg-paper">
        <div
          className={`mx-auto w-full px-4 py-6 sm:px-6 lg:px-8 print:p-0 ${
            width === 'wide' ? 'max-w-[1440px]' : 'max-w-[1200px]'
          }`}
        >
          {panel ? <ContextWorkspace sidebar={panel} sticky={sticky}>{children}</ContextWorkspace> : children}
        </div>
      </main>
    </div>
  );
}

/**
 * A section of the rail. Plain, because the rail is already a column — wrapping
 * every group in its own bordered card is the "excessive cards" this visual
 * system is written against.
 */
export function PanelSection({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`border-t border-line pt-4 first:border-0 first:pt-0 ${className ?? ''}`}>
      {title ? <h2 className="rail mb-2.5">{title}</h2> : null}
      {children}
    </section>
  );
}
