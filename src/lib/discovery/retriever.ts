import type { ChannelFacts, SearchPage, SearchQuery, SearchVideoHit, VideoFacts } from '@/lib/youtube/search';
import type { QuotaLedger } from '@/lib/youtube/quota';
import type { ResolveResult } from '@/lib/youtube/resolve';

/**
 * Everything the pipelines are allowed to reach the network through.
 *
 * An interface rather than direct imports so the three modes can be exercised
 * against fixtures with no key, no network and no quota — which is the only way
 * the rules that matter here (dedupe, reference exclusion, evidence grounding,
 * partial results, cancellation) can be asserted deterministically. The live
 * implementation is a thin binding in `retriever-live.ts`; nothing in a pipeline
 * imports `server-only`, and that is what keeps them testable.
 */
export interface Retriever {
  searchVideos(query: SearchQuery): Promise<SearchPage<SearchVideoHit>>;
  fetchChannels(channelIds: string[]): Promise<ChannelFacts[]>;
  fetchVideos(videoIds: string[]): Promise<VideoFacts[]>;
  fetchRecentUploads(channelId: string, limit: number): Promise<string[]>;
  resolveChannel(handleOrId: string): Promise<ResolveResult>;
  ledger: QuotaLedger;
  now(): Date;
}

/**
 * The job's own control channel.
 *
 * `checkpoint` is called between steps and does three things at once: it
 * extends the lease, reports the stage, and answers whether this run still owns
 * the job. Returning false means CANCELLED OR REASSIGNED — the run stops and
 * keeps whatever it has, rather than finishing work nobody is waiting for.
 */
export interface RunControl {
  checkpoint(stage: string, note?: string): Promise<boolean>;
}

export const NO_CONTROL: RunControl = { checkpoint: async () => true };
