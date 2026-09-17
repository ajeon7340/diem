/**
 * Assertions for the job layer: what a creator is told while a long pass is
 * owed, and what the classifier rolls up when it lands.
 *
 * The SQL half — claiming, leases, retries, grants — is exercised against a
 * real Postgres by `npm run verify:migrations`, because none of it is
 * expressible here: `for update skip locked` has no TypeScript equivalent and a
 * mocked client would only assert that the mock agrees with itself.
 *
 *   npm run verify:jobs
 */
import { describeJob } from '@/lib/ingest/jobs';
import { rollUp, type Flagged, type RawComment } from '@/lib/ingest/classify';
import { rollUpAxes, type AxisLabel } from '@/lib/ingest/intent';
import { INTENT_WEIGHTS } from '@/lib/report/intent';
import type { AnalysisJob, CommentIntent, CommentObject } from '@/types';

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

const job = (over: Partial<AnalysisJob> = {}): AnalysisJob => ({
  id: 'j1',
  kind: 'classify_comments',
  status: 'queued',
  attempts: 1,
  maxAttempts: 3,
  queuedAt: '2026-09-17T00:00:00.000Z',
  startedAt: null,
  finishedAt: null,
  commentsScanned: null,
  findings: null,
  lastError: null,
  ...over,
});

// ---------------------------------------------------------------------------
// What the creator is told
// ---------------------------------------------------------------------------

check('no job says nothing extra', describeJob(null), null);

check(
  'a succeeded job says nothing extra',
  describeJob(job({ status: 'succeeded' })),
  null,
);

check(
  'a queued job says it is queued',
  describeJob(job({ status: 'queued' }))?.includes('queued'),
  true,
);

check(
  'a running job says the figures are coming',
  describeJob(job({ status: 'running' }))?.includes('running now'),
  true,
);

check(
  'a retryable failure promises a retry',
  describeJob(job({ status: 'failed', attempts: 1 }))?.includes('retried'),
  true,
);

check(
  'an exhausted failure names the attempts',
  describeJob(job({ status: 'failed', attempts: 3 }))?.includes('3 attempts'),
  true,
);

// THE LINE THAT MATTERS. A creator whose scan failed must not read it as a
// finding about their audience — "nothing was found" and "we did not look" are
// the same silence on the page, and only one of them is about them.
check(
  'an exhausted failure says it is our pass that failed',
  describeJob(job({ status: 'failed', attempts: 3 }))?.includes('not their audience'),
  true,
);

// A Postgres message is not a status line. The worker keeps it for a log; the
// creator gets a state.
check(
  'the worker error is never quoted at the creator',
  describeJob(
    job({ status: 'failed', attempts: 3, lastError: 'commentThreads 403: quotaExceeded' }),
  )?.includes('quotaExceeded'),
  false,
);

// ---------------------------------------------------------------------------
// The rollup
// ---------------------------------------------------------------------------

const comment = (over: Partial<RawComment> = {}): RawComment => ({
  id: 'c1',
  videoId: 'v1',
  videoTitle: 'v',
  text: 'ordinary praise',
  author: 'someone',
  authorChannelId: 'UCviewer',
  likes: 0,
  publishedAt: '2026-09-01T00:00:00.000Z',
  ...over,
});

const corpus: RawComment[] = Array.from({ length: 100 }, (_, i) =>
  comment({ id: `c${i}`, text: 'ordinary praise here' }),
);
const flagged: Flagged[] = [
  { comment: comment({ id: 'c1', text: 'a slur' }), category: 'hate' },
  { comment: comment({ id: 'c2', text: 'another slur' }), category: 'hate' },
  { comment: comment({ id: 'c3', text: 'buy followers' }), category: 'spam' },
];

const plain = rollUp(corpus, flagged, 'UCcreator');

// THE DENOMINATOR THIS PASS READ, and not the clustering corpus. Without it
// `censusRisk` divides by `comments_analyzed`, which already produced 0.15%
// where the truth was 3.89%.
check('the rollup carries its own denominator', plain.moderation.commentsScanned, 100);
check('and the findings total', plain.moderation.foundTotal, 3);

check(
  'categories with no findings are dropped',
  plain.risks.map((r) => r.category),
  ['hate', 'spam'],
);
check('counts are per category', plain.risks.find((r) => r.category === 'hate')?.count, 2);

// A creator is not marked down for being a target: comments written BY other
// people are recorded, and only `byCreator` reaches their rating.
check(
  "a stranger's comment is not attributed to the creator",
  plain.risks.every((r) => r.byCreator === 0),
  true,
);

const byCreator = rollUp(
  corpus,
  [{ comment: comment({ id: 'c9', authorChannelId: 'UCcreator' }), category: 'hate' }],
  'UCcreator',
);
check(
  "the creator's own comment is attributed to them",
  byCreator.risks.find((r) => r.category === 'hate')?.byCreator,
  1,
);

// ---------------------------------------------------------------------------
// A re-runnable scan must not undo the creator's work
// ---------------------------------------------------------------------------
//
// The scan used to write `hiddenTotal: 0` unconditionally, which was harmless
// while it only ran when somebody typed it and is not harmless now that a job
// can run it again. A creator who hid four comments would watch the figure go
// back to zero every time the worker ran.

const rerun = rollUp(corpus, flagged, 'UCcreator', {
  hiddenTotal: 2,
  lastModeratedAt: '2026-09-16T00:00:00.000Z',
});
check('a re-scan keeps what was already hidden', rerun.moderation.hiddenTotal, 2);
check('and when it was done', rerun.moderation.lastModeratedAt, '2026-09-16T00:00:00.000Z');
check('visible is what is left', rerun.moderation.visibleTotal, 1);

// Hidden can exceed the findings of a NEW scan — the creator may have hidden
// comments that are gone, or that this bounded run never reached. Visible is
// clamped rather than going negative.
const overHidden = rollUp(corpus, flagged, 'UCcreator', {
  hiddenTotal: 9,
  lastModeratedAt: null,
});
check('visible never goes negative', overHidden.moderation.visibleTotal, 0);

// ---------------------------------------------------------------------------
// An empty result is a result
// ---------------------------------------------------------------------------

const clean = rollUp(corpus, [], 'UCcreator');
check('a clean channel raises no categories', clean.risks.length, 0);
// But it was still READ, and that is the distinction `--apply` used to lose.
// A scanned-and-clean channel and a never-scanned one must not look identical.
check('a clean channel still records that it was read', clean.moderation.commentsScanned, 100);
check('and that nothing was found', clean.moderation.foundTotal, 0);

const empty = rollUp([], [], 'UCcreator');
check('an empty corpus scans zero', empty.moderation.commentsScanned, 0);
check('and measures no register', empty.register, null);

// ---------------------------------------------------------------------------
// The two-axis pass
// ---------------------------------------------------------------------------

const label = (object: CommentObject, intent: CommentIntent): AxisLabel => ({ object, intent });
const many = (n: number, object: CommentObject, intent: CommentIntent) =>
  Array.from({ length: n }, () => label(object, intent));

const axes = rollUpAxes([
  ...many(10, 'product', 'buy'),
  ...many(30, 'product', 'praise'),
  ...many(20, 'product', 'react'),
  ...many(25, 'content', 'praise'),
  ...many(10, 'creator', 'criticise'),
  ...many(5, 'subject', 'abuse'),
]);

// EXHAUSTIVE BY CONTRACT: collapse along either axis and the total is the same.
// This is what makes a proportion bar over the axes honest, and it is the thing
// a dropped label would silently break.
check('the object axis sums to the total', axes.axes.object.reduce((s, o) => s + o.count, 0), 100);
check('the intent axis sums to the total', axes.axes.intent.reduce((s, i) => s + i.count, 0), 100);
check('the cells sum to the total', axes.axes.cells.reduce((s, c) => s + c.count, 0), 100);
check('the total is the corpus', axes.axes.total, 100);

// The rate is over PRODUCT comments, not the corpus: 60 of these 100 are about
// something purchasable, and that is the denominator a brand can act on.
check('the basis is product comments', axes.measurement.basis, 'product_comments');
check('only product comments are scored', axes.measurement.commentsScored, 60);

// (10x1 + 30x0.1 + 20x0) / 60
check(
  'the rate is the weighted sum over the basis',
  Number(axes.measurement.rate?.toFixed(4)),
  Number(((10 * 1 + 30 * 0.1) / 60).toFixed(4)),
);

// Sentiment is over OPINION-BEARING comments only — 55 praise against 10
// criticise. Not over the corpus, which would drag it down for being chatty.
check('sentiment is praise over praise-plus-criticism', Number(axes.sentiment?.toFixed(2)), Number(((55 / 65) * 100).toFixed(2)));

// THE RULE THAT CANNOT MOVE. `subject:*` carries no purchase weight in any
// combination — an audience litigating whether a stranger is lying produces the
// same engagement a commercial section does, and a weight here would price a
// fight as commerce.
check(
  'no subject cell carries purchase weight',
  Object.keys(INTENT_WEIGHTS).some((k) => k.startsWith('subject:')),
  false,
);

// Abuse is what was done TO someone. It must never reach the creator's number.
const abused = rollUpAxes([...many(10, 'creator', 'praise'), ...many(90, 'creator', 'abuse')]);
check('abuse does not lower sentiment', abused.sentiment, 100);

// ---------------------------------------------------------------------------
// Unmeasurable is not zero
// ---------------------------------------------------------------------------

const nothingToBuy = rollUpAxes([
  ...many(60, 'subject', 'criticise'),
  ...many(40, 'creator', 'react'),
]);
// A creator who never holds a product is not one whose audience refuses to buy.
check('a corpus with nothing purchasable has no rate', nothingToBuy.measurement.rate, null);
check('and scores no comments', nothingToBuy.measurement.commentsScored, 0);
// But the corpus WAS read, and the axes still describe it.
check('the axes still describe it', nothingToBuy.axes.total, 100);
check(
  'commercial density still answers',
  nothingToBuy.measurement.commercialDensity,
  0,
);

const noOpinions = rollUpAxes(many(50, 'content', 'react'));
// Not 50, and not 0: nobody expressed an opinion, so there is nothing to score.
check('a section with no opinions has no sentiment', noOpinions.sentiment, null);

// ---------------------------------------------------------------------------
// A skipped label is counted, never dropped
// ---------------------------------------------------------------------------

const withUnreadable = rollUpAxes([
  ...many(90, 'product', 'buy'),
  ...many(10, 'unclassified', 'unclassified'),
]);
check('unreadable comments stay in the total', withUnreadable.axes.total, 100);
check('and are reported as their own figure', withUnreadable.unreadable, 10);
// They are NOT in the product basis, so they cannot dilute the rate downwards
// by pretending to be product comments that did not convert.
check('and are not counted as product comments', withUnreadable.measurement.commentsScored, 90);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
