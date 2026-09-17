import 'server-only';

import { clearsFloor } from '@/lib/report/intent';

import type { DirectoryFilters, DirectoryListing } from '@/types';
import type { DirectoryListingRow } from '@/types/database';
import { toDirectoryListing } from '@/lib/mappers';
import { createSessionClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { getViewer } from '@/lib/access/viewer';
import { fixtureDirectory } from './fixtures';

const FATIGUE_ORDER = { low: 0, moderate: 1, high: 2 } as const;

export interface DirectoryResult {
  listings: DirectoryListing[];
  /** Distinct niches across what this viewer can see, for the filter rail. */
  niches: string[];
  /** False when the viewer has no Pro plan — the UI shows the upgrade wall. */
  entitled: boolean;
}

/**
 * Track B listing query.
 *
 * `directory_listings` is a `security_invoker` view over `report_metrics`, so
 * the subscription check happens in Postgres: a free-plan account joins against
 * zero visible rows and gets an empty array. The `entitled` flag below only
 * decides which empty state to render — it is not what protects the data.
 */
export async function getDirectory(filters: DirectoryFilters): Promise<DirectoryResult> {
  const viewer = await getViewer();

  if (!isSupabaseConfigured()) {
    return {
      listings: viewer.isProAgency ? applyFilters(fixtureDirectory(), filters) : [],
      niches: viewer.isProAgency ? distinctNiches(fixtureDirectory()) : [],
      entitled: viewer.isProAgency,
    };
  }

  const supabase = createSessionClient();
  let query = supabase.from('directory_listings').select('*');

  // Push every filter the database can express down into the query; only the
  // demographic predicate is applied in memory (see applyFilters).
  if (filters.niche) query = query.eq('niche', filters.niche);
  if (filters.q) query = query.or(`display_name.ilike.%${filters.q}%,handle.ilike.%${filters.q}%`);
  if (typeof filters.minPurchaseIntent === 'number') {
    // The BOUND, not the estimate. A floor asks whether the evidence supports
    // the claim, and 34% from 41 comments does not support "above 25%".
    // Pre-0013 rows have no bound and fall back in applyFilters.
    query = query.or(
      `purchase_intent_ci_low.gte.${filters.minPurchaseIntent},` +
        `and(purchase_intent_ci_low.is.null,purchase_intent_rate.gte.${filters.minPurchaseIntent})`,
    );
  }
  if (filters.maxAdFatigue) {
    const allowed = (Object.keys(FATIGUE_ORDER) as (keyof typeof FATIGUE_ORDER)[]).filter(
      (level) => FATIGUE_ORDER[level] <= FATIGUE_ORDER[filters.maxAdFatigue!],
    );
    query = query.in('ad_fatigue_level', allowed);
  }
  if (typeof filters.maxMinimumBudget === 'number') {
    query = query.or(`minimum_budget.is.null,minimum_budget.lte.${filters.maxMinimumBudget}`);
  }
  if (typeof filters.maxCpm === 'number') {
    // Creators with no published budget have no derived CPM; a cost ceiling is
    // a cost question, so exclude them rather than silently letting them pass.
    query = query.lte('estimated_cpm', filters.maxCpm);
  }

  switch (filters.sort) {
    case 'cpm':
      query = query.order('estimated_cpm', { ascending: true, nullsFirst: false });
      break;
    case 'followers':
      query = query.order('total_followers', { ascending: false });
      break;
    case 'sentiment':
      query = query.order('sentiment_score', { ascending: false, nullsFirst: false });
      break;
    case 'recent':
      query = query.order('last_analyzed_at', { ascending: false, nullsFirst: false });
      break;
    default:
      query = query.order('purchase_intent_rate', { ascending: false, nullsFirst: false });
  }

  const { data, error } = await query.limit(100).returns<DirectoryListingRow[]>();

  if (error) {
    console.error('[directory_listings] query failed', error.message);
    return { listings: [], niches: [], entitled: viewer.isProAgency };
  }

  const listings = (data ?? []).map(toDirectoryListing);

  return {
    listings: applyFilters(listings, { demographic: filters.demographic }),
    niches: distinctNiches(listings),
    entitled: viewer.isProAgency,
  };
}

/**
 * Predicates the database cannot express cheaply. The demographic filter has
 * to walk a jsonb array per row, so it runs here over the already-narrowed set.
 */
function applyFilters(listings: DirectoryListing[], filters: DirectoryFilters): DirectoryListing[] {
  let result = listings;

  if (filters.q) {
    const needle = filters.q.toLowerCase();
    result = result.filter(
      (listing) =>
        listing.displayName.toLowerCase().includes(needle) ||
        listing.handle.toLowerCase().includes(needle),
    );
  }

  if (filters.niche) {
    result = result.filter((listing) => listing.niche === filters.niche);
  }

  if (typeof filters.minPurchaseIntent === 'number') {
    // Unmeasured is not "below the threshold" — it is unanswerable, so those
    // creators drop out of an intent filter rather than being ranked at zero.
    // Measured-but-thin is excluded for the same reason: clearsFloor asks the
    // Wilson lower bound, so clearing a floor means the sample can support it.
    result = result.filter((listing) =>
      clearsFloor(
        { rate: listing.purchaseIntentRate, ciLow: listing.purchaseIntentFloor },
        filters.minPurchaseIntent!,
      ),
    );
  }

  if (filters.maxAdFatigue) {
    const ceiling = FATIGUE_ORDER[filters.maxAdFatigue];
    // A creator with no sponsored history has no fatigue level. Filtering for
    // "low fatigue" is a question about measured behaviour, so unmeasured
    // creators are excluded rather than quietly counted as low.
    result = result.filter(
      (listing) =>
        listing.adFatigueLevel !== null && FATIGUE_ORDER[listing.adFatigueLevel] <= ceiling,
    );
  }

  if (typeof filters.maxMinimumBudget === 'number') {
    result = result.filter(
      (listing) =>
        listing.minimumBudget === null || listing.minimumBudget <= filters.maxMinimumBudget!,
    );
  }

  if (typeof filters.maxCpm === 'number') {
    result = result.filter(
      (listing) => listing.estimatedCpm !== null && listing.estimatedCpm <= filters.maxCpm!,
    );
  }

  if (filters.demographic) {
    const { dimension, label, minShare } = filters.demographic;
    result = result.filter((listing) => {
      // A creator who has not connected analytics cannot answer a demographic
      // question, so they drop out rather than being treated as a non-match.
      if (!listing.demographics) return false;
      const buckets = listing.demographics[dimension];
      if (!Array.isArray(buckets)) return false;
      return buckets.some((bucket) => bucket.label === label && bucket.share >= minShare);
    });
  }

  switch (filters.sort) {
    case 'cpm':
      return [...result].sort(
        (a, b) => (a.estimatedCpm ?? Infinity) - (b.estimatedCpm ?? Infinity),
      );
    case 'followers':
      return [...result].sort((a, b) => b.totalFollowers - a.totalFollowers);
    case 'sentiment':
      return [...result].sort((a, b) => (b.sentimentScore ?? -1) - (a.sentimentScore ?? -1));
    case 'recent':
      return [...result].sort((a, b) =>
        (b.lastAnalyzedAt ?? '').localeCompare(a.lastAnalyzedAt ?? ''),
      );
    case 'purchase_intent':
      return [...result].sort(
        (a, b) => (b.purchaseIntentRate ?? -1) - (a.purchaseIntentRate ?? -1),
      );
    default:
      return result;
  }
}

function distinctNiches(listings: DirectoryListing[]): string[] {
  return Array.from(
    new Set(listings.map((listing) => listing.niche).filter((niche): niche is string => !!niche)),
  ).sort();
}
