/**
 * Assertions for turning per-comment labels into the clusters people read.
 *
 *   npm run verify:cluster-build
 *
 * `top_comment_clusters` is the only panel that shows a creator an actual
 * comment. It had a column, a type, a schema, a mapper, a retention rule and a
 * renderer, and nothing wrote it but the fixtures — so what is pinned here is
 * mostly that the arithmetic reconciles with the grid it is derived from, and
 * that the labels do not soften what the axis said.
 */
import { buildClusters } from '@/lib/ingest/clusters';
import type { AxisLabel } from '@/lib/ingest/intent';
import type { RawComment } from '@/lib/ingest/classify';
import { COMMENT_INTENTS } from '@/types';

let pass = 0,
  fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.error(`  FAIL ${label}\n       got ${a}\n       want ${e}`); }
}

const comment = (i: number, text: string, likes = 0): RawComment => ({
  id: `c${i}`,
  videoId: 'v1',
  videoTitle: 'A video',
  text,
  author: '',
  authorChannelId: null,
  likes,
  publishedAt: '2026-09-01T00:00:00.000Z',
});

// Sixty, not six. Keyphrases are a comparison between how often a term appears
// in a cell and how often it appears in the corpus, and on six comments every
// term is either unique or universal — a fixture that small tests the fixture,
// not the ranking. `this` is deliberately in every one of them.
const comments: RawComment[] = [];
const labels: AxisLabel[] = [];
let n = 0;

for (let i = 0; i < 30; i++) {
  comments.push(comment(n++, `this channel is incredible, brilliant teaching`, 60 - i));
  labels.push({ object: 'creator', intent: 'praise' });
}
for (let i = 0; i < 20; i++) {
  comments.push(comment(n++, `this please make a video covering joins next`, 20 - i));
  labels.push({ object: 'content', intent: 'request' });
}
for (let i = 0; i < 10; i++) {
  comments.push(comment(n++, `this audio mix is muddy and quiet throughout`, 5 - i));
  labels.push({ object: 'content', intent: 'criticise' });
}

const clusters = buildClusters(comments, labels);

check('one cluster per non-empty cell', clusters.length, 3);
check('largest first', clusters[0].commentCount, 30);

// The share is documented to sum to 1 across a report: "a proportion display
// that drops a bucket while keeping the full denominator prints a number that
// cannot be reconciled with its own total". So every cell is kept.
check(
  'shares sum to exactly one',
  Math.round(clusters.reduce((s, c) => s + c.share, 0) * 1e6) / 1e6,
  1,
);
check(
  'counts sum to the classified corpus',
  clusters.reduce((s, c) => s + c.commentCount, 0),
  labels.length,
);

// The example is the most-liked, and `basis` says which claim is being made.
// "Representative" would assert typicality that nothing here measures.
check('the example is the most-liked', clusters[0].comments[0].likes, 60);
check('and it says so', clusters[0].comments[0].basis, 'most_liked');
check('the legacy field agrees with it', clusters[0].exampleComment, clusters[0].comments[0].text);
check('every example carries a permalink', clusters.every((c) => c.comments.every((x) => (x.url ?? '').includes('lc='))), true);

// Valence stays null: the axis already carries it, and a score derived from the
// same labelling would restate the badge beside it while looking independent.
check('sentiment is left to the axis', clusters.every((c) => c.sentiment === null), true);

// A term that appears in every cluster defines none of them. The corpus is its
// own stoplist — the only approach that works on Korean and English without
// shipping a word list per language.
check(
  'the ubiquitous term is not a keyphrase',
  clusters.some((c) => c.keyphrases.includes('this')),
  false,
);
check('a defining term survives', clusters[1].keyphrases.includes('please'), true);

// Every intent must have a label. A missing one renders as "undefined the
// video" on somebody's media kit.
for (const intent of COMMENT_INTENTS) {
  const built = buildClusters([comment(9, 'x')], [{ object: 'content', intent }]);
  check(`"${intent}" has a label`, /undefined/.test(built[0].label), false);
}
// And abuse is named, not softened back into criticism — they were split apart
// precisely because they are opposites.
const abuse = buildClusters([comment(9, 'x')], [{ object: 'subject', intent: 'abuse' }]);
check('abuse is called abuse', abuse[0].label, 'Abuse aimed at the person the video is about');

check('an empty corpus builds nothing', buildClusters([], []), []);
// A label with no comment behind it must not become a cluster of zero.
check('unlabelled comments are skipped', buildClusters(comments, []).length, 0);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
