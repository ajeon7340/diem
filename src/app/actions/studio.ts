'use server';

import { getViewer } from '@/lib/access/viewer';
import { YouTubeError, parseVideoId } from '@/lib/youtube/client';
import { explainVideo, type VideoExplain } from '@/lib/youtube/explain';
import { summariseVideo, type VideoSummary } from '@/lib/youtube/summarise';
import { fetchVideoComments } from '@/lib/ingest/classify';
import { buildClusters } from '@/lib/ingest/clusters';
import { classifyAxes, rollUpAxes } from '@/lib/ingest/intent';
import type { CommentCluster } from '@/types';

/**
 * What one video's own comment section says.
 *
 * SCOPED TO THE VIDEO. The channel-wide pass writes `comment_axes` on the
 * report; this reads one upload and nothing else, because a per-video panel
 * whose corpus quietly included the rest of the channel would print the
 * channel's shares under one video's title.
 */
export interface VideoComments {
  /** Comments read on this video. The denominator for everything below. */
  scanned: number;
  /** False when the section could not be read at all — not the same as empty. */
  readable: boolean;
  clusters: CommentCluster[];
  sentiment: number | null;
}

export interface ExplainState {
  status: 'idle' | 'ok' | 'error';
  message: string;
  result: VideoExplain | null;
  /** Null on the pasted-URL path: reading a stranger's comments is a different
   *  ask, and it is not what that box is for. */
  comments: VideoComments | null;
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
    return { status: 'error', message: 'Sign in as a creator to analyse a video.', result: null, comments: null, summary: null, summaryModel: null };
  }

  const raw = String(formData.get('url') ?? '').trim();
  if (!raw) {
    return { status: 'error', message: 'Paste a YouTube link first.', result: null, comments: null, summary: null, summaryModel: null };
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
      comments: null,
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
      comments: null,
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
          comments: null,
        summary: null,
        summaryModel: null,
        };
      }
      return { status: 'error', message: err.message, result: null, comments: null, summary: null, summaryModel: null };
    }
    console.error('[studio/explain] failed', err);
    return { status: 'error', message: 'Could not read that video. Try again.', result: null, comments: null, summary: null, summaryModel: null };
  }
}


/**
 * The same read, for one of the creator's OWN uploads.
 *
 * Separate from `explainPastedVideo` because the two are asked different
 * questions and must not share a form: that one takes a URL a person typed and
 * may be any channel's; this one takes an id from a list the server already
 * rendered for this creator. Both still analyse the video against ITS OWN
 * channel — `withinOwner` in lib/youtube/scope is why that line is drawn in
 * code rather than in a comment.
 */
export async function explainOwnVideo(
  _prev: ExplainState,
  formData: FormData,
): Promise<ExplainState> {
  const viewer = await getViewer();
  if (!viewer.creatorId) {
    return {
      status: 'error',
      message: 'Sign in as a creator to read a video.',
      result: null,
      comments: null,
      summary: null,
      summaryModel: null,
    };
  }

  const id = String(formData.get('videoId') ?? '').trim();
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) {
    return {
      status: 'error',
      message: 'That is not a video id.',
      result: null,
      comments: null,
      summary: null,
      summaryModel: null,
    };
  }

  try {
    const scoped = await explainVideo(id);

    // Both passes over one video, in parallel: they read different things and
    // neither needs the other's answer.
    const [written, comments] = await Promise.all([
      summariseVideo(scoped.value),
      readVideoComments(id),
    ]);
    if (!written.ok) {
      console.error('[studio/own-video] summary failed', { videoId: id, reason: written.reason });
    }
    return {
      status: 'ok',
      message: '',
      result: scoped.value,
      comments,
      summary: written.ok ? written.summary : null,
      summaryModel: written.ok ? written.model : null,
    };
  } catch (err) {
    if (err instanceof YouTubeError && err.reason === 'quotaExceeded') {
      return {
        status: 'error',
        message: 'The daily YouTube quota is spent. It resets at midnight Pacific.',
        result: null,
        comments: null,
        summary: null,
        summaryModel: null,
      };
    }
    console.error('[studio/own-video] failed', err);
    return {
      status: 'error',
      message: 'Could not read that video just now.',
      result: null,
      comments: null,
      summary: null,
      summaryModel: null,
    };
  }
}


/**
 * Classify one video's comment section.
 *
 * NEVER THROWS. The performance read is the point of the panel and it is
 * already computed by the time this runs; losing the whole answer because a
 * comment section could not be classified would trade the measured half for
 * the interpreted one.
 *
 * Bounded at 500. A single upload on a large channel can carry tens of
 * thousands, and this runs while somebody is looking at a spinner.
 */
async function readVideoComments(videoId: string): Promise<VideoComments | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return null;

  try {
    const { comments, readable } = await fetchVideoComments(apiKey, videoId, 500);
    if (comments.length === 0) {
      return { scanned: 0, readable, clusters: [], sentiment: null };
    }

    const spend = { inputTokens: 0, outputTokens: 0, calls: 0 };
    const labels = await classifyAxes(comments, spend);
    const rollup = rollUpAxes(labels);
    return {
      scanned: comments.length,
      readable: true,
      clusters: buildClusters(comments, labels),
      sentiment: rollup.sentiment,
    };
  } catch (error) {
    console.error('[studio/video-comments] failed', { videoId, error });
    return null;
  }
}
