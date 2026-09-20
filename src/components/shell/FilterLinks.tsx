import Link from 'next/link';

/**
 * Filters as links, with their counts.
 *
 * LINKS, NOT CLIENT STATE, for the reason the discovery tabs are links: a
 * filtered view is a thing colleagues send each other, and a selection that
 * lives only in React survives neither a refresh nor a paste into Slack.
 *
 * THE COUNTS ARE THE POINT. "Needs attention 0" and "Needs attention" look the
 * same until you click the second one and find nothing — a filter that cannot
 * say how much is behind it makes the customer probe each one in turn. A zero
 * count stays visible and disabled rather than disappearing, because a filter
 * that comes and goes teaches nobody where anything is.
 */
export interface FilterOption {
  id: string;
  label: string;
  count: number;
}

export function FilterLinks({
  options,
  active,
  hrefFor,
  legend,
}: {
  options: FilterOption[];
  active: string;
  hrefFor: (id: string) => string;
  legend: string;
}) {
  return (
    <nav aria-label={legend}>
      <ul className="space-y-0.5">
        {options.map((option) => {
          const selected = option.id === active;
          const empty = option.count === 0 && !selected;
          return (
            <li key={option.id}>
              {empty ? (
                <span
                  aria-disabled="true"
                  className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[13px] text-ink-faint"
                >
                  {option.label}
                  <span className="tnum text-[11px]">0</span>
                </span>
              ) : (
                <Link
                  href={hrefFor(option.id)}
                  aria-current={selected ? 'true' : undefined}
                  className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[13px] transition-colors ${
                    selected ? 'bg-indigo-wash font-medium text-indigo' : 'text-ink-muted hover:bg-surface hover:text-ink'
                  }`}
                >
                  {option.label}
                  <span className="tnum text-[11px]">{option.count}</span>
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
