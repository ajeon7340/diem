/**
 * Assertions for the candidate comparison table.
 *
 * All of these pin ABSENCE. The table exists to be read across, and a row
 * whose measurement never ran must not be legible as a low score — that is the
 * one failure mode that turns a missing worker into a rejected creator.
 *
 *   npm run verify:candidates
 */
import { readFileSync } from 'node:fs';

import type { Campaign, Candidate, ChannelAnalysis } from '@/lib/data/campaigns';
import { comparability, cpmFromFee, standard, toRow } from '@/lib/report/candidate-compare';
import type { PlatformOutput, Promotion } from '@/types';

let pass = 0, fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got ${a}\n       want ${e}`); }
}

const output = (medianViews: number): PlatformOutput => ({
  platform: 'youtube', unit: 'videos', totalPosts: 400, postsInWindow: 25, windowDays: 90,
  cadencePerWeek: 2, avgViews: medianViews, medianViews, peakViews: medianViews * 4,
  avgLikes: null, peakLikes: null, avgComments: null, engagementRate: 0.041,
});

const promo = (disclosure: Promotion['disclosure'], id: string): Promotion => ({
  postId: id, platform: 'youtube', title: id, url: null,
  publishedAt: '2026-05-04T00:00:00.000Z', brand: null, product: null, category: null,
  disclosure, views: 1000, sponsoredRetention: null,
});

const analysis = (over: Partial<ChannelAnalysis> = {}): ChannelAnalysis => ({
  channelId: 'UCa', handle: '@a', title: 'Channel A', avatarUrl: null, description: null,
  subscribers: 2_920_000, outputStats: [output(679_904)], promotions: [],
  clusters: [], risks: [], sentiment: null, purchaseIntentRate: null, purchaseIntentBasis: null,
  intentCommentsScored: null,
  engagementRate: 0.041, commentsAnalysed: 600, commentsScanned: 884,
  dataFetchedAt: '2026-09-19T00:00:00.000Z', analysedAt: null, classified: false,
  analysisRan: false,
  ...over,
});

const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  id: 'cand-1', channelId: 'UCa', submittedAs: 'youtube.com/@a', proposedFee: null,
  feeCurrency: 'USD', notes: null, status: 'considering', fit: null, fitModel: null,
  fitWrittenAt: null, addedAt: '2026-09-19T00:00:00.000Z', analysis: analysis(),
  ...over,
});

// ---------------------------------------------------------------------------
// A candidate with no stored analysis is UNREAD, not empty
// ---------------------------------------------------------------------------
{
  const row = toRow(candidate({ analysis: null }));
  check('an unread candidate is flagged missing', row.missing, true);
  check('and shows what they typed, not a channel id', row.title, 'youtube.com/@a');
  check('subscribers are null, never 0', row.subscribers, null);
  check('median views are null, never 0', row.medianViews, null);
  check('sentiment is null', row.sentiment, null);
  check('purchase language is null', row.purchaseLanguageRate, null);
  check('and no CPM can be computed', row.cpm, null);
}

// ---------------------------------------------------------------------------
// The classifier owns the comment figures, and until it runs they are absent
//
// The stored row can carry a stale sentiment from an earlier rubric while
// `comment_axes` is empty. Rendering it would report a climate nobody measured
// on this corpus.
// ---------------------------------------------------------------------------
{
  const stale = toRow(candidate({
    analysis: analysis({ classified: false, sentiment: 71, purchaseIntentRate: 0.08 }),
  }));
  check('an unclassified channel reports no sentiment', stale.sentiment, null);
  check('and no purchase language rate', stale.purchaseLanguageRate, null);
  check('while its public figures are intact', stale.medianViews, 679_904);
  check('and the corpus size it does have is shown', stale.commentsAnalysed, 600);

  const done = toRow(candidate({
    analysis: analysis({ classified: true, sentiment: 71, purchaseIntentRate: 0.08 }),
  }));
  check('a classified channel reports both', [done.sentiment, done.purchaseLanguageRate], [71, 0.08]);
}

// ---------------------------------------------------------------------------
// A rate carries the denominator it is over
//
// Measured on two real channels in one pass: 19.5% of 361 product comments and
// 43.8% of 4. As bare percentages in a sorted column the second one wins.
// ---------------------------------------------------------------------------
{
  const wide = toRow(candidate({
    analysis: analysis({
      classified: true, purchaseIntentRate: 0.195, purchaseIntentBasis: 'product_comments',
      intentCommentsScored: 361,
    }),
  }));
  check('the denominator travels with the rate', wide.purchaseLanguageBasis, {
    scored: 361, basis: 'product_comments',
  });

  const thin = toRow(candidate({
    id: 'c2',
    analysis: analysis({
      classified: true, purchaseIntentRate: 0.438, purchaseIntentBasis: 'product_comments',
      intentCommentsScored: 4,
    }),
  }));
  check('a thin rate is still reported', thin.purchaseLanguageRate, 0.438);

  const note = comparability([wide, thin]).note;
  check('but the table says it is not comparable', note!.includes('not comparable with the others'), true);
  check('and names which candidate and over how many', note!.includes('(4)'), true);
  check(
    'a wide-denominator set needs no such caveat',
    comparability([wide]).note,
    null,
  );
  check(
    'an unclassified row contributes no false denominator',
    toRow(candidate({ analysis: analysis({ intentCommentsScored: 4 }) })).purchaseLanguageBasis,
    null,
  );
}

// ---------------------------------------------------------------------------
// Two denominators, never merged
// ---------------------------------------------------------------------------
{
  const row = toRow(candidate({ analysis: analysis({ commentsAnalysed: 600, commentsScanned: 884 }) }));
  check('the clustering corpus is its own figure', row.commentsAnalysed, 600);
  check('the safety corpus is a different figure', row.commentsScanned, 884);
  const unscanned = toRow(candidate({ analysis: analysis({ commentsScanned: null }) }));
  check('an unscanned channel reports null, not 0', unscanned.commentsScanned, null);
}

// ---------------------------------------------------------------------------
// A disclosure is a fact; an inference is a guess. They are counted apart.
// ---------------------------------------------------------------------------
{
  const row = toRow(candidate({
    analysis: analysis({
      promotions: [promo('explicit', 'v1'), promo('affiliate', 'v2'), promo('inferred', 'v3')],
    }),
  }));
  check('only YouTube-disclosed uploads count as disclosed', row.disclosedPromotions, 1);
  check('the rest are counted as inferred', row.inferredPromotions, 2);
}

// ---------------------------------------------------------------------------
// A CPM exists only when the CUSTOMER supplied a fee
// ---------------------------------------------------------------------------
{
  check('no fee, no CPM', cpmFromFee(null, 100_000), null);
  check('a fee with no view figure yields nothing', cpmFromFee({ amount: 12_000, currency: 'USD' }, null), null);
  check('and zero views is not a divisor', cpmFromFee({ amount: 12_000, currency: 'USD' }, 0), null);

  const cpm = cpmFromFee({ amount: 12_000, currency: 'USD' }, 600_000);
  check('the arithmetic is plain division', cpm?.value, 20);
  check('the formula travels with it', cpm?.formula, 'USD 12,000 ÷ 600,000 median views × 1,000');
  check('and it names which view figure', cpm?.basis, 'median views per upload in the window read');
  check(
    'a fee on an unread channel still yields no CPM',
    toRow(candidate({ analysis: null, proposedFee: 12_000 })).cpm,
    null,
  );
}

// ---------------------------------------------------------------------------
// The table says how comparable it actually is
// ---------------------------------------------------------------------------
{
  check('an empty list has nothing to caveat', comparability([]).note, null);

  const none = comparability([toRow(candidate()), toRow(candidate({ id: 'c2' }))]);
  check('none classified is stated as unmeasured', none.ready, 0);
  check('and says so in those words', none.note!.includes('not because they are low'), true);

  const mixed = comparability([
    toRow(candidate({ analysis: analysis({ classified: true }) })),
    toRow(candidate({ id: 'c2' })),
  ]);
  check('a partial set counts the ready ones', mixed.ready, 1);
  check('and names the dash as an absence', mixed.note!.includes('not a zero'), true);

  const all = comparability([toRow(candidate({ analysis: analysis({ classified: true }) }))]);
  check('a complete set needs no caveat', all.note, null);
}

// ---------------------------------------------------------------------------
// An unstated brief field stays visibly unstated
// ---------------------------------------------------------------------------
{
  const campaign: Campaign = {
    id: 'camp', name: 'Spring', brand: 'Northbeam', product: null, audience: null,
    objective: null, avoidTopics: null, budgetTotal: null, budgetCurrency: 'USD',
    createdAt: '2026-09-19T00:00:00.000Z',
  };
  const fields = standard(campaign);
  check('a stated field carries its value', fields.find((f) => f.label === 'Brand')?.value, 'Northbeam');
  check('an unstated field is null, not empty string', fields.find((f) => f.label === 'Product')?.value, null);
  check('an absent budget is null', fields.find((f) => f.label === 'Budget')?.value, null);
  check(
    'a stated budget carries its currency',
    standard({ ...campaign, budgetTotal: 40_000 }).find((f) => f.label === 'Budget')?.value,
    'USD 40,000',
  );
}

// ---------------------------------------------------------------------------
// The refusals in the fit prompt are load-bearing
//
// Asserted against the SOURCE rather than by calling the model: a test that
// spends money to check a sentence is a test nobody runs. What this catches is
// a refusal being edited out — each line below is one specific way this read
// goes wrong, and none of them announces itself once removed.
// ---------------------------------------------------------------------------
{
  const prompt = readFileSync('src/lib/report/candidate-fit.ts', 'utf8');
  const required: [string, string][] = [
    ['commenters are not the audience', 'Never describe the AUDIENCE from comments'],
    ['purchase language is not conversion', 'Never turn purchase-related language into a conversion'],
    ['no demographics', 'Never state age, gender or location of viewers'],
    ['sponsorship needs a disclosure', 'Never call a video sponsored unless the disclosure says so'],
    ['sponsorship is not a cause', 'Never attribute a view difference to sponsorship as cause'],
    ['no invented rate', 'Never invent a fee, a CPM or a rate'],
    ['declining is an answer', 'CONFIDENCE IS A REAL ANSWER'],
    ['public data only', 'no conversion data'],
  ];
  for (const [label, text] of required) {
    check(`the prompt still refuses: ${label}`, prompt.includes(text), true);
  }
  check(
    'and insufficient is a value the schema admits',
    prompt.includes("enum: ['insufficient', 'directional', 'supported']"),
    true,
  );
}

// ---------------------------------------------------------------------------
// A pass that ran and found nothing is not a pass that has not run
//
// Measured on a real channel: comments are disabled, both passes completed in
// three seconds with zero comments. Reported as "not yet classified" it tells
// a buyer to wait for a figure that will never arrive; reported as a clean
// scan it claims a safety result over an empty corpus.
// ---------------------------------------------------------------------------
{
  const waiting = toRow(candidate({ analysis: analysis({ analysisRan: false }) }));
  const empty = toRow(candidate({ id: 'c2', analysis: analysis({ analysisRan: true, commentsAnalysed: 0 }) }));
  check('neither is classified', [waiting.classified, empty.classified], [false, false]);
  check('but only one has run', [waiting.analysisRan, empty.analysisRan], [false, true]);

  const note = comparability([empty]).note!;
  check('an empty corpus is named as empty', note.includes('nothing readable'), true);
  check('and explicitly not as clean', note.includes('not a clean one'), true);
  check(
    'a channel merely waiting is not described that way',
    comparability([waiting]).note!.includes('nothing readable'),
    false,
  );
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
