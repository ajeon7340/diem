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

export function DashboardNav({ active }: { active: string }) {
  return (
    <nav aria-label="Dashboard" className="mt-6 flex items-center gap-1 border-b border-line">
      {/* The media kit is deliberately NOT a tab. It is not a dashboard
          section — it is the public page the dashboard produces — and it is
          already one click away in the header. Two links to one destination on
          one screen is a question about which one is the real one. */}
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
