/**
 * Size bands, as ranges people pick rather than numbers they type.
 *
 * Two open number fields ask a customer to invent a threshold — "is 40,000
 * subscribers big?" — and then apply it with false precision. A band is the
 * question they actually have: roughly this size, or roughly that one.
 *
 * BOTH OF THESE ARE POST-RETRIEVAL FILTERS. `search.list` has no subscriber
 * parameter and no view parameter, so neither narrows the index: they narrow
 * the rows this search happened to read. The results panel reports how many
 * each one removed, because "12 results" means something different when forty
 * were retrieved and twenty-eight were outside the band.
 */

export interface Band {
  id: string;
  label: string;
  /** Inclusive lower bound. Null is unbounded, never zero. */
  min: number | null;
  /** Inclusive upper bound. Null is unbounded. */
  max: number | null;
}

const BANDS = (unit: string): Band[] => [
  { id: 'any', label: `Any ${unit}`, min: null, max: null },
  { id: 'u1k', label: 'Under 1,000', min: null, max: 1_000 },
  { id: '1k', label: '1,000 – 10,000', min: 1_000, max: 10_000 },
  { id: '10k', label: '10,000 – 100,000', min: 10_000, max: 100_000 },
  { id: '100k', label: '100,000 – 1M', min: 100_000, max: 1_000_000 },
  { id: '1m', label: 'Over 1M', min: 1_000_000, max: null },
];

export const SUBSCRIBER_BANDS = BANDS('size');
export const VIEW_BANDS = BANDS('views');

export function band(bands: Band[], id: string | null | undefined): Band {
  return bands.find((b) => b.id === id) ?? bands[0];
}

export function isBand(bands: Band[], id: unknown): boolean {
  return typeof id === 'string' && bands.some((b) => b.id === id);
}

/**
 * The typical view count of the videos a search retrieved for one channel.
 *
 * MEDIAN, AND ITS DENOMINATOR IS TINY. This is a handful of search hits, not a
 * catalogue, so it is used to FILTER and never printed as a channel's
 * performance — the channel's own report is where that question is answered
 * over a real sample.
 *
 * Within one channel by construction, which is what III.E.2 permits: every
 * value here belongs to the same content owner, and nothing is combined across
 * two. Null when nothing was retrieved — unmeasured, never zero.
 */
export function medianViews(views: (number | null)[]): number | null {
  const known = views.filter((v): v is number => typeof v === 'number').sort((a, b) => a - b);
  if (known.length === 0) return null;
  const mid = (known.length - 1) / 2;
  return (known[Math.floor(mid)] + known[Math.ceil(mid)]) / 2;
}

export function inBand(value: number | null, { min, max }: Band): boolean | null {
  // Null in, null out: an unmeasured channel is neither inside nor outside a
  // band, and answering false would drop it for having hidden a number.
  if (value === null) return null;
  if (min !== null && value < min) return false;
  if (max !== null && value > max) return false;
  return true;
}

/** Accept legacy single bands and checkbox selections without filling gaps. */
export function selectedBands(bands: Band[], value: unknown): Band[] {
  const ids = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return bands.filter((item) => item.id !== 'any' && ids.includes(item.id));
}

export function normalizeBands(bands: Band[], value: unknown): string {
  return selectedBands(bands, value).map((item) => item.id).join(',') || 'any';
}

export function inBands(value: number | null, bands: Band[]): boolean | null {
  if (value === null) return null;
  return bands.length === 0 || bands.some((item) => inBand(value, item));
}
