/**
 * Assertions for the moderation queue.
 *
 * Two rules carry the whole design, and both are easy to break by accident:
 * a creator is never marked down for being a target, and hiding what they
 * wrote themselves must not appear to fix it.
 *
 *   npm run verify:moderation
 */
import { readFileSync } from 'node:fs';

import {
  DEFAULT_DAILY_QUOTA,
  MODERATION_QUOTA_COST,
  dailyHideLimit,
  isActionable,
  orderQueue,
  queueSummary,
  quotaPlan,
  type QueueItem,
} from '@/lib/report/moderation';

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

const item = (over: Partial<QueueItem> = {}): QueueItem => ({
  id: 'q1',
  commentId: 'c1',
  videoId: 'v1',
  videoTitle: 'A video',
  excerpt: '…',
  category: 'hate',
  byCreator: false,
  likes: 0,
  publishedAt: '2026-05-01',
  status: 'pending',
  ...over,
});

// ---------------------------------------------------------------------------
// A creator's own comment offers no button
// ---------------------------------------------------------------------------

check('a stranger’s comment can be hidden', isActionable(item()), true);
// Hiding it would not change the report: byCreator ignores `hidden` on
// purpose, so a button here would appear to fix the one thing it cannot.
check('the creator’s own cannot', isActionable(item({ byCreator: true })), false);
check('and nor can one already handled', isActionable(item({ status: 'hidden' })), false);
check('or one already kept', isActionable(item({ status: 'kept' })), false);

// ---------------------------------------------------------------------------
// Quota is stated up front, not discovered on the 201st click
// ---------------------------------------------------------------------------

check('one hide costs 50 units', MODERATION_QUOTA_COST, 50);
check('a default project gets about 200 a day', dailyHideLimit(), 200);
check('a raised quota raises it', dailyHideLimit(DEFAULT_DAILY_QUOTA * 5), 1_000);

const big = Array.from({ length: 900 }, (_, i) => item({ id: `q${i}` }));
const plan = quotaPlan(big);
check('900 actionable comments', plan.actionable, 900);
check('cost 45,000 units', plan.units, 45_000);
check('and 700 of them wait for tomorrow', plan.overBy, 700);

// The creator's own are not actionable, so they cost nothing and must not
// inflate the warning.
const mixed = [...Array.from({ length: 10 }, (_, i) => item({ id: `q${i}` })), item({ id: 'own', byCreator: true })];
check('own comments are excluded from the plan', quotaPlan(mixed).actionable, 10);
check('and from the cost', quotaPlan(mixed).units, 500);

// ---------------------------------------------------------------------------
// Order: what the audience amplified comes first
// ---------------------------------------------------------------------------

// A slur nobody saw and one the audience upvoted three hundred times are the
// same category and different problems — the second is what an ad sits beneath
// and what other viewers actually read. Same argument as `endorsement`.
const ordered = orderQueue([
  item({ id: 'quiet', likes: 2 }),
  item({ id: 'loud', likes: 300 }),
  item({ id: 'mine', likes: 999, byCreator: true }),
  item({ id: 'done', likes: 500, status: 'hidden' }),
]);
check('most amplified first', ordered[0].id, 'loud');
check('then the quiet one', ordered[1].id, 'quiet');
check('handled rows sink below pending ones', ordered[2].id, 'done');
// Last despite having the most likes: there is no action to take on them.
check('and the creator’s own sort last', ordered[3].id, 'mine');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const summary = queueSummary([
  item({ status: 'pending' }),
  item({ status: 'pending' }),
  item({ status: 'hidden' }),
  item({ status: 'kept' }),
]);
check('pending is the only count that implies work', summary.pending, 2);
check('hidden is counted', summary.hidden, 1);
check('kept is counted', summary.kept, 1);
check('and nothing is reported', summary.reported, 0);

// ---------------------------------------------------------------------------
// The classifier prompt must not re-narrow harassment to the creator
//
// `CommentRisk` is an axis INDEPENDENT of who a comment targets — an ad is
// placed beside it either way — but the prompt defined harassment as "personal
// attacks on the creator". On a call-out channel, where the video IS a third
// party being confronted, that wording returns a clean section: measured on
// @가재맨, 2,384 comments, 180 risky, nearly all aimed at that third party.
//
// Asserted structurally because a prompt has no type. Editing it back to
// "on the creator" is a one-word change that silently un-measures a whole
// format, and nothing else in the suite would notice.
// ---------------------------------------------------------------------------
// Read from the library, not the CLI: the prompt moved to `lib/ingest/classify`
// when the worker became a second caller of it. Reading the old path would
// still have "passed" — every assertion below is a negative or a substring over
// a file that no longer holds the prompt, so four of them would have gone green
// against the wrong file forever.
const prompt = readFileSync(
  new URL('../src/lib/ingest/classify.ts', import.meta.url),
  'utf8',
);

check(
  'harassment is not scoped to the creator',
  /harassment: [^\n]*attacks on the creator/.test(prompt),
  false,
);
check('the prompt says the target does not matter', prompt.includes('WHO THE TARGET IS DOES NOT MATTER'), true);
check(
  'and names the call-out case explicitly',
  /videos? ABOUT other people|third person rather than on the creator/.test(prompt),
  true,
);
// The other half of the same edit: widening the target must not widen the
// boundary. An audience deciding somebody is dishonest is the content on these
// channels, and flagging it would price the whole format as unsafe.
check(
  'accusations of wrongdoing stay out of risk',
  /Accusations of wrongdoing and calls to report someone/.test(prompt),
  true,
);
check(
  'the conduct-versus-person line is still the boundary',
  /about what someone DID[\s\S]{0,200}BODY, THEIR FAMILY, OR THEIR WORTH/.test(prompt),
  true,
);
// Authorship, not target, is what reaches the creator's rating. The moderation
// page said "written at you rather than by you" — the wrong axis, and true only
// of the channels measured first.
const modPage = readFileSync(
  new URL('../src/app/dashboard/moderation/page.tsx', import.meta.url),
  'utf8',
);
check(
  'the creator-facing page does not claim the abuse is aimed at them',
  /written at you rather than by you/.test(modPage),
  false,
);
check(
  'it distinguishes on authorship instead',
  /only what you wrote yourself counts against your report/.test(modPage),
  true,
);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
