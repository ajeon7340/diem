import type {
  AIReport,
  CampaignCategory,
  Creator,
  InboundBrief,
  Organization,
} from '@/types';
import { CATEGORY_CAUTION, CATEGORY_LABEL, OBJECTIVE_LABEL } from '@/types';
import { assessReport, type ReportSufficiency } from './sufficiency';

/**
 * Why this creator, for this buyer.
 *
 * The report states figures and lets a buyer draw their own conclusion, and
 * that rule was earned — a written verdict, per-platform prose reads and a
 * do/avoid brief were all deleted for restating the tiles in a more confident
 * voice than the tiles deserved.
 *
 * One property keeps this from being that feature again: it is generated
 * against the READING ORGANISATION and, where there is one, their brief. Half
 * the input is not in the report, so it can say something no tile can. The
 * test when editing any of this: if the paragraph would read identically to
 * every viewer, it has decayed back into the thing that was removed.
 *
 * Three constraints hold it there, and all three live in this file rather than
 * in a prompt, because a prompt is a request and these are rules:
 *
 *   1. IT REFUSES RATHER THAN HEDGES. A fluent paragraph about a creator with
 *      41 comments is precisely the authoritative-looking noise sufficiency.ts
 *      exists to stop. Below the bar there is no summary, not a cautious one.
 *   2. EVERY CLAIM CITES A FIGURE, and the figure is checked against the live
 *      report before render. A generated sentence is the one piece of evidence
 *      here that a reader cannot verify by following a link.
 *   3. IT DESCRIBES ONLY WHAT ITS READER MAY SEE. The input is built from the
 *      gatekeeper's already-resolved report, never a raw row — see 0014 on why
 *      prose over locked metrics is a side channel around the column grants.
 */

export type FitRefusalReason =
  /** Nothing to summarise: the pipeline has not produced a report. */
  | 'no_report'
  /** There is no comment corpus at all. Distinct from a thin one, deliberately. */
  | 'no_comments'
  /** A corpus too small to support a confident read. Not a hedge — no summary. */
  | 'insufficient'
  /** No organisation in the viewer, so there is no second input and no fit. */
  | 'no_audience';

export interface FitRefusal {
  ok: false;
  reason: FitRefusalReason;
  /** Said plainly, in the words the UI shows. */
  message: string;
}

/**
 * Why the comment corpus is empty, in the words the refusal uses.
 *
 * Mirrors NO_COMMENT_REASON in sufficiency.ts, because "comments are turned
 * off" and "the sample is too thin" are different facts about a creator and
 * collapsing them is the same failure as rendering an unmeasured score as
 * zero: a limit of our measurement stated as a limit of the creator.
 */
const NO_COMMENT_REFUSAL = {
  disabled:
    'This creator has comments turned off, so there is no audience signal to read your brief against. Everything the report can still measure — reach, output, cost, off-platform discussion — is above.',
  none_yet:
    'No comments on any analysed post yet, so there is nothing to read your brief against.',
  restricted:
    'Comments could not be read for this account, so there is no audience signal to read your brief against.',
} as const;

const REFUSAL: Record<FitRefusalReason, string> = {
  no_report:
    'No analysis yet for this creator, so there is nothing to read against your brief.',
  no_comments: NO_COMMENT_REFUSAL.none_yet,
  insufficient:
    'The sample behind this report is too thin to support a fit read. The figures are shown with their gaps; a written summary over them would sound more certain than they are.',
  no_audience:
    'A fit read is written against a specific buyer. Sign in with your organisation to generate one.',
};

/**
 * The figures a claim is allowed to cite.
 *
 * A closed set on purpose. An open one would let the model cite a metric that
 * does not exist, which cannot be checked and therefore cannot be dropped —
 * and an unverifiable citation is worse than no citation, because it looks
 * like rigour.
 */
export type FitMetric =
  | 'purchaseIntentRate'
  | 'purchaseIntentFloor'
  | 'commercialDensity'
  | 'sentimentScore'
  | 'raisedFlags'
  | 'engagementRate'
  | 'estimatedCpm'
  | 'sponsoredRetention'
  | 'commentsAnalyzed'
  | 'productPostsAnalyzed';

export interface FitClaim {
  text: string;
  metric: FitMetric;
  /** The value the model was given. Re-checked against the report at render. */
  value: number;
}

export interface FitSummary {
  summary: string;
  claims: FitClaim[];
  confidence: 'sufficient' | 'limited';
  modelVersion: string;
  rubricVersion: string | null;
  reportAnalyzedAt: string | null;
}

/** Reads the one figure a claim cites. Null means "not measured on this report". */
export function resolveMetric(report: AIReport, metric: FitMetric): number | null {
  switch (metric) {
    case 'purchaseIntentRate':
      return report.purchaseIntentRate;
    case 'purchaseIntentFloor':
      return report.intent?.ciLow ?? null;
    case 'commercialDensity':
      return report.intent?.commercialDensity ?? null;
    case 'sentimentScore':
      return report.sentimentScore;
    case 'raisedFlags':
      return report.raisedFlags;
    case 'engagementRate':
      return report.engagementRate;
    case 'estimatedCpm':
      return report.costEfficiency?.estimatedCpm ?? null;
    case 'sponsoredRetention':
      return report.sponsoredPerformance?.viewRetention ?? null;
    case 'commentsAnalyzed':
      return report.commentsAnalyzed;
    case 'productPostsAnalyzed':
      return report.intent?.productPostsAnalyzed ?? null;
  }
}

/**
 * Rounding slack, not measurement slack.
 *
 * A claim citing 0.281 against a stored 0.28104 is the same claim. A claim
 * citing 0.31 is not, and gets dropped however plausible the sentence reads.
 */
const CLAIM_TOLERANCE = 0.005;

function matches(cited: number, actual: number): boolean {
  const scale = Math.max(1, Math.abs(actual));
  return Math.abs(cited - actual) <= CLAIM_TOLERANCE * scale;
}

/**
 * Keep only the claims the report still supports.
 *
 * Runs at render, not just at generation — the report can be re-analysed under
 * a summary, and a sentence that was true in October must not still be
 * asserting October's number in December. A claim whose metric has since
 * become null is dropped too: "not measured any more" cannot support a
 * sentence that was written when it was.
 */
export function verifyClaims(claims: FitClaim[], report: AIReport): FitClaim[] {
  return claims.filter((claim) => {
    const actual = resolveMetric(report, claim.metric);
    return actual !== null && matches(claim.value, actual);
  });
}

/**
 * Has the report moved under the summary?
 *
 * Prose carries no visible date. A reader has no way to tell that the figures
 * beneath a paragraph were replaced, so the UI has to tell them.
 */
export function isStale(summary: Pick<FitSummary, 'reportAnalyzedAt'>, report: AIReport): boolean {
  if (!summary.reportAnalyzedAt || !report.lastAnalyzedAt) return false;
  return new Date(summary.reportAnalyzedAt).getTime() < new Date(report.lastAnalyzedAt).getTime();
}

export interface FitEligibility {
  ok: true;
  /** 'limited' still generates, but the prompt is told to say what is missing. */
  confidence: 'sufficient' | 'limited';
  sufficiency: ReportSufficiency;
}

/**
 * May a summary be written at all?
 *
 * The comment corpus is the gate. Every claim worth making about commercial
 * fit rests on it, so a report whose comments are absent or too thin gets no
 * paragraph — the panel shows the figures and their gaps instead, which is the
 * honest surface. A 'limited' report still earns one, because "promising but
 * unproven, here is what is missing" is a real and useful read; it is the
 * confident-sounding sentence over nothing that is not.
 */
export function assessFitEligibility(
  report: AIReport | null,
  hasOrganization: boolean,
): FitEligibility | FitRefusal {
  if (!hasOrganization) {
    return { ok: false, reason: 'no_audience', message: REFUSAL.no_audience };
  }
  if (!report) {
    return { ok: false, reason: 'no_report', message: REFUSAL.no_report };
  }

  const sufficiency = assessReport(report);

  // No corpus at all is a different fact from a thin one, and the creator is
  // owed the difference: "comments are off" is a choice they made, while "too
  // thin" reads as a verdict on their audience.
  if (sufficiency.noComments) {
    const why = report.coverage?.reason;
    return {
      ok: false,
      reason: 'no_comments',
      message: why ? NO_COMMENT_REFUSAL[why] : REFUSAL.no_comments,
    };
  }

  if (sufficiency.comments === 'insufficient') {
    return { ok: false, reason: 'insufficient', message: REFUSAL.insufficient };
  }

  return {
    ok: true,
    confidence: sufficiency.comments === 'sufficient' ? 'sufficient' : 'limited',
    sufficiency,
  };
}

/**
 * What the model is shown.
 *
 * Built from the resolved report the viewer already holds, so it cannot
 * describe a figure its reader was not entitled to. Nulls are passed through
 * as nulls rather than dropped: a model that cannot see a field will infer one,
 * and an explicit null is the instruction not to.
 */
export function buildFitInput(input: {
  creator: Creator;
  report: AIReport;
  organizationName: string;
  /** The buyer's own profile — what they sell and who to. May be empty. */
  profile: Pick<
    Organization,
    'industry' | 'sells' | 'audience' | 'categories' | 'objectives' | 'climatePreference'
  > | null;
  brief: InboundBrief | null;
  /** What the campaign is FOR. Pairs with the creator's own niche. */
  category: CampaignCategory | null;
  eligibility: FitEligibility;
}) {
  const { creator, report, organizationName, profile, brief, category, eligibility } = input;

  return {
    buyer: {
      organization: organizationName,
      // Everything we know about who is reading. Nulls stay nulls: the prompt
      // is told to say the profile is thin rather than to imagine a campaign.
      industry: profile?.industry ?? null,
      sells: profile?.sells ?? null,
      audience: profile?.audience ?? null,
      buysIn: (profile?.categories ?? []).map((c) => CATEGORY_LABEL[c]),
      objectives: (profile?.objectives ?? []).map((o) => OBJECTIVE_LABEL[o]),
      // Not a FitMetric: `climate.label` in context below is a string enum,
      // not a number, so it sits outside the numeric citation mechanism —
      // same bucket as brandSafetyFlags and promotions, given as supporting
      // fact rather than a cited figure.
      climatePreference: profile?.climatePreference ?? null,
      category: category
        ? {
            key: category,
            label: CATEGORY_LABEL[category],
            // Passed to the model rather than appended afterwards, so the
            // caution shapes the paragraph instead of trailing it as boilerplate
            // the reader learns to skip.
            caution: CATEGORY_CAUTION[category] ?? null,
          }
        : null,
      brief: brief
        ? {
            title: brief.title,
            objective: brief.objective,
            note: brief.briefNote,
            budgetMin: brief.budgetMin,
            budgetMax: brief.budgetMax,
            currency: brief.budgetCurrency,
          }
        : null,
    },
    creator: {
      handle: creator.handle,
      displayName: creator.displayName,
      niche: creator.niche,
      followers: creator.totalFollowers,
      minimumBudget: creator.minimumBudget,
      isVerified: creator.isVerified,
    },
    figures: {
      purchaseIntentRate: report.purchaseIntentRate,
      purchaseIntentFloor: report.intent?.ciLow ?? null,
      purchaseIntentBasis: report.intent?.basis ?? null,
      commercialDensity: report.intent?.commercialDensity ?? null,
      productPostsAnalyzed: report.intent?.productPostsAnalyzed ?? null,
      sentimentScore: report.sentimentScore,
      raisedFlags: report.raisedFlags,
      checkedFlags: report.checkedFlags,
      engagementRate: report.engagementRate,
      estimatedCpm: report.costEfficiency?.estimatedCpm ?? null,
      sponsoredRetention: report.sponsoredPerformance?.viewRetention ?? null,
      commentsAnalyzed: report.commentsAnalyzed,
    },
    context: {
      demographics: report.demographics,
      benchmarks: report.benchmarks,
      brandSafetyFlags: report.brandSafetyFlags,
      // What they have sold and to whom — the single most relevant block when
      // the question is whether a given advertiser belongs here.
      promotions: report.promotions,
      platformBreakdown: report.platformBreakdown,
      // The MEASURED read, beside the buyer's STATED preference above. Passed
      // through as-is — `null` when too little was read to say — so a model
      // told "warm matters to me" against a null climate argues from the
      // figures it does have rather than inventing a temperature nobody
      // measured.
      climate: report.climate,
      // Named gaps, so the model argues from the report's own limits rather
      // than inventing confidence the sufficiency notice contradicts.
      gaps: eligibility.sufficiency.gaps,
      confidence: eligibility.confidence,
    },
  };
}

export type FitInput = ReturnType<typeof buildFitInput>;


/**
 * The shape the fit panel renders.
 *
 * Lives here rather than beside the action because a `'use server'` module may
 * only export async functions — React validates that at runtime, and an
 * exported object throws `A "use server" file can only export async functions,
 * found object` when the module is evaluated. A type is erased and survives;
 * INITIAL_FIT_STATE is a real value and does not.
 */
export interface FitSummaryState {
  status: 'idle' | 'success' | 'refused' | 'error';
  summary?: string;
  claims?: FitClaim[];
  /** Claims the model made that the report did not support. Surfaced, not hidden. */
  droppedClaims?: number;
  /**
   * Which produced this. 'local' is the offline stand-in — creator-generic,
   * never stored, and labelled as such in the panel. The distinction has to
   * reach the UI: unlabelled, a stand-in IS the generic verdict this report
   * deleted, just with a newer name.
   */
  source?: 'model' | 'local';
  message?: string;
}

export const INITIAL_FIT_STATE: FitSummaryState = { status: 'idle' };
