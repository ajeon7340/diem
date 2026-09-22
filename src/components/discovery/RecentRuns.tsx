import Link from 'next/link';

import { DISCOVERY_MODES, type DiscoveryMode } from '@/lib/discovery/types';

/**
 * What this workspace has already run, and what it has kept.
 *
 * SEPARATE FROM THE PANEL. The panel is about the run you are composing or
 * looking at; this is history, and it belongs under it rather than competing
 * with it for the same space.
 */

export interface SearchRow {
  id: string;
  mode: DiscoveryMode;
  asked: string;
  state: string;
  at: string;
}

export function RecentRuns({
  searches,
  saved,
}: {
  searches: SearchRow[];
  saved: { channelId: string; title: string | null; handle: string | null; savedAt: string; avatar: string | null }[];
}) {
  if (searches.length === 0 && saved.length === 0) return null;

  return (
    <div className="min-w-0 space-y-6 px-4 pb-8 sm:px-5">
      {searches.length ? (
        <section>
          <h2 className="rail">Recent runs</h2>
          <ul className="mt-2 min-w-0 space-y-2">
            {searches.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/discover/${row.id}`}
                  className="press surface flex min-w-0 items-center gap-3 px-3.5 py-2.5"
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{row.asked}</span>
                  <span className="tnum shrink-0 text-[11px] text-ink-faint">
                    {DISCOVERY_MODES[row.mode].label} · {row.state} · {row.at}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {saved.length ? (
        <section>
          <h2 className="rail">Saved candidates</h2>
          <ul className="surface mt-2 min-w-0 divide-y divide-line overflow-hidden">
            {saved.map((candidate) => (
              <li key={candidate.channelId} className="flex min-w-0 items-center gap-3 px-3.5 py-2.5">
                {candidate.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={candidate.avatar} alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-full" />
                ) : null}
                <Link
                  href={`/channels/${candidate.channelId}`}
                  className="min-w-0 flex-1 truncate text-[13px] text-indigo underline-offset-4 hover:underline"
                >
                  {candidate.title ?? candidate.channelId}
                  {candidate.handle ? <span className="ml-1.5 text-ink-muted">{candidate.handle}</span> : null}
                </Link>
                <span className="tnum shrink-0 text-[11px] text-ink-faint">{candidate.savedAt.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
