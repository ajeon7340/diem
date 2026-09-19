'use server';

import { getViewer } from '@/lib/access/viewer';
import { ytFetch } from '@/lib/youtube/client';
import { summariseTrending, type TrendingSummary } from '@/lib/youtube/summarise';
import { fetchVideoComments } from '@/lib/ingest/classify';
import { fetchTrending } from '@/lib/youtube/trending';
import type { TrendingVideo } from '@/lib/youtube/trending';

export interface TrendingExplainState {
  status: 'idle' | 'ok' | 'error';
  videoId: string | null;
  message: string;
  summary: TrendingSummary | null;
}

/**
 * Describe one trending video, on demand.
 *
 * RE-FETCHED SERVER-SIDE rather than trusting what the page sends. The client
 * already has the title and the counts, and passing them would be one fewer
 * quota unit — but then the facts the model is given are whatever the browser
 * says they are, and a summary is a sentence this product puts its name to.
 * `ytFetch` caches for fifteen minutes, so a second click on the same video
 * costs nothing.
 *
 * Signed-in only. It spends model budget, and an unauthenticated endpoint that
 * spends money on request is a bill somebody else writes.
 */
/**
 * FORM STATE, not a bare call.
 *
 * Invoking a server action from a client component re-renders the page's
 * server tree, which remounts the client tree and DISCARDS its `useState`.
 * The first version held the summary in local state: the action returned, the
 * state was set, and the re-render threw it away — a 200 response, a vanished
 * button and nothing on screen. `useFormState` is the state Next preserves
 * across that boundary, which is why every other action here is written this
 * way.
 *
 * `niche` rides in the form. Unlike the video's figures it is not a claim
 * about the world — it is what this creator said they do — so it does not need
 * re-fetching to be trustworthy.
 */
export async function explainTrendingVideo(
  _prev: TrendingExplainState,
  formData: FormData,
): Promise<TrendingExplainState> {
  const clean = String(formData.get('videoId') ?? '').trim();
  const niche = (formData.get('niche') as string | null)?.trim() || null;
  if (!/^[A-Za-z0-9_-]{11}$/.test(clean)) {
    return { status: 'error', videoId: null, message: 'That is not a video id.', summary: null };
  }

  const viewer = await getViewer();
  if (!viewer.userId) {
    return {
      status: 'error',
      videoId: clean,
      message: 'Sign in to read a summary.',
      summary: null,
    };
  }

  try {
    const { items } = await ytFetch<{
      id: string;
      snippet: {
        title: string;
        channelTitle: string;
        channelId: string;
        publishedAt: string;
        description?: string;
        tags?: string[];
      };
      statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
      contentDetails: { duration: string };
    }>('videos', { part: 'snippet,statistics,contentDetails', id: clean });

    const raw = items[0];
    if (!raw) {
      return {
        status: 'error',
        videoId: clean,
        message: 'YouTube no longer returns that video.',
        summary: null,
      };
    }

    const { parseDuration } = await import('@/lib/youtube/parse');
    const video: TrendingVideo = {
      id: raw.id,
      title: raw.snippet.title,
      channelTitle: raw.snippet.channelTitle,
      channelId: raw.snippet.channelId,
      publishedAt: raw.snippet.publishedAt,
      views: Number(raw.statistics.viewCount ?? 0),
      likes: Number(raw.statistics.likeCount ?? 0),
      comments: Number(raw.statistics.commentCount ?? 0),
      durationSec: parseDuration(raw.contentDetails.duration),
      thumbnail: null,
    };

    // The chart this video sits in, for comparison. Cached fifteen minutes by
    // `ytFetch`, and the page that rendered the row fetched it moments ago —
    // so this is almost always free. Without it "184k views/day" is a number
    // with nothing to be fast or slow against.
    const region = String(formData.get('region') ?? 'US');
    const category = (formData.get('category') as string | null) || null;
    const chart = await fetchTrending(region, category).catch(() => null);
    const perDay = (v: { views: number; publishedAt: string }) =>
      v.views / Math.max(0.5, (Date.now() - Date.parse(v.publishedAt)) / 86_400_000);
    const engagementOf = (v: { views: number; likes: number; comments: number }) =>
      v.views > 0 ? (v.likes + v.comments) / v.views : 0;
    const medianOf = (ns: number[]) => {
      if (ns.length === 0) return null;
      const sorted = [...ns].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    };
    const rank = chart ? chart.videos.findIndex((v) => v.id === clean) + 1 : 0;

    // What viewers are actually reacting to — the only direct evidence of why
    // something is spreading, and the thing the first version was missing.
    const apiKey = process.env.YOUTUBE_API_KEY;
    const topComments = apiKey
      ? await fetchVideoComments(apiKey, clean, 100)
          .then((r) => [...r.comments].sort((a, b) => b.likes - a.likes).map((c) => c.text))
          .catch(() => [] as string[])
      : [];

    const result = await summariseTrending(video, niche, {
      rank: rank > 0 ? rank : 1,
      chartSize: chart?.videos.length ?? 1,
      chartMedianViewsPerDay: chart ? Math.round(medianOf(chart.videos.map(perDay)) ?? 0) || null : null,
      chartMedianEngagement: chart ? medianOf(chart.videos.map(engagementOf)) : null,
      description: raw.snippet.description?.trim() || null,
      tags: raw.snippet.tags ?? [],
      comments: topComments,
    });
    if (!result.ok) {
      console.error('[trending/explain] failed', { videoId: clean, reason: result.reason });
      return {
        status: 'error',
        videoId: clean,
        // Never the provider's words. A rate-limit body or a stack trace is
        // not a status line, and the states above say everything actionable.
        message: 'Could not write a summary just now.',
        summary: null,
      };
    }
    return { status: 'ok', videoId: clean, message: '', summary: result.summary };
  } catch (error) {
    console.error('[trending/explain] failed', error);
    return {
      status: 'error',
      videoId: clean,
      message: 'Could not read that video just now.',
      summary: null,
    };
  }
}
