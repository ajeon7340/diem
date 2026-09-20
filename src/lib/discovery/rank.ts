import type { DiscoveryCandidate, Relevance } from './types';

/**
 * Ranking, and the four ways ranking lies.
 *
 * 1. MISSING BECOMES ZERO. A channel whose subscriber count is hidden, or
 *    whose evidence did not survive retrieval, scores 0 on that signal and
 *    lands below a channel that scored badly on it. "We could not measure this"
 *    and "this measured badly" are opposite findings and they must not produce
 *    the same number. Here a missing signal leaves BOTH sides of the average —
 *    it is not counted against, and it is not quietly counted for.
 *
 * 2. RENORMALISING THIN EVIDENCE INTO A STRONG RESULT. Dropping the missing
 *    signals out of the denominator fixes (1) and creates this: one signal
 *    present, scoring 0.9, renormalises to 0.9 overall and prints as a strong
 *    match on the strength of a single video title. So the BAND is capped by
 *    how much of the total weight had evidence behind it. A candidate measured
 *    on a third of the signals cannot read as strong however well it did on
 *    that third.
 *
 * 3. FALSE PRECISION. 0.7413 against 0.7397 is a coin toss dressed as an
 *    ordering. Scores are quantised into bands and equal bands TIE — the UI
 *    renders tied results as one group and says their order is arbitrary.
 *
 * 4. THE EXPLANATION STAGE MOVING THINGS. Reasons are written after ranking,
 *    and a model that writes them must not be able to reorder anything.
 *    `freezeOrder` and `assertOrderUnchanged` make that checkable rather than
 *    conventional.
 */

export interface Signal {
  key: string;
  label: string;
  /** 0–1, or null when there was no evidence to compute it from. */
  value: number | null;
  weight: number;
  /** Why it is null. Shown to the customer; required when value is null. */
  missingBecause?: string;
}

/**
 * Below this share of the total weight, a score is not reported as a ranking at
 * all — the candidate is provisional and sorts after everything that is not.
 */
export const PROVISIONAL_BELOW = 0.5;

/** Quantisation step. 0.1 makes ties common on purpose. */
export const BAND_STEP = 0.1;

export function scoreSignals(signals: Signal[]): Omit<Relevance, 'tiedGroup'> {
  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
  const present = signals.filter((s) => s.value !== null);
  const presentWeight = present.reduce((sum, s) => sum + s.weight, 0);

  const evidenceCoverage = totalWeight === 0 ? 0 : presentWeight / totalWeight;
  const score =
    presentWeight === 0
      ? 0
      : present.reduce((sum, s) => sum + s.weight * clamp(s.value!), 0) / presentWeight;

  return {
    score,
    evidenceCoverage,
    band: band(score, evidenceCoverage),
    missing: signals.filter((s) => s.value === null).map((s) => s.missingBecause ?? s.label),
    parts: signals.map((s) => ({ key: s.key, label: s.label, value: s.value, weight: s.weight })),
  };
}

function clamp(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/**
 * The band, capped by evidence coverage.
 *
 * The cap is the whole of rule (2): a score computed over half the signals may
 * reach 'moderate' and no further, and one computed over less than half is not
 * a band at all.
 */
export function band(score: number, evidenceCoverage: number): Relevance['band'] {
  if (evidenceCoverage < PROVISIONAL_BELOW) return 'provisional';
  const natural: Relevance['band'] = score >= 0.7 ? 'strong' : score >= 0.4 ? 'moderate' : 'weak';
  if (evidenceCoverage < 0.75 && natural === 'strong') return 'moderate';
  return natural;
}

/**
 * Order the candidates and number the ties.
 *
 * Provisional candidates sort last regardless of score, because a high number
 * over thin evidence is precisely the thing that must not lead a list.
 * Otherwise the sort is by quantised band, and ORIGINAL ORDER breaks ties —
 * which for every mode here is the order YouTube returned, i.e. the one
 * ordering in the pipeline that is not ours.
 */
export function rankCandidates(
  candidates: DiscoveryCandidate[],
  score: (candidate: DiscoveryCandidate) => Omit<Relevance, 'tiedGroup'> | null,
): DiscoveryCandidate[] {
  const scored = candidates.map((candidate, index) => {
    const relevance = score(candidate);
    return { candidate, index, relevance };
  });

  scored.sort((a, b) => {
    if (!a.relevance || !b.relevance) return a.index - b.index;
    const aProvisional = a.relevance.band === 'provisional';
    const bProvisional = b.relevance.band === 'provisional';
    if (aProvisional !== bProvisional) return aProvisional ? 1 : -1;
    const bucketDiff = bucket(b.relevance.score) - bucket(a.relevance.score);
    if (bucketDiff !== 0) return bucketDiff;
    return a.index - b.index;
  });

  let group = 0;
  let previous: number | null = null;
  let previousProvisional: boolean | null = null;

  return scored.map((entry) => {
    if (!entry.relevance) return { ...entry.candidate, relevance: null };
    const currentBucket = bucket(entry.relevance.score);
    const provisional = entry.relevance.band === 'provisional';
    if (previous === null || currentBucket !== previous || provisional !== previousProvisional) {
      group += 1;
      previous = currentBucket;
      previousProvisional = provisional;
    }
    return { ...entry.candidate, relevance: { ...entry.relevance, tiedGroup: group } };
  });
}

export function bucket(score: number): number {
  return Math.round(score / BAND_STEP);
}

/**
 * The ranking, as it stood before anything wrote prose about it.
 *
 * Captured and compared rather than trusted: the explanation stage takes the
 * ranked list, adds sentences, and hands it back, and nothing in that shape
 * stops it returning the list in a different order or dropping a row. This
 * turns "it would not do that" into an exception.
 */
export function freezeOrder(candidates: DiscoveryCandidate[]): string[] {
  return candidates.map((c) => c.channelId);
}

export function assertOrderUnchanged(frozen: string[], candidates: DiscoveryCandidate[]): void {
  const now = freezeOrder(candidates);
  if (now.length !== frozen.length || now.some((id, i) => id !== frozen[i])) {
    throw new Error(
      'discovery: the explanation stage changed the ranking. Explanations describe an order; ' +
        'they do not produce one.',
    );
  }
}

/**
 * How many distinct results a signal like "we found videos for it" should max
 * out at.
 *
 * Past a handful, more matching videos does not mean a better match — it means
 * a bigger channel. Capping keeps the signal about relevance rather than size,
 * which is a different question the customer can filter on directly.
 */
export const EVIDENCE_DEPTH_CAP = 4;

export function depthSignal(evidenceCount: number): number | null {
  if (evidenceCount <= 0) return null;
  return Math.min(1, evidenceCount / EVIDENCE_DEPTH_CAP);
}

/**
 * Term coverage: the share of the customer's own terms that appear in text we
 * retrieved. Null when there were no terms to look for — not zero, which would
 * read as "none of your terms matched".
 */
export function termCoverageSignal(terms: string[], matched: string[]): number | null {
  const wanted = terms.map((t) => t.trim()).filter((t) => t.length > 1);
  if (wanted.length === 0) return null;
  const hit = new Set(matched.map((m) => m.trim().toLowerCase()));
  return wanted.filter((t) => hit.has(t.toLowerCase())).length / wanted.length;
}

/**
 * Scale proximity on a log axis, because subscriber counts are log-distributed:
 * 10k against 30k is the same distance as 100k against 300k, and a linear
 * measure makes every small channel look identical and every large one far
 * apart. Null when either side hides its count.
 */
export function scaleSignal(reference: number | null, candidate: number | null): number | null {
  if (!reference || !candidate || reference <= 0 || candidate <= 0) return null;
  const ratio = Math.abs(Math.log10(candidate / reference));
  // One order of magnitude apart scores 0; identical scores 1.
  return Math.max(0, 1 - ratio);
}
