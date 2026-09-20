import { Badge } from '@/components/ui/Badge';
import {
  EVIDENCE_CLASS_LABEL,
  EVIDENCE_CLASS_LIMIT,
  type DiscoveryCandidate,
  type Relevance,
} from '@/lib/discovery/types';

/**
 * One candidate, with its evidence one click away and its caveats not.
 *
 * WHAT IS ALWAYS VISIBLE: who this is, why it appeared, when it was collected,
 * and — where ranking ran — how well supported the ranking is. WHAT IS BEHIND A
 * DISCLOSURE: the individual videos. Nothing that qualifies a claim hides
 * behind a tooltip; a limitation somebody has to hover to find is a limitation
 * most readers never see.
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
  provisional: 'Provisional — thin evidence',
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
  /** Actions, supplied by the list so selection stays in one place. */
  children?: React.ReactNode;
}) {
  const relevance = candidate.relevance;

  return (
    <article
      className={`surface-card p-4 transition-colors sm:p-5 ${selected ? 'border-indigo/40 bg-indigo-wash/30' : ''}`}
    >
      <div className="flex flex-wrap items-start gap-4">
        {candidate.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={candidate.avatar} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-full" />
        ) : (
          <div
            aria-hidden
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-paper text-[13px] font-semibold text-ink-faint"
          >
            {candidate.title.slice(0, 1)}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h3 className="truncate text-[15px] font-semibold text-ink">{candidate.title}</h3>
            {candidate.handle ? (
              <span className="truncate text-[12px] text-ink-muted">{candidate.handle}</span>
            ) : null}
            <a
              href={candidate.url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-[12px] text-indigo underline-offset-4 hover:underline"
            >
              Open on YouTube
            </a>
          </div>

          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px]">
            <Stat
              label="Subscribers"
              value={
                candidate.hiddenSubscribers
                  ? 'Hidden by the creator'
                  : candidate.subscribers?.toLocaleString('en-US') ?? 'Not reported'
              }
            />
            <Stat label="Public uploads" value={candidate.videoCount?.toLocaleString('en-US') ?? 'Not reported'} />
            <Stat label="Channel views" value={candidate.viewCount?.toLocaleString('en-US') ?? 'Not reported'} />
          </dl>

          <p className="mt-3 max-w-[70ch] text-[13px] leading-relaxed text-ink">{candidate.reason}</p>

          {candidate.description ? (
            <p className="mt-2 max-w-[70ch] truncate text-[12px] text-ink-muted">{candidate.description}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="tnum text-[11px] text-ink-faint">
            {ranked && relevance ? `Group ${relevance.tiedGroup}` : `#${position + 1} as YouTube returned`}
          </span>
          {ranked && relevance ? (
            <Badge tone={BAND_TONE[relevance.band]}>{BAND_LABEL[relevance.band]}</Badge>
          ) : null}
        </div>
      </div>

      {ranked && relevance ? <RelevanceDetail relevance={relevance} /> : null}

      {candidate.collaborations.length > 0 ? (
        <details className="mt-3 rounded-xl border border-line bg-paper px-3 py-2">
          <summary className="cursor-pointer text-[12px] font-medium text-ink">
            Collaboration evidence ({candidate.collaborations.length})
          </summary>
          <ul className="mt-3 space-y-3">
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
        </details>
      ) : null}

      {candidate.evidence.length > 0 ? (
        <details className="mt-2 rounded-xl border border-line bg-paper px-3 py-2">
          <summary className="cursor-pointer text-[12px] font-medium text-ink">
            Supporting videos ({candidate.evidence.length})
          </summary>
          <ul className="mt-3 space-y-2">
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
                    ? `Matched ${video.matchedTerms.map((t) => `“${t}”`).join(', ')} in the ${video.matchedIn}`
                    : 'Returned by the search; none of your terms appear in the text read'}
                  {video.publishedAt ? ` · published ${video.publishedAt.slice(0, 10)}` : ''}
                  {video.paidPromotion === true ? ' · YouTube flags paid promotion on this video' : ''}
                </p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <p className="tnum mt-3 text-[11px] text-ink-faint">
        Collected {candidate.collectedAt ? candidate.collectedAt.slice(0, 16).replace('T', ' ') : 'unknown'} UTC
      </p>

      {children ? <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div> : null}
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-ink-faint">{label}</dt>
      <dd className="tnum font-medium text-ink">{value}</dd>
    </div>
  );
}

/**
 * The score, taken apart.
 *
 * A single number is not checkable; its parts are. A signal with no evidence
 * shows as "not measured" and NOT as a zero — the two sort identically on a bar
 * chart and mean opposite things.
 */
function RelevanceDetail({ relevance }: { relevance: Relevance }) {
  return (
    <details className="mt-3 rounded-xl border border-line bg-paper px-3 py-2">
      <summary className="cursor-pointer text-[12px] font-medium text-ink">
        How this was scored — {Math.round(relevance.evidenceCoverage * 100)}% of the signals had evidence
      </summary>
      <ul className="mt-3 space-y-1.5">
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
        Results in the same group are not distinguished — their order inside it is arbitrary.
      </p>
    </details>
  );
}
