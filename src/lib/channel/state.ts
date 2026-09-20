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
/**
 * Where a visitor goes next, given who they are and what they typed.
 *
 * The same three-way decision was written out at three call sites — the
 * channels page, the onboarding page and the post-sign-in dispatcher — and
 * they have to agree, because a visitor bounces between all three in one
 * sign-up. Divergence here is not a crash: it is a redirect loop, or a channel
 * silently dropped on one leg of the journey.
 *
 * The channel travels as a query parameter the whole way and is re-encoded at
 * every hop by `channelDestination`, which bounds it and never lets it become
 * the destination itself.
 */
export interface Journey {
  signedIn: boolean;
  hasWorkspace: boolean;
}
export function nextStep({ signedIn, hasWorkspace }: Journey, channel: unknown): string {
  if (!signedIn) return channelDestination(channel, '/join/business');
  // Signed in but no workspace: name it, then confirm the channel. Returning
  // users with a workspace skip this step entirely.
  if (!hasWorkspace) return channelDestination(channel, '/onboarding/business');
  return channelDestination(channel, CHANNEL_PATH);
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
