/**
 * Row shapes exactly as PostgREST returns them (snake_case, ISO strings, jsonb
 * as `unknown` where the database does not constrain the shape). Kept apart
 * from the domain types in `./index` so a schema change surfaces as a compile
 * error inside a mapper rather than leaking column names into components.
 *
 * Regenerate the authoritative version with:
 *   supabase gen types typescript --local > src/types/database.generated.ts
 */

import type {
  AccessRequestStatus,
  BriefStatus,
  OfferStatus,
  AdFatigueLevel,
  BillingPlan,
  OrgRole,
  SocialPlatform,
} from './index';

/** `public.creator_public_profiles` — the entire anonymous surface. */
export interface CreatorPublicProfileRow {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  niche: string | null;
  bio: string | null;
  is_verified: boolean;
  is_directory_visible: boolean;
  budget_min: number | null;
  budget_max: number | null;
  budget_negotiable: boolean;
  minimum_budget: number | null;
  created_at: string;
  total_followers: number | string;
  platforms: unknown;
  teaser_highlights: unknown;
  last_analyzed_at: string | null;
  has_report: boolean;
}

/** `public.report_metrics` — only ever selected by owner or pro-agency RLS. */
export interface ReportMetricsRow {
  creator_id: string;
  demographics: unknown;
  top_comment_clusters: unknown;
  comment_axes: unknown;
  sentiment_score: number | null;
  purchase_intent_rate: number | null;
  brand_safety_score: number | null;
  engagement_rate: number | null;
  ad_fatigue_level: AdFatigueLevel | null;
  ai_summary: string | null;
  benchmarks: unknown;
  cost_efficiency: unknown;
  sponsored_performance: unknown;
  brand_safety_flags: unknown;
  comment_risks: unknown;
  moderation: unknown;
  /** Migration 0023. How the section is written — see CommentRegister. */
  comment_register: unknown;
  recommended_actions: unknown;
  promotions: unknown;
  /** Retention bookkeeping — see migration 0016 and lib/report/policy.ts. */
  data_fetched_at: string | null;
  data_refresh_due_at: string | null;
  purchase_intent_ci_low: number | string | null;
  purchase_intent_ci_high: number | string | null;
  purchase_intent_basis: string | null;
  commercial_density: number | string | null;
  intent_comments_scored: number | null;
  intent_posts_scored: number | null;
  product_posts_analyzed: number | null;
  intent_dispersion: number | string | null;
  intent_rubric_version: string | null;
  platform_breakdown: unknown;
  public_opinion: unknown;
  output_stats: unknown;
  comment_coverage: unknown;
  model_version: string | null;
  comments_analyzed: number;
  last_analyzed_at: string | null;
}

/** `public.directory_listings` — empty for anyone without a Pro plan. */
export interface DirectoryListingRow {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  niche: string | null;
  is_verified: boolean;
  minimum_budget: number | null;
  total_followers: number | string;
  sentiment_score: number | null;
  purchase_intent_rate: number | null;
  /** Wilson lower bound. What a `minPurchaseIntent` floor is asked of. */
  purchase_intent_ci_low: number | string | null;
  purchase_intent_basis: string | null;
  /** The evidence the safety score is derived from — see 0015. */
  brand_safety_flags: unknown;
  comments_analyzed: number;
  /**
   * Migration 0023. The directory needs these because the climate label is
   * DERIVED at read time, exactly like the flag counts beside it — so the view
   * has to expose the evidence, never the conclusion.
   */
  comment_axes: unknown;
  comment_risks: unknown;
  moderation: unknown;
  comment_register: unknown;
  /** Historical. Carried for the record; the rendered score is derived. */
  brand_safety_score: number | null;
  engagement_rate: number | null;
  ad_fatigue_level: AdFatigueLevel | null;
  demographics: unknown;
  estimated_cpm: number | string | null;
  last_analyzed_at: string | null;
}

export interface AccessRequestRow {
  id: string;
  creator_id: string;
  requester_name: string;
  requester_email: string;
  company_name: string;
  campaign_objective: string;
  proposed_budget: string | number | null;
  budget_currency: string;
  pitch_note: string | null;
  organization_id: string | null;
  status: AccessRequestStatus;
  expires_at: string | null;
  created_at: string;
  responded_at: string | null;
  first_viewed_at: string | null;
  view_count: number;
}

export interface OrganizationRow {
  industry: string | null;
  sells: string | null;
  audience: string | null;
  categories: string[] | null;
  objectives: string[] | null;
  id: string;
  name: string;
  billing_plan: BillingPlan;
  created_at: string;
}

export interface OrganizationMemberRow {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrgRole;
  created_at: string;
  organizations: OrganizationRow | null;
}

export interface SocialAccountRow {
  id: string;
  creator_id: string;
  platform: SocialPlatform;
  channel_handle: string | null;
  follower_count: number | string;
  stats_summary: unknown;
  last_synced_at: string | null;
}

/** Payload of `public.get_report_by_token(handle, token)`. */
export type ReportByTokenResult =
  | { status: 'invalid' }
  | { status: 'expired' }
  | { status: 'report_pending' }
  | {
      status: 'ok';
      grant: {
        requestId: string;
        companyName: string;
        expiresAt: string;
        viewCount: number;
      };
      report: ReportPayload;
    };

/** Wire shape emitted by `public.report_to_jsonb`. */
export interface ReportPayload {
  creatorId: string;
  demographics: unknown;
  topCommentClusters: unknown;
  commentAxes: unknown;
  sentimentScore: number | null;
  purchaseIntentRate: number | null;
  engagementRate: number | null;
  adFatigueLevel: AdFatigueLevel | null;
  aiSummary: string | null;
  benchmarks: unknown;
  costEfficiency: unknown;
  sponsoredPerformance: unknown;
  brandSafetyFlags: unknown;
  commentRisks: unknown;
  moderation: unknown;
  commentRegister: unknown;
  recommendedActions: unknown;
  promotions: unknown;
  intent: unknown;
  dataFetchedAt: string | null;
  dataRefreshDueAt: string | null;
  platformBreakdown: unknown;
  publicOpinion: unknown;
  outputStats: unknown;
  coverage: unknown;
  modelVersion: string | null;
  commentsAnalyzed: number;
  lastAnalyzedAt: string | null;
}

export interface OfferRow {
  id: string;
  creator_id: string;
  access_request_id: string | null;
  organization_id: string | null;
  company_name: string;
  sender_name: string;
  sender_email: string;
  deliverables: string;
  amount: string | number;
  currency: string;
  flight_start: string | null;
  flight_end: string | null;
  exclusivity_days: number | null;
  usage_rights: string | null;
  notes: string | null;
  status: OfferStatus;
  created_at: string;
  responded_at: string | null;
}

/** Recipient row joined to its brief, as the creator's dashboard reads it. */
export interface BriefRecipientRow {
  id: string;
  brief_id: string;
  status: BriefStatus;
  sent_at: string;
  campaign_briefs: {
    title: string;
    objective: string;
    brief_note: string | null;
    budget_min: number | null;
    budget_max: number | null;
    budget_currency: string;
    organizations: { name: string } | null;
  } | null;
}

/** `public.demographics_grants` joined to the requesting organisation. */
export interface DemographicsGrantRow {
  id: string;
  creator_id: string;
  organization_id: string;
  status: 'pending' | 'approved' | 'revoked';
  requested_at: string;
  decided_at: string | null;
  view_count: number;
  last_viewed_at: string | null;
  organizations?: { name: string } | null;
}
