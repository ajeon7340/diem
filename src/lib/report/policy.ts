/**
 * What the YouTube API Services Developer Policies let this report do.
 *
 * Every constant here is a compliance decision, not a preference, and each one
 * names the clause it answers to. They live in one file because the
 * alternative — a null here, a conditional there — is how a product ends up
 * unable to say what it is and is not allowed to show.
 *
 * THE ONE THING THIS FILE CANNOT DO.
 *
 * III.E.4.h(ii): "Your API Clients must not ... access or use API Data to
 * create new or derived data or metrics." Purchase intent, sentiment, brand
 * safety, the comment clusters and the estimated CPM are all derived from API
 * Data, which is to say: the entire headline of this report is covered by that
 * sentence. No switch here changes that. The permission is an account action —
 * accept the amendment at
 * developers.google.com/youtube/terms/derived-metrics-policy (Section 5 → Use
 * Cases → "Analytics & Reporting"). It is free and self-serve. Until it is
 * accepted the product is out of policy no matter what this module returns.
 *
 * A NOTE ON CONSENT, because it is the intuition everyone has first.
 *
 * A creator's OAuth consent does not exempt any of this. The Developer
 * Policies are an agreement between this application and YouTube; the creator
 * is not a party to it and cannot waive its terms. Their consent grants
 * ACCESS — we may fetch. The policies govern USE — what may be built from what
 * was fetched, how long it may be kept, and who may be shown it. Both
 * "Authorized Data" and "Non-Authorized Data" are defined as subsets of API
 * Data, so consent moves data between those two buckets and never out of the
 * policy's reach.
 */

/**
 * Whether a cohort ranking may be served.
 *
 * III.E.2: "Do not aggregate API Data except ... channels that are under the
 * same content owner ... The API Client must not combine API Data from the
 * different content owners." A category cohort of 200 creators is 200 content
 * owners, so while the cohort is assembled from API Data the answer is no, and
 * the derived-metrics amendment does not cover it — that amendment permits
 * calculation and extended storage, not cross-owner aggregation.
 *
 * FLIP THIS TO TRUE ONLY when the cohort is built from figures creators supply
 * directly. Data a creator exports from YouTube Studio and hands over is not
 * API Data, and nothing in section III reaches it.
 *
 * The UI already renders a withheld percentile as "No cohort ranking yet", so
 * switching this off degrades into an honest empty state rather than a hole.
 */
export const BENCHMARKS_FROM_API_DATA = false;

/**
 * Whether the off-platform discussion panel is served at all.
 *
 * Switched off rather than deleted. Nothing about it is broken — the press
 * worker, the coverage states, the theme counts and the corpus notes all work,
 * and the licensing research behind them was expensive. What changed is that
 * it no longer has a job: risk moved to the comment census, which has a real
 * denominator and no selection rule to audit, and what this panel could still
 * honestly say ("here is what one search surfaced") was not worth the space it
 * took to keep a reader from misreading it.
 *
 * Everything stays wired. Flip this back and the panel returns as it was.
 */
export const OFF_PLATFORM_PANEL = false;

/**
 * How long stored API Data stays inside policy, in days.
 *
 * III.E.4.d caps Non-Authorized Data — which is what the comment corpus is,
 * since commentThreads.list returns it against an API key with no User
 * Credentials — at 30 days, after which the client "must either delete or
 * refresh the stored data". The derived-metrics amendment raises statistical
 * and derived data to 36 calendar months.
 *
 * Both are recorded so the deadline does not quietly depend on which paperwork
 * is in force. Accepted 2026-09-14; the horizon moved with the flag.
 *
 * Two obligations came with it and are not optional:
 *   - derived metrics must be distinguished from API Data wherever they sit
 *     beside it — DERIVED_DISCLOSURE, rendered under the ad-fit tiles;
 *   - financial projections must state they are not approved by Google —
 *     FINANCIAL_DISCLOSURE, rendered under the CPM.
 * Removing either re-breaks the permission this flag depends on.
 */
export const AMENDMENT_ACCEPTED = true;

export const RETENTION_DAYS = {
  /** III.E.4.d — the base policy. */
  base: 30,
  /** Derived-metrics amendment — 36 calendar months. */
  amended: 36 * 30,
} as const;

/**
 * TWO CLOCKS, NOT ONE.
 *
 * The amendment raises *statistical and derived* data to 36 months. It does not
 * reclassify verbatim API Data as derived, and a comment somebody wrote under a
 * video does not become our statistic because we counted it. So:
 *
 *   - a cluster's share, count, label, object and intent are derived  → 36mo
 *   - the comment text inside that cluster is API Data                → 30d
 *
 * Collapsing these into one horizon was the defect. `retentionDays()` returned
 * the amended figure for everything, which meant verbatim third-party writing
 * fetched on 2026-09-12 would have been held until 2029 — under a script whose
 * own opening paragraph quotes the 30-day cap and calls the corpus
 * Non-Authorized Data.
 *
 * Splitting them costs nothing a reader values: the quote disappears at 30
 * days, the finding it supported does not, and the permalink still resolves
 * because a comment ID is not API Data we have to forget.
 */
export function retentionDays(): number {
  return AMENDMENT_ACCEPTED ? RETENTION_DAYS.amended : RETENTION_DAYS.base;
}

/**
 * The horizon for verbatim text, which no amendment extends.
 *
 * Deliberately not a function of `AMENDMENT_ACCEPTED`: there is no paperwork
 * that makes this number larger, so making it look configurable would invite
 * someone to configure it.
 */
export const VERBATIM_RETENTION_DAYS = RETENTION_DAYS.base;

export function verbatimDueAt(fetchedAt: string | null): string | null {
  if (!fetchedAt) return null;
  const at = new Date(fetchedAt).getTime();
  if (!Number.isFinite(at)) return null;
  return new Date(at + VERBATIM_RETENTION_DAYS * 86_400_000).toISOString();
}

/**
 * When data fetched at `fetchedAt` falls out of policy.
 *
 * Null in, null out: a row that never recorded a fetch date has no deadline we
 * can compute, and inventing one would be worse than admitting we cannot say.
 */
export function refreshDueAt(fetchedAt: string | null): string | null {
  if (!fetchedAt) return null;
  const at = new Date(fetchedAt).getTime();
  if (!Number.isFinite(at)) return null;
  return new Date(at + retentionDays() * 86_400_000).toISOString();
}

/**
 * Is this row past its retention horizon?
 *
 * A row with no fetch date reads as NOT expired rather than expired. The
 * alternative blanks every report written before this migration on the
 * strength of a date nobody recorded — treating missing bookkeeping as a
 * policy breach. The refresh job's job is to stamp them; this function's job
 * is not to guess.
 */
export function isPastRetention(refreshDue: string | null, now = Date.now()): boolean {
  if (!refreshDue) return false;
  const due = new Date(refreshDue).getTime();
  return Number.isFinite(due) && due < now;
}

/**
 * The disclosure the amendment requires wherever our own figures sit beside
 * YouTube's.
 *
 * III.E.4.h: metrics that are not API Data must carry "a clear and prominent
 * disclosure there that such information, data and metrics are not from
 * YouTube and are part of your own product". The amendment adds that financial
 * projections must state they are not approved by Google.
 *
 * The report already says its CPM is an estimate rather than a rate card. This
 * is the same obligation, stated once so every surface uses one wording.
 */
export const DERIVED_DISCLOSURE =
  'Purchase intent, sentiment and brand safety are adfit’s own measurements, computed from public comments. They are not YouTube figures.';

export const FINANCIAL_DISCLOSURE =
  'Estimated from the creator’s published minimum against their median views — not a rate card, and not approved by Google or YouTube.';


/**
 * Strip every figure that compares this creator against others.
 *
 * `benchmarks` is the obvious one. `costEfficiency.cohortMedianCpm` and
 * `cohortMedianRetention` are the same thing wearing different names — a
 * median taken across a category is an aggregate over many content owners, and
 * III.E.2 does not care which field it lands in. They were missed on the first
 * pass precisely because they do not have "benchmark" in the name, which is
 * the argument for doing this in one function instead of at each call site.
 *
 * The creator's own figures are untouched: an estimated CPM derived from their
 * own median views is not an aggregation across owners.
 *
 * Applied on every path that produces a report — the mapper for live rows and
 * the fixture reader for the demo — because a gate that only covers one of
 * them leaves the other rendering exactly what the policy forbids.
 */
export function stripCrossOwnerAggregates<
  T extends {
    benchmarks: unknown;
    costEfficiency: { cohortMedianCpm: number | null; cohortMedianRetention: number | null } | null;
  },
>(report: T): T {
  if (BENCHMARKS_FROM_API_DATA) return report;
  return {
    ...report,
    benchmarks: null,
    costEfficiency: report.costEfficiency
      ? { ...report.costEfficiency, cohortMedianCpm: null, cohortMedianRetention: null }
      : null,
  };
}


/**
 * Everything on a report that is API Data, or built from it.
 *
 * The list exists because "delete or refresh the stored data" needs an
 * inventory, and an inventory kept in someone's head is one that goes stale
 * the next time a column is added. Both the retention job and the read-path
 * defence work from this one array.
 *
 * `demographics` is deliberately ABSENT. III.E.4.b lets YouTube Analytics and
 * Reporting data be stored past 30 days provided authorisation is re-verified
 * every 30 days — so demographics outlive the corpus, and purging them here
 * would destroy the one block a creator has to reconnect OAuth to restore.
 */
export const API_DERIVED_COLUMNS = [
  'top_comment_clusters',
  'comment_axes',
  'comment_coverage',
  'public_opinion',
  'promotions',
  'intent_samples',
  'platform_breakdown',
  'output_stats',
  'brand_safety_flags',
  'sentiment_score',
  'purchase_intent_rate',
  'brand_safety_score',
  'engagement_rate',
  'purchase_intent_ci_low',
  'purchase_intent_ci_high',
  'commercial_density',
  'intent_dispersion',
] as const;

/**
 * Blank a report that has outlived its retention horizon.
 *
 * The job below is what actually deletes; this is the defence for the window
 * where the job has not run yet, or failed, or nobody scheduled it. Serving a
 * row past its horizon is the breach — the row merely existing is not — so the
 * read path must be able to refuse on its own rather than trusting a cron.
 *
 * Everything blanks to the same nulls and empty arrays the report already
 * renders honestly: an expired row reads as "not measured", which is exactly
 * what it is once we are no longer allowed to hold the measurement.
 */
export function withinRetention<
  T extends {
    topCommentClusters: unknown[];
    commentAxes: unknown;
    coverage: unknown;
    publicOpinion: unknown;
    promotions: unknown[];
    platformBreakdown: unknown[];
    outputStats: unknown[];
    brandSafetyFlags: unknown[];
    sentimentScore: number | null;
    purchaseIntentRate: number | null;
    raisedFlags: number | null;
    checkedFlags: number | null;
    engagementRate: number | null;
    intent: unknown;
    commentsAnalyzed: number;
  },
>(report: T, refreshDue: string | null, now = Date.now()): T {
  if (!isPastRetention(refreshDue, now)) return report;
  return {
    ...report,
    topCommentClusters: [],
    commentAxes: null,
    coverage: null,
    publicOpinion: null,
    promotions: [],
    platformBreakdown: [],
    outputStats: [],
    brandSafetyFlags: [],
    sentimentScore: null,
    purchaseIntentRate: null,
    raisedFlags: null,
    checkedFlags: null,
    engagementRate: null,
    intent: null,
    commentsAnalyzed: 0,
  };
}


/**
 * Is this off-platform source YouTube API Data, or web content?
 *
 * The distinction decides retention. YouTube commentary in `publicOpinion` is
 * fetched with commentThreads.list against other people's videos — API Data,
 * capped at 30 days by III.E.4.d. Press articles and forum threads are found by
 * searching the open web: they are not API Data, no YouTube policy reaches
 * them, and purging them on YouTube's clock would be destroying records we are
 * entitled to keep.
 *
 * Reddit, X, Instagram and TikTok are on the API side of this line too, but
 * they are never covered at all (see UNLICENSED_OPINION_PLATFORMS), so the
 * question does not arise in practice. They are listed for the day someone
 * licenses one.
 */
export function isApiSourcedOpinion(platform: string): boolean {
  const p = platform.toLowerCase();
  return (
    p.includes('youtube') ||
    p.includes('reddit') ||
    p === 'x' ||
    p.includes('twitter') ||
    p.includes('instagram') ||
    p.includes('tiktok')
  );
}

/**
 * Strip only the API-sourced half of an off-platform corpus.
 *
 * The retention job used to null `public_opinion` outright, which over-purged:
 * a press archive built by web search has no YouTube deadline, and deleting it
 * on one would be treating a policy about YouTube's data as a policy about
 * everything. Counts are recomputed from what survives so `mentionsAnalyzed`
 * never describes a set larger than the one still stored.
 *
 * `coveredPlatforms` keeps its web entries and loses its API ones — "we read
 * Press and found this" stays true; "we read YouTube" stops being something we
 * can still evidence.
 */
export function purgeApiSourcedOpinion<
  T extends {
    corpusNote: string | null;
    coveredPlatforms: string[];
    itemsAnalyzed: number;
    reactionsAnalyzed: number | null;
    sources: { source: string; items: number; reactions: number | null }[];
    themes: { reactionCount: number; itemCount: number | null; mentions: { source: string }[] }[];
  },
>(opinion: T | null): T | null {
  if (!opinion) return null;

  const sources = opinion.sources.filter((s) => !isApiSourcedOpinion(s.source));
  const coveredPlatforms = opinion.coveredPlatforms.filter((p) => !isApiSourcedOpinion(p));

  // Nothing web-sourced survives, so there is no corpus left to describe.
  if (sources.length === 0 && coveredPlatforms.length === 0) return null;

  const themes = opinion.themes
    .map((theme) => {
      const kept = theme.mentions.filter((m) => !isApiSourcedOpinion(m.source));
      return {
        ...theme,
        mentions: kept,
        // Counts drawn partly from purged evidence can no longer be shown, so
        // they drop to "not recorded" rather than overstating what is left.
        reactionCount: kept.length > 0 ? kept.length : -1,
        itemCount: null,
      };
    })
    .filter((theme) => theme.mentions.length > 0);

  return {
    ...opinion,
    coveredPlatforms,
    sources,
    themes,
    itemsAnalyzed: sources.reduce((sum, s) => sum + s.items, 0),
    reactionsAnalyzed: sources.some((s) => s.reactions !== null)
      ? sources.reduce((sum, s) => sum + (s.reactions ?? 0), 0)
      : null,
  };
}

interface ClusterBearing {
  exampleComment: string;
  comments: Array<{
    text: string | null;
    postTitle: string | null;
    likes: number | null;
    publishedAt: string | null;
  }>;
}

interface MentionBearing {
  example: string;
  mentions: Array<{
    excerpt: string | null;
    publishedAt: string | null;
    engagement: number | null;
  }>;
}

/**
 * Drop stored verbatim text that has passed the 30-day cap, keeping everything
 * derived from it.
 *
 * This is the read-path half of the split horizon — the same relationship
 * `withinRetention` has to the purge job. The job is what actually deletes;
 * this makes a row unservable the moment it expires, so a cron that did not
 * run is a bookkeeping failure rather than a policy breach.
 *
 * WHAT SURVIVES, and why it is not a loophole:
 *
 *   - counts, shares, labels, object/intent — derived, 36 months
 *   - comment and video IDs, and the permalinks built from them — an ID is the
 *     pointer, not the content. III.E.4.d's concern is stored API Data; a URL
 *     that resolves against YouTube is the opposite of a private copy, because
 *     it shows the reader whatever YouTube shows today, including nothing if
 *     the comment was deleted.
 *   - `likes` and `publishedAt` are dropped with the text. They are API Data
 *     about a specific comment and nothing derived depends on them.
 *
 * A null `text` IS the expiry signal — there is no separate flag, because two
 * sources of truth for one fact is how they drift. Text was non-nullable until
 * this landed, so null can only mean expired.
 *
 * The panel renders an expired quote as an explicit expiry notice with the link
 * intact, never as an empty blockquote — an evidence box that has silently lost
 * its evidence is worse than one that says it did.
 */
export function expireVerbatim<
  T extends {
    topCommentClusters: ClusterBearing[];
    publicOpinion: { themes: MentionBearing[] } | null;
  },
>(report: T, fetchedAt: string | null, now = Date.now()): T {
  const due = verbatimDueAt(fetchedAt);
  if (!isPastRetention(due, now)) return report;

  return {
    ...report,
    topCommentClusters: report.topCommentClusters.map((cluster) => ({
      ...cluster,
      // The legacy single quote is comment text under another name.
      exampleComment: '',
      comments: cluster.comments.map((comment) => ({
        ...comment,
        text: null,
        postTitle: null,
        likes: null,
        publishedAt: null,
      })),
    })),
    publicOpinion: report.publicOpinion
      ? {
          ...report.publicOpinion,
          themes: report.publicOpinion.themes.map((theme) => ({
            ...theme,
            example: '',
            mentions: theme.mentions.map((mention) => ({
              ...mention,
              excerpt: null,
              publishedAt: null,
              engagement: null,
            })),
          })),
        }
      : report.publicOpinion,
  };
}
