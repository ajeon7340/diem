import { medianViews } from './ranges';
import { matchedTerms } from './candidates';
import type { NarrowFilters } from './filter-state';
import type { DiscoveryCandidate } from './types';

/**
 * Narrowing: an array filter over candidates the last run already fetched.
 *
 * NOTHING IS REFETCHED AND NOTHING IS DISCARDED. Every candidate the run
 * returned stays in the array; this reports which of them pass and which each
 * filter removed. That is what makes "142 shown · 87 hidden" true, what makes
 * relaxing a filter instant, and what makes the count honest when a filter is
 * loosened rather than re-asked.
 *
 * UNMEASURED IS KEPT, EVERY TIME. A channel that hides its subscriber count has
 * not failed a "10K to 100K" filter; it has declined to answer it. Dropping it
 * would delete a creator for a privacy setting they chose, and would make the
 * hidden count a lie about why.
 *
 * THE COUNTS ARE PER FILTER, NOT A TOTAL, so the interface can name the filter
 * that is doing the most work instead of guessing which one is strictest.
 */

export interface NarrowOutcome {
  shown: DiscoveryCandidate[];
  /** Everything the run returned, untouched. */
  total: number;
  hidden: number;
  /** How many rows each filter removed, counted independently. */
  removedBy: Partial<Record<keyof NarrowFilters, number>>;
  /** Kept despite a filter because the figure it reads was not reported. */
  unmeasured: number;
}

const inRange = (value: number | null, min: number | null, max: number | null): boolean | null => {
  if (min === null && max === null) return true;
  if (value === null) return null; // unmeasured: neither in nor out
  if (min !== null && value < min) return false;
  if (max !== null && value > max) return false;
  return true;
};

/** Typical views of the videos THIS run retrieved. Never a channel average. */
export function typicalViews(candidate: DiscoveryCandidate): number | null {
  return medianViews(candidate.evidence.map((video) => video.views));
}

/** The newest retrieved upload, in days before the run's collection date. */
export function daysSinceLastUpload(candidate: DiscoveryCandidate): number | null {
  const times = candidate.evidence
    .map((video) => Date.parse(video.publishedAt))
    .filter((time) => Number.isFinite(time));
  if (times.length === 0) return null;
  const collected = Date.parse(candidate.collectedAt);
  if (!Number.isFinite(collected)) return null;
  return Math.max((collected - Math.max(...times)) / 86_400_000, 0);
}

function excludedTerms(value: string): string[] {
  return value
    .split(',')
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
    .slice(0, 12);
}

export function narrow(
  candidates: DiscoveryCandidate[],
  filters: NarrowFilters,
): NarrowOutcome {
  const removedBy: NarrowOutcome['removedBy'] = {};
  const terms = excludedTerms(filters.excludedKeywords);
  let unmeasured = 0;

  const bump = (key: keyof NarrowFilters) => {
    removedBy[key] = (removedBy[key] ?? 0) + 1;
  };

  const shown = candidates.filter((candidate) => {
    let kept = true;
    let wasUnmeasured = false;

    const bySubs = inRange(candidate.subscribers, filters.subscriberMin, filters.subscriberMax);
    if (bySubs === false) {
      bump('subscriberMin');
      kept = false;
    } else if (bySubs === null) {
      wasUnmeasured = true;
    }

    const byViews = inRange(typicalViews(candidate), filters.avgViewsMin, filters.avgViewsMax);
    if (byViews === false) {
      bump('avgViewsMin');
      kept = false;
    } else if (byViews === null) {
      wasUnmeasured = true;
    }

    if (filters.lastUploadWithinDays !== null) {
      const since = daysSinceLastUpload(candidate);
      if (since === null) wasUnmeasured = true;
      else if (since > filters.lastUploadWithinDays) {
        bump('lastUploadWithinDays');
        kept = false;
      }
    }

    if (terms.length) {
      // A term in any retrieved title or in the channel's own description.
      // Matching is the same routine discovery uses to report which query
      // terms appeared, so an exclusion cannot be stricter than a match.
      const text = [candidate.title, candidate.description ?? '', ...candidate.evidence.map((v) => v.title)].join('\n');
      if (matchedTerms(terms, text).length > 0) {
        bump('excludedKeywords');
        kept = false;
      }
    }

    if (kept && wasUnmeasured) unmeasured += 1;
    return kept;
  });

  return {
    shown,
    total: candidates.length,
    hidden: candidates.length - shown.length,
    removedBy,
    unmeasured,
  };
}

/** True when any narrow filter is doing something. */
export function isNarrowing(filters: NarrowFilters): boolean {
  return (
    filters.subscriberMin !== null ||
    filters.subscriberMax !== null ||
    filters.avgViewsMin !== null ||
    filters.avgViewsMax !== null ||
    filters.lastUploadWithinDays !== null ||
    filters.excludedKeywords.trim() !== ''
  );
}
