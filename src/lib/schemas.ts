import { z } from 'zod';

import { isReservedHandle } from './reserved-handles';
import { CAMPAIGN_CATEGORIES, CAMPAIGN_OBJECTIVES } from '@/types';

/**
 * Runtime shapes for everything crossing a trust boundary: jsonb columns
 * written by the AI pipeline, form input posted by anonymous brands, and
 * directory filters arriving as URL search params.
 *
 * Parsing jsonb here means a malformed pipeline write degrades one panel
 * instead of throwing inside a Server Component render.
 */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const share = z.number().min(0).max(1);

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'KRW', 'JPY'] as const;

// ---------------------------------------------------------------------------
// Pipeline output (jsonb columns)
// ---------------------------------------------------------------------------

export const teaserHighlightsSchema = z
  .array(
    z.object({
      label: z.string().min(1).max(48),
      tone: z.enum(['emerald', 'indigo', 'slate']).default('slate'),
    }),
  )
  .max(3)
  .catch([]);

const distributionBucketSchema = z.object({
  label: z.string().min(1).max(48),
  share,
});

export const demographicsSchema = z
  .object({
    ageBands: z.array(distributionBucketSchema).default([]),
    genderSplit: z.array(distributionBucketSchema).default([]),
    topCountries: z.array(distributionBucketSchema).default([]),
    activeAudienceRate: share.default(0),
  })
  .nullable()
  .catch(null);

/** Only http/https survive; see `safeExternalUrl`. Parsed permissively, guarded at render. */
const externalUrl = z
  .string()
  .max(2048)
  .nullable()
  .optional()
  .transform((value) => value ?? null);

const clusterCommentSchema = z.object({
  id: z.string().min(1),
  // Nullable since the verbatim horizon split: null means the 30-day cap
  // passed and the stored copy was dropped. The cluster around it survives.
  // Truncated, not rejected. This is a payload bound — the row is still a
  // true row with a long comment in it — and rejecting made a 660-character
  // comment invalidate its cluster, which `.catch([])` below then turned into
  // the loss of every cluster on the report.
  text: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v == null ? null : v.slice(0, 800))),
  platform: z.enum(['youtube', 'instagram']),
  postId: z.string().max(128),
  postTitle: z.string().max(200).nullable().optional().transform((v) => v ?? null),
  likes: z.coerce.number().min(0).nullable().optional().transform((v) => v ?? null),
  publishedAt: z.string().nullable().optional().transform((v) => v ?? null),
  basis: z.enum(['representative', 'most_liked', 'most_recent']).default('representative'),
  url: externalUrl,
});

const LEGACY_INTENT = {
  purchase: 'buy',
  question: 'ask',
  critique: 'criticise',
  reaction: 'react',
  off_topic: 'react',
} as const;

const legacyIntent = z
  .enum([
    'buy', 'request', 'ask', 'praise', 'criticise', 'abuse', 'react', 'unclassified',
    'purchase', 'question', 'critique', 'reaction', 'off_topic',
  ])
  .transform((v) => (v in LEGACY_INTENT ? LEGACY_INTENT[v as keyof typeof LEGACY_INTENT] : v))
  .pipe(
    z.enum(['buy', 'request', 'ask', 'praise', 'criticise', 'abuse', 'react', 'unclassified']),
  );

export const commentAxesSchema = z
  .object({
    object: z
      .array(z.object({ key: z.enum(['creator', 'content', 'product', 'subject', 'unclassified']), count: z.coerce.number().min(0) }))
      .default([]),
    intent: z
      .array(z.object({ key: legacyIntent, count: z.coerce.number().min(0) }))
      .default([]),
    cells: z
      .array(
        z.object({
          object: z.enum(['creator', 'content', 'product', 'subject', 'unclassified']),
          intent: legacyIntent,
          count: z.coerce.number().min(0),
        }),
      )
      .default([]),
    total: z.coerce.number().min(0),
  })
  .nullable()
  .catch(null);

export const commentClustersSchema = z
  .array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1).max(64),
      share,
      // Defaulted so rows written before migration 0007 still parse.
      commentCount: z.coerce.number().min(0).default(0),
      // Null where the intent axis already carries valence — see CommentCluster.
      sentiment: z.number().min(-1).max(1).nullable().optional().transform((v) => v ?? null),
      // Pre-taxonomy intent names, mapped rather than rejected so rows written
      // before the two-axis change still parse — and mapped here, at the trust
      // boundary, so nothing downstream has to know they existed.
      intent: legacyIntent,
      // Absent on every row written before two-axis classification. Null rather
      // than a guess: the object axis cannot be recovered from a single-axis
      // label, and inventing one would put fabricated figures under a heading
      // whose whole purpose is to be countable.
      object: z
        .enum(['creator', 'content', 'product', 'subject', 'unclassified'])
        .nullable()
        .optional()
        .transform((v) => v ?? null),
      keyphrases: z.array(z.string().max(40)).max(8).default([]),
      // Raised from 5 when the focused curation view landed: that view exists
      // to show all three evidence bases at once, and three most-liked plus
      // three typical plus two recent does not fit under five. The cap is a
      // payload bound, not a semantic one — every one of these ships to the
      // client on an unlocked page.
      comments: z.array(clusterCommentSchema).max(10).default([]),
      exampleComment: z.string().default('').transform((v) => v.slice(0, 500)),
    })
      // `.nullable()` first so the catch has a value it is allowed to return.
      .nullable()
      // PER ROW, not per array. `.catch([])` on the array alone meant one
      // malformed cluster discarded all of them — and `safeParse` reported
      // SUCCESS, because the catch had already swallowed it. A 660-character
      // comment overrunning a 500-character cap rendered as "no readable
      // comments on the analysed posts" over a corpus of 884 with seventeen
      // clusters sitting in the row.
      //
      // Note this breaks the shares-sum-to-1 contract for the rows that do
      // survive. That is the right trade: sixteen clusters whose shares sum to
      // 0.95 is a report with a rounding question in it, and zero clusters is
      // a report that says the audience never said anything.
      .catch(null),
  )
  .transform((rows) => rows.filter((row): row is NonNullable<typeof row> => row !== null))
  .catch([]);

export const platformStatsSchema = z
  .array(
    z.object({
      platform: z.enum(['youtube', 'instagram']),
      handle: z.string().nullable().default(null),
      followerCount: z.coerce.number().min(0).default(0),
      statsSummary: z
        .object({
          medianViews: z.number().optional(),
          postsAnalyzed: z.number().optional(),
          engagementRate: z.number().optional(),
        })
        .catch({}),
    }),
  )
  .catch([]);


// ---------------------------------------------------------------------------
// Buyer-side pipeline blocks (migration 0003)
//
// Each `.catch()` degrades one panel instead of failing the whole report: a
// malformed benchmark write should not take the demographics down with it.
// ---------------------------------------------------------------------------

const percentile = z.number().min(0).max(100);

export const benchmarksSchema = z
  .object({
    cohortLabel: z.string().min(1).max(80),
    cohortSize: z.coerce.number().min(0),
    metrics: z
      .array(
        z.object({
          metric: z.enum(['sentiment', 'purchaseIntent', 'brandSafety', 'engagement']),
          value: z.number(),
          cohortMedian: z.number(),
          percentile,
        }),
      )
      .default([]),
  })
  .nullable()
  .catch(null);

export const costEfficiencySchema = z
  .object({
    currency: z.string().length(3).default('USD'),
    basisBudget: z.number().min(0),
    medianViews: z.number().min(0),
    estimatedCpm: z.number().min(0),
    costPerThousandEngaged: z.number().min(0),
    cohortMedianCpm: z.number().min(0).nullable().default(null),
    cohortMedianRetention: z.number().min(0).max(2).nullable().default(null),
  })
  .nullable()
  .catch(null);

export const sponsoredPerformanceSchema = z
  .object({
    sponsoredPostsAnalyzed: z.coerce.number().min(0),
    windowDays: z.coerce.number().min(1),
    organicMedianViews: z.number().min(0),
    sponsoredMedianViews: z.number().min(0),
    viewRetention: z.number().min(0).max(5),
    organicSentiment: z.number().min(0).max(100).nullable().catch(null),
    sponsoredSentiment: z.number().min(0).max(100).nullable().catch(null),
  })
  .nullable()
  .catch(null);

export const commentRisksSchema = z
  .array(
    z.object({
      category: z.enum(['hate', 'sexual', 'violence', 'illegal', 'spam', 'harassment']),
      count: z.coerce.number().min(0),
      byCreator: z.coerce.number().min(0).default(0),
      hidden: z.coerce.number().min(0).default(0),
      example: z.string().max(400).default(''),
    }),
  )
  .catch([]);

/**
 * How the section is written. Every share is over `scanned`, its OWN
 * denominator — the register pass and the clustering pass can cover different
 * sets, and a share of the wrong corpus is the bug this repo keeps finding.
 */
export const commentRegisterSchema = z
  .object({
    scanned: z.coerce.number().min(0),
    formalShare: z.coerce.number().min(0).max(1),
    slangShare: z.coerce.number().min(0).max(1),
    emojiShare: z.coerce.number().min(0).max(1),
    medianLength: z.coerce.number().min(0),
  })
  .nullable()
  .catch(null);

export const moderationSchema = z
  .object({
    commentsScanned: z.coerce.number().min(0).default(0),
    foundTotal: z.coerce.number().min(0),
    visibleTotal: z.coerce.number().min(0),
    hiddenTotal: z.coerce.number().min(0),
    lastModeratedAt: z.string().nullable().optional().transform((v) => v ?? null),
  })
  .nullable()
  .catch(null);

/**
 * One flag. Parsed per item below rather than as an array, because
 * `.catch([])` over the whole array is a trapdoor: a single over-long note —
 * 391 characters against a 240 cap, in practice — silently deleted EVERY flag
 * on the report, and the panel rendered "Not assessed, no comments". A clean
 * result produced by a validation failure is the exact absence-as-safety bug
 * this report keeps having to remove. Now a bad flag drops and its siblings
 * survive.
 */
const brandSafetyFlagSchema = z.object({
      category: z.string().min(1).max(64),
      severity: z.enum(['none', 'low', 'medium', 'high']),
      incidence: share,
      // Null on rows written before the denominator was recorded. Scored as
      // 'comments', the strictest of the three — an unknown denominator must
      // not be able to flatter a creator.
      basis: z
        .enum(['comments', 'posts', 'sponsored_posts'])
        .nullable()
        .optional()
        .transform((v) => v ?? null),
      // Null is "not measured", never 1.0. A corpus without per-comment likes
      // cannot say whether criticism is endorsed, and inventing parity would
      // be the same error as a coerced zero.
      endorsement: z.coerce
        .number()
        .min(0)
        .max(100)
        .nullable()
        .optional()
        .transform((v) => v ?? null),
      note: z.string().max(240),
});

export const brandSafetyFlagsSchema = z
  .array(z.unknown())
  .transform((items) =>
    items.flatMap((item) => {
      const parsed = brandSafetyFlagSchema.safeParse(item);
      if (!parsed.success) {
        console.warn('[brandSafetyFlags] dropped an unparseable flag', parsed.error.issues[0]);
        return [];
      }
      return [parsed.data];
    }),
  )
  .catch([]);


export const recommendedActionsSchema = z
  .array(
    z.object({
      kind: z.enum(['do', 'avoid']),
      text: z.string().min(1).max(240),
    }),
  )
  .max(8)
  .catch([]);

/**
 * Past promotions.
 *
 * `disclosure` has no default and no fallback: a row that cannot say how we
 * know a post was an ad is dropped, because the alternative is rendering a
 * guess beside a disclosure and letting a buyer read them as the same claim.
 * `brand` and `product` stay nullable — "clearly an ad, advertiser
 * unidentifiable" is a real finding and renders as "unidentified".
 */
export const promotionsSchema = z
  .array(
    z.object({
      postId: z.string().min(1),
      platform: z.enum(['youtube', 'instagram']),
      title: z.string().min(1).max(200),
      url: externalUrl,
      publishedAt: z.string().min(1),
      brand: z.string().max(120).nullable().optional().transform((v) => v ?? null),
      product: z.string().max(160).nullable().optional().transform((v) => v ?? null),
      category: z.string().max(80).nullable().optional().transform((v) => v ?? null),
      disclosure: z.enum(['explicit', 'affiliate', 'inferred']),
      views: z.coerce.number().min(0).nullable().optional().transform((v) => v ?? null),
      sponsoredRetention: z.coerce
        .number()
        .min(0)
        .max(5)
        .nullable()
        .optional()
        .transform((v) => v ?? null),
    }),
  )
  .catch([]);

/**
 * The intent measurement.
 *
 * Parsed as a unit and discarded as a unit. An unrecognised `basis` fails the
 * whole object rather than defaulting, because a rate whose denominator we
 * cannot name is precisely the number migration 0013 exists to stop shipping —
 * and a default here would invent the denominator rather than admit it.
 *
 * The interval is cleared whenever the rate is absent. A bound without an
 * estimate is not a narrower claim, it is an incoherent one.
 */
export const intentMeasurementSchema = z
  .object({
    rate: share.nullable().default(null),
    ciLow: share.nullable().default(null),
    ciHigh: share.nullable().default(null),
    basis: z.enum(['product_comments', 'all_comments']),
    commercialDensity: share.nullable().default(null),
    commentsScored: z.coerce.number().min(0).default(0),
    postsScored: z.coerce.number().min(0).default(0),
    productPostsAnalyzed: z.coerce.number().min(0).default(0),
    dispersion: z.coerce.number().min(0).max(1).nullable().default(null),
    rubricVersion: z.string().max(64).nullable().default(null),
  })
  .transform((m) =>
    m.rate === null ? { ...m, ciLow: null, ciHigh: null } : m,
  )
  .nullable()
  .catch(null);

export const platformBreakdownSchema = z
  .array(
    z.object({
      platform: z.enum(['youtube', 'instagram']),
      followers: z.coerce.number().min(0),
      medianViews: z.coerce.number().min(0),
      engagementRate: share,
      sentimentScore: z.number().min(0).max(100).nullable().default(null),
      purchaseIntentRate: share.nullable().default(null),
      commentsAnalyzed: z.coerce.number().min(0),
      sponsoredRetention: z.number().min(0).max(5).nullable().default(null),
      estimatedCpm: z.number().min(0).nullable().default(null),
      dominantIntent: legacyIntent.nullable().catch(null),
      bestFormat: z.string().min(1).max(64).nullable().catch(null),
      note: z.string().max(240),
    }),
  )
  .catch([]);

export const outputStatsSchema = z
  .array(
    z.object({
      platform: z.enum(['youtube', 'instagram']),
      unit: z.enum(['videos', 'posts']),
      totalPosts: z.coerce.number().min(0),
      postsInWindow: z.coerce.number().min(0),
      windowDays: z.coerce.number().min(1),
      cadencePerWeek: z.number().min(0).max(100),
      avgViews: z.coerce.number().min(0),
      medianViews: z.coerce.number().min(0),
      peakViews: z.coerce.number().min(0),
      avgLikes: z.coerce.number().min(0).nullable().default(null),
      peakLikes: z.coerce.number().min(0).nullable().default(null),
      avgComments: z.coerce.number().min(0).nullable().default(null),
      engagementRate: share.nullable().default(null),
    }),
  )
  .catch([]);

export const commentCoverageSchema = z
  .object({
    postsAnalyzed: z.coerce.number().min(0).default(0),
    postsWithComments: z.coerce.number().min(0).default(0),
    reason: z.enum(['disabled', 'none_yet', 'restricted']).nullable().default(null),
  })
  .nullable()
  .catch(null);

// Sentiment keys are deliberately absent — see the note on `PublicOpinion` in
// src/types. Rows written before that decision still carry `netSentiment`,
// `trend` and per-source/per-theme `sentiment`; Zod strips unknown keys, so
// they are dropped here rather than reaching a renderer that might draw them.
export const publicOpinionSchema = z
  .object({
    corpusNote: z.string().max(400).nullable().default(null),
    coveredPlatforms: z
      .array(z.enum(['YouTube', 'Reddit', 'X', 'Instagram', 'TikTok', 'Forums', 'Press', 'Other']))
      .default([]),
    windowDays: z.coerce.number().min(1),
    itemsAnalyzed: z.coerce.number().min(0).optional(),
    items: z
      .array(
        z.object({
          id: z.string().min(1),
          source: z.string().min(1).max(32),
          title: z.string().min(1).max(200),
          publisher: z.string().max(120).nullable().optional().transform((v) => v ?? null),
          url: externalUrl,
          publishedAt: z.string(),
          // Null, never 0, where the medium has no count we collect — a zero
          // would claim silence under a piece that may be busy.
          reactions: z.coerce.number().min(0).nullable().optional().transform((v) => v ?? null),
        }),
      )
      .max(200)
      .default([]),
    mentionsAnalyzed: z.coerce.number().min(0).optional(),
    reactionsAnalyzed: z.coerce.number().min(0).nullable().optional().transform((v) => v ?? null),
    discussionShare: share,
    selection: z
      .object({
        surfaced: z.coerce.number().min(0).nullable().optional().transform((v) => v ?? null),
        read: z.coerce.number().min(0),
        rule: z.string().max(200).nullable().optional().transform((v) => v ?? null),
      })
      .nullable()
      .optional()
      .transform((v) => v ?? null),
    sources: z
      .array(
        z.object({
          source: z.string().min(1).max(32),
          // `mentions` on rows written before items and reactions were split.
          // Mapped onto `items`, which is wrong for YouTube commentary rows —
          // but wrong in the conservative direction: a corpus that looks
          // smaller than it is gets flagged as thin, where the old field made
          // seven videos look like eight thousand pieces of discussion.
          items: z.coerce.number().min(0).optional(),
          mentions: z.coerce.number().min(0).optional(),
          reactions: z.coerce.number().min(0).nullable().optional().transform((v) => v ?? null),
        })
        .transform((v) => ({
          source: v.source,
          items: v.items ?? v.mentions ?? 0,
          reactions: v.reactions,
        })),
      )
      .default([]),
    themes: z
      .array(
        z.object({
          label: z.string().min(1).max(64),
          share,
          // Absent on rows written before the count replaced the share. Left
          // at -1 rather than back-computed from `share x mentionsAnalyzed`:
          // that product is the same unsound proportion wearing a count's
          // clothes, and the panel can say "not recorded" honestly.
          reactionCount: z.coerce.number().min(0).optional().default(-1),
          itemCount: z.coerce.number().min(0).nullable().optional().transform((v) => v ?? null),
          mentions: z
            .array(
              z.object({
                id: z.string().min(1),
                source: z.string().max(32),
                excerpt: z.string().max(600).nullable().optional().transform((v) => v ?? null),
                url: externalUrl,
                publishedAt: z.string().nullable().optional().transform((v) => v ?? null),
                engagement: z.coerce.number().min(0).nullable().optional().transform((v) => v ?? null),
              }),
            )
            .max(5)
            .default([]),
          example: z.string().max(400).default(''),
        }),
      )
      .default([]),
    controversies: z
      .array(
        z.object({
          summary: z.string().min(1).max(300),
          severity: z.enum(['none', 'low', 'medium', 'high']),
          occurredAt: z.string(),
          resolved: z.boolean().default(false),
        }),
      )
      .default([]),
    summary: z.string().max(1200).default(''),
  })
  .transform((o) => ({
    ...o,
    // Derived from the sources rather than trusted. A stored total that no
    // longer matches what it sums is how a purged or merged corpus starts
    // describing a set larger than the one still in it — and `mentionsAnalyzed`
    // on legacy rows counted comments, so trusting it would carry the old
    // inflation forward under the new name.
    itemsAnalyzed: o.sources.reduce((sum, src) => sum + src.items, 0),
    reactionsAnalyzed: o.sources.some((src) => src.reactions !== null)
      ? o.sources.reduce((sum, src) => sum + (src.reactions ?? 0), 0)
      : null,
  }))
  .nullable()
  .catch(null);

// ---------------------------------------------------------------------------
// Track A: the 1:1 proposal form
// ---------------------------------------------------------------------------

const optionalBudget = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  .transform((value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed =
      typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  })
  .refine((value) => value === null || (value >= 0 && value <= 100_000_000), {
    message: 'Enter a budget between 0 and 100,000,000',
  });

export const accessRequestInputSchema = z.object({
  handle: z
    .string()
    .trim()
    .transform((value) => value.replace(/^@/, '').toLowerCase())
    .pipe(z.string().regex(/^[a-z0-9_][a-z0-9_.]{1,28}[a-z0-9_]$/, 'Unknown creator handle')),
  companyName: z.string().trim().min(2, 'Company name is required').max(120),
  requesterName: z.string().trim().min(2, 'Your name is required').max(120),
  requesterEmail: z
    .string()
    .trim()
    .toLowerCase()
    .regex(EMAIL_RE, 'Enter a valid work email')
    .max(254),
  campaignObjective: z
    .string()
    .trim()
    .min(3, 'Describe the campaign objective')
    .max(200, 'Keep the objective under 200 characters'),
  proposedBudget: optionalBudget,
  budgetCurrency: z.enum(CURRENCIES).default('USD'),
  pitchNote: z
    .string()
    .trim()
    .max(2000, 'Keep the note under 2,000 characters')
    .optional()
    .nullable()
    .transform((value) => value || null),
});

export type AccessRequestParsed = z.output<typeof accessRequestInputSchema>;

// ---------------------------------------------------------------------------
// Track B: bulk campaign brief
// ---------------------------------------------------------------------------

export const campaignBriefInputSchema = z
  .object({
    title: z.string().trim().min(3, 'Give the brief a title').max(140),
    objective: z.string().trim().min(3, 'Describe the objective').max(200),
    briefNote: z
      .string()
      .trim()
      .max(4000)
      .optional()
      .nullable()
      .transform((value) => value || null),
    budgetMin: optionalBudget,
    budgetMax: optionalBudget,
    budgetCurrency: z.enum(CURRENCIES).default('USD'),
    creatorIds: z
      .array(z.string().regex(UUID_RE))
      .min(1, 'Select at least one creator')
      .max(100, 'Send to at most 100 creators at a time'),
  })
  .refine(
    (value) =>
      value.budgetMin === null || value.budgetMax === null || value.budgetMin <= value.budgetMax,
    { message: 'Minimum budget cannot exceed the maximum', path: ['budgetMin'] },
  );

export type CampaignBriefParsed = z.output<typeof campaignBriefInputSchema>;

// ---------------------------------------------------------------------------
// Directory filters (URL search params)
// ---------------------------------------------------------------------------

const optionalNumber = (min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (!value) return undefined;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : undefined;
    });

export const directoryFiltersSchema = z.object({
  q: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((value) => value || undefined),
  niche: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((value) => value || undefined),
  minPurchaseIntent: optionalNumber(0, 1),
  maxAdFatigue: z.enum(['low', 'moderate', 'high']).optional().catch(undefined),
  maxMinimumBudget: optionalNumber(0, 100_000_000),
  maxCpm: optionalNumber(0, 10_000),
  sort: z
    .enum(['purchase_intent', 'followers', 'sentiment', 'recent', 'cpm'])
    .optional()
    .catch(undefined),
});

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const ACCOUNT_TYPES = ['creator', 'business'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(EMAIL_RE, 'Enter a valid email address')
  .max(254);

/**
 * Handle rules mirror the CHECK constraints on `creators.handle`: 3–30 chars,
 * lowercase alphanumerics plus `_` and `.`, not starting or ending with a dot,
 * and not one of the reserved route segments.
 */
export const handleSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/^@+/, '').toLowerCase())
  .pipe(
    z
      .string()
      .min(3, 'Handles are at least 3 characters')
      .max(30, 'Handles are at most 30 characters')
      .regex(
        /^[a-z0-9_][a-z0-9_.]*[a-z0-9_]$/,
        'Use letters, numbers, underscores and dots only',
      ),
  )
  .refine((value) => !isReservedHandle(value), 'That handle is reserved');

/**
 * A YouTube handle, as a creator would type it.
 *
 * Accepts `@name`, a channel URL, or a bare name, and normalises to `@name`.
 * Optional, because a creator with no channel should still be able to finish
 * signing up — but see `createCreatorProfile`: when it IS given it is resolved
 * against YouTube before the row is written, since a handle that does not
 * exist leaves Studio permanently empty and nothing downstream would say why.
 */
/**
 * What a creator may paste into the YouTube field.
 *
 * They are asked for "your YouTube URL", so the whole shape of what YouTube
 * puts in an address bar has to be accepted, not just the bare handle:
 *
 *     https://www.youtube.com/@가재맨          -> @가재맨
 *     https://youtube.com/@jooshica6178/videos -> @jooshica6178
 *     youtube.com/channel/UCxxxxxxxxxxxxxxxxx  -> UCxxxxxxxxxxxxxxxxx
 *     @jooshica6178                            -> @jooshica6178
 *     jooshica6178                             -> @jooshica6178
 *
 * `\w` was the bug and it was silent: it is ASCII-only, so the URL match
 * failed on @가재맨, the whole URL fell through as the "handle", and the final
 * refine rejected it with "Use your @handle, like @jooshica6178" — advice that
 * cannot be followed, because the handle WAS the problem. Every non-Latin
 * handle on YouTube — Korean, Japanese, Cyrillic, Arabic — was unenterable,
 * and the one real channel this product was built against is one of them.
 *
 * `\p{L}\p{N}` with the u flag is what YouTube actually allows.
 */
const CHANNEL_ID = /^UC[\w-]{22}$/;

export const youtubeHandleSchema = z
  .string()
  .trim()
  .max(200)
  .optional()
  .nullable()
  .transform((value) => {
    if (!value) return null;

    // A channel URL carries an id rather than a handle. Keep it as the id —
    // `resolveChannel` looks it up by id and returns the real handle, which is
    // what gets stored. Guessing a handle from an id is not possible.
    const byId = value.match(/youtube\.com\/channel\/(UC[\w-]{22})/i);
    if (byId) return byId[1];
    if (CHANNEL_ID.test(value)) return value;

    // Stop at the first path separator or query: /@handle/videos and
    // /@handle?sub_confirmation=1 are both links people actually copy.
    const byHandle = value.match(/youtube\.com\/(@[^/?#\s]+)/iu);
    const raw = byHandle ? byHandle[1] : value;
    const name = raw.replace(/^@/, '').trim();
    return name ? `@${name}` : null;
  })
  .refine((v) => v === null || CHANNEL_ID.test(v) || /^@[\p{L}\p{N}_.-]{3,30}$/u.test(v), {
    message: 'Paste your channel URL or your @handle, like youtube.com/@jooshica6178',
  });

export const creatorOnboardingSchema = z.object({
  handle: handleSchema,
  youtubeHandle: youtubeHandleSchema,
  displayName: z.string().trim().min(2, 'Add a display name').max(80),
  niche: z
    .string()
    .trim()
    .max(60)
    .optional()
    .nullable()
    .transform((value) => value || null),
  bio: z
    .string()
    .trim()
    .max(500, 'Keep the bio under 500 characters')
    .optional()
    .nullable()
    .transform((value) => value || null),
  budgetMin: optionalBudget,
  budgetMax: optionalBudget,
  budgetNegotiable: z.coerce.boolean().default(false),
  /** Track B opt-in. Off by default — the creator has to choose discovery. */
  isDirectoryVisible: z
    .union([z.literal('on'), z.literal('true'), z.literal(''), z.undefined(), z.null()])
    .transform((value) => value === 'on' || value === 'true'),
});

export type CreatorOnboardingParsed = z.output<typeof creatorOnboardingSchema>;

/**
 * Multi-select arriving from a form as repeated fields.
 *
 * Unknown values are dropped rather than rejected: a renamed category in a
 * stale browser tab should cost the buyer that one checkbox, not the whole
 * submission and everything else they typed.
 */
const fromChecklist = <T extends readonly string[]>(allowed: T) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => {
      const raw = v === undefined ? [] : Array.isArray(v) ? v : [v];
      return raw.filter((x): x is T[number] => (allowed as readonly string[]).includes(x));
    });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

export const businessOnboardingSchema = z.object({
  organizationName: z
    .string()
    .trim()
    .min(2, 'Add your company or agency name')
    .max(120, 'Keep the name under 120 characters'),
  // Everything below is optional on purpose. A buyer who fills none of it gets
  // a general read that SAYS it is general — which is honest, and better than
  // a required field that makes them invent an answer to get past the form.
  industry: optionalText(80),
  sells: optionalText(400),
  audience: optionalText(400),
  categories: fromChecklist(CAMPAIGN_CATEGORIES),
  objectives: fromChecklist(CAMPAIGN_OBJECTIVES),
});

export type BusinessOnboardingParsed = z.output<typeof businessOnboardingSchema>;

// ---------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------

const optionalDate = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null));

export const offerInputSchema = z
  .object({
    handle: z
      .string()
      .trim()
      .transform((value) => value.replace(/^@/, '').toLowerCase())
      .pipe(z.string().regex(/^[a-z0-9_][a-z0-9_.]{1,28}[a-z0-9_]$/, 'Unknown creator')),
    companyName: z.string().trim().min(2, 'Company name is required').max(120),
    senderName: z.string().trim().min(2, 'Your name is required').max(120),
    senderEmail: z.string().trim().toLowerCase().regex(EMAIL_RE, 'Enter a valid work email').max(254),
    deliverables: z
      .string()
      .trim()
      .min(5, 'Describe what the creator is being asked to produce')
      .max(2000),
    amount: z
      .union([z.number(), z.string()])
      .transform((value) => {
        const parsed =
          typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.]/g, ''));
        return Number.isFinite(parsed) ? parsed : NaN;
      })
      .refine((value) => Number.isFinite(value) && value >= 0 && value <= 100_000_000, {
        message: 'Enter a fee between 0 and 100,000,000',
      }),
    currency: z.enum(CURRENCIES).default('USD'),
    flightStart: optionalDate,
    flightEnd: optionalDate,
    exclusivityDays: z
      .string()
      .trim()
      .optional()
      .nullable()
      .transform((value) => {
        if (!value) return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? Math.min(730, Math.max(0, Math.round(parsed))) : null;
      }),
    usageRights: z.string().trim().max(500).optional().nullable().transform((v) => v || null),
    notes: z.string().trim().max(2000).optional().nullable().transform((v) => v || null),
  })
  .refine(
    (value) => !value.flightStart || !value.flightEnd || value.flightStart <= value.flightEnd,
    { message: 'Flight end cannot be before the start', path: ['flightEnd'] },
  );

export type OfferParsed = z.output<typeof offerInputSchema>;

/** A token is only worth a database round trip if it is a well-formed UUID. */
export function parseAccessToken(raw: string | string[] | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const token = raw.trim();
  return UUID_RE.test(token) ? token.toLowerCase() : null;
}

/** Narrow a `searchParams` entry to its first string value. */
export function firstParam(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}
