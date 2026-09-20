import type { AnalysisJob } from '@/types';
import type { Coverage, EmptyReason } from './types';

/**
 * What a search is doing, in one word a customer can act on.
 *
 * SEVEN STATES, and the ones people collapse are exactly the ones that matter:
 *
 *   'Not started'   no job. Different from queued.
 *   'Queued'        a worker will take it.
 *   'Running'       a worker has it.
 *   'Partial'       it stopped at a bound WITH results. Not a failure.
 *   'Cancelled'     somebody stopped it. Not a failure either.
 *   'Insufficient'  it ran, completed, and found nothing to show.
 *   'Failed'        our pass broke. Says nothing about how many creators exist.
 *
 * The last two are the pair this product keeps having to separate. "We searched
 * and found nobody" and "our search did not complete" look identical on a page
 * that renders an empty list for both, and only one of them is a fact about the
 * customer's market.
 */
export type SearchState =
  | 'not_started'
  | 'queued'
  | 'running'
  | 'partial'
  | 'cancelled'
  | 'insufficient'
  | 'failed'
  | 'completed';

export const SEARCH_STATE_LABEL: Record<SearchState, string> = {
  not_started: 'Not started',
  queued: 'Queued',
  running: 'Searching',
  partial: 'Partially completed',
  cancelled: 'Cancelled',
  insufficient: 'Completed with insufficient evidence',
  failed: 'Failed',
  completed: 'Completed',
};

export function searchState(
  jobs: AnalysisJob[],
  candidateCount: number,
  collectedAt: string | null,
  emptyReason: EmptyReason | null,
): SearchState {
  // A live job outranks a stored result: a refresh in flight over yesterday's
  // candidates is "searching", and the page keeps showing the old set beneath
  // it with its own collection time.
  if (jobs.some((j) => j.status === 'running')) return 'running';
  if (jobs.some((j) => j.status === 'queued')) return 'queued';
  if (jobs.some((j) => j.status === 'cancelled')) return 'cancelled';
  if (jobs.some((j) => j.status === 'partial')) return 'partial';
  if (jobs.some((j) => j.status === 'failed')) return collectedAt ? 'partial' : 'failed';
  if (!collectedAt && jobs.length === 0) return 'not_started';
  if (!collectedAt) return 'failed';
  // Ran, committed, and has nothing to show. A reason is what separates this
  // from a bug — see EMPTY_REASON_COPY.
  if (candidateCount === 0) return emptyReason === null ? 'completed' : 'insufficient';
  return 'completed';
}

/**
 * How far along, in observed events only.
 *
 * NO PERCENTAGE. A discovery run does not know how many queries it will make
 * until the bounds bite, and a bar that fills to 60% and stops is a lie told
 * confidently. The stages are what actually happened.
 */
export function searchStage(job: AnalysisJob | null): string | null {
  if (!job || (job.status !== 'running' && job.status !== 'queued')) return null;
  if (job.status === 'queued') return 'Waiting for a worker.';
  switch (job.progressStage) {
    case 'fetching':
      return 'Searching YouTube.';
    case 'analysis':
      return 'Reading the channels and videos that came back.';
    case 'storing':
      return 'Storing results.';
    default:
      return 'Running.';
  }
}

/** One sentence about what the run reached. Every count names what it counts. */
export function coverageSentence(coverage: Coverage | null): string | null {
  if (!coverage) return null;
  const parts = [
    `${coverage.searchCalls} search${coverage.searchCalls === 1 ? '' : 'es'}`,
    `${coverage.resultsSeen} result${coverage.resultsSeen === 1 ? '' : 's'} read`,
    `${coverage.unitsSpent} quota unit${coverage.unitsSpent === 1 ? '' : 's'}`,
  ];
  const stop: Record<Coverage['stoppedBecause'], string> = {
    complete: 'The queries planned for this search all ran.',
    quota_units: 'Stopped: this deployment’s quota-unit budget for one search was reached.',
    quota_search_calls: 'Stopped: this deployment’s search-call budget for one search was reached.',
    candidate_cap: 'Stopped: the candidate limit for one search was reached.',
    cancelled: 'Stopped: cancelled.',
    api_error: 'Stopped: a request to YouTube did not complete.',
  };
  return `${parts.join(' · ')}. ${stop[coverage.stoppedBecause]}`;
}
