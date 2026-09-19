'use server';

import { getViewer } from '@/lib/access/viewer';
import { YouTubeError, parseVideoId } from '@/lib/youtube/client';
import { explainVideo, type VideoExplain } from '@/lib/youtube/explain';
import { summariseVideo, type VideoSummary } from '@/lib/youtube/summarise';

export interface ExplainState {
  status: 'idle' | 'ok' | 'error';
  message: string;
  result: VideoExplain | null;
  /**
   * The written read, when the model could produce one.
   *
   * SEPARATE FROM `result`, and null is a normal outcome. The measurements are
   * computed from the API and stand on their own; the summary is a second pass
   * that can fail on a key, a quota or a refusal — and a page that loses its
   * figures because a sentence could not be written would be trading the part
   * that is checkable for the part that is not.
   */
  summary: VideoSummary | null;
  /** Which model wrote it, so a later reader can tell. */
  summaryModel: string | null;
}

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
    return { status: 'error', message: 'Sign in as a creator to analyse a video.', result: null, summary: null, summaryModel: null };
  }

  const raw = String(formData.get('url') ?? '').trim();
  if (!raw) {
    return { status: 'error', message: 'Paste a YouTube link first.', result: null, summary: null, summaryModel: null };
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
    summary: null,
    summaryModel: null,
    };
  }

  try {
    const scoped = await explainVideo(id);

    // Best effort, and its failure is not this action's failure. The figures
    // are measured; the sentence is a second pass over them.
    const written = await summariseVideo(scoped.value);
    if (!written.ok) {
      console.error('[studio/summarise] failed', { videoId: id, reason: written.reason });
    }

    return {
      status: 'ok',
      message: '',
      result: scoped.value,
      summary: written.ok ? written.summary : null,
      summaryModel: written.ok ? written.model : null,
    };
  } catch (err) {
    if (err instanceof YouTubeError) {
      if (err.reason === 'quotaExceeded') {
        return {
          status: 'error',
          message: 'The daily YouTube quota is spent. This resets at midnight Pacific.',
          result: null,
        summary: null,
        summaryModel: null,
        };
      }
      return { status: 'error', message: err.message, result: null, summary: null, summaryModel: null };
    }
    console.error('[studio/explain] failed', err);
    return { status: 'error', message: 'Could not read that video. Try again.', result: null, summary: null, summaryModel: null };
  }
}
