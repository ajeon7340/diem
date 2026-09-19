/**
 * Assertions for the recommended collaboration direction.
 *
 * Most of these pin what it must REFUSE to say. A brief is acted on — an
 * association dressed as a cause becomes a production decision, and a view
 * figure dressed as a conversion figure becomes a budget.
 *
 *   npm run verify:collaboration
 */
import { assessCollaboration, type BuyerProfile } from '@/lib/report/collaboration';
import type { ChannelAnalysis } from '@/lib/youtube/explain';
import type { Driver, DriverVideo } from '@/lib/report/drivers';
import type { CommentAxes } from '@/types';

let pass = 0, fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got ${a}\n       want ${e}`); }
}

const vid = (title: string, views: number): DriverVideo => ({
  id: title, title, views, likes: 0, comments: 0,
  publishedAt: '2026-05-04T00:00:00.000Z', durationSec: 30, paidPlacement: false,
});

const driver = (key: string, verdict: Driver['verdict'], ratio: number | null): Driver => ({
  key, label: key, withN: 12, withoutN: 38, withMedian: 1, withoutMedian: 1,
  ratio, p: verdict === 'raises' || verdict === 'lowers' ? 0.01 : 0.3, verdict, note: '',
});

const channel = (drivers: Driver[], sampleSize = 50): ChannelAnalysis => ({
  channelTitle: 'Jooshica', handle: '@jooshica6178', subscribers: 2_920_000,
  sampleSize, medianViews: 679_904, spread: 11,
  drivers,
  best: [vid('a', 9), vid('b', 8), vid('c', 7)],
  worst: [vid('x', 1), vid('y', 2), vid('z', 3)],
  // The per-video catalogue the drivers are derived from. Empty here: these
  // assertions are about the DRIVERS, and the rows are the /dashboard/videos
  // surface's concern.
  videos: [],
  units: 3,
});

const axes: CommentAxes = {
  total: 21330,
  object: [
    { key: 'creator', count: 17177 }, { key: 'product', count: 1430 },
    { key: 'content', count: 1292 }, { key: 'unclassified', count: 1431 },
  ],
  intent: [{ key: 'react', count: 21330 }],
  cells: [{ object: 'creator', intent: 'react', count: 21330 }],
};

const beautyBuyer: BuyerProfile = {
  industry: 'Beauty & personal care', sells: 'A refillable cleanser line', categories: ['beauty'],
};

// ---------------------------------------------------------------------------
// The statistical gate is the same one Studio uses — nothing softer
// ---------------------------------------------------------------------------

const real = assessCollaboration(
  channel([driver('longtitle', 'lowers', 0.64), driver('weekend', 'inconclusive', 2.36)]),
  'Beauty & Lifestyle', axes, beautyBuyer,
);
check('only tested drivers become directions', real.directions.length, 1);
check('and it is the one that cleared', real.directions[0].driver.key, 'longtitle');
check(
  'an inconclusive gap never reaches a brief',
  real.directions.some((d) => d.driver.key === 'weekend'),
  false,
);

const thin = assessCollaboration(
  channel([driver('collab', 'not enough posts', null)]), 'Beauty & Lifestyle', axes, beautyBuyer,
);
check('a thin catalogue withholds', thin.directions.length, 0);
check('and says inventing one would be inventing', thin.withheld!.includes('inventing a pattern'), true);

const flat = assessCollaboration(
  channel([driver('collab', 'no effect', 0.99)]), 'Beauty & Lifestyle', axes, beautyBuyer,
);
check('no effect anywhere is reported as a finding, not a gap', flat.withheld!.includes('is a finding'), true);
check('no uploads withholds too', assessCollaboration(channel([], 0), null, null, null).directions.length, 0);

// ---------------------------------------------------------------------------
// What it must never claim
// ---------------------------------------------------------------------------

const limits = real.limits.join(' ').toLowerCase();
check('limits state these are not causes', limits.includes('not causes'), true);
check('limits state nothing has seen a conversion', limits.includes('seen a conversion'), true);
check('limits warn organic may not carry to sponsored', limits.includes('sponsored brief'), true);
check('limits always ship, even when withheld', thin.limits.length, real.limits.length);

const prose = [
  ...real.directions.map((d) => `${d.headline} ${d.relevanceNote}`),
  ...real.limits,
].join(' ').toLowerCase();
for (const banned of ['guarantee', 'will convert', 'drives sales', 'proven', 'because of']) {
  check(`never says "${banned}"`, prose.includes(banned), false);
}

// ---------------------------------------------------------------------------
// Relevance is a separate question and is allowed to be unknown
// ---------------------------------------------------------------------------

const noProfile = assessCollaboration(
  channel([driver('longtitle', 'lowers', 0.64)]), 'Beauty & Lifestyle', axes,
  { industry: null, sells: null, categories: [] },
);
check('an empty buyer profile yields unknown relevance', noProfile.directions[0].relevance, 'unknown');
check('and says why rather than going quiet', noProfile.directions[0].relevanceNote.includes('not assessed'), true);
check('a null profile behaves the same', assessCollaboration(channel([driver('longtitle','lowers',0.64)]), 'Beauty & Lifestyle', axes, null).directions[0].relevance, 'unknown');

check('a matching category is matched', real.directions[0].relevance, 'matched');
check(
  'and the product-attached ceiling is stated',
  real.directions[0].relevanceNote.includes('7% of their comments attach to a product'),
  true,
);

const mismatch = assessCollaboration(
  channel([driver('longtitle', 'lowers', 0.64)]), 'Outdoor & Gear', axes,
  { industry: null, sells: null, categories: ['finance'] },
);
check('a non-matching niche is unmatched', mismatch.directions[0].relevance, 'unmatched');
check(
  'and does not pretend the pattern is invalid',
  mismatch.directions[0].relevanceNote.includes('still holds on their channel'),
  true,
);
check(
  'a creator with no niche cannot be category-checked',
  assessCollaboration(channel([driver('longtitle','lowers',0.64)]), null, axes, beautyBuyer).directions[0].relevance,
  'unmatched',
);

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

check('every direction carries evidence posts', real.directions[0].evidence.length, 2);
check('a "lowers" direction evidences the weak side', real.directions[0].evidence[0].id, 'x');
const raises = assessCollaboration(
  channel([driver('collab', 'raises', 2.1)]), 'Beauty & Lifestyle', axes, beautyBuyer,
);
check('a "raises" direction evidences the strong side', raises.directions[0].evidence[0].id, 'a');
check('the sample size travels with the read', real.sampleSize, 50);
check('at most three directions reach the brief', assessCollaboration(
  channel([driver('a','raises',2),driver('b','raises',2),driver('c','raises',2),driver('d','raises',2)]),
  'Beauty & Lifestyle', axes, beautyBuyer).directions.length, 3);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
