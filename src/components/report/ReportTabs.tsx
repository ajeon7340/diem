import Link from 'next/link';

/**
 * The two reports, as links.
 *
 * Links rather than client state for the reason every tab in this product is:
 * "the relevance analysis I ran for this client" is a thing colleagues send
 * each other, and a view that exists only in React cannot be sent.
 */
export function ReportTabs({
  channelId,
  view,
  brand,
  campaign,
}: {
  channelId: string;
  view: 'overview' | 'relevance';
  brand: string | null;
  campaign: string | null;
}) {
  const query = new URLSearchParams({
    view: 'relevance',
    ...(brand ? { brand } : {}),
    ...(campaign ? { campaign } : {}),
  });

  return (
    <div role="tablist" aria-label="Report" className="mt-4 flex gap-1 border-b border-line print:hidden">
      {[
        ['overview', 'Channel overview', `/channels/${channelId}`],
        ['relevance', 'Brand relevance', `/channels/${channelId}?${query}`],
      ].map(([id, label, href]) => (
        <Link
          key={id}
          href={href}
          role="tab"
          aria-selected={view === id}
          className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors ${
            view === id
              ? 'border-indigo text-indigo'
              : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
