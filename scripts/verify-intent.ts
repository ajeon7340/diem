/**
 * Assertions for the purchase-intent measurement.
 *
 * The rubric weights, the denominator rule and the interval are the three
 * things that decide what this product's headline number means. All three are
 * judgement calls, so they are pinned here — a change that moves any of them
 * must be a deliberate edit to this file and a bump of INTENT_RUBRIC_VERSION,
 * not a quiet drift in a classifier prompt.
 *
 *   npm run verify:intent
 */
import {
  INTENT_RUBRIC_VERSION,
  INTENT_WEIGHTS,
  aggregateFromCells,
  aggregateIntent,
  cellKey,
  clearsFloor,
  clusterFactor,
  costPerIntentSignal,
  postRate,
  wilson,
  type IntentCells,
  type PostIntentSample,
} from '@/lib/report/intent';

let pass = 0,
  fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    console.log(`  FAIL ${label}\n       got ${a}\n       want ${e}`);
  }
}

const pct = (v: number | null) => (v === null ? null : Math.round(v * 1000) / 10);

const post = (over: Partial<PostIntentSample> = {}): PostIntentSample => ({
  postId: 'p1',
  views: 100_000,
  cells: {},
  productBearing: true,
  ...over,
});

// ---------------------------------------------------------------------------
// The rubric
// ---------------------------------------------------------------------------

check('cell keys are object:intent', cellKey('product', 'buy'), 'product:buy');
check('asking where to buy is the full signal', INTENT_WEIGHTS['product:buy'], 1);
check('an unweighted cell is absent, not zero', INTENT_WEIGHTS['creator:react'], undefined);
check('rubric version is stamped', INTENT_RUBRIC_VERSION, 'intent-rubric-1');

// product:criticise holds blocked demand AND plain rejection in one cell, so it
// must not be able to move the headline on its own.
check(
  'the ambiguous cell is near zero',
  (INTENT_WEIGHTS['product:criticise'] ?? 0) <= 0.05,
  true,
);

// A pure "where do I buy" section is 100%; a pure reaction section is 0%.
check('an all-buy product section rates 1', postRate({ 'product:buy': 50 }, 'product_comments'), 1);
// Attention that did not convert: in the denominator, worth nothing.
check(
  'reacting to a product is not wanting it',
  postRate({ 'product:react': 50 }, 'product_comments'),
  0,
);

// ---------------------------------------------------------------------------
// The denominator — the defect the two-axis taxonomy exists to fix
// ---------------------------------------------------------------------------

// A channel that mostly reacts to its creator, with a small but hot product
// conversation: the mix-dependent read and the propensity read must differ by
// an order of magnitude, and both must be reported.
const reactionChannel: IntentCells = {
  'creator:react': 9_000,
  'creator:praise': 800,
  'product:buy': 120,
  'product:ask': 60,
  'product:react': 20,
};
const mixed = aggregateIntent([post({ cells: reactionChannel })]);
check('product denominator reads the product conversation', pct(mixed.rate), 72);
check('all-comments denominator reads the mix', pct(mixed.commercialDensity), 1.4);
check('the basis travels with the number', mixed.basis, 'product_comments');
check('the denominator is the basis, not the corpus', mixed.commentsScored, 200);

// creator:buy is real buying intent aimed at merch, not at a brand's product —
// counted in density, excluded from the product denominator entirely.
const merch = aggregateIntent([post({ cells: { 'creator:buy': 100 } })]);
check('merch intent does not enter the product rate', merch.rate, null);
check('merch intent does enter commercial density', pct(merch.commercialDensity), 35);

// ---------------------------------------------------------------------------
// Absence is not zero — migration 0009's rule, on the new number
// ---------------------------------------------------------------------------

const noComments = aggregateIntent([post({ cells: {} })]);
check('no comments gives a null rate, not 0', noComments.rate, null);
check('no comments gives no interval', [noComments.ciLow, noComments.ciHigh], [null, null]);
check('no comments gives null density', noComments.commercialDensity, null);

// A creator who has never held a product: real density, no propensity. This is
// the /@ffion shape, and rendering it as a low rate is the bug.
const neverSold = aggregateIntent([
  post({ productBearing: false, cells: { 'creator:react': 5_000, 'content:praise': 2_000 } }),
]);
check('never-sold has no product rate', neverSold.rate, null);
check('never-sold still reports density', pct(neverSold.commercialDensity), 0);
check('never-sold reports zero product posts', neverSold.productPostsAnalyzed, 0);

// A product-bearing post whose product conversation is empty is a real zero,
// distinct from the case above. Both must be representable.
const sold = aggregateIntent([
  post({ productBearing: true, cells: { 'product:react': 40, 'creator:react': 900 } }),
]);
check('a product post with cold comments rates zero, not null', pct(sold.rate), 0);
check('product posts are counted', sold.productPostsAnalyzed, 1);

// ---------------------------------------------------------------------------
// Precision — /@fernpress is the case this exists for
// ---------------------------------------------------------------------------

const wide = wilson(0.34, 41);
check('34% of 41 is a 21-50% interval', [pct(wide!.low), pct(wide!.high)], [21.4, 49.3]);

const tight = wilson(0.22, 12_000);
check('22% of 12,000 is a 21-23% interval', [pct(tight!.low), pct(tight!.high)], [21.3, 22.8]);

// Wald would put bounds outside [0,1] here; Wilson must not.
const extreme = wilson(0.02, 30)!;
check('a low rate at small n stays inside [0,1]', extreme.low >= 0 && extreme.high <= 1, true);
check('n of zero has no interval', wilson(0.3, 0), null);

// ---------------------------------------------------------------------------
// One viral post must not buy precision it did not earn
// ---------------------------------------------------------------------------

check('equal views across posts cost nothing', clusterFactor([100, 100, 100, 100]), 1);
check(
  'one post dominating shrinks the effective sample',
  clusterFactor([1_000_000, 1_000, 1_000, 1_000]) < 0.3,
  true,
);

const even = aggregateIntent(
  Array.from({ length: 4 }, (_, i) =>
    post({ postId: `p${i}`, views: 100_000, cells: { 'product:buy': 25, 'product:react': 75 } }),
  ),
);
const lopsided = aggregateIntent([
  post({ postId: 'viral', views: 4_000_000, cells: { 'product:buy': 25, 'product:react': 75 } }),
  ...Array.from({ length: 3 }, (_, i) =>
    post({ postId: `p${i}`, views: 5_000, cells: { 'product:buy': 25, 'product:react': 75 } }),
  ),
]);
check('same comments, same rate', [pct(even.rate), pct(lopsided.rate)], [25, 25]);
check(
  'but a lopsided sample gets a wider interval',
  lopsided.ciHigh! - lopsided.ciLow! > (even.ciHigh! - even.ciLow!) * 1.5,
  true,
);

// The point estimate follows views, not comment volume: a low-intent post with
// a runaway comment section must not own the number.
const viewWeighted = aggregateIntent([
  post({ postId: 'big', views: 900_000, cells: { 'product:buy': 10 } }),
  post({ postId: 'noisy', views: 100_000, cells: { 'product:react': 990 } }),
]);
check('view-weighted, not pooled', pct(viewWeighted.rate), 90);

// ---------------------------------------------------------------------------
// Spread
// ---------------------------------------------------------------------------

const flat = aggregateIntent(
  Array.from({ length: 4 }, (_, i) =>
    post({ postId: `p${i}`, cells: { 'product:buy': 30, 'product:react': 70 } }),
  ),
);
check('a flat channel has near-zero dispersion', pct(flat.dispersion), 0);

const spiky = aggregateIntent([
  post({ postId: 'a', cells: { 'product:buy': 90, 'product:react': 10 } }),
  post({ postId: 'b', cells: { 'product:react': 100 } }),
  post({ postId: 'c', cells: { 'product:react': 100 } }),
]);
check('a one-hit channel has visible dispersion', (spiky.dispersion ?? 0) > 0.3, true);
check(
  'two posts cannot describe a spread',
  aggregateIntent([post({ postId: 'a', cells: { 'product:buy': 10 } }), post({ postId: 'b', cells: { 'product:buy': 10 } }) ]).dispersion,
  null,
);

// ---------------------------------------------------------------------------
// The directory filter asks about evidence, not about the point estimate
// ---------------------------------------------------------------------------

check(
  'a thin 34% does not clear a 25% floor',
  clearsFloor({ rate: 0.34, ciLow: wilson(0.34, 41)!.low }, 0.25),
  false,
);
check(
  'a deep 30% does clear it',
  clearsFloor({ rate: 0.3, ciLow: wilson(0.3, 12_000)!.low }, 0.25),
  true,
);
check('unmeasured never clears a floor', clearsFloor({ rate: null, ciLow: null }, 0.1), false);
check(
  'pre-0012 rows fall back to the point estimate',
  clearsFloor({ rate: 0.34, ciLow: null }, 0.25),
  true,
);

// ---------------------------------------------------------------------------
// Commercial fit
// ---------------------------------------------------------------------------

// $18 CPM, 25% intent, 1 comment per 200 views -> 1.25 signals per 1k views.
check(
  'cost per intent signal',
  Math.round(costPerIntentSignal({ estimatedCpm: 18, rate: 0.25, commentRate: 0.005 })! * 100) /
    100,
  14.4,
);
check(
  'no published minimum means no fit figure',
  costPerIntentSignal({ estimatedCpm: null, rate: 0.25, commentRate: 0.005 }),
  null,
);
check(
  'an unmeasured rate means no fit figure',
  costPerIntentSignal({ estimatedCpm: 18, rate: null, commentRate: 0.005 }),
  null,
);

// ---------------------------------------------------------------------------
// The corpus cross-tab, when per-post data is absent
// ---------------------------------------------------------------------------

// /@jooshica's real axis, reconstructed to match both stored margins: 21,330
// comments, 1,430 of them about a product, 33 of those wanting to buy.
const joosh: IntentCells = {
  'product:buy': 33,
  'product:ask': 454,
  'product:react': 552,
  'product:praise': 300,
  'product:request': 40,
  'product:criticise': 51,
  'creator:react': 9_306,
  'creator:praise': 3_630,
  'creator:ask': 3_047,
  'creator:request': 569,
  'creator:criticise': 625,
  'content:react': 514,
  'content:ask': 300,
  'content:praise': 240,
  'content:request': 208,
  'content:criticise': 30,
  'unclassified:unclassified': 1_242,
  'unclassified:react': 189,
};

const corpus = aggregateFromCells(joosh);
check('the product denominator is the product column', corpus.commentsScored, 1_430);
check('intent over it reads 18.1%', pct(corpus.rate), 18.1);
// The number that used to be the headline: product:buy over the whole corpus,
// unweighted. Still true, still a different question — it asks how commercial
// the channel is, not whether the audience moves.
check('while density over everything is 1.3%', pct(corpus.commercialDensity), 1.3);
check('and 33/21,330 was neither of them', Math.round((33 / 21_330) * 1000) / 10, 0.2);

// No posts in the input, so no view weighting and no cluster correction —
// and the interval must be the plain, wider one rather than a borrowed
// narrower one.
check('no posts means no spread', corpus.dispersion, null);
check('and postsScored is 0, not invented', corpus.postsScored, 0);
const plain = wilson(corpus.rate!, 1_430)!;
check(
  'the interval is the plain Wilson on the raw count',
  [pct(corpus.ciLow), pct(corpus.ciHigh)],
  [pct(plain.low), pct(plain.high)],
);

check('an empty cross-tab measures nothing', aggregateFromCells({}).rate, null);

// ---------------------------------------------------------------------------
// An empty product denominator is UNMEASURABLE, not zero
//
// @가재맨, hand-classified: 2,392 comments, both axes, and NOT ONE is about
// something purchasable. 65.7% of the section is about the `subject` — the
// third party the videos are about — 18.7% about the creator, 11.6% about the
// video itself. Product: zero.
//
// A creator who never holds a product is not a creator whose audience refuses
// to buy, and a 0% here would say exactly that, in the one figure a brand
// prices on. The rate has to come back null.
// ---------------------------------------------------------------------------
const GJ_CELLS: IntentCells = {
  'subject:criticise': 930,
  'subject:abuse': 321,
  'subject:react': 246,
  'creator:praise': 176,
  'content:praise': 99,
  'content:react': 97,
  'creator:react': 95,
  'creator:request': 88,
  'unclassified:react': 86,
  'creator:criticise': 63,
  'subject:ask': 55,
  'content:request': 37,
  'content:criticise': 34,
  'creator:abuse': 21,
  'subject:request': 19,
  'content:ask': 11,
  'unclassified:unclassified': 9,
  'creator:ask': 3,
  'subject:praise': 1,
  'unclassified:abuse': 1,
};

const gj = aggregateFromCells(GJ_CELLS, 'product_comments', 0);
check('no product conversation means no rate', gj.rate, null);
check('and no interval to print beside it', [gj.ciLow, gj.ciHigh], [null, null]);
check('the empty denominator is reported as empty', gj.commentsScored, 0);
// Not null: commercial density is a share of the WHOLE corpus and is still
// answerable. It says the channel is 0.15% commercial, which is the finding.
check(
  'commercial density still computes over everything',
  Math.round((gj.commercialDensity ?? 0) * 10_000) / 100,
  0.15,
);

// `subject` may never earn purchase-intent weight, in any combination. On this
// channel it is two thirds of the section, and an audience litigating whether a
// stranger is lying produces the same engagement a commercial section does.
for (const intent of ['buy', 'ask', 'request', 'praise', 'criticise', 'react'] as const) {
  check(
    `subject:${intent} carries no intent weight`,
    INTENT_WEIGHTS[`subject:${intent}` as keyof typeof INTENT_WEIGHTS] ?? 0,
    0,
  );
}
// Proof it is not merely unweighted but unreachable: the whole 1,572-comment
// subject column scores nothing on the wider basis either.
const subjectOnly = aggregateFromCells(
  { 'subject:criticise': 930, 'subject:abuse': 321, 'subject:react': 246, 'subject:ask': 55 },
  'all_comments',
  0,
);
check('a section that is entirely about a third party scores zero', subjectOnly.rate, 0);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
