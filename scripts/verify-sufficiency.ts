/**
 * Assertions for the data-sufficiency model.
 *
 * A creator with forty comments must not receive a confident report — this is
 * the guard that stops the product emitting authoritative-looking noise for the
 * long tail, so the thresholds are pinned.
 *
 *   npm run verify:sufficiency
 */
import { assessReport } from '@/lib/report/sufficiency';
import type { AIReport, PublicOpinion, SponsoredPerformance } from '@/types';

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

const report = (over: Partial<AIReport> = {}): AIReport => ({
  creatorId: 'c1',
  demographics: { ageBands: [], genderSplit: [], topCountries: [], activeAudienceRate: 0 },
  topCommentClusters: [],
  // Classified by default: every assertion below is about VOLUME and COVERAGE,
  // and a corpus with no axes is now a third state that would otherwise fire a
  // gap in all of them. See `unclassified`.
  commentAxes: { object: [], intent: [], cells: [], total: 11_842 },
  sentimentScore: 70,
  purchaseIntentRate: 0.2,
  raisedFlags: 1,
  checkedFlags: 3,
  engagementRate: 0.05,
  adFatigueLevel: 'low',
  aiSummary: '',
  benchmarks: { cohortLabel: 'c', cohortSize: 200, metrics: [] },
  costEfficiency: null,
  sponsoredPerformance: {
    sponsoredPostsAnalyzed: 9,
    windowDays: 180,
    organicMedianViews: 100,
    sponsoredMedianViews: 93,
    viewRetention: 0.93,
    organicSentiment: 79,
    sponsoredSentiment: 77,
  } as SponsoredPerformance,
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
  intent: null,
  platformBreakdown: [],
  outputStats: [],
  coverage: null,
  publicOpinion: {
    corpusNote: null,
    coveredPlatforms: ['YouTube', 'Reddit'],
    windowDays: 90,
    itemsAnalyzed: 800,
  reactionsAnalyzed: null,
  items: [],
    discussionShare: 0.4,
    // Not recorded by this pass — nothing says how many videos the search
    // surfaced, or why these ones. See PublicOpinion.selection.
    selection: null,
    sources: [],
    themes: [],
    controversies: [],
    summary: '',
  } as PublicOpinion,
  modelVersion: null,
  commentsAnalyzed: 11_842,
  lastAnalyzedAt: null,
  ...over,
});

check('established creator is sufficient', assessReport(report()).overall, 'sufficient');

check(
  '40 comments is insufficient',
  assessReport(report({ commentsAnalyzed: 40 })).overall,
  'insufficient',
);
check(
  '250 comments is limited',
  assessReport(report({ commentsAnalyzed: 250 })).overall,
  'limited',
);
check(
  '400 comments clears the bar',
  assessReport(report({ commentsAnalyzed: 400 })).overall,
  'sufficient',
);

// A brand-new creator: plenty of comments, but nothing to compare against.
check(
  'no sponsored history and no cohort caps at limited',
  assessReport(
    report({
      sponsoredPerformance: null,
      benchmarks: { cohortLabel: 'c', cohortSize: 4, metrics: [] },
    }),
  ).overall,
  'limited',
);

check(
  'no sponsored history alone does not cap a benchmarked creator',
  assessReport(report({ sponsoredPerformance: null })).overall,
  'sufficient',
);

// The dimension is still assessed — flipping the feature back must not
// require re-deriving how it was measured.
check(
  'a tiny cohort is still classed insufficient',
  assessReport(report({ benchmarks: { cohortLabel: 'c', cohortSize: 8, metrics: [] } }))
    .benchmarks,
  'insufficient',
);

check(
  'missing opinion data is flagged',
  assessReport(report({ publicOpinion: null })).opinion,
  'insufficient',
);

// Zero comments is a different state from a thin corpus: every qualitative
// score is unavailable rather than shaky.
const none = assessReport(report({ commentsAnalyzed: 0 }));
check('zero comments flags noComments', none.noComments, true);
check('zero comments is insufficient', none.overall, 'insufficient');
check(
  'the reason is named when known',
  assessReport(
    report({
      commentsAnalyzed: 0,
      coverage: { postsAnalyzed: 18, postsWithComments: 0, reason: 'disabled' },
    }),
  ).gaps[0],
  'The creator has comments turned off, so nothing here is measurable from them.',
);
check(
  'partial coverage is flagged as skew, not volume',
  assessReport(
    report({
      commentsAnalyzed: 5_000,
      coverage: { postsAnalyzed: 40, postsWithComments: 3, reason: null },
    }),
  ).gaps.some((g) => g.includes('skewed')),
  true,
);
check(
  'full coverage raises no skew gap',
  assessReport(
    report({ coverage: { postsAnalyzed: 40, postsWithComments: 40, reason: null } }),
  ).gaps.length,
  0,
);

// ---------------------------------------------------------------------------
// Read, but not classified
//
// A third fact the UI had only two words for. @가재맨 carries 2,392 comments
// and no axes — the risk census ran and the classifier did not — and every
// surface that checked "are there clusters" concluded "there are no comments",
// so the profile printed "No readable comments on the analysed posts" directly
// beneath "2,392 comments analysed".
// ---------------------------------------------------------------------------
const unread = assessReport(report({ commentsAnalyzed: 2_392, commentAxes: null }));
check('a read but unclassified corpus is not empty', unread.noComments, false);
check('and it is named as its own state', unread.unclassified, true);
check(
  'the gap says which pass is missing',
  unread.gaps.some((g) => g.includes('read but not classified')),
  true,
);
check(
  'and says it is not a missing audience',
  unread.gaps.some((g) => g.includes('not a missing audience')),
  true,
);
// The two real states stay distinguishable from it and from each other.
check(
  'an empty corpus is still empty',
  assessReport(report({ commentsAnalyzed: 0, commentAxes: null })).unclassified,
  false,
);
check(
  'and a classified one is neither',
  assessReport(report({})).unclassified,
  false,
);

const thin = assessReport(
  report({ commentsAnalyzed: 62, sponsoredPerformance: null, publicOpinion: null, benchmarks: null }),
);
// Three, not four: the cohort gap is suppressed while cross-creator ranking
// is switched off. Reporting "the cohort is too small" would blame the data
// for a policy decision, and a reader would reasonably wait for a ranking that
// is never coming.
check('a thin report lists every gap that still applies', thin.gaps.length, 3);
check(
  'and the cohort is not one of them',
  thin.gaps.some((g) => g.includes('cohort')),
  false,
);
check('a thin report is insufficient', thin.overall, 'insufficient');

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
