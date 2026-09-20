import 'server-only';

import { QuotaLedger } from '@/lib/youtube/quota';
import { fetchChannels, fetchRecentUploads, fetchVideos, searchVideos } from '@/lib/youtube/search';
import { resolveChannel } from '@/lib/youtube/resolve';
import { discoveryLimits } from './limits';
import type { Retriever } from './retriever';

/**
 * The live binding: the pipeline interface, wired to the real endpoints.
 *
 * Thin by design. Everything that decides anything lives in the pipelines,
 * which are pure and tested against fixtures; this file is the only place that
 * touches the network, so there is exactly one thing to stub.
 */
export function liveRetriever(ledger = new QuotaLedger(budget())): Retriever {
  return {
    ledger,
    now: () => new Date(),
    searchVideos: (query) => searchVideos(query, ledger),
    fetchChannels: (ids) => fetchChannels(ids, ledger),
    fetchVideos: (ids) => fetchVideos(ids, ledger),
    fetchRecentUploads: (channelId, limit) => fetchRecentUploads(channelId, limit, ledger),
    resolveChannel: (handleOrId) => resolveChannel(handleOrId),
  };
}

export function budget() {
  const limits = discoveryLimits();
  return { units: limits.units, searchCalls: limits.searchCalls };
}
