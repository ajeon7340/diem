import type { CostEfficiency } from '@/types';

/**
 * What a placement costs per thousand views, from the price the creator
 * published and the views their videos actually get.
 *
 * `cost_efficiency` is the fourth column in this repo to have a type, a zod
 * schema, a mapper, a locked panel and no producer. The panel's fallback said
 * "Not enough view history yet to derive a CPM" on a channel with 667 uploads
 * and a 6,614-view median — blaming the creator's catalogue for a number
 * nothing had ever tried to compute.
 *
 * It is arithmetic, not a model call:
 *
 *     estimatedCpm            = budget / (medianViews / 1000)
 *     costPerThousandEngaged  = estimatedCpm / engagementRate
 *
 * BASIS IS THE LOW END OF THE RANGE, on purpose. A creator who says
 * "$15,000-$25,000" is quoting a span, and a CPM computed off the top of it
 * describes the most expensive version of them. The floor is the figure they
 * are certain about, and the panel labels it `basisBudget` so the number can
 * be reconciled with the range printed elsewhere.
 *
 * NULL RATHER THAN ZERO, twice over. No published price means no basis to
 * divide by — an unpriced creator is not a free one. No views means no
 * denominator, and a CPM of Infinity renders as a number.
 */
export function deriveCostEfficiency(input: {
  budgetMin: number | null;
  budgetMax: number | null;
  medianViews: number | null;
  engagementRate: number | null;
  currency?: string;
  cohortMedianCpm?: number | null;
  cohortMedianRetention?: number | null;
}): CostEfficiency | null {
  const basis = input.budgetMin ?? input.budgetMax;
  if (basis === null || basis <= 0) return null;
  if (input.medianViews === null || input.medianViews <= 0) return null;

  const estimatedCpm = basis / (input.medianViews / 1000);

  // Engaged viewers, not viewers. Null engagement means the adjustment cannot
  // be made, and reporting the unadjusted CPM under a label that says
  // "engaged" would be a different number wearing the same name — so it falls
  // back to the plain CPM only because the field is not nullable, and the
  // panel's own hint says which of the two it is showing.
  const costPerThousandEngaged =
    input.engagementRate && input.engagementRate > 0
      ? estimatedCpm / input.engagementRate
      : estimatedCpm;

  return {
    currency: input.currency ?? 'USD',
    basisBudget: basis,
    medianViews: input.medianViews,
    estimatedCpm: Math.round(estimatedCpm * 100) / 100,
    costPerThousandEngaged: Math.round(costPerThousandEngaged * 100) / 100,
    // A cohort of one is not a cohort. Both stay null until cross-creator
    // ranking exists; inventing a benchmark is how a percentile that means
    // nothing ends up quoted in a pitch.
    cohortMedianCpm: input.cohortMedianCpm ?? null,
    cohortMedianRetention: input.cohortMedianRetention ?? null,
  };
}
