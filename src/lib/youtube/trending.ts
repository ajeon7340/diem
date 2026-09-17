import 'server-only';

import { parseDuration, ytFetch } from './client';

/**
 * YouTube's own trending chart.
 *
 * The cleanest surface in this product, policy-wise: `chart=mostPopular`
 * returns a list YouTube publishes, and displaying it is not aggregation of
 * anything. III.E.2 never enters, no amendment is required, and it costs 1
 * unit against a 10,000/day budget.
 *
 * WHAT IT IS NOT is a niche feed. YouTube has fourteen assignable categories
 * and they are coarse: a K-beauty creator is filed under People & Blogs (22)
 * alongside every vlog on the platform. Worse, the per-category charts are
 * thin — KR/22 returns five rows where the uncategorised chart returns ten.
 *
 * So the creator's own `categoryId` is a bad default even though it is the
 * obvious one. It is offered as a filter and labelled for what it is; the
 * product's own `niche` is the better organising idea, and needs `search.list`
 * at 100 units a call, which is a caching problem for another day.
 */

export interface TrendingVideo {
  id: string;
  title: string;
  channelTitle: string;
  channelId: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  durationSec: number;
  thumbnail: string | null;
}

export interface TrendingResult {
  videos: TrendingVideo[];
  regionCode: string;
  categoryId: string | null;
  units: number;
  /**
   * Set when a category chart came back thinner than asked for. The rows are
   * real; there are simply fewer of them, and silently showing five where ten
   * were requested reads as a bug.
   */
  thin: boolean;
}

/** Assignable categories, in the order YouTube returns them. */
export const CATEGORIES: Array<{ id: string; label: string }> = [
  { id: '1', label: 'Film & Animation' },
  { id: '2', label: 'Autos & Vehicles' },
  { id: '10', label: 'Music' },
  { id: '15', label: 'Pets & Animals' },
  { id: '17', label: 'Sports' },
  { id: '19', label: 'Travel & Events' },
  { id: '20', label: 'Gaming' },
  { id: '22', label: 'People & Blogs' },
  { id: '23', label: 'Comedy' },
  { id: '24', label: 'Entertainment' },
  { id: '25', label: 'News & Politics' },
  { id: '26', label: 'Howto & Style' },
  { id: '27', label: 'Education' },
  { id: '28', label: 'Science & Technology' },
];

export const REGIONS: Array<{ code: string; label: string }> = [
  { code: 'KR', label: 'South Korea' },
  { code: 'US', label: 'United States' },
  { code: 'JP', label: 'Japan' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'ID', label: 'Indonesia' },
];

interface RawTrending {
  id: string;
  snippet: {
    title: string;
    channelTitle: string;
    channelId: string;
    publishedAt: string;
    thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
  };
  statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails: { duration: string };
}

const WANTED = 12;

export async function fetchTrending(
  regionCode: string,
  categoryId: string | null,
): Promise<TrendingResult> {
  const params: Record<string, string | number> = {
    part: 'snippet,statistics,contentDetails',
    chart: 'mostPopular',
    maxResults: WANTED,
    regionCode,
  };
  if (categoryId) params.videoCategoryId = categoryId;

  const { items, units } = await ytFetch<RawTrending>('videos', params);

  return {
    regionCode,
    categoryId,
    units,
    thin: Boolean(categoryId) && items.length < WANTED,
    videos: items.map((v) => ({
      id: v.id,
      title: v.snippet.title,
      channelTitle: v.snippet.channelTitle,
      channelId: v.snippet.channelId,
      publishedAt: v.snippet.publishedAt,
      views: Number(v.statistics.viewCount ?? 0),
      likes: Number(v.statistics.likeCount ?? 0),
      comments: Number(v.statistics.commentCount ?? 0),
      durationSec: parseDuration(v.contentDetails.duration),
      thumbnail: v.snippet.thumbnails?.medium?.url ?? v.snippet.thumbnails?.default?.url ?? null,
    })),
  };
}
