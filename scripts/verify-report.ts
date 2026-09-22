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
  limitations,
  observations,
  openQuestions,
  percent,
  channelDescription,
  representativeVideos,
  reportDepth,
  sponsoredColumns,
  thumbnailUrl,
  videoUrl,
} from '@/lib/channel/highlights';
import { classifyFormat, composition } from '@/lib/channel/composition';
import { comparable, performance, publicReport } from '@/lib/channel/report';
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
    state: 'published',
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
    requestedStart: '2026-06-12T00:00:00.000Z',
    requestedEnd: '2026-09-10T00:00:00.000Z',
    sampledStart: '2026-09-01T00:00:00.000Z',
    sampledEnd: '2026-09-01T00:00:00.000Z',
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
  'one disclosed upload "carries", it does not "carry"',
  factualSummary(report({ promotions: [promotion()] })).join(' ').includes('1 upload carries YouTube'),
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

// ---------------------------------------------------------------------------
// A. THE FOUR CLAIMS IN THE REFERENCE EXPORT THAT DID NOT FOLLOW
// ---------------------------------------------------------------------------

// A1. "the top upload is about 4.7x the median, so one video carries much of
//      the reach". A ratio to the median is not a share of the total, and views
//      are not reach.
const spread = report({
  videos: [video({ id: 'a1', views: 1_000 }), video({ id: 'b2', views: 1_200 }), video({ id: 'c3', views: 90_000 })],
});
const spreadText = observations(spread).map((o) => o.text).join(' ');
check('the ratio-to-median claim is gone', /× the median, so one video carries/.test(spreadText), false);
check(
  'the concentration claim is a share of the total, computed',
  spreadText.includes('takes 98% of the 92.2K views'),
  true,
);
check('and it cites the upload it is about', observations(spread).some((o) => o.supporting.includes('c3')), true);
check('the word reach is not used of a view count', /\breach\b/i.test(spreadText), false);
check('and views are named as plays rather than people', spreadText.includes('Views are plays, not people'), true);
// An even sample must NOT produce a concentration claim.
const even = report({
  videos: [video({ id: 'a1', views: 10_000 }), video({ id: 'b2', views: 11_000 }), video({ id: 'c3', views: 12_000 })],
});
check(
  'an even sample says no upload dominates',
  observations(even).some((o) => o.text.startsWith('No single upload dominates')),
  true,
);

// A2. "both formats appear, so a brief can ask for either" — publishing is not
//     availability.
const mixed = report({
  videos: [
    video({ id: 'l1' }), video({ id: 'l2' }), video({ id: 'l3' }),
    video({ id: 's1', format: 'short', seconds: 40 }),
  ],
});
const mixedText = observations(mixed).map((o) => o.text).join(' ');
check('publishing a format is no longer read as offering it', mixedText.includes('so a brief can ask for either'), false);
check(
  'and the report says outright that a history is not availability',
  mixedText.includes('What the creator would agree to produce is not visible in a publishing history'),
  true,
);
check(
  'availability is asked instead of assumed',
  openQuestions(mixed).some((q) => q.includes('Publishing a format is not agreeing to produce one')),
  true,
);

// A3. Capped collection must not become homework for the creator.
const capped = report({ truncated: true });
check(
  'a cap is no longer an outreach question',
  openQuestions(capped).some((q) => q.includes('Ask what else was published')),
  false,
);
check(
  'it is a stated limitation of this collection',
  limitations(capped).some((l) => l.includes('Capped at')),
  true,
);
check(
  'and it names the fix as ours to run',
  limitations(capped).some((l) => l.includes('Re-collect with a larger bound')),
  true,
);
check(
  'cadence is measured over the span the sample covers',
  observations(report({
    truncated: true,
    sampledStart: '2026-08-01T00:00:00.000Z',
    sampledEnd: '2026-09-01T00:00:00.000Z',
  })).some((o) => /uploads a week across \d+ days/.test(o.text)),
  true,
);
check(
  'and a capped one refuses to describe the period before the sample',
  observations(report({
    truncated: true,
    sampledStart: '2026-08-01T00:00:00.000Z',
    sampledEnd: '2026-09-01T00:00:00.000Z',
  })).some((o) => o.text.includes('nothing here describes the period before')),
  true,
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
  openQuestions(report({ unreadable: 2 })).some((q) => q.includes('unreadable on 2 uploads')),
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
check('three or four are chosen', picks.length >= 1 && picks.length <= 4, true);
check('every pick states why it is there', picks.every((p) => p.reason.length > 10), true);
check('no two picks serve the same purpose', new Set(picks.map((p) => p.purpose)).size, picks.length);

// A4. "closest to the sample median, so it shows a typical upload" — two
//     errors: a mixed-format median on a long-form channel, and a claim about
//     content quality from a view count.
const dominatedByLong = report({
  videos: [
    ...Array.from({ length: 6 }, (_, i) => video({ id: `l${i}`, views: 100_000 + i * 1_000, title: `Long review ${i}` })),
    video({ id: 's1', format: 'short', seconds: 40, views: 101_000, title: 'Short poll' }),
  ],
});
const typical = representativeVideos(dominatedByLong).find((p) => p.purpose === 'typical');
check('the mid-range pick is drawn from the dominant format group', typical?.video.format, 'long');
check(
  'and never claims the content is typical',
  representativeVideos(dominatedByLong).some((p) => /typical upload/.test(p.reason)),
  false,
);
check(
  'it says what it actually measured',
  typical?.reason.includes('a position in a distribution, not a judgement about the content'),
  true,
);
check(
  'a video with no view count is never the outlier pick',
  representativeVideos(report({
    videos: [
      video({ id: 'a1', views: null }), video({ id: 'b2', views: 5 }),
      video({ id: 'c3', views: 9 }), video({ id: 'd4', views: 400 }),
    ],
  })).find((p) => p.purpose === 'outlier')?.video.id,
  'd4',
);
check(
  'an even sample produces no outlier card at all',
  representativeVideos(report({
    videos: [
      video({ id: 'a1', views: 1_000 }), video({ id: 'b2', views: 1_050 }),
      video({ id: 'c3', views: 1_100 }), video({ id: 'd4', views: 1_150 }),
    ],
  })).some((p) => p.purpose === 'outlier'),
  false,
);
const flagged = report({
  videos: [video({ id: 'a1' }), video({ id: 'b2' }), video({ id: 'c3' }), video({ id: 'd4' }), video({ id: 'e5' }), video({ id: 'f6' })],
  promotions: [promotion({ postId: 'f6' })],
});
check('a flagged upload is always represented', representativeVideos(flagged).some((p) => p.video.id === 'f6'), true);
check('and the card carries the flag', representativeVideos(flagged).find((p) => p.video.id === 'f6')?.disclosed, true);
// The sponsorship list must not reprint a card the evidence section already
// showed — that duplication filled a page and a half of the reference export.
check(
  'the sponsorship list excludes what the cards already showed',
  disclosedPromotions(flagged, 3, representativeVideos(flagged).map((p) => p.video.id)).length,
  0,
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

// Matched as prose: the emphasis markup around "proxy" reflows when the
// sentence is edited, and what has to survive is the word beside "duration".
check(
  'the Shorts proxy is still labelled a proxy',
  /duration\s*\{?'?\s*'?\}?\s*<strong[^>]*>\s*proxy/.test(read('src/components/report/FormatPerformance.tsx')),
  true,
);
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
check('page one ends with a break', css.includes('.report-page-break { break-after: page; }'), true);
// CONDITIONALLY, though: a thin sample that cannot fill a sheet must not be
// followed by half a blank page, which is most of what the reference export's
// whitespace was.
check(
  'the break is withheld for a sample too small to fill the sheet',
  component.includes("report.videos.length >= 12 ? 'report-page-break' : ''"),
  true,
);
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


// ---------------------------------------------------------------------------
// A5. A REPORTED ZERO IS NOT MISSING DATA, AND NEITHER IS A LIVE STREAM
// ---------------------------------------------------------------------------

const withStates = report({
  videos: [
    video({ id: 'p1', views: 500_000 }),
    video({ id: 'p2', views: 600_000 }),
    video({ id: 'p3', views: 700_000 }),
    // A premiere nobody can watch yet. Its 0 is a state, not a result.
    video({ id: 'up', views: 0, state: 'upcoming', seconds: null, format: 'unknown' }),
    // A stream still running. Its count is not comparable with a finished one.
    video({ id: 'lv', views: 12, state: 'live', seconds: null, format: 'unknown' }),
    // A genuine upload that reported no count at all.
    video({ id: 'nr', views: null }),
  ],
});
const withStatesPerf = performance(withStates.videos, Date.parse(FETCHED));
check('a scheduled premiere is not a comparable upload', comparable(withStates.videos).some((v) => v.id === 'up'), false);
check('nor is a live broadcast', comparable(withStates.videos).some((v) => v.id === 'lv'), false);
check('so a premiere at zero never becomes the sample minimum', withStatesPerf.min, 500_000);
check('and the live count never becomes it either', withStatesPerf.min === 12, false);
check('the excluded ones are counted, not lost', [withStatesPerf.excludedLive, withStatesPerf.excludedUpcoming], [1, 1]);
check('an upload reporting no count is comparable but unmeasured', withStatesPerf.unreported, 1);
check('it is excluded from the median rather than counted as zero', withStatesPerf.n, 3);
check('and from the total', withStatesPerf.total, 1_800_000);
check(
  'the summary names the excluded broadcasts rather than dropping them silently',
  factualSummary(withStates).join(' ').includes('1 live broadcast and 1 scheduled premiere excluded from every view figure'),
  true,
);
check(
  'and the limitations say the unreported one is unknown, not zero',
  limitations(withStates).some((l) => l.includes('unknown, not zero')),
  true,
);
// A genuine zero on a published upload IS a measurement and must survive.
const realZero = performance(
  [video({ id: 'z', views: 0 }), video({ id: 'a', views: 100 }), video({ id: 'b', views: 200 })],
  Date.parse(FETCHED),
);
check('a published upload that really got zero views is measured', realZero.min, 0);
check('and counts toward the denominator', realZero.n, 3);

// ---------------------------------------------------------------------------
// A6. REQUESTED WINDOW AND SAMPLED RANGE ARE DIFFERENT FACTS
// ---------------------------------------------------------------------------

const windows = report({
  requestedStart: '2026-06-22T00:00:00.000Z',
  requestedEnd: '2026-09-20T00:00:00.000Z',
  sampledStart: '2026-07-04T00:00:00.000Z',
  sampledEnd: '2026-09-18T00:00:00.000Z',
  truncated: true,
});
const windowText = factualSummary(windows).join(' ');
check(
  'the summary states the dates actually sampled',
  windowText.includes('published between 4 Jul 2026 and 18 Sept 2026'),
  true,
);
check('and never prints the request in their place', windowText.includes('22 Jun 2026'), false);
check(
  'the gap between request and sample is stated when it is material',
  windowText.includes('90 days were requested; the sample starts 12 days in'),
  true,
);
check('and names the cap as the reason', windowText.includes('the collection hit its upload limit'), true);
check(
  'a sample that fills its window does not print the note at all',
  factualSummary(report({
    requestedStart: '2026-06-12T00:00:00.000Z',
    sampledStart: '2026-06-13T00:00:00.000Z',
    sampledEnd: '2026-09-10T00:00:00.000Z',
  })).join(' ').includes('days were requested'),
  false,
);
// publicReport derives the sampled range for evidence collected before the
// field existed, rather than falling back to the requested window.
const derived = publicReport({
  channel_id: 'UCx', title: 'T', handle: null, avatar_url: null, description: null,
  subscribers: 1, data_fetched_at: new Date().toISOString(), comments_analyzed: 0,
  promotions: [], top_comment_clusters: [],
  evidence: {
    videos: [
      { id: 'a', title: 'a', publishedAt: '2026-07-04T00:00:00.000Z', views: 1, seconds: 600, format: 'long' },
      { id: 'b', title: 'b', publishedAt: '2026-09-18T00:00:00.000Z', views: 2, seconds: 600, format: 'long' },
    ],
    start: '2026-06-22T00:00:00.000Z', end: '2026-09-20T00:00:00.000Z', windowDays: 90,
  },
});
check('legacy evidence still reports a sampled range', derived?.sampledStart, '2026-07-04T00:00:00.000Z');
check('and keeps the request separate', derived?.requestedStart, '2026-06-22T00:00:00.000Z');
check(
  'legacy uploads with no state are treated as published, not excluded',
  comparable(derived!.videos).length,
  2,
);

// ---------------------------------------------------------------------------
// A7. THE NARRATIVE, THE TABLE AND THE CHART DESCRIBE THE SAME UPLOADS
// ---------------------------------------------------------------------------

const agreeing = report({
  videos: [
    video({ id: 'l1', views: 100 }), video({ id: 'l2', views: 200 }), video({ id: 'l3', views: 300 }),
    video({ id: 's1', format: 'short', seconds: 30, views: 400 }),
    video({ id: 'x1', state: 'upcoming', views: 0, seconds: null, format: 'unknown' }),
  ],
});
const narrativeCounts = factualSummary(agreeing).join(' ');
const tableTotal = performance(agreeing.videos, Date.parse(FETCHED)).sampled;
check('the narrative splits 3 long-form and 1 short', narrativeCounts.includes('3 long-form') && narrativeCounts.includes('1 short'), true);
check('and the table counts the same four comparable uploads', tableTotal, 4);
check(
  'observations are computed over comparable uploads too',
  observations(agreeing).some((o) => o.text.includes('of 4 comparable uploads')),
  true,
);
check(
  'the scatter excludes the same uploads the table does',
  read('src/components/report/PerformanceScatter.tsx').includes('comparable(videos)'),
  true,
);
check(
  'and performance() is the single place eligibility is decided',
  read('src/lib/channel/report.ts').includes('const eligible=comparable(videos);'),
  true,
);

// ---------------------------------------------------------------------------
// B. CONTENT CLASSIFICATION: EXCLUSIVE FORMATS, OVERLAPPING SUBJECTS
// ---------------------------------------------------------------------------

check('a versus title is a comparison', classifyFormat(video({ title: 'iPhone 18 vs Galaxy S26' })), 'comparison');
check('and so is the Korean form', classifyFormat(video({ title: '아이폰 18 프로 갤럭시 비교' })), 'comparison');
check('a how-to is a tutorial', classifyFormat(video({ title: 'How to set up your new laptop' })), 'tutorial');
check('and 하는 법 is too', classifyFormat(video({ title: '맥북 초기 설정 하는 법' })), 'tutorial');
check('3개월 사용기 is long-term usage', classifyFormat(video({ title: '오우라링5 3개월 사용기' })), 'longterm');
check('언박싱 is a first look, not a review', classifyFormat(video({ title: '아이폰 18 언박싱' })), 'firstlook');
check('리뷰 is a review', classifyFormat(video({ title: '갤럭시 워치 리뷰' })), 'review');
check('출시 is news', classifyFormat(video({ title: '새 아이패드 출시 소식' })), 'news');
check(
  'a comparison review is a comparison — the more specific rule wins',
  classifyFormat(video({ title: '갤럭시 vs 아이폰 비교 리뷰' })),
  'comparison',
);
check('and nothing matching is unclassified, not forced', classifyFormat(video({ title: '오늘의 브이로그' })), 'unclassified');
check(
  'a description is read only when the title says nothing',
  classifyFormat(video({ title: '오늘의 브이로그', description: 'how to set it up' })),
  'tutorial',
);

const comp = composition([
  video({ id: 'a', title: '아이폰 18 리뷰' }),
  video({ id: 'b', title: '아이폰 18 프로 언박싱' }),
  video({ id: 'c', title: '아이폰 케이스 비교' }),
  video({ id: 'd', title: '오늘의 일상' }),
]);
check('every upload lands in exactly one format bucket', comp.formats.reduce((n, g) => n + g.videoIds.length, 0), 4);
check('and the buckets sum to the sample', comp.sampled, 4);
check('unclassified is a real bucket with its count', comp.formats.find((g) => g.format === 'unclassified')?.videoIds.length, 1);
check('unclassified sorts last, never leading the chart', comp.formats.at(-1)?.format, 'unclassified');
check('a recurring subject needs three uploads', comp.subjects.map((s) => s.term), ['아이폰']);
check('overlapping tags do not have to sum to the sample', comp.subjects[0].videoIds.length <= comp.sampled, true);
check('a two-upload word is not called recurring', composition([
  video({ id: 'a', title: '맥북 리뷰' }), video({ id: 'b', title: '맥북 비교' }),
]).subjects.length, 0);
check('the basis never claims a viewing', comp.basis.includes('Nothing was watched'), true);
check(
  'and neither does the report',
  /\bwe watched\b|\bwatched the video\b|\btranscript(s)? (of|were) read\b/i.test(prose('src/components/channel/ChannelReport.tsx')),
  false,
);
check(
  'the report states outright that nothing was watched',
  prose('src/components/channel/ChannelReport.tsx').includes('Nothing was watched'),
  true,
);
check(
  'and the limitations say it in full at least once',
  limitations(report()).some((l) => l.includes('No upload was watched, no transcript read')),
  true,
);
// The threshold that printed "no single upload dominates" over a 98% share.
check(
  'a dominant upload is reported as dominant at three uploads',
  observations(report({
    videos: [video({ id: 'a', views: 1_000 }), video({ id: 'b', views: 1_200 }), video({ id: 'c', views: 90_000 })],
  })).some((o) => o.text.includes('takes 98%') && !o.text.includes('No single upload dominates')),
  true,
);
check(
  'and an even one is not, at any size',
  observations(report({
    videos: Array.from({ length: 12 }, (_, i) => video({ id: `v${i}`, views: 10_000 + i })),
  })).some((o) => o.text.startsWith('No single upload dominates')),
  true,
);
check('a Korean particle is stripped so 아이폰이 and 아이폰 are one subject', composition([
  video({ id: 'a', title: '아이폰이 좋다' }), video({ id: 'b', title: '아이폰 리뷰' }), video({ id: 'c', title: '아이폰 비교' }),
]).subjects[0]?.term, '아이폰');
check('an empty sample classifies nothing rather than throwing', composition([]).sampled, 0);

// ---------------------------------------------------------------------------
// C. SMALL SAMPLES, QUARTILES AND THE THINGS NOT TO SAY ABOUT THEM
// ---------------------------------------------------------------------------

const small = performance(Array.from({ length: 5 }, (_, i) => video({ id: `v${i}`, views: (i + 1) * 100 })), Date.parse(FETCHED));
check('five uploads is too few for a middle 50%', [small.p25, small.p75], [null, null]);
check('but the median still exists', small.median, 300);
const big = performance(Array.from({ length: 12 }, (_, i) => video({ id: `v${i}`, views: (i + 1) * 100 })), Date.parse(FETCHED));
check('twelve uploads supports one', big.p25 !== null && big.p75 !== null, true);
check('and it is an inner range, not the extremes', big.p25! > big.min! && big.p75! < big.max!, true);
check(
  'performance is never characterised as strong, stable or predictable',
  /\b(strong|weak|stable|consistent|predictable|reliable) (performance|views|channel)\b/i.test(
    prose('src/components/report/FormatPerformance.tsx') + prose('src/components/channel/ChannelReport.tsx'),
  ),
  false,
);
check(
  'the chart is never presented as growth',
  prose('src/components/report/PerformanceScatter.tsx').includes('not a history'),
  true,
);
check(
  'and no first-week figure is invented from one snapshot',
  prose('src/components/report/PerformanceScatter.tsx').includes('nothing here is a first-week figure'),
  true,
);
check('age bands carry their sample sizes', read('src/components/report/PerformanceScatter.tsx').includes('(${band.n})'), true);
check('percent rounds to whole numbers', percent(1, 3), '33%');
check('and refuses to divide by nothing', percent(1, 0), '—');

// ---------------------------------------------------------------------------
// G. THE EXPORT IS AN EDITED DOCUMENT
// ---------------------------------------------------------------------------

check('evidence cards print as rows, not tiles', css.includes('.channel-report .evidence-card,'), true);
check('with a bounded thumbnail', css.includes('.channel-report .evidence-thumb,'), true);
check('raw urls no longer interrupt prose', css.includes('.channel-report a[href^="http"]::after {'), false);
check('they survive in the appendix reference list', css.includes('.channel-report .report-appendix a[href^="http"]::after'), true);
check('each printed sheet carries the report identity', css.includes('.channel-report .report-page-foot'), true);
check('and the component prints a page number', component.includes('page {page} of {sheets}'), true);
check(
  'the total matches the break it actually made',
  component.includes("const sheets = report.videos.length >= 12 ? 2 : 1;"),
  true,
);
// Singular/plural, because these sentences name counts that are usually 1.
check(
  'one upload "reports", it does not "report"',
  limitations(report({ videos: [video({ id: 'a', views: null }), video({ id: 'b' }), video({ id: 'c' })] })).some(
    (l) => l.includes('1 comparable upload reports no view count'),
  ),
  true,
);
check(
  'and so does one with no duration',
  limitations(report({ videos: [video({ id: 'a', format: 'unknown', seconds: null }), video({ id: 'b' })] })).some(
    (l) => l.includes('1 upload reports no duration, so it sits'),
  ),
  true,
);
check(
  'the summary agrees',
  factualSummary(report({ videos: [video({ id: 'a', format: 'unknown', seconds: null }), video({ id: 'b' }), video({ id: 'c' })] }))
    .join(' ')
    .includes('1 upload reports no duration in the public metadata and sits'),
  true,
);
check('the relevance footer says the brief is inside it', read('src/components/report/RelevanceReport.tsx').includes('contains your brief — internal'), true);
check('the metric row stays a row in print', css.includes('.channel-report .report-metrics .grid { display: grid;'), true);
check('the print background is white', css.includes('background: #fff !important;'), true);
check(
  'an unavailable comment pass is a note, not an empty section',
  component.includes('Comment themes are not available on this deployment. Nothing above depends on them.'),
  true,
);
check('and it no longer has its own heading block', markup.includes('<Block title="Comment response">'), false);
check(
  'the four comment states are still distinguished',
  ['derivedAllowed', 'analysedAt', 'clusters.length === 0'].every((t) => component.includes(t)),
  true,
);

// ---------------------------------------------------------------------------
// I. AWKWARD INPUTS
// ---------------------------------------------------------------------------

const koreanTitle = '600만원짜리 게이밍 노트북은 대체 뭘까?ㄷㄷ 웬만한 데스크탑보다 더 빠른 컴퓨터;; 가성비 최강 제품 총정리';
check(
  'a very long Korean title is never truncated in the data',
  representativeVideos(report({ videos: [video({ id: 'k1', title: koreanTitle })] }))[0]?.video.title,
  koreanTitle,
);
check(
  'a missing thumbnail still produces a url rather than a broken card',
  thumbnailUrl('missing-id'),
  'https://i.ytimg.com/vi/missing-id/mqdefault.jpg',
);
check(
  'and the card tints the tile so an absent image reads as absent',
  read('src/components/report/EvidenceCard.tsx').includes('bg-line/40 object-contain'),
  true,
);
check('an empty sample produces no representative uploads', representativeVideos(report({ videos: [] })).length, 0);
check('and no observations', observations(report({ videos: [] })).length, 0);
check(
  'a sample of only live broadcasts has nothing comparable and says so',
  factualSummary(report({
    videos: [video({ id: 'l', state: 'live', views: 3, seconds: null, format: 'unknown' })],
  })).join(' ').includes('excluded from every view figure'),
  true,
);
check(
  'limitations always end with the metadata-only statement',
  limitations(report()).at(-1)?.includes('No upload was watched'),
  true,
);
check('and there are never more than six', limitations(report({
  truncated: true, unreadable: 3,
  videos: [video({ id: 'a', views: null }), video({ id: 'b', format: 'unknown', seconds: null }), video({ id: 'c', state: 'live' })],
})).length <= 6, true);
// The window gap moved here from the summary; it is a limit of the collection,
// not a description of the channel.
check(
  'the requested-window gap is a limitation, not a headline',
  limitations(report({
    requestedStart: '2026-06-22T00:00:00.000Z',
    sampledStart: '2026-07-04T00:00:00.000Z',
    sampledEnd: '2026-09-18T00:00:00.000Z',
  })).some((l) => l.includes('the sample starts 12 days in')),
  true,
);



// ---------------------------------------------------------------------------
// The sponsored split, and the description that replaced the provenance
// ---------------------------------------------------------------------------

const promoted = report({
  videos: [
    video({ id: 'l1', views: 90_000 }), video({ id: 'l2', views: 50_000 }),
    video({ id: 'l3', views: 10_000 }), video({ id: 'l4', views: 5_000 }),
    video({ id: 's1', format: 'short', seconds: 30, views: 70_000 }),
    video({ id: 'u1', format: 'unknown', seconds: null, views: 1_000 }),
  ],
  promotions: [promotion({ postId: 'l1' }), promotion({ postId: 'l3' }), promotion({ postId: 's1' })],
});
const cols = sponsoredColumns(promoted);
check('sponsored uploads split by deliverable', [cols.long.map((v) => v.id), cols.short.map((v) => v.id)], [['l1', 'l3'], ['s1']]);
check('and the caller is told they are sponsored', cols.sponsored, true);
check('ordered by views, highest first', cols.long[0].id, 'l1');
// A duration the metadata never reported is not a Short.
check('an unknown duration is in neither column', [...cols.long, ...cols.short].some((v) => v.id === 'u1'), false);

const unsponsored = sponsoredColumns(report({
  videos: [video({ id: 'a', views: 10 }), video({ id: 'b', views: 20 }), video({ id: 's', format: 'short', seconds: 20, views: 5 })],
}));
check('with nothing flagged it falls back to the sample', unsponsored.long.map((v) => v.id), ['b', 'a']);
check('and says the columns are not sponsored', unsponsored.sponsored, false);
check(
  'one flagged upload "carries", it does not "carry"',
  code('src/components/channel/ChannelReport.tsx').includes("disclosedTotal === 1 ? ' carries' : 's carry'"),
  true,
);
check(
  'the report states the fallback rather than implying a sponsorship',
  prose('src/components/channel/ChannelReport.tsx').includes('these are the most-viewed of each length'),
  true,
);
check(
  'a hidden view count never ranks above a reported one',
  sponsoredColumns(report({
    videos: [video({ id: 'hidden', views: null }), video({ id: 'known', views: 1 })],
  })).long.map((v) => v.id),
  ['known', 'hidden'],
);
// Paging must not cost the export its evidence.
const pager = read('src/components/report/PagedUploads.tsx');
check('off-page uploads stay in the DOM for print', pager.includes("'hidden print:flex'"), true);
check('and the pager itself does not print', pager.includes('print:hidden'), true);
check('no pager where there is nothing to page', pager.includes('pages > 1'), true);
/*
 * A CLIENT COMPONENT CANNOT BE HANDED A FUNCTION.
 *
 * The first version passed `reasonFor` — a callback — from the server report
 * into this client pager. It type-checked, it linted, it BUILT, and the page
 * threw at render: "Functions cannot be passed directly to Client Components".
 * Nothing in a static suite catches that, so the shape is pinned instead.
 */
check('the pager takes sentences, not a callback', pager.includes('items: { video: VideoEvidence; reason: string }[]'), true);
check('and the report passes none', code('src/components/channel/ChannelReport.tsx').includes('reasonFor='), false);

// The five lines of provenance moved; they are not gone.
const markupNow = code('src/components/channel/ChannelReport.tsx');
// Twice only: the empty-collection branch, where the summary IS the content
// because there is no sample to describe, and the appendix. Never above the
// figures, which is where it used to open.
check('the summary renders in exactly two places', (markupNow.match(/\{summary\.map\(/g) ?? []).length, 2);
check(
  'the first is the empty-collection branch',
  markupNow.indexOf("depth === 'empty'") < markupNow.indexOf('{summary.map(') &&
    markupNow.indexOf('{summary.map(') < markupNow.indexOf('report-metrics'),
  true,
);
check(
  'and the second is the appendix',
  markupNow.lastIndexOf('{summary.map(') > markupNow.indexOf('report-appendix'),
  true,
);
check(
  'the description takes its place above the charts',
  markupNow.indexOf('{description.text}') < markupNow.indexOf('<CompositionBars'),
  true,
);
check('but the appendix still carries every line', markupNow.includes('What this collection found'), true);
check(
  'a thin sample still warns where the figures are read',
  markupNow.includes('{thin}'),
  true,
);

const described = channelDescription(report({
  videos: [
    video({ id: 'a', title: 'Grinder review one' }),
    video({ id: 'b', title: 'Grinder review two' }),
    video({ id: 'c', title: 'Grinder comparison' }),
  ],
}));
check('the description names what the channel makes', described?.source, 'metadata');
check('and is built from the classification, not a model', described?.text.includes('Mostly review'), true);
check('naming the recurring subject', described?.text.includes('grinder'), true);
const modelled = channelDescription(report({
  contentProfile: { summary: 'Home coffee equipment, mostly hands-on.', topics: [], questions: [] },
}));
check('a stored model summary is used when the gate allows one', modelled?.source, 'model');
check('and is not rewritten', modelled?.text, 'Home coffee equipment, mostly hands-on.');
check('an empty sample describes nothing', channelDescription(report({ videos: [] })), null);
check(
  'neither source claims anything was watched',
  prose('src/components/channel/ChannelReport.tsx').includes('Nothing was watched'),
  true,
);


console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
