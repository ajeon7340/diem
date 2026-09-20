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
  /**
   * How far brand setup got. Defaults to 'done' so every existing call site
   * keeps its behaviour: a guard asking "does this visitor have a workspace"
   * must not start routing people into a step they already answered.
   *
   * 'pending' is the only value that diverts. 'skipped' is an ANSWER — somebody
   * chose to do it later — and sending them back through it on every sign-in
   * would be the product arguing with a decision they made.
   */
  brandSetup?: 'pending' | 'skipped' | 'done';
}
export function nextStep({ signedIn, hasWorkspace, brandSetup = 'done' }: Journey, channel: unknown): string {
  if (!signedIn) return channelDestination(channel, '/join/business');
  // Signed in but no workspace: name it, then the brand, then confirm the
  // channel. Returning users with a workspace skip both steps entirely.
  if (!hasWorkspace) return channelDestination(channel, '/onboarding/business');
  if (brandSetup === 'pending') return channelDestination(channel, BRAND_PATH);
  return channelDestination(channel, CHANNEL_PATH);
}

export const BRAND_PATH = '/onboarding/brand';

/**
 * Where onboarding lets go of somebody.
 *
 * TWO DESTINATIONS, decided by what they arrived with. A visitor who typed a
 * channel before they had an account is one click from the report they came
 * for, and dropping them on a search page instead makes them find it again.
 * Somebody who arrived without one has nothing to confirm, so they land in
 * discovery with the brand they just described already selected.
 */
export function onboardingDestination(channel: unknown, brandId: string | null): string {
  const entered = channelInput(channel);
  if (entered) return channelDestination(entered, CHANNEL_PATH);
  return brandId ? `/discover?brand=${encodeURIComponent(brandId)}` : '/discover';
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
