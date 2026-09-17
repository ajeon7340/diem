import type { CommentIntent, CommentObject, IntentBasis, IntentMeasurement } from '@/types';

export type { IntentBasis, IntentMeasurement };

/**
 * Purchase intent as a measurement, not a number.
 *
 * Before the two-axis taxonomy, `purchase_intent_rate` was the share of
 * comments in the `purchase` bucket — on /@jooshica it is literally the
 * purchase cluster's share, 0.281 beside a cluster at 0.28. Three things were
 * wrong with that figure, and each was a wrong answer rather than a vague one:
 *
 *   1. IT MEASURED CONTENT MIX. A channel that never holds a product cannot
 *      produce purchase comments, so the number reported what got filmed. The
 *      object axis fixes this at the source and this file inherits the fix: a
 *      denominator of comments ABOUT A PRODUCT asks whether the audience moves
 *      when a product is in frame, which is the thing being sold to a brand.
 *      Keep both readings — the mix-dependent one is still true and still
 *      useful, it just answers a different question. See `IntentBasis`.
 *
 *   2. IT WAS BINARY. "where do I buy" and "how does it hold up after a year"
 *      are not one signal. INTENT_WEIGHTS grades the cross-product instead.
 *
 *   3. IT CARRIED NO PRECISION. /@fernpress reports 34% from 41 comments and
 *      renders at the weight of 22% from twelve thousand. sufficiency.ts
 *      answers that with a cliff at 100 comments; the honest answer is an
 *      interval — 34% of 41 is 21%-50%, and saying so is more useful than
 *      withholding, because it is a fact rather than a refusal.
 *
 * WHAT THIS IS NOT. A rate over comments is comparative, never absolute.
 * Commenters are a self-selected fraction of a percent of viewers, skewed to
 * the engaged; 28% of comments is not 28% of buyers and nothing here turns it
 * into one. It means something against a cohort — which is what `benchmarks`
 * is for — and it becomes VALID only when checked against realised outcomes,
 * which needs campaign results this product does not collect yet. Until then
 * the only claim the UI may make is "this is what the comment section says".
 *
 * Null, never zero, when there is nothing to measure. See migration 0009.
 */

/**
 * Bump when any weight below changes, and store it on the row.
 *
 * A rubric change silently restates every historical rate, which makes cohort
 * medians and percentiles incomparable across time — so the version travels
 * with the number rather than living only in this file. Distinct from
 * `model_version`: a classifier can be retrained against an unchanged rubric,
 * and the rubric can be revised without touching the classifier.
 */
export const INTENT_RUBRIC_VERSION = 'intent-rubric-1';

/** One cell of the object x intent cross-product. */
export type IntentCellKey = `${CommentObject}:${CommentIntent}`;

export const cellKey = (object: CommentObject, intent: CommentIntent): IntentCellKey =>
  `${object}:${intent}`;

/** Counts per cell. Absent means zero observed — the grid is sparse by design. */
export type IntentCells = Partial<Record<IntentCellKey, number>>;

/**
 * THE RUBRIC. How much buying signal each cell carries, 0-1.
 *
 * Weights sit on the CROSS-PRODUCT rather than on either axis alone, because
 * neither axis means anything commercially without the other: `buy` aimed at a
 * creator is merch, `ask` aimed at content is a content question, and only the
 * product column is a brand's to buy. Cells absent from this map weigh zero.
 *
 * Every number here is a judgement call, stated once and in the open — the
 * same discipline as THRESHOLDS in sufficiency.ts.
 *
 * TWO LIMITS THE AXES CANNOT EXPRESS, both of which cost real information:
 *
 *   - BLOCKED DEMAND. "I'd buy it if it shipped here" and "way overpriced" are
 *     both product:criticise, and the first is qualified demand at a different
 *     offer — the most actionable line in the report for a brand that can move
 *     price. They are not separable today, which is why that cell is weighted
 *     near zero: an ambiguous cell must not be able to move the headline. A
 *     third axis (barrier: price | availability | region | none) is what would
 *     recover it.
 *   - OWNERSHIP. "mine's been great for a year" is post-purchase evidence and
 *     "looks great" is not; both are product:praise. Hence 0.25 rather than a
 *     weight that would assume either.
 */
export const INTENT_WEIGHTS: Partial<Record<IntentCellKey, number>> = {
  // The core signal: attention on a purchasable thing, wanting to acquire it.
  'product:buy': 1,
  // Evaluating: specs, comparisons, longevity. Real intent, earlier in the funnel.
  'product:ask': 0.4,
  // "Review the X", "do a long-term test" — demand for more of this product.
  'product:request': 0.3,
  // Owners and admirers in one cell, and the admirers dominate it. See the
  // ownership limit above; 0.1 rather than a weight that assumes either.
  'product:praise': 0.1,
  // Contains blocked demand and plain rejection together. See above.
  'product:criticise': 0.05,
  // Merch, tips, "take my money". Genuine buying intent, but aimed at the
  // creator rather than at anything a brand can place. Counted, discounted,
  // and outside the product denominator entirely.
  'creator:buy': 0.35,
  // An audience that asks for tutorials is an audience that will accept a
  // sponsored one — the argument for `request` in the intent axis, applied.
  'content:request': 0.1,
  // NO `subject:*` KEY APPEARS HERE, IN ANY COMBINATION, AND NONE MAY BE ADDED.
  //
  // `subject` is someone the video is ABOUT, not the creator and not a product.
  // On a call-out channel it is most of the section, and it is loud: arguing
  // about a third party produces exactly the engagement metrics that a busy
  // commercial section produces. An audience litigating whether a stranger is
  // lying is not closer to buying anything, and a weight here — even a small
  // one — would price that format as commercial on the strength of a fight.
};

// `product:react` is absent, which is not an oversight. It stays in the
// DENOMINATOR — a reaction to a product is attention that did not convert, and
// diluting the rate with it is correct — but it carries no intent, so it earns
// no weight.
//
// The calibration came from /@jooshica: 21,330 real comments, 1,430 of them
// attached to a product and 33 expressing a wish to buy. At an earlier draft's
// 0.25 for praise and 0.1 for react, that channel scored 22% "purchase intent"
// — for an audience the same data shows notices products and does not chase
// them. Praise and reaction are the two largest product cells on almost every
// channel, so any generous weight on them stops measuring intent and starts
// measuring attention, which the object axis already reports on its own.
/**
 * One post's classified comments.
 *
 * The ingestion worker decides what gets scored at all, because eligibility is
 * a content judgement rather than a statistical one. Two exclusions matter
 * enough to name:
 *
 *   - GIVEAWAYS. A contest post manufactures purchase-shaped text ("me
 *     please", "entered!") in volume. Left in, it is the fastest way to make
 *     this number meaningless. Do not pass those posts.
 *   - The creator's own replies, repeat-author spam, and affiliate drop-link
 *     bots, which are literally purchase-shaped.
 */
export interface PostIntentSample {
  postId: string;
  /** Views on the post. Weights the aggregate; absent falls back to pooling. */
  views: number;
  cells: IntentCells;
  /**
   * Did the post carry something purchasable — sponsored, affiliate-linked, or
   * a product held and discussed?
   *
   * NOT a filter: the object axis already does the job a post-level filter was
   * a proxy for, and better. It is reported, because a product-bearing post
   * with no product comments is a real and meaningful zero, unlike a post that
   * never had a product to comment on. Sourced from the promotions record.
   */
  productBearing: boolean;
}

/** Two posts cannot describe a spread; three is the smallest number that can. */
const MIN_POSTS_FOR_SPREAD = 3;

/** 95%. */
const Z = 1.959963984540054;

const count = (cells: IntentCells, key: IntentCellKey): number =>
  Math.max(0, cells[key] ?? 0);

/** Cells inside the basis denominator. */
function basisKeys(cells: IntentCells, basis: IntentBasis): IntentCellKey[] {
  const keys = Object.keys(cells) as IntentCellKey[];
  return basis === 'all_comments' ? keys : keys.filter((k) => k.startsWith('product:'));
}

function countComments(cells: IntentCells, basis: IntentBasis): number {
  return basisKeys(cells, basis).reduce((sum, key) => sum + count(cells, key), 0);
}

function weightedSum(cells: IntentCells, basis: IntentBasis): number {
  return basisKeys(cells, basis).reduce(
    (sum, key) => sum + count(cells, key) * (INTENT_WEIGHTS[key] ?? 0),
    0,
  );
}

/** One post's rate over the basis. Null when the basis is empty — never 0. */
export function postRate(cells: IntentCells, basis: IntentBasis): number | null {
  const n = countComments(cells, basis);
  if (n === 0) return null;
  return weightedSum(cells, basis) / n;
}

/**
 * Wilson score interval.
 *
 * Wald (p +/- z*sqrt(p(1-p)/n)) is the one everyone writes and it is unusable
 * here: at 41 comments near either end it returns bounds outside [0,1], and
 * this product's entire long tail lives at small n. Wilson stays inside the
 * interval and stays honest at the extremes.
 */
export function wilson(p: number, n: number, z = Z): { low: number; high: number } | null {
  if (!Number.isFinite(p) || !Number.isFinite(n) || n <= 0) return null;
  const clamped = Math.min(1, Math.max(0, p));
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = clamped + z2 / (2 * n);
  const margin = z * Math.sqrt((clamped * (1 - clamped)) / n + z2 / (4 * n * n));
  return {
    low: Math.max(0, (centre - margin) / denom),
    high: Math.min(1, (centre + margin) / denom),
  };
}

/**
 * Kish's effective sample size over the view weights, as a fraction of posts.
 *
 * The point estimate is view-weighted, so a post with ten times the views of
 * the rest supplies most of the answer. Treating its comments as an
 * independent sample of the channel claims precision the sample has not got.
 * This is (sum v)^2 / sum(v^2) / posts: 1.0 when views are equal across posts,
 * falling toward 1/posts as one post takes over — so a creator whose intent
 * rests on a single viral video gets a visibly wider interval, which is the
 * correct answer rather than a penalty.
 */
export function clusterFactor(views: number[]): number {
  const positive = views.filter((v) => Number.isFinite(v) && v > 0);
  if (positive.length === 0) return 1;
  const sum = positive.reduce((a, b) => a + b, 0);
  const sumSq = positive.reduce((a, b) => a + b * b, 0);
  if (sumSq === 0) return 1;
  return Math.min(1, (sum * sum) / sumSq / positive.length);
}

function combine(samples: PostIntentSample[], basis: IntentBasis) {
  const scored = samples.filter((s) => countComments(s.cells, basis) > 0);
  const comments = scored.reduce((sum, s) => sum + countComments(s.cells, basis), 0);
  if (comments === 0) {
    return { rate: null, comments: 0, posts: 0, effectiveN: 0, dispersion: null };
  }

  const rates = scored.map((s) => postRate(s.cells, basis) as number);
  const views = scored.map((s) => (Number.isFinite(s.views) && s.views > 0 ? s.views : 0));
  const totalViews = views.reduce((a, b) => a + b, 0);

  // View-weighted across posts, because a brand buys exposure and not
  // comments. Pooling instead lets the one post with a runaway comment section
  // own the number. With no view data, pooling is all there is.
  const rate =
    totalViews > 0
      ? rates.reduce((sum, r, i) => sum + r * views[i], 0) / totalViews
      : scored.reduce((sum, s) => sum + weightedSum(s.cells, basis), 0) / comments;

  const effectiveN = totalViews > 0 ? comments * clusterFactor(views) : comments;

  // Unweighted across posts on purpose: the question the spread answers is
  // whether a good post is a floor or a fluke, and that is a fact about posts.
  let dispersion: number | null = null;
  if (scored.length >= MIN_POSTS_FOR_SPREAD) {
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
    const variance = rates.reduce((sum, r) => sum + (r - mean) ** 2, 0) / rates.length;
    dispersion = Math.sqrt(variance);
  }

  return { rate, comments, posts: scored.length, effectiveN, dispersion };
}

/**
 * The whole measurement, from per-post classified comments.
 *
 * Defaults to the product denominator — the number a buyer is asking for. A
 * creator whose comment sections never touch a product returns a null rate
 * with a real `commercialDensity` beside it: that is the honest shape of "this
 * audience has never been shown anything to buy", and it must not render as a
 * low rate. /@ffion is the fixture that used to get this wrong.
 */
export function aggregateIntent(
  samples: PostIntentSample[],
  basis: IntentBasis = 'product_comments',
): IntentMeasurement {
  const headline = combine(samples, basis);
  const overall = basis === 'product_comments' ? combine(samples, 'all_comments') : headline;
  const interval = headline.rate === null ? null : wilson(headline.rate, headline.effectiveN);

  return {
    rate: headline.rate,
    ciLow: interval?.low ?? null,
    ciHigh: interval?.high ?? null,
    basis,
    commercialDensity: overall.rate,
    commentsScored: headline.comments,
    postsScored: headline.posts,
    productPostsAnalyzed: samples.filter((s) => s.productBearing).length,
    dispersion: headline.dispersion,
    rubricVersion: INTENT_RUBRIC_VERSION,
  };
}

/**
 * Does this creator clear a directory filter?
 *
 * On the LOWER BOUND, not the point estimate. `minPurchaseIntent=0.10` today
 * ranks /@fernpress's 34%-from-41-comments above 22% drawn from twelve
 * thousand, which is backwards: the filter is a question about evidence, and a
 * creator clears the bar only when the sample can support it. Unmeasured
 * returns false, matching the rule in directory.ts that unmeasured creators
 * drop out of measured filters rather than sorting as zero.
 */
export function clearsFloor(
  measurement: Pick<IntentMeasurement, 'ciLow' | 'rate'>,
  floor: number,
): boolean {
  if (measurement.ciLow !== null) return measurement.ciLow >= floor;
  // Pre-0012 rows carry a rate and no interval. Falling back to the point
  // estimate keeps them filterable; it is the old behaviour, not a new claim.
  return measurement.rate !== null && measurement.rate >= floor;
}

/**
 * Cost per intent signal — what commercial fit actually is.
 *
 * Intent says whether they convert, CPM says what it costs, and neither on its
 * own is the decision. This is the estimated spend to buy a thousand views
 * divided by how many of those viewers leave a purchase-shaped comment. It
 * makes the YouTube-versus-Instagram allocation rather than describing it,
 * which is the argument for costing the two platforms separately.
 *
 * Null-propagating: no published minimum means no CPM means no fit figure.
 * Inherits every caveat on costEfficiency — it is an estimate built from an
 * estimate, and the UI owes the same disclaimer twice over.
 */
export function costPerIntentSignal(input: {
  estimatedCpm: number | null;
  rate: number | null;
  /** avgComments / avgViews on this platform. */
  commentRate: number | null;
}): number | null {
  const { estimatedCpm, rate, commentRate } = input;
  if (estimatedCpm === null || rate === null || commentRate === null) return null;
  if (estimatedCpm <= 0 || rate <= 0 || commentRate <= 0) return null;
  const signalsPerThousandViews = 1000 * commentRate * rate;
  if (signalsPerThousandViews <= 0) return null;
  return estimatedCpm / signalsPerThousandViews;
}

/**
 * The measurement from a corpus-level cross-tab, when per-post data is absent.
 *
 * `aggregateIntent` wants per-post cells so it can weight by views and widen
 * the interval when one video carries the corpus. A row that only stored
 * `comment_axes.cells` has neither, and the honest response is not to fake
 * them: no view weighting, no cluster correction, and a plain Wilson interval
 * on the raw count. That interval is WIDER than the per-post one would be for
 * the same data, which is the correct direction — we know less here.
 *
 * `dispersion` is null for the same reason. Spread across posts is a fact
 * about posts, and this input has no posts in it.
 */
export function aggregateFromCells(
  cells: IntentCells,
  basis: IntentBasis = 'product_comments',
  productPostsAnalyzed = 0,
): IntentMeasurement {
  const n = countComments(cells, basis);
  const rate = n > 0 ? weightedSum(cells, basis) / n : null;
  const interval = rate === null ? null : wilson(rate, n);
  const overallN = countComments(cells, 'all_comments');

  return {
    rate,
    ciLow: interval?.low ?? null,
    ciHigh: interval?.high ?? null,
    basis,
    commercialDensity: overallN > 0 ? weightedSum(cells, 'all_comments') / overallN : null,
    commentsScored: n,
    // Not zero — zero would claim we looked at no posts, when in fact we
    // looked at a corpus that did not record which posts it came from.
    postsScored: 0,
    productPostsAnalyzed,
    dispersion: null,
    rubricVersion: INTENT_RUBRIC_VERSION,
  };
}

/**
 * Sentiment, 0–100, from the intent axis — or null, which is a real answer.
 *
 * THE DENOMINATOR IS OPINION-BEARING COMMENTS, not the corpus. Most comments
 * hold no valence at all: `react`, `ask` and `buy` are not positive or negative
 * about anything, and dividing by the whole corpus would make a busy, cheerful
 * section score LOW simply because most of its comments were reactions. On
 * @가재맨 that denominator choice is the difference between a number about the
 * audience and a number about how chatty they are.
 *
 * `abuse` IS EXCLUDED, and this is the load-bearing line. Abuse is what was
 * done TO the creator, and this codebase already refuses to let that reach
 * their rating — the same rule `censusRisk` encodes, and the reason `abuse` was
 * split out of `criticise` in the first place. Counting it here would rebuild
 * the exact scoring the split removed: the more abuse a creator attracts, the
 * worse their sentiment, which rewards obscurity and punishes reach.
 *
 * Null when nobody expressed an opinion either way. Not 50, and not 100: a
 * section with no praise and no criticism has not been measured as neutral, it
 * has not been measured at all. Zero is the worst score on a 0–100 scale and
 * 50 is a claim nobody made.
 *
 * Computed from the SAME cells the axes are written from, by the one pass that
 * writes them, so the headline cannot disagree with the panel beneath it. That
 * is the whole lesson of `brand_safety_score`, which was hand-typed, had no
 * producer, and contradicted the flags under it on every fixture.
 */
export function sentimentFromCells(cells: IntentCells): number | null {
  const keys = Object.keys(cells) as IntentCellKey[];
  const sum = (intent: CommentIntent) =>
    keys
      .filter((k) => k.endsWith(`:${intent}`))
      .reduce((total, k) => total + count(cells, k), 0);

  const praise = sum('praise');
  const criticise = sum('criticise');
  const opinionated = praise + criticise;
  if (opinionated === 0) return null;

  return (praise / opinionated) * 100;
}
