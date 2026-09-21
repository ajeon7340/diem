import { z } from 'zod';

import { SUBSCRIBER_BANDS, VIEW_BANDS, isBand } from './ranges';
import type { SimilarityDimension } from './types';

/**
 * What a customer may type, and what a model may return.
 *
 * Both are parsed, for opposite reasons. Form input is parsed because it comes
 * from a browser; model output is parsed because a schema is the only thing
 * standing between a generated object and a page that renders whatever it was
 * handed. The second is the one this codebase keeps having to re-learn: a model
 * asked for five fields returns four and a sentence, and the sentence renders.
 *
 * `formData.get()` returns NULL for an absent field, so every optional here is
 * nullable as well as optional — the defect that made business signup
 * impossible for a week, restated so it does not happen a third time.
 */

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

/** A comma- or newline-separated list, bounded and de-duplicated. */
export const termList = (maxTerms: number, maxLength = 80) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .nullable()
    .transform((value) => {
      const raw = Array.isArray(value) ? value : (value ?? '').split(/[,\n]/);
      const seen = new Set<string>();
      const out: string[] = [];
      for (const item of raw) {
        const term = item.trim().slice(0, maxLength);
        const key = term.toLowerCase();
        if (term.length < 2 || seen.has(key)) continue;
        seen.add(key);
        out.push(term);
        if (out.length >= maxTerms) break;
      }
      return out;
    });

/**
 * A subscriber bound.
 *
 * Empty means UNBOUNDED, and that is why it transforms to null rather than 0.
 * A blank minimum coerced to zero is harmless; a blank maximum coerced to zero
 * returns nothing and looks like a search that found nobody.
 */
const bound = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  .transform((v) => {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    const parsed = typeof v === 'number' ? v : Number(String(v).replace(/[,\s]/g, ''));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  });

/** ISO 639-1. Sent to YouTube as a search preference, never read as audience. */
const languageCode = z
  .string()
  .trim()
  .regex(/^[a-z]{2}$/i, 'Use a two-letter language code')
  .optional()
  .nullable()
  .transform((v) => (v ? v.toLowerCase() : null));

const regionCode = z
  .string()
  .trim()
  .regex(/^[A-Z]{2}$/i, 'Use a two-letter country code')
  .optional()
  .nullable()
  .transform((v) => (v ? v.toUpperCase() : null));

export const FORMATS = ['short', 'medium', 'long'] as const;
export type Format = (typeof FORMATS)[number];

const bandId = (bands: typeof SUBSCRIBER_BANDS) =>
  z
    .unknown()
    .optional()
    .nullable()
    .transform((v) => (isBand(bands, v) ? (v as string) : 'any'));

export const criteriaSchema = z.object({
  /**
   * CATEGORIES ARE THE SEARCH NOW.
   *
   * The form used to ask for free-text topics and a product description, and
   * both were retyped on every search by people who had already written them
   * on the brand. Discovery is filter-driven: a category is picked, and it is
   * what the query is built from.
   *
   * `keywords` and `product` stay in the schema because SEARCHES ALREADY RUN
   * carry them, and a stored result has to keep parsing. They are no longer
   * collected by the form.
   */
  categories: termList(8, 60),
  product: text(2_000),
  keywords: termList(8),
  language: languageCode,
  market: regionCode,
  formats: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .nullable()
    .transform((v) => {
      const raw = Array.isArray(v) ? v : v ? [v] : [];
      return raw.filter((f): f is Format => (FORMATS as readonly string[]).includes(f));
    }),
  /** Band ids. The two open number fields they replace stay parseable for
   *  searches that were run with them. */
  subscribers: bandId(SUBSCRIBER_BANDS),
  views: bandId(VIEW_BANDS),
  minSubscribers: bound,
  maxSubscribers: bound,
  publishedWithinDays: z
    .union([z.number(), z.string()])
    .optional()
    .nullable()
    .transform((v) => {
      const parsed = Number(v ?? '');
      return [30, 90, 365].includes(parsed) ? parsed : null;
    }),
  excludeTopics: termList(8),
  campaignId: z.string().uuid().optional().nullable().transform((v) => v ?? null),
});

export type CriteriaInput = z.output<typeof criteriaSchema>;

export const SIMILARITY_DIMENSIONS = ['topics', 'formats', 'scale', 'language', 'useCases'] as const;

export const similarSchema = z.object({
  channel: z.string().trim().min(1, 'Paste a channel URL or @handle').max(200),
  dimensions: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .nullable()
    .transform((v) => {
      const raw = Array.isArray(v) ? v : v ? [v] : [];
      const picked = raw.filter((d): d is SimilarityDimension =>
        (SIMILARITY_DIMENSIONS as readonly string[]).includes(d),
      );
      // Nothing ticked means "compare on what you can", not "compare on
      // nothing" — an empty set would produce a run with no signals and a
      // provisional verdict for every candidate.
      return picked.length ? picked : [...SIMILARITY_DIMENSIONS];
    }),
  campaignId: z.string().uuid().optional().nullable().transform((v) => v ?? null),
});

export type SimilarInput = z.output<typeof similarSchema>;

export const competitorSchema = z.object({
  product: text(2_000),
  category: text(200),
  customerNeed: text(500),
  market: regionCode,
  pricePositioning: z
    .enum(['value', 'mid', 'premium'])
    .optional()
    .nullable()
    .transform((v) => v ?? null),
  knownCompetitors: termList(10, 120),
  campaignId: z.string().uuid().optional().nullable().transform((v) => v ?? null),
});

export type CompetitorInput = z.output<typeof competitorSchema>;

export const confirmBrandSchema = z.object({
  searchId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  relation: z.enum(['direct', 'adjacent', 'uncertain']).optional().nullable().transform((v) => v ?? 'direct'),
  rationale: text(1_000),
  products: termList(5, 120),
});

// ---------------------------------------------------------------------------
// Model output
// ---------------------------------------------------------------------------

/**
 * Every generated object names the evidence it came from, and the id is checked
 * against what was actually retrieved before anything is rendered.
 *
 * A schema alone does not do this. A model returns a well-formed object citing
 * `dQw4w9WgXcQ` because that is what a video id looks like, and a well-formed
 * citation to a video nobody fetched is worse than no citation — it survives
 * review, because it looks exactly like the ones that are real.
 */
export const reasonSchema = z.object({
  channelId: z.string().min(1),
  reason: z.string().trim().min(1).max(400),
  sourceVideoIds: z.array(z.string()).max(6),
});

export const reasonsSchema = z.object({ reasons: z.array(reasonSchema).max(50) });

export const competitorSuggestionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  relation: z.enum(['direct', 'adjacent', 'uncertain']),
  rationale: z.string().trim().min(1).max(600),
});

export const competitorSuggestionsSchema = z.object({
  suggestions: z.array(competitorSuggestionSchema).max(12),
});

export const queryPlanSchema = z.object({
  queries: z
    .array(
      z.object({
        q: z.string().trim().min(2).max(120),
        why: z.string().trim().min(1).max(300),
        sourceVideoIds: z.array(z.string()).max(6),
      }),
    )
    .max(8),
});

/**
 * Keep only the citations that exist in the evidence actually retrieved.
 *
 * Applied everywhere a model names a source. A claim left with no surviving
 * citation is dropped rather than shown uncited — the whole value of the
 * sentence was that it pointed at something.
 */
export function keepCitedOnly<T extends { sourceVideoIds: string[] }>(
  items: T[],
  retrievedVideoIds: Iterable<string>,
): T[] {
  const known = new Set(retrievedVideoIds);
  return items
    .map((item) => ({ ...item, sourceVideoIds: item.sourceVideoIds.filter((id) => known.has(id)) }))
    .filter((item) => item.sourceVideoIds.length > 0);
}
