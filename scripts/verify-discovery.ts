/**
 * Assertions for creator discovery.
 *
 *   npm run verify:discovery            approval unset — the shipping default
 *   npm run verify:discovery-approved   approval configured
 *
 * BOTH RUNS MATTER, and they are not the same test with a flag. Without the
 * derived-analysis approval the product must still FIND creators and must not
 * score them; with it, scoring appears and must still refuse to turn missing
 * evidence into a low score. Checking one and inferring the other is how a gate
 * ships permanently open or permanently shut.
 *
 * EVERY CHECK HERE RUNS AGAINST FIXTURES. No network, no key, no quota. The
 * live integration this cannot cover is named in the summary rather than
 * implied by a green run.
 */
import {
  canonicalChannelId,
  applyPostFilters,
  excludeReference,
  matchedTerms,
  mergeCandidates,
} from '@/lib/discovery/candidates';
import { classifyEvidence, evidenceStrength, brandQueries } from '@/lib/discovery/evidence';
import { identifyBrands } from '@/lib/discovery/competitors';
import { runCollaborations } from '@/lib/discovery/competitors';
import { runCriteria, criteriaReason, criteriaTerms, planCriteriaQueries } from '@/lib/discovery/criteria';
import { SUBSCRIBER_BANDS, VIEW_BANDS, band as sizeBand, inBand, medianViews, selectedBands } from '@/lib/discovery/ranges';
import { runSimilar, verbatimQueries, topicTerms, MIN_REFERENCE_UPLOADS } from '@/lib/discovery/similar';
import { outcomeStatus } from '@/lib/discovery/run';
import {
  band,
  depthSignal,
  freezeOrder,
  assertOrderUnchanged,
  rankCandidates,
  scaleSignal,
  scoreSignals,
  termCoverageSignal,
} from '@/lib/discovery/rank';
import { searchState } from '@/lib/discovery/state';
import { LOCALE_PARAMETER_DISCLOSURE } from '@/lib/youtube/search-contract';
import { criteriaSchema, keepCitedOnly, similarSchema } from '@/lib/discovery/schemas';
import type { EvidenceVideo } from '@/lib/discovery/types';
import { discoveryLimits } from '@/lib/discovery/limits';
import {
  AMENDMENT_ACCEPTED,
  COMPETITOR_SUGGESTIONS,
  DISCOVERY_RANKING,
  DISCOVERY_RETRIEVAL_ALLOWED,
  EVIDENCE_INFERENCE,
} from '@/lib/report/policy';
import { QuotaLedger, SEARCH_CALLS_PER_DAY, SEARCH_COST_SOURCE } from '@/lib/youtube/quota';
import { POST_FILTERS, SEARCH_FILTERS } from '@/lib/youtube/search-contract';
import type { DiscoveryCandidate } from '@/lib/discovery/types';
import { CHANNEL, channel, fixtureRetriever, hit, video } from './discovery-fixtures';
import { readFileSync } from 'fs';

let pass = 0;
let fail = 0;
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

const LIMITS = { ...discoveryLimits(), searchCalls: 4, queries: 3, candidates: 20, units: 60 };

console.log(`\n  approval ${AMENDMENT_ACCEPTED ? 'CONFIGURED' : 'unset'} — fixtures only, no network\n`);

// ---------------------------------------------------------------------------
// Quota: the number came from the table, not from memory
// ---------------------------------------------------------------------------

check('the search cost is sourced, with the date it was read', SEARCH_COST_SOURCE.readAt, '2026-09-20');
check(
  'and the cell is quoted verbatim rather than paraphrased',
  SEARCH_COST_SOURCE.cell,
  '100 quota per day. Each call costs 1 quota.',
);
check('a separate daily search-call bound exists', SEARCH_CALLS_PER_DAY, 100);

const ledger = new QuotaLedger({ units: 10, searchCalls: 2 });
check('a fresh ledger permits a search', ledger.canSearch(), true);
ledger.recordSearch();
ledger.recordSearch();
check('the search-call bound stops the third', ledger.canSearch(), false);
check('and says which bound it was', ledger.exhausted(), 'search_calls');

const unitLedger = new QuotaLedger({ units: 1, searchCalls: 50 });
unitLedger.recordRead();
check('a spent unit budget stops a search too', unitLedger.canSearch(), false);
check('and names the other bound', unitLedger.exhausted(), 'units');

// ---------------------------------------------------------------------------
// Canonical identity and deduplication
// ---------------------------------------------------------------------------

check('a bare channel id is canonical', canonicalChannelId(CHANNEL.grinder), CHANNEL.grinder);
check(
  'a /channel/ URL resolves to the same id',
  canonicalChannelId(`https://www.youtube.com/channel/${CHANNEL.grinder}`),
  CHANNEL.grinder,
);
check('a handle is NOT guessed into an id', canonicalChannelId('@grinder'), null);
check('nor is a title', canonicalChannelId('Grinder Reviews'), null);
check('nor empty input', canonicalChannelId(''), null);

const merged = mergeCandidates([
  {
    facts: channel(CHANNEL.grinder, 'Grinder'),
    evidence: [
      {
        videoId: 'v1',
        channelId: CHANNEL.grinder,
        title: 'Best hand grinder',
        publishedAt: '2026-08-01T00:00:00.000Z',
        views: 1,
        paidPromotion: null,
        seconds: 600,
        declaredLanguage: 'en',
        matchedTerms: ['grinder'],
        matchedIn: 'title',
        excerpt: null,
      },
    ],
    reason: 'first query',
    collectedAt: 'now',
  },
  {
    facts: channel(CHANNEL.grinder, 'Grinder'),
    evidence: [
      {
        videoId: 'v1',
        channelId: CHANNEL.grinder,
        title: 'Best hand grinder',
        publishedAt: '2026-08-01T00:00:00.000Z',
        views: 1,
        paidPromotion: true,
        seconds: 600,
        declaredLanguage: 'en',
        matchedTerms: ['espresso'],
        matchedIn: 'description',
        excerpt: null,
      },
    ],
    reason: 'second query',
    collectedAt: 'now',
  },
]);

check('one channel found twice is one candidate', merged.length, 1);
check('the same video found twice is one piece of evidence', merged[0].evidence.length, 1);
check(
  'and the matched terms are unioned rather than dropped',
  merged[0].evidence[0].matchedTerms.sort(),
  ['espresso', 'grinder'],
);
check(
  'a reported flag beats an unreported one on merge',
  merged[0].evidence[0].paidPromotion,
  true,
);
check('the reason from the query that found it FIRST stands', merged[0].reason, 'first query');

// ---------------------------------------------------------------------------
// Matching is checkable: a term is returned only if the text contains it
// ---------------------------------------------------------------------------

check('a present term matches', matchedTerms(['grinder'], 'Best hand grinder'), ['grinder']);
check('an absent term does not', matchedTerms(['kettle'], 'Best hand grinder'), []);
check('matching is case-insensitive', matchedTerms(['GRINDER'], 'best grinder'), ['GRINDER']);
check(
  'and works in a script with no word boundaries',
  matchedTerms(['커피'], '집에서 커피 내리기'),
  ['커피'],
);
check('one-character noise is ignored', matchedTerms(['a'], 'a grinder'), []);

// ---------------------------------------------------------------------------
// Reference exclusion
// ---------------------------------------------------------------------------

const withReference = [{ channelId: CHANNEL.reference }, { channelId: CHANNEL.grinder }];
check(
  'the reference channel is removed from its own results',
  excludeReference(withReference, CHANNEL.reference).map((c) => c.channelId),
  [CHANNEL.grinder],
);
check(
  'a reference given as a URL still excludes',
  excludeReference(withReference, `https://www.youtube.com/channel/${CHANNEL.reference}`).map(
    (c) => c.channelId,
  ),
  [CHANNEL.grinder],
);
check('no reference removes nothing', excludeReference(withReference, null).length, 2);

// ---------------------------------------------------------------------------
// Post-retrieval filtering, counted and explained
// ---------------------------------------------------------------------------

function ev(views: number | null): EvidenceVideo {
  return {
    videoId: `v${views ?? 'x'}`, channelId: 'UCx', title: 't', publishedAt: '', views,
    paidPromotion: null, seconds: null, declaredLanguage: null, matchedTerms: [], matchedIn: null,
    excerpt: null,
  };
}

function candidate(id: string, subscribers: number | null, title = 'Channel'): DiscoveryCandidate {
  return {
    channelId: id,
    title,
    handle: null,
    avatar: null,
    url: '',
    description: null,
    subscribers,
    hiddenSubscribers: subscribers === null,
    videoCount: null,
    viewCount: null,
    reason: '',
    evidence: [],
    relevance: null,
    collaborations: [],
    collectedAt: 'now',
  };
}

const filtered = applyPostFilters(
  [candidate('UCaaaaaaaaaaaaaaaaaaaaaa', 5_000), candidate('UCbbbbbbbbbbbbbbbbbbbbbb', 50_000), candidate('UCcccccccccccccccccccccc', null)],
  { minSubscribers: 10_000, maxSubscribers: 100_000 },
);
check('a candidate below the range is removed', filtered.kept.map((c) => c.channelId).includes('UCaaaaaaaaaaaaaaaaaaaaaa'), false);
check('one inside it is kept', filtered.kept.map((c) => c.channelId).includes('UCbbbbbbbbbbbbbbbbbbbbbb'), true);
check(
  'a HIDDEN subscriber count is not treated as zero and dropped',
  filtered.kept.map((c) => c.channelId).includes('UCcccccccccccccccccccccc'),
  true,
);
check(
  'the hidden case is reported rather than silently kept',
  filtered.removed.some((r) => r.filter === 'hiddenSubscriberCount'),
  true,
);
check(
  'and every filter says how many rows it removed',
  filtered.removed.every((r) => typeof r.count === 'number' && r.note.length > 0),
  true,
);

const excluded = applyPostFilters([candidate('UCaaaaaaaaaaaaaaaaaaaaaa', 1, 'Crypto Daily'), candidate('UCbbbbbbbbbbbbbbbbbbbbbb', 1, 'Coffee')], {
  excludedTopics: ['crypto'],
});
check('an excluded topic removes the candidate', excluded.kept.map((c) => c.channelId), ['UCbbbbbbbbbbbbbbbbbbbbbb']);

check(
  'API-side and post-retrieval filters are listed apart',
  SEARCH_FILTERS.includes('relevanceLanguage') && POST_FILTERS.includes('subscriberRange'),
  true,
);
check(
  'the subscriber range is NOT claimed as an API filter',
  (SEARCH_FILTERS as readonly string[]).includes('subscriberRange'),
  false,
);

// ---------------------------------------------------------------------------
// Ranking: missing is not zero, thin evidence cannot read as strong
// ---------------------------------------------------------------------------

const allPresent = scoreSignals([
  { key: 'a', label: 'A', value: 0.8, weight: 1 },
  { key: 'b', label: 'B', value: 0.8, weight: 1 },
]);
const oneMissing = scoreSignals([
  { key: 'a', label: 'A', value: 0.8, weight: 1 },
  { key: 'b', label: 'B', value: null, weight: 1, missingBecause: 'not retrieved' },
]);

check('a fully measured 0.8 scores 0.8', Math.round(allPresent.score * 100), 80);
check(
  'a missing signal does not drag the score to 0.4',
  Math.round(oneMissing.score * 100),
  80,
);
check('it is named instead', oneMissing.missing, ['not retrieved']);
check('and the score reports how much evidence it had', oneMissing.evidenceCoverage, 0.5);
check('half-measured evidence cannot read as a strong match', oneMissing.band, 'moderate');
check(
  'and below half it is not given a band at all',
  scoreSignals([
    { key: 'a', label: 'A', value: 1, weight: 1 },
    { key: 'b', label: 'B', value: null, weight: 3, missingBecause: 'x' },
  ]).band,
  'provisional',
);
check('a high score over 70% coverage is capped at moderate', band(0.9, 0.7), 'moderate');
check('and reaches strong only with near-full coverage', band(0.9, 0.9), 'strong');
check('a fully measured weak score stays weak', band(0.2, 1), 'weak');

check('no signal means unmeasured, not zero', depthSignal(0), null);
check('one matching video is a quarter of the cap', depthSignal(1), 0.25);
check('term coverage with no terms is null, not zero', termCoverageSignal([], ['x']), null);
check('a hidden subscriber count makes scale unmeasurable', scaleSignal(1000, null), null);
check('identical scale scores 1', scaleSignal(1000, 1000), 1);
check('an order of magnitude apart scores 0', scaleSignal(1000, 10_000), 0);

const ranked = rankCandidates(
  [candidate('UCaaaaaaaaaaaaaaaaaaaaaa', 1), candidate('UCbbbbbbbbbbbbbbbbbbbbbb', 1), candidate('UCcccccccccccccccccccccc', 1)],
  (c) =>
    scoreSignals([
      {
        key: 'x',
        label: 'X',
        value: c.channelId === 'UCcccccccccccccccccccccc' ? 0.2 : 0.81,
        weight: 1,
      },
    ]),
);
check('near-equal scores tie rather than being ordered', ranked[0].relevance?.tiedGroup, ranked[1].relevance?.tiedGroup);
check('a clearly lower score does not tie with them', ranked[2].relevance?.tiedGroup !== ranked[0].relevance?.tiedGroup, true);

const provisional = rankCandidates([candidate('UCthin00000000000000000', 1), candidate('UCfull00000000000000000', 1)], (c) =>
  scoreSignals(
    c.channelId === 'UCthin00000000000000000'
      ? [
          { key: 'a', label: 'A', value: 1, weight: 1 },
          { key: 'b', label: 'B', value: null, weight: 3, missingBecause: 'thin' },
        ]
      : [
          { key: 'a', label: 'A', value: 0.5, weight: 1 },
          { key: 'b', label: 'B', value: 0.5, weight: 3 },
        ],
  ),
);
check(
  'a perfect score over one signal does not outrank a measured one',
  provisional[0].channelId,
  'UCfull00000000000000000',
);

const frozen = freezeOrder(ranked);
let reorderThrew = false;
try {
  assertOrderUnchanged(frozen, [...ranked].reverse());
} catch {
  reorderThrew = true;
}
check('the explanation stage cannot reorder results', reorderThrew, true);
let dropThrew = false;
try {
  assertOrderUnchanged(frozen, ranked.slice(1));
} catch {
  dropThrew = true;
}
check('nor drop one', dropThrew, true);

check(
  'a citation to a video nobody retrieved is discarded',
  keepCitedOnly([{ sourceVideoIds: ['real', 'invented'] }], ['real']),
  [{ sourceVideoIds: ['real'] }],
);
check(
  'and a claim left with no real citation is dropped entirely',
  keepCitedOnly([{ sourceVideoIds: ['invented'] }], ['real']),
  [],
);

// ---------------------------------------------------------------------------
// Evidence classification — the five rules
// ---------------------------------------------------------------------------

const base = {
  channelId: CHANNEL.grinder,
  videoId: 'v9',
  publishedAt: '2026-08-01T00:00:00.000Z',
  source: 'fixture',
  collectedAt: 'now',
  mayInferFromText: true,
};

check(
  'a search hit that never names the brand is not evidence about it',
  classifyEvidence({
    ...base,
    brand: 'Comandante',
    title: 'Grinder shootout',
    description: 'Three grinders.',
    paidPromotion: null,
  }),
  null,
);

const mention = classifyEvidence({
  ...base,
  brand: 'Comandante',
  title: 'Comandante C40 review',
  description: 'My honest thoughts after a year.',
  paidPromotion: null,
})!;
check('a review naming a brand is a mention', mention.classification, 'mention');
check(
  'and says a mention is not a commercial relationship',
  mention.ambiguity.includes('nothing in the retrieved text indicates a commercial relationship'),
  true,
);

const flaggedOnly = classifyEvidence({
  ...base,
  brand: 'Comandante',
  title: 'Comandante C40 vs 1Zpresso',
  description: 'No disclosure text here.',
  paidPromotion: true,
})!;
check(
  'a paid-promotion flag alone does NOT make this brand the sponsor',
  flaggedOnly.classification,
  'mention',
);
check(
  'and the record says why',
  flaggedOnly.ambiguity.includes('does not name a sponsor'),
  true,
);

const affiliate = classifyEvidence({
  ...base,
  brand: 'Comandante',
  title: 'Comandante C40',
  description: 'Buy here https://amzn.to/abc',
  paidPromotion: null,
})!;
check('an affiliate link classifies as affiliate', affiliate.classification, 'affiliate');
check(
  'and is not reported as a sponsorship fee',
  affiliate.ambiguity.includes('not evidence of a sponsorship fee'),
  true,
);

const gifted = classifyEvidence({
  ...base,
  brand: 'Comandante',
  title: 'Comandante C40',
  description: '제품 제공 받았습니다.',
  paidPromotion: null,
})!;
check('a stated gift is its own class, not paid promotion', gifted.classification, 'gifted');

const disclosed = classifyEvidence({
  ...base,
  brand: 'Comandante',
  title: 'Comandante C40',
  description: '유료 광고 포함 — Comandante와 함께합니다.',
  paidPromotion: true,
})!;
check(
  'flag AND a disclosure naming the brand is disclosed paid promotion',
  disclosed.classification,
  'explicit_paid',
);
check(
  'and even then attribution is credited to the description, not the flag',
  disclosed.ambiguity.includes('not from the flag'),
  true,
);

const gatedRead = classifyEvidence({
  ...base,
  brand: 'Comandante',
  title: 'Comandante C40',
  description: '유료 광고 포함',
  paidPromotion: true,
  mayInferFromText: false,
})!;
check(
  'without approval, descriptions are not read for disclosure at all',
  gatedRead.classification,
  'mention',
);
check(
  'and the platform flag is still reported as the platform’s own',
  gatedRead.ambiguity.includes('YouTube marks this video'),
  true,
);

check('no evidence means unmeasured strength, not zero', evidenceStrength([]), null);
check(
  'ten mentions do not add up to one sponsorship',
  evidenceStrength([mention, mention, mention, mention, mention, mention, mention, mention, mention, mention]),
  evidenceStrength([mention]),
);
check(
  'the strongest single piece is what counts',
  evidenceStrength([mention, affiliate]),
  evidenceStrength([affiliate]),
);

check(
  'one brand costs two searches, not one per collaboration term',
  brandQueries('Comandante').length,
  2,
);
check(
  'and one of them uses YouTube’s own paid-promotion filter',
  brandQueries('Comandante').some((q) => q.paidOnly),
  true,
);

// ---------------------------------------------------------------------------
// Step A / Step B: an unconfirmed brand never reaches a query
// ---------------------------------------------------------------------------

void (async () => {
  const manual = await identifyBrands(
    {
      product: 'A hand grinder',
      category: null,
      customerNeed: null,
      market: null,
      pricePositioning: null,
      knownCompetitors: ['Comandante'],
      campaignId: null,
    },
    null,
  );
  check('a brand the customer entered is confirmed', manual.brands[0].confirmed, true);
  check('and is marked as theirs, not a suggestion', manual.brands[0].source, 'customer');
  check(
    'with no suggestion source, manual entry still works and says why',
    manual.suggestionsUnavailable !== null,
    true,
  );

  const suggested = await identifyBrands(
    {
      product: 'A hand grinder',
      category: null,
      customerNeed: null,
      market: null,
      pricePositioning: null,
      knownCompetitors: [],
      campaignId: null,
    },
    async () => [
      { name: 'Invented Co', relation: 'direct', rationale: 'plausible', source: 'model', confirmed: true },
    ],
  );
  if (COMPETITOR_SUGGESTIONS) {
    check('a model suggestion arrives UNCONFIRMED whatever it claims', suggested.brands[0]?.confirmed, false);
    check('and is labelled as coming from the model', suggested.brands[0]?.source, 'model');
  } else {
    check('with approval unset, no suggestion is made at all', suggested.brands.length, 0);
  }

  const failing = await identifyBrands(
    {
      product: 'x',
      category: null,
      customerNeed: null,
      market: null,
      pricePositioning: null,
      knownCompetitors: ['Kept'],
      campaignId: null,
    },
    async () => {
      throw new Error('provider down');
    },
  );
  check('a suggestion outage does not lose the customer’s own entries', failing.brands.length, 1);

  const noBrands = await runCollaborations(fixtureRetriever(), [], LIMITS);
  check('Step B refuses to run with nothing confirmed', noBrands.emptyReason, 'competitor_unconfirmed');
  check('and spends no search call doing it', noBrands.coverage.searchCalls, 0);

  // --- Step B with evidence ------------------------------------------------

  const collabRetriever = fixtureRetriever({
    results: {
      Comandante: [hit('c1', CHANNEL.barista, 'Comandante C40 long-term review')],
    },
    videos: [
      video('c1', CHANNEL.barista, 'Comandante C40 long-term review', 'Comandante sent nothing; bought it myself.'),
    ],
    channels: [channel(CHANNEL.barista, 'Barista')],
  });
  const collabs = await runCollaborations(collabRetriever, [{ name: 'Comandante', products: [] }], LIMITS);
  check('a confirmed brand produces a candidate', collabs.candidates.length, 1);
  check(
    'grouped by brand for the panel',
    collabs.byBrand[0]?.brand,
    'Comandante',
  );
  check(
    'and a mention is described as a mention in the reason',
    collabs.candidates[0]?.reason.includes('Nothing retrieved establishes a commercial relationship'),
    true,
  );

  const noEvidence = await runCollaborations(
    fixtureRetriever({ results: {} }),
    [{ name: 'Comandante', products: [] }],
    LIMITS,
  );
  check(
    'no evidence is reported as no evidence, never as no collaborations',
    noEvidence.emptyReason,
    'no_collaboration_evidence',
  );

  // --- Criteria mode -------------------------------------------------------

  const criteriaInput = criteriaSchema.parse({
    keywords: 'hand grinder, espresso',
    product: 'A hand grinder for home espresso',
    language: 'en',
    market: 'GB',
    formats: [],
    minSubscribers: '',
    maxSubscribers: '',
    publishedWithinDays: '',
    excludeTopics: '',
  });

  check('one query per term, in the order typed', planCriteriaQueries(criteriaInput, 5).map((p) => p.q), [
    'hand grinder',
    'espresso',
  ]);
  check(
    'a description with no terms still produces a query rather than nothing',
    planCriteriaQueries(
      criteriaSchema.parse({ keywords: '', product: 'a hand grinder for home espresso drinkers' }),
      5,
    ).length,
    1,
  );

  const criteriaRetriever = fixtureRetriever({
    results: {
      'hand grinder': [hit('v1', CHANNEL.grinder, 'The best hand grinder'), hit('v2', CHANNEL.topic, 'Topic upload')],
      espresso: [hit('v3', CHANNEL.grinder, 'Espresso at home')],
    },
    videos: [
      video('v1', CHANNEL.grinder, 'The best hand grinder', 'A hand grinder test.'),
      video('v2', CHANNEL.topic, 'Topic upload', ''),
      video('v3', CHANNEL.grinder, 'Espresso at home', 'espresso basics'),
    ],
    channels: [channel(CHANNEL.grinder, 'Grinder'), channel(CHANNEL.topic, 'Some Artist - Topic')],
  });

  const criteria = await runCriteria(criteriaRetriever, criteriaInput, LIMITS);
  check('two queries ran', criteriaRetriever.searches, ['hand grinder', 'espresso']);
  check('one channel, found by both', criteria.candidates.length, 1);
  check('with both its videos as evidence', criteria.candidates[0].evidence.length, 2);
  check(
    'an auto-generated "- Topic" channel is not a candidate',
    criteria.candidates.some((c) => c.channelId === CHANNEL.topic),
    false,
  );
  check(
    'the reason quotes a retrieved title',
    criteria.candidates[0].reason.includes('The best hand grinder'),
    true,
  );
  check(
    'the language parameter is reported as a search preference',
    criteria.notes.includes(LOCALE_PARAMETER_DISCLOSURE),
    true,
  );
  check(
    'and is listed under what YouTube applied, not what we did',
    criteria.appliedFilters.api.some((f) => f.name === 'Content language preference'),
    true,
  );
  check(
    'ranking happens only where it is permitted',
    criteria.candidates[0].relevance !== null,
    DISCOVERY_RANKING,
  );

  const reason = criteriaReason(criteria.candidates[0], 'hand grinder');
  check('the reason names the query that found it', reason.includes('hand grinder'), true);

  const unmatched = criteriaReason(candidate('UCxxxxxxxxxxxxxxxxxxxxxx', 1), null);
  check('a candidate with no evidence says so rather than inventing one', unmatched, 'Returned by this search.');

  // --- Quota exhaustion is partial, not empty ------------------------------

  const starved = await runCriteria(
    fixtureRetriever({
      results: { 'hand grinder': [hit('v1', CHANNEL.grinder, 'The best hand grinder')] },
      videos: [video('v1', CHANNEL.grinder, 'The best hand grinder', 'x')],
      channels: [channel(CHANNEL.grinder, 'Grinder')],
      budget: { units: 100, searchCalls: 1 },
    }),
    criteriaInput,
    LIMITS,
  );
  check('the first query ran', starved.candidates.length, 1);
  check('the second stopped at the search bound', starved.coverage.stoppedBecause, 'quota_search_calls');
  check('and the run is marked truncated', starved.coverage.truncated, true);
  check('a truncated run with results is PARTIAL, not failed', outcomeStatus('quota_search_calls'), 'partial');
  check('a complete run succeeds', outcomeStatus('complete'), 'succeeded');
  check('a cancelled run is cancelled, not failed', outcomeStatus('cancelled'), 'cancelled');

  const exhaustedEmpty = await runCriteria(
    fixtureRetriever({ results: {}, budget: { units: 1, searchCalls: 0 } }),
    criteriaInput,
    LIMITS,
  );
  check(
    'quota exhaustion is NEVER reported as "no matching creators"',
    exhaustedEmpty.emptyReason,
    'quota_exhausted',
  );

  const broken = await runCriteria(
    fixtureRetriever({ results: {}, failSearchAt: 1, budget: { units: 100, searchCalls: 5 } }),
    criteriaInput,
    LIMITS,
  );
  check('nor is an API failure', broken.emptyReason !== 'no_matches', true);

  // --- Cancellation --------------------------------------------------------

  let checkpoints = 0;
  const cancelled = await runCriteria(criteriaRetriever, criteriaInput, LIMITS, {
    checkpoint: async () => {
      checkpoints += 1;
      return false;
    },
  });
  check('a cancelled run stops at its first checkpoint', checkpoints, 1);
  check('and says it was cancelled', cancelled.coverage.stoppedBecause, 'cancelled');
  check('without claiming an empty market', cancelled.emptyReason, null);

  // --- Similar mode --------------------------------------------------------

  const similarInput = similarSchema.parse({ channel: '@reference', dimensions: [] });

  const thin = await runSimilar(
    fixtureRetriever({
      resolve: {
        '@reference': {
          ok: true,
          channel: {
            channelId: CHANNEL.reference,
            handle: '@reference',
            title: 'Reference',
            subscribers: 1000,
            thumbnail: null,
          },
        },
      },
      channels: [channel(CHANNEL.reference, 'Reference')],
      uploads: { [CHANNEL.reference]: ['r1'] },
      videos: [video('r1', CHANNEL.reference, 'One upload', '')],
    }),
    similarInput,
    LIMITS,
  );
  check(
    `fewer than ${MIN_REFERENCE_UPLOADS} uploads produces no profile at all`,
    thin.emptyReason,
    'insufficient_reference_data',
  );
  check('and no similarity evidence is invented', thin.candidates.length, 0);
  check('nor is a search spent on it', thin.coverage.searchCalls, 0);

  const unresolvable = await runSimilar(fixtureRetriever(), similarInput, LIMITS);
  check('an unsupported channel says so', unresolvable.emptyReason, 'channel_unsupported');

  const similarRetriever = fixtureRetriever({
    resolve: {
      '@reference': {
        ok: true,
        channel: {
          channelId: CHANNEL.reference,
          handle: '@reference',
          title: 'Reference',
          subscribers: 40_000,
          thumbnail: null,
        },
      },
    },
    channels: [
      channel(CHANNEL.reference, 'Reference', { subscribers: 40_000 }),
      channel(CHANNEL.grinder, 'Grinder', { subscribers: 50_000 }),
    ],
    uploads: { [CHANNEL.reference]: ['r1', 'r2', 'r3'] },
    videos: [
      video('r1', CHANNEL.reference, 'Espresso grinder review one', '', { views: 900 }),
      video('r2', CHANNEL.reference, 'Espresso grinder review two', '', { views: 800 }),
      video('r3', CHANNEL.reference, 'Espresso grinder review three', '', { views: 700 }),
      video('s1', CHANNEL.grinder, 'Espresso grinder shootout', 'espresso grinder'),
    ],
    // The reference's own video comes back from its own query. That is the
    // case the exclusion exists for, so the fixture reproduces it.
    results: {
      'Espresso grinder review one': [
        hit('s1', CHANNEL.grinder, 'Espresso grinder shootout'),
        hit('r1', CHANNEL.reference, 'Espresso grinder review one'),
      ],
    },
  });

  const similar = await runSimilar(similarRetriever, similarInput, LIMITS);
  check('the reference identity is shown before anything else', similar.reference?.title, 'Reference');
  check('and names how many uploads the comparison rests on', similar.reference?.sampleSize, 3);
  check(
    'the reference channel never appears in its own results',
    similar.candidates.some((c) => c.channelId === CHANNEL.reference),
    false,
  );
  check('a genuine similar channel does', similar.candidates[0]?.channelId, CHANNEL.grinder);
  check(
    'the explanation names a term the two actually share',
    similar.candidates[0]?.reason.includes('espresso') || similar.candidates[0]?.reason.includes('grinder'),
    true,
  );
  check(
    'a dimension with no evidence is named as unevaluated, not scored',
    similar.candidates[0]?.relevance?.missing.length ?? 0,
    similar.candidates[0]?.relevance
      ? similar.candidates[0].relevance.parts.filter((p) => p.value === null).length
      : 0,
  );

  check(
    'queries come from the reference’s own titles, most-viewed first',
    verbatimQueries(
      [
        video('a', 'UCx', 'Alpha video about grinders', '', { views: 10 }),
        video('b', 'UCx', 'Beta video about kettles', '', { views: 100 }),
      ],
      2,
    ).map((q) => q.q),
    ['Beta video about kettles', 'Alpha video about grinders'],
  );
  check(
    'a series posting near-identical titles does not eat the whole budget',
    verbatimQueries(
      [
        video('a', 'UCx', 'EP 1 Coffee talk', '', { views: 10 }),
        video('b', 'UCx', 'EP 1 Coffee talk', '', { views: 9 }),
      ],
      4,
    ).length,
    1,
  );
  check(
    'a word appearing once is not a topic',
    topicTerms([video('a', 'UCx', 'grinder kettle', ''), video('b', 'UCx', 'grinder scale', '')]),
    ['grinder'],
  );

  // --- States --------------------------------------------------------------

  const job = (status: string) =>
    ({
      id: 'j',
      kind: 'discover_criteria',
      status,
      attempts: 1,
      maxAttempts: 3,
      queuedAt: '',
      startedAt: null,
      finishedAt: null,
      commentsScanned: null,
      findings: null,
      lastError: null,
      progressDone: null,
      progressTotal: null,
      progressStage: null,
    }) as never;

  check('no job and no result is "not started"', searchState([], 0, null, null), 'not_started');
  check('a queued job is queued', searchState([job('queued')], 0, null, null), 'queued');
  check('a running job outranks an old result', searchState([job('running')], 5, '2026-01-01', null), 'running');
  check('a cancelled job is cancelled', searchState([job('cancelled')], 0, null, null), 'cancelled');
  check('a partial job is partial', searchState([job('partial')], 5, '2026-01-01', null), 'partial');
  check(
    'a failed job WITH a stored result is partial, not failed',
    searchState([job('failed')], 5, '2026-01-01', null),
    'partial',
  );
  check('a failed job with nothing stored is failed', searchState([job('failed')], 0, null, null), 'failed');
  check(
    'a completed run that found nothing is NOT the same as a failure',
    searchState([job('succeeded')], 0, '2026-01-01', 'no_matches'),
    'insufficient',
  );
  check(
    'and a completed run with candidates is completed',
    searchState([job('succeeded')], 5, '2026-01-01', null),
    'completed',
  );

  // --- Policy gates --------------------------------------------------------

  check('retrieval never needs the amendment', DISCOVERY_RETRIEVAL_ALLOWED, true);
  check('our own ranking does', DISCOVERY_RANKING, AMENDMENT_ACCEPTED);
  check('so do competitor suggestions', COMPETITOR_SUGGESTIONS, AMENDMENT_ACCEPTED);
  check('so does reading a description for disclosure', EVIDENCE_INFERENCE, AMENDMENT_ACCEPTED);

  const policy = readFileSync('src/lib/report/policy.ts', 'utf8');
  check(
    'the approval route is named, not assumed',
    policy.includes('yt_api_form'),
    true,
  );
  check(
    'and the date it was read is recorded',
    policy.includes('Read 2026-09-20'),
    true,
  );

  const migration = readFileSync('supabase/migrations/0040_discovery.sql', 'utf8');
  check('confirmation is an act by a person, enforced', migration.includes('competitor_brands_confirmation_is_an_act'), true);
  check('a search is dedupled by canonical channel id in the schema', migration.includes('unique (search_id, channel_id)'), true);
  check('collaboration excerpts carry the 30-day read gate', migration.includes("collected_at > now() - interval '30 days'"), true);
  check('customers cannot write their own candidate rows', migration.includes('grant select                        on public.discovery_candidates'), true);
  check('a confirmed brand list survives its search expiring', migration.includes('search_id       uuid references public.discovery_searches (id) on delete set null'), true);

  const worker = readFileSync('scripts/worker.ts', 'utf8');
  check('collect_channel finally has a handler', worker.includes('collect_channel: runCollection'), true);

  // ---------------------------------------------------------------------------
  // The workspace layout, pinned where it is load-bearing
  //
  // Not styling for its own sake. Each of these is a rule somebody will undo
  // with a plausible tidy-up: collapsing the rail's two regions makes Search
  // scroll away on a laptop, dropping `min-w-0` makes one long Korean channel
  // name push the whole results column sideways, and adding a sort option is
  // how a control that reorders fifteen retrieved rows starts reading as a way
  // to search all of YouTube.
  // ---------------------------------------------------------------------------

  const panel = readFileSync('src/components/discovery/FilterPanel.tsx', 'utf8');
  // One width for every rail in the product. Discovery was 300px and the
  // workspace pages 340px, so the menu shifted sideways when you moved between
  // them; the number now has one definition and both import it.
  check('the filter rail uses the shared rail width', panel.includes('RAIL_WIDTH'), true);
  check(
    'and that width is defined once',
    readFileSync('src/components/shell/ContextWorkspace.tsx', 'utf8').includes(
      "export const RAIL_WIDTH = 'lg:w-[340px]'",
    ),
    true,
  );
  check('and is bounded by the viewport so it can scroll inside', panel.includes('lg:max-h-[calc(100vh-7rem)]'), true);
  check('below lg it is a drawer, not a squeezed column', panel.includes('lg:hidden') && panel.includes('aria-controls="discovery-filters"'), true);
  check('Escape closes it', panel.includes("event.key === 'Escape'"), true);
  check('and focus returns to the control that opened it', panel.includes('opener.current?.focus()'), true);

  const forms = readFileSync('src/components/discovery/SearchForms.tsx', 'utf8');
  check('fields scroll in their own region', forms.includes('overflow-y-auto'), true);
  check('while submit and reset sit outside it', forms.includes('shrink-0 border-t border-line bg-surface'), true);
  check('reset is the native one, so it restores what was searched for', forms.includes('type="reset"'), true);
  check('optional filters are folded away', forms.includes('More filters'), true);
  check(
    'nothing fires a request while typing — every mode is a plain submit',
    /onChange|onInput|useEffect/.test(forms),
    false,
  );

  const list = readFileSync('src/components/discovery/ResultList.tsx', 'utf8');
  check('the results column cannot be pushed sideways by a long name', list.includes('min-w-0 flex-1'), true);
  check(
    'the result count leads the results header',
    /\{candidates\.length\} creator|of \$\{candidates\.length\} creators/.test(list),
    true,
  );
  // Only the sort control's own options, not the campaign picker's.
  const sortOptions = list
    .slice(list.indexOf('value={order}'), list.indexOf('</select>', list.indexOf('value={order}')))
    .match(/<option value="([^"]*)"/g) ?? [];
  check(
    'sorting offers only what exists: the search order, and the figure we hold',
    sortOptions,
    ['<option value="search"', '<option value="subscribers"'],
  );
  check('and says it reorders this page rather than re-searching', list.includes('It does not run a new search.'), true);
  check('a hidden subscriber count sorts last, not as zero', list.includes('(b.subscribers ?? -1) - (a.subscribers ?? -1)'), true);

  const card = readFileSync('src/components/discovery/ResultCard.tsx', 'utf8');
  check(
    'the reason outranks the figures in the card',
    card.indexOf('{candidate.reason}') < card.indexOf('label="subs"'),
    true,
  );
  check('long evidence stays collapsed in the list', card.includes('<details'), true);
  check('a hidden subscriber count is never printed as a number', card.includes("? 'hidden'"), true);

  // ---------------------------------------------------------------------------
  // Filter-driven criteria
  //
  // The form used to ask for free-text topics and a product description, both
  // of which the customer had already written on their brand. A category is a
  // search term; everything else narrows what comes back.
  // ---------------------------------------------------------------------------

  const byCategory = criteriaSchema.parse({ categories: ['coffee gear', 'beauty'] });
  check(
    'categories become the queries, in the order chosen',
    planCriteriaQueries(byCategory, 5).map((p) => p.q),
    ['coffee gear', 'beauty'],
  );
  check('and the reason names the choice, not a typed phrase',
    planCriteriaQueries(byCategory, 5)[0].why, 'You chose “coffee gear”.');
  check(
    'a multi-word category is also matched word by word',
    criteriaTerms(byCategory).includes('coffee'),
    true,
  );
  check(
    'a stored search that still carries keywords keeps working',
    planCriteriaQueries(criteriaSchema.parse({ keywords: 'hand grinder' }), 5).map((p) => p.q),
    ['hand grinder'],
  );
  const browseRetriever = fixtureRetriever({
    results: { '': [hit('browse1', CHANNEL.grinder, 'Coffee brewing')] },
    videos: [video('browse1', CHANNEL.grinder, 'Coffee brewing', '')],
    channels: [channel(CHANNEL.grinder, 'Grinder')],
  });
  const browse = await runCriteria(browseRetriever, criteriaSchema.parse({ language: '', market: '' }), LIMITS);
  check('blank topics perform one unqualified search', browseRetriever.searches, ['']);
  check('browse returns real retrieved candidates', browse.candidates.length, 1);
  check('browse coverage names All topics', browse.coverage.queries, ['All topics']);
  check('browse does not claim absent topic matches', browse.candidates[0].reason?.includes('none of your terms'), false);
  check('empty locale choices normalize to no preference', criteriaSchema.parse({ language: '', market: '' }).language, null);
  const multiple = criteriaSchema.parse({ subscribers: ['u1k', '100k'], views: ['1k', '1m'] });
  check('checkbox selections survive parsing', multiple.subscribers, 'u1k,100k');
  check('view checkbox selections survive parsing', multiple.views, '1k,1m');
  check('unchecking every box means unrestricted', criteriaSchema.parse({ subscribers: [], views: [] }).views, 'any');
  const choices = applyPostFilters([
    candidate('small', 500), candidate('gap', 50_000), candidate('large', 500_000), candidate('hidden', null),
  ], { subscriberBands: selectedBands(SUBSCRIBER_BANDS, multiple.subscribers) });
  check('disjoint subscriber bands preserve the gap and unknown counts', choices.kept.map((c) => c.channelId), ['small', 'large', 'hidden']);
  const viewChoices = applyPostFilters([
    { ...candidate('small', 100), evidence: [ev(5_000)] },
    { ...candidate('gap', 100), evidence: [ev(50_000)] },
    { ...candidate('large', 100), evidence: [ev(2_000_000)] },
    { ...candidate('unknown', 100), evidence: [ev(null)] },
  ], { viewBands: selectedBands(VIEW_BANDS, multiple.views) });
  check('disjoint view bands preserve the gap and missing views', viewChoices.kept.map((c) => c.channelId), ['small', 'large', 'unknown']);

  check('an unknown band id falls back to Any', criteriaSchema.parse({ views: 'nonsense' }).views, 'any');
  check('and a real one is kept', criteriaSchema.parse({ subscribers: '10k' }).subscribers, '10k');

  const tenK = sizeBand(SUBSCRIBER_BANDS, '10k');
  check('a value inside the band passes', inBand(50_000, tenK), true);
  check('one below it does not', inBand(500, tenK), false);
  check('one above it does not', inBand(500_000, tenK), false);
  check('and an unmeasured one is neither', inBand(null, tenK), null);
  check('the median of nothing is null, never zero', medianViews([]), null);
  check('and nulls are skipped rather than counted as zero', medianViews([null, 100, 300]), 200);

  const viewFiltered = applyPostFilters(
    [
      { ...candidate('UCsmall000000000000000a', 1), evidence: [ev(400), ev(600)] },
      { ...candidate('UCbig00000000000000000b', 1), evidence: [ev(50_000)] },
      { ...candidate('UCunknown0000000000000c', 1), evidence: [ev(null)] },
    ],
    { viewBand: sizeBand(VIEW_BANDS, 'u1k') },
  );
  check(
    'a channel whose retrieved videos are in band is kept',
    viewFiltered.kept.some((c) => c.channelId === 'UCsmall000000000000000a'),
    true,
  );
  check(
    'one outside it is removed',
    viewFiltered.kept.some((c) => c.channelId === 'UCbig00000000000000000b'),
    false,
  );
  check(
    'and one with no view count is KEPT — unreported is not small',
    viewFiltered.kept.some((c) => c.channelId === 'UCunknown0000000000000c'),
    true,
  );
  check(
    'the unmeasured ones are reported rather than silently kept',
    viewFiltered.removed.some((r) => r.filter === 'viewsUnmeasured'),
    true,
  );

  const criteriaForm = readFileSync('src/components/discovery/SearchForms.tsx', 'utf8');
  check('the criteria form no longer asks for free-text topics', criteriaForm.includes('id="keywords"'), false);
  check('nor for a product description', criteriaForm.includes('id="product"'), false);
  // No topic control at all now: discovery is filter-driven, and the query
  // planner browses on the filters alone when no term is given. A brand's
  // saved categories are deliberately NOT applied in its place — a filter
  // nobody can see or edit is worse than no filter.
  check('there is no topic control', criteriaForm.includes('name="categories"'), false);
  // The JSX usage, not the component definition — which sits near the top of
  // the file and made the first version of this read the order backwards.
  check(
    'and Location sits above the optional filters',
    criteriaForm.indexOf('label="Location"') < criteriaForm.indexOf('<MoreFilters'),
    true,
  );
  // The two size bands moved OUT of the search form and into the results
  // header. Neither ever reached `search.list` — they narrow rows that came
  // back — so changing one in the form meant spending another of the day's
  // hundred searches to re-filter what was already on screen. They now narrow
  // the page live, which is what a post-retrieval filter should always have
  // done. What is asserted is that they still exist and still say what they
  // measure, not where they sit.
  check('the form no longer spends a search on a size filter', criteriaForm.includes('name="subscribers"'), false);
  const narrowing = readFileSync('src/components/discovery/Narrowing.tsx', 'utf8');
  check('subscribers narrow the results live, from the rail', narrowing.includes('SUBSCRIBER_STEPS'), true);
  check('and so do views', narrowing.includes('VIEW_STEPS'), true);
  check('the list reads them rather than owning them', list.includes('useNarrowing()'), true);
  check(
    'an unmeasured figure is kept rather than filtered out',
    list.includes('inRange(candidate.subscribers, subscribers)') && list.includes('=== false'),
    true,
  );
  check(
    'and how many were kept that way is printed',
    list.includes('with figures hidden, kept'),
    true,
  );
  check(
    'select all selects what is shown, not what was hidden',
    list.includes('narrowed.map((c) => c.channelId)'),
    true,
  );
  // The three filters Modash-style panels put beside these two cannot be
  // honest here, so there is no disabled control pretending otherwise.
  check('no growth filter is offered', narrowing.includes('growth rate'), false);
  check('and the absence is stated rather than left blank', narrowing.includes('No growth or engagement rates'), true);
  check(
    'and the form now offers Location where topics used to be',
    criteriaForm.includes('label="Location"'),
    true,
  );
  check('content language is optional, under More filters', /MoreFilters[\s\S]{0,800}id="language"/.test(criteriaForm), true);
  // The CONTROL is gone. The field stays on `FilterDefaults` because searches
  // already run carry it and their stored parameters still have to parse.
  check('and the exclude-topics control is gone', criteriaForm.includes('name="excludeTopics"'), false);
  check(
    'and language is never called an audience measure',
    criteriaForm.includes('{LOCALE_PARAMETER_DISCLOSURE}'),
    true,
  );

  console.log(`\n  ${pass} passed, ${fail} failed`);
  console.log('  All checks ran against fixtures. No live API call was made.');
  process.exit(fail === 0 ? 0 : 1);
})();
