import 'server-only';

import { analyzeChannel, type AnalyzeOptions } from './analyze';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * Run the public-data analysis for a creator and store it.
 *
 * Shared by `/onboarding/creator` and `scripts/analyze-creator.ts` so a signup
 * and a backfill cannot drift into producing different reports for the same
 * channel — the failure mode that made every stored `brand_safety_score`
 * disagree with the derived one.
 *
 * NEVER THROWS. A creator whose signup succeeded must end up on their profile
 * even if YouTube is down, the quota is exhausted, or the handle stopped
 * resolving between the check and here. The row exists; the report can be
 * rebuilt by running the script. Throwing would roll a creator back to the
 * signup form with their account already created and their handle taken.
 */
export async function analyzeAndStore(
  creatorId: string,
  channelIdOrHandle: string,
  options: AnalyzeOptions = {},
): Promise<{ ok: true; comments: number; units: number } | { ok: false; reason: string }> {
  if (!process.env.YOUTUBE_API_KEY) return { ok: false, reason: 'no_api_key' };
  const supabase = createServiceClient();
  if (!supabase) return { ok: false, reason: 'no_service_key' };

  try {
    const report = await analyzeChannel(channelIdOrHandle, options);
    const now = new Date().toISOString();

    const { error } = await supabase.from('report_metrics').upsert(
      {
        creator_id: creatorId,
        teaser_highlights: [],
        // Authorized Data — needs the creator's own OAuth grant, and nothing
        // public substitutes. `{}` is how this schema spells absence.
        demographics: {},
        top_comment_clusters: [],
        // Null, not an empty axes object: "read but not classified" is its own
        // state, distinct from "no comments". See lib/report/sufficiency.
        comment_axes: null,
        comment_coverage: report.coverage,
        sentiment_score: null,
        purchase_intent_rate: null,
        brand_safety_score: null,
        engagement_rate: report.engagementRate,
        ad_fatigue_level: null,
        ai_summary: null,
        benchmarks: {},
        cost_efficiency: {},
        sponsored_performance: report.sponsoredPerformance ?? {},
        brand_safety_flags: [],
        category_exposure: [],
        recommended_actions: [],
        platform_breakdown: report.platformBreakdown,
        public_opinion: {},
        output_stats: report.outputStats,
        promotions: report.promotions,
        comment_risks: report.commentRisks,
        moderation: report.moderation,
        comment_register: report.commentRegister,
        purchase_intent_ci_low: null,
        purchase_intent_ci_high: null,
        purchase_intent_basis: null,
        commercial_density: null,
        intent_comments_scored: null,
        intent_posts_scored: null,
        product_posts_analyzed: null,
        intent_dispersion: null,
        intent_rubric_version: null,
        intent_samples: null,
        model_version: null,
        comments_analyzed: report.commentsAnalyzed,
        last_analyzed_at: now,
        // Retention horizons run from the FETCH, not from the analysis.
        data_fetched_at: now,
      },
      { onConflict: 'creator_id' },
    );
    if (error) return { ok: false, reason: error.message };

    // The DECLARED channel row: public figures, no credential. Without it
    // `creator_public_profiles.total_followers` coalesces to 0 and the media
    // kit opens with "Total audience 0" above "Followers 474K".
    if (report.subscribers !== null) {
      await supabase.from('social_accounts').upsert(
        {
          creator_id: creatorId,
          platform: 'youtube',
          channel_id: report.channelId,
          channel_handle: report.handle,
          access_token: null,
          scopes: [],
          follower_count: report.subscribers,
          stats_summary: {
            medianViews: report.outputStats[0]?.medianViews ?? null,
            engagementRate: report.engagementRate,
            source: 'public_api',
          },
          last_synced_at: now,
        },
        { onConflict: 'creator_id,platform,channel_id' },
      );
    }

    return { ok: true, comments: report.commentsAnalyzed, units: report.units };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
