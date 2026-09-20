'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

import { DISCOVERY_MODES, type DiscoveryMode } from '@/lib/discovery/types';

const ORDER: DiscoveryMode[] = ['criteria', 'similar', 'competitor'];

/**
 * The three ways in, as links rather than client state.
 *
 * A tab that only exists in React loses the customer's place on a refresh and
 * cannot be linked to — and "here is the search I ran" is a thing colleagues
 * send each other. The campaign, when one is carried in, rides along.
 */
export function ModeTabs({ mode }: { mode: DiscoveryMode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const campaign = params.get('campaign');

  return (
    <div role="tablist" aria-label="How to search" className="flex flex-wrap gap-2">
      {ORDER.map((value) => {
        const active = value === mode;
        const href = `${pathname}?${new URLSearchParams({
          mode: value,
          ...(campaign ? { campaign } : {}),
        })}`;
        return (
          <Link
            key={value}
            href={href}
            role="tab"
            aria-selected={active}
            className={`inline-flex min-h-11 items-center rounded-xl border px-4 text-[13px] font-medium transition-colors ${
              active
                ? 'border-indigo/30 bg-indigo-wash text-indigo'
                : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink'
            }`}
          >
            {DISCOVERY_MODES[value].label}
          </Link>
        );
      })}
    </div>
  );
}
