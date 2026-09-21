import type { Metadata } from 'next';
import Link from 'next/link';

import { ChannelReport } from '@/components/channel/ChannelReport';
import { PrintReport } from '@/components/channel/ReportActions';
import { RelevanceReport } from '@/components/report/RelevanceReport';
import { WorkspaceLayout } from '@/components/shell/WorkspaceLayout';
import type { ChannelReportView } from '@/lib/channel/report';
import { requirementMatrix, type RelevanceContext } from '@/lib/relevance/requirements';
import { AMENDMENT_ACCEPTED } from '@/lib/report/policy';
import type { CommentCluster, Promotion } from '@/types';

export const metadata: Metadata = { title: 'Sample report' };
export const dynamic = 'force-dynamic';

/**
 * Both reports, on invented data, through the real components.
 *
 * THE SAMPLE RUNS THE PRODUCT. The matrix below is produced by
 * `requirementMatrix` against these fixtures — not written out by hand — so a
 * sample that looks better than the product is impossible by construction, and
 * a regression in the analysis shows up here first.
 *
 * COHERENT, WITH REAL UNKNOWNS. The fictional brand's categories match some
 * uploads and not others, one upload carries a paid-promotion flag whose
 * sponsor is deliberately unidentified, one reports no view count, and the
 * objective and language rows come back unverified — because that is what this
 * evidence honestly supports and a sample of nothing but green ticks would
 * teach the wrong thing.
 *
 * NO REAL CREATOR IS IMPLIED. The ids are obviously synthetic, so the generated
 * watch links do not resolve to anybody's video.
 */

const NOW = Date.parse('2026-09-18T00:00:00.000Z');
const DAY = 86_400_000;

/**
 * A fixture that exercises the states a real collection produces.
 *
 * DELIBERATELY AWKWARD IN FIVE PLACES, because a sample of nine tidy rows
 * demonstrates a renderer and not a report: one upload reports no view count,
 * one reports no duration, one is a broadcast that is still running, one is a
 * premiere nobody can watch yet, and two share a subject so the composition
 * chart has something to group. Every figure is invented.
 */
const VIDEOS: ChannelReportView['videos'] = [
  { id: 'sample-aeropress', title: 'Aeropress vs pour-over: which grinder setting actually matters', publishedAt: new Date(NOW - 6 * DAY).toISOString(), views: 31_400, seconds: 780, format: 'long', state: 'published', description: 'Side by side on the same beans.' },
  { id: 'sample-grinder', title: 'Hand grinder review: 40 shots so you do not have to', publishedAt: new Date(NOW - 19 * DAY).toISOString(), views: 18_200, seconds: 640, format: 'long', state: 'published', description: 'Paid promotion. Full review of the grinder.' },
  { id: 'sample-travel', title: '여행용 그라인더 3개월 사용기: 집에서 에스프레소 내리기', publishedAt: new Date(NOW - 33 * DAY).toISOString(), views: 12_050, seconds: 520, format: 'long', state: 'published', description: '3개월 동안 써본 기록.' },
  { id: 'sample-short1', title: 'Grind size in 40 seconds', publishedAt: new Date(NOW - 41 * DAY).toISOString(), views: 96_800, seconds: 44, format: 'short', state: 'published', description: '' },
  { id: 'sample-kettle', title: 'Kettle review: the one nobody needs (but I bought anyway)', publishedAt: new Date(NOW - 58 * DAY).toISOString(), views: 9_400, seconds: 410, format: 'long', state: 'published', description: '' },
  // Supports the brand's category outright.
  { id: 'sample-kit', title: 'Coffee equipment I actually kept after two years of use', publishedAt: new Date(NOW - 47 * DAY).toISOString(), views: 22_700, seconds: 900, format: 'long', state: 'published', description: 'Long-term notes on the whole setup.' },
  // Names an avoided topic in order to REFUSE it — which is exactly why a
  // conflicting row tells a buyer to read the video rather than decide.
  { id: 'sample-crypto', title: 'Why I turn down crypto sponsorships', publishedAt: new Date(NOW - 64 * DAY).toISOString(), views: 7_300, seconds: 300, format: 'long', state: 'published', description: '' },
  // Reports no view count. Kept out of the plot and named as unknown, never 0.
  { id: 'sample-nocount', title: 'Workshop tour, unlisted re-upload', publishedAt: new Date(NOW - 71 * DAY).toISOString(), views: null, seconds: 300, format: 'long', state: 'published', description: '' },
  // No duration in the metadata: outside the format comparison, not a Short.
  { id: 'sample-nodur', title: 'Answering your brewing questions', publishedAt: new Date(NOW - 80 * DAY).toISOString(), views: 4_120, seconds: null, format: 'unknown', state: 'published', description: '' },
  // Still running. Its count is not comparable with a finished upload's.
  { id: 'sample-live', title: 'Live: Sunday morning brew along', publishedAt: new Date(NOW - 1 * DAY).toISOString(), views: 612, seconds: null, format: 'unknown', state: 'live', description: '' },
  // Nobody has watched it yet. Its 0 is a state, not a result.
  { id: 'sample-upcoming', title: 'Premiere: the espresso machine comparison', publishedAt: new Date(NOW + 2 * DAY).toISOString(), views: 0, seconds: null, format: 'unknown', state: 'upcoming', description: '' },
];

const SAMPLED = VIDEOS.map((v) => Date.parse(v.publishedAt));

const PROMOTIONS: Promotion[] = [
  {
    postId: 'sample-grinder', platform: 'youtube', title: 'I ground 40 shots with a hand grinder so you do not have to',
    url: null, publishedAt: new Date(NOW - 19 * DAY).toISOString(),
    // Deliberately unidentified: YouTube's flag marks the video, not the payer.
    brand: null, product: null, category: null, disclosure: 'explicit',
  } as Promotion,
];

/**
 * Illustrative comment themes.
 *
 * Rendered only where the derived-analysis approval is configured, exactly as a
 * real report's would be — the sample reads the same flag rather than forcing
 * the section on, so what it shows is what this deployment can actually do.
 */
const CLUSTERS: CommentCluster[] = [
  {
    id: 'sample-c1',
    label: 'Questions about grind size for espresso',
    share: 0.34,
    commentCount: 68,
    sentiment: null,
    exampleComment: 'What setting are you on for a 18g dose?',
    comments: [
      { text: 'What setting are you on for a 18g dose?', postTitle: 'Grind size in 40 seconds', url: null, likes: 12, publishedAt: new Date(NOW - 40 * DAY).toISOString() },
    ],
  },
  {
    id: 'sample-c2',
    label: 'Asking whether it works for travel',
    share: 0.19,
    commentCount: 38,
    sentiment: null,
    exampleComment: 'Would this survive being thrown in a rucksack?',
    comments: [
      { text: 'Would this survive being thrown in a rucksack?', postTitle: '집에서 에스프레소 내리기', url: null, likes: 5, publishedAt: new Date(NOW - 32 * DAY).toISOString() },
    ],
  },
] as CommentCluster[];

const REPORT: ChannelReportView = {
  channelId: 'sample',
  title: 'Everyday Workshop',
  handle: '@everydayworkshop-sample',
  avatar: null,
  description: 'A fictional channel about home coffee equipment and weekend projects.',
  subscribers: 42_000,
  fetchedAt: new Date(NOW).toISOString(),
  requestedStart: new Date(NOW - 90 * DAY).toISOString(),
  requestedEnd: new Date(NOW).toISOString(),
  sampledStart: new Date(Math.min(...SAMPLED)).toISOString(),
  sampledEnd: new Date(Math.max(...SAMPLED)).toISOString(),
  windowDays: 90,
  videos: VIDEOS,
  // The corpus exists either way; whether it can be CLASSIFIED is the gate.
  comments: AMENDMENT_ACCEPTED ? 201 : 0,
  unreadable: 1,
  truncated: false,
  promotions: PROMOTIONS,
  clusters: AMENDMENT_ACCEPTED ? CLUSTERS : [],
  derivedAllowed: AMENDMENT_ACCEPTED,
  analysedAt: AMENDMENT_ACCEPTED ? new Date(NOW).toISOString() : null,
  contentProfile: null,
};

const CONTEXT: RelevanceContext = {
  brand: {
    id: 'sample-brand',
    name: 'Northbeam Coffee',
    sells: 'A hand grinder for people making espresso at home, around £180.',
    categories: ['coffee equipment', 'home appliances'],
    customerNeeds: 'Café-level espresso without a benchtop grinder',
    contentLanguages: ['en'],
    markets: ['GB'],
  },
  campaign: {
    id: 'sample-campaign',
    name: 'Spring travel grinder launch',
    product: 'The C40 travel grinder',
    useCase: 'Grinding for espresso while travelling',
    objective: 'Product understanding before launch',
    avoidTopics: 'gambling, crypto',
  },
};

export default async function Sample() {
  const rows = requirementMatrix(REPORT, CONTEXT);

  return (
    <WorkspaceLayout
      header={{
        eyebrow: 'Channel analysis',
        title: 'Sample report',
        meta: <span>A fictional creator, so the two reports can be read before analysing anything.</span>,
        secondary: <PrintReport />,
      }}
      bare
    >
      <main className="report-page mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <p className="mb-4 rounded-lg border border-amber/40 bg-amber-wash px-4 py-3 text-[13px] font-medium text-ink">
          Sample · a fictional creator and a fictional brand. Every figure, title and link here is
          invented, and none refers to a real channel.
        </p>
        <ChannelReport report={REPORT} />

        <div className="mt-10 border-t border-line pt-8">
          <p className="mb-4 text-[12px] leading-relaxed text-ink-muted">
            Below is the second report: the same evidence read for one brand. It is a separate
            document — the channel report above makes no claim about any brand.
          </p>
          <RelevanceReport
            report={REPORT}
            context={CONTEXT}
            rows={rows}
            narrative={null}
            freshness="current"
            writtenAt={REPORT.fetchedAt}
            writtenAgainst={REPORT.fetchedAt}
          />
        </div>

        <p className="mt-8 text-[12px] text-ink-muted">
          <Link href="/channels" className="text-indigo underline-offset-4 hover:underline">
            Analyse a real channel
          </Link>
        </p>
      </main>
    </WorkspaceLayout>
  );
}
