import type { AnalysisJob } from '@/types';
import { freshData, reportState } from './state';

/**
 * How one saved channel reads in the report library.
 *
 * `reportState` already answers "what happened to this pass" and is not
 * changed here — this adds the two things a LIBRARY needs that a single report
 * does not: a stale row is its own state, and the seven outcomes collapse into
 * four buckets somebody can filter on without reading every row.
 *
 * REFRESH NEEDED IS NOT A FAILURE. Public data expires at 30 days by policy and
 * a report that has aged out did nothing wrong; grouping it with failures would
 * send somebody looking for a problem that is a deadline.
 *
 * NOT COLLECTED IS NOT IN PROGRESS. A channel saved to the workspace with no
 * job queued is not going to become a report on its own, so it sits under
 * "needs attention" where somebody will see it — filing it under "in progress"
 * is how a row waits forever behind a label that says it is being handled.
 */

export type LibraryBucket = 'ready' | 'progress' | 'needs' | 'stale';

export interface LibraryRow {
  channelId: string;
  title: string | null;
  handle: string | null;
  fetchedAt: string | null;
  comments: number | null;
  jobs: AnalysisJob[];
}

export interface LibraryState {
  /** The sentence shown in the row. */
  label: string;
  bucket: LibraryBucket;
  tone: 'slate' | 'indigo' | 'emerald' | 'amber' | 'rose';
}

export function libraryState(row: LibraryRow, now = Date.now()): LibraryState {
  const live = row.jobs.some((job) => job.status === 'running' || job.status === 'queued');

  // A refresh in flight outranks staleness: the row is being fixed, and telling
  // somebody to refresh something already refreshing is noise.
  if (live) {
    return {
      label: row.jobs.some((job) => job.status === 'running') ? 'Collecting' : 'Queued',
      bucket: 'progress',
      tone: 'indigo',
    };
  }

  if (row.fetchedAt && !freshData(row.fetchedAt, now)) {
    return { label: 'Refresh needed', bucket: 'stale', tone: 'amber' };
  }

  const state = reportState(row.jobs, Boolean(row.title), row.comments ?? 0);

  switch (state) {
    case 'Completed':
      return { label: 'Ready', bucket: 'ready', tone: 'emerald' };
    case 'Failed':
      return { label: 'Collection failed', bucket: 'needs', tone: 'rose' };
    case 'Partially completed':
      return { label: 'Partially collected', bucket: 'needs', tone: 'amber' };
    case 'Completed with insufficient evidence':
      return { label: 'No readable evidence', bucket: 'needs', tone: 'amber' };
    default:
      return { label: 'Not collected', bucket: 'needs', tone: 'slate' };
  }
}

export const LIBRARY_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'ready', label: 'Ready' },
  { id: 'progress', label: 'In progress' },
  { id: 'needs', label: 'Needs attention' },
  { id: 'stale', label: 'Refresh needed' },
] as const;

export type LibraryFilter = (typeof LIBRARY_FILTERS)[number]['id'];

export function isLibraryFilter(value: unknown): value is LibraryFilter {
  return LIBRARY_FILTERS.some((filter) => filter.id === value);
}

/**
 * Free-text search over what the library actually shows.
 *
 * Title, handle and channel id, because those are the three things a person
 * has to hand — and the id is included because a row whose report has not
 * landed yet has nothing else.
 */
export function matchesQuery(row: LibraryRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [row.title, row.handle, row.channelId].some((value) => (value ?? '').toLowerCase().includes(q));
}
