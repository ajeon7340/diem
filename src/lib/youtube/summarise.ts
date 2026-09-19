import 'server-only';

import { AiError, aiModel, generateStructured } from '@/lib/ai/provider';
import type { VideoExplain } from './explain';
import type { TrendingVideo } from './trending';

/**
 * Why a video did what it did, in a sentence a person can act on.
 *
 * `explainVideo` already measures the part that is checkable — views against
 * that channel's own median, engagement against its own engagement, which
 * length and format actually move views there. What it cannot do is say WHY,
 * and "3.2x the channel median" is a fact a creator still has to interpret.
 *
 * THE MODEL IS GIVEN THE MEASUREMENTS AND TOLD TO EXPLAIN THEM, not asked to
 * guess at performance. Every figure in the prompt was computed from the API;
 * the model's job is to connect them to the title, the format and the timing.
 * A summary that invents a number is worse than no summary, so the schema
 * forces the claim to name which measured figure it rests on.
 */

export interface VideoSummary {
  /** Two or three sentences. No figures the caller did not supply. */
  verdict: string;
  /** The single biggest reason, as a short phrase for a heading. */
  headline: string;
  /** Which supplied measurement the verdict leans on. */
  basedOn: 'multiple' | 'engagement' | 'duration' | 'timing' | 'title' | 'mixed';
  /** True only when the figures actually support "this outperformed". */
  outperformed: boolean;
}

const SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: 'Under 8 words. The single biggest reason.' },
    verdict: {
      type: 'string',
      description:
        'Two or three sentences explaining WHY, using only the figures given. Never invent a number.',
    },
    basedOn: {
      type: 'string',
      enum: ['multiple', 'engagement', 'duration', 'timing', 'title', 'mixed'],
    },
    outperformed: { type: 'boolean' },
  },
  required: ['headline', 'verdict', 'basedOn', 'outperformed'],
};

const SYSTEM = `You explain YouTube performance to the creator who made the video.

You are given MEASURED figures. Use them and nothing else — never invent a
number, a date, a view count or a comparison. If the figures do not support a
claim, do not make it.

"Outperformed" means views clearly above that channel's own median. A video at
or below the median did not outperform, and saying it did to be encouraging is
the one thing that makes this worthless. A flat video is worth explaining too.

Be specific about mechanism: a title that states a result, a format the channel
is already good at, a length that suits the topic, timing against a news cycle.
Say "the title promises a concrete outcome", not "great title".

NEVER say "you" or "your channel". The video being explained is often NOT the
reader's — this box analyses any video somebody pastes, and it compares that
video against ITS OWN channel's baseline, never against the reader's. Write
"this video" and "that channel", or name the channel. Calling someone else's
upload theirs is the one error here that makes every figure beside it suspect.

No preamble, no praise, no advice to "keep it up". Under 60 words.`;

/** The figures, as a block the model can only read from. */
function facts(v: VideoExplain): string {
  const minutes = Math.round(v.durationSec / 60);
  return [
    `Title: ${v.title}`,
    `Channel: ${v.channelTitle}`,
    `Published: ${v.publishedAt}`,
    `Length: ${v.durationSec}s (about ${minutes} min)`,
    `Views: ${v.views}`,
    `This channel's median views over ${v.sampleSize} recent uploads: ${v.channelMedianViews}`,
    v.multiple === null
      ? 'Multiple of that median: not computable'
      : `Multiple of that median: ${v.multiple.toFixed(2)}x`,
    `Engagement rate (likes+comments over views): ${(v.engagementRate * 100).toFixed(2)}%`,
    `This channel's median engagement: ${(v.channelMedianEngagement * 100).toFixed(2)}%`,
    v.subscribers === null ? 'Subscribers: hidden' : `Subscribers: ${v.subscribers}`,
    v.paidPlacement ? 'This video carries a disclosed paid placement.' : '',
    v.drivers.length
      ? `Measured drivers on this channel: ${v.drivers
          .map(
            (d) =>
              // The ratio and both arm sizes, because a 2x lift off three
              // videos is not the same finding as one off forty, and a model
              // handed only the ratio will state both with equal confidence.
              `${d.label}: ${d.ratio === null ? 'no effect measurable' : `${d.ratio.toFixed(2)}x`} ` +
              `(${d.withN} with, ${d.withoutN} without)`,
          )
          .join('; ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function summariseVideo(
  explain: VideoExplain,
): Promise<{ ok: true; summary: VideoSummary; model: string } | { ok: false; reason: string }> {
  try {
    const { data } = await generateStructured<VideoSummary>({
      system: SYSTEM,
      user: facts(explain),
      schema: SCHEMA,
      toolName: 'record_verdict',
      // Sized for the model, not for the answer: a reasoning model spends
      // output tokens thinking before it writes, and 500 left nothing for a
      // 60-word verdict — the JSON arrived cut in half.
      maxTokens: 4_000,
    });

    // The model is not the arbiter of whether it outperformed — the median is.
    // Asked for the flag anyway because a disagreement is a signal the verdict
    // is drifting from the figures, and the measurement wins.
    const measured = explain.multiple !== null && explain.multiple > 1.1;
    return {
      ok: true,
      summary: { ...data, outperformed: measured },
      model: aiModel(),
    };
  } catch (error) {
    if (error instanceof AiError) return { ok: false, reason: error.message };
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * What a trending video is, for someone deciding whether to watch it.
 *
 * Deliberately NOT a performance read: a chart position is a fact about
 * YouTube's ranker, not about the channel, and nothing here has that channel's
 * median to compare against. So this answers "what is this and why might it be
 * climbing", and says nothing about whether it did well — which would be a
 * comparison this pass cannot make.
 */
export interface TrendingSummary {
  what: string;
  whyClimbing: string;
  /** How it might apply to the reader's own channel, or null when it does not. */
  forYou: string | null;
}

const TRENDING_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    what: { type: 'string', description: 'One sentence: what the video is.' },
    whyClimbing: { type: 'string', description: 'One or two sentences on why it may be trending.' },
    forYou: {
      type: 'string',
      description:
        'One sentence on what a creator in the stated niche could take from it, or the exact string NONE if nothing transfers.',
    },
  },
  required: ['what', 'whyClimbing', 'forYou'],
};

export async function summariseTrending(
  video: TrendingVideo,
  niche: string | null,
): Promise<{ ok: true; summary: TrendingSummary } | { ok: false; reason: string }> {
  try {
    const { data } = await generateStructured<TrendingSummary>({
      system: `You describe a trending YouTube video to a creator.

Use only the title, channel, length and counts supplied. Never invent a plot, a
claim the video makes, or a number.

Do NOT say whether it performed well relative to its channel — you have not
been given that channel's baseline and the chart position is a fact about
YouTube's ranker, not about the channel.

If nothing about it transfers to the reader's niche, answer NONE for forYou
rather than reaching. Under 25 words per field.`,
      user: [
        `Title: ${video.title}`,
        `Channel: ${video.channelTitle}`,
        `Published: ${video.publishedAt}`,
        `Length: ${video.durationSec}s`,
        `Views: ${video.views}`,
        `Likes: ${video.likes}`,
        `Comments: ${video.comments}`,
        `The reader's niche: ${niche ?? 'not stated'}`,
      ].join('\n'),
      schema: TRENDING_SCHEMA,
      toolName: 'record_trending',
      maxTokens: 4_000,
    });
    return {
      ok: true,
      // "NONE" is the schema's way of declining; turn it into an absence rather
      // than printing the word.
      summary: { ...data, forYou: data.forYou?.trim().toUpperCase() === 'NONE' ? null : data.forYou },
    };
  } catch (error) {
    if (error instanceof AiError) return { ok: false, reason: error.message };
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
