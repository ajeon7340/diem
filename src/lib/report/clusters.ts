import type { CommentCluster } from '@/types';

/**
 * Closing the comment taxonomy to 100%.
 *
 * Cluster shares are meant to be parts of a whole, and the panel draws them as
 * one. Two things used to break that promise, both silently:
 *
 *   1. The UI filtered `off_topic` out of the display while the header kept
 *      `commentsAnalyzed` as the denominator. On one real channel the visible
 *      clusters summed to 46% of a total labelled 21,330 — the dropped bucket
 *      was 11,643 comments, and it was the most commercially significant thing
 *      in the report. That filter is gone; see `CommentIntent` in src/types.
 *
 *   2. A classifier that cannot place every comment leaves a gap. Nothing
 *      represented the gap, so the bar simply came up short and no figure in
 *      the report said why.
 *
 * `withResidual` fixes the second: it measures the shortfall and names it,
 * rather than letting the reader infer a total that was never claimed. An
 * unnamed gap reads as a rounding artefact; a named one reads as what it is —
 * comments the model could not classify.
 */

export const RESIDUAL_ID = 'residual-unclassified';

/**
 * The tail of the grid, rolled into one row.
 *
 * A DIFFERENT GAP from the residual above, and conflating them would be a
 * false finding either way. The residual is comments the model could not
 * place. This is comments it placed perfectly well, into cells too small to
 * be worth a box.
 *
 * The object x intent grid has up to forty cells and a real channel fills
 * fifteen to thirty. Measured across three: the largest EIGHT carry 92-97% of
 * the comments, and the remainder is a dozen boxes holding a handful each.
 * That is not a finer reading of an audience — it is the same reading made
 * unreadable.
 */
export const TAIL_ID = 'tail-smaller-groups';

/** Named cells kept before the tail is rolled up. See `TAIL_ID`. */
export const MAX_NAMED_CLUSTERS = 8;

/**
 * Half a displayed percentage point. Below this the shortfall cannot change
 * any rendered integer, so naming it would add a bucket nobody can see.
 */
const MIN_VISIBLE_SHARE = 0.005;

export function withResidual(
  clusters: CommentCluster[],
  commentsAnalyzed: number,
): CommentCluster[] {
  if (clusters.length === 0) return clusters;

  const covered = clusters.reduce((sum, c) => sum + c.share, 0);
  const gap = 1 - covered;
  if (gap < MIN_VISIBLE_SHARE) return clusters;

  const counted = clusters.reduce((sum, c) => sum + c.commentCount, 0);
  // Prefer the real count. Fall back to the share only when counts are absent,
  // and never let a rounding disagreement produce a negative.
  const residualCount =
    commentsAnalyzed > 0 && counted > 0
      ? Math.max(0, commentsAnalyzed - counted)
      : Math.round(gap * commentsAnalyzed);

  return [
    ...clusters,
    {
      id: RESIDUAL_ID,
      label: 'Unclassified',
      share: gap,
      commentCount: residualCount,
      // Not zero-sentiment — no sentiment. Zero would render as "neutral",
      // which is a finding; these comments were never read successfully.
      sentiment: null,
      object: 'unclassified',
      intent: 'unclassified',
      keyphrases: [],
      comments: [],
      exampleComment:
        'Comments the classifier could not place — emoji-only, spam, or a language the model does not cover.',
    },
  ];
}

/**
 * Display order: largest share first, with the residual pinned last however
 * big it is. The leading bucket is the default selection, so it has to be the
 * dominant perspective rather than whichever the pipeline happened to emit
 * first — and "Unclassified" must never be what a reader lands on.
 */
export function orderClusters(clusters: CommentCluster[]): CommentCluster[] {
  return [...clusters].sort((a, b) => {
    // Both rollups sink, however big they are: neither is a perspective a
    // reader should land on. The tail sits above the residual because it is at
    // least made of comments somebody understood.
    if (a.id === RESIDUAL_ID) return 1;
    if (b.id === RESIDUAL_ID) return -1;
    if (a.id === TAIL_ID) return 1;
    if (b.id === TAIL_ID) return -1;
    if (a.intent === 'unclassified') return 1;
    if (b.intent === 'unclassified') return -1;
    return b.share - a.share;
  });
}
