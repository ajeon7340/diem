import type { Candidate, Campaign } from '@/lib/data/campaigns';
import type { PlatformOutput } from '@/types';

/**
 * One row of the comparison table: every candidate on one campaign's standard.
 *
 * EVERY FIELD IS NULLABLE AND NULL MEANS NOT MEASURED. The table's whole job is
 * to be read across — a blank rendered as 0, or a missing sentiment rendered as
 * neutral, becomes a ranking, and a ranking becomes a decision. So the type
 * cannot express "absent" as a number, and the renderer prints a dash with a
 * reason rather than a figure.
 */
export interface CandidateRow {
  id: string;
  channelId: string;
  title: string;
  handle: string | null;
  status: Candidate['status'];

  subscribers: number | null;
  medianViews: number | null;
  engagementRate: number | null;

  /** How many comments the clustering pass read. The denominator, always shown. */
  commentsAnalysed: number;
  /** How many the safety pass read. A DIFFERENT number — see the note below. */
  commentsScanned: number | null;
  sentiment: number | null;
  /**
   * Share of comments containing purchase-related language. NOT a conversion
   * rate, not a purchase rate, and labelled as language wherever it renders.
   */
  purchaseLanguageRate: number | null;
  /**
   * The denominator `purchaseLanguageRate` is over, and the name of it.
   *
   * A rate with no denominator beside it is not comparable across rows, and
   * this table's entire job is to be read across. 43.8% of 4 comments and
   * 19.5% of 361 are not two points on one scale.
   */
  purchaseLanguageBasis: { scored: number; basis: string | null } | null;

  /** Uploads carrying YouTube's own paid-placement disclosure. */
  disclosedPromotions: number;
  /** Uploads we inferred are commercial from text. A guess, counted separately. */
  inferredPromotions: number;

  fee: { amount: number; currency: string } | null;
  cpm: CpmEstimate | null;

  /** Whether the model pass produced axes. Everything after it is null until it has. */
  classified: boolean;
  /** Whether a model pass finished at all. See ChannelAnalysis.analysisRan. */
  analysisRan: boolean;
  /** Present only when there is no analysis row at all yet. */
  missing: boolean;
}

/**
 * Cost per thousand views, and the arithmetic that produced it.
 *
 * COMPUTABLE ONLY FROM A FEE THE CUSTOMER TYPED. Nothing public reveals what a
 * creator charges: a CPM derived from anything else would be an invention that
 * a budget then gets built on. The formula travels with the number so the
 * reader can see it is division, not a market rate — and `basis` names the
 * view figure, because a CPM over median views and one over peak views are
 * different claims and look identical once rounded.
 */
export interface CpmEstimate {
  value: number;
  currency: string;
  formula: string;
  basis: string;
}

export function cpmFromFee(
  fee: { amount: number; currency: string } | null,
  medianViews: number | null,
): CpmEstimate | null {
  if (!fee || medianViews === null || medianViews <= 0) return null;
  const value = (fee.amount / medianViews) * 1000;
  return {
    value,
    currency: fee.currency,
    formula: `${fee.currency} ${fee.amount.toLocaleString('en-US')} ÷ ${medianViews.toLocaleString('en-US')} median views × 1,000`,
    basis: 'median views per upload in the window read',
  };
}

export function toRow(candidate: Candidate): CandidateRow {
  const a = candidate.analysis;
  const fee =
    candidate.proposedFee === null
      ? null
      : { amount: candidate.proposedFee, currency: candidate.feeCurrency };

  if (!a) {
    return {
      id: candidate.id,
      channelId: candidate.channelId,
      // What they typed, so a row that failed to resolve is still recognisable
      // as the thing they asked for rather than as an opaque channel id.
      title: candidate.submittedAs ?? candidate.channelId,
      handle: null,
      status: candidate.status,
      subscribers: null,
      medianViews: null,
      engagementRate: null,
      commentsAnalysed: 0,
      commentsScanned: null,
      sentiment: null,
      purchaseLanguageRate: null,
      purchaseLanguageBasis: null,
      disclosedPromotions: 0,
      inferredPromotions: 0,
      fee,
      cpm: null,
      classified: false,
      analysisRan: false,
      missing: true,
    };
  }

  const outputs = a.outputStats as PlatformOutput[];
  const youtube = outputs.find((o) => o.platform === 'youtube') ?? outputs[0] ?? null;
  const medianViews = youtube?.medianViews ?? null;

  return {
    id: candidate.id,
    channelId: candidate.channelId,
    title: a.title,
    handle: a.handle,
    status: candidate.status,
    subscribers: a.subscribers,
    medianViews,
    engagementRate: a.engagementRate,
    commentsAnalysed: a.commentsAnalysed,
    commentsScanned: a.commentsScanned,
    // Null until the model pass runs. The inline pass does not produce these
    // and writing a placeholder would make an unclassified channel look calm.
    sentiment: a.classified ? a.sentiment : null,
    purchaseLanguageRate: a.classified ? a.purchaseIntentRate : null,
    purchaseLanguageBasis:
      a.classified && a.intentCommentsScored !== null
        ? { scored: a.intentCommentsScored, basis: a.purchaseIntentBasis }
        : null,
    // Split by how we know. 'explicit' is YouTube's own disclosure; the others
    // are our inference, and merging them would let a guess be counted as a
    // fact in a column a buyer sorts by.
    disclosedPromotions: a.promotions.filter((p) => p.disclosure === 'explicit').length,
    inferredPromotions: a.promotions.filter((p) => p.disclosure !== 'explicit').length,
    fee,
    cpm: cpmFromFee(fee, medianViews),
    classified: a.classified,
    analysisRan: a.analysisRan,
    missing: false,
  };
}

/**
 * Which columns can honestly be compared across THIS set.
 *
 * A column where only one candidate has a figure is not a comparison, it is a
 * single data point with empty cells beside it — and empty cells beside a
 * number read as worse, not as unknown. So the table says so above itself
 * rather than letting the reader infer a ranking that is not there.
 */
/**
 * Below this many scored comments a share is reported but not ranked.
 *
 * Not a significance test — it is a legibility floor. 40 is roughly where one
 * more comment stops moving the figure by a visible amount at one decimal
 * place, which is the point at which a reader can compare two rows without
 * being misled by the arithmetic.
 */
export const MIN_SCORED = 40;

export function comparability(rows: CandidateRow[]): {
  ready: number;
  analysing: number;
  unclassified: number;
  note: string | null;
} {
  const ready = rows.filter((r) => !r.missing && r.classified).length;
  const analysing = rows.filter((r) => r.missing).length;
  const unclassified = rows.filter((r) => !r.missing && !r.classified).length;
  // Ran and found nothing readable. Counted apart from `unclassified`, because
  // "waiting" and "there is nothing to wait for" are different instructions.
  const empty = rows.filter((r) => !r.missing && !r.classified && r.analysisRan);

  // A rate over a handful of comments is not a small measurement, it is a
  // different kind of claim, and it must not sit unmarked in a column the
  // reader is scanning for the biggest number.
  const thin = rows.filter(
    (r) => r.purchaseLanguageBasis !== null && r.purchaseLanguageBasis.scored < MIN_SCORED,
  );

  let note: string | null = null;
  if (rows.length === 0) note = null;
  else if (ready === 0) {
    note =
      'No candidate has been through comment classification yet. Subscriber and view figures below are complete; climate and purchase-language columns are empty because they have not been measured, not because they are low.';
  } else if (ready < rows.length) {
    note = `${ready} of ${rows.length} candidates have been classified. The others show a dash in the comment columns — that is an absent measurement, not a zero.`;
  }
  if (empty.length) {
    const names = empty.map((r) => r.title).join(', ');
    const emptyNote = `The comment pass ran on ${names} and found nothing readable — comments are disabled or removed. That is an empty corpus, not a clean one: no safety conclusion can be drawn about ${empty.length === 1 ? 'it' : 'them'}.`;
    note = note ? `${note} ${emptyNote}` : emptyNote;
  }
  if (thin.length) {
    const names = thin.map((r) => `${r.title} (${r.purchaseLanguageBasis!.scored})`).join(', ');
    const thinNote = `Purchase-language shares for ${names} are over fewer than ${MIN_SCORED} comments and are not comparable with the others.`;
    note = note ? `${note} ${thinNote}` : thinNote;
  }
  return { ready, analysing, unclassified, note };
}

/**
 * What the brief actually constrains, as text the table can print above itself.
 *
 * Returned as a list of stated/unstated pairs rather than prose so an unstated
 * field is visible as unstated. A comparison run against a half-empty brief is
 * still useful; one that hides which half was empty is not.
 */
export function standard(campaign: Campaign): { label: string; value: string | null }[] {
  return [
    { label: 'Brand', value: campaign.brand },
    { label: 'Product', value: campaign.product },
    { label: 'Audience', value: campaign.audience },
    { label: 'Objective', value: campaign.objective },
    { label: 'Avoid', value: campaign.avoidTopics },
    {
      label: 'Budget',
      value:
        campaign.budgetTotal === null
          ? null
          : `${campaign.budgetCurrency} ${campaign.budgetTotal.toLocaleString('en-US')}`,
    },
  ];
}
