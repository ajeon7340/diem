import { z } from 'zod';

/**
 * The fit read's output contract, in both forms it is needed in.
 *
 * NOT in `app/actions/fit-summary.ts`, which begins with 'use server' and may
 * therefore export only async functions — a value exported from there throws
 * at the POST and nowhere else. It lives here so `npm run verify:fit` can
 * assert the two forms still agree, which is the whole reason there are two.
 */
/**
 * The figures a claim may cite.
 *
 * Declared once because it is enforced twice: zod VALIDATES the response and
 * plain JSON Schema is what the provider is SENT. A closed enum is what stops
 * an invented figure name from rendering as a citation, and two copies of it
 * that could drift apart would quietly reopen that.
 */
export const FIT_METRICS = [
  'purchaseIntentRate',
  'purchaseIntentFloor',
  'commercialDensity',
  'sentimentScore',
  'raisedFlags',
  'checkedFlags',
  'engagementRate',
  'estimatedCpm',
  'sponsoredRetention',
  'commentsAnalyzed',
  'productPostsAnalyzed',
] as const;

/**
 * A claim is a sentence plus the figure under it.
 *
 * Modelled as structured output rather than parsed out of prose, because a
 * citation the UI cannot machine-check is decoration.
 */
export const fitOutputSchema = z.object({
  summary: z.string(),
  claims: z.array(
    z.object({
      text: z.string(),
      metric: z.enum(FIT_METRICS),
      value: z.number(),
    }),
  ),
});

/** The same contract, in the form both providers accept on a request. */
export const FIT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'Under 90 words.' },
    claims: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          metric: { type: 'string', enum: [...FIT_METRICS] },
          value: { type: 'number' },
        },
        required: ['text', 'metric', 'value'],
      },
    },
  },
  required: ['summary', 'claims'],
};
