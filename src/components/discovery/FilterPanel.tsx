'use client';

import { useEffect, useRef, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';

/**
 * The left column: a fixed-width panel on desktop, a drawer below it.
 *
 * THE PANEL SCROLLS, THE BUTTONS DO NOT. A filter column tall enough to need
 * scrolling will put Search below the fold on a laptop, and a Search button you
 * have to find is the one control on this page that must never be hidden. So
 * the aside is a flex column pinned to the viewport, the fields scroll inside
 * it, and the form's footer is a sibling that cannot move — see the layout in
 * `SearchForms`, which owns the form element itself.
 *
 * ON MOBILE there is no room for two columns and no value in a 300px panel
 * squeezed against the results. It becomes a drawer: hidden, opened by a
 * button, closed by Escape or the backdrop, with focus moved into it and
 * returned afterwards. Results take the full width underneath.
 */
export function FilterPanel({
  children,
  summary,
}: {
  children: React.ReactNode;
  /** One line describing what is currently set, for the closed mobile button. */
  summary?: string;
}) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    // The page behind a drawer must not scroll under it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  function close() {
    setOpen(false);
    // Focus goes back where it came from, or a keyboard user is dropped at the
    // top of the document with no idea what just happened.
    opener.current?.focus();
  }

  return (
    <>
      <button
        ref={opener}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="discovery-filters"
        className="inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 text-[13px] font-medium text-ink lg:hidden"
      >
        <span className="inline-flex items-center gap-2">
          <SlidersHorizontal size={16} aria-hidden />
          Search and filters
        </span>
        {summary ? <span className="truncate text-[12px] font-normal text-ink-muted">{summary}</span> : null}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-40 bg-ink/30 lg:hidden"
          onClick={close}
          aria-hidden
        />
      ) : null}

      <aside
        id="discovery-filters"
        ref={panel}
        tabIndex={-1}
        aria-label="Search and filters"
        className={[
          'flex flex-col overflow-hidden rounded-2xl border border-line bg-surface outline-none',
          // Drawer below lg.
          open
            ? 'fixed inset-x-3 bottom-3 top-16 z-50 max-h-[calc(100vh-5rem)]'
            : 'hidden',
          // Column at lg and up: a fixed 300px rail, pinned under the header,
          // never taller than the viewport it sits in.
          'lg:static lg:z-auto lg:flex lg:max-h-[calc(100vh-7rem)] lg:w-[300px] lg:shrink-0 lg:self-start',
          'lg:sticky lg:top-24',
        ].join(' ')}
      >
        <button
          type="button"
          onClick={close}
          className="flex items-center justify-between border-b border-line px-4 py-3 text-[13px] font-medium text-ink lg:hidden"
        >
          Search and filters
          <X size={16} aria-hidden />
        </button>
        {children}
      </aside>
    </>
  );
}
