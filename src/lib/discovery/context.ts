import type { FilterDefaults } from '@/components/discovery/SearchForms';
import type { Brand } from '@/lib/data/brands';
import type { Campaign } from '@/lib/data/campaigns';
import type { DiscoveryMode } from './types';
import { filterDefaults } from './defaults';

/**
 * Where a filter's value came from, and which value wins.
 *
 * THE PRECEDENCE IS ONE LINE AND IT MATTERS MORE THAN IT LOOKS:
 *
 *     search overrides  >  selected campaign  >  selected brand defaults
 *
 * Narrowest first. A brand default is what is usually true; a campaign is what
 * is true for this product; a search override is what this person is doing
 * right now. Reversing any pair produces the same complaint in a different
 * costume — "it keeps forgetting what I typed", or "it keeps using the wrong
 * product".
 *
 * NOTHING HERE WRITES BACK. Editing a search field changes the search and only
 * the search: a form that quietly updated the brand profile every time somebody
 * tried a different market would rewrite a saved answer as a side effect of
 * experimenting, and the customer would find out weeks later. Saving to the
 * brand is a separate, named button.
 *
 * `provenance` exists so the panel can say WHICH of the three a value came
 * from. A prefilled field with no explanation reads as something the customer
 * typed and forgot, and they edit it rather than trusting it.
 */

export type Provenance = 'brand' | 'campaign' | 'search';

export interface SearchContext {
  brand: Brand | null;
  campaign: Campaign | null;
  defaults: FilterDefaults;
  provenance: Partial<Record<keyof FilterDefaults, Provenance>>;
  /** Editable starting points, never applied on their own. */
  topicSuggestions: string[];
}

export function buildContext({
  mode,
  brand,
  campaign,
  searchParams,
}: {
  mode: DiscoveryMode;
  brand: Brand | null;
  campaign: Campaign | null;
  /** The stored parameters of a search being viewed, if any. */
  searchParams?: Record<string, unknown> | null;
}): SearchContext {
  const fromSearch = searchParams ? filterDefaults(mode, searchParams) : {};
  const provenance: SearchContext['provenance'] = {};
  const defaults: FilterDefaults = { ...fromSearch };

  const take = <K extends keyof FilterDefaults>(key: K, value: FilterDefaults[K], source: Provenance) => {
    // A saved search is a snapshot. Explicitly cleared topics or locale
    // preferences must not be silently restored from the brand on reload.
    if (searchParams && Object.prototype.hasOwnProperty.call(searchParams, key)) {
      provenance[key] = 'search';
      return;
    }
    const current = defaults[key];
    if (Array.isArray(current) ? current.length > 0 : current !== undefined && current !== '' && current !== null) {
      provenance[key] ??= 'search';
      return;
    }
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value) && value.length === 0) return;
    defaults[key] = value;
    provenance[key] = source;
  };

  // Campaign first: it is the narrower of the two saved contexts.
  if (campaign) {
    take('product', campaign.product ?? undefined, 'campaign');
    take('customerNeed', campaign.useCase ?? undefined, 'campaign');
    take('excludeTopics', campaign.avoidTopics ?? undefined, 'campaign');
  }

  if (brand) {
    // The brand's categories are the search, so they prefill it. Editable per
    // search: what somebody is exploring today is not a permanent attribute of
    // the company, and saving it back needs the named button.
    take('categories', brand.categories.length ? brand.categories : undefined, 'brand');
    take('product', brand.sells ?? undefined, 'brand');
    take('customerNeed', brand.customerNeeds ?? undefined, 'brand');
    // ONE market and ONE language reach YouTube per request — `regionCode` and
    // `relevanceLanguage` are single-valued — so a brand's list supplies the
    // first as the default and the rest as options beside it.
    take('market', brand.markets[0], 'brand');
    take('language', brand.contentLanguages[0], 'brand');
    take('knownCompetitors', undefined, 'brand');
  }

  return {
    brand,
    campaign,
    defaults,
    provenance,
    topicSuggestions: suggestTopics(brand, campaign),
  };
}

/**
 * Topic suggestions, from what is already saved.
 *
 * DELIBERATELY NOT GENERATED. A model could write better ones, and it would
 * also be a metered dependency, a latency cost and a new gate on a feature
 * whose whole job is saving somebody eight seconds of typing. These are the
 * words the customer themselves wrote on the brand and the campaign, offered as
 * chips they can click and then edit. Anything they do not want, they do not
 * click.
 */
export function suggestTopics(brand: Brand | null, campaign: Campaign | null): string[] {
  const out: string[] = [];
  const push = (value: string | null | undefined) => {
    const term = (value ?? '').trim();
    if (term.length < 2 || term.length > 60) return;
    if (out.some((t) => t.toLowerCase() === term.toLowerCase())) return;
    out.push(term);
  };

  for (const category of brand?.categories ?? []) push(category);
  push(brand?.customerNeeds ?? null);
  push(campaign?.useCase ?? null);
  push(campaign?.objective ?? null);

  return out.slice(0, 8);
}

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  brand: 'from brand',
  campaign: 'from campaign',
  search: 'from this search',
};
