'use server';

import { getViewer } from '@/lib/access/viewer';
import { YouTubeError, parseVideoId } from '@/lib/youtube/client';
import { explainVideo, type VideoExplain } from '@/lib/youtube/explain';

export interface ExplainState {
  status: 'idle' | 'ok' | 'error';
  message: string;
  result: VideoExplain | null;
}

export const INITIAL_EXPLAIN: ExplainState = { status: 'idle', message: '', result: null };

/**
 * Analyse a video the creator pasted.
 *
 * Creator-gated, not because the data is private — it is a public video — but
 * because each call spends four quota units against a shared daily budget, and
 * an unauthenticated form is a free way for anyone to exhaust it.
 *
 * The result is NOT combined with the viewer's own channel anywhere. Both
 * analyses render on the page; each is computed inside its own owner. See
 * `withinOwner` in lib/youtube/scope for why that line is drawn in code.
 */
export async function explainPastedVideo(
  _prev: ExplainState,
  formData: FormData,
): Promise<ExplainState> {
  const viewer = await getViewer();
  if (!viewer.creatorId) {
    return { status: 'error', message: 'Sign in as a creator to analyse a video.', result: null };
  }

  const raw = String(formData.get('url') ?? '').trim();
  if (!raw) {
    return { status: 'error', message: 'Paste a YouTube link first.', result: null };
  }

  const id = parseVideoId(raw);
  if (!id) {
    return {
      status: 'error',
      // Naming the shapes is more useful than "invalid URL" — most failures
      // here are a channel link or a share link with tracking on it.
      message:
        'That does not look like a YouTube video link. A watch, Shorts or youtu.be link works; a channel link does not.',
      result: null,
    };
  }

  try {
    const scoped = await explainVideo(id);
    return { status: 'ok', message: '', result: scoped.value };
  } catch (err) {
    if (err instanceof YouTubeError) {
      if (err.reason === 'quotaExceeded') {
        return {
          status: 'error',
          message: 'The daily YouTube quota is spent. This resets at midnight Pacific.',
          result: null,
        };
      }
      return { status: 'error', message: err.message, result: null };
    }
    console.error('[studio/explain] failed', err);
    return { status: 'error', message: 'Could not read that video. Try again.', result: null };
  }
}
