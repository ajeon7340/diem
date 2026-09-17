import type { BrandRiskCategory } from '@/types';

/**
 * The creator's side of the risk scan: what to hide, and what it costs to.
 *
 * A brand reads the rollup — "900 comments carry slurs" — and prices the
 * placement. The creator reads this: the comments themselves, one at a time,
 * with a button. Two audiences, two surfaces, and deliberately no overlap. An
 * advertiser has no decision that requires browsing abuse aimed at a person.
 */

export type ModerationStatus = 'pending' | 'hidden' | 'kept' | 'reported';

export interface QueueItem {
  id: string;
  commentId: string;
  videoId: string;
  videoTitle: string | null;
  excerpt: string;
  category: BrandRiskCategory;
  /** Written by the creator. Shown, never hidden from here — see `isActionable`. */
  byCreator: boolean;
  likes: number | null;
  publishedAt: string | null;
  status: ModerationStatus;
}

/**
 * YouTube's cost for one `comments.setModerationStatus` call.
 *
 * The default project quota is 10,000 units a day, which is 200 hides. That is
 * a real ceiling for a channel with nine hundred flagged comments, and the UI
 * has to say so rather than letting a creator click into a silent 403 on the
 * two hundred and first.
 */
export const MODERATION_QUOTA_COST = 50;
export const DEFAULT_DAILY_QUOTA = 10_000;

export function dailyHideLimit(quota = DEFAULT_DAILY_QUOTA): number {
  return Math.floor(quota / MODERATION_QUOTA_COST);
}

/**
 * Can this item be hidden?
 *
 * Everything except the creator's own comments. Not a technical limit — the
 * API would happily reject their own — but hiding it changes nothing that
 * matters: `byCreator` is what reaches their rating and it deliberately
 * ignores `hidden`, because deleting what you wrote does not unwrite it.
 * Offering a button that appears to fix the one thing it cannot fix would be
 * the most misleading control on the page.
 */
export function isActionable(item: QueueItem): boolean {
  return !item.byCreator && item.status === 'pending';
}

/**
 * What a hide-all would cost, and whether today's quota covers it.
 *
 * Returned rather than enforced: the limit belongs to the creator's Google
 * project, not to us, and a creator who has already spent their quota
 * elsewhere will hit it sooner than this predicts. It is an estimate the UI
 * states as one.
 */
export function quotaPlan(
  items: QueueItem[],
  quota = DEFAULT_DAILY_QUOTA,
): { actionable: number; units: number; limit: number; overBy: number } {
  const actionable = items.filter(isActionable).length;
  const limit = dailyHideLimit(quota);
  return {
    actionable,
    units: actionable * MODERATION_QUOTA_COST,
    limit,
    overBy: Math.max(0, actionable - limit),
  };
}

/**
 * Queue order.
 *
 * Most-liked first, not most-recent. A slur nobody saw and a slur the audience
 * upvoted three hundred times are the same category and very different
 * problems — the second is what a brand's ad would sit beneath and what other
 * viewers actually read. Same argument as `endorsement` on the brand-safety
 * flags: volume is not reach.
 *
 * The creator's own comments sort last. They are shown because hiding them
 * from their own report would be dishonest, and they sit at the bottom because
 * there is no action to take on them.
 */
export function orderQueue(items: QueueItem[]): QueueItem[] {
  return [...items].sort((a, b) => {
    if (a.byCreator !== b.byCreator) return a.byCreator ? 1 : -1;
    if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
    return (b.likes ?? -1) - (a.likes ?? -1);
  });
}

/** Counts for the queue header. `pending` is the only one that implies work. */
export function queueSummary(items: QueueItem[]): Record<ModerationStatus, number> {
  const out: Record<ModerationStatus, number> = {
    pending: 0,
    hidden: 0,
    kept: 0,
    reported: 0,
  };
  for (const item of items) out[item.status] += 1;
  return out;
}
