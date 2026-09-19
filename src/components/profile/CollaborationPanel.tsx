import type { Collaboration } from '@/lib/report/collaboration';
import { Badge } from '@/components/ui/Badge';
import { LockedPanel } from './LockedPanel';
import { compactNumber } from '@/lib/format';

const RELEVANCE_TONE = {
  matched: 'emerald',
  unknown: 'slate',
  unmatched: 'amber',
} as const;

const RELEVANCE_LABEL = {
  matched: 'fits your categories',
  unknown: 'relevance not assessed',
  unmatched: 'outside your categories',
} as const;

/**
 * What to make with this creator — the buyer's end of Studio's format drivers.
 *
 * The panel's job is as much restraint as recommendation. Four things ship with
 * every direction because a brief gets acted on:
 *
 *   - THE EVIDENCE. Named posts the pattern was measured on, not a claim.
 *   - THE MEASUREMENT. n on both sides and the p-value, in the open. A reader
 *     who wants to disbelieve it should be able to.
 *   - RELEVANCE TO THIS BRAND, including "not assessed" — a format that travels
 *     is a different question from a format that suits your product, and an
 *     empty buyer profile cannot answer the second.
 *   - THE LIMITS, rendered once and never conditionally. These are associations
 *     inside one catalogue, measured on organic posts, by a system that has
 *     never observed a conversion.
 */
export function CollaborationPanel({
  collaboration,
  locked,
}: {
  collaboration: Collaboration | null;
  locked: boolean;
}) {
  if (!locked && !collaboration) {
    return (
      <LockedPanel
        title="Recommended collaboration direction"
        meta="channel not read"
        locked={false}
        headline=""
        detail=""
      >
        <p className="px-5 py-8 text-center text-[12px] leading-relaxed text-ink-muted">
          This creator has no connected channel to read formats from.
        </p>
      </LockedPanel>
    );
  }

  const data = collaboration;

  return (
    <LockedPanel
      title="Recommended collaboration direction"
      meta={locked || !data ? undefined : `from ${data.sampleSize} of their posts`}
      locked={locked}
      headline="Format guidance is locked"
      detail="What tends to travel on this creator's channel, measured across their own catalogue — and what that does and does not tell you."
    >
      {!locked && data ? (
        <>
          {data.withheld ? (
            /* Withheld is a result, not an empty state. Saying nothing here
               would read as "no guidance available"; saying this says why, and
               in the no-effect case the why is itself useful. */
            <p className="border-b border-line px-5 py-5 text-[12px] leading-relaxed text-ink-muted">
              {data.withheld}
            </p>
          ) : (
            <ul className="divide-y divide-line border-b border-line">
              {data.directions.map((d) => (
                <li key={d.driver.key} className="px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
                    <span className="text-[13px] font-medium text-ink">{d.headline}</span>
                    <Badge tone={RELEVANCE_TONE[d.relevance]}>
                      {RELEVANCE_LABEL[d.relevance]}
                    </Badge>
                  </div>

                  <p className="tnum mt-1.5 text-[11px] text-ink-muted">
                    {d.driver.label} ·{' '}
                    {d.driver.ratio !== null ? `${d.driver.ratio.toFixed(2)}× median views` : '—'} ·{' '}
                    {d.driver.withN} of {d.driver.withN + d.driver.withoutN} posts
                    {d.driver.p !== null ? ` · p=${d.driver.p.toFixed(3)}` : ''}
                  </p>

                  <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
                    {d.relevanceNote}
                  </p>

                  {d.evidence.length > 0 ? (
                    <div className="mt-2.5 border-l-2 border-line pl-3">
                      <p className="rail mb-1">Observed on</p>
                      {d.evidence.map((v) => (
                        <p key={v.id} className="tnum text-[11px] leading-relaxed text-ink-faint">
                          <a
                            href={`https://www.youtube.com/watch?v=${v.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-ink-muted hover:text-indigo hover:underline"
                          >
                            {v.title}
                          </a>{' '}
                          · {compactNumber(v.views)} views
                        </p>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {/* Unconditional. A limit shown only when the news is bad is not a
              limit, it is a hedge. */}
          <div className="px-5 py-3">
            <p className="rail mb-1.5">What this does not tell you</p>
            <ul className="space-y-1">
              {data.limits.map((l) => (
                <li key={l} className="text-[11px] leading-relaxed text-ink-faint">
                  {l}
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </LockedPanel>
  );
}
