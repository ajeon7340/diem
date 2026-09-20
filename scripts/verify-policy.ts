/**
 * Assertions for the YouTube API policy gates.
 *
 * These are not preferences. Each one answers a clause in the YouTube API
 * Services Developer Policies, and flipping any of them by accident puts the
 * product out of policy without anything visibly breaking — which is exactly
 * the failure mode a test suite exists to prevent.
 *
 *   npm run verify:policy
 */
import { readFileSync } from 'node:fs';

import {
  AMENDMENT_ACCEPTED,
  BENCHMARKS_FROM_API_DATA,
  stripCrossOwnerAggregates,
  DERIVED_DISCLOSURE,
  FINANCIAL_DISCLOSURE,
  RETENTION_DAYS,
  isPastRetention,
  refreshDueAt,
  retentionDays,
  withinRetention,
  API_DERIVED_COLUMNS,
} from '@/lib/report/policy';

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

const DAY = 86_400_000;

// ---------------------------------------------------------------------------
// III.E.2 — cross-owner aggregation
// ---------------------------------------------------------------------------

// "The API Client must not combine API Data from the different content
// owners." A category cohort of 200 creators is 200 content owners, and the
// derived-metrics amendment does not cover aggregation. Turning this on while
// the cohort is built from API Data is a policy breach, not a feature flag.
check('cohort benchmarks stay off while built from API Data', BENCHMARKS_FROM_API_DATA, false);

// The cohort percentile is the obvious cross-owner figure. The cohort MEDIANS
// on costEfficiency are the same aggregation under a different name, and were
// missed on the first pass for exactly that reason — so they are pinned here.
const withCohorts = {
  benchmarks: { cohortLabel: 'Consumer Tech', cohortSize: 200, metrics: [] },
  costEfficiency: {
    currency: 'USD',
    basisBudget: 18_000,
    medianViews: 184_000,
    estimatedCpm: 97.83,
    costPerThousandEngaged: 1_578,
    cohortMedianCpm: 104.2,
    cohortMedianRetention: 0.84,
  },
};
const stripped = stripCrossOwnerAggregates(withCohorts);

check('the cohort ranking is withheld', stripped.benchmarks, null);
check('the cohort median CPM is withheld', stripped.costEfficiency!.cohortMedianCpm, null);
check(
  'the cohort median retention is withheld',
  stripped.costEfficiency!.cohortMedianRetention,
  null,
);
// The creator's own figures are not an aggregation across owners and stay.
check(
  'the creator’s own CPM survives',
  stripped.costEfficiency!.estimatedCpm,
  withCohorts.costEfficiency.estimatedCpm,
);
check(
  'a creator with no cost block stays null rather than becoming an object',
  stripCrossOwnerAggregates({ benchmarks: null, costEfficiency: null }).costEfficiency,
  null,
);

// ---------------------------------------------------------------------------
// III.E.4.c / III.E.4.d — retention
// ---------------------------------------------------------------------------

check('the base horizon is 30 days', RETENTION_DAYS.base, 30);
check('the amended horizon is 36 months', RETENTION_DAYS.amended, 36 * 30);
check(
  'the active horizon follows the paperwork',
  retentionDays(),
  AMENDMENT_ACCEPTED ? RETENTION_DAYS.amended : RETENTION_DAYS.base,
);

const fetched = new Date(Date.UTC(2026, 0, 1)).toISOString();
check(
  'a due date is the fetch date plus the horizon',
  refreshDueAt(fetched),
  new Date(Date.UTC(2026, 0, 1) + retentionDays() * DAY).toISOString(),
);

// Null in, null out. A row with no recorded fetch has no deadline we can
// compute, and inventing one is worse than saying we cannot.
check('no fetch date means no due date', refreshDueAt(null), null);
check('an unparseable fetch date means no due date', refreshDueAt('not a date'), null);

const now = Date.UTC(2026, 5, 1);
check(
  'a row past its horizon is flagged',
  isPastRetention(new Date(now - DAY).toISOString(), now),
  true,
);
check(
  'a row inside it is not',
  isPastRetention(new Date(now + DAY).toISOString(), now),
  false,
);

// Missing bookkeeping is not a breach. Treating an unstamped row as expired
// would blank every report written before the column existed, on the strength
// of a date nobody recorded.
check('an unstamped row is not treated as expired', isPastRetention(null, now), false);

// ---------------------------------------------------------------------------
// The read-path defence — the job may not have run
// ---------------------------------------------------------------------------

const corpus = {
  topCommentClusters: [{}, {}],
  commentAxes: { total: 21_330 },
  coverage: { postsAnalyzed: 40, postsWithComments: 40, reason: null },
  publicOpinion: { itemsAnalyzed: 80 },
  promotions: [{}],
  platformBreakdown: [{}],
  outputStats: [{}],
  brandSafetyFlags: [{}],
  sentimentScore: 78.4,
  purchaseIntentRate: 0.281,
  raisedFlags: 1,
  checkedFlags: 3,
  engagementRate: 0.062,
  intent: { rate: 0.281 },
  commentsAnalyzed: 11_842,
};

const fresh = withinRetention(corpus, new Date(now + 30 * DAY).toISOString(), now);
check('a row inside its horizon is served whole', fresh.commentsAnalyzed, 11_842);
check('with its clusters intact', fresh.topCommentClusters.length, 2);

const stale = withinRetention(corpus, new Date(now - DAY).toISOString(), now);
check('an expired row serves no comment corpus', stale.topCommentClusters, []);
check('no axes', stale.commentAxes, null);
check('no off-platform excerpts', stale.publicOpinion, null);
check('no promotions', stale.promotions, []);
check('no derived scores', [stale.purchaseIntentRate, stale.raisedFlags], [null, null]);
check('and the denominator goes with them', stale.commentsAnalyzed, 0);

// Blanked, never zeroed into a rating — the same rule as migration 0009. A
// creator whose corpus aged out must not read as one whose audience is toxic.
check('an expired score is null, not a low rating', stale.sentimentScore, null);

// An unstamped row is served. Treating missing bookkeeping as a breach would
// blank every report written before the column existed.
check('an unstamped row is served whole', withinRetention(corpus, null, now).commentsAnalyzed, 11_842);

// The inventory the job and this gate share. demographics must never be on it:
// III.E.4.b permits keeping Analytics data past 30 days.
check(
  'demographics are not on the purge inventory',
  API_DERIVED_COLUMNS.includes('demographics' as never),
  false,
);
check('the comment corpus is', API_DERIVED_COLUMNS.includes('top_comment_clusters'), true);
check('and so are the derived scores', API_DERIVED_COLUMNS.includes('purchase_intent_rate'), true);

// ---------------------------------------------------------------------------
// III.E.4.h — the disclosure that rides with derived metrics
// ---------------------------------------------------------------------------

// "...must include a clear and prominent disclosure there that such
// information, data and metrics are not from YouTube and are part of your own
// product."
check(
  'the derived disclosure says the figures are not YouTube’s',
  /not YouTube figures/i.test(DERIVED_DISCLOSURE),
  true,
);
check(
  'and names them as ours',
  /adfit/i.test(DERIVED_DISCLOSURE),
  true,
);
// The amendment adds that financial projections must say they are not approved
// by Google.
check(
  'the financial disclosure disclaims Google approval',
  /not approved by Google/i.test(FINANCIAL_DISCLOSURE),
  true,
);

// ---------------------------------------------------------------------------
// The amendment's conditions are load-bearing, so they are structural tests
//
// Accepting the derived-metrics amendment is what makes purchase intent,
// sentiment and brand safety permitted at all, and it came with two
// obligations. A constant that exists but is never rendered satisfies neither,
// and deleting the JSX would break the permission without breaking a test —
// so the render sites themselves are asserted.
// ---------------------------------------------------------------------------

const reads = (path: string) => readFileSync(path, 'utf8');

// Both moved to the comparison table when the creator media kit was removed:
// that is now the only surface rendering a derived metric or a CPM.
check(
  'the derived disclosure is rendered beside the metrics it describes',
  reads('src/components/campaign/ComparisonTable.tsx').includes('{DERIVED_DISCLOSURE}'),
  true,
);
check(
  'comparison shows no derived CPM requiring a financial disclaimer',
  /cpmFromFee|row\.cpm/.test(reads('src/components/campaign/ComparisonTable.tsx')),
  false,
);
// And it must not describe a figure we no longer have. The old wording said
// the CPM came from "the creator's published minimum" — a creator-declared
// budget field that went with the creator table. A disclosure that misstates
// its own basis is worse than none: it is a specific false claim about where
// a number came from.
check(
  'the financial disclaimer names the real basis',
  FINANCIAL_DISCLOSURE.includes('a fee you entered'),
  true,
);
check(
  'and no longer cites a creator-published minimum',
  FINANCIAL_DISCLOSURE.includes('published minimum'),
  false,
);

// The amendment forbids using derived metrics to profile users on protected
// attributes — age is named explicitly. Demographics are API Data passed
// through, not a derived metric, and nothing computes a score per age band.
// This pins that: a metric keyed by a demographic segment would be the breach.
check(
  'no metric is derived per demographic segment',
  /ageBands|genderSplit/.test(reads('src/lib/report/intent.ts') + reads('src/lib/report/safety.ts')),
  false,
);

// ---------------------------------------------------------------------------
// A standing reminder, not a test of code
// ---------------------------------------------------------------------------

if (!AMENDMENT_ACCEPTED) {
  console.log(
    '\n  NOTE  AMENDMENT_ACCEPTED is false. Purchase intent, sentiment, brand safety and the\n' +
      '        comment clusters are all derived from API Data, which III.E.4.h(ii) forbids\n' +
      '        outright. Accept the amendment at\n' +
      '        developers.google.com/youtube/terms/derived-metrics-policy\n' +
      '        (Section 5 → Use Cases → "Analytics & Reporting"), then flip the flag.',
  );
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
