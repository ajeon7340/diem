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

/**
 * The same question asked with two ends instead of one pick.
 *
 * A band is one choice out of six, which is fine until somebody wants "15,000
 * to 200,000" and the bands nearest it are "10,000 – 100,000" and "100,000 –
 * 1M". A range lets them say the thing they meant. Both live here because both
 * are read the same way — see `inRange` and `inBand`, which agree on the one
 * rule that matters: an unmeasured figure is not a small one.
 *
 * STEPS, NOT A TEXT BOX. The ends are chosen from a list rather than typed, so
 * there is no "17,428 subscribers" filter implying a precision the retrieved
 * rows do not have, and no keystroke that silently filters the page away.
 *
 * STILL A POST-RETRIEVAL FILTER, exactly as the bands were. `search.list` takes
 * no subscriber or view parameter, so "100K to 1M" narrows the rows this search
 * read — never all of YouTube.
 */
export interface Range {
  /** Inclusive lower bound. Null is unbounded, never zero. */
  min: number | null;
  /** Inclusive upper bound. Null is unbounded. */
  max: number | null;
}

export const NO_RANGE: Range = { min: null, max: null };

export const SUBSCRIBER_STEPS = [
  1_000, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 5_000_000, 10_000_000,
];

/**
 * Lower ceiling than subscribers on purpose: this is the median of a handful of
 * videos one search retrieved, not a channel's lifetime reach.
 */
export const VIEW_STEPS = [
  1_000, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 5_000_000,
];

export function rangeIsSet({ min, max }: Range): boolean {
  return min !== null || max !== null;
}

/**
 * True inside, false outside, null unmeasured — and true for everyone when
 * nothing has been set.
 *
 * The null is the whole point. A channel that hides its subscriber count has
 * not failed a "over 10,000" filter; it has declined to answer it. Callers keep
 * those rows and say how many they kept, rather than deleting a creator for
 * privacy settings they chose.
 */
export function inRange(value: number | null, range: Range): boolean | null {
  if (!rangeIsSet(range)) return true;
  if (value === null) return null;
  if (range.min !== null && value < range.min) return false;
  if (range.max !== null && value > range.max) return false;
  return true;
}

/** 1K, 250K, 10M — the rail is 300px wide and "10,000,000" does not fit twice. */
export function stepLabel(value: number): string {
  if (value >= 1_000_000) return `${value / 1_000_000}M`;
  if (value >= 1_000) return `${value / 1_000}K`;
  return String(value);
}
