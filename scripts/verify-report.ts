/**
 * Assertions for the creator report.
 *
 *   npm run verify:report
 *
 * The report is where every honesty rule in this product either holds or
 * quietly stops holding, because it is the only surface a buyer reads end to
 * end. These pin the ones that were wrong before, the ones a redesign is
 * likeliest to lose, and the handful of awkward inputs — a hidden view count, a
 * title that repeats, a channel with nothing collected — that turn a neat
 * layout into a false claim.
 */
import { readFileSync } from 'node:fs';

import {
  compact,
  disclosedPromotions,
  exact,
  factualSummary,
  observations,
  openQuestions,
  representativeVideos,
  reportDepth,
  thumbnailUrl,
  videoUrl,
} from '@/lib/channel/highlights';
import type { ChannelReportView } from '@/lib/channel/report';
import type { VideoEvidence } from '@/lib/ingest/analyze';
import type { Promotion } from '@/types';

let pass = 0, fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got ${a}\n       want ${e}`); }
}

const read = (p: string) => readFileSync(p, 'utf8');
const prose = (p: string) => read(p).replace(/\s+/g, ' ');
/**
 * Comments stripped before matching.
 *
 * The first version of these failed against the component's OWN header, which
 * explains that the summary used to be `report.description` under a heading
 * reading "Executive summary". Documenting a fixed defect is not committing it.
 */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const DAY = 86_400_000;
const FETCHED = '2026-09-10T00:00:00.000Z';

function video(over: Partial<VideoEvidence> = {}): VideoEvidence {
  return {
    id: over.id ?? 'vid00000001',
    title: 'Making espresso at home',
    publishedAt: '2026-09-01T00:00:00.000Z',
    views: 10_000,
    seconds: 600,
    format: 'long',
    ...over,
  };
}

function promotion(over: Partial<Promotion> = {}): Promotion {
  return {
    postId: 'vid00000001', platform: 'youtube', title: 'Sponsored upload', url: null,
    publishedAt: '2026-09-01T00:00:00.000Z', brand: null, product: null, category: null,
    disclosure: 'explicit', ...over,
  } as Promotion;
}

function report(over: Partial<ChannelReportView> = {}): ChannelReportView {
  return {
    channelId: 'UCreport00000000000000a',
    title: 'Everyday Coffee',
    handle: '@everydaycoffee',
    avatar: null,
    description: 'We are the BEST coffee channel and brands love us!',
    subscribers: 125_000,
    fetchedAt: FETCHED,
    start: '2026-06-12T00:00:00.000Z',
    end: '2026-09-10T00:00:00.000Z',
    windowDays: 90,
    videos: [video({ id: 'a1' }), video({ id: 'b2', views: 40_000 }), video({ id: 'c3', views: 4_000 })],
    comments: 600,
    unreadable: 0,
    truncated: false,
    promotions: [],
    contentProfile: null,
    clusters: [],
    derivedAllowed: false,
    analysedAt: null,
    ...over,
  } as ChannelReportView;
}

// ---------------------------------------------------------------------------
// The summary is built from evidence, never from the channel's own bio
// ---------------------------------------------------------------------------

const summary = factualSummary(report()).join(' ');
check(
  'the bio never reaches the summary',
  summary.includes('BEST coffee channel'),
  false,
);
check('the summary states the sample size', summary.includes('3 uploads'), true);
// Locale-tolerant: en-GB renders September as "Sept" on current ICU and "Sep"
// on older builds, and the assertion is about the date being there.
check('and when it was read', /10 Sept? 2026/.test(summary), true);
check('and names the median with its denominator', /median of .* over the \d+ that reported one/.test(summary), true);
check(
  'no disclosure found is reported as this sample, not as a history',
  summary.includes('not a record of the channel never having run one'),
  true,
);
check(
  'a disclosure found says the flag does not name the sponsor',
  factualSummary(report({ promotions: [promotion()] })).join(' ').includes('does not name the sponsor'),
  true,
);

const component = read('src/components/channel/ChannelReport.tsx');
const markup = code('src/components/channel/ChannelReport.tsx');
check('the component never renders report.description', markup.includes('report.description'), false);
check('and there is no "Executive summary" heading left', markup.includes('Executive summary'), false);

// ---------------------------------------------------------------------------
// Depth: four states, and the two that get collapsed
// ---------------------------------------------------------------------------

const NOW = Date.parse('2026-09-12T00:00:00.000Z');
check('a normal sample is full', reportDepth(report(), NOW), 'full');
check('two uploads is thin', reportDepth(report({ videos: [video({ id: 'a1' }), video({ id: 'b2' })] }), NOW), 'thin');
check('nothing collected is empty', reportDepth(report({ videos: [] }), NOW), 'empty');
check(
  'past 30 days is expired, which is not a failure',
  reportDepth(report(), Date.parse(FETCHED) + 31 * DAY),
  'expired',
);
check(
  'an empty collection says there is no sample rather than caveating one',
  factualSummary(report({ videos: [] })).join(' '),
  'No uploads were collected in this period, so this report has no sample to describe. That is a gap in what was collected, not a finding about the channel.',
);
check('and produces no observations to pad the page', observations(report({ videos: [] })).length, 0);
check(
  'a thin sample says so rather than describing a pattern',
  factualSummary(report({ videos: [video()] })).join(' ').includes('too few to describe a pattern'),
  true,
);

// ---------------------------------------------------------------------------
// Observations point at the evidence behind them
// ---------------------------------------------------------------------------

const noticed = observations(report());
check('at most three observations', noticed.length <= 3, true);
check('each one is a sentence', noticed.every((o) => o.text.trim().length > 20), true);
check(
  'a wide spread names the outlier and links it',
  observations(report({
    videos: [video({ id: 'a1', views: 1_000 }), video({ id: 'b2', views: 1_200 }), video({ id: 'c3', views: 90_000 })],
  })).some((o) => o.text.includes('× the median') && o.supporting.includes('c3')),
  true,
);
check(
  'a capped collection reports cadence as a lower bound',
  observations(report({ truncated: true })).some((o) => o.text.startsWith('At least')),
  true,
);
check(
  'and an uncapped one does not',
  observations(report()).some((o) => o.text.startsWith('At least')),
  false,
);

// ---------------------------------------------------------------------------
// Questions come from what the report cannot answer
// ---------------------------------------------------------------------------

check(
  'a disclosed promotion raises the sponsor question',
  openQuestions(report({ promotions: [promotion()] }))[0].includes('Which brands were behind'),
  true,
);
check(
  'unreadable comments raise their own, with the count',
  openQuestions(report({ unreadable: 2 })).some((q) => q.includes('2 sampled uploads')),
  true,
);
check('at most three', openQuestions(report({ truncated: true, unreadable: 1, promotions: [promotion()] })).length, 3);
check('never none', openQuestions(report()).length >= 1, true);
check(
  'the gated profile questions are used when the pass ran',
  openQuestions(report({
    contentProfile: { summary: '', topics: [], questions: ['Has the creator used a grinder like this?'] },
  })).includes('Has the creator used a grinder like this?'),
  true,
);

// ---------------------------------------------------------------------------
// Representative uploads: chosen on stated rules, over awkward data
// ---------------------------------------------------------------------------

const picks = representativeVideos(report());
check('between three and five are chosen', picks.length >= 3 && picks.length <= 5, true);
check('every pick states why it is there', picks.every((p) => p.reason.length > 10), true);
check('the most viewed is one of them', picks.some((p) => p.reason.startsWith('Most viewed')), true);
check(
  'a video with no view count is never called the most viewed',
  representativeVideos(report({
    videos: [video({ id: 'a1', views: null }), video({ id: 'b2', views: 5 }), video({ id: 'c3', views: 9 })],
  })).find((p) => p.reason.startsWith('Most viewed'))?.video.id,
  'c3',
);
check(
  'a flagged upload is always represented',
  representativeVideos(report({
    videos: [video({ id: 'a1' }), video({ id: 'b2' }), video({ id: 'c3' }), video({ id: 'd4' }), video({ id: 'e5' }), video({ id: 'f6' })],
    promotions: [promotion({ postId: 'f6' })],
  })).some((p) => p.video.id === 'f6'),
  true,
);

// Two uploads, one title, two ids. A re-upload or a part two — not a duplicate.
const repeated = representativeVideos(report({
  videos: [
    video({ id: 'a1', title: 'Grinder review', views: 100 }),
    video({ id: 'b2', title: 'Grinder review', views: 900 }),
    video({ id: 'c3', title: 'Something else', views: 500 }),
  ],
}));
check('a repeated title is not collapsed away', repeated.filter((p) => p.video.title === 'Grinder review').length, 2);
check('and both are flagged as sharing a title', repeated.filter((p) => p.titleRepeats).length, 2);
check('while a unique title is not', repeated.find((p) => p.video.id === 'c3')?.titleRepeats, false);
check('nothing is picked twice', new Set(picks.map((p) => p.video.id)).size, picks.length);
check('an empty sample picks nothing', representativeVideos(report({ videos: [] })).length, 0);

const longKorean = '집에서 에스프레소 내리는 법: 초보자를 위한 완전 정복 가이드 — 원두 고르기부터 추출까지';
check(
  'a long Korean title survives selection intact',
  representativeVideos(report({ videos: [video({ id: 'k1', title: longKorean })] }))[0].video.title,
  longKorean,
);

// ---------------------------------------------------------------------------
// Numbers: rounded to read, exact underneath, and never zero for absent
// ---------------------------------------------------------------------------

check('thousands round', compact(18_247), '18.2K');
check('and keep it where it carries information', compact(48_900), '48.9K');
check('but a whole thousand does not print a trailing zero', compact(49_000), '49K');
check('millions round', compact(2_560_000), '2.6M');
check('small numbers are printed in full', compact(842), '842');
check('an absent figure is not zero', compact(null), 'Not reported');
check('and the exact value is kept for the title attribute', exact(18_247), '18,247');
check('exact is honest about absence too', exact(null), 'Not reported');
check('the thumbnail is YouTube’s own, by id', thumbnailUrl('a1'), 'https://i.ytimg.com/vi/a1/mqdefault.jpg');
check('and the id is encoded', thumbnailUrl('a/b').includes('a%2Fb'), true);
check('video links are watch urls', videoUrl('a1'), 'https://www.youtube.com/watch?v=a1');

// ---------------------------------------------------------------------------
// A channel report is not a campaign report
// ---------------------------------------------------------------------------

check('campaign context is optional and defaults to absent', component.includes('campaign = null'), true);
// Claim-shaped phrases only. "no overall fit score is produced" is the refusal
// and has to survive; "is a good fit" is what must never appear.
check(
  'the report never claims a fit, a recommendation or a score',
  /\b(is a (good|strong|great) fit|recommended for|we recommend|suitability score of|fit score of)\b/i.test(
    prose('src/components/channel/ChannelReport.tsx'),
  ),
  false,
);
check(
  'and says outright that no fit score is produced',
  prose('src/components/channel/ChannelReport.tsx').includes('No suitability score is produced'),
  true,
);
check(
  'the campaign block labels observation and unknown separately',
  component.includes('>Observed<') && component.includes('>Unknown<'),
  true,
);
check(
  'and says a matching title is not evidence of use or endorsement',
  prose('src/components/channel/ChannelReport.tsx').includes('It does not show the creator has used this product'),
  true,
);
check(
  'a brief with no product says so rather than matching nothing silently',
  prose('src/components/channel/ChannelReport.tsx').includes('names no product or use case'),
  true,
);

// ---------------------------------------------------------------------------
// Gates, disclosures and the things public data cannot support
// ---------------------------------------------------------------------------

check('the Shorts proxy is still labelled a proxy', component.includes('proxy'), true);
check('commenters are still not the audience', prose('src/components/channel/ChannelReport.tsx').includes('do not represent the audience'), true);
check(
  'comment themes have four states, not two',
  ['derivedAllowed', 'analysedAt', 'clusters.length === 0'].every((t) => component.includes(t)),
  true,
);
check('the derived disclosure still renders under approval', component.includes('{DERIVED_DISCLOSURE}'), true);
check(
  'the method section refuses demographics, conversions and fit scores',
  prose('src/components/channel/ChannelReport.tsx').includes(
    'estimates audience demographics, conversions, purchase intent, sponsorship relationships or an overall fit score',
  ),
  true,
);
check(
  'and says a language or market preference is not an audience location',
  prose('src/components/channel/ChannelReport.tsx').includes('do not establish where an audience is'),
  true,
);
check(
  'the disclosed-promotion list keeps the flag apart from the sponsor',
  prose('src/components/channel/ChannelReport.tsx').includes('sponsor not identified by the flag'),
  true,
);
check('disclosed promotions are capped at three', disclosedPromotions(report({
  promotions: [promotion({ postId: '1' }), promotion({ postId: '2' }), promotion({ postId: '3' }), promotion({ postId: '4' })],
})).length, 3);
check(
  'and an unconfirmed marker is never counted as disclosed',
  disclosedPromotions(report({ promotions: [promotion({ postId: '9', disclosure: 'inferred' })] })).length,
  0,
);

// ---------------------------------------------------------------------------
// Provenance once, in the appendix
// ---------------------------------------------------------------------------

check('there is an appendix', component.includes('report-appendix'), true);
check('it can be left out of an export', component.includes('appendix = true'), true);
// It used to close all six sections. Each phrase may now appear at most once,
// and both live in the appendix.
check('the collection date is printed once', (markup.match(/Collected \{/g) ?? []).length <= 1, true);
check('the source is named once', (markup.match(/Source:/g) ?? []).length, 1);
check('and both sit in the appendix', markup.indexOf('Source:') > markup.indexOf('report-appendix'), true);

const actions = read('src/components/channel/ReportActions.tsx');
check('export offers the appendix as a choice', actions.includes('print-no-appendix'), true);
check('and restores the screen afterwards', actions.includes("root.classList.remove('print-no-appendix')"), true);

// ---------------------------------------------------------------------------
// Print layout
// ---------------------------------------------------------------------------

const css = read('src/app/globals.css');
check('page one ends with a break', css.includes('.report-page-1 { break-after: page; }'), true);
check('the old break-after-first-section rule is gone', css.includes('.report-section:first-of-type { break-after: page; }'), false);
check('evidence cards never split across pages', css.includes('.channel-report .evidence-card'), true);
check('headings keep their content', /\.channel-report h1, \.channel-report h2, \.channel-report h3 \{ break-after: avoid; \}/.test(css), true);
check('paragraphs do not leave orphans', css.includes('orphans: 3'), true);
check('collapsed detail opens for the printer', css.includes('.channel-report details > * { display: block !important; }'), true);
check('and its summary row is dropped', css.includes('.channel-report details > summary { display: none !important; }'), true);
check('off-site links print their address', css.includes('a[href^="http"]::after'), true);
check('the appendix can be hidden in print', css.includes('.print-no-appendix .report-appendix'), true);

// ---------------------------------------------------------------------------
// A shared link is a channel report, never a campaign one
// ---------------------------------------------------------------------------

const shared = read('src/app/shared/[token]/page.tsx');
check(
  'the brief is never passed to a shared report',
  /<ChannelReport[^>]*campaign=/.test(shared),
  false,
);
check(
  'private fields still require an explicit opt-in on the link',
  shared.includes('share.include_notes') && shared.includes('share.include_fee') && shared.includes('share.include_budget'),
  true,
);
const exporter = read('src/components/campaign/CampaignExport.tsx');
check('the campaign export IS a campaign report', /<ChannelReport[\s\S]{0,200}campaign=\{\{/.test(exporter), true);
check(
  'and still excludes notes, budget and fees',
  prose('src/components/campaign/CampaignExport.tsx').includes('Private notes, budget, fees and campaign assessments are excluded'),
  true,
);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
