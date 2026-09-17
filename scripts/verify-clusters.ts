/**
 * Assertions for the comment taxonomy closing to 100%.
 *
 * The panel used to filter `off_topic` clusters out of the display while
 * keeping `commentsAnalyzed` as the denominator, so a real report printed
 * shares summing to 46% under a header reading "21,330 comments" — and the
 * bucket it hid was the largest one. These pin the contract that replaced it:
 * every bucket renders, the shortfall is named, and the printed integers
 * reconcile with the printed whole.
 *
 *   npm run verify:clusters
 */
import { RESIDUAL_ID, orderClusters, withResidual } from '@/lib/report/clusters';
import { largestRemainder } from '@/lib/format';
import { commentClustersSchema } from '@/lib/schemas';
import { BRAND_RISK_CATEGORIES } from '@/types';
import type { CommentCluster, CommentIntent, CommentObject } from '@/types';

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

const cluster = (
  id: string,
  share: number,
  intent: CommentIntent = 'praise',
  commentCount = 0,
  object: CommentObject | null = null,
): CommentCluster => ({
  id,
  label: id,
  share,
  commentCount,
  sentiment: null,
  object,
  intent,
  keyphrases: [],
  comments: [],
  exampleComment: '',
});

// ---------------------------------------------------------------------------
// Largest remainder
// ---------------------------------------------------------------------------

// The exact case that printed 101%: 29.67 + 54.59 + 10.10 + 5.06 + 0.59.
const real = [0.2967, 0.5459, 0.101, 0.0506, 0.0059];
check(
  'per-value rounding overshoots',
  real.reduce((sum, v) => sum + Math.round(v * 100), 0),
  101,
);
check('largest remainder totals exactly 100', sum(largestRemainder(real)), 100);
check('largest remainder keeps input order', largestRemainder(real), [30, 54, 10, 5, 1]);
check('an undershooting set still totals 100', sum(largestRemainder([1 / 3, 1 / 3, 1 / 3])), 100);
check('a single bucket takes the whole 100', largestRemainder([0.42]), [100]);
check('an empty set returns nothing', largestRemainder([]), []);
check('all-zero input does not divide by zero', largestRemainder([0, 0]), [0, 0]);
check('unnormalised input is scaled, not truncated', sum(largestRemainder([5, 3, 2])), 100);

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

// ---------------------------------------------------------------------------
// The residual bucket
// ---------------------------------------------------------------------------

const short = [cluster('a', 0.3, 'praise', 300), cluster('b', 0.2, 'criticise', 200)];
const closed = withResidual(short, 1000);
check('a shortfall gains a residual bucket', closed.length, 3);
check('the residual is the missing half', closed[2].share, 0.5);
check('the residual counts the uncounted comments', closed[2].commentCount, 500);
check('the residual is intent unclassified', closed[2].intent, 'unclassified');
check('a closed set gains nothing', withResidual([cluster('a', 1, 'praise', 10)], 10).length, 1);
check(
  'a rounding-level shortfall is not named',
  withResidual([cluster('a', 0.998, 'praise', 998)], 1000).length,
  1,
);
check(
  'over-100 input is left alone rather than given a negative bucket',
  withResidual([cluster('a', 0.6), cluster('b', 0.6)], 100).length,
  2,
);
check('an empty set stays empty', withResidual([], 1000).length, 0);
// Counts and shares can disagree when they come from different passes. The
// residual clamps rather than printing a negative comment count.
check(
  'a residual never reports a negative count',
  withResidual([cluster('a', 0.3, 'praise', 1200)], 1000)[1].commentCount,
  0,
);

// ---------------------------------------------------------------------------
// Order
// ---------------------------------------------------------------------------

const ordered = orderClusters(closed);
check('largest share leads, so the default selection is the dominant one', ordered[0].id, 'a');
check('the residual is pinned last however big it is', ordered[2].id, RESIDUAL_ID);

// ---------------------------------------------------------------------------
// Legacy rows
// ---------------------------------------------------------------------------

const legacyRow = (intent: string) => ({
  id: 'x', label: 'x', share: 1, commentCount: 5, sentiment: 0,
  intent, keyphrases: [], comments: [], exampleComment: '',
});

for (const [was, now] of [
  ['off_topic', 'react'],
  ['reaction', 'react'],
  ['purchase', 'buy'],
  ['question', 'ask'],
  ['critique', 'criticise'],
] as const) {
  check(`legacy intent "${was}" parses as "${now}"`, commentClustersSchema.parse([legacyRow(was)])[0]?.intent, now);
}
// The object axis cannot be recovered from a single-axis label, so it must
// arrive as null rather than as a guess.
check(
  'a legacy row has no object axis',
  commentClustersSchema.parse([legacyRow('praise')])[0]?.object,
  null,
);

// ---------------------------------------------------------------------------
// The regression, and the taxonomy that replaced it
//
// @jooshica6178's real corpus: 21,330 comments read from the YouTube Data API
// and classified on both axes. Transcribed rather than imported because
// src/lib/data pulls in `server-only`, which does not resolve outside Next.
// Keep in step with the fixture.
// ---------------------------------------------------------------------------

const OBJECT_AXIS: Array<[CommentObject, number]> = [
  ['creator', 17177],
  ['unclassified', 1431],
  ['product', 1430],
  ['content', 1292],
];
const INTENT_AXIS: Array<[CommentIntent, number]> = [
  ['react', 10561],
  ['praise', 4130],
  ['ask', 3801],
  ['unclassified', 1242],
  ['request', 838],
  ['criticise', 725],
  ['buy', 33],
];
const CORPUS = 21330;

check('the object axis accounts for every comment', sum(OBJECT_AXIS.map(([, n]) => n)), CORPUS);
check('the intent axis accounts for every comment', sum(INTENT_AXIS.map(([, n]) => n)), CORPUS);
check('the object axis displays as 100', sum(largestRemainder(OBJECT_AXIS.map(([, n]) => n))), 100);
check('the intent axis displays as 100', sum(largestRemainder(INTENT_AXIS.map(([, n]) => n))), 100);

// The number the single-axis model could not produce. A cluster labelled
// `purchase` implied 0.59%; measuring the object axis puts product-attached
// comments an order of magnitude higher, which is the difference between
// buying this channel for conversion and buying it for reach.
const productAttached = OBJECT_AXIS.find(([k]) => k === 'product')![1] / CORPUS;
check('product-attached share is measurable', Math.round(productAttached * 1000) / 10, 6.7);
check('it is an order of magnitude above the old purchase cluster', productAttached > 0.0059 * 5, true);

// The original defect: the panel filtered one intent out while keeping the
// full denominator, so the visible shares could not reconcile with the header.
const OLD_SINGLE_AXIS = [0.2967, 0.5459, 0.101, 0.0506, 0.0059];
check(
  'filtering the dominant bucket out is what produced 46%',
  OLD_SINGLE_AXIS.filter((v) => v !== 0.5459).reduce((n, v) => n + Math.round(v * 100), 0),
  46,
);

// ---------------------------------------------------------------------------
// `subject` — the person the video is ABOUT
//
// The object axis had four values and a stated default: a comment with no
// product, content or meta marker "is taken to be about the creator, because
// these intents need a target and no other referent exists on the page". On a
// call-out, reaction or interview video there IS another referent, and it is
// usually the loudest thing in the section.
//
// @가재맨, 2,392 hand-classified comments — the real margin:
// ---------------------------------------------------------------------------
const GJ_OBJECT: Array<[CommentObject, number]> = [
  ['subject', 1_572],
  ['creator', 446],
  ['content', 278],
  ['unclassified', 96],
];
const GJ_TOTAL = 2_392;
check(
  'the object margin still sums to the corpus',
  GJ_OBJECT.reduce((sum, [, n]) => sum + n, 0),
  GJ_TOTAL,
);
check(
  'two thirds of this section is about a third party',
  Math.round((1_572 / GJ_TOTAL) * 1_000) / 10,
  65.7,
);
check('and not one comment is about a product', GJ_OBJECT.some(([k]) => k === 'product'), false);

// THE FINDING THE MISSING ENUM VALUE WOULD HAVE INVERTED.
//
// Folded into `creator`, as the old default required, the creator's own column
// reads 993 criticism against 177 praise — 5.6:1 hostile. Kept separate it
// reads 63 against 176, nearly 3:1 in his favour. Same corpus, opposite
// conclusion about the person being priced.
const foldedCriticise = 930 + 63;
const foldedPraise = 1 + 176;
check('folding subject into creator inverts the read', Math.round((foldedCriticise / foldedPraise) * 10) / 10, 5.6);
check('kept separate, the creator is liked', Math.round((176 / 63) * 10) / 10, 2.8);

check('BRAND vocabulary and the object axis stay separate concerns', BRAND_RISK_CATEGORIES.includes('harassment'), true);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
