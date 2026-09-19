import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { aiModel, aiProvider } from '@/lib/ai/provider';
import {
  classifyComments,
  fetchAllComments,
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
  if (!process.env.YOUTUBE_API_KEY) {
    throw new Error('YOUTUBE_API_KEY is required — commentThreads.list needs it.');
  }
  const keyVar = aiProvider() === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY';
  if (!process.env[keyVar]) throw new Error(`${keyVar} is required for ${aiProvider()}.`);
}

/** Brand safety over a channel's comments. Never swallows — the worker marks the job. */
export async function classifyChannelAndStore(
  supabase: SupabaseClient,
  channelId: string,
  options: ClassifyRunOptions & { maxVideos?: number; maxComments?: number } = {},
): Promise<ChannelClassifyResult> {
  requireKeys();

  const corpus = await fetchAllComments(
    process.env.YOUTUBE_API_KEY!,
    { channelId },
    options.maxVideos ?? Infinity,
    options.maxComments ?? Infinity,
  );
  const spend: Spend = { inputTokens: 0, outputTokens: 0, calls: 0 };
  const flagged = await classifyComments(corpus.comments, spend, options);
  // No moderation history: see the note above. The default argument is the
  // honest value here, not a stand-in for one we failed to read.
  const rollup = rollUp(corpus.comments, flagged, corpus.channelId);

  const { error } = await supabase
    .from('channel_analyses')
    .update({
      comment_risks: rollup.risks,
      comment_register: rollup.register,
      moderation: rollup.moderation,
      analysed_at: new Date().toISOString(),
    })
    .eq('channel_id', channelId);
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
  options: IntentRunOptions & { maxVideos?: number; maxComments?: number } = {},
): Promise<ChannelIntentResult> {
  requireKeys();

  const corpus = await fetchAllComments(
    process.env.YOUTUBE_API_KEY!,
    { channelId },
    options.maxVideos ?? Infinity,
    options.maxComments ?? Infinity,
  );
  const spend: Spend = { inputTokens: 0, outputTokens: 0, calls: 0 };
  const labels = await classifyAxes(corpus.comments, spend, options);
  const rollup = rollUpAxes(labels);
  const clusters = buildClusters(corpus.comments, labels);
  const { measurement } = rollup;

  const { error } = await supabase
    .from('channel_analyses')
    .update({
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
    })
    .eq('channel_id', channelId);
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
