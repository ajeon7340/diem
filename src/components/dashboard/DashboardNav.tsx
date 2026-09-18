import Link from 'next/link';

import { cn } from '@/lib/cn';

const TABS = [
  // First, deliberately. Every other tab needs an advertiser to already exist —
  // requests, offers and moderation are all things done TO a creator — so on
  // day one, with no brands on the platform, they are four empty pages. Studio
  // is the one surface that pays a creator back for showing up alone.
  { href: '/dashboard/studio', label: 'Studio' },
  { href: '/dashboard/requests', label: 'Requests' },
  { href: '/dashboard/offers', label: 'Offers & briefs' },
  { href: '/dashboard/moderation', label: 'Moderation' },
  { href: '/dashboard/settings', label: 'Settings' },
] as const;

/**
 * @param handle The creator's own handle, so the tabs can reach their profile.
 *   Optional: fixture mode has no handle to link, and a tab pointing at `/@null`
 *   is worse than one absent.
 */
export function DashboardNav({ active, handle }: { active: string; handle?: string | null }) {
  return (
    <nav aria-label="Dashboard" className="mt-6 flex items-center gap-1 border-b border-line">
      {/* The profile is not a dashboard page, and it is the page this whole
          product is about — the one place a creator sees everything they have.
          It sat unlinked from every surface. */}
      {handle ? (
        <Link
          href={`/@${handle}`}
          className="-mb-px border-b-2 border-transparent px-3 py-2 text-[12px] text-ink-muted transition-colors hover:text-ink"
        >
          My media kit
        </Link>
      ) : null}
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            '-mb-px border-b-2 px-3 py-2.5 text-[13px] transition-colors',
            active === tab.href
              ? 'border-indigo font-medium text-ink'
              : 'border-transparent text-ink-muted hover:text-ink',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
