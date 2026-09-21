import type { FilterDefaults } from '@/components/discovery/SearchForms';
import type { DiscoveryMode } from './types';

/**
 * The filter panel, refilled from the search it is showing results for.
 *
 * Without this, running a search empties the form that produced it: the
 * customer is looking at results for "hand grinder, 10k–100k subscribers" while
 * every field beside them reads blank, so narrowing the search means retyping
 * it. `defaultValue` on each control does the rest, and native Reset then
 * returns to WHAT WAS SEARCHED FOR rather than to empty — which is what reset
 * should mean on a page that is showing a result.
 *
 * Params are read defensively. They are stored JSON written by an older
 * deployment as easily as by this one, and a shape that has drifted must render
 * an empty field rather than `[object Object]`.
 */
export function filterDefaults(mode: DiscoveryMode, params: Record<string, unknown>): FilterDefaults {
  const text = (key: string) => (typeof params[key] === 'string' ? (params[key] as string) : undefined);
  const list = (key: string) =>
    Array.isArray(params[key]) ? (params[key] as unknown[]).filter((v): v is string => typeof v === 'string') : undefined;
  const joined = (key: string) => list(key)?.join(', ');
  const number = (key: string) =>
    typeof params[key] === 'number' ? String(params[key]) : text(key) || undefined;

  const common: FilterDefaults = { product: text('product') ?? undefined, market: text('market') ?? undefined };

  if (mode === 'similar') {
    return { ...common, channel: text('channel'), dimensions: list('dimensions') };
  }
  if (mode === 'competitor') {
    return {
      ...common,
      knownCompetitors: joined('knownCompetitors'),
      category: text('category') ?? undefined,
      customerNeed: text('customerNeed') ?? undefined,
      pricePositioning: text('pricePositioning') ?? undefined,
    };
  }
  return {
    ...common,
    categories: list('categories'),
    subscribers: text('subscribers') ?? undefined,
    views: text('views') ?? undefined,
    keywords: joined('keywords'),
    language: text('language') ?? undefined,
    formats: list('formats'),
    minSubscribers: number('minSubscribers'),
    maxSubscribers: number('maxSubscribers'),
    publishedWithinDays: number('publishedWithinDays'),
    excludeTopics: joined('excludeTopics'),
  };
}

/** One line for the collapsed mobile filter button. */
export function filterSummary(mode: DiscoveryMode, params: Record<string, unknown>): string | undefined {
  const defaults = filterDefaults(mode, params);
  if (mode === 'similar') return defaults.channel;
  if (mode === 'competitor') return defaults.knownCompetitors;
  return defaults.categories?.join(', ') || defaults.keywords;
}
