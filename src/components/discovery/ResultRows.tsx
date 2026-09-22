import Link from 'next/link';

import { compact, exact } from '@/lib/channel/highlights';
import { typicalViews, daysSinceLastUpload } from '@/lib/discovery/narrow';
import type { DiscoveryCandidate } from '@/lib/discovery/types';

/**
 * The narrowed candidates, as rows.
 *
 * NO ENTER ANIMATION AND NO REORDER ANIMATION. This list changes on every
 * keystroke in a range field; rows sliding into place while somebody is
 * scanning makes it harder to read, not easier, and the motion would be the
 * most frequent animation in the product. The COUNT above animates, because
 * that is the thing that changed.
 *
 * EVERY FIGURE NAMES ITS DENOMINATOR. "Typical views" is the median of the
 * handful of videos this run retrieved for that channel, not a channel
 * average, and a hidden subscriber count says so rather than showing a dash
 * that reads as zero.
 */
export function ResultRows({
  candidates,
  ranked,
  runId,
}: {
  candidates: DiscoveryCandidate[];
  ranked: boolean;
  runId: string | null;
}) {
  if (candidates.length === 0) {
    return <p className="text-[13px] text-ink-muted">Nothing to show.</p>;
  }

  return (
    <ul className="min-w-0 space-y-2">
      {candidates.map((candidate) => {
        const views = typicalViews(candidate);
        const since = daysSinceLastUpload(candidate);
        return (
          <li key={candidate.channelId} className="surface flex min-w-0 items-start gap-3 px-3.5 py-3">
            {candidate.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={candidate.avatar}
                alt=""
                width={32}
                height={32}
                className="h-8 w-8 shrink-0 rounded-full outline outline-1 -outline-offset-1 outline-black/10"
              />
            ) : (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-wash text-[12px] font-semibold text-indigo">
                {candidate.title.slice(0, 1).toUpperCase()}
              </span>
            )}

            <div className="min-w-0 flex-1">
              <Link
                href={`/channels/${candidate.channelId}`}
                className="block break-words text-[13px] font-medium text-ink hover:text-indigo"
              >
                {candidate.title}
              </Link>
              <p className="tnum mt-0.5 text-[11px] text-ink-faint">
                {candidate.handle ? `${candidate.handle} · ` : ''}
                <span title={exact(candidate.subscribers)}>
                  {candidate.subscribers === null ? 'subscribers hidden' : `${compact(candidate.subscribers)} subscribers`}
                </span>
                {views !== null ? ` · ${compact(views)} typical views` : ' · views not reported'}
                {since !== null ? ` · posted ${Math.round(since)}d before collection` : ''}
              </p>
              {candidate.reason ? (
                <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-ink-muted">{candidate.reason}</p>
              ) : null}
            </div>

            {ranked && candidate.relevance ? (
              <span
                className="tnum shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-muted"
                title={`Match strength over the signals that had evidence — ${Math.round(candidate.relevance.evidenceCoverage * 100)}% of the weight did.`}
              >
                {Math.round(candidate.relevance.score * 100)}
              </span>
            ) : null}
          </li>
        );
      })}
      {runId ? null : null}
    </ul>
  );
}
