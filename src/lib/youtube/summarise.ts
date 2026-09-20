import { AMENDMENT_ACCEPTED } from '@/lib/report/policy';
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
  if (!AMENDMENT_ACCEPTED) return { ok:false,reason:'YouTube derived-analysis approval is not configured.' };
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
 * Why a video is on the chart, from what can actually be measured about it.
 *
 * The first version was handed a title, a channel and three counts, and said
 * what you would expect from a title, a channel and three counts: "gaining
 * momentum with over 668,000 views". True, useless, and derivable without a
 * model.
 *
 * A chart position is about RATE and REACTION, not totals. So this passes:
 *
 *   views per day since publication  — the actual climb, not the pile
 *   the same figure for the rest of the chart — is it fast FOR THIS CHART
 *   engagement rate, against the chart's median engagement
 *   age in days — a week-old video holding a slot is a different story
 *                 from a twelve-hour-old one
 *   the description and tags — what it says it is
 *   a sample of top comments — what viewers are actually reacting to,
 *                 which is the only direct evidence of why it is spreading
 *
 * Everything except the comments is arithmetic over the chart we already
 * fetched. The comments cost one quota unit.
 */
export interface TrendingSummary {
  what: string;
  whyClimbing: string;
  /** The measured signal the verdict rests on, so a reader can check it. */
  evidence: string;
  /** Reaction pattern in the comments, or null when none could be read. */
  audience: string | null;
  /** How it might apply to the reader's own channel, or null when it does not. */
  forYou: string | null;
}

const TRENDING_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    what: { type: 'string', description: 'One sentence: what the video actually is.' },
    whyClimbing: {
      type: 'string',
      description:
        'Two sentences on the MECHANISM — what about it is making people click and share right now. Not a restatement of the counts.',
    },
    evidence: {
      type: 'string',
      description:
        'The measured figure that supports it, named and quoted. e.g. "184k views/day against a chart median of 61k".',
    },
    audience: {
      type: 'string',
      description:
        'What the comments are reacting to, in one sentence, or the exact string NONE if no comments were supplied.',
    },
    forYou: {
      type: 'string',
      description:
        'One concrete thing a creator in the stated niche could take from it, or the exact string NONE if nothing transfers.',
    },
  },
  required: ['what', 'whyClimbing', 'evidence', 'audience', 'forYou'],
};

export interface TrendingContext {
  /** 1-based position on the chart as fetched. */
  rank: number;
  chartSize: number;
  /** Median views/day across the chart, for comparison. */
  chartMedianViewsPerDay: number | null;
  chartMedianEngagement: number | null;
  description: string | null;
  tags: string[];
  /** Top comments by likes, text only. */
  comments: string[];
}

export async function summariseTrending(
  video: TrendingVideo,
  niche: string | null,
  context: TrendingContext,
): Promise<{ ok: true; summary: TrendingSummary } | { ok: false; reason: string }> {
  const ageDays = Math.max(
    0.5,
    (Date.now() - Date.parse(video.publishedAt)) / 86_400_000,
  );
  const viewsPerDay = Math.round(video.views / ageDays);
  const engagement = video.views > 0 ? (video.likes + video.comments) / video.views : 0;

  const facts = [
    `Title: ${video.title}`,
    `Channel: ${video.channelTitle}`,
    `Chart position: ${context.rank} of ${context.chartSize}`,
    `Published: ${video.publishedAt} (${ageDays.toFixed(1)} days ago)`,
    `Length: ${video.durationSec}s`,
    `Views: ${video.views} — that is ${viewsPerDay} per day since publication`,
    context.chartMedianViewsPerDay !== null
      ? `Median views/day across this chart: ${context.chartMedianViewsPerDay}`
      : '',
    `Engagement rate (likes+comments over views): ${(engagement * 100).toFixed(2)}%`,
    context.chartMedianEngagement !== null
      ? `Median engagement across this chart: ${(context.chartMedianEngagement * 100).toFixed(2)}%`
      : '',
    context.tags.length ? `Tags the uploader set: ${context.tags.slice(0, 15).join(', ')}` : '',
    context.description
      ? `Description (first 600 chars):\n${context.description.slice(0, 600)}`
      : '',
    context.comments.length
      ? `Top comments by likes:\n${context.comments
          .slice(0, 25)
          .map((c) => `- ${c.replace(/\s+/g, ' ').slice(0, 180)}`)
          .join('\n')}`
      : '',
    `The reader's niche: ${niche ?? 'not stated'}`,
  ]
    .filter(Boolean)
    .join('\n');

  if (!AMENDMENT_ACCEPTED) return { ok:false,reason:'YouTube derived-analysis approval is not configured.' };
  try {
    const { data } = await generateStructured<TrendingSummary>({
      system: `You explain why a video is on YouTube's trending chart, to a creator
studying it.

A CHART POSITION IS ABOUT RATE AND REACTION, not totals. "It has a lot of
views" is what put it in front of you; it is not an explanation. Reach for the
mechanism: what the title promises, what the comments are reacting to, whether
it is riding a release or a news cycle, whether the channel's audience alone
accounts for it, whether the format is cheap to share.

Use only what you are given — the figures, the description, the tags, the
comments. Never invent a number, an event, or a claim the video makes. If the
comments are in another language, read them; do not remark on the language.

Compare against the CHART, not against nothing: 184k views/day is fast or slow
depending on what the rest of the chart is doing, and you have that median.

Say what is distinctive. If the honest answer is "a very large channel posted
and its subscribers showed up", say that — it is a real finding and creators
need to hear it more often than they need a story.

No praise, no hedging, no "it resonates with viewers". Under 35 words per
field.`,
      user: facts,
      schema: TRENDING_SCHEMA,
      toolName: 'record_trending',
      maxTokens: 4_000,
    });
    const none = (v: string | null) => (v?.trim().toUpperCase() === 'NONE' ? null : v);
    return {
      ok: true,
      // "NONE" is the schema's way of declining; turn it into an absence
      // rather than printing the word.
      summary: { ...data, forYou: none(data.forYou), audience: none(data.audience) },
    };
  } catch (error) {
    if (error instanceof AiError) return { ok: false, reason: error.message };
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
