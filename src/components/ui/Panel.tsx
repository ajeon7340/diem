import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * The single container primitive: white fill, 1px slate rule, a labelled
 * header rail. Every data surface uses it so panels read as one grid.
 */
export function Panel({
  title,
  meta,
  children,
  className,
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('overflow-hidden rounded-panel border border-line bg-surface', className)}>
      <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
        <h2 className="rail">{title}</h2>
        {meta ? <span className="tnum text-[11px] text-ink-faint">{meta}</span> : null}
      </header>
      {children}
    </section>
  );
}
