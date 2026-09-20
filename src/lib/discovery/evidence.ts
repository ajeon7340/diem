import { AFFILIATE_MARKERS, DISCLOSURE_MARKERS, GIFT_MARKERS } from '@/lib/youtube/disclosure';
import { excerptAround, matchedTerms } from './candidates';
import type { CollaborationRecord, EvidenceClass } from './types';

/**
 * What one video can and cannot establish about one brand.
 *
 * This is the file where the feature is either honest or a liability, so the
 * rules are written as rules rather than as heuristics that happen to be
 * conservative today.
 *
 * RULE 1 — THE FLAG DOES NOT NAME A SPONSOR.
 * `paidProductPlacementDetails.hasPaidProductPlacement` is YouTube's own, and
 * it is worth having: it says this video contains paid promotion. It says
 * nothing about WHOSE. A video flagged for paid promotion that mentions three
 * brands is evidence of a sponsorship by at most one of them, and a search for
 * brand X that lands on it has not found X's campaign. So `explicit_paid`
 * requires the flag AND the brand named in text we retrieved, and even then
 * says in its own limit line that the attribution is a reading of the
 * description, not a fact from the flag.
 *
 * RULE 2 — A MENTION IS A MENTION.
 * Reviews, comparisons, complaints and recommendations all name brands, and
 * none of them is a commercial relationship. `mention` is the default and it
 * does not get promoted by enthusiasm, repetition or view count.
 *
 * RULE 3 — AN AFFILIATE LINK IS NOT A FEE.
 * It is a commission on referral. Reporting it as sponsorship inflates both the
 * relationship and, later, whatever a buyer infers about what the creator
 * charges.
 *
 * RULE 4 — GIFTS ARE NOT CAMPAIGNS.
 * Kept as its own class rather than folded into paid promotion, because the
 * fold is an overstatement in exactly the direction that sells more software.
 *
 * RULE 5 — NOTHING HERE PROVES ABSENCE.
 * No result means this search reached no evidence. The searches are bounded,
 * the index is not ours, and a collaboration with no video about it leaves no
 * trace to find.
 */

export interface EvidenceInput {
  brand: string;
  /** Product names the customer supplied, if any. Used only to name a product. */
  products?: string[];
  videoId: string;
  channelId: string;
  title: string;
  description: string;
  publishedAt: string;
  paidPromotion: boolean | null;
  /** Which query produced this row. */
  source: string;
  collectedAt: string;
  /**
   * Whether prose may be read for disclosure markers at all.
   *
   * False on a deployment without the derived-analysis approval: brand-name
   * matching is retrieval, reading a description to decide what kind of deal it
   * describes is ours, and only the second needs paperwork. With it false every
   * record comes back `mention`, the platform flag still renders as the
   * platform's own fact, and nothing is overstated.
   */
  mayInferFromText: boolean;
}

export function classifyEvidence(input: EvidenceInput): CollaborationRecord | null {
  const text = `${input.title}\n${input.description}`;
  const brandHits = matchedTerms([input.brand], text);

  // The brand is not in anything we read. This row is not evidence about this
  // brand at all — it came back from a search and that is not the same thing.
  if (brandHits.length === 0) return null;

  const product =
    (input.products ?? []).map((p) => p.trim()).filter(Boolean).find((p) => matchedTerms([p], text).length > 0) ??
    null;

  const { classification, ambiguity } = classify(input, text);

  return {
    brand: input.brand,
    product,
    channelId: input.channelId,
    videoId: input.videoId,
    videoTitle: input.title,
    videoUrl: `https://www.youtube.com/watch?v=${input.videoId}`,
    publishedAt: input.publishedAt,
    source: input.source,
    excerpt: excerptAround(text, input.brand),
    classification,
    ambiguity,
    collectedAt: input.collectedAt,
  };
}

function classify(
  input: EvidenceInput,
  text: string,
): { classification: EvidenceClass; ambiguity: string } {
  const flagged = input.paidPromotion === true;

  if (!input.mayInferFromText) {
    return {
      classification: 'mention',
      ambiguity: flagged
        ? 'YouTube marks this video as containing paid promotion. The flag does not say which brand paid, and reading the description to decide is restricted on this deployment, so this stays a mention.'
        : 'This deployment does not read descriptions for disclosure markers, so only the brand name being present is established.',
    };
  }

  const disclosed = DISCLOSURE_MARKERS.test(text);
  const affiliate = AFFILIATE_MARKERS.test(text);
  const gifted = GIFT_MARKERS.test(text);

  if (flagged && disclosed) {
    return {
      classification: 'explicit_paid',
      ambiguity:
        'YouTube flags this video as containing paid promotion and the description carries a disclosure. That this brand is the sponsor is read from the description naming it, not from the flag — a flagged video naming several brands was paid for by at most one.',
    };
  }

  if (flagged && !disclosed) {
    return {
      classification: 'mention',
      ambiguity:
        'YouTube flags this video as containing paid promotion, but nothing in the text we read ties that promotion to this brand. The flag alone does not name a sponsor.',
    };
  }

  if (affiliate) {
    return {
      classification: 'affiliate',
      ambiguity:
        'An affiliate link or affiliate disclosure appears alongside this brand. That pays on referral and is not evidence of a sponsorship fee or an agreement.',
    };
  }

  if (gifted) {
    return {
      classification: 'gifted',
      ambiguity:
        'The description states product was provided. A gift is not a fee, and may have been unsolicited.',
    };
  }

  if (disclosed) {
    return {
      classification: 'mention',
      ambiguity:
        'The description carries a disclosure marker but YouTube has not flagged the video as paid promotion, so the two signals do not agree. Treated as a mention until a person reads it.',
    };
  }

  return {
    classification: 'mention',
    ambiguity:
      'The brand is named and nothing in the retrieved text indicates a commercial relationship. A review or comparison names brands nobody paid for.',
  };
}

/**
 * How strongly the evidence for one creator/brand pair reads, for ranking.
 *
 * Returns null — not zero — when there is no evidence: a creator with no
 * retrieved evidence for a brand is unmeasured on this signal, and scoring them
 * 0 would sort them below a creator whose only evidence was a passing mention,
 * which asserts a comparison the data does not support.
 */
export function evidenceStrength(records: CollaborationRecord[]): number | null {
  if (records.length === 0) return null;
  const WEIGHT: Record<EvidenceClass, number> = {
    customer_confirmed: 1,
    explicit_paid: 0.9,
    affiliate: 0.5,
    gifted: 0.4,
    mention: 0.15,
  };
  // The STRONGEST single piece, not a sum: ten mentions are not one
  // sponsorship, and adding them up is how ten mentions become one.
  return Math.max(...records.map((r) => WEIGHT[r.classification]));
}

/** Terms that find collaboration talk, alongside the brand name itself. */
export const COLLABORATION_TERMS = [
  '협찬',
  '광고',
  'sponsored',
  'review',
  'haul',
  'unboxing',
] as const;

/**
 * The queries one brand gets.
 *
 * Bounded and explicit: the brand alone (which finds reviews and mentions), and
 * the brand with the platform's paid-promotion filter, which is an API-side
 * filter and therefore the cheapest honest route to flagged videos. Adding one
 * query per collaboration term would multiply search calls by six against a
 * hundred-a-day budget for a worse version of what the filter already does.
 */
export function brandQueries(brand: string, products: string[] = []): { q: string; paidOnly: boolean }[] {
  const name = brand.trim();
  const queries: { q: string; paidOnly: boolean }[] = [
    { q: name, paidOnly: true },
    { q: name, paidOnly: false },
  ];
  const product = products.map((p) => p.trim()).filter(Boolean)[0];
  if (product && product.toLowerCase() !== name.toLowerCase()) {
    queries.push({ q: `${name} ${product}`, paidOnly: false });
  }
  return queries;
}
