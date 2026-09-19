import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { analyzeChannel, type AnalyzeOptions } from './analyze';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * Store the public-data analysis against the CHANNEL, not a creator.
 *
 * `analyzeAndStore` writes the same figures to `report_metrics` keyed by
 * `creators.id`, which requires somebody to have signed up. Nothing in
 * `analyzeChannel` ever needed that — it takes a channel identifier and reads
 * public endpoints — so this is the same pass with a different destination.
 *
 * SHARED ACROSS CUSTOMERS on purpose. Two agencies evaluating the same creator
 * read the same row: the data is public, neither of them supplied any of it,
 * and making each one re-fetch an identical comment section multiplies the API
 * cost by the number of customers for the same answer. What is NOT shared is
 * anything a customer typed — that lives on `campaigns` and
 * `campaign_candidates`, behind their own organisation.
 *
 * NEVER THROWS, for the same reason `analyzeAndStore` does not: it runs inside
 * a request where a candidate row has already been written, and a YouTube
 * outage must not roll that back.
 */
export async function analyzeChannelAndStore(
  channelIdOrHandle: string,
  options: AnalyzeOptions = {},
): Promise<
  | { ok: true; channelId: string; title: string; comments: number; units: number }
  | { ok: false; reason: string }
> {
  if (!process.env.YOUTUBE_API_KEY) return { ok: false, reason: 'no_api_key' };
  const supabase = createServiceClient();
  if (!supabase) return { ok: false, reason: 'no_service_key' };

  try {
    const report = await analyzeChannel(channelIdOrHandle, options);
    const now = new Date().toISOString();

    const { error } = await supabase.from('channel_analyses').upsert(
      {
        channel_id: report.channelId,
        handle: report.handle,
        title: report.channelTitle,
        avatar_url: report.avatarUrl,
        description: report.description,
        subscribers: report.subscribers,
        output_stats: report.outputStats,
        platform_breakdown: report.platformBreakdown,
        promotions: report.promotions,
        comment_coverage: report.coverage,
        comment_register: report.commentRegister,
        // The keyword census. Superseded by the model pass when the worker
        // gets to it — same precedence as the creator path.
        comment_risks: report.commentRisks,
        moderation: report.moderation,
        engagement_rate: report.engagementRate,
        comments_analyzed: report.commentsAnalyzed,
        data_fetched_at: now,
        // NOT written here: comment_axes, clusters, sentiment and purchase
        // intent. Those are the classifier's, and this pass must not blank
        // them on a re-read — the same ownership split that stopped the
        // backfill deleting five minutes of paid model output.
      },
      { onConflict: 'channel_id' },
    );
    if (error) return { ok: false, reason: error.message };

    return {
      ok: true,
      channelId: report.channelId,
      title: report.channelTitle,
      comments: report.commentsAnalyzed,
      units: report.units,
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Queue the model passes for a channel.
 *
 * Same table, same worker, same lease and retry rules as the creator path —
 * `analysis_jobs.channel_id` is set instead of `creator_id` (0031). A second
 * queue would have duplicated all of that to point at a different column.
 */
export async function enqueueChannelJob(
  supabase: SupabaseClient,
  channelId: string,
  kind: 'classify_comments' | 'classify_intent',
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { error } = await supabase
    .from('analysis_jobs')
    .insert({ creator_id: null, channel_id: channelId, kind, params: {} });

  if (error) {
    // 23505 is the partial unique index: a job for this channel and kind is
    // already queued or running. That is success — the work is coming.
    if (error.code === '23505') return { ok: true };
    return { ok: false, reason: error.message };
  }
  return { ok: true };
}
