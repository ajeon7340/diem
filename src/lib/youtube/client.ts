import 'server-only';

/**
 * A thin YouTube Data API v3 client with quota accounting.
 *
 * Quota is the binding constraint on every feature built on this, and it is
 * wildly uneven: `videos.list` costs 1 unit and `search.list` costs 100. A
 * default project gets 10,000 units a day, so a hundred searches exhausts it
 * while ten thousand video reads do not. Every call site should know which one
 * it is making, which is why the cost is returned rather than hidden.
 */

const BASE = 'https://www.googleapis.com/youtube/v3';

/** Documented unit costs. Anything unlisted is a read and costs 1. */
const COST: Record<string, number> = { search: 100 };

export class YouTubeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason: string | null,
  ) {
    super(message);
    this.name = 'YouTubeError';
  }
}

export interface Fetched<T> {
  items: T[];
  /** Units this call consumed, so a caller can budget a multi-step flow. */
  units: number;
}

export async function ytFetch<T = unknown>(
  endpoint: string,
  params: Record<string, string | number>,
): Promise<Fetched<T>> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new YouTubeError('YOUTUBE_API_KEY is not set', 500, 'no_key');

  const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), key });
  const res = await fetch(`${BASE}/${endpoint}?${qs}`, {
    // The trending chart changes hourly at most and a pasted video's stats do
    // not move in a minute. Caching here is what keeps the feature inside
    // quota under any real traffic.
    next: { revalidate: 900 },
  });

  const body = (await res.json().catch(() => ({}))) as {
    items?: T[];
    error?: { message?: string; errors?: Array<{ reason?: string }> };
  };

  if (!res.ok) {
    const reason = body.error?.errors?.[0]?.reason ?? null;
    throw new YouTubeError(
      body.error?.message ?? `YouTube returned ${res.status}`,
      res.status,
      reason,
    );
  }

  return { items: body.items ?? [], units: COST[endpoint.split('/')[0]] ?? 1 };
}

export { parseDuration, parseVideoId } from './parse';
