import 'server-only';

import { analyzeChannel, type AnalyzeOptions } from './analyze';
import { deriveCostEfficiency } from '@/lib/report/cost';
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

    // The price lives on `creators`, not in the channel analysis, so it is read
    // here rather than passed in — the pipeline must not need a database row to
    // measure a channel.
    const { data: creator } = await supabase
      .from('creators')
      .select('budget_min, budget_max, avatar_url, bio')
      .eq('id', creatorId)
      .maybeSingle<{ budget_min: number | null; budget_max: number | null; avatar_url: string | null; bio: string | null }>();

    // Has the classifier already run? Both passes read comments and they read
    // DIFFERENT AMOUNTS — this one is bounded for a signup, the classifier is
    // not. `comments_analyzed` and `comment_coverage` describe the corpus the
    // REPORT is built on, and once there are axes that corpus is the
    // classifier's. Overwriting them here printed "617 comments analysed"
    // above eighteen clusters counted over 884.
    const { data: existing } = await supabase
      .from('report_metrics')
      .select('comment_axes, moderation')
      .eq('creator_id', creatorId)
      .maybeSingle<{ comment_axes: unknown; moderation: { commentsScanned?: number } | null }>();
    const classified = existing?.comment_axes != null;
    // The model census supersedes the keyword lens, so this pass writes a
    // census only when there is none. Dropping it entirely would leave a new
    // creator with no brand-safety read at all between signup and the worker
    // picking their job up — which on a GitHub cron is minutes, and the lens
    // is deterministic, free and already computed.
    const scanned = existing?.moderation?.commentsScanned ?? 0;

    const cost = deriveCostEfficiency({
      budgetMin: creator?.budget_min ?? null,
      budgetMax: creator?.budget_max ?? null,
      medianViews: report.outputStats[0]?.medianViews ?? null,
      engagementRate: report.engagementRate,
    });

    // WHAT THIS PASS OWNS, and nothing else.
    //
    // Re-running the backfill used to null `comment_axes`, blank
    // `top_comment_clusters` and reset sentiment and purchase intent — so a
    // deep analyse after the classifier had finished DELETED five minutes of
    // paid model output and put the report back to "read but not classified".
    // Measured: @visuallyexplainededucation went from 884 comments with 18
    // clusters to 617 with none, in 4.9 seconds.
    //
    // An upsert only writes the columns it names, so the fix is to name fewer.
    // The classifier owns the axes, the clusters, the sentiment, the intent
    // measurement, the risk census and the moderation rollup. This pass owns
    // what the public API can see without a model.
    const { error } = await supabase.from('report_metrics').upsert(
      {
        creator_id: creatorId,
        teaser_highlights: [],
        // Authorized Data — needs the creator's own OAuth grant, and nothing
        // public substitutes. `{}` is how this schema spells absence.
        demographics: {},
        // Null, not an empty axes object: "read but not classified" is its own
        // state, distinct from "no comments". See lib/report/sufficiency.
        ...(classified ? {} : { comment_coverage: report.coverage }),
        brand_safety_score: null,
        engagement_rate: report.engagementRate,
        ad_fatigue_level: null,
        ai_summary: null,
        benchmarks: {},
        // Arithmetic over the price the creator published and the views
        // their videos get. `{}` is how this schema spells absence, and it
        // stays that when there is no price or no views to divide by.
        cost_efficiency: cost ?? {},
        sponsored_performance: report.sponsoredPerformance ?? {},
        brand_safety_flags: [],
        category_exposure: [],
        recommended_actions: [],
        platform_breakdown: report.platformBreakdown,
        public_opinion: {},
        output_stats: report.outputStats,
        promotions: report.promotions,
        comment_register: report.commentRegister,
        ...(scanned > 0
          ? {}
          : { comment_risks: report.commentRisks, moderation: report.moderation }),
        intent_samples: null,
        model_version: null,
        ...(classified ? {} : { comments_analyzed: report.commentsAnalyzed }),
        last_analyzed_at: now,
        // Retention horizons run from the FETCH, not from the analysis.
        data_fetched_at: now,
      },
      { onConflict: 'creator_id' },
    );
    if (error) return { ok: false, reason: error.message };

    // Fill the profile from the channel, but only where the creator has not
    // written their own. A backfill that overwrote a bio somebody edited would
    // be the report deleting their words — and this runs on every re-analysis,
    // not just at signup.
    const patch: Record<string, string> = {};
    if (!creator?.avatar_url && report.avatarUrl) patch.avatar_url = report.avatarUrl;
    if (!creator?.bio && report.description) {
      // A channel description is often several paragraphs of links. The bio
      // slot is one line under a name; take the first paragraph and cap it at
      // what the column allows.
      patch.bio = report.description.split(/\n{2,}/)[0].trim().slice(0, 500);
    }
    if (Object.keys(patch).length > 0) {
      await supabase.from('creators').update(patch).eq('id', creatorId);
    }

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
