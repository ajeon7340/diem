import type { SponsoredPerformance } from '@/types';

/**
 * Which of three things is true about this creator's paid history.
 *
 * These were two states and the middle one was missing, which produced the
 * worst sentence this report has printed: "No sponsorship history — the
 * audience has not been sold to here", on a channel whose own promotions panel
 * read "25 posts · 25 disclosed" two sections below.
 *
 * The cause is the absence rule again, in the place it costs the most. A
 * sponsored-versus-organic figure needs BOTH halves. A channel that runs a
 * sponsor segment on every upload has no organic post left in the analysed
 * window, so `sponsoredPerformance` is null — and null was read as "never".
 *
 * A buyer acts on the difference. An untouched audience and one that sees a
 * sponsor every week are opposite propositions, and we had them rendering the
 * same words.
 */
export type SponsorshipState =
  /** Paid posts found and measured against an organic baseline. */
  | 'measured'
  /** Paid posts found, but nothing organic in the window to measure against. */
  | 'unmeasurable'
  /** Nothing paid found in the window. Not a claim that none exists. */
  | 'never';

export function sponsorshipState(
  performance: SponsoredPerformance | null,
  disclosedPromotions: number,
): SponsorshipState {
  if (performance !== null) return 'measured';
  return disclosedPromotions > 0 ? 'unmeasurable' : 'never';
}
