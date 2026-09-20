'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { DISCOVERY_MODES, type DiscoveryMode } from '@/lib/discovery/types';

const ORDER: DiscoveryMode[] = ['criteria', 'similar', 'competitor'];

/** Short enough to sit in a 300px column without wrapping to three lines. */
const SHORT: Record<DiscoveryMode, string> = {
  criteria: 'By criteria',
  similar: 'Similar to',
  competitor: 'Competitors',
};

/**
 * The three ways in, as a segmented control at the top of the filter panel.
 *
 * LINKS, NOT CLIENT STATE. A tab that only exists in React loses the
 * customer's place on a refresh and cannot be sent to a colleague, and "here is
 * the search I ran" is a thing colleagues send each other. Switching mode
 * always lands on `/discover`, never on a stored search: the fields differ per
 * mode, so carrying a criteria search's id into competitor mode would show a
 * panel whose inputs describe something else.
 */
export function ModeTabs({ mode }: { mode: DiscoveryMode }) {
  const params = useSearchParams();
  const campaign = params.get('campaign');

  return (
    <div role="tablist" aria-label="How to search" className="flex rounded-xl border border-line bg-paper p-1">
      {ORDER.map((value) => {
        const active = value === mode;
        const query = new URLSearchParams({ mode: value, ...(campaign ? { campaign } : {}) });
        return (
          <Link
            key={value}
            href={`/discover?${query}`}
            role="tab"
            aria-selected={active}
            title={DISCOVERY_MODES[value].label}
            className={`flex-1 rounded-lg px-2 py-2 text-center text-[12px] font-medium transition-colors ${
              active ? 'bg-surface text-indigo shadow-sm' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {SHORT[value]}
          </Link>
        );
      })}
    </div>
  );
}
