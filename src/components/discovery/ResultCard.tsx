import { Badge } from '@/components/ui/Badge';
import {
  EVIDENCE_CLASS_LABEL,
  EVIDENCE_CLASS_LIMIT,
  type DiscoveryCandidate,
  type Relevance,
} from '@/lib/discovery/types';

/**
 * One creator, as a row you can scan rather than a page you have to read.
 *
 * WHAT LEADS: the picture, the name, the handle, what the channel is about, and
 * why this search surfaced it. WHAT FOLLOWS, quietly: subscribers, uploads,
 * views, collection time. A buyer scanning twenty rows is asking "is this the
 * kind of creator I want" — subscriber count answers a later question, and
 * putting it in the same weight as the reason makes the list sort itself by
 * size in the reader's head.
 *
 * NOTHING LONG IS OPEN BY DEFAULT. The supporting videos, the collaboration
 * records and the score breakdown are all one disclosure away, and the full
 * read of the channel is a different page. A list that expands three reports
 * inline is a list nobody scrolls.
 *
 * What is NOT behind a disclosure is any sentence that qualifies a claim. A
 * limitation you have to open something to find is a limitation most readers
 * never see.
 */

const BAND_TONE: Record<Relevance['band'], 'emerald' | 'indigo' | 'slate' | 'amber'> = {
  strong: 'emerald',
  moderate: 'indigo',
  weak: 'slate',
  provisional: 'amber',
};

const BAND_LABEL: Record<Relevance['band'], string> = {
  strong: 'Strong match',
  moderate: 'Moderate match',
  weak: 'Weak match',
  provisional: 'Provisional',
};

export function ResultCard({
  candidate,
  position,
  ranked,
  selected,
  children,
}: {
  candidate: DiscoveryCandidate;
  position: number;
  /** Whether OUR scoring ran. False renders YouTube's order and says so. */
  ranked: boolean;
  selected?: boolean;
  children?: React.ReactNode;
}) {
  const relevance = candidate.relevance;
  const disclosed = candidate.collaborations.filter((r) => r.classification === 'explicit_paid').length;

  return (
    <article
      className={`rounded-xl border bg-surface p-3.5 transition-colors sm:p-4 ${
        selected ? 'border-indigo/40 bg-indigo-wash/25' : 'border-line hover:border-line-strong'
      }`}
    >
      <div className="flex gap-3.5">
        {candidate.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={candidate.avatar} alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-full" />
        ) : (
          <div
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-paper text-[13px] font-semibold text-ink-faint"
          >
            {candidate.title.slice(0, 1)}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3 className="text-[14px] font-semibold text-ink">{candidate.title}</h3>
            {candidate.handle ? <span className="text-[12px] text-ink-muted">{candidate.handle}</span> : null}
            {ranked && relevance ? (
              <Badge tone={BAND_TONE[relevance.band]} className="ml-auto shrink-0">
                {BAND_LABEL[relevance.band]}
              </Badge>
            ) : (
              <span className="tnum ml-auto shrink-0 text-[11px] text-ink-faint">#{position + 1}</span>
            )}
          </div>

          {candidate.description ? (
            <p className="mt-1 line-clamp-1 text-[12px] text-ink-muted">{candidate.description}</p>
          ) : null}

          <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-ink">{candidate.reason}</p>

          {/* Secondary by design: figures a buyer needs later, not while
              deciding whether this is the right kind of creator at all. */}
          <dl className="tnum mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] text-ink-faint">
            <Stat
              label="subs"
              value={
                candidate.hiddenSubscribers
                  ? 'hidden'
                  : candidate.subscribers === null
                    ? 'not reported'
                    : compact(candidate.subscribers)
              }
            />
            <Stat label="uploads" value={candidate.videoCount === null ? 'not reported' : compact(candidate.videoCount)} />
            <Stat label="views" value={candidate.viewCount === null ? 'not reported' : compact(candidate.viewCount)} />
            {candidate.collectedAt ? <Stat label="read" value={candidate.collectedAt.slice(0, 10)} /> : null}
          </dl>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
            {children}
            <a
              href={candidate.url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-[12px] text-ink-muted underline-offset-4 hover:text-ink hover:underline"
            >
              YouTube
            </a>
            {candidate.collaborations.length > 0 ? (
              <Disclosure label={`Evidence (${candidate.collaborations.length}${disclosed ? `, ${disclosed} disclosed` : ''})`}>
                <ul className="space-y-3">
                  {candidate.collaborations.map((record) => (
                    <li key={`${record.brand}-${record.videoId}`} className="border-t border-line pt-3 first:border-0 first:pt-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={record.classification === 'explicit_paid' ? 'emerald' : 'slate'}>
                          {EVIDENCE_CLASS_LABEL[record.classification]}
                        </Badge>
                        <span className="text-[12px] font-medium text-ink">{record.brand}</span>
                        {record.product ? <span className="text-[12px] text-ink-muted">· {record.product}</span> : null}
                      </div>
                      <a
                        href={record.videoUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-1.5 block text-[12px] text-indigo underline-offset-4 hover:underline"
                      >
                        {record.videoTitle}
                      </a>
                      {record.excerpt ? (
                        <blockquote className="mt-1.5 border-l-2 border-line pl-3 text-[12px] leading-relaxed text-ink-muted">
                          {record.excerpt}
                        </blockquote>
                      ) : null}
                      <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
                        {record.ambiguity} {EVIDENCE_CLASS_LIMIT[record.classification]}
                      </p>
                      <p className="tnum mt-1 text-[11px] text-ink-faint">
                        {record.publishedAt ? `Published ${record.publishedAt.slice(0, 10)} · ` : ''}
                        Collected {record.collectedAt.slice(0, 10)} · {record.source}
                      </p>
                    </li>
                  ))}
                </ul>
              </Disclosure>
            ) : null}

            {candidate.evidence.length > 0 ? (
              <Disclosure label={`Videos (${candidate.evidence.length})`}>
                <ul className="space-y-2">
                  {candidate.evidence.map((video) => (
                    <li key={video.videoId} className="text-[12px]">
                      <a
                        href={`https://www.youtube.com/watch?v=${video.videoId}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-indigo underline-offset-4 hover:underline"
                      >
                        {video.title}
                      </a>
                      <p className="mt-0.5 text-[11px] text-ink-faint">
                        {video.matchedTerms.length
                          ? `Matched ${video.matchedTerms.slice(0, 4).map((t) => `“${t}”`).join(', ')} in the ${video.matchedIn}`
                          : 'Returned by the search; none of your terms appear in the text read'}
                        {video.publishedAt ? ` · ${video.publishedAt.slice(0, 10)}` : ''}
                        {video.paidPromotion === true ? ' · YouTube flags paid promotion on this video' : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              </Disclosure>
            ) : null}

            {ranked && relevance ? (
              <Disclosure label={`Score — ${Math.round(relevance.evidenceCoverage * 100)}% measured`}>
                <ul className="space-y-1.5">
                  {relevance.parts.map((part) => (
                    <li key={part.key} className="flex flex-wrap items-baseline justify-between gap-2 text-[12px]">
                      <span className="text-ink-muted">{part.label}</span>
                      <span className={`tnum ${part.value === null ? 'text-ink-faint' : 'text-ink'}`}>
                        {part.value === null ? 'Not measured' : `${Math.round(part.value * 100)}%`}
                      </span>
                    </li>
                  ))}
                </ul>
                {relevance.missing.length ? (
                  <p className="mt-2.5 text-[11px] leading-relaxed text-ink-faint">
                    Not measured here: {relevance.missing.join(' ')}
                  </p>
                ) : null}
                <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
                  Results in group {relevance.tiedGroup} are not distinguished — their order inside it is arbitrary.
                </p>
              </Disclosure>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

/** A `details` styled as a quiet inline toggle rather than a panel. */
function Disclosure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="group w-full">
      <summary className="inline-flex cursor-pointer list-none items-center text-[12px] text-ink-muted underline-offset-4 hover:text-ink hover:underline">
        {label}
      </summary>
      <div className="mt-2.5 rounded-lg border border-line bg-paper px-3 py-2.5">{children}</div>
    </details>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <dt className="sr-only">{label}</dt>
      <dd>
        {value} <span className="text-[10px] uppercase tracking-wide">{label}</span>
      </dd>
    </div>
  );
}

/**
 * 76,500 reads as 76.5K in a row of four figures. The exact number is on the
 * channel's own report; this column is for scanning.
 */
function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  return String(value);
}
