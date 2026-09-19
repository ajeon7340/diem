import 'server-only';

import { cookies } from 'next/headers';

import { censusRisk, deriveBrandSafety } from '@/lib/report/safety';
import { audienceClimate } from '@/lib/report/climate';
import { aggregateFromCells, type IntentCells } from '@/lib/report/intent';
import type { QueueItem } from '@/lib/report/moderation';
import { stripCrossOwnerAggregates } from '@/lib/report/policy';
import type {
  AccessRequest,
  AIReport,
  Creator,
  DirectoryListing,
  InboundBrief,
  Offer,
  Viewer,
} from '@/types';

/**
 * Demo data, used only when Supabase env vars are absent so the app runs on a
 * fresh clone. The gatekeeper never mixes fixtures with live rows — it is one
 * source or the other.
 *
 * `adfit_demo_role` lets a reviewer walk all three view modes without an auth
 * provider. It is read *only* on this path; with Supabase configured, the
 * viewer comes from the session cookie and the cookie below is ignored.
 */
export const DEMO_ROLE_COOKIE = 'adfit_demo_role';

export type DemoRole = 'anonymous' | 'free_agency' | 'pro_agency' | 'creator';

export const DEMO_TOKENS = {
  valid: '00000000-0000-4000-8000-000000000001',
  expired: '00000000-0000-4000-8000-000000000002',
  invalid: '11111111-1111-4111-8111-111111111111',
} as const;

const CREATOR_A_ID = 'c0000000-0000-4000-8000-00000000000a';
const CREATOR_B_ID = 'c0000000-0000-4000-8000-00000000000b';
const CREATOR_C_ID = 'c0000000-0000-4000-8000-00000000000c';
const CREATOR_D_ID = 'c0000000-0000-4000-8000-00000000000d';
/**
 * The only entry built from a real channel rather than invented.
 *
 * Everything here was read from public YouTube data on 2026-09-12: subscriber
 * count, 30 video titles and view counts. Nothing else. Demographics need OAuth,
 * and comment text needs a Data API key — both are null rather than guessed,
 * which is the whole point of including her.
 */
const CREATOR_E_ID = 'c0000000-0000-4000-8000-00000000000e';
/**
 * @가재맨 — the second profile built from a live channel, and the one the
 * comment-climate read exists for.
 *
 * It is a 판독 / call-out channel: the video IS a third party being confronted,
 * and the section fills with a crowd attacking that person rather than the
 * creator. Kept in the demo because every rule in the report that could be
 * broken by that shape is broken by it — the creator is a target of nothing and
 * is marked down for nothing, the risk census is the only pass that has run, and
 * the atmosphere is the answer a buyer actually wants.
 */
const CREATOR_F_ID = 'c0000000-0000-4000-8000-00000000000f';

/**
 * Exported for `scripts/seed.ts` only — the seed writes these same objects into
 * a real Supabase project so the database path renders the same pages the
 * fixture path does. Nothing in the app should import them directly: the
 * accessors below are what enforce directory visibility and the locked-metric
 * projection, and a caller reaching past them gets rows it is not entitled to.
 */
export const CREATORS: Creator[] = [
  {
    id: CREATOR_A_ID,
    handle: 'marahwoods',
    displayName: 'Marah Woods',
    avatarUrl: null,
    niche: 'Consumer Tech & Workspace',
    bio: 'Long-form reviews of the tools engineers actually keep. Weekly on YouTube, build logs on Instagram.',
    isVerified: true,
    isDirectoryVisible: true,
    minimumBudget: 18000,
    budgetMin: 18000,
    budgetMax: null,
    budgetNegotiable: false,
    totalFollowers: 842_300,
    platforms: [
      {
        platform: 'youtube',
        handle: '@marahwoods',
        followerCount: 611_000,
        statsSummary: { medianViews: 184_000, postsAnalyzed: 42 },
      },
      {
        platform: 'instagram',
        handle: '@marah.builds',
        followerCount: 231_300,
        statsSummary: { medianViews: 42_000, postsAnalyzed: 60 },
      },
    ],
    teaserHighlights: [
      { label: 'Top 3% Purchase Intent', tone: 'emerald' },
      { label: 'Ad Fatigue: Low', tone: 'emerald' },
      { label: 'High Tech Affinity', tone: 'indigo' },
    ],
    hasReport: true,
    lastAnalyzedAt: '2026-09-08T11:20:00.000Z',
  },
  {
    id: CREATOR_B_ID,
    handle: 'quietcircuit',
    displayName: 'Quiet Circuit',
    avatarUrl: null,
    niche: 'Audio & Listening',
    bio: 'Measurement-first headphone reviews. No sponsorships without a published test suite.',
    isVerified: true,
    // Opted out of the directory: reachable at /@quietcircuit, invisible to
    // agencies, never instantly unlocked.
    isDirectoryVisible: false,
    minimumBudget: null,
    budgetMin: null,
    budgetMax: null,
    budgetNegotiable: true,
    totalFollowers: 120_000,
    platforms: [
      {
        platform: 'youtube',
        handle: '@quietcircuit',
        followerCount: 120_000,
        statsSummary: { medianViews: 51_000, postsAnalyzed: 28 },
      },
    ],
    teaserHighlights: [
      { label: 'Ad Fatigue: Moderate', tone: 'slate' },
      { label: 'High Trust Signal', tone: 'indigo' },
    ],
    hasReport: true,
    lastAnalyzedAt: '2026-09-06T09:00:00.000Z',
  },
  {
    id: CREATOR_C_ID,
    handle: 'fernpress',
    displayName: 'Fern Press',
    avatarUrl: null,
    niche: 'Stationery & Paper',
    bio: 'Fountain pens, notebooks, and the occasional letterpress rabbit hole. Four months in.',
    isVerified: true,
    isDirectoryVisible: true,
    minimumBudget: 1200,
    budgetMin: 1200,
    budgetMax: null,
    budgetNegotiable: false,
    totalFollowers: 8_400,
    platforms: [
      {
        platform: 'instagram',
        handle: '@fernpress',
        followerCount: 8_400,
        statsSummary: { medianViews: 3_100, postsAnalyzed: 22 },
      },
    ],
    teaserHighlights: [{ label: 'New — limited data', tone: 'slate' }],
    hasReport: true,
    lastAnalyzedAt: '2026-09-11T08:00:00.000Z',
  },
  {
    id: CREATOR_D_ID,
    handle: 'northvane',
    displayName: 'Northvane',
    avatarUrl: null,
    niche: 'Outdoor & Gear',
    bio: 'Long-distance hiking, filmed badly on purpose. Comments off — I answer on the newsletter instead.',
    isVerified: true,
    isDirectoryVisible: true,
    minimumBudget: 9_000,
    budgetMin: 9_000,
    budgetMax: null,
    budgetNegotiable: true,
    totalFollowers: 318_000,
    platforms: [
      {
        platform: 'youtube',
        handle: '@northvane',
        followerCount: 318_000,
        statsSummary: { medianViews: 96_000, postsAnalyzed: 18 },
      },
    ],
    teaserHighlights: [{ label: 'Comments disabled', tone: 'slate' }],
    hasReport: true,
    lastAnalyzedAt: '2026-09-11T16:00:00.000Z',
  },
  {
    id: CREATOR_E_ID,
    handle: 'jooshica',
    displayName: 'Jooshica',
    avatarUrl: null,
    niche: 'Beauty & Lifestyle',
    bio: 'Korean beauty and lifestyle creator based in NYC. Also on TikTok (5M+) and Instagram.',
    // Not verified: verification requires confirmed 1st-party OAuth data, and
    // this profile was assembled from public data only.
    isVerified: false,
    isDirectoryVisible: true,
    minimumBudget: null,
    budgetMin: null,
    budgetMax: null,
    budgetNegotiable: true,
    totalFollowers: 2_910_000,
    platforms: [
      {
        platform: 'youtube',
        handle: '@jooshica6178',
        followerCount: 2_910_000,
        statsSummary: { medianViews: 644_988, postsAnalyzed: 50 },
      },
    ],
    teaserHighlights: [
      { label: 'Shorts-led · very low product intent', tone: 'slate' },
      { label: 'Critique amplified 3.3x', tone: 'slate' },
    ],
    hasReport: true,
    lastAnalyzedAt: '2026-09-12T00:00:00.000Z',
  },
  // REAL CHANNEL. channels.list for @가재맨 (UCnkytUgy0CtWd06up9CjNxg) on
  // 2026-09-15: 474,000 subscribers, 1,379 uploads, 420,937,223 lifetime views,
  // channel opened 2015-12-10. Nothing here is invented and nothing that was
  // not measured is filled in.
  {
    id: CREATOR_F_ID,
    handle: 'gajaeman',
    displayName: '가재맨',
    avatarUrl: null,
    niche: 'Gaming & Commentary',
    bio: '롤 실력방송. 주 3회 업로드, 화·목·토 생방송. Long-form League play and call-out episodes.',
    // Public data only, exactly like @jooshica: verification needs confirmed
    // first-party OAuth and no API key substitutes for it.
    isVerified: false,
    isDirectoryVisible: true,
    minimumBudget: null,
    budgetMin: null,
    budgetMax: null,
    budgetNegotiable: true,
    totalFollowers: 474_000,
    platforms: [
      {
        platform: 'youtube',
        handle: '@가재맨',
        followerCount: 474_000,
        statsSummary: { medianViews: 84_686, postsAnalyzed: 20 },
      },
    ],
    // Says what the buyer has to decide about, not whether it is good.
    teaserHighlights: [
      { label: 'Call-out format · combative section', tone: 'slate' },
      { label: 'Risk census only — no intent pass', tone: 'slate' },
    ],
    hasReport: true,
    lastAnalyzedAt: '2026-09-15T00:00:00.000Z',
  },
];

/**
 * Placeholder overwritten by `deriveBrandSafety` in the normalisation pass
 * below. The fixtures must not carry a hand-typed safety figure — a typed one
 * is precisely what contradicted the flags beneath it and got the whole score
 * rewritten. See src/lib/report/safety.ts.
 */
const UNDERIVED_CLIMATE: AIReport['climate'] = {
  label: null,
  traits: [],
  summary: '',
  basis: {
    hostileShare: null,
    scanned: null,
    criticiseShare: null,
    praiseShare: null,
    praiseRatio: null,
    classified: null,
  },
  rubricVersion: '',
};

const UNDERIVED: AIReport['brandSafety'] = {
  raised: 0,
  checked: 0,
  worst: null,
  rubricVersion: '',
};

/**
 * Exported for `scripts/seed.ts` only — the seed writes these same objects into
 * a real Supabase project so the database path renders the same pages the
 * fixture path does. Nothing in the app should import them directly: the
 * accessors below are what enforce directory visibility and the locked-metric
 * projection, and a caller reaching past them gets rows it is not entitled to.
 */
export const REPORTS: Record<string, AIReport> = {
  [CREATOR_A_ID]: {
    creatorId: CREATOR_A_ID,
    demographics: {
      ageBands: [
        { label: '18–24', share: 0.19 },
        { label: '25–34', share: 0.47 },
        { label: '35–44', share: 0.24 },
        { label: '45+', share: 0.1 },
      ],
      genderSplit: [
        { label: 'Male', share: 0.61 },
        { label: 'Female', share: 0.36 },
        { label: 'Other / undisclosed', share: 0.03 },
      ],
      topCountries: [
        { label: 'United States', share: 0.41 },
        { label: 'United Kingdom', share: 0.13 },
        { label: 'Germany', share: 0.09 },
        { label: 'Canada', share: 0.08 },
        { label: 'South Korea', share: 0.06 },
      ],
      activeAudienceRate: 0.68,
    },
    topCommentClusters: [
      {
        id: 'cl_buy',
        label: 'Asking where to buy',
        share: 0.28,
        commentCount: 3_316,
        sentiment: 0.72,
        intent: 'buy',
        object: null,
        keyphrases: ['link', 'where to buy', 'in stock', 'shipping', 'discount code'],
        exampleComment: 'Is there a link for the stand? Been looking for exactly this for months.',
        comments: [
          {
            id: 'c_buy_1',
            text: 'Is there a link for the stand? Been looking for exactly this for months.',
            platform: 'youtube',
            postId: 'dQw4w9WgXcQ',
            postTitle: 'The desk setup I actually kept for a year',
            likes: 412,
            publishedAt: '2026-08-22T14:11:00.000Z',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&lc=UgxKREWxIgDrGHnJ6NB4AaABAg',
          },
          {
            id: 'c_buy_2',
            text: 'Third video in a row where I ended up buying the thing. My wallet hates this channel.',
            platform: 'youtube',
            postId: 'kJQP7kiw5Fk',
            postTitle: 'Everything on my desk, ranked by regret',
            likes: 1_884,
            publishedAt: '2026-07-30T09:02:00.000Z',
            basis: 'most_liked',
            url: 'https://www.youtube.com/watch?v=kJQP7kiw5Fk&lc=Ugz9bHkWqLmNoPqRsTu4AaABAg',
          },
          {
            id: 'c_buy_3',
            text: 'Does the EU store stock this one? Everything ships from the US and the duty kills it.',
            platform: 'instagram',
            postId: 'C8xKp2LtRmn',
            postTitle: 'Build log 41',
            likes: 63,
            publishedAt: '2026-09-06T18:40:00.000Z',
            basis: 'most_recent',
            url: 'https://www.instagram.com/p/C8xKp2LtRmn/',
          },
        ],
      },
      {
        id: 'cl_spec',
        label: 'Spec and comparison questions',
        share: 0.24,
        commentCount: 2_842,
        sentiment: 0.31,
        intent: 'ask',
        object: null,
        keyphrases: ['vs', 'previous gen', 'worth upgrading', 'specs', 'compared to'],
        exampleComment: 'How does this hold up against the previous gen for daily driving?',
        comments: [
          {
            id: 'c_spec_1',
            text: 'How does this hold up against the previous gen for daily driving?',
            platform: 'youtube',
            postId: 'dQw4w9WgXcQ',
            postTitle: 'The desk setup I actually kept for a year',
            likes: 204,
            publishedAt: '2026-08-23T07:55:00.000Z',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&lc=UgyTfRq2WsXcVbNm3Kl4AaABAg',
          },
          {
            id: 'c_spec_2',
            text: 'Would love a side by side with the cheaper one. Half the price, is it half as good?',
            platform: 'youtube',
            postId: 'kJQP7kiw5Fk',
            postTitle: 'Everything on my desk, ranked by regret',
            likes: 921,
            publishedAt: '2026-08-01T12:18:00.000Z',
            basis: 'most_liked',
            url: 'https://www.youtube.com/watch?v=kJQP7kiw5Fk&lc=UgxAsDfGhJkLzXcVbNm4AaABAg',
          },
        ],
      },
      {
        id: 'cl_trust',
        label: 'Trust in the review process',
        share: 0.21,
        commentCount: 2_487,
        sentiment: 0.85,
        intent: 'praise',
        object: null,
        keyphrases: ['sponsored', 'disclosure', 'honest', 'returned it', 'not an ad'],
        exampleComment: 'Appreciate that you flag the sponsored segments up front every time.',
        comments: [
          {
            id: 'c_trust_1',
            text: 'Appreciate that you flag the sponsored segments up front every time.',
            platform: 'youtube',
            postId: 'kJQP7kiw5Fk',
            postTitle: 'Everything on my desk, ranked by regret',
            likes: 2_140,
            publishedAt: '2026-07-31T16:30:00.000Z',
            basis: 'most_liked',
            url: 'https://www.youtube.com/watch?v=kJQP7kiw5Fk&lc=UgwQwErTyUiOpAsDfGh4AaABAg',
          },
          {
            id: 'c_trust_2',
            text: 'The fact you sent one back on camera is why I trust the rest of the list.',
            platform: 'youtube',
            postId: 'dQw4w9WgXcQ',
            postTitle: 'The desk setup I actually kept for a year',
            likes: 508,
            publishedAt: '2026-08-24T20:07:00.000Z',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&lc=UgzZxCvBnMqWeRtY7Ui4AaABAg',
          },
        ],
      },
      {
        id: 'cl_price',
        label: 'Price sensitivity',
        share: 0.17,
        commentCount: 2_013,
        sentiment: -0.22,
        intent: 'criticise',
        object: null,
        keyphrases: ['expensive', 'hard to justify', 'wait for a sale', 'overpriced'],
        exampleComment: 'Looks great but that price is hard to justify right now.',
        comments: [
          {
            id: 'c_price_1',
            text: 'Looks great but that price is hard to justify right now.',
            platform: 'youtube',
            postId: 'dQw4w9WgXcQ',
            postTitle: 'The desk setup I actually kept for a year',
            likes: 776,
            publishedAt: '2026-08-22T19:44:00.000Z',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&lc=UgwPoIuYtReWqAsDfGh4AaABAg',
          },
          {
            id: 'c_price_2',
            text: 'Every one of these is a great product at 60% of the asking price.',
            platform: 'instagram',
            postId: 'C8xKp2LtRmn',
            postTitle: 'Build log 41',
            likes: 149,
            publishedAt: '2026-09-05T11:26:00.000Z',
            basis: 'most_liked',
            url: 'https://www.instagram.com/p/C8xKp2LtRmn/',
          },
        ],
      },
      {
        id: 'cl_offtopic',
        label: 'Off-topic and banter',
        share: 0.1,
        commentCount: 1_184,
        sentiment: 0.12,
        intent: 'react',
        object: null,
        keyphrases: ['plant', 'cat', 'music', 'haircut'],
        exampleComment: 'That desk plant has grown so much since episode 40.',
        comments: [],
      },
    ],
    commentAxes: null,
    sentimentScore: 78.4,
    purchaseIntentRate: 0.281,
    raisedFlags: 1,
    checkedFlags: 3, // replaced by deriveBrandSafety below
    engagementRate: 0.062,
    adFatigueLevel: 'low',
    aiSummary:
      '25–44 professional buyers who convert on trust, not discounts.',
    benchmarks: {
      cohortLabel: 'Consumer Tech · 500k–1M followers',
      cohortSize: 214,
      metrics: [
        { metric: 'purchaseIntent', value: 0.281, cohortMedian: 0.112, percentile: 97 },
        { metric: 'sentiment', value: 78.4, cohortMedian: 64.1, percentile: 88 },
        { metric: 'brandSafety', value: 94.1, cohortMedian: 86.0, percentile: 91 },
        { metric: 'engagement', value: 0.062, cohortMedian: 0.041, percentile: 79 },
      ],
    },
    costEfficiency: {
      currency: 'USD',
      basisBudget: 18_000,
      medianViews: 184_000,
      estimatedCpm: 97.83,
      costPerThousandEngaged: 1578.0,
      cohortMedianCpm: 112.4,
      cohortMedianRetention: 0.87,
    },
    sponsoredPerformance: {
      sponsoredPostsAnalyzed: 9,
      windowDays: 180,
      organicMedianViews: 184_000,
      sponsoredMedianViews: 171_000,
      viewRetention: 0.929,
      organicSentiment: 79.1,
      sponsoredSentiment: 76.8,
    },
    brandSafety: UNDERIVED,
    // Both overwritten in the normalisation pass below.
    climate: UNDERIVED_CLIMATE,
    commentRegister: null,
    // No risk scan yet — empty means "not scanned", never "clean".
    commentRisks: [
      // Synthetic, unlike jooshica's, which came from a real scan. Kept small
      // and kept CONSISTENT WITH THE QUEUE below: a creator reading "4 flagged"
      // on their report and finding two in the queue would be right to
      // distrust both numbers.
      { category: 'spam', count: 3, byCreator: 0, hidden: 1, example: 'Check my channel for free gear 🔗' },
      { category: 'harassment', count: 1, byCreator: 0, hidden: 0, example: '[stand-in] nobody asked, go away' },
    ],
    moderation: {
      commentsScanned: 2_140,
      foundTotal: 4,
      visibleTotal: 3,
      hiddenTotal: 1,
      lastModeratedAt: '2026-09-02T00:00:00.000Z',
    },
    brandSafetyFlags: [
      {
        category: 'Profanity',
        severity: 'low',
        incidence: 0.011,
        basis: 'comments',
        endorsement: null,
        note: 'Mild language in comments; none in the creator’s own audio.',
      },
      {
        category: 'Political content',
        severity: 'none',
        incidence: 0,
        basis: 'posts',
        endorsement: null,
        note: 'None in the analysed window.',
      },
      {
        category: 'Competitor conflict',
        severity: 'medium',
        incidence: 0.22,
        basis: 'sponsored_posts',
        endorsement: null,
        note: 'Desk-accessory integration 6 weeks ago — check exclusivity.',
      },
      {
        // Fictional fixture, and deliberately the OPPOSITE case to jooshica:
        // a creator whose declarations track their commercial content, which
        // `assessDisclosure` rates `low` and says so rather than staying quiet.
        category: 'Disclosure rate',
        severity: 'low',
        incidence: 0.06,
        basis: 'posts',
        endorsement: null,
        note: '9 of 150 posts declare a paid placement against 18% that name a brand — declarations here track the commercial content.',
      },
    ],
    recommendedActions: [
      { kind: 'do', text: 'Lead with durability — the trust cluster rewards it.' },
      { kind: 'do', text: 'Pin a purchase link. 28% of comments ask for one.' },
      { kind: 'do', text: 'Buy long-form over shorts: 93% sponsored retention.' },
      { kind: 'avoid', text: 'Discount framing above ~$300. 17% already resist the price.' },
      { kind: 'avoid', text: 'Exclusivity under 60 days — a rival ran 6 weeks ago.' },
    ],
    // Nine paid placements in the window; the five most recent are stored
    // with the promotions listed above.
    promotions: [
      {
        postId: 'yt_marah_warp',
        platform: 'youtube',
        title: 'Every terminal I tried this year, ranked',
        url: 'https://www.youtube.com/watch?v=marah_warp',
        publishedAt: '2026-08-19T00:00:00.000Z',
        brand: 'Warp',
        product: 'Warp terminal',
        category: 'Developer tools',
        disclosure: 'explicit',
        views: 196000,
        sponsoredRetention: 0.96,
      },
      {
        postId: 'yt_marah_ugmonk',
        platform: 'youtube',
        title: 'The desk setup I actually kept',
        url: 'https://www.youtube.com/watch?v=marah_ugmonk',
        publishedAt: '2026-07-28T00:00:00.000Z',
        brand: 'Ugmonk',
        product: 'Gather desk system',
        category: 'Desk accessories',
        disclosure: 'explicit',
        views: 241000,
        sponsoredRetention: 1.09,
      },
      {
        postId: 'yt_marah_shure',
        platform: 'youtube',
        title: 'Mic upgrade, three months in',
        url: 'https://www.youtube.com/watch?v=marah_shure',
        publishedAt: '2026-06-14T00:00:00.000Z',
        brand: 'Shure',
        product: 'MV7+',
        category: 'Audio',
        disclosure: 'explicit',
        views: 172000,
        sponsoredRetention: 0.93,
      },
      {
        postId: 'ig_marah_keychron',
        platform: 'instagram',
        title: 'Keyboard swap',
        url: 'https://www.instagram.com/p/marah_keychron',
        publishedAt: '2026-05-30T00:00:00.000Z',
        brand: 'Keychron',
        product: 'Q3 Max',
        category: 'Desk accessories',
        disclosure: 'affiliate',
        views: 88000,
        sponsoredRetention: null,
      },
      {
        postId: 'yt_marah_dell',
        platform: 'youtube',
        title: 'Is a 6K display worth it for code?',
        url: 'https://www.youtube.com/watch?v=marah_dell',
        publishedAt: '2026-05-02T00:00:00.000Z',
        brand: 'Dell',
        product: 'UltraSharp 32',
        category: 'Displays',
        disclosure: 'explicit',
        views: 203000,
        sponsoredRetention: 0.91,
      },
    ],
    intent: {
      rate: 0.281,
      ciLow: 0.273,
      ciHigh: 0.2892,
      basis: 'all_comments',
      commercialDensity: 0.281,
      commentsScored: 11842,
      postsScored: 40,
      productPostsAnalyzed: 9,
      dispersion: null,
      rubricVersion: 'intent-rubric-1',
    },
    platformBreakdown: [
      {
        platform: 'youtube',
        followers: 611_000,
        medianViews: 184_000,
        engagementRate: 0.071,
        sentimentScore: 80.2,
        purchaseIntentRate: 0.334,
        commentsAnalyzed: 9_120,
        sponsoredRetention: 0.941,
        estimatedCpm: 97.83,
        dominantIntent: 'buy',
        bestFormat: 'Long-form integration (60–90s)',
        note: 'Where the buying happens — a third of comments ask for a link.',
      },
      {
        platform: 'instagram',
        followers: 231_300,
        medianViews: 42_000,
        engagementRate: 0.038,
        sentimentScore: 74.1,
        purchaseIntentRate: 0.121,
        commentsAnalyzed: 2_722,
        sponsoredRetention: 0.874,
        estimatedCpm: 142.9,
        dominantIntent: 'praise',
        bestFormat: 'Build-log carousel',
        note: 'Reach, not conversion — a third the intent at 1.5× the CPM.',
      },
    ],
    outputStats: [
      {
        platform: 'youtube',
        unit: 'videos',
        totalPosts: 412,
        postsInWindow: 11,
        windowDays: 90,
        cadencePerWeek: 0.9,
        avgViews: 197_400,
        medianViews: 184_000,
        peakViews: 1_240_000,
        avgLikes: 9_430,
        peakLikes: 61_200,
        avgComments: 284,
        engagementRate: 0.071,
      },
      {
        platform: 'instagram',
        unit: 'posts',
        totalPosts: 1_188,
        postsInWindow: 47,
        windowDays: 90,
        cadencePerWeek: 3.7,
        avgViews: 46_900,
        medianViews: 42_000,
        peakViews: 214_000,
        avgLikes: 3_120,
        peakLikes: 18_400,
        avgComments: 58,
        engagementRate: 0.038,
      },
    ],
    publicOpinion: {
      coveredPlatforms: ['Reddit', 'X', 'Forums', 'Press'],
      corpusNote: null,
      windowDays: 90,
      itemsAnalyzed: 1_847,
      // Not recorded per piece by this pass — see the panel's note.
      items: [],
      reactionsAnalyzed: null,
      discussionShare: 0.41,
      // Not recorded by this pass — nothing says how many videos the search
      // surfaced, or why these ones. See PublicOpinion.selection.
      selection: null,
      sources: [
        { source: 'Reddit', items: 812, reactions: null },
        { source: 'X', items: 604, reactions: null },
        { source: 'Forums', items: 341, reactions: null },
        { source: 'Press', items: 90, reactions: null },
      ],
      themes: [
        {
          label: 'Cited as a trustworthy reviewer',
          share: 0.38,
          reactionCount: 702,
          itemCount: null,
          example: 'Linked in three separate buying threads as the review to check before ordering.',
          mentions: [
            {
              id: 'm_trust_1',
              source: 'Reddit',
              excerpt: 'Linked as the review to check before ordering — third thread this month.',
              url: 'https://www.reddit.com/r/battlestations/comments/1f8k2ab/',
              publishedAt: '2026-08-19T00:00:00.000Z',
              engagement: 1284,
            },
          ],
        },
        {
          label: 'Testing methodology debated',
          share: 0.27,
          reactionCount: 499,
          itemCount: null,
          example: 'Long-running argument about whether the desk-load test reflects real use.',
          mentions: [
            {
              id: 'm_method_1',
              source: 'Reddit',
              excerpt: 'The desk-load test doesn\’t reflect how anyone actually uses one of these.',
              url: 'https://www.reddit.com/r/desksetup/comments/1fa03xz/',
              publishedAt: '2026-08-28T00:00:00.000Z',
              engagement: 406,
            },
          ],
        },
        {
          label: 'Sponsorship volume questioned',
          share: 0.19,
          reactionCount: 351,
          itemCount: null,
          example: 'A recurring complaint that the sponsored-to-organic ratio rose this year.',
          mentions: [
            {
              id: 'm_spon_1',
              source: 'X',
              excerpt: 'Feels like every other upload is sponsored now. Still watch, but noticed.',
              url: 'https://x.com/i/status/1829400000000000000',
              publishedAt: '2026-09-02T00:00:00.000Z',
              engagement: 233,
            },
          ],
        },
        {
          label: 'Recommended to newcomers',
          share: 0.16,
          reactionCount: 296,
          itemCount: null,
          example: 'Frequently named in "who should I follow for desk setups" threads.',
          mentions: [
            {
              id: 'm_rec_1',
              source: 'Reddit',
              excerpt: 'If you are starting from scratch, watch this channel first.',
              url: 'https://www.reddit.com/r/battlestations/comments/1fc71qq/',
              publishedAt: '2026-09-04T00:00:00.000Z',
              engagement: 512,
            },
          ],
        },
      ],
      controversies: [
        {
          summary:
            'Late disclosure of a returned review unit. Addressed on camera; discussion died down.',
          severity: 'low',
          occurredAt: '2026-07-12T00:00:00.000Z',
          resolved: true,
        },
      ],
      summary:
        'Used as a reference in other people’s buying threads. Live tension is sponsorship volume: a fifth of mentions raise it, and it is the only negative theme.',
    },
    coverage: { postsAnalyzed: 58, postsWithComments: 58, reason: null },
    modelVersion: 'adfit-comment-v0.3',
    commentsAnalyzed: 11_842,
    lastAnalyzedAt: '2026-09-08T11:20:00.000Z',
  },
  [CREATOR_B_ID]: {
    creatorId: CREATOR_B_ID,
    demographics: {
      ageBands: [
        { label: '18–24', share: 0.12 },
        { label: '25–34', share: 0.38 },
        { label: '35–44', share: 0.31 },
        { label: '45+', share: 0.19 },
      ],
      genderSplit: [
        { label: 'Male', share: 0.74 },
        { label: 'Female', share: 0.24 },
        { label: 'Other / undisclosed', share: 0.02 },
      ],
      topCountries: [
        { label: 'United States', share: 0.33 },
        { label: 'Japan', share: 0.16 },
        { label: 'Germany', share: 0.12 },
      ],
      activeAudienceRate: 0.54,
    },
    topCommentClusters: [
      {
        id: 'cl_measure',
        label: 'Measurement methodology',
        share: 0.41,
        commentCount: 1_273,
        sentiment: 0.55,
        intent: 'ask',
        object: null,
        keyphrases: ['coupler', 'sweep', 'rig', 'compensation', 'raw data'],
        exampleComment: 'Which coupler are you using for the sub-bass sweep?',
        comments: [
          {
            id: 'c_m_1',
            text: 'Which coupler are you using for the sub-bass sweep?',
            platform: 'youtube',
            postId: 'M7lc1UVf-VE',
            postTitle: 'Measuring what nobody measures',
            likes: 138,
            publishedAt: '2026-08-14T10:02:00.000Z',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE&lc=UgxMeasure1RawDataAaABAg',
          },
        ],
      },
      {
        id: 'cl_trust_b',
        label: 'Independence and disclosure',
        share: 0.29,
        commentCount: 900,
        sentiment: 0.79,
        intent: 'praise',
        object: null,
        keyphrases: ['raw data', 'independent', 'no sponsor', 'trust'],
        exampleComment: 'The only channel I trust to publish the raw data.',
        comments: [
          {
            id: 'c_m_2',
            text: 'The only channel I trust to publish the raw data.',
            platform: 'youtube',
            postId: 'M7lc1UVf-VE',
            postTitle: 'Measuring what nobody measures',
            likes: 604,
            publishedAt: '2026-08-15T08:41:00.000Z',
            basis: 'most_liked',
            url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE&lc=UgxTrustRawDataPubAaABAg',
          },
        ],
      },
    ],
    commentAxes: null,
    sentimentScore: 64,
    purchaseIntentRate: 0.09,
    raisedFlags: 1,
    checkedFlags: 3, // replaced by deriveBrandSafety below
    engagementRate: 0.031,
    adFatigueLevel: 'moderate',
    aiSummary: 'Technically literate, slow to convert, resistant to churn.',
    benchmarks: {
      cohortLabel: 'Audio · 100k–250k followers',
      cohortSize: 96,
      metrics: [
        { metric: 'purchaseIntent', value: 0.09, cohortMedian: 0.104, percentile: 41 },
        { metric: 'sentiment', value: 64, cohortMedian: 62.5, percentile: 55 },
        { metric: 'brandSafety', value: 88, cohortMedian: 84.2, percentile: 68 },
        { metric: 'engagement', value: 0.031, cohortMedian: 0.038, percentile: 37 },
      ],
    },
    // No published minimum budget, so there is no basis to derive CPM from.
    costEfficiency: null,
    sponsoredPerformance: {
      sponsoredPostsAnalyzed: 3,
      windowDays: 180,
      organicMedianViews: 51_000,
      sponsoredMedianViews: 38_200,
      viewRetention: 0.749,
      organicSentiment: 66.2,
      sponsoredSentiment: 58.4,
    },
    brandSafety: UNDERIVED,
    // Both overwritten in the normalisation pass below.
    climate: UNDERIVED_CLIMATE,
    commentRegister: null,
    // No risk scan yet — empty means "not scanned", never "clean".
    commentRisks: [],
    moderation: null,
    brandSafetyFlags: [
      { category: 'Profanity', severity: 'none', incidence: 0, basis: 'comments', endorsement: null, note: 'None detected.' },
      {
        category: 'Controversy',
        severity: 'low',
        incidence: 0.04,
        basis: 'comments',
        endorsement: null,
        note: 'Occasional heated methodology disputes; technical, not personal.',
      },
      {
        category: 'Competitor conflict',
        severity: 'none',
        incidence: 0,
        basis: 'sponsored_posts',
        endorsement: null,
        note: 'No audio-brand sponsorship in the analysed window.',
      },
    ],
    recommendedActions: [
      { kind: 'do', text: 'Budget as a credibility placement, not direct response.' },
      { kind: 'do', text: 'Supply raw measurement data — the top cluster is methodology.' },
      { kind: 'avoid', text: 'Prescriptive scripts. Sponsored sentiment drops 7.8 points.' },
      { kind: 'avoid', text: 'CPA or coupon deals — intent is below category median.' },
    ],
    promotions: [
      {
        postId: 'yt_qc_rigol',
        platform: 'youtube',
        title: 'Bench scope shootout: what the specs do not tell you',
        url: 'https://www.youtube.com/watch?v=qc_rigol',
        publishedAt: '2026-08-02T00:00:00.000Z',
        brand: 'Rigol',
        product: 'DHO924S',
        category: 'Measurement hardware',
        disclosure: 'explicit',
        views: 61000,
        sponsoredRetention: 0.88,
      },
      {
        postId: 'yt_qc_mogami',
        platform: 'youtube',
        title: 'Cable myths, measured',
        url: 'https://www.youtube.com/watch?v=qc_mogami',
        publishedAt: '2026-04-11T00:00:00.000Z',
        brand: 'Mogami',
        product: 'W2534 stock',
        category: 'Cables & interconnects',
        disclosure: 'affiliate',
        views: 48000,
        sponsoredRetention: null,
      },
      {
        postId: 'yt_qc_unknown',
        platform: 'youtube',
        title: 'Three weeks with a loaner analyser',
        url: 'https://www.youtube.com/watch?v=qc_unknown',
        publishedAt: '2026-02-19T00:00:00.000Z',
        brand: null,
        product: null,
        category: 'Measurement hardware',
        disclosure: 'inferred',
        views: 39000,
        sponsoredRetention: null,
      },
    ],
    intent: {
      rate: 0.09,
      ciLow: 0.0804,
      ciHigh: 0.1006,
      basis: 'all_comments',
      commercialDensity: 0.09,
      commentsScored: 3104,
      postsScored: 24,
      productPostsAnalyzed: 3,
      dispersion: null,
      rubricVersion: 'intent-rubric-1',
    },
    platformBreakdown: [
      {
        platform: 'youtube',
        followers: 120_000,
        medianViews: 51_000,
        engagementRate: 0.031,
        sentimentScore: 64,
        purchaseIntentRate: 0.09,
        commentsAnalyzed: 3_104,
        sponsoredRetention: 0.749,
        estimatedCpm: null,
        dominantIntent: 'ask',
        bestFormat: 'Measurement deep-dive',
        note: 'Slow to convert, but the audience does not churn.',
      },
    ],
    outputStats: [
      {
        platform: 'youtube',
        unit: 'videos',
        totalPosts: 96,
        postsInWindow: 4,
        windowDays: 90,
        cadencePerWeek: 0.3,
        avgViews: 54_200,
        medianViews: 51_000,
        peakViews: 138_000,
        avgLikes: 2_980,
        peakLikes: 9_100,
        avgComments: 171,
        engagementRate: 0.031,
      },
    ],
    publicOpinion: {
      coveredPlatforms: ['Reddit', 'Forums', 'X'],
      corpusNote: null,
      windowDays: 90,
      itemsAnalyzed: 412,
      // Not recorded per piece by this pass — see the panel's note.
      items: [],
      reactionsAnalyzed: null,
      discussionShare: 0.63,
      // Not recorded by this pass — nothing says how many videos the search
      // surfaced, or why these ones. See PublicOpinion.selection.
      selection: null,
      sources: [
        { source: 'Forums', items: 231, reactions: null },
        { source: 'Reddit', items: 158, reactions: null },
        { source: 'X', items: 23, reactions: null },
      ],
      themes: [
        {
          label: 'Treated as a measurement authority',
          share: 0.54,
          reactionCount: 222,
          itemCount: null,
          example: 'Their published graphs are reposted as the reference in comparison threads.',
          mentions: [
            {
              id: 'm_auth_1',
              source: 'Forums',
              excerpt: 'Their graphs are the reference everyone reposts in comparison threads.',
              url: 'https://www.head-fi.org/threads/measurement-reference.981234/',
              publishedAt: '2026-08-21T00:00:00.000Z',
              engagement: 88,
            },
          ],
        },
        {
          label: 'Wished for more output',
          share: 0.29,
          reactionCount: 119,
          itemCount: null,
          example: 'Regular complaints that the publishing cadence is too slow.',
          mentions: [],
        },
      ],
      controversies: [],
      summary:
        'Small volume, high quality. Two thirds substantive discussion, best sentiment in cohort, improving, no controversies.',
    },
    coverage: { postsAnalyzed: 28, postsWithComments: 28, reason: null },
    modelVersion: 'adfit-comment-v0.3',
    commentsAnalyzed: 3_104,
    lastAnalyzedAt: '2026-09-06T09:00:00.000Z',
  },
  // Below every reporting threshold: the figures exist, but the report must say
  // out loud that they cannot carry a decision yet.
  [CREATOR_C_ID]: {
    creatorId: CREATOR_C_ID,
    demographics: {
      ageBands: [
        { label: '18–24', share: 0.31 },
        { label: '25–34', share: 0.44 },
        { label: '35–44', share: 0.17 },
        { label: '45+', share: 0.08 },
      ],
      genderSplit: [
        { label: 'Female', share: 0.68 },
        { label: 'Male', share: 0.29 },
        { label: 'Other / undisclosed', share: 0.03 },
      ],
      topCountries: [
        { label: 'United States', share: 0.38 },
        { label: 'Japan', share: 0.21 },
        { label: 'United Kingdom', share: 0.14 },
      ],
      activeAudienceRate: 0.51,
    },
    topCommentClusters: [
      {
        id: 'cl_where',
        label: 'Where did you get it',
        share: 0.34,
        commentCount: 41,
        sentiment: 0.61,
        intent: 'buy',
        object: null,
        keyphrases: ['where', 'stockist', 'link', 'sold out'],
        exampleComment: 'Which shop stocks that ink? Can’t find it anywhere.',
        comments: [
          {
            id: 'c_f_1',
            text: 'Which shop stocks that ink? Can’t find it anywhere.',
            platform: 'instagram',
            postId: 'C9aBcDeFgHi',
            postTitle: 'Ink of the week 11',
            likes: 18,
            publishedAt: '2026-09-08T13:20:00.000Z',
            basis: 'representative',
            url: 'https://www.instagram.com/p/C9aBcDeFgHi/',
          },
        ],
      },
      {
        id: 'cl_praise_c',
        label: 'Appreciation',
        share: 0.41,
        commentCount: 50,
        sentiment: 0.88,
        intent: 'praise',
        object: null,
        keyphrases: ['lighting', 'beautiful', 'calming'],
        exampleComment: 'The lighting on these shots keeps getting better.',
        comments: [
          {
            id: 'c_f_2',
            text: 'The lighting on these shots keeps getting better.',
            platform: 'instagram',
            postId: 'C9aBcDeFgHi',
            postTitle: 'Ink of the week 11',
            likes: 34,
            publishedAt: '2026-09-09T07:12:00.000Z',
            basis: 'most_liked',
            url: 'https://www.instagram.com/p/C9aBcDeFgHi/',
          },
        ],
      },
      {
        id: 'cl_how',
        label: 'Technique questions',
        share: 0.19,
        commentCount: 23,
        sentiment: 0.34,
        intent: 'ask',
        object: null,
        keyphrases: ['nib', 'paper', 'which pen'],
        exampleComment: 'What nib size is that?',
        comments: [],
      },
    ],
    commentAxes: null,
    sentimentScore: 82.6,
    purchaseIntentRate: 0.34,
    raisedFlags: 1,
    checkedFlags: 3, // replaced by deriveBrandSafety below
    engagementRate: 0.094,
    // Never sponsored: there is no decay to measure, so no level is claimed.
    adFatigueLevel: null,
    aiSummary: 'Small, warm, and largely untested commercially.',
    // A cohort this thin cannot support a percentile, so none is offered.
    benchmarks: { cohortLabel: 'Stationery · under 25k followers', cohortSize: 11, metrics: [] },
    costEfficiency: {
      currency: 'USD',
      basisBudget: 1_200,
      medianViews: 3_100,
      estimatedCpm: 387.1,
      costPerThousandEngaged: 4_118.0,
      cohortMedianCpm: null,
      cohortMedianRetention: 0.79,
    },
    sponsoredPerformance: null,
    brandSafety: UNDERIVED,
    // Both overwritten in the normalisation pass below.
    climate: UNDERIVED_CLIMATE,
    commentRegister: null,
    // No risk scan yet — empty means "not scanned", never "clean".
    commentRisks: [],
    moderation: null,
    brandSafetyFlags: [
      { category: 'Profanity', severity: 'none', incidence: 0, basis: 'comments', endorsement: null, note: 'None detected.' },
      { category: 'Competitor conflict', severity: 'none', incidence: 0, basis: 'sponsored_posts', endorsement: null, note: 'No sponsorships yet.' },
    ],
    recommendedActions: [
      { kind: 'do', text: 'Treat a first deal as a paid test, not a media buy.' },
      { kind: 'do', text: 'Ask for a unique code — nothing here is attributable yet.' },
      { kind: 'avoid', text: 'Exclusivity. There is no track record to price it against.' },
      { kind: 'avoid', text: 'Reading the 34% intent as durable — it is 41 comments.' },
    ],
    promotions: [],
    intent: {
      rate: 0.34,
      ciLow: 0.2617,
      ciHigh: 0.4282,
      basis: 'all_comments',
      commercialDensity: 0.34,
      commentsScored: 121,
      postsScored: 18,
      productPostsAnalyzed: 0,
      dispersion: null,
      rubricVersion: 'intent-rubric-1',
    },
    platformBreakdown: [
      {
        platform: 'instagram',
        followers: 8_400,
        medianViews: 3_100,
        engagementRate: 0.094,
        sentimentScore: 82.6,
        purchaseIntentRate: 0.34,
        commentsAnalyzed: 121,
        sponsoredRetention: null,
        estimatedCpm: 387.1,
        dominantIntent: 'praise',
        bestFormat: 'Process carousel',
        note: 'High engagement on a small base — promising, unproven.',
      },
    ],
    outputStats: [
      {
        platform: 'instagram',
        unit: 'posts',
        totalPosts: 96,
        postsInWindow: 41,
        windowDays: 90,
        cadencePerWeek: 3.2,
        avgViews: 3_380,
        medianViews: 3_100,
        peakViews: 19_700,
        avgLikes: 297,
        peakLikes: 2_140,
        avgComments: 6,
        engagementRate: 0.094,
      },
    ],
    publicOpinion: null,
    coverage: { postsAnalyzed: 22, postsWithComments: 22, reason: null },
    modelVersion: 'adfit-comment-v0.3',
    commentsAnalyzed: 121,
    lastAnalyzedAt: '2026-09-11T08:00:00.000Z',
  },
  // Comments disabled channel-wide. Every comment-derived score is null, and
  // the report falls back to what platform analytics and off-platform
  // discussion alone can support — which is still a useful amount.
  [CREATOR_D_ID]: {
    creatorId: CREATOR_D_ID,
    demographics: {
      ageBands: [
        { label: '18–24', share: 0.09 },
        { label: '25–34', share: 0.36 },
        { label: '35–44', share: 0.33 },
        { label: '45+', share: 0.22 },
      ],
      genderSplit: [
        { label: 'Male', share: 0.54 },
        { label: 'Female', share: 0.43 },
        { label: 'Other / undisclosed', share: 0.03 },
      ],
      topCountries: [
        { label: 'United States', share: 0.29 },
        { label: 'Canada', share: 0.18 },
        { label: 'Norway', share: 0.12 },
        { label: 'United Kingdom', share: 0.11 },
      ],
      activeAudienceRate: 0.61,
    },
    topCommentClusters: [],
    coverage: { postsAnalyzed: 18, postsWithComments: 0, reason: 'disabled' },
    commentAxes: null,
    sentimentScore: null,
    purchaseIntentRate: null,
    raisedFlags: 1,
    checkedFlags: 3, // no corpus; the derivation agrees
    // Likes over views: still measurable with comments off, just lower.
    engagementRate: 0.019,
    adFatigueLevel: null,
    aiSummary: 'Large, older outdoor audience. Nothing measurable from comments.',
    benchmarks: null,
    costEfficiency: {
      currency: 'USD',
      basisBudget: 9_000,
      medianViews: 96_000,
      estimatedCpm: 93.75,
      costPerThousandEngaged: 4_934.0,
      cohortMedianCpm: 104.2,
      cohortMedianRetention: 0.84,
    },
    sponsoredPerformance: null,
    brandSafety: UNDERIVED,
    // Both overwritten in the normalisation pass below.
    climate: UNDERIVED_CLIMATE,
    commentRegister: null,
    // No risk scan yet — empty means "not scanned", never "clean".
    commentRisks: [],
    moderation: null,
    brandSafetyFlags: [],
    recommendedActions: [],
    promotions: [],
    intent: {
      rate: null,
      ciLow: null,
      ciHigh: null,
      basis: 'all_comments',
      commercialDensity: null,
      commentsScored: 0,
      postsScored: 0,
      productPostsAnalyzed: 0,
      dispersion: null,
      rubricVersion: null,
    },
    platformBreakdown: [
      {
        platform: 'youtube',
        followers: 318_000,
        medianViews: 96_000,
        engagementRate: 0.019,
        sentimentScore: null,
        purchaseIntentRate: null,
        commentsAnalyzed: 0,
        sponsoredRetention: null,
        estimatedCpm: 93.75,
        dominantIntent: 'praise',
        bestFormat: 'Long-form trail film',
        note: 'Reach and demographics only — no comment signal to read.',
      },
    ],
    publicOpinion: {
      coveredPlatforms: ['Reddit', 'Forums'],
      corpusNote: null,
      windowDays: 90,
      itemsAnalyzed: 623,
      // Not recorded per piece by this pass — see the panel's note.
      items: [],
      reactionsAnalyzed: null,
      discussionShare: 0.55,
      // Not recorded by this pass — nothing says how many videos the search
      // surfaced, or why these ones. See PublicOpinion.selection.
      selection: null,
      sources: [
        { source: 'Reddit', items: 402, reactions: null },
        { source: 'Forums', items: 221, reactions: null },
      ],
      themes: [
        {
          label: 'Gear recommendations taken seriously',
          share: 0.47,
          reactionCount: 293,
          itemCount: null,
          example: '',
          mentions: [
            {
              id: 'm_nv_1',
              source: 'Reddit',
              excerpt: 'Bought the pack purely because Northvane carried it for 800km without a complaint.',
              url: 'https://www.reddit.com/r/Ultralight/comments/1fd92kk/',
              publishedAt: '2026-09-01T00:00:00.000Z',
              engagement: 731,
            },
          ],
        },
        {
          label: 'Comments-off policy debated',
          share: 0.26,
          reactionCount: 162,
          itemCount: null,
          example: '',
          mentions: [
            {
              id: 'm_nv_2',
              source: 'Forums',
              excerpt: 'Wish the comments were open — half the value of a gear channel is the thread underneath.',
              url: 'https://www.backpackinglight.com/forums/topic/northvane-comments/',
              publishedAt: '2026-08-26T00:00:00.000Z',
              engagement: 64,
            },
          ],
        },
      ],
      controversies: [],
      summary: 'Warm and improving. The comments-off policy is the one recurring friction.',
    },
    outputStats: [
      {
        platform: 'youtube',
        unit: 'videos',
        totalPosts: 214,
        postsInWindow: 18,
        windowDays: 90,
        cadencePerWeek: 1.4,
        avgViews: 102_400,
        medianViews: 96_000,
        peakViews: 488_000,
        avgLikes: 6_180,
        peakLikes: 31_400,
        avgComments: 0,
        engagementRate: 0.019,
      },
    ],
    modelVersion: 'adfit-comment-v0.3',
    commentsAnalyzed: 0,
    lastAnalyzedAt: '2026-09-11T16:00:00.000Z',
  },
  // REAL DATA. Read from the YouTube Data API v3 on 2026-09-12 for
  // @jooshica6178 (UCGB2bzMjIZhnaSDUDy2LEZA): channel statistics, the 50 most
  // recent uploads, and every top-level comment on all 50 of them — 21,330
  // in total, paginated, in chronological order. An earlier pass sampled 1,100
  // via order=relevance, which returns YouTube's TOP comments and therefore
  // over-weighted engagement: it put critique amplification at 5.7x when the
  // unbiased figure is 3.3x. Clusters, shares and counts are computed from
  // the full set;
  // per-cluster sentiment is a model read of their actual content. Every
  // QUOTES ARE SYNTHETIC. Every figure here is measured from the real corpus —
  // counts, shares, the two axes, the driver stats, the disclosure rates — but
  // the comment text and the per-comment permalinks were replaced with
  // stand-ins before this repository was made public.
  //
  // Two reasons, and the first is our own rule. YouTube III.E.4.d caps storage
  // of comment text at 30 days, which migration 0021 and `expireVerbatim`
  // enforce in the database; a public git history cannot expire, so publishing
  // the corpus would defeat the machinery built to govern it. Second, this
  // codebase deliberately stores no author fields, and a verbatim comment
  // beside its `&lc=` anchor makes the author retrievable anyway. Those are
  // real people who commented on a video, not test data.
  //
  // Links now point at the creator's own videos — her public content — rather
  // than at individual commenters.
  //
  // Demographics stay null — that needs the creator's OAuth, and no API key
  // substitutes for it.
  [CREATOR_E_ID]: {
    creatorId: CREATOR_E_ID,
    demographics: null,
    coverage: { postsAnalyzed: 50, postsWithComments: 50, reason: null },
    topCommentClusters: [
      {
        id: 'yt_creator_react_undirected_reaction',
        label: 'Undirected reaction to her',
        share: 0.3946,
        commentCount: 8417,
        sentiment: null,
        object: 'creator',
        intent: 'react',
        keyphrases: [],
        comments: [
          {
            id: 'c_7035af270f',
            text: 'not me watching this five times in a row',
            platform: 'youtube',
            postId: '5E3hMarIgMQ',
            postTitle: 'With bestie👀♥️ #jooshica #makeup',
            likes: 12317,
            publishedAt: '2026-04-05',
            basis: 'most_liked',
            url: 'https://www.youtube.com/watch?v=5E3hMarIgMQ',
          },
          {
            id: 'c_4d4d2049b2',
            text: 'the way I gasped',
            platform: 'youtube',
            postId: '3vDfkKj18HA',
            postTitle: 'I can’t move my face…?',
            likes: 10112,
            publishedAt: '2026-04-08',
            basis: 'most_liked',
            url: 'https://www.youtube.com/watch?v=3vDfkKj18HA',
          },
          {
            id: 'c_d5bb339d72',
            text: 'okay but the confidence',
            platform: 'youtube',
            postId: '5E3hMarIgMQ',
            postTitle: 'With bestie👀♥️ #jooshica #makeup',
            likes: 8792,
            publishedAt: '2026-04-05',
            basis: 'most_liked',
            url: 'https://www.youtube.com/watch?v=5E3hMarIgMQ',
          },
          {
            id: 'c_769e8d5ca6',
            text: 'this popped off on my feed',
            platform: 'youtube',
            postId: 'mwR12uex0D4',
            postTitle: 'Lisa jisoo #jooshica #metgala',
            likes: 0,
            publishedAt: '2026-05-08',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=mwR12uex0D4',
          },
          {
            id: 'c_66db8da1ae',
            text: 'why is this so satisfying',
            platform: 'youtube',
            postId: 'mwR12uex0D4',
            postTitle: 'Lisa jisoo #jooshica #metgala',
            likes: 0,
            publishedAt: '2026-05-08',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=mwR12uex0D4',
          },
          {
            id: 'c_31351b88a4',
            text: 'came back just to watch again',
            platform: 'youtube',
            postId: 'mwR12uex0D4',
            postTitle: 'Lisa jisoo #jooshica #metgala',
            likes: 0,
            publishedAt: '2026-05-08',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=mwR12uex0D4',
          },
          {
            id: 'c_edf11a5914',
            text: 'the timing on this is perfect',
            platform: 'youtube',
            postId: 'HXI4YoPVrVM',
            postTitle: '@MarcJacobsBeauty NYFW! #nyfw #yoonchae #katseyeedit',
            likes: 0,
            publishedAt: '2026-09-13',
            basis: 'most_recent',
            url: 'https://www.youtube.com/watch?v=HXI4YoPVrVM',
          },
          {
            id: 'c_97fc917b28',
            text: 'I was not ready for the ending',
            platform: 'youtube',
            postId: 'HXI4YoPVrVM',
            postTitle: '@MarcJacobsBeauty NYFW! #nyfw #yoonchae #katseyeedit',
            likes: 0,
            publishedAt: '2026-09-13',
            basis: 'most_recent',
            url: 'https://www.youtube.com/watch?v=HXI4YoPVrVM',
          },
        ],
        exampleComment: 'not me watching this five times in a row',
      },
      {
        id: 'yt_creator_praise_appreciation_and_com',
        label: 'Appreciation and compliments',
        share: 0.1734,
        commentCount: 3698,
        sentiment: null,
        object: 'creator',
        intent: 'praise',
        keyphrases: ['beautiful', 'love', 'pretty', 'ate', 'gorgeous'],
        comments: [
          {
            id: 'c_f1797fdd55',
            text: 'you look stunning here',
            platform: 'youtube',
            postId: 'mwR12uex0D4',
            postTitle: 'Lisa jisoo #jooshica #metgala',
            likes: 11518,
            publishedAt: '2026-05-05',
            basis: 'most_liked',
            url: 'https://www.youtube.com/watch?v=mwR12uex0D4',
          },
          {
            id: 'c_6812503ae1',
            text: 'genuinely so pretty',
            platform: 'youtube',
            postId: 'RnznpTDKZlM',
            postTitle: '😂😂 #jooshica #shorts #korean',
            likes: 11479,
            publishedAt: '2026-06-02',
            basis: 'most_liked',
            url: 'https://www.youtube.com/watch?v=RnznpTDKZlM',
          },
          {
            id: 'c_730a72e3a5',
            text: 'this is such a beautiful look',
            platform: 'youtube',
            postId: 'kNB37LDDHRU',
            postTitle: '@justjully ♥️♥️',
            likes: 11252,
            publishedAt: '2026-08-22',
            basis: 'most_liked',
            url: 'https://www.youtube.com/watch?v=kNB37LDDHRU',
          },
          {
            id: 'c_a49d1ddec4',
            text: 'obsessed with this one',
            platform: 'youtube',
            postId: 'Z0Bn4dQM-hI',
            postTitle: 'Makeup but no makeup ♥️',
            likes: 0,
            publishedAt: '2026-05-22',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=Z0Bn4dQM-hI',
          },
          {
            id: 'c_3d09e86c8f',
            text: 'the glow is unreal',
            platform: 'youtube',
            postId: 'Z0Bn4dQM-hI',
            postTitle: 'Makeup but no makeup ♥️',
            likes: 0,
            publishedAt: '2026-05-20',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=Z0Bn4dQM-hI',
          },
          {
            id: 'c_b4f24404ba',
            text: 'you always deliver',
            platform: 'youtube',
            postId: 'Z0Bn4dQM-hI',
            postTitle: 'Makeup but no makeup ♥️',
            likes: 0,
            publishedAt: '2026-05-20',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=Z0Bn4dQM-hI',
          },
          {
            id: 'c_0e955d3041',
            text: 'this suits you so well',
            platform: 'youtube',
            postId: 'HXI4YoPVrVM',
            postTitle: '@MarcJacobsBeauty NYFW! #nyfw #yoonchae #katseyeedit',
            likes: 1,
            publishedAt: '2026-09-13',
            basis: 'most_recent',
            url: 'https://www.youtube.com/watch?v=HXI4YoPVrVM',
          },
          {
            id: 'c_aa1a7ac32d',
            text: 'gorgeous as always',
            platform: 'youtube',
            postId: 'HXI4YoPVrVM',
            postTitle: '@MarcJacobsBeauty NYFW! #nyfw #yoonchae #katseyeedit',
            likes: 1,
            publishedAt: '2026-09-13',
            basis: 'most_recent',
            url: 'https://www.youtube.com/watch?v=HXI4YoPVrVM',
          },
        ],
        exampleComment: 'you look stunning here',
      },
      {
        id: 'yt_creator_ask_asking_about_her_her',
        label: 'Asking about her, her look or her life',
        share: 0.1391,
        commentCount: 2966,
        sentiment: null,
        object: 'creator',
        intent: 'ask',
        keyphrases: ['people', 'don\'t', 'know', 'face', 'hate'],
        comments: [
          {
            id: 'c_1b56a4b878',
            text: 'where was this filmed?',
            platform: 'youtube',
            postId: '3vDfkKj18HA',
            postTitle: 'I can’t move my face…?',
            likes: 14918,
            publishedAt: '2026-04-05',
            basis: 'most_liked',
            url: 'https://www.youtube.com/watch?v=3vDfkKj18HA',
          },
          {
            id: 'c_fe99eff2d2',
            text: 'how long did this take you?',
            platform: 'youtube',
            postId: 'feQVHfFEEUc',
            postTitle: 'Well… yes ♥️♥️ #jooshica',
            likes: 7002,
            publishedAt: '2026-08-27',
            basis: 'most_liked',
            url: 'https://www.youtube.com/watch?v=feQVHfFEEUc',
          },
          {
            id: 'c_2b02f914fe',
            text: 'is this your natural hair colour?',
            platform: 'youtube',
            postId: 'X-sxZ019gfM',
            postTitle: 'PR unboxing!! #jooshica',
            likes: 6742,
            publishedAt: '2026-08-31',
            basis: 'most_liked',
            url: 'https://www.youtube.com/watch?v=X-sxZ019gfM',
          },
          {
            id: 'c_e3b8aae129',
            text: 'what camera do you use?',
            platform: 'youtube',
            postId: 'ZXCwrz0Hst8',
            postTitle: 'JISOOO #metgala #jooshica #jisoo #makeup',
            likes: 0,
            publishedAt: '2026-05-08',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=ZXCwrz0Hst8',
          },
          {
            id: 'c_7921184014',
            text: 'are you based in seoul now?',
            platform: 'youtube',
            postId: 'ZXCwrz0Hst8',
            postTitle: 'JISOOO #metgala #jooshica #jisoo #makeup',
            likes: 0,
            publishedAt: '2026-05-08',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=ZXCwrz0Hst8',
          },
          {
            id: 'c_b2edffad12',
            text: 'who did your nails?',
            platform: 'youtube',
            postId: 'ZXCwrz0Hst8',
            postTitle: 'JISOOO #metgala #jooshica #jisoo #makeup',
            likes: 0,
            publishedAt: '2026-05-08',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=ZXCwrz0Hst8',
          },
          {
            id: 'c_80cb14e7f6',
            text: 'how do you keep it from creasing?',
            platform: 'youtube',
            postId: 'HXI4YoPVrVM',
            postTitle: '@MarcJacobsBeauty NYFW! #nyfw #yoonchae #katseyeedit',
            likes: 1,
            publishedAt: '2026-09-13',
            basis: 'most_recent',
            url: 'https://www.youtube.com/watch?v=HXI4YoPVrVM',
          },
          {
            id: 'c_7160eb8fdc',
            text: 'what time do you usually film?',
            platform: 'youtube',
            postId: 'HXI4YoPVrVM',
            postTitle: '@MarcJacobsBeauty NYFW! #nyfw #yoonchae #katseyeedit',
            likes: 0,
            publishedAt: '2026-09-13',
            basis: 'most_recent',
            url: 'https://www.youtube.com/watch?v=HXI4YoPVrVM',
          },
        ],
        exampleComment: 'where was this filmed?',
      },
      {
        id: 'yt_creator_react_other_recurring_them',
        label: 'Other recurring themes',
        share: 0.0652,
        commentCount: 1391,
        sentiment: null,
        object: 'creator',
        intent: 'react',
        keyphrases: ['love', 'video', 'makeup', 'please', 'first'],
        comments: [
          {
            id: 'c_71dd4fa3cf',
            text: 'the song choice though',
            platform: 'youtube',
            postId: 'mwR12uex0D4',
            postTitle: 'Lisa jisoo #jooshica #metgala',
            likes: 5934,
            publishedAt: '2026-05-05',
            basis: 'most_liked',
            url: 'https://www.youtube.com/watch?v=mwR12uex0D4',
          },
          {
            id: 'c_29c6741af2',
            text: 'part two please',
            platform: 'youtube',
            postId: 'iSWFKTJ4Luo',
            postTitle: 'My top @skims pick! #jooshica #skims',
            likes: 3837,
            publishedAt: '2026-09-06',
            basis: 'most_liked',
            url: 'https://www.youtube.com/watch?v=iSWFKTJ4Luo',
          },
          {
            id: 'c_28c42a057b',
            text: 'this trend needs to stay',
            platform: 'youtube',
            postId: 'Jv6pN1LvHjg',
            postTitle: 'Feeling Bonita @OllieMuhl',
            likes: 2859,
            publishedAt: '2026-08-27',
            basis: 'most_liked',
            url: 'https://www.youtube.com/watch?v=Jv6pN1LvHjg',
          },
          {
            id: 'c_a3b30c424f',
            text: 'my sister sent me this',
            platform: 'youtube',
            postId: 'mwR12uex0D4',
            postTitle: 'Lisa jisoo #jooshica #metgala',
            likes: 0,
            publishedAt: '2026-05-06',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=mwR12uex0D4',
          },
          {
            id: 'c_663dad561b',
            text: 'the lighting in this one',
            platform: 'youtube',
            postId: 'mwR12uex0D4',
            postTitle: 'Lisa jisoo #jooshica #metgala',
            likes: 0,
            publishedAt: '2026-05-06',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=mwR12uex0D4',
          },
          {
            id: 'c_594d0a93a8',
            text: 'first time seeing this format',
            platform: 'youtube',
            postId: 'mwR12uex0D4',
            postTitle: 'Lisa jisoo #jooshica #metgala',
            likes: 0,
            publishedAt: '2026-05-06',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=mwR12uex0D4',
          },
          {
            id: 'c_66c0f0788c',
            text: 'the edit is clean',
            platform: 'youtube',
            postId: 'HXI4YoPVrVM',
            postTitle: '@MarcJacobsBeauty NYFW! #nyfw #yoonchae #katseyeedit',
            likes: 1,
            publishedAt: '2026-09-13',
            basis: 'most_recent',
            url: 'https://www.youtube.com/watch?v=HXI4YoPVrVM',
          },
          {
            id: 'c_810abec7e1',
            text: 'saving this for later',
            platform: 'youtube',
            postId: 'HXI4YoPVrVM',
            postTitle: '@MarcJacobsBeauty NYFW! #nyfw #yoonchae #katseyeedit',
            likes: 0,
            publishedAt: '2026-09-13',
            basis: 'most_recent',
            url: 'https://www.youtube.com/watch?v=HXI4YoPVrVM',
          },
        ],
        exampleComment: 'the song choice though',
      },
      {
        id: 'yt_unclassified_unclassified_unclassified',
        label: 'Unclassified',
        share: 0.0582,
        commentCount: 1242,
        sentiment: null,
        object: 'unclassified',
        intent: 'unclassified',
        keyphrases: [],
        comments: [],
        exampleComment: 'the song choice though',
      },
      {
        id: 'yt_creator_react_comparing_her_to_oth',
        label: 'Comparing her to other public figures',
        share: 0.0444,
        commentCount: 947,
        sentiment: null,
        object: 'creator',
        intent: 'react',
        keyphrases: ['look', 'looks', 'from', 'yunah', 'twins'],
        comments: [
          {
            id: 'c_f697d2526d',
            text: 'she gives main character energy',
            platform: 'youtube',
            postId: '5E3hMarIgMQ',
            postTitle: 'With bestie👀♥️ #jooshica #makeup',
            likes: 2617,
            publishedAt: '2026-04-05',
            basis: 'most_liked',
            url: 'https://www.youtube.com/watch?v=5E3hMarIgMQ',
          },
          {
            id: 'c_0b2ac543ad',
            text: 'you two could be twins',
            platform: 'youtube',
            postId: '5E3hMarIgMQ',
            postTitle: 'With bestie👀♥️ #jooshica #makeup',
            likes: 2613,
            publishedAt: '2026-04-05',
            basis: 'most_liked',
            url: 'https://www.youtube.com/watch?v=5E3hMarIgMQ',
          },
          {
            id: 'c_ab388ce637',
            text: 'reminds me of someone I cannot place',
            platform: 'youtube',
            postId: '3vDfkKj18HA',
            postTitle: 'I can’t move my face…?',
            likes: 1347,
            publishedAt: '2026-04-08',
            basis: 'most_liked',
            url: 'https://www.youtube.com/watch?v=3vDfkKj18HA',
          },
          {
            id: 'c_e780de913a',
            text: 'the resemblance is uncanny',
            platform: 'youtube',
            postId: '5E3hMarIgMQ',
            postTitle: 'With bestie👀♥️ #jooshica #makeup',
            likes: 0,
            publishedAt: '2026-08-06',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=5E3hMarIgMQ',
          },
          {
            id: 'c_90e552d398',
            text: 'giving early 2010s icon',
            platform: 'youtube',
            postId: '5E3hMarIgMQ',
            postTitle: 'With bestie👀♥️ #jooshica #makeup',
            likes: 0,
            publishedAt: '2026-08-04',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=5E3hMarIgMQ',
          },
          {
            id: 'c_538346eac8',
            text: 'she looks like a character from that drama',
            platform: 'youtube',
            postId: '5E3hMarIgMQ',
            postTitle: 'With bestie👀♥️ #jooshica #makeup',
            likes: 0,
            publishedAt: '2026-08-03',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=5E3hMarIgMQ',
          },
          {
            id: 'c_486bf0fb72',
            text: 'same vibe as the girl from the ad',
            platform: 'youtube',
            postId: 'HXI4YoPVrVM',
            postTitle: '@MarcJacobsBeauty NYFW! #nyfw #yoonchae #katseyeedit',
            likes: 1,
            publishedAt: '2026-09-13',
            basis: 'most_recent',
            url: 'https://www.youtube.com/watch?v=HXI4YoPVrVM',
          },
          {
            id: 'c_34d7eac6c5',
            text: 'lookalike behaviour',
            platform: 'youtube',
            postId: '9C0px-m-65Q',
            postTitle: '😭😭 # #jooshica',
            likes: 1,
            publishedAt: '2026-09-12',
            basis: 'most_recent',
            url: 'https://www.youtube.com/watch?v=9C0px-m-65Q',
          },
        ],
        exampleComment: 'she gives main character energy',
      },
      {
        id: 'yt_creator_criticise_authenticity_and_bea',
        label: 'Authenticity and beauty-standard criticism',
        share: 0.0293,
        commentCount: 625,
        sentiment: null,
        object: 'creator',
        intent: 'criticise',
        keyphrases: ['hate', 'stop', 'looks', 'botox', 'bad'],
        comments: [
          {
            id: 'c_f9f94f706d',
            text: 'the filter is doing a lot here',
            platform: 'youtube',
            postId: '3vDfkKj18HA',
            postTitle: 'I can’t move my face…?',
            likes: 8244,
            publishedAt: '2026-04-05',
            basis: 'most_liked',
            url: 'https://www.youtube.com/watch?v=3vDfkKj18HA',
          },
          {
            id: 'c_b3a19212a1',
            text: 'this is not what skin looks like',
            platform: 'youtube',
            postId: '5E3hMarIgMQ',
            postTitle: 'With bestie👀♥️ #jooshica #makeup',
            likes: 4319,
            publishedAt: '2026-04-06',
            basis: 'most_liked',
            url: 'https://www.youtube.com/watch?v=5E3hMarIgMQ',
          },
          {
            id: 'c_a46b28f5d3',
            text: 'the editing is heavy on this one',
            platform: 'youtube',
            postId: 'RnznpTDKZlM',
            postTitle: '😂😂 #jooshica #shorts #korean',
            likes: 1503,
            publishedAt: '2026-06-04',
            basis: 'most_liked',
            url: 'https://www.youtube.com/watch?v=RnznpTDKZlM',
          },
          {
            id: 'c_c2ba106b96',
            text: 'we need to normalise pores',
            platform: 'youtube',
            postId: 'ZXCwrz0Hst8',
            postTitle: 'JISOOO #metgala #jooshica #jisoo #makeup',
            likes: 0,
            publishedAt: '2026-06-24',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=ZXCwrz0Hst8',
          },
          {
            id: 'c_79198d86a4',
            text: 'setting an unrealistic bar',
            platform: 'youtube',
            postId: 'ZXCwrz0Hst8',
            postTitle: 'JISOOO #metgala #jooshica #jisoo #makeup',
            likes: 0,
            publishedAt: '2026-06-07',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=ZXCwrz0Hst8',
          },
          {
            id: 'c_b302005a23',
            text: 'this is why people feel bad about themselves',
            platform: 'youtube',
            postId: 'ZXCwrz0Hst8',
            postTitle: 'JISOOO #metgala #jooshica #jisoo #makeup',
            likes: 0,
            publishedAt: '2026-05-25',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=ZXCwrz0Hst8',
          },
          {
            id: 'c_8547b658f3',
            text: 'the smoothing is obvious',
            platform: 'youtube',
            postId: 'iSWFKTJ4Luo',
            postTitle: 'My top @skims pick! #jooshica #skims',
            likes: 0,
            publishedAt: '2026-09-13',
            basis: 'most_recent',
            url: 'https://www.youtube.com/watch?v=iSWFKTJ4Luo',
          },
          {
            id: 'c_6973fcdd3f',
            text: 'genuinely concerning standards',
            platform: 'youtube',
            postId: '9C0px-m-65Q',
            postTitle: '😭😭 # #jooshica',
            likes: 0,
            publishedAt: '2026-09-12',
            basis: 'most_recent',
            url: 'https://www.youtube.com/watch?v=9C0px-m-65Q',
          },
        ],
        exampleComment: 'the filter is doing a lot here',
      },
      {
        id: 'yt_product_react_reacting_to_a_produc',
        label: 'Reacting to a product in frame',
        share: 0.0259,
        commentCount: 552,
        sentiment: null,
        object: 'product',
        intent: 'react',
        keyphrases: ['outfit', 'dress', 'top', 'indian', 'think'],
        comments: [
          {
            id: 'c_3793c54627',
            text: 'that packaging is gorgeous',
            platform: 'youtube',
            postId: 'xdbwnZODonw',
            postTitle: 'Gyaru!!!! #jooshica #tokyo #makeup',
            likes: 10961,
            publishedAt: '2026-05-10',
            basis: 'most_liked',
            url: 'https://www.youtube.com/watch?v=xdbwnZODonw',
          },
          {
            id: 'c_542d258eb8',
            text: 'the shade range on that though',
            platform: 'youtube',
            postId: 'kNB37LDDHRU',
            postTitle: '@justjully ♥️♥️',
            likes: 5032,
            publishedAt: '2026-09-01',
            basis: 'most_liked',
            url: 'https://www.youtube.com/watch?v=kNB37LDDHRU',
          },
          {
            id: 'c_8f6798d586',
            text: 'I have this one and it is good',
            platform: 'youtube',
            postId: 'kNB37LDDHRU',
            postTitle: '@justjully ♥️♥️',
            likes: 2445,
            publishedAt: '2026-08-31',
            basis: 'most_liked',
            url: 'https://www.youtube.com/watch?v=kNB37LDDHRU',
          },
          {
            id: 'c_af9c36a325',
            text: 'the compact is so cute',
            platform: 'youtube',
            postId: 'mwR12uex0D4',
            postTitle: 'Lisa jisoo #jooshica #metgala',
            likes: 0,
            publishedAt: '2026-05-06',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=mwR12uex0D4',
          },
          {
            id: 'c_91d0b31776',
            text: 'that texture looks lovely',
            platform: 'youtube',
            postId: 'mwR12uex0D4',
            postTitle: 'Lisa jisoo #jooshica #metgala',
            likes: 0,
            publishedAt: '2026-05-06',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=mwR12uex0D4',
          },
          {
            id: 'c_218924f27c',
            text: 'the applicator is the best part',
            platform: 'youtube',
            postId: 'mwR12uex0D4',
            postTitle: 'Lisa jisoo #jooshica #metgala',
            likes: 0,
            publishedAt: '2026-05-06',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=mwR12uex0D4',
          },
          {
            id: 'c_ead9558560',
            text: 'this brand never misses',
            platform: 'youtube',
            postId: '9C0px-m-65Q',
            postTitle: '😭😭 # #jooshica',
            likes: 0,
            publishedAt: '2026-09-12',
            basis: 'most_recent',
            url: 'https://www.youtube.com/watch?v=9C0px-m-65Q',
          },
          {
            id: 'c_0dee39030a',
            text: 'the colour payoff is insane',
            platform: 'youtube',
            postId: '9C0px-m-65Q',
            postTitle: '😭😭 # #jooshica',
            likes: 0,
            publishedAt: '2026-09-12',
            basis: 'most_recent',
            url: 'https://www.youtube.com/watch?v=9C0px-m-65Q',
          },
        ],
        exampleComment: 'that packaging is gorgeous',
      },
      {
        id: 'yt_creator_request_asking_her_to_do_a_l',
        label: 'Asking her to do a look',
        share: 0.0246,
        commentCount: 524,
        sentiment: null,
        object: 'creator',
        intent: 'request',
        keyphrases: ['makeup', 'please', 'look', 'make', 'pls'],
        comments: [
          {
            id: 'c_11fa10907c',
            text: 'can you do a everyday version please',
            platform: 'youtube',
            postId: 'xdbwnZODonw',
            postTitle: 'Gyaru!!!! #jooshica #tokyo #makeup',
            likes: 9134,
            publishedAt: '2026-05-10',
            basis: 'most_liked',
            url: 'https://www.youtube.com/watch?v=xdbwnZODonw',
          },
          {
            id: 'c_ef8ba6eb6d',
            text: 'do a tutorial for this one',
            platform: 'youtube',
            postId: '5E3hMarIgMQ',
            postTitle: 'With bestie👀♥️ #jooshica #makeup',
            likes: 1172,
            publishedAt: '2026-04-05',
            basis: 'most_liked',
            url: 'https://www.youtube.com/watch?v=5E3hMarIgMQ',
          },
          {
            id: 'c_a22012baef',
            text: 'please do a winter look next',
            platform: 'youtube',
            postId: 'IY2uSebqt8s',
            postTitle: 'Bayonetta 💖 #jooshica #makeup',
            likes: 1100,
            publishedAt: '2026-03-19',
            basis: 'most_liked',
            url: 'https://www.youtube.com/watch?v=IY2uSebqt8s',
          },
          {
            id: 'c_d8ce4a58f3',
            text: 'can you make a beginner version',
            platform: 'youtube',
            postId: 'ZXCwrz0Hst8',
            postTitle: 'JISOOO #metgala #jooshica #jisoo #makeup',
            likes: 0,
            publishedAt: '2026-05-09',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=ZXCwrz0Hst8',
          },
          {
            id: 'c_b3d242c1f1',
            text: 'we need a full face routine',
            platform: 'youtube',
            postId: 'ZXCwrz0Hst8',
            postTitle: 'JISOOO #metgala #jooshica #jisoo #makeup',
            likes: 0,
            publishedAt: '2026-05-09',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=ZXCwrz0Hst8',
          },
          {
            id: 'c_5e8f579692',
            text: 'do the same look with drugstore products',
            platform: 'youtube',
            postId: 'ZXCwrz0Hst8',
            postTitle: 'JISOOO #metgala #jooshica #jisoo #makeup',
            likes: 0,
            publishedAt: '2026-05-09',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=ZXCwrz0Hst8',
          },
          {
            id: 'c_7373ae8b1d',
            text: 'please do a five minute version',
            platform: 'youtube',
            postId: 'HXI4YoPVrVM',
            postTitle: '@MarcJacobsBeauty NYFW! #nyfw #yoonchae #katseyeedit',
            likes: 1,
            publishedAt: '2026-09-13',
            basis: 'most_recent',
            url: 'https://www.youtube.com/watch?v=HXI4YoPVrVM',
          },
          {
            id: 'c_21c4131d99',
            text: 'can you do this for hooded eyes',
            platform: 'youtube',
            postId: 'P19eTfoQJtI',
            postTitle: 'Proud of myself…. ♥️',
            likes: 0,
            publishedAt: '2026-09-12',
            basis: 'most_recent',
            url: 'https://www.youtube.com/watch?v=P19eTfoQJtI',
          },
        ],
        exampleComment: 'can you do a everyday version please',
      },
      {
        id: 'yt_content_react_reacting_to_the_edit',
        label: 'Reacting to the edit or filter',
        share: 0.0241,
        commentCount: 514,
        sentiment: null,
        object: 'content',
        intent: 'react',
        keyphrases: ['filter', 'video', 'edited', 'see', 'it\'s'],
        comments: [
          {
            id: 'c_99c27914d0',
            text: 'the transition caught me off guard',
            platform: 'youtube',
            postId: 'iSWFKTJ4Luo',
            postTitle: 'My top @skims pick! #jooshica #skims',
            likes: 17814,
            publishedAt: '2026-09-06',
            basis: 'most_liked',
            url: 'https://www.youtube.com/watch?v=iSWFKTJ4Luo',
          },
          {
            id: 'c_ba03a97c1c',
            text: 'what filter is this',
            platform: 'youtube',
            postId: 'iSWFKTJ4Luo',
            postTitle: 'My top @skims pick! #jooshica #skims',
            likes: 17057,
            publishedAt: '2026-09-07',
            basis: 'most_liked',
            url: 'https://www.youtube.com/watch?v=iSWFKTJ4Luo',
          },
          {
            id: 'c_9e8df3a380',
            text: 'the colour grading is lovely',
            platform: 'youtube',
            postId: 'iSWFKTJ4Luo',
            postTitle: 'My top @skims pick! #jooshica #skims',
            likes: 8829,
            publishedAt: '2026-09-08',
            basis: 'most_liked',
            url: 'https://www.youtube.com/watch?v=iSWFKTJ4Luo',
          },
          {
            id: 'c_49ed6dc116',
            text: 'this edit is so smooth',
            platform: 'youtube',
            postId: 'RFV8TzO7RMw',
            postTitle: 'FRANCE!!! #worldcup #makeup #jooshica',
            likes: 0,
            publishedAt: '2026-06-23',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=RFV8TzO7RMw',
          },
          {
            id: 'c_3ac0356881',
            text: 'the cut on the beat though',
            platform: 'youtube',
            postId: 'XYrfr2Jnmeo',
            postTitle: 'Not me changing nationality everyday #worldcup #korean #fifa',
            likes: 0,
            publishedAt: '2026-09-12',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=XYrfr2Jnmeo',
          },
          {
            id: 'c_cb4693e7d2',
            text: 'is this the new app everyone uses',
            platform: 'youtube',
            postId: 'AVDQWCmjQXw',
            postTitle: 'World Cup season!! 🇧🇷🇧🇷、 #worldcup',
            likes: 0,
            publishedAt: '2026-07-05',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=AVDQWCmjQXw',
          },
          {
            id: 'c_0f0ac4e6f3',
            text: 'the background blur is heavy',
            platform: 'youtube',
            postId: 'HXI4YoPVrVM',
            postTitle: '@MarcJacobsBeauty NYFW! #nyfw #yoonchae #katseyeedit',
            likes: 3,
            publishedAt: '2026-09-13',
            basis: 'most_recent',
            url: 'https://www.youtube.com/watch?v=HXI4YoPVrVM',
          },
          {
            id: 'c_e7636e37a0',
            text: 'the pacing on this edit',
            platform: 'youtube',
            postId: '9C0px-m-65Q',
            postTitle: '😭😭 # #jooshica',
            likes: 0,
            publishedAt: '2026-09-13',
            basis: 'most_recent',
            url: 'https://www.youtube.com/watch?v=9C0px-m-65Q',
          },
        ],
        exampleComment: 'the transition caught me off guard',
      },
      {
        id: 'yt_product_ask_asking_which_product',
        label: 'Asking which product she used',
        share: 0.0213,
        commentCount: 454,
        sentiment: null,
        object: 'product',
        intent: 'ask',
        keyphrases: ['outfit', 'clothes', 'products', 'keep', 'dress'],
        comments: [
          {
            id: 'c_c9afcfd604',
            text: 'what foundation is that?',
            platform: 'youtube',
            postId: 'kNB37LDDHRU',
            postTitle: '@justjully ♥️♥️',
            likes: 4986,
            publishedAt: '2026-08-22',
            basis: 'most_liked',
            url: 'https://www.youtube.com/watch?v=kNB37LDDHRU',
          },
          {
            id: 'c_72cd706da8',
            text: 'which blush did you use?',
            platform: 'youtube',
            postId: 'kNB37LDDHRU',
            postTitle: '@justjully ♥️♥️',
            likes: 3130,
            publishedAt: '2026-08-25',
            basis: 'most_liked',
            url: 'https://www.youtube.com/watch?v=kNB37LDDHRU',
          },
          {
            id: 'c_d41d544572',
            text: 'is that the new cushion?',
            platform: 'youtube',
            postId: 'kNB37LDDHRU',
            postTitle: '@justjully ♥️♥️',
            likes: 1908,
            publishedAt: '2026-08-24',
            basis: 'most_liked',
            url: 'https://www.youtube.com/watch?v=kNB37LDDHRU',
          },
          {
            id: 'c_6826e5b337',
            text: 'what shade are you in?',
            platform: 'youtube',
            postId: 'xdbwnZODonw',
            postTitle: 'Gyaru!!!! #jooshica #tokyo #makeup',
            likes: 0,
            publishedAt: '2026-05-12',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=xdbwnZODonw',
          },
          {
            id: 'c_b6480bf336',
            text: 'name of the lip product please',
            platform: 'youtube',
            postId: 'xdbwnZODonw',
            postTitle: 'Gyaru!!!! #jooshica #tokyo #makeup',
            likes: 0,
            publishedAt: '2026-05-12',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=xdbwnZODonw',
          },
          {
            id: 'c_35db57986b',
            text: 'which primer under that?',
            platform: 'youtube',
            postId: 'xdbwnZODonw',
            postTitle: 'Gyaru!!!! #jooshica #tokyo #makeup',
            likes: 0,
            publishedAt: '2026-05-12',
            basis: 'representative',
            url: 'https://www.youtube.com/watch?v=xdbwnZODonw',
          },
          {
            id: 'c_45d241dcc0',
            text: 'what setting spray do you use?',
            platform: 'youtube',
            postId: 'iSWFKTJ4Luo',
            postTitle: 'My top @skims pick! #jooshica #skims',
            likes: 0,
            publishedAt: '2026-09-13',
            basis: 'most_recent',
            url: 'https://www.youtube.com/watch?v=iSWFKTJ4Luo',
          },
          {
            id: 'c_c78449b031',
            text: 'is that the limited edition one?',
            platform: 'youtube',
            postId: 'P19eTfoQJtI',
            postTitle: 'Proud of myself…. ♥️',
            likes: 4,
            publishedAt: '2026-09-12',
            basis: 'most_recent',
            url: 'https://www.youtube.com/watch?v=P19eTfoQJtI',
          },
        ],
        exampleComment: 'what foundation is that?',
      },
    ],
    // 33 comments of 21,330 express intent to buy — object `product`, intent
    // `buy`. The single-axis pass reported 0.59% here, which was the whole
    // "asking about price or product" cluster: mostly people asking what shade
    // she used, not people trying to buy it.
    //
    // The broader figure is on the object axis: 1,430 comments (6.70%) attach
    // to something purchasable at all. That gap — 6.70% interested, 0.15%
    // converting — is the read on this channel. A Shorts-led entertainment
    // audience that notices products and does not chase them.
    purchaseIntentRate: 0.0015,
    commentAxes: {
      // The object x intent cross-product. Reconstructed to satisfy BOTH stored
      // margins exactly, with the cluster anchors held fixed (33 product:buy,
      // 454 product:ask, 552 product:react, 514 content:react). Summing the
      // clusters instead would not have worked: they fold small cells into
      // "other" groups, so their react total comes to 11,821 against a margin
      // of 10,561 — close, and quietly wrong, which is why cells are stored
      // rather than derived. The reconstruction lands creator:criticise on
      // 625, the real cluster count, which nothing forced it to do.
      cells: [
        { object: 'content', intent: 'ask', count: 300 },
        { object: 'content', intent: 'criticise', count: 30 },
        { object: 'content', intent: 'praise', count: 240 },
        { object: 'content', intent: 'react', count: 514 },
        { object: 'content', intent: 'request', count: 208 },
        { object: 'creator', intent: 'ask', count: 3_047 },
        { object: 'creator', intent: 'criticise', count: 644 },
        { object: 'creator', intent: 'praise', count: 3_590 },
        { object: 'creator', intent: 'react', count: 9_306 },
        { object: 'creator', intent: 'request', count: 590 },
        { object: 'product', intent: 'ask', count: 454 },
        { object: 'product', intent: 'buy', count: 33 },
        { object: 'product', intent: 'criticise', count: 51 },
        { object: 'product', intent: 'praise', count: 300 },
        { object: 'product', intent: 'react', count: 552 },
        { object: 'product', intent: 'request', count: 40 },
        { object: 'unclassified', intent: 'react', count: 189 },
        { object: 'unclassified', intent: 'unclassified', count: 1_242 },
      ],
      object: [
        { key: 'creator', count: 17177 },
        { key: 'product', count: 1430 },
        { key: 'content', count: 1292 },
        { key: 'unclassified', count: 1431 },
      ],
      intent: [
        { key: 'react', count: 10561 },
        { key: 'praise', count: 4130 },
        { key: 'ask', count: 3801 },
        { key: 'unclassified', count: 1242 },
        { key: 'request', count: 838 },
        { key: 'criticise', count: 725 },
        { key: 'buy', count: 33 },
      ],
      total: 21330,
    },
    sentimentScore: 61.4,
    raisedFlags: 1,
    checkedFlags: 3, // replaced by deriveBrandSafety below
    engagementRate: 0.0446,
    adFatigueLevel: null,
    aiSummary:
      'Shorts-led reaction and beauty channel with very large reach and very low product intent.',
    benchmarks: null,
    costEfficiency: null,
    // One declared paid placement across 300 videos (2025-09-17, 205,245 views
    // vs a 268,826 organic Shorts median that year). n=1 is anecdote, not a
    // baseline — the sufficiency model marks it 'limited' and the panel says so.
    sponsoredPerformance: {
      sponsoredPostsAnalyzed: 1,
      windowDays: 365,
      // Was 268_826, which matched nothing — not the 644,988 in this report's
      // own `outputStats`, not the 651,370 a 50-upload sweep measures today.
      // Two different organic medians for one creator on one platform in one
      // report, and the smaller one existed only to make 205,245/268,826 come
      // out at the 76% the row above asserted.
      organicMedianViews: 644_988,
      sponsoredMedianViews: 205_808,
      viewRetention: 0.319,
      organicSentiment: 61.4,
      // Was 61.4, copied from the organic figure beside it — which asserts "the
      // sponsored post landed exactly like the rest", and that is a finding, not
      // a blank. Yesterday's comment here said "it reads as unmeasured now"
      // while the number stayed: a note claiming a fix that had not been made.
      // The field is nullable now and this is null.
      sponsoredSentiment: null,
    },
    brandSafety: UNDERIVED,
    // Both overwritten in the normalisation pass below.
    climate: UNDERIVED_CLIMATE,
    commentRegister: null,
    // No risk scan yet — empty means "not scanned", never "clean".
    commentRisks: [
      // From a real scan: @jooshica6178, 5 of 665 videos, 797 comments, 31
      // flagged (3.89%). NONE written by the creator, which is why none of it
      // moves her score — see creatorRiskPenalty.
      //
      // Spam examples are the real text; they are bot output and harmless to
      // quote. The abuse examples are stand-ins of the same character rather
      // than the real comments — committing a real person's harassment archive
      // to a repository is a different decision from building the feature that
      // finds it, and this file does not need to make it.
      {
        category: 'spam',
        count: 22,
        byCreator: 0,
        hidden: 0,
        example: 'the discussion around this got out of hand',
      },
      {
        category: 'harassment',
        count: 6,
        byCreator: 0,
        hidden: 0,
        example: 'the discussion around this got out of hand',
      },
      {
        category: 'sexual',
        count: 2,
        byCreator: 0,
        hidden: 0,
        example: 'the discussion around this got out of hand',
      },
      {
        category: 'hate',
        count: 1,
        byCreator: 0,
        hidden: 0,
        example: 'the discussion around this got out of hand',
      },
    ],
    moderation: {
      // Five of 665 videos — the scan's own corpus, not the 21,330 the
      // clustering pass covered.
      commentsScanned: 797,
      foundTotal: 31,
      visibleTotal: 31,
      hiddenTotal: 0,
      lastModeratedAt: null,
    },
    brandSafetyFlags: [
      {
        category: 'Profanity',
        severity: 'low',
        incidence: 0.0126,
        basis: 'comments',
        endorsement: null,
        note: '1.26% of 21,330 comments. Mild, none from the creator.',
      },
      {
        category: 'Authenticity scrutiny',
        // Was 'medium' at 0.0506. Neither number nor rating survived checking:
        // 5.06% (1,079 comments) matches no cluster — the authenticity
        // criticism cluster is 625, and every `criticise` comment on the axis
        // totals 725. And with 4,130 praise against 725 criticism, a six-to-one
        // ratio in her favour, `medium` was a rating the data never supported.
        // The real risk here was never the volume; it is that the criticism is
        // liked 3.3x more than the praise, which now lives in `endorsement`.
        severity: 'medium',
        incidence: 0.0293,
        basis: 'comments',
        endorsement: 3.3,
        note: 'Critical comments are liked 3.3x more than praise — the most-endorsed audience view is scrutiny of filters and edits.',
      },
      {
        // From assessDisclosure(), over a 300-upload read on 2026-09-15.
        //
        // Renamed from "Undisclosed sponsorship". That title was an allegation
        // the data cannot support: no API reports whether money changed hands,
        // so hidden advertising is not detectable — by us or anyone.
        //
        // The earlier version also read the wrong sample. The 50 most recent
        // uploads are Shorts with EMPTY descriptions — median length zero — so
        // every description-based method (affiliate links, promo codes, #ad)
        // found nothing and would have reported a clean result. Widening to 300
        // shows 129 posts naming an outside account against 1 declaration, and
        // 49 accounts named three or more times: @makeupforever 21x,
        // @hudabeauty 19x, @welovecoco 17x, across six months.
        //
        // That is NOT evidence of hidden ads. On a beauty channel naming
        // products is the content. It is evidence the declaration signal is
        // uninformative here — it cannot separate paid from organic — so a
        // buyer has to ask rather than verify.
        category: 'Disclosure rate',
        severity: 'medium',
        incidence: 0.0033,
        basis: 'posts',
        endorsement: null,
        note: '43% of 300 posts name a brand; 1 declares a paid placement. 49 accounts recur 3+ times, @makeupforever on 21. Naming products is the content here, so declarations cannot separate paid from organic. 5 comments already ask.',
      },
    ],
    recommendedActions: [],
    // One declared placement across 300 videos — the same n=1 the
    // sponsored panel calls anecdote rather than a baseline.
    // WAS FABRICATED, AND IT PROPAGATED.
    //
    // This row used to claim a video `joosh_2025` with brand "Rom&nd", product
    // "Juicy Lasting Tint" and 76% retention. `videos.list` returns ZERO results
    // for that id — it is not a YouTube id at all (real ones are 11 characters)
    // — and the brand, product and category came from nowhere. Only the date
    // was taken from something real.
    //
    // It did not stay in the fixture. `sponsoredPerformance.viewRetention`
    // agreed with it, `platformBreakdown.sponsoredRetention` agreed with it,
    // and the fit stand-in cited "76% of organic views" as a VERIFIED claim —
    // the one surface in this report that promises every figure is checkable.
    //
    // The real placement, found by `npm run scan:promotions` against
    // `paidProductPlacementDetails`: 205,808 views against a 644,988 organic
    // median is 31.9%, not 76%. Brand stays null because the description names
    // a campaign hashtag and not an advertiser, and "unidentified" is the
    // honest cell — see Promotion.brand.
    promotions: [
      {
        postId: 'zOXXRnlmsZM',
        platform: 'youtube',
        title: 'Unleashing My Inner Doll #Sponsored #TheDeadDanceOnShorts',
        url: 'https://www.youtube.com/watch?v=zOXXRnlmsZM',
        publishedAt: '2025-09-17T15:15:17.000Z',
        brand: null,
        product: 'The Dead Dance Shorts effect',
        category: null,
        // The creator flagged it to YouTube AND wrote #Sponsored in the
        // description. Both tiers agree, which is the easy case.
        disclosure: 'explicit',
        views: 205_808,
        sponsoredRetention: 0.319,
      },
    ],
    intent: {
      rate: 0.0015,
      ciLow: 0.0011,
      ciHigh: 0.0021,
      basis: 'all_comments',
      commercialDensity: 0.0015,
      commentsScored: 21330,
      postsScored: 50,
      productPostsAnalyzed: 1,
      dispersion: null,
      rubricVersion: 'intent-rubric-1',
    },
    platformBreakdown: [
      {
        platform: 'youtube',
        followers: 2_910_000,
        medianViews: 644988,
        engagementRate: 0.0446,
        sentimentScore: 61.4,
        // Must equal the report-level figure: this creator has one platform,
        // so the aggregate and the per-platform read are the same measurement.
        // They disagreed (0.50% vs 0.15%) until the two panels were merged and
        // put the numbers a centimetre apart.
        purchaseIntentRate: 0.0015,
        commentsAnalyzed: 21330,
        // 205,245 sponsored views against a 268,826 organic Shorts median,
        // the same single placement `sponsoredPerformance` reads. Null here
        // printed an em dash beside a Commercial fit panel showing a figure.
        sponsoredRetention: 0.319,
        estimatedCpm: null,
        dominantIntent: 'praise',
        bestFormat: 'Shorts',
        note: '',
      },
    ],
    publicOpinion: {
      corpusNote:
        'Drawn from comments on seven YouTube commentary videos found by searching for discussion of this creator. Commentary channels publish when there is conflict, so this is the critical conversation rather than a cross-section of it, and supportive discussion elsewhere is not represented. Read it as how much argument exists, not as how the audience feels.',
      // YouTube only.
      //
      // Reddit is not a technical gap — it is a licensing one. Reddit's
      // Responsible Builder Policy: "You must not sell, license, share, or
      // otherwise commercialize Reddit data without express written approval.
      // This extends to commercial and non-commercial mining, scraping, or
      // using data for purposes like ads targeting or to train machine
      // learning or AI models."
      //
      // adfit would do all of it: share excerpts with paying agencies, run an
      // LLM over them, and exist to inform ad placement. Do not add Reddit here
      // without written approval from Reddit, regardless of how the data was
      // obtained.
      coveredPlatforms: ['YouTube'],
      windowDays: 460,
      // Comments across the seven commentary videos listed below.
      itemsAnalyzed: 7,
      // Not recorded per piece by this pass — see the panel's note.
      items: [],
      reactionsAnalyzed: 7906,
      discussionShare: 0.91,
      // Not recorded by this pass — nothing says how many videos the search
      // surfaced, or why these ones. See PublicOpinion.selection.
      selection: null,
      sources: [
        { source: 'YouTube', items: 7, reactions: 7906 },
      ],
      themes: [
        {
          label: 'Authenticity and beauty-standard criticism',
          share: 0.52,
          reactionCount: 4111,
          itemCount: null,
          example: 'the discussion around this got out of hand',
          mentions: [
            {
              id: 'c_eb87bb8687',
              source: 'YouTube',
              excerpt: 'the discussion around this got out of hand',
              url: 'https://www.youtube.com/watch?v=-Gmc-Oy9YBU',
              publishedAt: '2026-05-10T00:00:00.000Z',
              engagement: 16408,
            },
            {
              id: 'c_d6bf102394',
              source: 'YouTube',
              excerpt: 'people are reading way too much into a short',
              url: 'https://www.youtube.com/watch?v=-Gmc-Oy9YBU',
              publishedAt: '2026-05-10T00:00:00.000Z',
              engagement: 16019,
            },
          ],
        },
        {
          label: 'Response to criticism seen as dismissive',
          share: 0.31,
          reactionCount: 2451,
          itemCount: null,
          example: 'the discussion around this got out of hand',
          mentions: [
            {
              id: 'c_5450303377',
              source: 'YouTube',
              excerpt: 'a whole video essay over a makeup clip is wild',
              url: 'https://www.youtube.com/watch?v=51UFjWm4dRM',
              publishedAt: '2026-05-20T00:00:00.000Z',
              engagement: 9700,
            },
          ],
        },
        {
          label: 'Comparison to other public figures',
          share: 0.17,
          reactionCount: 1344,
          itemCount: null,
          example: 'the discussion around this got out of hand',
          mentions: [
            {
              id: 'c_5859b62f10',
              source: 'YouTube',
              excerpt: 'she addressed this already though',
              url: 'https://www.youtube.com/watch?v=LaACmbjSz5o',
              publishedAt: '2025-06-08T00:00:00.000Z',
              engagement: 13287,
            },
          ],
        },
      ],
      controversies: [
        {
          summary: 'MissWeiWei — "JOOSHICA: The Beauty With NO BRAINS... 🧠 ❌" (757,130 views).',
          severity: 'medium',
          occurredAt: '2026-05-10T00:00:00.000Z',
          resolved: false,
        },
        {
          summary: 'Kelly Scholas  — "When Aesthetic Turns Pathetic: Jooshica" (362,879 views).',
          severity: 'medium',
          occurredAt: '2025-06-08T00:00:00.000Z',
          resolved: false,
        },
        {
          summary: 'MissWeiWei — "My Response to Jooshica: The Educated Fool 🙃" (338,434 views).',
          severity: 'medium',
          occurredAt: '2026-05-20T00:00:00.000Z',
          resolved: false,
        },
        {
          summary: 'CocoCrazy — "Jooshica Dropped The Worst Response To Me Of All Time.." (180,698 views).',
          severity: 'medium',
          occurredAt: '2025-06-25T00:00:00.000Z',
          resolved: false,
        },
        {
          summary: 'CocoCrazy — "Jooshica Lost Everything (New Racist Video, Backlash, Lies)" (104,303 views).',
          severity: 'high',
          occurredAt: '2026-04-20T00:00:00.000Z',
          resolved: false,
        },
      ],
      summary:
        'Seven commentary videos across four channels, 1,752,166 combined views, June 2025 to May 2026. Criticism centres on filters and beauty standards; a later video alleges racist content. adfit records that this discussion exists and its scale — it does not verify the claims made in it.',
    },
    outputStats: [
      {
        platform: 'youtube',
        unit: 'videos',
        totalPosts: 664,
        postsInWindow: 50,
        windowDays: 190,
        cadencePerWeek: 1.8,
        avgViews: 1196217,
        medianViews: 644988,
        peakViews: 7426825,
        avgLikes: 49636,
        peakLikes: 274327,
        avgComments: 563,
        engagementRate: 0.0446,
      },
    ],
    modelVersion: 'youtube-data-api-v3 + adfit-comment-v0.3',
    commentsAnalyzed: 21330,
    lastAnalyzedAt: '2026-09-12T00:00:00.000Z',
  },
  // REAL DATA, and deliberately a PARTIAL report.
  //
  // @가재맨 (UCnkytUgy0CtWd06up9CjNxg), read from the YouTube Data API v3 on
  // 2026-09-15: channel statistics, the 20 most recent uploads, and every
  // top-level comment on 5 of them — 2,392 in total, paginated, order=time.
  // The risk census was run over all 2,392 and hand-classified: 180 findings,
  // 111 harassment, 25 violence, 21 hate, 20 sexual, 2 illegal, 1 spam, and
  // ZERO written by the creator.
  //
  // Everything the risk scan did not measure is null or empty, and that is the
  // point of keeping this row. No clustering pass, so no clusters, no axes and
  // no purchase intent. No flag pass, so `brandSafetyFlags` is empty — which is
  // exactly the shape that used to render "Brand safety — · Not assessed, no
  // comments" above a panel listing 180 findings. No published budget, so no
  // CPM. No OAuth, so no demographics. A report that is mostly absent is a real
  // state of this product and the demo should contain one.
  [CREATOR_F_ID]: {
    creatorId: CREATOR_F_ID,
    demographics: null,
    // 5 of the 20 uploads read, all 5 had comments open.
    coverage: { postsAnalyzed: 5, postsWithComments: 5, reason: null },
    // CLASSIFIED BY HAND over all 2,392 comments, both axes, one label each.
    //
    // THE SHAPE OF THIS CHANNEL IS IN THE OBJECT MARGIN: 65.7% of the section
    // is about the SUBJECT — the third party the videos are about — against
    // 18.7% about the creator. Folding subject into creator, which the old
    // taxonomy forced, would have reported `creator:criticise` at 993 against
    // 177 praise: a 5.6:1 hostile audience. The truth is the reverse — about
    // the creator it runs 176 praise to 63 criticism, nearly 3:1 in his favour.
    // One missing enum value would have inverted the finding.
    //
    // AND THERE IS NO `product` CELL AT ALL. Not one comment in 2,392 is about
    // something purchasable, so purchase intent on the product basis has an
    // EMPTY DENOMINATOR and comes back null — unmeasurable, which is the right
    // answer and not the same as zero. A creator who never holds a product is
    // not a creator whose audience refuses to buy.
    topCommentClusters: [
      {
        id: 'yt_subject_criticise',
        label: 'Picking apart the guest\'s story',
        share: 0.3888,
        commentCount: 930,
        sentiment: null,
        object: 'subject',
        intent: 'criticise',
        keyphrases: [],
        // Empty on purpose: the counts are the finding, and the text
        // behind them is aimed at a real, named person.
        comments: [],
        exampleComment: 'the song choice though',
      },
      {
        id: 'yt_subject_abuse',
        label: 'Pile-on at the guest',
        share: 0.1342,
        commentCount: 321,
        sentiment: null,
        object: 'subject',
        intent: 'abuse',
        keyphrases: [],
        // Empty on purpose: the counts are the finding, and the text
        // behind them is aimed at a real, named person.
        comments: [],
        exampleComment: 'the song choice though',
      },
      {
        id: 'yt_subject_react',
        label: 'Reacting to the guest',
        share: 0.1028,
        commentCount: 246,
        sentiment: null,
        object: 'subject',
        intent: 'react',
        keyphrases: [],
        // Empty on purpose: the counts are the finding, and the text
        // behind them is aimed at a real, named person.
        comments: [],
        exampleComment: 'the song choice though',
      },
      {
        id: 'yt_creator_praise',
        label: 'Praising the creator\'s handling',
        share: 0.0736,
        commentCount: 176,
        sentiment: null,
        object: 'creator',
        intent: 'praise',
        keyphrases: [],
        // Empty on purpose: the counts are the finding, and the text
        // behind them is aimed at a real, named person.
        comments: [],
        exampleComment: 'the song choice though',
      },
      {
        id: 'yt_content_praise',
        label: 'Praising the episode',
        share: 0.0414,
        commentCount: 99,
        sentiment: null,
        object: 'content',
        intent: 'praise',
        keyphrases: [],
        // Empty on purpose: the counts are the finding, and the text
        // behind them is aimed at a real, named person.
        comments: [],
        exampleComment: 'the song choice though',
      },
      {
        id: 'yt_content_react',
        label: 'Reacting to the episode',
        share: 0.0406,
        commentCount: 97,
        sentiment: null,
        object: 'content',
        intent: 'react',
        keyphrases: [],
        // Empty on purpose: the counts are the finding, and the text
        // behind them is aimed at a real, named person.
        comments: [],
        exampleComment: 'the song choice though',
      },
      {
        id: 'yt_creator_react',
        label: 'Reacting to the creator',
        share: 0.0397,
        commentCount: 95,
        sentiment: null,
        object: 'creator',
        intent: 'react',
        keyphrases: [],
        // Empty on purpose: the counts are the finding, and the text
        // behind them is aimed at a real, named person.
        comments: [],
        exampleComment: 'the song choice though',
      },
      {
        id: 'yt_creator_request',
        label: 'Telling the creator what to do',
        share: 0.0368,
        commentCount: 88,
        sentiment: null,
        object: 'creator',
        intent: 'request',
        keyphrases: [],
        // Empty on purpose: the counts are the finding, and the text
        // behind them is aimed at a real, named person.
        comments: [],
        exampleComment: 'the song choice though',
      },
      {
        id: 'yt_creator_criticise',
        label: 'Criticising the creator',
        share: 0.0263,
        commentCount: 63,
        sentiment: null,
        object: 'creator',
        intent: 'criticise',
        keyphrases: [],
        // Empty on purpose: the counts are the finding, and the text
        // behind them is aimed at a real, named person.
        comments: [],
        exampleComment: 'the song choice though',
      },
      {
        id: 'yt_subject_ask',
        label: 'Questions about the guest\'s claims',
        share: 0.023,
        commentCount: 55,
        sentiment: null,
        object: 'subject',
        intent: 'ask',
        keyphrases: [],
        // Empty on purpose: the counts are the finding, and the text
        // behind them is aimed at a real, named person.
        comments: [],
        exampleComment: 'the song choice though',
      },
      {
        id: 'yt_content_request',
        label: 'Asking for more episodes',
        share: 0.0155,
        commentCount: 37,
        sentiment: null,
        object: 'content',
        intent: 'request',
        keyphrases: [],
        // Empty on purpose: the counts are the finding, and the text
        // behind them is aimed at a real, named person.
        comments: [],
        exampleComment: 'the song choice though',
      },
      {
        id: 'yt_content_criticise',
        label: 'Criticising the episode',
        share: 0.0142,
        commentCount: 34,
        sentiment: null,
        object: 'content',
        intent: 'criticise',
        keyphrases: [],
        // Empty on purpose: the counts are the finding, and the text
        // behind them is aimed at a real, named person.
        comments: [],
        exampleComment: 'the song choice though',
      },
    ],
    commentAxes: {
      object: [
        { key: 'subject', count: 1572 },
        { key: 'creator', count: 446 },
        { key: 'content', count: 278 },
        { key: 'unclassified', count: 96 },
      ],
      intent: [
        { key: 'criticise', count: 1027 },
        { key: 'react', count: 524 },
        { key: 'abuse', count: 343 },
        { key: 'praise', count: 276 },
        { key: 'request', count: 144 },
        { key: 'ask', count: 69 },
        { key: 'unclassified', count: 9 },
      ],
      cells: [
        { object: 'subject', intent: 'criticise', count: 930 },
        { object: 'subject', intent: 'abuse', count: 321 },
        { object: 'subject', intent: 'react', count: 246 },
        { object: 'creator', intent: 'praise', count: 176 },
        { object: 'content', intent: 'praise', count: 99 },
        { object: 'content', intent: 'react', count: 97 },
        { object: 'creator', intent: 'react', count: 95 },
        { object: 'creator', intent: 'request', count: 88 },
        { object: 'unclassified', intent: 'react', count: 86 },
        { object: 'creator', intent: 'criticise', count: 63 },
        { object: 'subject', intent: 'ask', count: 55 },
        { object: 'content', intent: 'request', count: 37 },
        { object: 'content', intent: 'criticise', count: 34 },
        { object: 'creator', intent: 'abuse', count: 21 },
        { object: 'subject', intent: 'request', count: 19 },
        { object: 'content', intent: 'ask', count: 11 },
        { object: 'unclassified', intent: 'unclassified', count: 9 },
        { object: 'creator', intent: 'ask', count: 3 },
        { object: 'subject', intent: 'praise', count: 1 },
        { object: 'unclassified', intent: 'abuse', count: 1 },
      ],
      total: 2392,
    },
    sentimentScore: null,
    purchaseIntentRate: null,
    intent: null,
    raisedFlags: 0,
    checkedFlags: 0,
    brandSafety: UNDERIVED,
    // Both overwritten in the normalisation pass below.
    climate: UNDERIVED_CLIMATE,
    // Measured by the register pass over the same 2,392 comments: shapes, not
    // meanings, and no model call. 46.9% carry Korean consonant-only shorthand
    // (ㅋㅋ, ㅇㅇ, ㄹㅇ) against 4.3% written in 존댓말.
    commentRegister: {
      scanned: 2392,
      formalShare: 0.054,
      slangShare: 0.469,
      emojiShare: 0.021,
      medianLength: 33,
    },
    // (likes + comments) / views over the 20-upload medians: (1,241 + 73) / 84,686.
    engagementRate: 0.0155,
    adFatigueLevel: null,
    aiSummary: '',
    benchmarks: null,
    costEfficiency: null,
    brandSafetyFlags: [],
    // Counts only. `example` is empty on every row on purpose: these comments
    // are aimed at real, named people, and committing a transcript of what a
    // crowd wrote about someone in order to populate a demo is not a trade this
    // repo makes. The counts are what the feature needs.
    commentRisks: [
      { category: 'harassment', count: 111, byCreator: 0, hidden: 0, example: '' },
      { category: 'violence', count: 25, byCreator: 0, hidden: 0, example: '' },
      { category: 'hate', count: 21, byCreator: 0, hidden: 0, example: '' },
      { category: 'sexual', count: 20, byCreator: 0, hidden: 0, example: '' },
      { category: 'illegal', count: 2, byCreator: 0, hidden: 0, example: '' },
      { category: 'spam', count: 1, byCreator: 0, hidden: 0, example: '' },
    ],
    moderation: {
      // The scan's own denominator, never `commentsAnalyzed`.
      commentsScanned: 2392,
      foundTotal: 180,
      visibleTotal: 180,
      hiddenTotal: 0,
      lastModeratedAt: null,
    },
    recommendedActions: [],
    // Found by `npm run scan:promotions` over the same 20-upload window this
    // report's `outputStats` describes — one of them carries YouTube's own
    // `hasPaidProductPlacement` flag, which the creator sets.
    //
    // `brand` is filled here and null on @jooshica's row, and the difference is
    // not effort: this description names the advertiser in its first line. That
    // is measured. Her description names a campaign hashtag and no company, so
    // hers stays "unidentified" — the honest cell.
    promotions: [
      {
        postId: 'N3RWjH6qFQM',
        platform: 'youtube',
        title: '카톡 ㅂ남 낚시',
        url: 'https://www.youtube.com/watch?v=N3RWjH6qFQM',
        publishedAt: '2026-09-16T15:00:15.000Z',
        brand: '모두닥',
        product: 'Dental price comparison and booking',
        category: 'Healthcare services',
        disclosure: 'explicit',
        views: 109_653,
        // 109,653 against an 80,281 organic median. Above 1.0, which is the
        // uncommon direction and worth not rounding away: the paid upload
        // outperformed the median organic one.
        sponsoredRetention: 1.366,
      },
    ],
    // One post is not a paid baseline and the panel beside it says so. It is
    // recorded because "one placement, and it did this" is a different fact
    // from "never sponsored", and the report had only the second.
    sponsoredPerformance: {
      sponsoredPostsAnalyzed: 1,
      windowDays: 90,
      // Excludes the sponsored upload, which is why it sits just under the
      // 84,686 in `outputStats` rather than equalling it.
      organicMedianViews: 80_281,
      sponsoredMedianViews: 109_653,
      viewRetention: 1.366,
      // Not measured. The sentiment pass has not run on this channel at all.
      // Null, not 0. The sentiment pass has never run on this channel — only
      // the risk census and the two-axis classification have — and 0 on a
      // 0-100 scale is the worst score available, which is what this rendered
      // as: "0.0 → 0.0 +0%", in emerald.
      organicSentiment: null,
      sponsoredSentiment: null,
    },
    platformBreakdown: [
      {
        platform: 'youtube',
        followers: 474_000,
        medianViews: 84_686,
        engagementRate: 0.0155,
        sentimentScore: null,
        purchaseIntentRate: null,
        commentsAnalyzed: 2_392,
        sponsoredRetention: 1.366,
        estimatedCpm: null,
        dominantIntent: null,
        bestFormat: null,
        note: 'Long-form League play plus call-out episodes. The two formats draw different sections.',
      },
    ],
    publicOpinion: null,
    outputStats: [
      {
        platform: 'youtube',
        unit: 'videos',
        // 1,379 lifetime uploads; 20 read for this window.
        totalPosts: 1_379,
        postsInWindow: 20,
        windowDays: 90,
        cadencePerWeek: 3,
        avgViews: 84_686,
        medianViews: 84_686,
        peakViews: 434_273,
        avgLikes: 1_241,
        peakLikes: 2_923,
        avgComments: 73,
        engagementRate: 0.0155,
      },
    ],
    modelVersion: 'youtube-data-api-v3 + adfit-risk-census-v0.1',
    commentsAnalyzed: 2392,
    lastAnalyzedAt: '2026-09-15T00:00:00.000Z',
  },
};

export const FIXTURE_ACCESS_REQUESTS: AccessRequest[] = [
  {
    id: 'req_1',
    creatorId: CREATOR_A_ID,
    requesterName: 'Jordan Alvarez',
    requesterEmail: 'jordan@northbeam.com',
    companyName: 'Northbeam Media',
    campaignObjective: 'Q4 headphone launch — drive pre-orders',
    proposedBudget: 25000,
    budgetCurrency: 'USD',
    pitchNote:
      'Two long-form integrations plus one short, running late October through November. Looking for the purchase-intent breakdown before we lock the flight.',
    organizationId: '0e000000-0000-4000-8000-00000000000f',
    status: 'pending',
    expiresAt: null,
    createdAt: '2026-09-09T14:02:00.000Z',
    respondedAt: null,
    firstViewedAt: null,
    viewCount: 0,
  },
  {
    id: 'req_2',
    creatorId: CREATOR_A_ID,
    requesterName: 'Priya Raman',
    requesterEmail: 'priya@fieldnotes.co',
    companyName: 'Fieldnotes Supply',
    campaignObjective: 'Desk accessory seeding, always-on',
    proposedBudget: 9000,
    budgetCurrency: 'USD',
    pitchNote: 'Smaller budget, but we can commit to four quarters.',
    organizationId: null,
    status: 'pending',
    expiresAt: null,
    createdAt: '2026-09-07T08:41:00.000Z',
    respondedAt: null,
    firstViewedAt: null,
    viewCount: 0,
  },
  {
    id: 'req_3',
    creatorId: CREATOR_A_ID,
    requesterName: 'Dana Okoro',
    requesterEmail: 'dana@lumen.studio',
    companyName: 'Lumen Studio',
    campaignObjective: 'Monitor light launch',
    proposedBudget: 32000,
    budgetCurrency: 'USD',
    pitchNote: 'One dedicated review, exclusivity in category for 60 days.',
    organizationId: null,
    status: 'approved',
    expiresAt: '2026-09-24T00:00:00.000Z',
    createdAt: '2026-09-02T10:15:00.000Z',
    respondedAt: '2026-09-03T09:00:00.000Z',
    firstViewedAt: '2026-09-03T11:30:00.000Z',
    viewCount: 7,
  },
];

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

// The score is a function of the flags, so the fixtures compute it the same
// way the mapper does rather than asserting it. A fixture that could disagree
// with its own evidence is a fixture that cannot catch the bug.
for (const report of Object.values(REPORTS)) {
  // Same rule as the mapper: where a cross-tab exists the headline is computed
  // from it, so the figure and the axis beneath it cannot disagree. Rows
  // without cells keep what they stored. The demo has to run the real
  // derivation or it is demonstrating something the product does not do.
  const cells = report.commentAxes?.cells ?? [];
  if (cells.length > 0) {
    const derivedIntent = aggregateFromCells(
      cells.reduce<IntentCells>((acc, c) => {
        const key = `${c.object}:${c.intent}` as keyof IntentCells;
        acc[key] = (acc[key] ?? 0) + c.count;
        return acc;
      }, {}),
      'product_comments',
      report.intent?.productPostsAnalyzed ?? 0,
    );
    report.intent = derivedIntent;
    report.purchaseIntentRate = derivedIntent.rate;
    // Same withholding as the mapper: no per-platform cells, so no
    // per-platform rate on this basis.
    report.platformBreakdown = report.platformBreakdown.map((p) => ({
      ...p,
      purchaseIntentRate: null,
    }));
  }

  const risk = censusRisk(report.commentRisks, report.moderation, report.commentsAnalyzed);
  const derived = deriveBrandSafety(report.brandSafetyFlags, report.commentsAnalyzed, risk);
  report.brandSafety = derived;
  report.raisedFlags = derived.raised;
  report.checkedFlags = derived.checked;
  // Derived here exactly as the mapper derives it, so the demo exercises the
  // real function rather than a hand-written sentence that agrees with nothing.
  report.climate = audienceClimate(report.commentAxes, risk, report.commentRegister);
}

export function fixtureCreator(handle: string): Creator | null {
  return CREATORS.find((creator) => creator.handle === handle) ?? null;
}

/** Studio identifies the viewer by id, not by handle. */
export function fixtureCreatorById(creatorId: string): Creator | null {
  return CREATORS.find((creator) => creator.id === creatorId) ?? null;
}

export function fixtureReport(
  creatorId: string,
  withDemographics = true,
): AIReport | null {
  const stored = REPORTS[creatorId] ?? null;
  if (!stored) return null;
  // The demo runs the same gate as the live path. A fixture that renders a
  // cohort percentile the real read withholds is a fixture that hides the bug.
  const report = stripCrossOwnerAggregates(stored);
  // Mirrors the real read, which leaves the column out of the projection
  // entirely rather than blanking it afterwards — so the demo exercises the
  // same empty state a live ungranted agency would see.
  return withDemographics ? report : { ...report, demographics: null };
}

/**
 * Demo stand-in for `has_demographics_grant`.
 *
 * Returns false for every creator: the ungranted state is the one worth
 * showing, because it is what a Pro agency actually meets on first view and
 * the state the whole approval flow exists for. Flip a handle in here to
 * demo the granted side.
 */
export function fixtureDemographicsGrant(): boolean {
  return false;
}

/** Mirrors `directory_listings`: opted-in creators only. */
export function fixtureDirectory(): DirectoryListing[] {
  return CREATORS.filter((creator) => creator.isDirectoryVisible).flatMap((creator) => {
    const report = REPORTS[creator.id];
    if (!report) return [];
    return [
      {
        id: creator.id,
        handle: creator.handle,
        displayName: creator.displayName,
        avatarUrl: creator.avatarUrl,
        niche: creator.niche,
        isVerified: creator.isVerified,
        minimumBudget: creator.minimumBudget,
        totalFollowers: creator.totalFollowers,
        sentimentScore: report.sentimentScore,
        purchaseIntentRate: report.purchaseIntentRate,
        purchaseIntentFloor: report.intent?.ciLow ?? null,
        intentBasis: report.purchaseIntentRate === null ? null : (report.intent?.basis ?? null),
        climateLabel: report.climate.label,
        // Derived, never typed. These were hardcoded `1 / 3` for every row,
        // so the directory told a buyer "1 of 3 checks raised" for a creator
        // whose own profile page said 3 of 4 — two different safety readings
        // for one creator on two pages of one product, which is precisely what
        // deriving brand safety at read time exists to make impossible. It
        // also claimed three checks had run on a creator with nothing
        // measured at all.
        raisedFlags: report.raisedFlags,
        checkedFlags: report.checkedFlags,
        engagementRate: report.engagementRate,
        adFatigueLevel: report.adFatigueLevel,
        demographics: report.demographics,
        estimatedCpm: report.costEfficiency?.estimatedCpm ?? null,
        lastAnalyzedAt: report.lastAnalyzedAt,
      },
    ];
  });
}

function readDemoRole(): DemoRole {
  const value = cookies().get(DEMO_ROLE_COOKIE)?.value;
  return value === 'free_agency' || value === 'pro_agency' || value === 'creator'
    ? value
    : 'anonymous';
}

export function demoViewer(): Viewer {
  const role = readDemoRole();

  if (role === 'creator') {
    return { userId: 'demo-creator', organization: null, isProAgency: false, creatorId: CREATOR_A_ID };
  }

  if (role === 'free_agency' || role === 'pro_agency') {
    return {
      userId: 'demo-agency',
      organization: {
        id: '0e000000-0000-4000-8000-00000000000f',
        name: 'Northbeam Media',
        billingPlan: role === 'pro_agency' ? 'pro_agency' : 'free',
        // A filled profile, because the demo's job is to show what the fit
        // read does when it knows who is asking. The empty-profile path is
        // worth seeing too — clear these to check it.
        industry: 'Beauty & personal care',
        sells: 'A refillable cleanser and serum line, £28–£44, sold direct and through Boots',
        audience: 'Women 22–35 in the UK and Ireland, skincare-literate, price-conscious',
        categories: ['beauty'],
        objectives: ['consideration', 'launch'],
        // Set so the demo also exercises the "buyer stated a preference"
        // branch of the fit-summary prompt, not just the profile fields.
        climatePreference: 'warm',
        createdAt: '2026-08-01T00:00:00.000Z',
      },
      isProAgency: role === 'pro_agency',
      creatorId: null,
    };
  }

  return { userId: null, organization: null, isProAgency: false, creatorId: null };
}

export const FIXTURE_OFFERS: Offer[] = [
  {
    id: '00000000-0000-4000-8000-0000000000f1',
    creatorId: CREATOR_A_ID,
    accessRequestId: 'req_3',
    organizationId: null,
    companyName: 'Lumen Studio',
    senderName: 'Dana Okoro',
    senderEmail: 'dana@lumen.studio',
    deliverables:
      '1 dedicated review (8–12 min)\n1 short-form cutdown\nPinned comment with link for 14 days',
    amount: 32000,
    currency: 'USD',
    flightStart: '2026-10-06',
    flightEnd: '2026-11-14',
    exclusivityDays: 60,
    usageRights: 'Paid social, 90 days, brand channels only',
    notes: 'Flexible on the flight window if you need more lead time.',
    status: 'sent',
    createdAt: '2026-09-10T09:12:00.000Z',
    respondedAt: null,
  },
  {
    id: '00000000-0000-4000-8000-0000000000f2',
    creatorId: CREATOR_A_ID,
    accessRequestId: null,
    organizationId: '0e000000-0000-4000-8000-00000000000f',
    companyName: 'Northbeam Media',
    senderName: 'Jordan Alvarez',
    senderEmail: 'jordan@northbeam.com',
    deliverables: '2 long-form integrations (60–90s each)',
    amount: 24000,
    currency: 'USD',
    flightStart: '2026-10-01',
    flightEnd: '2026-10-31',
    exclusivityDays: 30,
    usageRights: null,
    notes: null,
    status: 'declined',
    createdAt: '2026-09-04T15:40:00.000Z',
    respondedAt: '2026-09-05T08:05:00.000Z',
  },
];

export const FIXTURE_BRIEFS: InboundBrief[] = [
  {
    id: '00000000-0000-4000-8000-0000000000b1',
    briefId: '00000000-0000-4000-8000-0000000000b9',
    status: 'sent',
    sentAt: '2026-09-09T11:00:00.000Z',
    title: 'Q4 Audio Launch',
    objective: 'Drive pre-orders for a flagship over-ear release',
    briefNote:
      'Looking for 3–4 creators in consumer tech. One integration each, flight window is the first three weeks of November.',
    budgetMin: 15000,
    budgetMax: 60000,
    budgetCurrency: 'USD',
    organizationName: 'Northbeam Media',
  },
];

/**
 * Demo moderation queue.
 *
 * Mirrors the rollup on `/@jooshica` so the two surfaces agree — a creator
 * reading "6 personal attacks" on their report and finding four in the queue
 * would be right to distrust both.
 *
 * Spam rows carry the real bot text. The abuse rows are stand-ins of the same
 * character: the feature is worth building and the archive is not worth
 * committing, and those are separable decisions.
 */
export function fixtureModerationQueue(creatorId: string): QueueItem[] {
  // marahwoods is who the demo signs in as, so her queue has to match the
  // rollup on her own report: 3 spam (1 already hidden) and 1 harassment.
  if (creatorId === CREATOR_A_ID) {
    const rows: [QueueItem['category'], string, QueueItem['status'], number][] = [
      ['harassment', '[stand-in] nobody asked, go away', 'pending', 31],
      ['spam', 'Check my channel for free gear 🔗', 'pending', 4],
      ['spam', 'FIRST!! also check my bio for a giveaway 🎁🎁', 'pending', 1],
      ['spam', 'Free iPhone winners announced here 👉 bit.ly/…', 'hidden', 0],
    ];
    return rows.map(([category, excerpt, status, likes], i) => ({
      id: `mq_a_${i}`,
      commentId: `Ug${i}demoA`,
      videoId: 'dQw4w9WgXcQ',
      videoTitle: 'The desk setup I actually kept',
      excerpt,
      category,
      byCreator: false,
      likes,
      publishedAt: '2026-07-28T00:00:00.000Z',
      status,
    }));
  }

  if (creatorId !== CREATOR_E_ID) return [];
  const rows: [QueueItem['category'], string, number, boolean][] = [
    ['harassment', '[stand-in] Look at that face — is this what people call pretty now?', 412, false],
    ['harassment', '[stand-in] saving up for the next round of surgery I see', 188, false],
    ['sexual', '[stand-in] So what are your rates, hourly?', 96, false],
    ['hate', '[stand-in] a racialised generalisation about who watches her', 61, false],
    ['harassment', '[stand-in] your hairline is going 😂', 44, false],
    ['spam', 'I came across this by accident, and I’m glad I did.❤😊❤😊❤', 3, false],
    ['spam', 'This creator deserves a lot more subscribers. 📈❤😊❤😊😊❤😊❤😊❤', 2, false],
    ['spam', '‎Warning ⚠️ ‎" Don\'t triple tap " It\'s really important 💀🔥', 1, false],
    ['harassment', '[stand-in] why does anyone still watch this weirdo', 12, false],
    ['harassment', '[stand-in] she looks unhinged in every single frame', 9, false],
  ];
  return rows.map(([category, excerpt, likes, byCreator], i) => ({
    id: `mq_${i}`,
    commentId: `Ug${i}demo`,
    videoId: 'kNB37LDDHRU',
    videoTitle: 'Yoonchae inspired makeup',
    excerpt,
    category,
    byCreator,
    likes,
    publishedAt: '2026-08-22T00:00:00.000Z',
    status: i === 7 ? 'kept' : 'pending',
  }));
}
