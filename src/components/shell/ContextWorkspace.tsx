'use client';

import { useState, type ReactNode } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

/**
 * A page's own two columns: its controls, then its work.
 *
 * ONE SHAPE ACROSS THE PRODUCT. Discovery arrived at filters-left,
 * results-right; every other workspace page had a rounded card floating in a
 * flex row, which read as a widget sitting on the page rather than as part of
 * it. This is the same structure Discovery uses — a column on its own surface
 * with a hairline against the work — so moving between pages does not mean
 * re-learning where the controls are.
 *
 * THE COLUMN OWNS ITS WIDTH, and the track is `auto`. A fixed `320px` track
 * goes on reserving its space when the column inside it minimises, so the
 * width never actually returns to the table that wanted it.
 *
 * `minmax(0, 1fr)` ON THE WORK. `1fr` floors at min-content, so one wide
 * comparison row would push the track past the viewport and scroll the whole
 * document sideways.
 *
 * MINIMISE IS PER PAGE, not per session. The nav's collapse is a lasting
 * preference about the product; this is a momentary "give me the width for
 * this table", and it should not follow somebody to a page where the brief is
 * the thing they came to read.
 */
export function ContextWorkspace({
  sidebar,
  children,
  sticky = false,
  label = 'Page controls',
}: {
  sidebar: ReactNode;
  children: ReactNode;
  sticky?: boolean;
  label?: string;
}) {
  const [minimised, setMinimised] = useState(false);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[auto_minmax(0,1fr)]">
      {minimised ? (
        <aside
          aria-label={`${label}, minimised`}
          className="hidden shrink-0 flex-col items-center border-r border-line bg-black/[0.02] py-3 lg:flex"
        >
          <button
            type="button"
            onClick={() => setMinimised(false)}
            aria-label={`Expand ${label.toLowerCase()}`}
            title={`Expand ${label.toLowerCase()}`}
            className="press flex h-8 w-8 items-center justify-center rounded-[var(--r-md)] text-ink-faint hover:bg-black/[0.04] hover:text-ink"
          >
            <PanelLeftOpen size={16} aria-hidden />
          </button>
        </aside>
      ) : null}

      <aside
        aria-label={label}
        className={[
          'flex flex-col border-line bg-black/[0.02] lg:w-[320px] lg:border-r',
          minimised ? 'lg:hidden' : '',
          sticky ? 'lg:sticky lg:top-0 lg:h-[calc(100dvh-var(--header-h))] lg:self-start' : '',
        ].join(' ')}
      >
        {/* The band aligns the column with the rail and the work; it does not
            re-title what is already titled inside it. `label` is still read to
            screen readers on the aside and used by the toggle. */}
        <div className="flex h-[var(--header-h)] shrink-0 items-center justify-end gap-2 border-b border-line px-3">
          <button
            type="button"
            onClick={() => setMinimised(true)}
            aria-label={`Minimise ${label.toLowerCase()}`}
            title={`Minimise ${label.toLowerCase()}`}
            className="press hidden h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r-md)] text-ink-faint hover:bg-black/[0.04] hover:text-ink lg:flex"
          >
            <PanelLeftClose size={16} aria-hidden />
          </button>
        </div>
        <div className={`min-h-0 flex-1 p-3 ${sticky ? 'overflow-y-auto' : ''}`}>{sidebar}</div>
      </aside>

      <div className="min-w-0 px-4 py-4 sm:px-5">{children}</div>
    </div>
  );
}

/**
 * The width of every contextual column in the product, in one place.
 *
 * Kept as an export because other surfaces still reference it; the column
 * itself now sets its own width rather than a track doing it from outside.
 */
export const RAIL_WIDTH = 'lg:w-[320px]';
