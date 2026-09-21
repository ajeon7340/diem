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
    <div role="tablist" aria-label="Report" className="-mb-px flex gap-1 print:hidden">
      {[
        ['overview', 'Channel overview', `/channels/${channelId}`],
        ['relevance', 'Brand relevance', `/channels/${channelId}?${query}`],
      ].map(([id, label, href]) => (
        <Link
          key={id}
          href={href}
          role="tab"
          aria-selected={view === id}
          className={`border-b-2 px-2.5 pb-2.5 pt-1 text-[13px] font-medium transition-colors duration-150 ${
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
