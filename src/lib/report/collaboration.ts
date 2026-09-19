import type { CampaignCategory, CommentAxes } from '@/types';
import type { ChannelAnalysis } from '@/lib/youtube/explain';
import type { Driver, DriverVideo } from '@/lib/report/drivers';

/**
 * Recommended collaboration direction — what to make with this creator.
 *
 * The advertiser side of the same machinery Studio gives creators: the format
 * drivers measured across one catalogue, turned into a brief. It needs no
 * account link and no ownership — every input is public data on a channel the
 * buyer is already considering.
 *
 * WHAT THIS IS NOT ALLOWED TO SAY, and the rules that hold it to that:
 *
 *   - NOT A CAUSE. A driver is an association measured inside one catalogue.
 *     "Posts under 40 characters run 36% higher here" is a fact about this
 *     channel; "short titles make videos succeed" is not, and neither is any
 *     sentence implying the format produced the result. Every direction ships
 *     with `limits`, and the language is observational throughout.
 *   - NOT A CONVERSION PROMISE. Nothing here has ever seen a conversion. The
 *     figures are views and engagement on organic posts, so a direction can say
 *     what tends to travel on this channel and must never imply what it will
 *     sell.
 *   - NOT A CROSS-CHANNEL RANKING. Every comparison is against the same
 *     channel's own median — enforced upstream by `withinOwner`, which throws.
 *   - NOT AN ANSWER WHERE THERE IS NO EVIDENCE. The statistical gate is the
 *     one already used in Studio: both arms need `MIN_ARM` posts and the rank
 *     test has to clear ALPHA, or the row reports "not enough posts". A
 *     catalogue that clears nothing yields `withheld`, not a softer claim.
 *   - NOT A RELEVANCE CLAIM IT CANNOT SUPPORT. Whether a format suits THIS
 *     brand is a separate question from whether it travels, and the buyer
 *     profile is often empty. Unknown relevance is reported as unknown.
 */

export type Relevance = 'matched' | 'unknown' | 'unmatched';

export interface CollaborationDirection {
  /** The observed pattern, in the buyer's language. */
  headline: string;
  /** The measurement behind it, carried whole so the panel can show n and p. */
  driver: Driver;
  /** Posts the pattern was observed on. Evidence, not a highlight reel. */
  evidence: DriverVideo[];
  relevance: Relevance;
  /** Why relevance reads the way it does. Always present, including when unknown. */
  relevanceNote: string;
}

export interface Collaboration {
  directions: CollaborationDirection[];
  /** Set when nothing could be recommended. The panel renders this instead. */
  withheld: string | null;
  /** Applies to every direction. Rendered once, never omitted. */
  limits: string[];
  /** Posts the whole read is drawn from. */
  sampleSize: number;
}

export interface BuyerProfile {
  industry: string | null;
  sells: string | null;
  categories: CampaignCategory[];
}

/** Creator niches that plainly belong to a campaign category. */
const CATEGORY_HINTS: Partial<Record<CampaignCategory, RegExp>> = {
  beauty: /beauty|makeup|skincare|cosmetic|k-?beauty/i,
  technology: /tech|gadget|workspace|desk|audio|developer|software/i,
  fashion: /fashion|style|outfit|apparel|streetwear/i,
  food_beverage: /food|drink|coffee|cooking|recipe|beverage/i,
  gaming: /gaming|game|esports/i,
  health_fitness: /fitness|health|workout|wellness|nutrition/i,
  travel: /travel|trip|destination/i,
  home_living: /home|living|interior|stationery|paper|garden/i,
  education: /education|learning|study|tutorial/i,
  entertainment: /entertainment|comedy|music|film/i,
  finance: /finance|investing|money|budget/i,
};

/**
 * Turn a measured driver into something a buyer can brief.
 *
 * Only the two verdicts backed by a passing rank test become directions.
 * `inconclusive` deliberately does not: a 136% gap at p=0.093 is exactly the
 * shape that reads as a finding and is not one, and putting it in a brief is
 * how it becomes a production decision.
 */
const HEADLINE: Record<string, (raises: boolean) => string> = {
  collab: (r) => (r ? 'Feature another person on camera' : 'Keep this creator on camera alone'),
  brand: (r) => (r ? 'Tag the brand in the title' : 'Keep the brand out of the title'),
  paid: (r) => (r ? 'Declared placements travel here' : 'Declared placements travel less well here'),
  longform: (r) => (r ? 'Brief long-form, over three minutes' : 'Brief a Short, under three minutes'),
  question: (r) => (r ? 'Open with a question in the title' : 'Avoid a question in the title'),
  emoji: (r) => (r ? 'Emoji in the title suit this channel' : 'Skip emoji in the title'),
  weekend: (r) => (r ? 'Schedule for the weekend' : 'Schedule on a weekday'),
  longtitle: (r) => (r ? 'Longer titles travel here' : 'Keep the title under 40 characters'),
};

function headlineFor(driver: Driver): string {
  const raises = driver.verdict === 'raises';
  const make = HEADLINE[driver.key];
  return make ? make(raises) : `${driver.label}: ${raises ? 'more' : 'less'}`;
}

function assessRelevance(
  driver: Driver,
  niche: string | null,
  productAttachedShare: number | null,
  buyer: BuyerProfile | null,
): { relevance: Relevance; relevanceNote: string } {
  // No profile, no claim. A direction dressed as brand-relevant when nothing is
  // known about the brand is the personalisation a reader spots immediately.
  if (!buyer || (buyer.categories.length === 0 && !buyer.industry && !buyer.sells)) {
    return {
      relevance: 'unknown',
      relevanceNote:
        'No brand profile on this workspace, so relevance to your product is not assessed. Fill in what you sell and this reads against it.',
    };
  }

  const haystack = niche ?? '';
  const matched = buyer.categories.filter((c) => CATEGORY_HINTS[c]?.test(haystack));

  if (matched.length === 0) {
    return {
      relevance: 'unmatched',
      relevanceNote: niche
        ? `This creator publishes in ${niche}, which does not obviously map to your categories. The pattern still holds on their channel; whether it suits your product is a judgement this cannot make.`
        : 'This creator has not stated a niche, so category fit cannot be checked.',
    };
  }

  // A format that travels is not the same as an audience that engages with
  // products, and a buyer briefing a placement needs the second too.
  const attach =
    productAttachedShare === null
      ? ''
      : ` ${Math.round(productAttachedShare * 100)}% of their comments attach to a product, which is the ceiling on how product-led a brief here can be.`;

  return {
    relevance: 'matched',
    relevanceNote: `Their ${niche} overlaps your ${matched.join(', ')} category.${attach}`,
  };
}

/** Share of comments whose object is a product, when the axes were measured. */
function productShare(axes: CommentAxes | null): number | null {
  if (!axes || axes.total <= 0) return null;
  const product = axes.object.find((o) => o.key === 'product')?.count ?? 0;
  return product / axes.total;
}

export function assessCollaboration(
  channel: ChannelAnalysis,
  niche: string | null,
  axes: CommentAxes | null,
  buyer: BuyerProfile | null,
): Collaboration {
  const limits = [
    'Observed on this channel only, from public data. These are associations in their own catalogue, not causes of a video doing well.',
    'Measured on organic posts, against this channel’s own median. Nothing here has seen a conversion, so it says what tends to travel — not what will sell.',
    'A pattern that held for their own content may not hold for a sponsored brief.',
  ];

  const usable = channel.drivers.filter(
    (d) => d.verdict === 'raises' || d.verdict === 'lowers',
  );

  if (channel.sampleSize === 0) {
    return {
      directions: [],
      withheld: 'No public uploads to read, so there is nothing to base a direction on.',
      limits,
      sampleSize: 0,
    };
  }

  if (usable.length === 0) {
    const tooThin = channel.drivers.every((d) => d.verdict === 'not enough posts');
    return {
      directions: [],
      withheld: tooThin
        ? `Across ${channel.sampleSize} posts no format has enough on both sides to compare. Recommending one anyway would be inventing a pattern.`
        : `Across ${channel.sampleSize} posts no format reliably outperforms the others. That is a finding: on this channel the brief matters less than the creator, and any reasonable format is as good a bet.`,
      limits,
      sampleSize: channel.sampleSize,
    };
  }

  const share = productShare(axes);
  const directions = usable.slice(0, 3).map((driver) => ({
    headline: headlineFor(driver),
    driver,
    // The posts the pattern was measured ON — both arms are in the catalogue,
    // so the evidence is the side the direction points at.
    evidence: (driver.verdict === 'raises' ? channel.best : channel.worst).slice(0, 2),
    ...assessRelevance(driver, niche, share, buyer),
  }));

  return { directions, withheld: null, limits, sampleSize: channel.sampleSize };
}
