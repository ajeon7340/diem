/**
 * Assertions for the fit-summary guardrails.
 *
 * This is the only place in the report where a sentence can assert something
 * the data does not support, so the refusal rule and the claim check are
 * pinned here rather than trusted to a prompt. A prompt is a request; these
 * are the rules, and they run whether or not the model cooperates.
 *
 *   npm run verify:fit
 */
import {
  assessFitEligibility,
  isStale,
  resolveMetric,
  verifyClaims,
  type FitClaim,
} from '@/lib/report/fit';
import type { AIReport, IntentMeasurement } from '@/types';

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

// Built here rather than imported: fixtures.ts is `server-only`, and the other
// verify suites construct their own for the same reason.
const intent = (over: Partial<IntentMeasurement> = {}): IntentMeasurement => ({
  rate: 0.281,
  ciLow: 0.273,
  ciHigh: 0.2892,
  basis: 'product_comments',
  commercialDensity: 0.015,
  commentsScored: 11_842,
  postsScored: 40,
  productPostsAnalyzed: 9,
  dispersion: null,
  rubricVersion: 'intent-rubric-1',
  ...over,
});

const report = (over: Partial<AIReport> = {}): AIReport => ({
  creatorId: 'c1',
  demographics: null,
  topCommentClusters: [],
  commentAxes: null,
  coverage: null,
  sentimentScore: 78.4,
  purchaseIntentRate: 0.281,
  raisedFlags: 1,
  checkedFlags: 3,
  engagementRate: 0.062,
  adFatigueLevel: 'low',
  aiSummary: '',
  benchmarks: { cohortLabel: 'c', cohortSize: 200, metrics: [] },
  costEfficiency: null,
  sponsoredPerformance: null,
  // No risk scan yet — empty means "not scanned", never "clean".
  commentRisks: [],
  moderation: null,
  commentRegister: null,
  climate: {
    label: null,
    traits: [],
    summary: '',
    basis: {
      hostileShare: null,
      scanned: null,
      criticiseShare: null,
      praiseShare: null,
      praiseRatio: null,
      classified: null,
    },
    rubricVersion: 'climate-rubric-1',
  },
  brandSafetyFlags: [],
  brandSafety: {
    raised: 0,
    checked: 2,
    worst: 'none',
    rubricVersion: 'safety-rubric-1',
  },
  recommendedActions: [],
  promotions: [],
  intent: intent(),
  platformBreakdown: [],
  publicOpinion: null,
  outputStats: [],
  modelVersion: null,
  commentsAnalyzed: 11_842,
  lastAnalyzedAt: '2026-09-10T00:00:00.000Z',
  ...over,
});

const deepReport = report();
const thin = report({ commentsAnalyzed: 121 });
const silent = report({
  commentsAnalyzed: 0,
  purchaseIntentRate: null,
  sentimentScore: null,
  raisedFlags: 1,
  checkedFlags: 3,
  intent: null,
  coverage: { postsAnalyzed: 18, postsWithComments: 0, reason: 'disabled' },
});

// ---------------------------------------------------------------------------
// It refuses rather than hedges
// ---------------------------------------------------------------------------

const deepEligible = assessFitEligibility(deepReport, true);
check('a deep corpus earns a summary', deepEligible.ok, true);
check(
  'and it is not caveated',
  deepEligible.ok ? deepEligible.confidence : null,
  'sufficient',
);

// 121 comments: enough to say something, not enough to say it plainly.
const thinEligible = assessFitEligibility(thin, true);
check('a thin corpus still earns one', thinEligible.ok, true);
check(
  'but it is marked limited',
  thinEligible.ok ? thinEligible.confidence : null,
  'limited',
);

// Comments disabled. Every claim about commercial fit rests on the corpus, so
// there is no paragraph — not a careful paragraph.
const silentEligible = assessFitEligibility(silent, true);
check('no comments means no summary', silentEligible.ok, false);
check(
  'an absent corpus is not a thin one',
  !silentEligible.ok ? silentEligible.reason : null,
  'no_comments',
);
// Comments turned off is the creator's choice. Telling a buyer the sample is
// "too thin" would report that choice as a weakness of their audience.
check(
  'and the refusal says comments are off, not that the sample is thin',
  !silentEligible.ok ? silentEligible.message.includes('comments turned off') : null,
  true,
);
check(
  'an unexplained empty corpus still refuses cleanly',
  (() => {
    const e = assessFitEligibility(report({ commentsAnalyzed: 0, coverage: null }), true);
    return !e.ok ? e.reason : null;
  })(),
  'no_comments',
);

// A 40-comment corpus: below the bar the four-way split stops meaning anything.
const tiny = report({ commentsAnalyzed: 40 });
check('40 comments is refused', assessFitEligibility(tiny, true).ok, false);
check(
  'but 40 comments is thin, not absent',
  (() => {
    const e = assessFitEligibility(tiny, true);
    return !e.ok ? e.reason : null;
  })(),
  'insufficient',
);

check('no report means nothing to summarise', assessFitEligibility(null, true).ok, false);
check(
  'and no organisation means there is no second input',
  !assessFitEligibility(deepReport, false).ok
    ? (assessFitEligibility(deepReport, false) as { reason: string }).reason
    : null,
  'no_audience',
);

// The audience check comes first: without a buyer there is no fit question to
// ask, however good the report is.
check(
  'a missing organisation outranks a missing report',
  !assessFitEligibility(null, false).ok
    ? (assessFitEligibility(null, false) as { reason: string }).reason
    : null,
  'no_audience',
);

// ---------------------------------------------------------------------------
// Every claim carries its figure, and the figure is checked
// ---------------------------------------------------------------------------

const subject = deepReport;
const trueRate = resolveMetric(subject, 'purchaseIntentRate')!;

const grounded: FitClaim = {
  text: 'Roughly a quarter of the product conversation is people trying to buy.',
  metric: 'purchaseIntentRate',
  value: trueRate,
};
const drifted: FitClaim = {
  text: 'Nearly half the comment section is buying.',
  metric: 'purchaseIntentRate',
  value: trueRate + 0.2,
};
const rounded: FitClaim = {
  text: 'Intent sits just under the figure quoted above.',
  metric: 'purchaseIntentRate',
  value: trueRate - 0.0001,
};

check('a grounded claim survives', verifyClaims([grounded], subject).length, 1);
check('a drifted claim is dropped', verifyClaims([drifted], subject).length, 0);
check('rounding is not drift', verifyClaims([rounded], subject).length, 1);
check(
  'the fluent sentence does not save the wrong number',
  verifyClaims([grounded, drifted, rounded], subject).map((c) => c.value),
  [grounded.value, rounded.value],
);

// A metric that has since become unmeasured cannot support a sentence written
// when it was measured. Same rule as everywhere else: null is not a value.
const wentNull: AIReport = report({ raisedFlags: null });
check(
  'a claim on a now-unmeasured figure is dropped',
  verifyClaims(
    [{ text: 'Brand safety is high.', metric: 'raisedFlags', value: 94.1 }],
    wentNull,
  ).length,
  0,
);

// Nested metrics resolve through their blocks, and absence propagates.
check(
  'the intent bound resolves through the measurement',
  resolveMetric(subject, 'purchaseIntentFloor') !== null,
  true,
);
check(
  'a missing cost block yields null, not zero',
  resolveMetric(report({ costEfficiency: null }), 'estimatedCpm'),
  null,
);

// ---------------------------------------------------------------------------
// Staleness
// ---------------------------------------------------------------------------

check(
  'a summary older than the report it describes is stale',
  isStale(
    { reportAnalyzedAt: '2026-08-01T00:00:00.000Z' },
    report({ lastAnalyzedAt: '2026-09-10T00:00:00.000Z' }),
  ),
  true,
);
check(
  'a current summary is not',
  isStale(
    { reportAnalyzedAt: '2026-09-10T00:00:00.000Z' },
    report({ lastAnalyzedAt: '2026-09-10T00:00:00.000Z' }),
  ),
  false,
);
check(
  'an unstamped summary makes no staleness claim either way',
  isStale({ reportAnalyzedAt: null }, subject),
  false,
);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
