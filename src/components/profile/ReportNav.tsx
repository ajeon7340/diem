'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/lib/cn';

const SECTIONS = [
  { id: 'audience', label: 'Audience' },
  { id: 'commercial', label: 'Commercial fit' },
  { id: 'risk', label: 'Risk & brief' },
] as const;

/**
 * Sticky section rail for a report that runs to seven panels.
 *
 * Uses IntersectionObserver rather than scroll maths so it costs nothing while
 * idle, and degrades to a plain anchor list if the observer never fires.
 */
export function ReportNav() {
  const [active, setActive] = useState<string>(SECTIONS[0].id);

  useEffect(() => {
    const elements = SECTIONS.map((section) => document.getElementById(section.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      // Bias the band toward the top of the viewport so the highlighted section
      // is the one being read, not the one merely on screen.
      { rootMargin: '-96px 0px -55% 0px', threshold: 0 },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <nav
      aria-label="Report sections"
      className="sticky top-[49px] z-20 -mx-5 mb-4 border-y border-line bg-surface/90 px-5 py-2 backdrop-blur-md sm:-mx-8 sm:px-8"
    >
      <ul className="flex items-center gap-1 overflow-x-auto">
        {SECTIONS.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className={cn(
                'inline-block whitespace-nowrap rounded-md px-2.5 py-1.5 text-[12px] transition-colors',
                active === section.id
                  ? 'bg-indigo-wash font-medium text-indigo'
                  : 'text-ink-muted hover:bg-paper hover:text-ink',
              )}
            >
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
