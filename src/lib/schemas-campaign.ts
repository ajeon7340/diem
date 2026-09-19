import { z } from 'zod';

/**
 * The advertiser's brief.
 *
 * Only the name is required. Everything else shapes the read and a customer
 * who supplies none of it gets a general one that SAYS it is general — the
 * same rule the business profile already follows, and for the same reason: a
 * required field here is answered carelessly to get past the form, and a
 * careless answer is worse than an empty one because nothing downstream can
 * tell them apart.
 *
 * Nullable, not just optional: `formData.get()` returns null for an absent
 * field, which is the bug that made business signup impossible for a week.
 */
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const money = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  .transform((v) => {
    if (v === null || v === undefined || v === '') return null;
    const parsed = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  })
  .refine((v) => v === null || (v >= 0 && v <= 100_000_000), {
    message: 'Enter an amount between 0 and 100,000,000',
  });

export const campaignSchema = z.object({
  name: z.string().trim().min(2, 'Name this campaign').max(120),
  brand: text(120),
  product: text(2_000),
  audience: text(2_000),
  objective: text(200),
  /** What this brand will not place beside. Free text: a fixed list cannot
   *  anticipate what a given advertiser must avoid. */
  avoidTopics: text(2_000),
  budgetTotal: money,
});

export type CampaignInput = z.output<typeof campaignSchema>;

export const candidateSchema = z.object({
  /** A channel URL or handle, in any shape YouTube has ever served. */
  channel: z.string().trim().min(1, 'Paste a channel URL or @handle').max(200),
  proposedFee: money,
  notes: text(4_000),
});
