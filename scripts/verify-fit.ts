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
import { FIT_METRICS, FIT_SCHEMA, fitOutputSchema } from '@/lib/report/fit-schema';
import { deriveCostEfficiency } from '@/lib/report/cost';
import { sponsorshipState } from '@/lib/report/sponsorship';

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

// ---------------------------------------------------------------------------
// The output contract exists twice, so it has to be checked twice
//
// zod VALIDATES what the model returned; plain JSON Schema is what the model
// was SENT. Both providers take JSON Schema on the request and neither takes
// zod, so the duplication is real — and the enum is what stops an invented
// figure name from rendering as a checkable citation. If the two drift, the
// model is told one set of metric names and judged against another.
// ---------------------------------------------------------------------------
{
  const props = (FIT_SCHEMA.properties ?? {}) as Record<string, { type?: string }>;
  check('the request schema names both fields', Object.keys(props).sort(), ['claims', 'summary']);

  const claims = (props.claims ?? {}) as { items?: { properties?: Record<string, { enum?: string[] }> } };
  const sent = claims.items?.properties?.metric?.enum ?? [];
  check('the enum sent matches the enum declared', [...sent], [...FIT_METRICS]);

  // And zod agrees with both — parsed, not assumed.
  const good = fitOutputSchema.safeParse({
    summary: 'x',
    claims: [{ text: 'y', metric: FIT_METRICS[0], value: 1 }],
  });
  check('a claim citing a declared metric parses', good.success, true);
  const bad = fitOutputSchema.safeParse({
    summary: 'x',
    claims: [{ text: 'y', metric: 'inventedFigure', value: 1 }],
  });
  check('a claim citing an invented figure is refused', bad.success, false);
}

// ---------------------------------------------------------------------------
// Cost per thousand, from the price the creator published
//
// `cost_efficiency` was the fourth column here with a type, a schema, a mapper
// and a locked panel and no producer — and the panel blamed the creator's
// catalogue for it: "Not enough view history yet to derive a CPM", on a channel
// with 667 uploads and a 6,614-view median.
// ---------------------------------------------------------------------------
{
  const cost = deriveCostEfficiency({
    budgetMin: 15_000,
    budgetMax: 15_000,
    medianViews: 6_614,
    engagementRate: 0.05,
  });
  check('a CPM is derivable from a price and a median', cost !== null, true);
  check('CPM is budget over thousands of views', cost?.estimatedCpm, 2267.92);
  check('engaged CPM divides by the engagement rate', cost?.costPerThousandEngaged, 45358.33);
  check('the basis is stated', cost?.basisBudget, 15_000);

  // The floor of a range, not the ceiling: a CPM off the top describes the
  // most expensive version of a creator, and the floor is the figure they are
  // certain about.
  check(
    'a range prices off its low end',
    deriveCostEfficiency({ budgetMin: 15_000, budgetMax: 25_000, medianViews: 1_000, engagementRate: null })
      ?.basisBudget,
    15_000,
  );

  // Null, never zero. An unpriced creator is not a free one, and a CPM with no
  // denominator is not a CPM of nothing.
  check(
    'no price yields no CPM',
    deriveCostEfficiency({ budgetMin: null, budgetMax: null, medianViews: 6_614, engagementRate: 0.05 }),
    null,
  );
  check(
    'no views yields no CPM',
    deriveCostEfficiency({ budgetMin: 15_000, budgetMax: null, medianViews: 0, engagementRate: 0.05 }),
    null,
  );
  // A cohort of one is not a cohort.
  check('no benchmark is invented', [cost?.cohortMedianCpm, cost?.cohortMedianRetention], [null, null]);
}

// ---------------------------------------------------------------------------
// Sponsored, not measurable, never — three states, and the middle one existed
// nowhere
//
// "No sponsorship history — the audience has not been sold to here" printed on
// a channel with 25 disclosed paid placements, because every upload in the
// window carried one and there was no organic post left to measure against.
// `sponsoredPerformance` came back null and null was read as "never".
// ---------------------------------------------------------------------------
{
  const perf = {
    sponsoredPostsAnalyzed: 3, windowDays: 180, organicMedianViews: 100,
    sponsoredMedianViews: 80, viewRetention: 0.8,
    organicSentiment: null, sponsoredSentiment: null,
  };
  check('measured when there is a figure', sponsorshipState(perf, 3), 'measured');
  check('never when nothing was found', sponsorshipState(null, 0), 'never');
  // The one that was missing.
  check('found but unmeasurable is its own state', sponsorshipState(null, 25), 'unmeasurable');
  check('one placement is enough to stop saying never', sponsorshipState(null, 1), 'unmeasurable');
  // A figure wins over the count: if it could be measured, it was measured.
  check('a measurement outranks the count', sponsorshipState(perf, 0), 'measured');
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
