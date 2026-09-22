/**
 * Assertions for the two reports.
 *
 *   npm run verify:relevance
 *
 * The split is the product decision this file defends: a channel report that
 * describes a creator and makes no brand claim, and a relevance analysis that
 * makes brand claims and never leaves the workspace by accident. Everything
 * below is either a rule about what a status may mean, or a rule about where a
 * brief is allowed to travel.
 */
import { readFileSync } from 'node:fs';

import { contextFingerprint, freshnessOf } from '@/lib/relevance/fingerprint';
import {
  relevantVideos,
  requirementMatrix,
  statusCounts,
  terms,
  type RelevanceContext,
} from '@/lib/relevance/requirements';
import type { ChannelReportView } from '@/lib/channel/report';
import type { Promotion } from '@/types';

let pass = 0, fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got ${a}\n       want ${e}`); }
}
const read = (p: string) => readFileSync(p, 'utf8');
const prose = (p: string) => read(p).replace(/\s+/g, ' ');

const DAY = 86_400_000;
const NOW = Date.parse('2026-09-18T00:00:00.000Z');

function video(id: string, title: string, over: Partial<ChannelReportView['videos'][number]> = {}) {
  return {
    id, title, publishedAt: new Date(NOW - 10 * DAY).toISOString(), views: 10_000,
    seconds: 600, format: 'long' as const, ...over,
  };
}

function report(over: Partial<ChannelReportView> = {}): ChannelReportView {
  return {
    channelId: 'UCsample0000000000000a', title: 'Everyday Workshop', handle: '@ew', avatar: null,
    description: 'A channel.', subscribers: 42_000, fetchedAt: new Date(NOW).toISOString(),
    start: new Date(NOW - 90 * DAY).toISOString(), end: new Date(NOW).toISOString(), windowDays: 90,
    videos: [video('a', 'Hand grinder review for espresso'), video('b', 'Espresso at home with a grinder')],
    comments: 0, unreadable: 0, truncated: false, promotions: [], clusters: [],
    derivedAllowed: false, analysedAt: null, contentProfile: null, ...over,
  } as ChannelReportView;
}

function context(over: Partial<RelevanceContext> = {}): RelevanceContext {
  return {
    brand: {
      id: 'brand1', name: 'Northbeam', sells: 'A hand grinder for espresso at home',
      categories: ['coffee equipment'], customerNeeds: 'Espresso without a benchtop grinder',
      contentLanguages: [], markets: [],
    },
    campaign: null,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Requirements come from the context, never from a checklist
// ---------------------------------------------------------------------------

const brandOnly = requirementMatrix(report(), context());
check('a brand with no campaign still produces a matrix', brandOnly.length > 0, true);
check('and every row names where it came from', brandOnly.every((r) => r.source === 'brand' || r.source === 'campaign'), true);
check(
  'a brand that named no categories gets no category row',
  requirementMatrix(report(), context({ brand: { ...context().brand, categories: [] } })).some((r) => r.id.startsWith('category:')),
  false,
);
check(
  'a campaign adds its own rows and is credited for them',
  requirementMatrix(report(), context({
    campaign: { id: 'c1', name: 'Launch', product: 'The C40 grinder', useCase: null, objective: 'Awareness', avoidTopics: null },
  })).filter((r) => r.source === 'campaign').length >= 2,
  true,
);
check(
  'the campaign product overrides the brand description as the requirement',
  requirementMatrix(report(), context({
    campaign: { id: 'c1', name: 'L', product: 'The C40 travel grinder', useCase: null, objective: null, avoidTopics: null },
  })).find((r) => r.id === 'product')?.source,
  'campaign',
);

// ---------------------------------------------------------------------------
// Statuses: what each one may mean
// ---------------------------------------------------------------------------

const product = brandOnly.find((r) => r.id === 'product')!;
check('two matching uploads support a requirement', product.status, 'supported');
check('and the row cites them', product.evidence.length >= 2, true);

const oneMatch = requirementMatrix(
  report({ videos: [video('a', 'Hand grinder review'), video('b', 'Unrelated woodworking')] }),
  context(),
).find((r) => r.id === 'product')!;
check('one match is partial, not supported', oneMatch.status, 'partial');

const noMatch = requirementMatrix(
  report({ videos: [video('a', 'Unrelated woodworking'), video('b', 'Garden shed build')] }),
  context(),
).find((r) => r.id === 'product')!;
check('no match is UNVERIFIED, never a mismatch', noMatch.status, 'unverified');
check('and it cites nothing rather than citing weakly', noMatch.evidence, []);
check('every row asks something', brandOnly.every((r) => r.confirm.trim().length > 10), true);
check(
  'a supported or conflicting row always cites evidence',
  brandOnly.filter((r) => r.status === 'supported' || r.status === 'conflicting').every((r) => r.evidence.length > 0),
  true,
);

const conflicting = requirementMatrix(
  report({ videos: [video('a', 'My crypto trading setup')] }),
  context({ campaign: { id: 'c1', name: 'L', product: null, useCase: null, objective: null, avoidTopics: 'crypto' } }),
).find((r) => r.id === 'avoid')!;
check('an avoid-topic hit is conflicting', conflicting.status, 'conflicting');
check('and cites the upload', conflicting.evidence, ['a']);
check(
  'a clean sample on avoid-topics is unverified, not a clean bill',
  requirementMatrix(report(), context({
    campaign: { id: 'c1', name: 'L', product: null, useCase: null, objective: null, avoidTopics: 'crypto' },
  })).find((r) => r.id === 'avoid')?.status,
  'unverified',
);

// ---------------------------------------------------------------------------
// The four things a row must never claim
// ---------------------------------------------------------------------------

const disclosed = requirementMatrix(
  report({ promotions: [{ postId: 'a', platform: 'youtube', title: 'x', url: null, publishedAt: '', brand: null, product: null, category: null, disclosure: 'explicit' } as Promotion] }),
  context(),
).find((r) => r.id === 'sponsorship')!;
check('a disclosed promotion supports sponsorship experience', disclosed.status, 'supported');
check('and says the flag does not name the payer', disclosed.confirm.includes('does not say which brand paid'), true);
check(
  'a title matching the product does not claim usage or endorsement',
  product.confirm.includes('not evidence the creator has used it'),
  true,
);
const language = requirementMatrix(report(), context({
  brand: { ...context().brand, contentLanguages: ['en'], markets: ['GB'] },
})).find((r) => r.id === 'language')!;
check('content language is never settled from public data', language.status, 'unverified');
check('and is explicitly not a location', language.confirm.includes('Language is not a location'), true);
const objective = requirementMatrix(report(), context({
  campaign: { id: 'c1', name: 'L', product: null, useCase: null, objective: 'Conversions', avoidTopics: null },
})).find((r) => r.id === 'objective')!;
check('an objective cannot be settled from what was published', objective.status, 'unverified');

// ---------------------------------------------------------------------------
// Relevant cards: evidence or nothing
// ---------------------------------------------------------------------------

const cards = relevantVideos(report(), brandOnly);
check('cards come from supported rows', cards.length > 0, true);
check('each names the requirement it supports', cards.every((c) => c.requirement.length > 0), true);
check('and says the basis is metadata, not a viewing', cards.every((c) => c.because.includes('not watched')), true);
check('at most three', relevantVideos(report(), brandOnly, 3).length <= 3, true);
check('nothing is picked twice', new Set(cards.map((c) => c.video.id)).size, cards.length);

const popular = report({
  videos: [video('hit', 'Completely unrelated viral clip', { views: 900_000 }), video('b', 'Also unrelated')],
});
const emptyRows = requirementMatrix(popular, context());
check(
  'with no match, popular uploads are NOT offered as relevance evidence',
  relevantVideos(popular, emptyRows).length,
  0,
);
check(
  'a conflicting row never becomes a reason to consider the creator',
  relevantVideos(
    report({ videos: [video('a', 'My crypto trading setup')] }),
    requirementMatrix(report({ videos: [video('a', 'My crypto trading setup')] }), context({
      campaign: { id: 'c1', name: 'L', product: null, useCase: null, objective: null, avoidTopics: 'crypto' },
    })),
  ).some((c) => c.video.id === 'a'),
  false,
);

check('counts add up to the rows', Object.values(statusCounts(brandOnly)).reduce((a, b) => a + b, 0), brandOnly.length);
check('short words are not search terms', terms('a of the and grinder'), ['grinder']);

// ---------------------------------------------------------------------------
// Staleness: two clocks
// ---------------------------------------------------------------------------

const fp = contextFingerprint(context());
check('the same brief fingerprints the same', contextFingerprint(context()), fp);
check(
  'a changed product changes it',
  contextFingerprint(context({ brand: { ...context().brand, sells: 'Something else' } })) === fp,
  false,
);
check(
  'a changed campaign objective changes it',
  contextFingerprint(context({ campaign: { id: 'c', name: 'n', product: null, useCase: null, objective: 'New', avoidTopics: null } })) === fp,
  false,
);
const stored = { evidenceFetchedAt: '2026-09-18T00:00:00.000Z', contextFingerprint: fp };
check('same evidence and same brief is current', freshnessOf(stored, '2026-09-18T00:00:00.000Z', fp), 'current');
check('recollected evidence outranks a brief edit', freshnessOf(stored, '2026-09-19T00:00:00.000Z', 'other'), 'evidence_changed');
check('an edited brief alone is brief_changed', freshnessOf(stored, '2026-09-18T00:00:00.000Z', 'other'), 'brief_changed');
check('nothing stored is missing', freshnessOf(null, 'x', 'y'), 'missing');

// ---------------------------------------------------------------------------
// The two reports stay two reports
// ---------------------------------------------------------------------------

const channel = read('src/components/channel/ChannelReport.tsx');
check('the channel report takes no brand requirement matrix', channel.includes('RequirementsMatrix'), false);
check(
  'and never claims a fit',
  /\b(is a (good|strong) fit|recommended for|we recommend)\b/i.test(prose('src/components/channel/ChannelReport.tsx')),
  false,
);
const relevance = read('src/components/report/RelevanceReport.tsx');
check('the relevance report shows no score or percentage', /\d+\s*%|fitScore|score of/i.test(prose('src/components/report/RelevanceReport.tsx')), false);
check('it labels proposals as proposals', relevance.includes('proposals, not findings'), true);
check('and marks a stale analysis rather than serving it silently', relevance.includes('freshness'), true);

const shared = read('src/app/shared/[token]/page.tsx').replace(/\s+/g, '');
check('a shared link honours what it was created for', shared.includes('share.include_relevance===true'), true);
check('and never carries the model narrative outside the workspace', /narrative=\{null\}/.test(shared), true);
const action = read('src/app/actions/channel.ts');
check('sharing a relevance analysis requires a brand', action.includes('Choose which brand’s analysis to share.'), true);
check('and refuses one that was never run', action.includes('Run the relevance analysis for that brand before sharing it.'), true);
check(
  'private fields stay their own opt-ins whatever is shared',
  action.includes("include_notes:!!campaignId && form.get('notes') === 'on'"),
  true,
);

const migration = read('supabase/migrations/0042_relevance.sql');
check('one analysis per brand-level read', migration.includes('relevance_one_per_brand'), true);
check('and one per campaign', migration.includes('relevance_one_per_campaign'), true);
check('the brand and campaign must be in the workspace', migration.includes('relevance_context_in_workspace'), true);
check('relevance sharing is off by default', migration.includes('include_relevance boolean not null default false'), true);
check('and a link must show something', migration.includes('report_shares_shows_something'), true);

const sample = read('src/app/channels/sample/page.tsx');
check('the sample runs the real analysis rather than hardcoding it', sample.includes('requirementMatrix(REPORT, CONTEXT)'), true);
check('and is labelled fictional', sample.includes('a fictional creator and a fictional brand'), true);

const scatter = read('src/components/report/PerformanceScatter.tsx');
const scatterProse = prose('src/components/report/PerformanceScatter.tsx');
check('the chart says views are as at collection, not a history', scatterProse.includes('not a history'), true);
check(
  'it warns that newer uploads have had less time',
  prose('src/components/report/PerformanceScatter.tsx').includes('less time to accumulate'),
  true,
);
check('it never implies subscriber growth', scatterProse.includes('Nothing here shows subscribers'), true);
check('unreported view counts are excluded rather than drawn at zero', scatterProse.includes('unknown, not zero'), true);
check('format uses shape as well as position', scatter.includes('MARKER'), true);
check('points are keyboard reachable', scatter.includes('ArrowRight') && scatter.includes('tabIndex={0}'), true);
check('and there is a table alternative', scatter.includes('Chart data as a table'), true);
check('the Shorts proxy is labelled', scatter.includes('duration proxy'), true);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
