import type { ReactNode } from 'react';

/**
 * The compact page header: who and what, then the one thing to do here.
 *
 * ONE LINE OF IDENTITY, ONE OPTIONAL LINE OF CONTEXT. The pages this replaces
 * opened with a 20px title, a sentence explaining the page, and a row of
 * equal-weight buttons — three rows of chrome before the work, on a screen
 * somebody opens twenty times a day.
 *
 * THE PRIMARY ACTION IS ALONE ON THE RIGHT. Everything else goes in
 * `secondary`, which renders quietly beside it. Five buttons of equal weight
 * is a toolbar nobody has edited.
 */
export function PageHeader({
  icon,
  eyebrow,
  title,
  meta,
  summary,
  primary,
  secondary,
  tabs,
}: {
  /** An avatar or mark for the subject of the page. */
  icon?: ReactNode;
  /** Brand, campaign or parent — the thing this page belongs to. */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** Short status facts: counts, dates, states. Rendered inline, muted. */
  meta?: ReactNode;
  /** One sentence at most. Omit it rather than restating the title. */
  summary?: ReactNode;
  primary?: ReactNode;
  secondary?: ReactNode;
  tabs?: ReactNode;
}) {
  return (
    <header className="app-page-header border-b border-line bg-surface px-4 pt-4 sm:px-6">
      <div className="mx-auto w-full max-w-[1480px]">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {icon ? <div className="shrink-0 pt-0.5">{icon}</div> : null}
            <div className="min-w-0 flex-1">
            {eyebrow ? <div className="rail mb-1.5">{eyebrow}</div> : null}
            <h1 className="break-words text-[17px] font-semibold leading-tight tracking-tight text-ink">
              {title}
            </h1>
            {meta ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-ink-muted">
                {meta}
              </div>
            ) : null}
            {summary ? (
              <p className="mt-1.5 max-w-[68ch] text-[12px] leading-relaxed text-ink-muted">
                {summary}
              </p>
            ) : null}
            </div>
          </div>
          {primary || secondary ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {secondary}
              {primary}
            </div>
          ) : null}
        </div>
        {tabs ? <div className="mt-3">{tabs}</div> : <div className="h-4" />}
      </div>
    </header>
  );
}

/** A row of section tabs, flush with the header's bottom border. */
export function HeaderTabs({ children }: { children: ReactNode }) {
  return (
    <div className="-mb-px flex flex-wrap gap-4 text-[13px]" role="tablist">
      {children}
    </div>
  );
}
