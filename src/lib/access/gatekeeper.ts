import 'server-only';

import { cache } from 'react';

import type { AIReport, Creator, ProfileView } from '@/types';
import type {
  CreatorPublicProfileRow,
  ReportByTokenResult,
  ReportMetricsRow,
} from '@/types/database';
import { toAIReport, toAIReportFromRow, toAccessGrant, toCreator } from '@/lib/mappers';
import { parseAccessToken } from '@/lib/schemas';
import {
  createAnonClient,
  createSessionClient,
  isSupabaseConfigured,
} from '@/lib/supabase/server';
import { getViewer } from './viewer';
import {
  fixtureCreator,
  fixtureReport,
  fixtureDemographicsGrant,
  DEMO_TOKENS,
} from '@/lib/data/fixtures';

/**
 * Every column `toAIReportFromRow` reads, and no more.
 *
 * This list used to stop at `last_analyzed_at`, which meant the owner and
 * Pro-agency paths selected twelve columns while the mapper read twenty-four.
 * The missing eleven — benchmarks, platform_breakdown, public_opinion,
 * output_stats, comment_coverage, comment_axes and the rest — arrived as
 * undefined and were swallowed by the `.catch(null)` on their schemas, which
 * is there to stop a malformed pipeline write taking down a render. So a Pro
 * agency saw a report with no cohort ranking, no per-platform breakdown and no
 * sufficiency notice, and nothing anywhere said why: the same creator viewed
 * through a token link rendered in full. A parse guard cannot tell "the
 * pipeline wrote garbage" from "the query never asked", and the difference was
 * the entire paid tier.
 *
 * `intent_samples` is deliberately absent — worker input, not report content,
 * and a few hundred posts per creator. See migration 0013.
 */
const REPORT_COLUMNS_BASE =
  'creator_id, top_comment_clusters, comment_axes, comment_coverage, ' +
  'sentiment_score, purchase_intent_rate, brand_safety_score, engagement_rate, ' +
  'ad_fatigue_level, ai_summary, benchmarks, cost_efficiency, sponsored_performance, ' +
  'brand_safety_flags, comment_risks, moderation, comment_register, category_exposure, ' +
  'recommended_actions, platform_breakdown, ' +
  'public_opinion, output_stats, promotions, purchase_intent_ci_low, ' +
  'purchase_intent_ci_high, purchase_intent_basis, commercial_density, ' +
  'intent_comments_scored, intent_posts_scored, product_posts_analyzed, ' +
  'intent_dispersion, intent_rubric_version, model_version, comments_analyzed, ' +
  'data_fetched_at, data_refresh_due_at, last_analyzed_at';

/**
 * Demographics are selected only for a viewer entitled to see them.
 *
 * III.E.3.b: Authorized Data may be shown to "the authorizing user or agents
 * expressly approved by that user" and to nobody else. Demographics are the
 * one block that genuinely requires creator OAuth, which is precisely what
 * makes them Authorized.
 *
 * Nulling the field after the read would satisfy the clause on paper and miss
 * the point this codebase is built on: locked data is never fetched for a
 * browser that may not have it. Leaving the column out of the projection means
 * there is nothing in the process to leak, the same way the locked branches of
 * ProfileView have no `report` key at all.
 */
function reportColumns(withDemographics: boolean): string {
  return withDemographics ? `${REPORT_COLUMNS_BASE}, demographics` : REPORT_COLUMNS_BASE;
}

/** `/@marah.woods` → `marah.woods`. Route params arrive percent-encoded. */
function normalizeHandle(raw: string): string {
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    // Malformed percent-encoding: fall through with the raw segment, which
    // simply fails to match a creator.
  }
  return value.trim().replace(/^@+/, '').toLowerCase();
}

/**
 * Public profile row, or null. Cached so `generateMetadata` and the page body
 * share a single query per request.
 */
export const getCreatorByHandle = cache(async (rawHandle: string): Promise<Creator | null> => {
  const handle = normalizeHandle(rawHandle);
  if (!handle) return null;

  if (!isSupabaseConfigured()) return fixtureCreator(handle);

  const supabase = createAnonClient();
  const { data, error } = await supabase
    .from('creator_public_profiles')
    .select('*')
    .eq('handle', handle)
    .maybeSingle<CreatorPublicProfileRow>();

  if (error) {
    console.error('[creator_public_profiles] query failed', { handle, error: error.message });
    return null;
  }

  return data ? toCreator(data) : null;
});

/**
 * The gatekeeper. One entry point, four possible verdicts, tried in order:
 *
 *   1. owner       — the creator looking at their own profile
 *   2. pro_agency  — a Pro subscriber, when the creator opted into the directory
 *   3. token       — a valid, unexpired Track A link
 *   4. locked      — everyone else, with a reason the UI can explain
 *
 * Pro is checked before the token so a standing entitlement doesn't burn a
 * per-link view counter, but it falls through to the token when the creator has
 * *not* opted into the directory — an agency can still hold a 1:1 grant.
 *
 * On every locked branch the returned object has no `report` key, so an
 * unauthorised visitor's RSC payload cannot contain locked metrics regardless
 * of what the components do with CSS.
 */
export const resolveProfileAccess = cache(
  async (rawHandle: string, rawToken?: string | string[]): Promise<ProfileView | null> => {
    const creator = await getCreatorByHandle(rawHandle);
    if (!creator) return null;

    const viewer = await getViewer();

    // 1. Owner.
    if (viewer.creatorId && viewer.creatorId === creator.id) {
      // The authorizing user, reading their own Authorized Data. The clause is
      // about everyone else.
      const report = await readReportAsViewer(creator.id, true);
      return report
        ? { creator, access: { mode: 'owner' }, report }
        : { creator, access: { mode: 'locked', reason: 'report_pending' } };
    }

    // 2. Pro agency, but only for creators who opted into the directory.
    if (viewer.isProAgency && viewer.organization && creator.isDirectoryVisible) {
      // The plan buys the report. It does not buy the demographics: those are
      // Authorized Data, and III.E.3.b wants this creator to have approved
      // THIS organisation by name. One click, on one block — the rest of the
      // report is unchanged, and the blocked block is the one no competitor
      // reading public data can produce at all.
      const demographicsGranted = await hasDemographicsGrant(creator.id);
      const report = await readReportAsViewer(creator.id, demographicsGranted);
      if (report) {
        return {
          creator,
          access: {
            mode: 'pro_agency',
            organization: { id: viewer.organization.id, name: viewer.organization.name },
            demographicsGranted,
          },
          report,
        };
      }
      return { creator, access: { mode: 'locked', reason: 'report_pending' } };
    }

    // 3. Track A token.
    const token = parseAccessToken(rawToken);
    if (token) {
      const result = await readReportByToken(creator.handle, token);

      switch (result.status) {
        case 'ok':
          return {
            creator,
            access: { mode: 'token', grant: toAccessGrant(result.grant) },
            report: toAIReport(result.report),
          };
        case 'expired':
          return { creator, access: { mode: 'locked', reason: 'expired' } };
        case 'report_pending':
          return { creator, access: { mode: 'locked', reason: 'report_pending' } };
        default:
          return { creator, access: { mode: 'locked', reason: 'invalid_token' } };
      }
    }

    // 4. Locked. A Pro member gets told *why* rather than a generic lock.
    if (viewer.isProAgency && !creator.isDirectoryVisible) {
      return { creator, access: { mode: 'locked', reason: 'not_directory_visible' } };
    }

    return { creator, access: { mode: 'locked', reason: 'no_token' } };
  },
);

/**
 * Has this creator expressly approved the viewer's organisation for
 * demographics? Wrong-in-the-permissive-direction here would be a policy
 * breach, so it is a SECURITY DEFINER function rather than a client-side join,
 * and any error reads as "no grant".
 */
async function hasDemographicsGrant(creatorId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return fixtureDemographicsGrant();

  const supabase = createSessionClient();
  const { data, error } = await supabase.rpc('has_demographics_grant', {
    p_creator_id: creatorId,
  });

  if (error) {
    console.error('[demographics_grants] check failed', { creatorId, error: error.message });
    return false;
  }
  return data === true;
}

/**
 * Reads `report_metrics` as the signed-in user. Carries no plan check of its
 * own — RLS returns the row for the owner or a Pro member and nothing for
 * anyone else, so a bug in `getViewer` cannot widen access.
 */
async function readReportAsViewer(
  creatorId: string,
  withDemographics: boolean,
): Promise<AIReport | null> {
  if (!isSupabaseConfigured()) return fixtureReport(creatorId, withDemographics);

  const supabase = createSessionClient();
  const { data, error } = await supabase
    .from('report_metrics')
    .select(reportColumns(withDemographics))
    .eq('creator_id', creatorId)
    .maybeSingle<ReportMetricsRow>();

  if (error) {
    console.error('[report_metrics] read failed', { creatorId, error: error.message });
    return null;
  }

  return data ? toAIReportFromRow(data) : null;
}

async function readReportByToken(
  handle: string,
  token: string,
): Promise<ReportByTokenResult> {
  if (!isSupabaseConfigured()) return fixtureTokenResult(handle, token);

  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc('get_report_by_token', {
    p_handle: handle,
    p_token: token,
  });

  if (error) {
    // Never fail open: an unreachable database renders the locked view.
    console.error('[get_report_by_token] rpc failed', { handle, error: error.message });
    return { status: 'invalid' };
  }

  return (data as ReportByTokenResult | null) ?? { status: 'invalid' };
}

function fixtureTokenResult(handle: string, token: string): ReportByTokenResult {
  const report = fixtureReportByHandle(handle);
  if (!report) return { status: 'invalid' };

  if (token === DEMO_TOKENS.expired) return { status: 'expired' };
  if (token !== DEMO_TOKENS.valid) return { status: 'invalid' };

  return {
    status: 'ok',
    grant: {
      requestId: 'req_demo',
      companyName: 'Northbeam Media',
      expiresAt: new Date(Date.now() + 12 * 86_400_000).toISOString(),
      viewCount: 1,
    },
    report: {
      creatorId: report.creatorId,
      demographics: report.demographics,
      topCommentClusters: report.topCommentClusters,
      commentAxes: report.commentAxes,
      sentimentScore: report.sentimentScore,
      purchaseIntentRate: report.purchaseIntentRate,
      engagementRate: report.engagementRate,
      adFatigueLevel: report.adFatigueLevel,
      aiSummary: report.aiSummary,
      benchmarks: report.benchmarks,
      costEfficiency: report.costEfficiency,
      sponsoredPerformance: report.sponsoredPerformance,
      brandSafetyFlags: report.brandSafetyFlags,
      commentRisks: report.commentRisks,
      moderation: report.moderation,
      commentRegister: report.commentRegister,
      recommendedActions: report.recommendedActions,
      promotions: report.promotions,
      intent: report.intent,
      // Fixtures are freshly built each request, so nothing is ever past its
      // horizon here. Stated rather than omitted: a missing field would make
      // the demo take the "never stamped" branch by accident.
      // Fixtures have no ingestion worker, so the analysis date is the fetch
      // date — which is true of the real pipeline too: the corpus is read and
      // clustered in one pass. This is what puts the demo creator on a live
      // 30-day verbatim clock rather than an exempt one.
      dataFetchedAt: report.lastAnalyzedAt,
      dataRefreshDueAt: null,
      platformBreakdown: report.platformBreakdown,
      publicOpinion: report.publicOpinion,
      outputStats: report.outputStats,
      coverage: report.coverage,
      modelVersion: report.modelVersion,
      commentsAnalyzed: report.commentsAnalyzed,
      lastAnalyzedAt: report.lastAnalyzedAt,
    },
  };
}

function fixtureReportByHandle(handle: string): AIReport | null {
  const creator = fixtureCreator(handle);
  return creator ? fixtureReport(creator.id) : null;
}
