'use server';

import { getViewer } from '@/lib/access/viewer';
import { ytFetch } from '@/lib/youtube/client';
import { summariseTrending, type TrendingSummary } from '@/lib/youtube/summarise';
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
      snippet: { title: string; channelTitle: string; channelId: string; publishedAt: string };
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

    const result = await summariseTrending(video, niche);
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
