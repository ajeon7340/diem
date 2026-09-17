import type {
  AccessGrant,
  InboundBrief,
  Offer,
  AdFatigueLevel,
  AIReport,
  Creator,
  DirectoryListing,
  AccessRequest,
  DemographicsGrant,
} from '@/types';
import type {
  AccessRequestRow,
  BriefRecipientRow,
  OfferRow,
  CreatorPublicProfileRow,
  DirectoryListingRow,
  ReportMetricsRow,
  ReportPayload,
  DemographicsGrantRow,
} from '@/types/database';
import { censusRisk, deriveBrandSafety } from './report/safety';
import { audienceClimate } from './report/climate';
import { aggregateFromCells, type IntentCells } from './report/intent';
import { expireVerbatim, stripCrossOwnerAggregates, withinRetention } from './report/policy';
import {
  benchmarksSchema,
  commentCoverageSchema,
  brandSafetyFlagsSchema,
  commentRisksSchema,
  commentRegisterSchema,
  moderationSchema,
  commentAxesSchema,
  intentMeasurementSchema,
  promotionsSchema,
  commentClustersSchema,
  costEfficiencySchema,
  demographicsSchema,
  platformStatsSchema,
  outputStatsSchema,
  platformBreakdownSchema,
  publicOpinionSchema,
  recommendedActionsSchema,
  sponsoredPerformanceSchema,
  teaserHighlightsSchema,
} from './schemas';

const FATIGUE_LEVELS: readonly AdFatigueLevel[] = ['low', 'moderate', 'high'];

function num(value: number | string | null | undefined, fallback = 0): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Absent stays absent. The previous `clamp(..., 0)` turned a missing score into
 * a zero, which renders as the worst possible rating rather than as unmeasured.
 */
function clampOrNull(value: number | null | undefined, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(max, Math.max(min, value));
}

/**
 * Absent stays absent. This used to fall back to 'moderate', which turned "no
 * sponsored history to measure" into a rating — and a creator with zero
 * sponsored posts was being shown a fatigue level as though it had been
 * measured.
 */
function fatigue(value: AdFatigueLevel | null | undefined): AdFatigueLevel | null {
  return value && FATIGUE_LEVELS.includes(value) ? value : null;
}

/**
 * These columns default to `'{}'` rather than NULL, so an un-analysed creator
 * arrives as an empty object. Nullable schemas read that as "absent" — which
 * is what the UI needs to tell "no data yet" apart from "genuinely zero".
 */
function emptyToNull(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.keys(value).length === 0 ? null : value;
  }
  return value ?? null;
}

export function toCreator(row: CreatorPublicProfileRow): Creator {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    niche: row.niche,
    bio: row.bio,
    isVerified: row.is_verified,
    isDirectoryVisible: row.is_directory_visible,
    budgetMin: row.budget_min ?? row.minimum_budget,
    budgetMax: row.budget_max,
    budgetNegotiable: row.budget_negotiable ?? false,
    minimumBudget: row.minimum_budget,
    totalFollowers: num(row.total_followers),
    platforms: platformStatsSchema.parse(row.platforms),
    teaserHighlights: teaserHighlightsSchema.parse(row.teaser_highlights),
    hasReport: row.has_report,
    lastAnalyzedAt: row.last_analyzed_at,
  };
}

/** From the RPC payload (camelCase, produced by `report_to_jsonb`). */
export function toAIReport(payload: ReportPayload): AIReport {
  // Three policy gates at the last step, so nothing downstream has to remember
  // them. Cross-creator comparisons are withheld (III.E.2); a row past its
  // derived horizon blanks rather than serving (III.E.4.c/d); and verbatim text
  // drops at 30 days even while the derived figures around it are still inside
  // the amended horizon (III.E.4.d, which no amendment extends).
  //
  // Innermost first: expire the quotes, then blank the row if the whole thing
  // is past due. The outer gate is the stricter one, so order only matters for
  // the window where a row is past 30 days but inside 36 months — which is the
  // entire reason the verbatim gate exists.
  return stripCrossOwnerAggregates(
    withinRetention(
      expireVerbatim(buildAIReport(payload), payload.dataFetchedAt ?? null),
      payload.dataRefreshDueAt ?? null,
    ),
  );
}

function buildAIReport(payload: ReportPayload): AIReport {
  const brandSafetyFlags = brandSafetyFlagsSchema.parse(payload.brandSafetyFlags);
  const commentsAnalyzed = num(payload.commentsAnalyzed);
  const commentRisks = commentRisksSchema.parse(payload.commentRisks);
  const moderation = moderationSchema.parse(emptyToNull(payload.moderation));
  // Purchase intent is DERIVED from the cross-tab when the classifier emitted
  // one, for the same reason brand safety is: a stored headline can drift from
  // the axis beneath it, and a derived one cannot. Rows without cells keep
  // whatever the pipeline stored — with the basis it stored, which may be
  // unknown, which is exactly what `basis` exists to admit.
  const storedIntent = intentMeasurementSchema.parse(emptyToNull(payload.intent));
  const axes = commentAxesSchema.parse(emptyToNull(payload.commentAxes));
  const derivedIntent =
    axes && axes.cells.length > 0
      ? aggregateFromCells(
          axes.cells.reduce<IntentCells>((acc, c) => {
            const key = `${c.object}:${c.intent}` as keyof IntentCells;
            acc[key] = (acc[key] ?? 0) + c.count;
            return acc;
          }, {}),
          'product_comments',
          storedIntent?.productPostsAnalyzed ?? 0,
        )
      : null;

  const risk = censusRisk(commentRisks, moderation, commentsAnalyzed);
  const brandSafety = deriveBrandSafety(brandSafetyFlags, commentsAnalyzed, risk);
  const commentRegister = commentRegisterSchema.parse(emptyToNull(payload.commentRegister));
  // Derived, like brand safety and purchase intent above it, and for the
  // sharpest version of the same reason: this headline is a SENTENCE. A stored
  // sentence outlives the numbers it was written from and keeps asserting
  // them, and nothing about reading it reveals that it is stale.
  const climate = audienceClimate(axes, risk, commentRegister);

  return {
    creatorId: payload.creatorId,
    demographics: demographicsSchema.parse(emptyToNull(payload.demographics)),
    topCommentClusters: commentClustersSchema.parse(payload.topCommentClusters),
    commentAxes: axes,
    coverage: commentCoverageSchema.parse(emptyToNull(payload.coverage)),
    sentimentScore: clampOrNull(payload.sentimentScore, 0, 100),
    purchaseIntentRate: derivedIntent
      ? derivedIntent.rate
      : clampOrNull(payload.purchaseIntentRate, 0, 1),
    // DERIVED, not read. The stored column had no producer and its values
    // contradicted the flags rendered beneath them — 94.1 for a medium flag at
    // 22% incidence, 68.0 for a medium flag at 5.06%. Computing it here is what
    // makes the headline figure and the panel under it incapable of
    // disagreeing. See src/lib/report/safety.ts.
    raisedFlags: brandSafety.raised,
    checkedFlags: brandSafety.checked,
    brandSafety,
    engagementRate: clampOrNull(payload.engagementRate, 0, 1),
    adFatigueLevel: fatigue(payload.adFatigueLevel),
    aiSummary: payload.aiSummary ?? '',
    benchmarks: benchmarksSchema.parse(emptyToNull(payload.benchmarks)),
    costEfficiency: costEfficiencySchema.parse(emptyToNull(payload.costEfficiency)),
    sponsoredPerformance: sponsoredPerformanceSchema.parse(
      emptyToNull(payload.sponsoredPerformance),
    ),
    brandSafetyFlags,
    commentRisks,
    moderation,
    commentRegister,
    climate,
    recommendedActions: recommendedActionsSchema.parse(payload.recommendedActions),
    promotions: promotionsSchema.parse(payload.promotions),
    intent: derivedIntent ?? storedIntent,
    // Per-platform intent is withheld once the headline is derived on the
    // product-comment basis, because there are no per-platform cells to derive
    // it from. Leaving the stored figure would put the same label on two
    // different quantities on one page — 0.1% beside 18.1% — which is the
    // defect this whole basis change exists to remove. It returns the moment
    // the classifier emits cells per platform.
    platformBreakdown: platformBreakdownSchema
      .parse(payload.platformBreakdown)
      .map((p) => (derivedIntent ? { ...p, purchaseIntentRate: null } : p)),
    publicOpinion: publicOpinionSchema.parse(emptyToNull(payload.publicOpinion)),
    outputStats: outputStatsSchema.parse(payload.outputStats),
    modelVersion: payload.modelVersion,
    commentsAnalyzed,
    lastAnalyzedAt: payload.lastAnalyzedAt,
  };
}

/** From a direct table read (snake_case), used on the owner and Pro paths. */
export function toAIReportFromRow(row: ReportMetricsRow): AIReport {
  return toAIReport({
    creatorId: row.creator_id,
    demographics: row.demographics,
    topCommentClusters: row.top_comment_clusters,
    commentAxes: row.comment_axes,
    sentimentScore: row.sentiment_score,
    purchaseIntentRate: row.purchase_intent_rate,

    engagementRate: row.engagement_rate,
    adFatigueLevel: row.ad_fatigue_level,
    aiSummary: row.ai_summary,
    coverage: row.comment_coverage,
    benchmarks: row.benchmarks,
    costEfficiency: row.cost_efficiency,
    sponsoredPerformance: row.sponsored_performance,
    brandSafetyFlags: row.brand_safety_flags,
    commentRisks: row.comment_risks,
    moderation: row.moderation,
    commentRegister: row.comment_register,
    recommendedActions: row.recommended_actions,
    promotions: row.promotions,
    dataFetchedAt: row.data_fetched_at,
    dataRefreshDueAt: row.data_refresh_due_at,
    // Rebuilt from its columns on this path. report_to_jsonb nests the same
    // fields on the RPC path, so both feed one schema and one shape.
    intent: {
      rate: row.purchase_intent_rate,
      ciLow: row.purchase_intent_ci_low,
      ciHigh: row.purchase_intent_ci_high,
      basis: row.purchase_intent_basis,
      commercialDensity: row.commercial_density,
      commentsScored: row.intent_comments_scored,
      postsScored: row.intent_posts_scored,
      productPostsAnalyzed: row.product_posts_analyzed,
      dispersion: row.intent_dispersion,
      rubricVersion: row.intent_rubric_version,
    },
    platformBreakdown: row.platform_breakdown,
    publicOpinion: row.public_opinion,
    outputStats: row.output_stats,
    modelVersion: row.model_version,
    commentsAnalyzed: row.comments_analyzed,
    lastAnalyzedAt: row.last_analyzed_at,
  });
}

export function toAccessGrant(grant: {
  requestId: string;
  companyName: string;
  expiresAt: string;
  viewCount: number;
}): AccessGrant {
  return {
    requestId: grant.requestId,
    companyName: grant.companyName,
    expiresAt: grant.expiresAt,
    viewCount: num(grant.viewCount, 1),
  };
}

export function toDirectoryListing(row: DirectoryListingRow): DirectoryListing {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    niche: row.niche,
    isVerified: row.is_verified,
    minimumBudget: row.minimum_budget,
    totalFollowers: num(row.total_followers),
    sentimentScore: clampOrNull(row.sentiment_score, 0, 100),
    purchaseIntentRate: clampOrNull(row.purchase_intent_rate, 0, 1),
    purchaseIntentFloor: clampOrNull(
      row.purchase_intent_ci_low === null ? null : num(row.purchase_intent_ci_low, NaN),
      0,
      1,
    ),
    // The denominator travels with the number. Unrecognised values become null
    // rather than defaulting to a basis, because guessing here would put a
    // wrong denominator label on a real figure — worse than no label.
    intentBasis:
      row.purchase_intent_basis === 'product_comments' ||
      row.purchase_intent_basis === 'all_comments'
        ? row.purchase_intent_basis
        : null,
    // Derived from the same function the report uses, like the flag counts
    // beside it — a stored label would be a sentence's worth of drift.
    climateLabel: audienceClimate(
      commentAxesSchema.parse(emptyToNull(row.comment_axes)),
      censusRisk(
        commentRisksSchema.parse(row.comment_risks),
        moderationSchema.parse(emptyToNull(row.moderation)),
        num(row.comments_analyzed),
      ),
      commentRegisterSchema.parse(emptyToNull(row.comment_register)),
    ).label,
    // Derived here too, from the same flags and the same function the report
    // uses. Reading row.brand_safety_score instead would put two different
    // safety figures for one creator on two pages of the same product.
    // Counts, not a score, and still derived from the same flags by the same
    // function the report uses — reading a stored figure instead would put two
    // different safety readings for one creator on two pages of one product.
    raisedFlags: deriveBrandSafety(
      brandSafetyFlagsSchema.parse(row.brand_safety_flags),
      num(row.comments_analyzed),
    ).raised,
    checkedFlags: brandSafetyFlagsSchema.parse(row.brand_safety_flags).length,
    engagementRate: clampOrNull(row.engagement_rate, 0, 1),
    adFatigueLevel: fatigue(row.ad_fatigue_level),
    demographics: demographicsSchema.parse(emptyToNull(row.demographics)),
    estimatedCpm: row.estimated_cpm === null ? null : num(row.estimated_cpm),
    lastAnalyzedAt: row.last_analyzed_at,
  };
}

export function toAccessRequest(row: AccessRequestRow): AccessRequest {
  return {
    id: row.id,
    creatorId: row.creator_id,
    requesterName: row.requester_name,
    requesterEmail: row.requester_email,
    companyName: row.company_name,
    campaignObjective: row.campaign_objective,
    proposedBudget: row.proposed_budget === null ? null : num(row.proposed_budget),
    budgetCurrency: row.budget_currency,
    pitchNote: row.pitch_note,
    organizationId: row.organization_id,
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
    firstViewedAt: row.first_viewed_at,
    viewCount: row.view_count,
  };
}

export function toOffer(row: OfferRow): Offer {
  return {
    id: row.id,
    creatorId: row.creator_id,
    accessRequestId: row.access_request_id,
    organizationId: row.organization_id,
    companyName: row.company_name,
    senderName: row.sender_name,
    senderEmail: row.sender_email,
    deliverables: row.deliverables,
    amount: num(row.amount),
    currency: row.currency,
    flightStart: row.flight_start,
    flightEnd: row.flight_end,
    exclusivityDays: row.exclusivity_days,
    usageRights: row.usage_rights,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
  };
}

export function toInboundBrief(row: BriefRecipientRow): InboundBrief {
  const brief = row.campaign_briefs;
  return {
    id: row.id,
    briefId: row.brief_id,
    status: row.status,
    sentAt: row.sent_at,
    title: brief?.title ?? 'Campaign brief',
    objective: brief?.objective ?? '',
    briefNote: brief?.brief_note ?? null,
    budgetMin: brief?.budget_min ?? null,
    budgetMax: brief?.budget_max ?? null,
    budgetCurrency: brief?.budget_currency ?? 'USD',
    organizationName: brief?.organizations?.name ?? null,
  };
}

export function toDemographicsGrant(row: DemographicsGrantRow): DemographicsGrant {
  return {
    id: row.id,
    organizationId: row.organization_id,
    // Null renders as "an organisation" rather than blank — a creator deciding
    // who sees their audience data is owed the name when we have it and an
    // honest placeholder when we do not.
    organizationName: row.organizations?.name ?? null,
    status: row.status,
    requestedAt: row.requested_at,
    decidedAt: row.decided_at,
    viewCount: num(row.view_count),
    lastViewedAt: row.last_viewed_at,
  };
}
