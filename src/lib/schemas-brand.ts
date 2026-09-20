import { z } from 'zod';

import { validCountries, validLanguages } from '@/lib/locale/vocabulary';

/**
 * The brand profile, as a form may supply it.
 *
 * TWO REQUIRED FIELDS AND NO MORE: the name, and what it sells. Everything else
 * sharpens a search and none of it should stand between somebody and their
 * first report — the same rule the campaign brief already follows, and for the
 * same reason. A required field is answered carelessly to get past the form,
 * and a careless answer is worse than an empty one because nothing downstream
 * can tell them apart.
 *
 * Nullable as well as optional: `formData.get()` returns null for an absent
 * field, which is the defect that made business signup impossible for a week.
 */
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

/**
 * A saved reference, not a source.
 *
 * Normalised so `northbeam.com` and `https://northbeam.com` are stored alike,
 * and validated only as far as "this looks like a web address". NOTHING FETCHES
 * IT. There is no enrichment feature here, and filling a profile in from a page
 * nobody authorised us to read is the opposite of what this form is for.
 */
const website = z
  .string()
  .trim()
  .max(400)
  .optional()
  .nullable()
  .transform((v) => {
    if (!v) return null;
    const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    try {
      const url = new URL(withScheme);
      return url.hostname.includes('.') ? url.toString() : null;
    } catch {
      return null;
    }
  });

/** Free-form, de-duplicated, bounded. A fixed list cannot name every product. */
const categories = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .nullable()
  .transform((value) => {
    const raw = Array.isArray(value) ? value : (value ?? '').split(',');
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of raw) {
      const term = item.trim().slice(0, 60);
      if (term.length < 2 || seen.has(term.toLowerCase())) continue;
      seen.add(term.toLowerCase());
      out.push(term);
      if (out.length >= 10) break;
    }
    return out;
  });

export const brandSchema = z.object({
  id: z.string().uuid().optional().nullable().transform((v) => v ?? null),
  name: z.string().trim().min(1, 'Name the brand').max(120),
  sells: z.string().trim().min(1, 'Say in one line what this brand sells').max(600),
  categories,
  website,
  customerNeeds: text(600),
  // Narrowed against the vocabulary rather than trusted: a forged value here
  // would travel to YouTube as a `regionCode` and come back a 400.
  markets: z.unknown().transform(validCountries).pipe(z.array(z.string()).max(12)),
  contentLanguages: z.unknown().transform(validLanguages).pipe(z.array(z.string()).max(12)),
  makeDefault: z
    .union([z.string(), z.boolean()])
    .optional()
    .nullable()
    .transform((v) => v === true || v === 'on' || v === 'true'),
});

export type BrandInput = z.output<typeof brandSchema>;
