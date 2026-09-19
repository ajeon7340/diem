import 'server-only';

import { YouTubeError, ytFetch } from '@/lib/youtube/client';
import { parseDuration } from '@/lib/youtube/parse';
import { isCandidate, loadExternalTerms, scanKeywords } from '@/lib/report/keywords';
import { measureRegister } from '@/lib/report/climate';
import { BRAND_RISK_CATEGORIES } from '@/types';
import type {
  BrandRiskCategory,
  CommentCoverage,
  CommentRegister,
  CommentRisk,
  ModerationState,
  PlatformAnalysis,
  PlatformOutput,
  Promotion,
  SponsoredPerformance,
  PromotionDisclosure,
} from '@/types';

/**
 * Build a report for a creator from their DECLARED channel, using the public
 * API and nothing else.
 *
 * The product had a complete report type, a complete renderer, and no way to
 * fill either for anybody who was not already in the fixtures. A creator who
 * signed up got "Access granted, but the report is still generating — the AI
 * pipeline runs after the creator connects their accounts", forever, because
 * no such pipeline existed. This is it.
 *
 * WHAT IT DELIBERATELY DOES NOT PRODUCE, and why each absence is a null rather
 * than a zero:
 *
 *   demographics   Age, gender and geography are Authorized Data. They come
 *                  from YouTube Analytics, which needs the creator's own OAuth
 *                  grant, and no public endpoint substitutes. Phase 2.
 *   commentAxes    The object x intent classification is a model pass. Without
 *                  ANTHROPIC_API_KEY it does not run, and the report says
 *                  "read but not classified" — which is a different sentence
 *                  from "no comments" and has its own state in `sufficiency`.
 *   sentiment      Same pass, same reason.
 *   benchmarks     A percentile needs a cohort. One creator is not a cohort.
 *
 * Everything else here is measured, and the measurement names its own
 * denominator: `coverage` counts posts read against posts with comments,
 * `moderation.commentsScanned` counts what the RISK scan read, and
 * `commentRegister.scanned` counts what the register pass read. Three passes,
 * three denominators, never divided into each other.
 *
 * Quota: roughly 1 + ceil(videos/50)*2 + one unit per comment page. A 50-video
 * channel with comments runs about 60 units against a 10,000/day budget.
 */

/** Per-page size for every list endpoint here. */
const PAGE = 50;
const COMMENT_PAGE = 100;

export interface AnalyzeOptions {
  /** Uploads to read. The default keeps a signup interactive. */
  maxVideos?: number;
  /** Comments per video. Bounds a channel with a 40,000-comment hit. */
  maxCommentsPerVideo?: number;
  /** Total comments across the channel, so one signup cannot exhaust the quota. */
  maxComments?: number;
  /** Days counted as "recent" for cadence and the output window. */
  windowDays?: number;
}

export interface ChannelReport {
  channelId: string;
  channelTitle: string;
  handle: string | null;
  subscribers: number | null;
  /**
   * The channel's own avatar and description.
   *
   * A media kit that opens with grey initials and an empty line, for a channel
   * whose picture and description are public and one field away in the same
   * response we already make, is asking the creator to retype what YouTube
   * already knows about them.
   */
  avatarUrl: string | null;
  description: string | null;
  outputStats: PlatformOutput[];
  platformBreakdown: PlatformAnalysis[];
  promotions: Promotion[];
  /** Null with no paid history — never a zeroed object. */
  sponsoredPerformance: SponsoredPerformance | null;
  coverage: CommentCoverage;
  commentsAnalyzed: number;
  commentRisks: CommentRisk[];
  moderation: ModerationState;
  commentRegister: CommentRegister | null;
  engagementRate: number | null;
  /** Quota units spent. Worth logging: this is a shared, exhaustible budget. */
  units: number;
}

interface RawVideo {
  id: string;
  snippet?: { title?: string; publishedAt?: string; description?: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration?: string };
  paidProductPlacementDetails?: { hasPaidProductPlacement?: boolean };
}

interface RawComment {
  id: string;
  videoId: string;
  text: string;
  authorChannelId: string | null;
}

/**
 * Disclosure markers, Korean first because that is where they appear on the
 * channels this was built against. Identical policy to `scan:promotions`: the
 * API flag is the only authoritative signal, a tracked link is commercial and
 * undisclosed, and a text marker is a reading of prose.
 */
const DISCLOSURE_MARKERS =
  /유료\s*광고|유료광고|협찬|광고\s*포함|제공\s*받|파트너십|소정의|#ad\b|#sponsored\b|paid\s+partnership/i;
const AFFILIATE_MARKERS =
  /coupa\.ng|link\.coupang|ali\.ski|s\.click\.aliexpress|amzn\.to|bit\.ly\/[A-Za-z0-9]+|rfrl\.co|linktr\.ee|\?(?:af|aff|affiliate|utm_campaign)=/i;

function classifyDisclosure(video: RawVideo): PromotionDisclosure | null {
  if (video.paidProductPlacementDetails?.hasPaidProductPlacement === true) return 'explicit';
  const description = video.snippet?.description ?? '';
  if (AFFILIATE_MARKERS.test(description)) return 'affiliate';
  if (DISCLOSURE_MARKERS.test(description)) return 'inferred';
  return null;
}

const num = (v: string | undefined) => (v === undefined ? null : Number(v));

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Mean of the values that exist. Null when none do — never 0. */
function meanOrNull(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0) / present.length;
}

export async function analyzeChannel(
  channelIdOrHandle: string,
  options: AnalyzeOptions = {},
): Promise<ChannelReport> {
  const maxVideos = options.maxVideos ?? 50;
  const maxCommentsPerVideo = options.maxCommentsPerVideo ?? 300;
  const maxComments = options.maxComments ?? 3_000;
  const windowDays = options.windowDays ?? 365;

  let units = 0;
  const byHandle = channelIdOrHandle.startsWith('@');

  const chan = await ytFetch<{
    id: string;
    snippet: {
      title: string;
      customUrl?: string;
      description?: string;
      thumbnails?: { high?: { url?: string }; medium?: { url?: string }; default?: { url?: string } };
    };
    contentDetails: { relatedPlaylists: { uploads?: string } };
    statistics: { subscriberCount?: string; hiddenSubscriberCount?: boolean; videoCount?: string };
  }>('channels', {
    part: 'snippet,contentDetails,statistics',
    ...(byHandle ? { forHandle: channelIdOrHandle } : { id: channelIdOrHandle }),
  });
  units += chan.units;

  const channel = chan.items[0];
  if (!channel) throw new YouTubeError(`No channel for ${channelIdOrHandle}`, 404, 'notFound');

  const channelId = channel.id;
  const uploads = channel.contentDetails.relatedPlaylists.uploads;

  // --- Uploads -------------------------------------------------------------
  const videoIds: string[] = [];
  if (uploads) {
    let pageToken: string | undefined;
    do {
      const page = await ytFetch<{ contentDetails: { videoId: string } }>('playlistItems', {
        part: 'contentDetails',
        playlistId: uploads,
        maxResults: String(PAGE),
        ...(pageToken ? { pageToken } : {}),
      }).catch((e: unknown) => {
        // A 404 on the uploads playlist means no public uploads. That is a
        // state the profile renders, not an error that fails a signup.
        if (e instanceof YouTubeError && e.status === 404) {
          return { items: [] as { contentDetails: { videoId: string } }[], units: 1, nextPageToken: undefined };
        }
        throw e;
      });
      units += page.units;
      for (const item of page.items) videoIds.push(item.contentDetails.videoId);
      pageToken = (page as { nextPageToken?: string }).nextPageToken;
    } while (pageToken && videoIds.length < maxVideos);
  }

  const capped = videoIds.slice(0, maxVideos);
  const videos: RawVideo[] = [];
  for (let i = 0; i < capped.length; i += PAGE) {
    const res = await ytFetch<RawVideo>('videos', {
      // paidProductPlacementDetails is a part on this same call, so the
      // disclosure read costs nothing extra and no caller should skip it.
      part: 'snippet,statistics,contentDetails,paidProductPlacementDetails',
      id: capped.slice(i, i + PAGE).join(','),
    });
    units += res.units;
    videos.push(...res.items);
  }

  // --- Output ---------------------------------------------------------------
  const now = Date.now();
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const inWindow = videos.filter((v) => {
    const at = v.snippet?.publishedAt ? Date.parse(v.snippet.publishedAt) : NaN;
    return Number.isFinite(at) && now - at <= windowMs;
  });

  const views = videos.map((v) => Number(v.statistics?.viewCount ?? 0));
  const likes = videos.map((v) => num(v.statistics?.likeCount));
  const commentCounts = videos.map((v) => num(v.statistics?.commentCount));
  const medianViews = median(views);
  const avgViews = views.length ? views.reduce((a, b) => a + b, 0) / views.length : 0;

  const subscribers = channel.statistics.hiddenSubscriberCount
    ? null
    : Number(channel.statistics.subscriberCount ?? 0) || null;

  // Engagement against VIEWS, not subscribers: subscriber counts are stale and
  // often hidden, and a ratio has to name what it is a ratio of.
  const perVideoEngagement = videos
    .map((v) => {
      const view = Number(v.statistics?.viewCount ?? 0);
      const like = num(v.statistics?.likeCount);
      const comment = num(v.statistics?.commentCount);
      if (!view || (like === null && comment === null)) return null;
      return ((like ?? 0) + (comment ?? 0)) / view;
    })
    .filter((v): v is number => v !== null);
  const engagementRate = perVideoEngagement.length ? median(perVideoEngagement) : null;

  const outputStats: PlatformOutput[] = [
    {
      platform: 'youtube',
      unit: 'videos',
      totalPosts: Number(channel.statistics.videoCount ?? 0) || videos.length,
      postsInWindow: inWindow.length,
      windowDays,
      cadencePerWeek: inWindow.length / (windowDays / 7),
      avgViews,
      medianViews,
      peakViews: views.length ? Math.max(...views) : 0,
      avgLikes: meanOrNull(likes),
      peakLikes: likes.some((l) => l !== null)
        ? Math.max(...likes.filter((l): l is number => l !== null))
        : null,
      avgComments: meanOrNull(commentCounts),
      engagementRate,
    },
  ];

  // --- Promotions -----------------------------------------------------------
  const found = videos
    .map((video) => ({ video, disclosure: classifyDisclosure(video) }))
    .filter((x): x is { video: RawVideo; disclosure: PromotionDisclosure } => x.disclosure !== null);
  const promotedIds = new Set(found.map((f) => f.video.id));

  // The baseline a paid post is read against is the ORGANIC median, not the
  // channel median: including the sponsored posts in their own denominator
  // flatters a channel whose paid posts underperform.
  const organicMedian = median(
    videos.filter((v) => !promotedIds.has(v.id)).map((v) => Number(v.statistics?.viewCount ?? 0)),
  );

  const promotions: Promotion[] = found.map(({ video, disclosure }) => {
    const videoViews = num(video.statistics?.viewCount);
    return {
      postId: video.id,
      platform: 'youtube',
      title: (video.snippet?.title ?? '').slice(0, 200),
      url: `https://www.youtube.com/watch?v=${video.id}`,
      publishedAt: video.snippet?.publishedAt ?? new Date().toISOString(),
      // Naming the advertiser needs the description read by a model. A guess
      // here invents a campaign that never ran; `Promotion.brand` renders null
      // as "unidentified", which is the honest cell.
      brand: null,
      product: null,
      category: null,
      disclosure,
      views: videoViews,
      sponsoredRetention:
        organicMedian > 0 && videoViews !== null
          ? Math.round((videoViews / organicMedian) * 1000) / 1000
          : null,
    };
  });

  // --- Comments -------------------------------------------------------------
  const comments: RawComment[] = [];
  let postsWithComments = 0;
  let unreadable = 0;

  for (const video of videos) {
    if (comments.length >= maxComments) break;
    let token: string | undefined;
    let readHere = 0;
    let reachable = true;
    do {
      let page;
      try {
        page = await ytFetch<{
          snippet: {
            topLevelComment: {
              id: string;
              snippet: { textDisplay?: string; authorChannelId?: { value?: string } };
            };
          };
        }>('commentThreads', {
          part: 'snippet',
          videoId: video.id,
          maxResults: String(COMMENT_PAGE),
          // Chronological, not relevance. YouTube's ranker surfaces the loud
          // and the contentious, and a sample drawn through it is not a
          // sample of the section.
          order: 'time',
          textFormat: 'plainText',
          ...(token ? { pageToken: token } : {}),
        });
      } catch {
        // Comments disabled or restricted. Counted, never fatal: coverage has
        // to tell "read and empty" apart from "could not read".
        reachable = false;
        break;
      }
      units += page.units;
      for (const thread of page.items) {
        const c = thread.snippet?.topLevelComment;
        if (!c) continue;
        comments.push({
          id: c.id,
          videoId: video.id,
          text: c.snippet?.textDisplay ?? '',
          authorChannelId: c.snippet?.authorChannelId?.value ?? null,
        });
        readHere += 1;
      }
      token = (page as { nextPageToken?: string }).nextPageToken;
    } while (token && readHere < maxCommentsPerVideo && comments.length < maxComments);

    if (!reachable) unreadable += 1;
    else if (readHere > 0) postsWithComments += 1;
  }

  // --- Risk census, by keyword lens ----------------------------------------
  //
  // A recall lens over text, not a classifier: it finds candidates, and what
  // it misses is not a clean comment section. The model pass that would
  // confirm these is the same one that produces `commentAxes`; when it has not
  // run, these counts stand on their own and the rubric version says which
  // lens produced them.
  const extra = loadExternalTerms();
  const counts = new Map<BrandRiskCategory, { count: number; byCreator: number }>();
  for (const category of BRAND_RISK_CATEGORIES) counts.set(category, { count: 0, byCreator: 0 });

  for (const comment of comments) {
    if (!isCandidate(comment.text, extra)) continue;
    const matches = scanKeywords(comment.text, extra);
    const categories = new Set(
      matches.map((m) => m.kind).filter((k): k is BrandRiskCategory => k !== 'quality'),
    );
    for (const category of categories) {
      const entry = counts.get(category);
      if (!entry) continue;
      entry.count += 1;
      // The only part that reflects on the creator. Everything else is a
      // measure of who showed up, not of who they are.
      if (comment.authorChannelId && comment.authorChannelId === channelId) entry.byCreator += 1;
    }
  }

  const commentRisks: CommentRisk[] = BRAND_RISK_CATEGORIES.map((category) => ({
    category,
    ...counts.get(category)!,
    hidden: 0,
    // Never a real comment. Committing a transcript of what a crowd wrote
    // about a named person in order to populate a demo is not a trade this
    // repo makes; the counts are what the feature needs.
    example: '',
  })).filter((r) => r.count > 0);

  const foundTotal = commentRisks.reduce((sum, r) => sum + r.count, 0);
  const moderation: ModerationState = {
    // Its own denominator. The risk scan read exactly these comments, which is
    // not necessarily what any other pass read.
    commentsScanned: comments.length,
    foundTotal,
    visibleTotal: foundTotal,
    hiddenTotal: 0,
    lastModeratedAt: null,
  };

  const coverage: CommentCoverage = {
    postsAnalyzed: videos.length,
    postsWithComments,
    reason:
      postsWithComments > 0
        ? null
        : unreadable > 0
          ? 'disabled'
          : videos.length === 0
            ? 'none_yet'
            : 'none_yet',
  };

  const platformBreakdown: PlatformAnalysis[] = [
    {
      platform: 'youtube',
      followers: subscribers ?? 0,
      medianViews,
      engagementRate: engagementRate ?? 0,
      // Both need the classifier. Null, not zero: zero is the worst score on
      // a 0-100 scale and the best-looking rate on a 0-1 one.
      sentimentScore: null,
      purchaseIntentRate: null,
      commentsAnalyzed: comments.length,
      sponsoredRetention:
        promotions.length > 0
          ? (meanOrNull(promotions.map((p) => p.sponsoredRetention)) ?? null)
          : null,
      estimatedCpm: null,
      dominantIntent: null,
      bestFormat: bestFormat(videos),
      note: '',
    },
  ];

  // The Commercial panel and the platform row read two different fields, and
  // leaving this null while `platformBreakdown.sponsoredRetention` carried a
  // figure printed "Sponsored retention 174%" and "No sponsored history" on
  // one page. One measurement, one source.
  const sponsoredViews = promotions
    .map((p) => p.views)
    .filter((v): v is number => v !== null);
  const sponsoredPerformance: SponsoredPerformance | null =
    promotions.length > 0 && organicMedian > 0 && sponsoredViews.length > 0
      ? {
          sponsoredPostsAnalyzed: promotions.length,
          windowDays,
          organicMedianViews: organicMedian,
          sponsoredMedianViews: median(sponsoredViews),
          viewRetention: Math.round((median(sponsoredViews) / organicMedian) * 1000) / 1000,
          // The sentiment pass is the classifier, and it has not run. Null, not
          // the organic figure copied across, which would assert "the paid post
          // landed exactly like the rest" — a finding, not a blank.
          organicSentiment: null,
          sponsoredSentiment: null,
        }
      : null;

  return {
    channelId,
    channelTitle: channel.snippet.title,
    handle: channel.snippet.customUrl ?? (byHandle ? channelIdOrHandle : null),
    subscribers,
    // Highest first: this renders at 40px on the profile and 28px in the
    // signup card, and YouTube's default thumbnail is 88px square.
    avatarUrl:
      channel.snippet.thumbnails?.high?.url ??
      channel.snippet.thumbnails?.medium?.url ??
      channel.snippet.thumbnails?.default?.url ??
      null,
    description: channel.snippet.description?.trim() || null,
    outputStats,
    platformBreakdown,
    promotions,
    sponsoredPerformance,
    coverage,
    commentsAnalyzed: comments.length,
    commentRisks,
    moderation,
    commentRegister: measureRegister(comments.map((c) => c.text)),
    engagementRate,
    units,
  };
}

/**
 * Which length of video performs best on this channel, by median views.
 *
 * Median rather than mean, and null rather than a guess when one bucket has
 * too few posts to say anything: "Shorts work for you" off two uploads is a
 * recommendation built on noise.
 */
function bestFormat(videos: RawVideo[]): string | null {
  const buckets: Record<string, number[]> = { Shorts: [], 'Mid-length': [], 'Long-form': [] };
  for (const v of videos) {
    const seconds = v.contentDetails?.duration ? parseDuration(v.contentDetails.duration) : 0;
    if (!seconds) continue;
    const key = seconds <= 60 ? 'Shorts' : seconds <= 600 ? 'Mid-length' : 'Long-form';
    buckets[key].push(Number(v.statistics?.viewCount ?? 0));
  }
  const ranked = Object.entries(buckets)
    .filter(([, vals]) => vals.length >= 3)
    .map(([name, vals]) => ({ name, med: median(vals) }))
    .sort((a, b) => b.med - a.med);
  return ranked.length >= 2 ? ranked[0].name : null;
}
