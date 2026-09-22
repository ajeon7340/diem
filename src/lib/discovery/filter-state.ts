import { CAMPAIGN_CATEGORIES, CATEGORY_LABEL, type CampaignCategory } from '@/types';
import { countryName, languageName } from '@/lib/locale/vocabulary';
import { stepLabel } from './ranges';

/**
 * Two tiers of filter, and the difference is what they cost.
 *
 * A RUN FILTER CHANGES THE QUESTION PUT TO YOUTUBE. Category, market, content
 * language, the reference channel, the competing brand — none of these can be
 * applied to rows that came back, because the rows that came back were chosen
 * by them. Changing one means asking again, and asking spends one of the
 * hundred `search.list` calls the API allows per day.
 *
 * A NARROW FILTER READS ROWS THAT ARE ALREADY HERE. Subscriber count, typical
 * views, when they last published, words to avoid — every one of these is a
 * figure on a candidate the last run already fetched. Applying one is an array
 * filter: instant, free, and reversible.
 *
 * THE TWO MUST NEVER BE CONFUSED IN THE INTERFACE, because the customer pays
 * for one and not the other. A narrow filter that quietly refetched would burn
 * a day's budget on somebody dragging a slider; a run filter applied silently
 * would show results that do not match what the panel says.
 */

export interface RunFilters {
  category: CampaignCategory | null;
  market: string | null;
  contentLanguage: string | null;
  /** Similar mode: the channel to start from. */
  similarToChannel: string | null;
  /** Competitor mode: the brand whose collaborations to read. */
  competitorBrand: string | null;
  /** `publishedAfter`, which YouTube applies to the index itself. */
  publishedWithinDays: number | null;
  /** `videoDuration`, likewise applied by YouTube. */
  videoLength: 'short' | 'medium' | 'long' | null;
}

export interface NarrowFilters {
  subscriberMin: number | null;
  subscriberMax: number | null;
  avgViewsMin: number | null;
  avgViewsMax: number | null;
  /** Newest retrieved upload, measured against the run's collection date. */
  lastUploadWithinDays: number | null;
  /** Comma-separated. A retrieved title carrying one drops the channel. */
  excludedKeywords: string;
}

export type FilterState = RunFilters & NarrowFilters;

export const RUN_KEYS = [
  'category',
  'market',
  'contentLanguage',
  'similarToChannel',
  'competitorBrand',
  'publishedWithinDays',
  'videoLength',
] as const satisfies readonly (keyof RunFilters)[];

export const NARROW_KEYS = [
  'subscriberMin',
  'subscriberMax',
  'avgViewsMin',
  'avgViewsMax',
  'lastUploadWithinDays',
  'excludedKeywords',
] as const satisfies readonly (keyof NarrowFilters)[];

export function isRunKey(key: string): key is keyof RunFilters {
  return (RUN_KEYS as readonly string[]).includes(key);
}

export function isNarrowKey(key: string): key is keyof NarrowFilters {
  return (NARROW_KEYS as readonly string[]).includes(key);
}

/**
 * THREE FILTERS THE BRIEF ASKS FOR ARE NOT HERE, and their absence is
 * deliberate rather than an omission:
 *
 *   engagementRateMin   A rate needs likes and comments per video. Discovery
 *                       retrieves view counts only, and a like-derived rate is
 *                       a new metric computed from YouTube figures, which
 *                       III.E.4.h(ii) reaches and the approval gates. Two
 *                       blockers, not one.
 *   uploadFrequency     A run reads two or three videos per candidate. A
 *                       cadence from three search hits is not a cadence.
 *   hasPublicEmail      adfit has never held contact data. Creators do not
 *                       register, and no public endpoint exposes it.
 *
 * A control that silently matches everything is worse than no control: it
 * tells a customer they have narrowed something when they have not.
 */
export const UNSUPPORTED_FILTERS: Record<string, string> = {
  engagementRateMin: 'Engagement rate needs likes per video, which a search does not retrieve.',
  engagementRateMax: 'Engagement rate needs likes per video, which a search does not retrieve.',
  uploadFrequency: 'A run reads a handful of videos per channel, which is not enough for a cadence.',
  hasPublicEmail: 'adfit holds no contact data. Creators never register with it.',
};

export const EMPTY_FILTERS: FilterState = {
  category: null,
  market: null,
  contentLanguage: null,
  similarToChannel: null,
  competitorBrand: null,
  publishedWithinDays: null,
  videoLength: null,
  subscriberMin: null,
  subscriberMax: null,
  avgViewsMin: null,
  avgViewsMax: null,
  lastUploadWithinDays: null,
  excludedKeywords: '',
};

const num = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Number(value.replace(/[,\s]/g, ''));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

/** Total: any query string produces a valid state, including a hand-edited one. */
export function readFilters(params: URLSearchParams): FilterState {
  const category = params.get('category');
  const length = params.get('videoLength');
  const within = num(params.get('publishedWithinDays'));
  return {
    category: (CAMPAIGN_CATEGORIES as readonly string[]).includes(category ?? '')
      ? (category as CampaignCategory)
      : null,
    market: params.get('market')?.toUpperCase().slice(0, 2) || null,
    contentLanguage: params.get('contentLanguage')?.toLowerCase().slice(0, 5) || null,
    similarToChannel: params.get('similarToChannel')?.slice(0, 200) || null,
    competitorBrand: params.get('competitorBrand')?.slice(0, 200) || null,
    publishedWithinDays: [30, 90, 365].includes(within ?? 0) ? within : null,
    videoLength: length === 'short' || length === 'medium' || length === 'long' ? length : null,
    subscriberMin: num(params.get('subscriberMin')),
    subscriberMax: num(params.get('subscriberMax')),
    avgViewsMin: num(params.get('avgViewsMin')),
    avgViewsMax: num(params.get('avgViewsMax')),
    lastUploadWithinDays: num(params.get('lastUploadWithinDays')),
    excludedKeywords: (params.get('excludedKeywords') ?? '').slice(0, 200),
  };
}

/** Only what is set: an empty key in a URL is noise somebody has to read. */
export function writeFilters(filters: FilterState, into: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(into);
  for (const [key, value] of Object.entries(filters)) {
    if (value === null || value === '') next.delete(key);
    else next.set(key, String(value));
  }
  return next;
}

/** The keys a patch actually changes, so the caller knows what it costs. */
export function changedKeys(from: FilterState, to: Partial<FilterState>): (keyof FilterState)[] {
  return (Object.keys(to) as (keyof FilterState)[]).filter(
    (key) => to[key] !== undefined && to[key] !== from[key],
  );
}

export function touchesRun(from: FilterState, patch: Partial<FilterState>): boolean {
  return changedKeys(from, patch).some((key) => isRunKey(key));
}

export interface Chip {
  key: keyof FilterState;
  label: string;
  /** Clearing a run chip costs a search; clearing a narrow one costs nothing. */
  tier: 'run' | 'narrow';
}

/** A range is ONE chip: "10K–100K subscribers" is one thought to clear. */
export function chipsOf(filters: FilterState): Chip[] {
  const chips: Chip[] = [];
  const range = (from: number | null, to: number | null, noun: string) =>
    from !== null || to !== null
      ? `${from === null ? 'any' : stepLabel(from)}–${to === null ? 'any' : stepLabel(to)} ${noun}`
      : null;
  const push = (key: keyof FilterState, label: string) =>
    chips.push({ key, label, tier: isRunKey(key) ? 'run' : 'narrow' });

  if (filters.category) push('category', CATEGORY_LABEL[filters.category]);
  if (filters.market) push('market', countryName(filters.market) ?? filters.market);
  if (filters.contentLanguage)
    push('contentLanguage', languageName(filters.contentLanguage) ?? filters.contentLanguage);
  if (filters.similarToChannel) push('similarToChannel', `like ${filters.similarToChannel}`);
  if (filters.competitorBrand) push('competitorBrand', `worked with ${filters.competitorBrand}`);
  if (filters.publishedWithinDays) push('publishedWithinDays', `published in ${filters.publishedWithinDays} days`);
  if (filters.videoLength) {
    push('videoLength', { short: 'under 4 min', medium: '4–20 min', long: 'over 20 min' }[filters.videoLength]);
  }
  const subs = range(filters.subscriberMin, filters.subscriberMax, 'subscribers');
  if (subs) push('subscriberMin', subs);
  const views = range(filters.avgViewsMin, filters.avgViewsMax, 'typical views');
  if (views) push('avgViewsMin', views);
  if (filters.lastUploadWithinDays) push('lastUploadWithinDays', `posted in ${filters.lastUploadWithinDays} days`);
  if (filters.excludedKeywords) push('excludedKeywords', `excluding “${filters.excludedKeywords}”`);
  return chips;
}

/** Clearing a chip clears the whole condition, both ends of a range included. */
export function clearChip(filters: FilterState, key: keyof FilterState): FilterState {
  if (key === 'subscriberMin') return { ...filters, subscriberMin: null, subscriberMax: null };
  if (key === 'avgViewsMin') return { ...filters, avgViewsMin: null, avgViewsMax: null };
  return { ...filters, [key]: key === 'excludedKeywords' ? '' : null };
}

export function appliedCount(filters: FilterState): number {
  return chipsOf(filters).length;
}

/**
 * The narrow filter doing the most work, for the "relax this" button.
 *
 * Measured by rows removed rather than by a guess about which is strictest —
 * the caller knows what each one actually hid.
 */
export function loosest(
  removedBy: Partial<Record<keyof NarrowFilters, number>>,
): keyof NarrowFilters | null {
  let worst: keyof NarrowFilters | null = null;
  let most = 0;
  for (const [key, removed] of Object.entries(removedBy) as [keyof NarrowFilters, number][]) {
    if (removed > most) {
      most = removed;
      worst = key;
    }
  }
  return worst;
}
