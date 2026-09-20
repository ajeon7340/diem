import { describeContent } from '@/lib/channel/content-profile';
import type { VideoEvidence } from './analyze';
import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { freshData } from '@/lib/channel/state';
import { AMENDMENT_ACCEPTED } from '@/lib/report/policy';
import { aiModel, aiProvider } from '@/lib/ai/provider';
import {
  classifyComments,
  ClaimLostError,
  type FetchedCorpus,
  rollUp,
  type ClassifyRunOptions,
  type Spend,
} from './classify';
import { buildClusters } from './clusters';
import { classifyAxes, rollUpAxes, type IntentRunOptions } from './intent';
import { INTENT_RUBRIC_VERSION } from '@/lib/report/intent';

/**
 * The two model passes, run against a CHANNEL rather than a signed-up creator.
 *
 * Every step up to the write is identical to `classifyAndStore` /
 * `classifyIntentAndStore` and is imported from them — the fetch, the batching,
 * the concurrency, the rollup, the clustering. Only the destination differs:
 * `channel_analyses` keyed by channel id, not `report_metrics` keyed by
 * `creators.id`.
 *
 * WHAT IS DELIBERATELY ABSENT: the moderation queue. Those rows exist so a
 * creator can hide a comment on their own channel, which requires owning it.
 * An advertiser analysing a channel they have no relationship with gets the
 * rollup and no queue, and `hiddenTotal` is therefore 0 — correctly, because
 * nobody has hidden anything through us.
 */

export interface ChannelClassifyResult {
  commentsScanned: number;
  videos: number;
  flagged: number;
  spend: Spend;
}

function requireKeys(): void {
  if (!AMENDMENT_ACCEPTED) throw Object.assign(new Error("YouTube derived-analysis approval is not configured."), { terminal: true });
  if (!process.env.YOUTUBE_API_KEY) {
    throw new Error('YOUTUBE_API_KEY is required — commentThreads.list needs it.');
  }
  const keyVar = aiProvider() === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY';
  if (!process.env[keyVar]) throw new Error(`${keyVar} is required for ${aiProvider()}.`);
}

async function storedCorpus(supabase: SupabaseClient, channelId: string): Promise<FetchedCorpus & { fetchedAt:string }> {
  const { data, error } = await supabase.from('channel_analyses')
    .select('comment_corpus,evidence,data_fetched_at').eq('channel_id',channelId).maybeSingle();
  if (error || !data || !freshData(data.data_fetched_at) || !Array.isArray(data.comment_corpus)) {
    throw Object.assign(new Error('Refresh channel data before analysing comments.'), { terminal: true });
  }
  return { comments: data.comment_corpus, videos: data.evidence?.videos?.length ?? 0,
    unreadable: data.evidence?.unreadable ?? 0, channelId, fetchedAt:data.data_fetched_at };
}

/** Brand safety over a channel's comments. Never swallows — the worker marks the job. */
export async function classifyChannelAndStore(
  supabase: SupabaseClient,
  channelId: string,
  options: ClassifyRunOptions & { maxVideos?: number; maxComments?: number; jobId?:string; worker?:string } = {},
): Promise<ChannelClassifyResult> {
  requireKeys();

  const corpus = await storedCorpus(supabase, channelId);
  const spend: Spend = { inputTokens: 0, outputTokens: 0, calls: 0 };
  const flagged = await classifyComments(corpus.comments, spend, options);
  // No moderation history: see the note above. The default argument is the
  // honest value here, not a stand-in for one we failed to read.
  const rollup = rollUp(corpus.comments, flagged, corpus.channelId);

  if (options.stillMine && !(await options.stillMine())) throw new ClaimLostError();
  const { data: committed, error } = await supabase.rpc('commit_channel_classification', {
    p_job:options.jobId,p_worker:options.worker,p_fetched_at:corpus.fetchedAt,p_fields:{
      comment_risks: rollup.risks,
      comment_register: rollup.register,
      moderation: rollup.moderation,
      analysed_at: new Date().toISOString(),
    }});
  if (!error && !committed) throw new ClaimLostError();
  if (error) throw new Error(`channel_analyses write failed: ${error.message}`);

  return {
    commentsScanned: corpus.comments.length,
    videos: corpus.videos,
    flagged: flagged.length,
    spend,
  };
}

export interface ChannelIntentResult {
  commentsClassified: number;
  videos: number;
  productComments: number;
  rate: number | null;
  sentiment: number | null;
  spend: Spend;
}

/** The two-axis pass and the clusters derived from it. */
export async function classifyChannelIntentAndStore(
  supabase: SupabaseClient,
  channelId: string,
  options: IntentRunOptions & { maxVideos?: number; maxComments?: number; jobId?:string; worker?:string } = {},
): Promise<ChannelIntentResult> {
  requireKeys();

  const corpus = await storedCorpus(supabase, channelId);
  const spend: Spend = { inputTokens: 0, outputTokens: 0, calls: 0 };
  const labels = await classifyAxes(corpus.comments, spend, options);
  const rollup = rollUpAxes(labels);
  const clusters = buildClusters(corpus.comments, labels);
  const { measurement } = rollup;
  const { data: source } = await supabase.from('channel_analyses').select('evidence').eq('channel_id',channelId).maybeSingle();
  const contentProfile = await describeContent((source?.evidence?.videos??[]) as VideoEvidence[]);

  if (options.stillMine && !(await options.stillMine())) throw new ClaimLostError();
  const { data: committed, error } = await supabase.rpc('commit_channel_classification', {
    p_job:options.jobId,p_worker:options.worker,p_fetched_at:corpus.fetchedAt,p_fields:{
      content_profile: contentProfile,
      comment_axes: rollup.axes,
      top_comment_clusters: clusters,
      sentiment_score: rollup.sentiment,
      purchase_intent_rate: measurement.rate,
      purchase_intent_basis: measurement.basis,
      intent_comments_scored: measurement.commentsScored,
      intent_rubric_version: INTENT_RUBRIC_VERSION,
      // The denominator the axes are over, for the same reason the creator
      // path rewrites it: the bounded inline pass wrote 600 here and this pass
      // read a different corpus. Two corpus sizes for one classification is
      // how a share gets divided by the wrong number.
      comments_analyzed: rollup.axes.total,
      model_version: `${aiProvider()}:${aiModel()}`,
      analysed_at: new Date().toISOString(),
    }});
  if (!error && !committed) throw new ClaimLostError();
  if (error) throw new Error(`channel_analyses write failed: ${error.message}`);

  return {
    commentsClassified: rollup.axes.total,
    videos: corpus.videos,
    productComments: measurement.commentsScored,
    rate: measurement.rate,
    sentiment: rollup.sentiment,
    spend,
  };
}
