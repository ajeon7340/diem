'use client';

import { useMemo, useState } from 'react';

import type { CommentAxes, CommentCluster, CommentIntent, CommentObject } from '@/types';
import { ChevronDown, ChevronUp } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import {
  compactNumber,
  exactNumber,
  largestRemainder,
  placeholderBars,
  shortDate,
  signedSentiment,
} from '@/lib/format';
import { RESIDUAL_ID, orderClusters, withResidual } from '@/lib/report/clusters';
import { EvidenceLink } from './EvidenceLink';
import { LockedPanel } from './LockedPanel';
import { cn } from '@/lib/cn';

const OBJECT_LABEL: Record<CommentObject, string> = {
  creator: 'The creator',
  content: 'The video',
  product: 'A product',
  // Named for what a buyer sees, not for the taxonomy. On a call-out channel
  // this is most of the section and it is not about the creator at all.
  subject: 'Someone in the video',
  unclassified: 'Unreadable',
};

const INTENT_LABEL: Record<CommentIntent, string> = {
  buy: 'Buy',
  request: 'Request',
  ask: 'Ask',
  praise: 'Praise',
  criticise: 'Criticise',
  abuse: 'Abuse',
  react: 'React',
  unclassified: 'Unclassified',
};

/**
 * Fills encode commercial relevance rather than category identity: emerald is
 * attached to something purchasable, indigo is directed engagement, slate is
 * undirected, and the palest fill is what could not be read. A reader can take
 * the meaning off the bar before reaching the legend.
 */
const OBJECT_FILL: Record<CommentObject, string> = {
  product: 'bg-emerald',
  creator: 'bg-indigo',
  content: 'bg-line-strong',
  // Same rung as `content`: directed at something on the page, but carrying no
  // commercial relevance. It must not read as engagement with the creator.
  subject: 'bg-line-strong',
  unclassified: 'bg-line',
};

const INTENT_FILL: Record<CommentIntent, string> = {
  buy: 'bg-emerald',
  request: 'bg-indigo',
  ask: 'bg-indigo',
  praise: 'bg-indigo',
  criticise: 'bg-amber',
  // Rose, not amber: this is not a stronger criticism, it is a different
  // thing, and it belongs to the moderation queue rather than the rating.
  abuse: 'bg-rose',
  react: 'bg-line-strong',
  unclassified: 'bg-line',
};

const INTENT_TONE: Record<CommentIntent, 'emerald' | 'indigo' | 'slate' | 'amber' | 'rose'> = {
  buy: 'emerald',
  request: 'emerald',
  ask: 'indigo',
  praise: 'indigo',
  criticise: 'amber',
  abuse: 'rose',
  react: 'slate',
  unclassified: 'slate',
};

/** Stated so a reader can tell a typical comment from a loud one. */
const BASIS_LABEL = {
  representative: 'typical',
  most_liked: 'most liked',
  most_recent: 'most recent',
} as const;

/** How many quotes the collapsed view shows before the focused view is opened. */
const PREVIEW = 2;

type SortKey = 'curated' | 'likes' | 'recent';

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'curated', label: 'Curated' },
  { key: 'likes', label: 'Most liked' },
  { key: 'recent', label: 'Newest' },
];

function sentimentTone(sentiment: number) {
  if (sentiment >= 0.4) return 'text-emerald';
  if (sentiment <= -0.15) return 'text-rose';
  return 'text-ink-muted';
}

function placeholderClusters(seed: string): CommentCluster[] {
  return placeholderBars(seed + 'clusters', 4).map((share, index) => ({
    id: `placeholder-${index}`,
    label: '████████ ██████',
    share: share * 0.3,
    commentCount: 0,
    sentiment: 0,
    object: null,
    intent: 'ask' as const,
    keyphrases: [],
    comments: [],
    exampleComment: '████ ███████ ██ ████████ ██████ ███ ████ ██████.',
  }));
}

/**
 * One axis of the taxonomy as a single 100% bar.
 *
 * This is the answer to "what is this comment section, in one line". The
 * cluster tabs below are the detail; these two rows are the whole corpus,
 * counted twice along independent axes, and each reconciles to the same total.
 */
function AxisBar({
  rail,
  slices,
  fill,
  label,
}: {
  rail: string;
  slices: Array<{ key: string; count: number }>;
  fill: Record<string, string>;
  label: Record<string, string>;
}) {
  const ranked = [...slices].filter((s) => s.count > 0).sort((a, b) => b.count - a.count);
  if (ranked.length === 0) return null;
  const pct = largestRemainder(ranked.map((s) => s.count));

  return (
    <div>
      <div className="rail">{rail}</div>
      <div className="mt-2 flex h-2 gap-px overflow-hidden rounded-sm">
        {ranked.map((slice, index) => (
          <div
            key={slice.key}
            className={cn('h-full', fill[slice.key] ?? 'bg-line')}
            style={{ flexGrow: Math.max(slice.count, 1) }}
            title={`${label[slice.key] ?? slice.key} ${pct[index]}%`}
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {ranked.map((slice, index) => (
          <li key={slice.key} className="flex items-baseline gap-1.5 text-[11px]">
            <span
              className={cn('h-2 w-2 shrink-0 translate-y-px rounded-[2px]', fill[slice.key] ?? 'bg-line')}
              aria-hidden
            />
            <span className="text-ink-muted">{label[slice.key] ?? slice.key}</span>
            <span className="tnum font-medium text-ink">{pct[index]}%</span>
            <span className="tnum text-ink-faint">{compactNumber(slice.count)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Comment clusters on two axes.
 *
 * The taxonomy used to be one enum, which meant "asking where to buy this
 * primer" and "asking who she is" were both `question` and the share of a
 * comment section attached to something purchasable was not a number the
 * report could produce. Splitting object from intent makes it one: sum the
 * `product` slice of the object axis. On the first real channel measured, that
 * was 6.7% against the 0.6% the single-axis model implied.
 *
 * Both axes are exhaustive and single-label, so each bar totals 100% and the
 * cluster tabs beneath — the cross-product — do too.
 */
export function ClustersPanel({
  clusters,
  axes,
  commentsAnalyzed,
  confidence,
  emptyReason,
  unclassified = false,
  seed,
}: {
  clusters: CommentCluster[] | null;
  /** Null until the creator has been through a two-axis pass. Absent, not zero. */
  axes: CommentAxes | null;
  /** Why there is nothing to cluster, when that is the case. */
  emptyReason?: string;
  /** Read but not classified — a different empty state from no comments. */
  unclassified?: boolean;
  /** Denominator for the per-cluster counts. A share alone hides the sample. */
  commentsAnalyzed: number;
  /** Set when the corpus is too small for the split to be stable. */
  confidence: string | undefined;
  seed: string;
}) {
  const locked = clusters === null;
  // Every bucket renders, including the one that used to be filtered out as
  // `off_topic`. Dropping a bucket while keeping `commentsAnalyzed` as the
  // denominator printed shares that summed to 46% under a header claiming
  // 21,330 comments — and the bucket it hid was the largest one.
  //
  // An empty array is not nullish, so this used to render an empty tablist and
  // a bar with no segments rather than saying anything.
  const empty = clusters !== null && clusters.length === 0;
  const data = orderClusters(
    clusters && clusters.length > 0
      ? withResidual(clusters, commentsAnalyzed)
      : placeholderClusters(seed),
  );

  // Highest share first: the default selection is the dominant perspective.
  const [selectedId, setSelectedId] = useState<string>(data[0]?.id ?? '');
  const [focused, setFocused] = useState(false);
  const [sort, setSort] = useState<SortKey>('curated');
  const selected = data.find((cluster) => cluster.id === selectedId) ?? data[0];

  // `curated` is the order the pipeline emitted: most-liked first, then the
  // typical band, then the newest. It is the only order that shows all three
  // bases near the top, so re-sorting is opt-in rather than the default —
  // sorting by likes on open would reproduce the loudest-fraction read the
  // curation exists to avoid.
  const evidence = useMemo(() => {
    const rows = selected?.comments ?? [];
    // Expired rows have no likes or date to sort on; they sink rather than
    // scattering through the list as zeroes.
    if (sort === 'likes') return [...rows].sort((a, b) => (b.likes ?? -1) - (a.likes ?? -1));
    if (sort === 'recent')
      return [...rows].sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
    return rows;
  }, [selected, sort]);

  // Rounded together, so the printed integers total exactly 100 instead of the
  // 99 or 101 that per-value rounding produces.
  const shown = largestRemainder(data.map((cluster) => cluster.share));

  if (empty) {
    return (
      <LockedPanel
        title="Comment intent clusters"
        // Two different facts, and this said the first one for both. A creator
        // read by the risk census alone has thousands of comments and no
        // clusters, and "no readable comments" printed under "2,392 comments
        // analysed" is a report contradicting itself on one screen.
        meta={unclassified ? 'not classified' : 'no readable comments'}
        locked={false}
        headline=""
        detail=""
      >
        <p className="px-5 py-8 text-center text-[12px] leading-relaxed text-ink-muted">
          {emptyReason ??
            (unclassified
              ? 'These comments have been read but not classified yet, so there is nothing to cluster. The corpus is here; the pass has not run.'
              : 'No readable comments on the analysed posts, so there is nothing to cluster.')}
        </p>
      </LockedPanel>
    );
  }

  return (
    <LockedPanel
      title="Comment intent clusters"
      meta={
        locked
          ? undefined
          : `${exactNumber(commentsAnalyzed)} comments${confidence ? ` · ${confidence}` : ''}`
      }
      locked={locked}
      headline="Comment intent clustering is locked"
      detail="Recent comments grouped by what they are about and what they want — buying, asking, requesting, praising, pushing back."
    >
      {!locked && axes ? (
        <div className="grid gap-5 border-b border-line px-5 py-4 sm:grid-cols-2">
          <AxisBar
            rail="What they are about"
            slices={axes.object}
            fill={OBJECT_FILL}
            label={OBJECT_LABEL}
          />
          <AxisBar
            rail="What they want"
            slices={axes.intent}
            fill={INTENT_FILL}
            label={INTENT_LABEL}
          />
        </div>
      ) : null}

      {/* Proportion bar: the whole split in one line. */}
      <div className="flex h-1.5 gap-px px-5 pt-4">
        {data.map((cluster, index) => (
          <button
            key={cluster.id}
            type="button"
            onClick={() => setSelectedId(cluster.id)}
            aria-label={`${cluster.label}, ${shown[index]}%`}
            className={cn(
              'h-full rounded-sm transition-opacity',
              INTENT_FILL[cluster.intent],
              selected?.id === cluster.id ? 'opacity-100' : 'opacity-35 hover:opacity-70',
            )}
            style={{ flexGrow: Math.max(cluster.share, 0.02) }}
          />
        ))}
      </div>

      <p className="rail px-5 pt-3">
        {axes
          ? 'about · wants · share of comments · count'
          : 'share of comments · count · sentiment −1 to +1'}
      </p>

      {/* The perspectives themselves, side by side. */}
      <div
        role="tablist"
        aria-label="Comment perspectives"
        className="mt-3 grid grid-cols-2 border-t border-line sm:grid-cols-3 lg:grid-cols-4"
      >
        {data.map((cluster, index) => {
          const active = selected?.id === cluster.id;
          return (
            <button
              key={cluster.id}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => {
                setSelectedId(cluster.id);
                setFocused(false);
                setSort('curated');
              }}
              className={cn(
                'flex flex-col items-start gap-1.5 border-b border-r border-line px-4 py-3.5 text-left transition-colors',
                'focus-visible:outline-none focus-visible:ring-inset focus-visible:ring-2 focus-visible:ring-indigo/40',
                active ? 'bg-paper' : 'bg-surface hover:bg-paper/60',
              )}
            >
              <span className="flex items-baseline gap-1.5">
                <span className="tnum text-[17px] font-medium leading-none text-ink">
                  {shown[index]}%
                </span>
                <span className="tnum text-[11px] leading-none text-ink-faint">
                  {locked
                    ? '—'
                    : exactNumber(
                        cluster.commentCount || Math.round(cluster.share * commentsAnalyzed),
                      )}
                </span>
              </span>
              <span className="text-[12px] leading-snug text-ink-muted">{cluster.label}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                {cluster.object ? (
                  <Badge tone="slate">{OBJECT_LABEL[cluster.object]}</Badge>
                ) : null}
                <Badge tone={INTENT_TONE[cluster.intent]}>{INTENT_LABEL[cluster.intent]}</Badge>
                {/* A score only where one was actually computed. Under the
                    two-axis pass the intent badge already carries valence, and
                    a number derived from the same lexicon would restate it. */}
                {cluster.id !== RESIDUAL_ID && cluster.sentiment !== null ? (
                  <span className={cn('tnum text-[11px]', sentimentTone(cluster.sentiment))}>
                    {signedSentiment(cluster.sentiment)}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {/* Checkable evidence for whichever perspective is selected. */}
      {selected ? (
        <div className="border-t border-line px-5 py-3.5" aria-live="polite">
          {selected.keyphrases.length > 0 && !locked ? (
            <p className="rail mb-2.5">defined by: {selected.keyphrases.join(' · ')}</p>
          ) : null}

          {selected.comments.length > 0 && !locked ? (
            <>
              {focused ? (
                <div
                  role="group"
                  aria-label="Order the curated comments"
                  className="mb-3 flex flex-wrap items-center gap-1"
                >
                  {SORTS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      aria-pressed={sort === option.key}
                      onClick={() => setSort(option.key)}
                      className={cn(
                        'rounded-md px-2 py-1 text-[11px] transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo/40',
                        sort === option.key
                          ? 'bg-indigo-wash font-medium text-indigo'
                          : 'text-ink-muted hover:bg-paper hover:text-ink',
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : null}

            <ul className="space-y-3">
              {(focused ? evidence : evidence.slice(0, PREVIEW)).map((comment) => (
                <li key={comment.id} className="border-l-2 border-line pl-3">
                  {/* A null text is an expired one — the 30-day verbatim cap
                      passed and the stored copy went. Said outright, because an
                      evidence box that has quietly lost its evidence is worse
                      than one that admits it. The link still resolves, and now
                      shows whatever YouTube shows today. */}
                  {comment.text === null ? (
                    <p className="text-[11px] leading-relaxed text-ink-faint">
                      Quote not stored — past the 30-day limit on holding YouTube comment text.
                      The comment itself is still there.
                    </p>
                  ) : (
                    <p className="text-[12px] italic leading-relaxed text-ink-muted">
                      “{comment.text}”
                    </p>
                  )}
                  <p className="tnum mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-ink-faint">
                    <span className="uppercase tracking-label">{BASIS_LABEL[comment.basis]}</span>
                    {comment.likes !== null ? (
                      <>
                        <span aria-hidden>·</span>
                        <span>{compactNumber(comment.likes)} likes</span>
                      </>
                    ) : null}
                    {comment.publishedAt !== null ? (
                      <>
                        <span aria-hidden>·</span>
                        <span>{shortDate(comment.publishedAt)}</span>
                      </>
                    ) : null}
                    <span aria-hidden>·</span>
                    <EvidenceLink
                      url={comment.url}
                      label={comment.postTitle ?? 'source'}
                      className="text-[10px]"
                    />
                  </p>
                </li>
              ))}
            </ul>

            {evidence.length > PREVIEW ? (
              <button
                type="button"
                onClick={() => setFocused((open) => !open)}
                aria-expanded={focused}
                className={cn(
                  'mt-3 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-indigo transition-colors',
                  'hover:bg-indigo-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo/40',
                )}
              >
                {focused ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                    Show fewer
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                    Read all {evidence.length} curated comments
                  </>
                )}
              </button>
            ) : null}
            </>
          ) : (
            <p className="border-l-2 border-line pl-3 text-[12px] italic leading-relaxed text-ink-muted">
              “{selected.exampleComment}”
            </p>
          )}
        </div>
      ) : null}
    </LockedPanel>
  );
}
