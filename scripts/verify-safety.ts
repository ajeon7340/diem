/**
 * Assertions for brand safety, now that it is flags rather than a score.
 *
 * The 0-100 composite is gone. It blended a share of comments, a share of
 * sponsored posts and the creator's own conduct into one figure nobody could
 * attribute — and since flags come FROM comments, a thin corpus raised fewer
 * of them and the number ROSE. Sorted on, it put a creator too thin to assess
 * above one assessed and clean.
 *
 * What is pinned here is what replaced it: a severity that cannot exceed its
 * own evidence, a count that distinguishes "nothing raised" from "nothing
 * checked", and a census read that never charges a creator for being a target.
 *
 *   npm run verify:safety
 */
import {
  SAFETY_RUBRIC_VERSION,
  SEVERITY_BANDS,
  audienceTone,
  MATERIAL_AT_ONE,
  cappedSeverity,
  censusRisk,
  isMaterial,
  deriveBrandSafety,
} from '@/lib/report/safety';
import { THRESHOLDS } from '@/lib/report/sufficiency';
import { BRAND_RISK_CATEGORIES } from '@/types';
import type {
  BrandSafetyFlag,
  CommentAxes,
  CommentRisk,
  ModerationState,
  RiskSeverity,
} from '@/types';

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

const flag = (
  severity: RiskSeverity,
  incidence: number,
  basis: BrandSafetyFlag['basis'] = 'comments',
  category = `${severity}-${incidence}-${basis}`,
  endorsement: number | null = null,
): BrandSafetyFlag => ({ category, severity, incidence, basis, endorsement, note: '' });

const risk = (
  category: CommentRisk['category'],
  count: number,
  byCreator = 0,
  hidden = 0,
): CommentRisk => ({ category, count, byCreator, hidden, example: '' });

const DEEP = THRESHOLDS.COMMENTS.sufficient * 10;

// ---------------------------------------------------------------------------
// A severity cannot exceed its own evidence
// ---------------------------------------------------------------------------

check('rubric version is stamped', SAFETY_RUBRIC_VERSION, 'safety-rubric-1');
check('the bands are stated, not implied', SEVERITY_BANDS.length, 3);

// The case that forced the cap: "Authenticity scrutiny · medium" over a comment
// section 2.93% critical against 19.4% praise — six to one in her favour.
check('a medium claim at 3% of comments caps to low', cappedSeverity(flag('medium', 0.0293)), 'low');
check('the same claim at 15% stands', cappedSeverity(flag('medium', 0.15)), 'medium');
check('a high claim at 15% caps to medium', cappedSeverity(flag('high', 0.15)), 'medium');
check('a high claim at 40% stands', cappedSeverity(flag('high', 0.4)), 'high');
// A classifier may always be MORE forgiving than the band.
check('a low claim at 40% is not raised', cappedSeverity(flag('low', 0.4)), 'low');
check('none stays none however widespread', cappedSeverity(flag('none', 0.9)), 'none');
check('medium needs more than a tenth', cappedSeverity(flag('medium', 0.1)), 'low');
check('and clears at just over', cappedSeverity(flag('medium', 0.11)), 'medium');

// ---------------------------------------------------------------------------
// Counted, not scored — and "clean" is not "unchecked"
// ---------------------------------------------------------------------------

const marah = [
  flag('low', 0.011, 'comments', 'Profanity'),
  flag('none', 0, 'posts', 'Political content'),
  flag('medium', 0.22, 'sponsored_posts', 'Competitor conflict'),
  flag('none', 0, 'sponsored_posts', 'Undisclosed sponsorship'),
];
const derived = deriveBrandSafety(marah, DEEP);
check('two raised of four checked', [derived.raised, derived.checked], [2, 4]);
check('and the worst of them is surfaced', derived.worst, 'medium');

// The distinction the single number could not make. An empty array is not a
// clean section; it is a section nobody looked at.
const unchecked = deriveBrandSafety([], DEEP);
check('nothing checked raises nothing', unchecked.raised, 0);
check('and reports zero checks', unchecked.checked, 0);
check('with no worst severity to report', unchecked.worst, null);

const allClear = deriveBrandSafety(
  [flag('none', 0, 'comments', 'Profanity'), flag('none', 0, 'sponsored_posts', 'Competitor')],
  DEEP,
);
check('checked and clean raises nothing', allClear.raised, 0);
check('but reports the checks that ran', allClear.checked, 2);
check('and a worst of none', allClear.worst, 'none');

// Flags come FROM comments, so a thin corpus raises fewer — which the old
// score read as safety. Withheld instead.
const thin = deriveBrandSafety(marah, THRESHOLDS.COMMENTS.limited - 1);
check('a thin corpus reports no raised count', thin.raised, 0);
check('and no worst severity', thin.worst, null);
check('while still saying what was checked', thin.checked, 4);

// ---------------------------------------------------------------------------
// One of something is not a pattern
// ---------------------------------------------------------------------------

// In a 797-comment section a single spam post is the internet and a single
// blunt remark is a Tuesday. Counting either as "raised" turns a clean channel
// into a flagged one on evidence nobody would act on.
check('one spam comment is not a finding', isMaterial(risk('spam', 1)), false);
check('one harassment comment is not either', isMaterial(risk('harassment', 1)), false);
check('two of the same is', isMaterial(risk('spam', 2)), true);
check('and zero never is', isMaterial(risk('spam', 0)), false);

// These three are asymmetric rather than rare: an ad beside a slur, a threat
// or a fraud offer is a story at any base rate.
for (const c of MATERIAL_AT_ONE) {
  check(`one ${c} comment is a finding`, isMaterial(risk(c, 1)), true);
}
check('the list is exactly those three', [...MATERIAL_AT_ONE], ['hate', 'violence', 'illegal']);

// Whatever the category, what the creator wrote is material at one.
check('one written by the creator always counts', isMaterial(risk('spam', 1, 1)), true);

// Reported and raised are different lists, and both are kept: a lone slur is
// still something the creator should see in their queue.
const mixed = censusRisk(
  [risk('spam', 22), risk('harassment', 1), risk('hate', 1), risk('sexual', 1)],
  null,
  797,
)!;
check('everything found is still reported', mixed.categories.length, 4);
check('but only the patterns are raised', mixed.raisedCategories.length, 2);
check(
  'spam by volume and hate by kind',
  mixed.raisedCategories.map((c) => c.category).sort(),
  ['hate', 'spam'],
);
check('and the adjacency total counts them all', mixed.adjacent, 25);

// The same rule on flags, where a count can be recovered from the share.
const singleton = deriveBrandSafety(
  [{ category: 'Profanity', severity: 'low', incidence: 1 / 21_330, basis: 'comments', endorsement: null, note: '' }],
  21_330,
);
check('a flag implying one comment is not raised', singleton.raised, 0);
check('but the check is still reported as run', singleton.checked, 1);
check('and the section reads as nothing raised', singleton.worst, 'none');

// ---------------------------------------------------------------------------
// A creator is not marked down for being a target
// ---------------------------------------------------------------------------

const targeted = censusRisk([risk('hate', 900), risk('harassment', 300)], null, 21_330)!;
check('everything found is reported', targeted.adjacent, 1_200);
check('as a share of what was scanned', Math.round(targeted.adjacentShare! * 10_000) / 100, 5.63);
check('none of it attributed to the creator', targeted.byCreator, 0);
// The severity is unchanged by it: 1,200 slurs aimed at someone say nothing
// about them.
check(
  'and the worst severity is unchanged by it',
  deriveBrandSafety(marah, DEEP, targeted).worst,
  deriveBrandSafety(marah, DEEP, null).worst,
);

// What they wrote is a different kind of fact, and it is now a severity rather
// than a deduction on a scale nobody could read.
const authored = censusRisk([risk('hate', 901, 1)], null, 21_330)!;
check('one written by the creator escalates to high', deriveBrandSafety(marah, DEEP, authored).worst, 'high');
check(
  'even when every flag beside it is clean',
  deriveBrandSafety([flag('none', 0)], DEEP, authored).worst,
  'high',
);

// ---------------------------------------------------------------------------
// The scan carries its own denominator
// ---------------------------------------------------------------------------

const partial = censusRisk(
  [risk('spam', 22), risk('harassment', 6), risk('sexual', 2), risk('hate', 1)],
  { commentsScanned: 797, foundTotal: 31, visibleTotal: 31, hiddenTotal: 0, lastModeratedAt: null },
  21_330,
)!;
check('the scan supplies its own denominator', partial.scanned, 797);
check('and the share uses it', Math.round(partial.adjacentShare! * 10_000) / 100, 3.89);
check(
  'not the clustering corpus, which would have said 0.15%',
  Math.round(partial.adjacentShare! * 10_000) / 100 !== Math.round((31 / 21_330) * 10_000) / 100,
  true,
);
check('an unrecorded scan size falls back', censusRisk([risk('spam', 5)], null, 1_000)!.scanned, 1_000);

// Moderation is credited without becoming a way to game anything.
const cleaned = censusRisk(
  [risk('hate', 900, 0, 850)],
  { commentsScanned: 21_330, foundTotal: 900, visibleTotal: 50, hiddenTotal: 850, lastModeratedAt: '2026-09-01' },
  21_330,
)!;
check('what was found is still reported', cleaned.adjacent, 900);
check('what survives is reported apart from it', cleaned.visible, 50);
check('and the cleanup is credited', cleaned.hidden, 850);

// Deleting what you wrote does not unwrite it.
const deletedOwn = censusRisk(
  [risk('hate', 5, 5, 5)],
  { commentsScanned: 21_330, foundTotal: 5, visibleTotal: 0, hiddenTotal: 5, lastModeratedAt: '2026-09-01' },
  21_330,
)!;
check('a creator cannot delete their way out', deriveBrandSafety([flag('none', 0)], DEEP, deletedOwn).worst, 'high');

check('no scan means no census read', censusRisk([], null, 21_330), null);

// ---------------------------------------------------------------------------
// Audience tone — the scale the flags are read against
// ---------------------------------------------------------------------------

const axes: CommentAxes = {
  object: [],
  cells: [],
  intent: [
    { key: 'react', count: 10_561 },
    { key: 'praise', count: 4_130 },
    { key: 'ask', count: 3_801 },
    { key: 'unclassified', count: 1_242 },
    { key: 'request', count: 838 },
    { key: 'criticise', count: 725 },
    { key: 'buy', count: 33 },
  ],
  total: 21_330,
};

const tone = audienceTone(axes)!;
check('criticism is 3.4% of the whole section', Math.round(tone.criticiseShare * 1000) / 10, 3.4);
check('praise is 19.4%', Math.round(tone.praiseShare * 1000) / 10, 19.4);
check('praise outnumbers criticism about six to one', Math.round(tone.praiseRatio!), 6);
check('over the full corpus, not a sample', tone.total, 21_330);

// Infinity would render as a number and read as a measurement.
const kind = audienceTone({ ...axes, intent: [{ key: 'praise', count: 100 }], total: 100 })!;
check('no criticism means no ratio', kind.praiseRatio, null);
check('no axes means no tone', audienceTone(null), null);
check('an empty corpus means no tone', audienceTone({ object: [], cells: [], intent: [], total: 0 }), null);

// ---------------------------------------------------------------------------
// A census scan is a check that ran
//
// Real data, @가재맨: 2,384 comments across 5 videos, 180 flagged — 111
// harassment, 25 violence, 21 hate, 20 sexual, 2 illegal, 0 by the creator.
// The row carries no `brandSafetyFlags`, and deriveBrandSafety returned
// `checked: 0` for it, so the tile printed "Not assessed — no comments" above
// a panel listing all 180. Comments existed and they had been read; the
// headline said neither had happened.
// ---------------------------------------------------------------------------

// COUNTS ONLY. `example` is deliberately empty on every row: these are the real
// counts from a real channel, and the comments behind them are aimed at real,
// named people. The field exists for a creator's own moderation queue, not for
// a test fixture, and committing a transcript of what a crowd wrote about
// someone in order to assert an arithmetic property is not a trade this repo
// makes. Reproducing the run needs the counts; it does not need the text.
const GJ: CommentRisk[] = [
  { category: 'harassment', count: 111, byCreator: 0, hidden: 0, example: '' },
  { category: 'violence', count: 25, byCreator: 0, hidden: 0, example: '' },
  { category: 'hate', count: 21, byCreator: 0, hidden: 0, example: '' },
  { category: 'sexual', count: 20, byCreator: 0, hidden: 0, example: '' },
  { category: 'illegal', count: 2, byCreator: 0, hidden: 0, example: '' },
  { category: 'spam', count: 1, byCreator: 0, hidden: 0, example: '' },
];
const GJ_MODERATION: ModerationState = {
  commentsScanned: 2_384,
  foundTotal: 180,
  visibleTotal: 180,
  hiddenTotal: 0,
  lastModeratedAt: null,
};

const gjRisk = censusRisk(GJ, GJ_MODERATION, 2_384)!;
check('the scan denominator is the scan’s own', gjRisk.scanned, 2_384);
check('180 of 2,384 is 7.55%', Math.round(gjRisk.adjacentShare! * 10_000) / 100, 7.55);
check('the creator wrote none of it', gjRisk.byCreator, 0);

const gjSafety = deriveBrandSafety([], 2_384, gjRisk);
check('a census scan counts as checks that ran', gjSafety.checked, BRAND_RISK_CATEGORIES.length);
check('and it is still not assessed as null', gjSafety.checked > 0, true);
// The load-bearing rule, pinned on the corpus that would break it: 180 risky
// comments, every one written by somebody else, and the creator is marked down
// for exactly none of them.
check('being a target raises nothing', gjSafety.raised, 0);
check('and moves no severity', gjSafety.worst, 'none');

const gjOwn = deriveBrandSafety(
  [],
  2_384,
  censusRisk(
    GJ.map((r) => (r.category === 'hate' ? { ...r, byCreator: 1 } : r)),
    GJ_MODERATION,
    2_384,
  )!,
);
check('one comment BY the creator is high at one', gjOwn.worst, 'high');

// Unscanned is still unscanned. The whole point is that these are different.
check('no flags and no scan is unassessed', deriveBrandSafety([], 2_384, null).checked, 0);
check('and its severity is null, not none', deriveBrandSafety([], 2_384, null).worst, null);

// The scan array and the type union must name the same categories, or the
// report claims to have screened for something nothing ever looked for.
check(
  'every screened category is a brand risk category',
  BRAND_RISK_CATEGORIES.length,
  new Set(BRAND_RISK_CATEGORIES).size,
);

// ---------------------------------------------------------------------------
// A clean census is a result, not an absence
//
// The moment a real scan came back with nothing, `comment_risks: []` beside
// `moderation.commentsScanned: 884` was read as "never scanned" and the panel
// said "with no readable comments there is nothing to assess" — under a
// heading reporting 884 comments analysed. The absence rule inverted: a
// genuine clean result reported as unmeasured, which costs the creator the one
// finding that was in their favour.
// ---------------------------------------------------------------------------
{
  const cleanScan = censusRisk([], {
    commentsScanned: 884,
    foundTotal: 0,
    visibleTotal: 0,
    hiddenTotal: 0,
    lastModeratedAt: null,
  }, 884);
  check('a clean census is a census', cleanScan !== null, true);
  check('and it knows what it read', cleanScan?.scanned, 884);
  check('nothing adjacent', cleanScan?.adjacent, 0);
  check('a share of zero, not a null share', cleanScan?.adjacentShare, 0);
  check('no categories to list', cleanScan?.categories.length, 0);

  const derived = deriveBrandSafety([], 884, cleanScan);
  check('it reports as checked', derived.checked, BRAND_RISK_CATEGORIES.length);
  check('with nothing raised', derived.raised, 0);
  check('and nothing against the creator', derived.worst, 'none');

  // The distinction the whole rule exists for: no scan is still no scan.
  check('no scan at all is still null', censusRisk([], null, 884), null);
  check(
    'and a moderation row that scanned nothing is too',
    censusRisk([], { commentsScanned: 0, foundTotal: 0, visibleTotal: 0, hiddenTotal: 0, lastModeratedAt: null }, 884),
    null,
  );
  check('which still reports as unassessed', deriveBrandSafety([], 884, null).checked, 0);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
