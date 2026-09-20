import { positiveEnv } from '@/lib/ingest/worker-config';

/**
 * Every bound discovery runs inside, in one place and configurable.
 *
 * They are small on purpose. A hundred search calls is the whole day's search
 * budget for the project (see `lib/youtube/quota.ts`), shared with nothing else
 * that can refill it, and one customer clicking Search must not be able to
 * spend it. The defaults here put one criteria run at 4 searches and roughly 6
 * units, so a working day of discovery costs a fraction of the budget and
 * channel analysis keeps running.
 *
 * `positiveEnv` rather than `Number(env ?? default)` for the reason set out in
 * `worker-config.ts`: an empty string from a CI variable is 0, not NaN, and a
 * zero bound here is a search that reads nothing and reports success.
 */
export interface DiscoveryLimits {
  /** search.list calls one run may make. */
  searchCalls: number;
  /** Total quota units one run may spend, searches included. */
  units: number;
  /** Candidates kept after dedupe. Past this the run stops and says so. */
  candidates: number;
  /** Distinct queries a run may build. */
  queries: number;
  /** Videos enriched per run — `videos.list`, 50 an call, 1 unit. */
  videos: number;
  /** Uploads sampled from a reference channel to describe it. */
  referenceUploads: number;
  /** Comments are NOT read during discovery. Deep passes happen on request. */
  comments: 0;
}

export function discoveryLimits(env: Record<string, string | undefined> = process.env): DiscoveryLimits {
  return {
    searchCalls: positiveEnv('ADFIT_DISCOVERY_MAX_SEARCHES', 6, env),
    units: positiveEnv('ADFIT_DISCOVERY_MAX_UNITS', 40, env),
    candidates: positiveEnv('ADFIT_DISCOVERY_MAX_CANDIDATES', 40, env),
    queries: positiveEnv('ADFIT_DISCOVERY_MAX_QUERIES', 4, env),
    videos: positiveEnv('ADFIT_DISCOVERY_MAX_VIDEOS', 100, env),
    referenceUploads: positiveEnv('ADFIT_DISCOVERY_REFERENCE_UPLOADS', 25, env),
    comments: 0,
  };
}

/**
 * The competitor mode gets its own search bound because it fans out per brand:
 * three confirmed brands at two queries each is six searches before a single
 * candidate is enriched. Bounded by brands as well as by calls so a customer
 * confirming twelve competitors does not silently get two of them searched.
 */
export function collaborationLimits(env: Record<string, string | undefined> = process.env) {
  return {
    brands: positiveEnv('ADFIT_DISCOVERY_MAX_BRANDS', 5, env),
    searchesPerBrand: positiveEnv('ADFIT_DISCOVERY_SEARCHES_PER_BRAND', 2, env),
  };
}
