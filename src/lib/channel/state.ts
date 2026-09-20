import type { AnalysisJob } from '@/types';

export const CHANNEL_PATH = '/channels';
/** The input is data, never a redirect destination. Bound it before round-tripping. */
export function channelInput(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 200) : '';
}
export function channelDestination(value: unknown, path = CHANNEL_PATH): string {
  const channel = channelInput(value);
  return channel ? `${path}?channel=${encodeURIComponent(channel)}` : path;
}
export function freshData(at: unknown, now = Date.now()): boolean {
  const time = typeof at === 'string' ? Date.parse(at) : NaN;
  return Number.isFinite(time) && time <= now && now - time < 30 * 86_400_000;
}
export function reportState(jobs: AnalysisJob[], hasReport: boolean, sample: number, partial = false): string {
  if (jobs.some(j => j.status === 'running')) return 'Running';
  if (jobs.some(j => j.status === 'queued')) return 'Queued';
  if (jobs.some(j => j.status === 'failed')) return hasReport ? 'Partially completed' : 'Failed';
  if (!hasReport) return 'Not started';
  if (partial) return 'Partially completed';
  return sample === 0 ? 'Completed with insufficient evidence' : 'Completed';
}
export const STATUS_LABEL = { considering: 'Undecided', shortlisted: 'Priority outreach', hold: 'Hold', rejected: 'Excluded' } as const;
