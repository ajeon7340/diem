import type { AIReport } from '@/types';
import { BENCHMARKS_FROM_API_DATA } from './policy';

/**
 * How much of this report is worth believing.
 *
 * Most creators are small, and the pipeline will happily emit a purchase-intent
 * rate from forty comments. Rendered at the same visual weight as a figure
 * drawn from twelve thousand, that is not a thin signal — it is a wrong one,
 * and it is the failure mode that would make the product worthless for the long
 * tail it most needs to serve.
 *
 * Everything here is derived from counts already in the report, so there is no
 * new pipeline contract to keep in sync.
 */

export type Confidence = 'sufficient' | 'limited' | 'insufficient';

/**
 * Thresholds are judgement calls, stated once and in the open rather than
 * scattered through components.
 *
 * `COMMENTS` is the load-bearing one: below ~100 comments a four-way intent
 * split puts single digits in each bucket, so the percentages move several
 * points per comment and mean nothing.
 */
export const THRESHOLDS = {
  /** Comments needed before clustering and intent rates are meaningful. */
  COMMENTS: { limited: 100, sufficient: 400 },
  /** Sponsored posts needed before an organic comparison is more than anecdote. */
  SPONSORED_POSTS: { limited: 1, sufficient: 3 },
  /** Cohort size needed before a percentile is a ranking rather than a coincidence. */
  COHORT: { limited: 20, sufficient: 50 },
  /**
   * Distinct pieces of off-platform discussion — videos, articles, threads —
   * needed before the volume read means anything.
   *
   * Rebased when `mentions` was split into items and reactions. It used to
   * count comments, so seven commentary videos scored 7,906 and sailed past
   * `sufficient`; the real basis was seven pieces of content. The thresholds
   * are lower because the unit is now much coarser: a dozen independent pieces
   * is a thin read, fifty is a real one.
   */
  MENTIONS: { limited: 12, sufficient: 50 },
} as const;

function classify(value: number, band: { limited: number; sufficient: number }): Confidence {
  if (value >= band.sufficient) return 'sufficient';
  if (value >= band.limited) return 'limited';
  return 'insufficient';
}

/** Why the comment corpus is empty, in the words the notice uses. */
const NO_COMMENT_REASON = {
  disabled: 'The creator has comments turned off, so nothing here is measurable from them.',
  none_yet: 'No comments yet on any analysed post.',
  restricted: 'Comments could not be read for this account.',
} as const;

export interface ReportSufficiency {
  /** The weakest thing the whole report rests on. */
  overall: Confidence;
  comments: Confidence;
  sponsored: Confidence;
  benchmarks: Confidence;
  opinion: Confidence;
  /** Plain-language reasons, for the notice a buyer actually reads. */
  gaps: string[];
  /**
   * True when there is no comment corpus at all. Distinct from a thin one:
   * every qualitative score is unavailable rather than shaky, and the report
   * falls back to what platform analytics alone can support.
   */
  noComments: boolean;
  /**
   * Comments were READ but never classified.
   *
   * A third state, and it existed in the data long before anything could say
   * it. A creator scanned only by the risk census carries thousands of comments
   * and no axes, and every surface that checked "are there clusters" concluded
   * "there are no comments" — so @가재맨 rendered "No readable comments on the
   * analysed posts" directly beneath "2,392 comments analysed", on one page.
   *
   * Nothing was wrong with the data. The UI had two words for three facts:
   * none read, read and classified, read and not classified.
   */
  unclassified: boolean;
}

export function assessReport(report: AIReport): ReportSufficiency {
  const noComments = report.commentsAnalyzed === 0;
  // Read, but no classifier pass. The axes are the classifier's output, so
  // their absence over a non-empty corpus is exactly this state.
  const unclassified =
    !noComments && (report.commentAxes === null || report.commentAxes.total === 0);
  const comments = classify(report.commentsAnalyzed, THRESHOLDS.COMMENTS);

  const sponsoredPosts = report.sponsoredPerformance?.sponsoredPostsAnalyzed ?? 0;
  const sponsored = classify(sponsoredPosts, THRESHOLDS.SPONSORED_POSTS);

  const benchmarks = report.benchmarks
    ? classify(report.benchmarks.cohortSize, THRESHOLDS.COHORT)
    : 'insufficient';

  const opinion = report.publicOpinion
    ? classify(report.publicOpinion.itemsAnalyzed, THRESHOLDS.MENTIONS)
    : 'insufficient';

  const gaps: string[] = [];

  if (noComments) {
    const reason = report.coverage?.reason;
    gaps.push(
      reason
        ? NO_COMMENT_REASON[reason]
        : 'No readable comments, so sentiment, purchase intent and brand safety are unavailable.',
    );
  } else if (unclassified) {
    // Says which pass is missing, because that is the actionable part: the
    // corpus is already here and the figures arrive when it is classified.
    gaps.push(
      `${report.commentsAnalyzed.toLocaleString('en-US')} comments have been read but not classified, so sentiment, purchase intent and the intent clusters are unavailable. This is a missing pass, not a missing audience.`,
    );
  } else if (comments !== 'sufficient') {
    gaps.push(
      `Only ${report.commentsAnalyzed.toLocaleString('en-US')} comments analysed — intent and sentiment rates will move as more arrive.`,
    );
  }

  // Partial coverage is a bias problem, not just a volume one.
  const coverage = report.coverage;
  if (
    !noComments &&
    coverage &&
    coverage.postsAnalyzed > 0 &&
    coverage.postsWithComments / coverage.postsAnalyzed < 0.5
  ) {
    gaps.push(
      `Comments readable on only ${coverage.postsWithComments} of ${coverage.postsAnalyzed} posts — the sample is skewed toward those, not the channel.`,
    );
  }
  if (sponsored === 'insufficient') {
    gaps.push('No sponsored posts yet, so there is no paid baseline to compare against.');
  } else if (sponsored === 'limited') {
    gaps.push(
      `Only ${sponsoredPosts} sponsored ${sponsoredPosts === 1 ? 'post' : 'posts'} in the window — treat the comparison as anecdotal.`,
    );
  }
  // Only a gap while ranking is something we could do. With cross-creator
  // comparison switched off there is nothing to be short of, and reporting a
  // thin cohort as the reason would blame the data for a decision the
  // policy made — a reader would reasonably expect the ranking to appear once
  // enough creators joined, and it will not.
  if (BENCHMARKS_FROM_API_DATA && benchmarks !== 'sufficient') {
    gaps.push('Category cohort is too small to rank against, so percentiles are withheld.');
  }
  if (opinion !== 'sufficient') {
    gaps.push(
      'Little off-platform discussion found, so the volume and themes are directional at best.',
    );
  }

  // The report is only as trustworthy as the comment corpus underneath it —
  // every qualitative signal is derived from it, so it caps the overall read.
  const overall: Confidence =
    comments === 'insufficient'
      ? 'insufficient'
      : comments === 'limited' || (benchmarks === 'insufficient' && sponsored === 'insufficient')
        ? 'limited'
        : 'sufficient';

  return { overall, comments, sponsored, benchmarks, opinion, gaps, noComments, unclassified };
}

/** Short label for a panel meta line. */
export function confidenceLabel(confidence: Confidence): string | undefined {
  if (confidence === 'sufficient') return undefined;
  return confidence === 'limited' ? 'limited sample' : 'insufficient sample';
}
