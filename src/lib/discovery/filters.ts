import { CAMPAIGN_CATEGORIES, CATEGORY_LABEL, type CampaignCategory } from '@/types';
import { countryName, languageName } from '@/lib/locale/vocabulary';
import { stepLabel } from './ranges';

/**
 * The filter state, read from and written to the URL.
 *
 * THE URL IS THE SOURCE OF TRUTH. A search somebody wants to send a colleague,
 * come back to with the browser's back button, or save, is a search that has
 * to exist as an address. Holding it in component state or a store makes all
 * three impossible and makes the filter panel and the results area disagree
 * about what is applied — which is exactly the bug the applied-chips row is
 * there to prevent.
 *
 * READING IS TOTAL. Any query string produces a valid `Filters`; nothing
 * throws on a hand-edited URL, and an unrecognised value is simply absent.
 */
export interface Filters {
  category: CampaignCategory | null;
  market: string | null;
  language: string | null;
  subsFrom: number | null;
  subsTo: number | null;
  viewsFrom: number | null;
  viewsTo: number | null;
  /** Days since publication, as `search.list` accepts it. */
  within: number | null;
  /** Duration bucket, as `search.list` accepts it. */
  length: 'short' | 'medium' | 'long' | null;
  exclude: string;
}

export const EMPTY_FILTERS: Filters = {
  category: null,
  market: null,
  language: null,
  subsFrom: null,
  subsTo: null,
  viewsFrom: null,
  viewsTo: null,
  within: null,
  length: null,
  exclude: '',
};

const num = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Number(value.replace(/[,\s]/g, ''));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export function readFilters(params: URLSearchParams): Filters {
  const category = params.get('category');
  const length = params.get('length');
  const within = num(params.get('within'));
  return {
    category: (CAMPAIGN_CATEGORIES as readonly string[]).includes(category ?? '')
      ? (category as CampaignCategory)
      : null,
    market: params.get('market')?.toUpperCase().slice(0, 2) || null,
    language: params.get('language')?.toLowerCase().slice(0, 5) || null,
    subsFrom: num(params.get('subsFrom')),
    subsTo: num(params.get('subsTo')),
    viewsFrom: num(params.get('viewsFrom')),
    viewsTo: num(params.get('viewsTo')),
    within: [30, 90, 365].includes(within ?? 0) ? within : null,
    length: length === 'short' || length === 'medium' || length === 'long' ? length : null,
    exclude: (params.get('exclude') ?? '').slice(0, 200),
  };
}

/** Only what is set. An empty key in a URL is noise somebody has to read. */
export function writeFilters(filters: Filters, into: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(into);
  for (const [key, value] of Object.entries(filters)) {
    if (value === null || value === '') next.delete(key);
    else next.set(key, String(value));
  }
  return next;
}

export interface Chip {
  key: keyof Filters;
  label: string;
}

/**
 * The applied filters, as chips.
 *
 * A RANGE IS ONE CHIP, not two: "10K–100K subscribers" is one condition a
 * reader holds in their head, and clearing it should clear both ends.
 */
export function chipsOf(filters: Filters): Chip[] {
  const chips: Chip[] = [];
  const range = (from: number | null, to: number | null, noun: string) =>
    from !== null || to !== null
      ? `${from === null ? 'any' : stepLabel(from)}–${to === null ? 'any' : stepLabel(to)} ${noun}`
      : null;

  if (filters.category) chips.push({ key: 'category', label: CATEGORY_LABEL[filters.category] });
  if (filters.market) chips.push({ key: 'market', label: countryName(filters.market) ?? filters.market });
  if (filters.language) chips.push({ key: 'language', label: languageName(filters.language) ?? filters.language });
  const subs = range(filters.subsFrom, filters.subsTo, 'subscribers');
  if (subs) chips.push({ key: 'subsFrom', label: subs });
  const views = range(filters.viewsFrom, filters.viewsTo, 'typical views');
  if (views) chips.push({ key: 'viewsFrom', label: views });
  if (filters.within) chips.push({ key: 'within', label: `published in ${filters.within} days` });
  if (filters.length) {
    chips.push({
      key: 'length',
      label: { short: 'under 4 min', medium: '4–20 min', long: 'over 20 min' }[filters.length],
    });
  }
  if (filters.exclude) chips.push({ key: 'exclude', label: `excluding “${filters.exclude}”` });
  return chips;
}

/** Clearing a chip clears the whole condition, both ends of a range included. */
export function clearChip(filters: Filters, key: keyof Filters): Filters {
  if (key === 'subsFrom') return { ...filters, subsFrom: null, subsTo: null };
  if (key === 'viewsFrom') return { ...filters, viewsFrom: null, viewsTo: null };
  return { ...filters, [key]: key === 'exclude' ? '' : null };
}

export function appliedCount(filters: Filters): number {
  return chipsOf(filters).length;
}
