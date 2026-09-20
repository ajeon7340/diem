/**
 * A retriever made of fixtures.
 *
 * Every rule discovery turns on — dedupe, reference exclusion, evidence
 * grounding, post-retrieval filtering, partial results, cancellation — is a
 * property of the PIPELINE, not of YouTube, and asserting it against the live
 * API would be slow, non-deterministic and quota-spending. The pipelines take a
 * `Retriever` for exactly this reason; this is the other implementation.
 *
 * NOTHING HERE IS PRESENTED AS LIVE DATA. The channel ids are obviously
 * synthetic and the verify script says which of its checks ran against
 * fixtures, because a fixture result reported as a live verification is the
 * same class of claim this product exists to refuse.
 */
import { QuotaLedger } from '@/lib/youtube/quota';
import type { ChannelFacts, SearchPage, SearchQuery, SearchVideoHit, VideoFacts } from '@/lib/youtube/search';
import { QuotaExhausted } from '@/lib/youtube/search';
import type { Retriever } from '@/lib/discovery/retriever';
import type { ResolveResult } from '@/lib/youtube/resolve';

export const CHANNEL = {
  grinder: 'UCgrinder000000000000000',
  barista: 'UCbarista000000000000000',
  reference: 'UCreference0000000000000',
  topic: 'UCtopicchan0000000000000',
  hidden: 'UChiddensubs000000000000',
} as const;

export interface FixtureOptions {
  /** Videos returned per query, keyed by the query string. */
  results?: Record<string, SearchVideoHit[]>;
  channels?: ChannelFacts[];
  videos?: VideoFacts[];
  uploads?: Record<string, string[]>;
  resolve?: Record<string, ResolveResult>;
  budget?: { units: number; searchCalls: number };
  /** Throw on the nth search call (1-based), as a live quota wall would. */
  failSearchAt?: number;
  now?: string;
}

export function fixtureRetriever(options: FixtureOptions = {}): Retriever & { searches: string[] } {
  const ledger = new QuotaLedger(options.budget ?? { units: 100, searchCalls: 10 });
  const searches: string[] = [];

  return {
    searches,
    ledger,
    now: () => new Date(options.now ?? '2026-09-20T00:00:00.000Z'),

    async searchVideos(query: SearchQuery): Promise<SearchPage<SearchVideoHit>> {
      if (!ledger.canSearch()) throw new QuotaExhausted(ledger.exhausted() ?? 'search_calls');
      ledger.recordSearch();
      searches.push(query.q);
      if (options.failSearchAt && searches.length === options.failSearchAt) {
        throw new QuotaExhausted('search_calls');
      }
      return { items: options.results?.[query.q] ?? [], nextPageToken: null };
    },

    async fetchChannels(ids: string[]): Promise<ChannelFacts[]> {
      ledger.recordRead();
      return (options.channels ?? []).filter((c) => ids.includes(c.channelId));
    },

    async fetchVideos(ids: string[]): Promise<VideoFacts[]> {
      ledger.recordRead();
      return (options.videos ?? []).filter((v) => ids.includes(v.videoId));
    },

    async fetchRecentUploads(channelId: string, limit: number): Promise<string[]> {
      ledger.recordRead();
      return (options.uploads?.[channelId] ?? []).slice(0, limit);
    },

    async resolveChannel(handleOrId: string): Promise<ResolveResult> {
      return (
        options.resolve?.[handleOrId] ?? { ok: false, message: `No fixture channel for ${handleOrId}.` }
      );
    },
  };
}

export function hit(videoId: string, channelId: string, title: string, description = ''): SearchVideoHit {
  return {
    videoId,
    channelId,
    channelTitle: channelId,
    title,
    description,
    publishedAt: '2026-08-01T00:00:00.000Z',
  };
}

export function video(
  videoId: string,
  channelId: string,
  title: string,
  description: string,
  overrides: Partial<VideoFacts> = {},
): VideoFacts {
  return {
    videoId,
    channelId,
    title,
    description,
    publishedAt: '2026-08-01T00:00:00.000Z',
    views: 10_000,
    paidPromotion: null,
    seconds: 600,
    declaredLanguage: 'en',
    ...overrides,
  };
}

export function channel(channelId: string, title: string, overrides: Partial<ChannelFacts> = {}): ChannelFacts {
  return {
    channelId,
    title,
    handle: `@${title.toLowerCase().replace(/\s+/g, '')}`,
    avatar: null,
    description: `${title} makes videos.`,
    subscribers: 50_000,
    hiddenSubscribers: false,
    videoCount: 200,
    viewCount: 5_000_000,
    country: 'GB',
    publishedAt: '2020-01-01T00:00:00.000Z',
    ...overrides,
  };
}
