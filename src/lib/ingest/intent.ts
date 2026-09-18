import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { buildClusters } from './clusters';

import { aiModel, aiProvider, generateStructured } from '@/lib/ai/provider';
import { ClaimLostError, fetchAllComments, type RawComment, type Spend } from './classify';
import {
  INTENT_RUBRIC_VERSION,
  aggregateFromCells,
  cellKey,
  sentimentFromCells,
  type IntentCells,
} from '@/lib/report/intent';
import type { CommentCluster } from '@/types';
import type {
  CommentAxes,
  CommentIntent,
  CommentObject,
  IntentMeasurement,
} from '@/types';

/**
 * The two-axis pass: what every comment is ABOUT, and what it WANTS.
 *
 * THIS PRODUCER DID NOT EXIST. `comment_axes` had a column, a type, a zod
 * schema, a mapper, a policy entry, an aggregation (`aggregateFromCells`) and
 * four panels rendering it — and the only thing that ever wrote it was
 * `scripts/seed.ts`, from hand-written fixtures. Exactly the shape of the
 * `promotions` hole, and of `social_accounts.access_token` before it: every
 * layer present except the one that produces the number. So sentiment, purchase
 * intent and the intent clusters were null on every real creator, permanently,
 * and no amount of running the risk census would ever fill them — that pass
 * measures a different thing.
 *
 * ONE LABEL ON EACH AXIS, FOR EVERY COMMENT, WITHOUT EXCEPTION. The taxonomy is
 * exhaustive by contract: collapse along either axis and the total is still
 * 100%, which is what makes a proportion bar over it honest. A comment the
 * model does not return a label for becomes `unclassified`, never dropped —
 * dropping it would silently shrink the denominator and inflate every share
 * computed from it.
 */

/**
 * Comments per request.
 *
 * Smaller than the risk census's 150 because this pass labels EVERY comment
 * rather than returning only the exceptions: output scales with the batch here,
 * where there it does not. 100 keeps a batch's response well inside the token
 * ceiling with room for long-tail verbosity.
 */
export const INTENT_BATCH = 100;

const OBJECTS: readonly CommentObject[] = [
  'creator',
  'content',
  'product',
  'subject',
  'unclassified',
];

const INTENTS: readonly CommentIntent[] = [
  'buy',
  'request',
  'ask',
  'praise',
  'criticise',
  'abuse',
  'react',
  'unclassified',
];

const CLASSIFY_TOOL = {
  name: 'record_axes',
  description: 'Place every numbered comment on both axes. Call exactly once.',
  input_schema: {
    type: 'object',
    properties: {
      comments: {
        type: 'array',
        description:
          'One entry per comment given, in the same numbering. Every comment must appear exactly once.',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer', description: 'The number the comment was listed under.' },
            object: { type: 'string', enum: OBJECTS },
            intent: { type: 'string', enum: INTENTS },
          },
          required: ['index', 'object', 'intent'],
          additionalProperties: false,
        },
      },
    },
    required: ['comments'],
    additionalProperties: false,
  },
};

export const SYSTEM = `You are reading a creator's comment section for an advertising report. Place EVERY comment on two axes. Return exactly one entry per comment, using the number it was listed under.

AXIS 1 — OBJECT: what is the comment about?

- product: something purchasable. A thing the creator is holding, wearing, using, reviewing or promoting; a brand, a price, a shipping question. This is the only object a brand can buy placement against, so be strict: a comment must actually be about the purchasable thing, not about the video that features it.
- creator: the creator themselves — their person, their channel, their life, their appearance, their other videos.
- content: this video as a piece of work. The edit, the pacing, the music, the thumbnail, the format, requests for more of this kind of video.
- subject: A PERSON THE VIDEO IS ABOUT, who is not the creator. Call-out videos, reaction videos, interviews, disputes, news about somebody else. The audience talks about THAT person, at length, and it is usually the loudest thing in the section.
- unclassified: you genuinely cannot tell. Use sparingly and never as a bin for comments that are merely short.

WHY "subject" EXISTS AND WHY IT MATTERS
On a channel whose videos are about other people, most of the section is about that third party. If those comments are filed under "creator", the report reads a pile-on aimed at someone else as the audience's opinion OF THE CREATOR — and inverts it. Measured on one real channel: folded into "creator" the read was 993 criticism against 177 praise, 5.6 to 1 hostile. Kept separate, the creator's own numbers were 63 against 176 — nearly 3 to 1 in their favour. Same comments, opposite conclusion about the person being priced. When a comment is about someone the video discusses, it is "subject", however heated.

AXIS 2 — INTENT: what does the comment want?

- buy: wanting to acquire. "where can I get this", "shut up and take my money", "just ordered".
- request: asking for something to be made or done. "review the X", "do a part 2", "please test it long term".
- ask: a genuine question seeking information. Specs, comparisons, how-to, "what shade is that".
- praise: positive opinion about the object.
- criticise: substantive negative opinion — the edit, the price, the claim, the method, the person's conduct or argument. Blunt is still criticism.
- abuse: a personal attack rather than an opinion. Slurs, sexual harassment, threats, mockery of someone's body, family or worth.
- react: an emotional or social response that carries no opinion and asks for nothing. "😂😂😂", "first", "who's here in 2026", tagging a friend, quoting a line back.
- unclassified: you genuinely cannot tell.

THE CRITICISE / ABUSE BOUNDARY
Ask whether the comment is about what someone DID — their work, their conduct, their argument — or about their BODY, THEIR FAMILY, or THEIR WORTH AS A PERSON. The first is criticise at any volume; the second is abuse even when the accusation behind it is true.

  "The editing is heavy-handed"                    criticise
  "He's lying and the story doesn't add up"        criticise
  "This guy is a scammer, he should be prosecuted" criticise
  "Crossed eyes, crooked mouth"                    abuse
  "Your mother should have known better"           abuse

On a channel about a disputed third party, an audience concluding somebody is dishonest IS the content. That is criticise, not abuse, and not a finding.

"react" IS NOT NOISE. It is frequently the largest cell in a section and it is one of the most consequential facts a brand can learn: an audience that reacts to the creator rather than to anything they are holding converts differently from one that asks about products. Do not try to find a "real" intent underneath a reaction. Label it react.

WORKED EXAMPLES (object + intent)

  "where do you get that jacket??"                 product + buy
  "how long does the battery actually last?"       product + ask
  "way too expensive for what it is"               product + criticise
  "that jacket is gorgeous"                        product + praise
  "please do a full review of it"                  product + request
  "your edits keep getting better"                 content + praise
  "part 2 pleaseee"                                content + request
  "you're glowing lately"                          creator + praise
  "take my money, drop the merch"                  creator + buy
  "he completely made that story up"               subject + criticise
  "that guy is a clown, look at his face"          subject + abuse
  "😭😭😭 not the face he made"                     content + react
  "first!!"                                        content + react

Return one entry for every comment you were given. If you are unsure, use unclassified on that axis rather than omitting the comment.`;

export interface AxisLabel {
  object: CommentObject;
  intent: CommentIntent;
}

export interface IntentRunOptions {
  onProgress?: (done: number, total: number) => void;
  /** See `classify.ts` — false means this worker no longer holds the claim. */
  stillMine?: () => Promise<boolean>;
}

/** One batch through the model. */
export async function classifyAxesBatch(
  batch: RawComment[],
  spend: Spend,
): Promise<Map<number, AxisLabel>> {
  const listing = batch
    .map((c, i) => `${i}. ${c.text.replace(/\s+/g, ' ').slice(0, 400)}`)
    .join('\n');

  const { data, usage } = await generateStructured<{
    comments: { index: number; object: CommentObject; intent: CommentIntent }[];
  }>({
    system: SYSTEM,
    user: listing,
    schema: CLASSIFY_TOOL.input_schema as unknown as Record<string, unknown>,
    toolName: CLASSIFY_TOOL.name,
    // Every comment produces a row, unlike the risk census where most produce
    // nothing. The ceiling has to scale with the batch.
    maxTokens: 16_000,
  });

  spend.inputTokens += usage.inputTokens;
  spend.outputTokens += usage.outputTokens;
  spend.calls += 1;

  const out = new Map<number, AxisLabel>();
  for (const row of data.comments ?? []) {
    if (row.index < 0 || row.index >= batch.length) continue;
    // A label outside the enum is not a label. Taking it would put a key in
    // `cells` that no weight, no margin and no renderer knows about, and it
    // would still count towards the total.
    if (!OBJECTS.includes(row.object) || !INTENTS.includes(row.intent)) continue;
    out.set(row.index, { object: row.object, intent: row.intent });
  }
  return out;
}

/**
 * Label every comment, in batches.
 *
 * Returns one label per input comment, in order. A comment the model skipped or
 * mislabelled comes back `unclassified/unclassified` rather than being dropped:
 * the axes must sum to the corpus, and a silently shorter list would inflate
 * every share computed from it while still looking like a clean result.
 */
export async function classifyAxes(
  comments: RawComment[],
  spend: Spend,
  options: IntentRunOptions = {},
): Promise<AxisLabel[]> {
  const labels: AxisLabel[] = [];

  for (let i = 0; i < comments.length; i += INTENT_BATCH) {
    if (options.stillMine && !(await options.stillMine())) throw new ClaimLostError();

    const batch = comments.slice(i, i + INTENT_BATCH);
    const hits = await classifyAxesBatch(batch, spend);
    for (let j = 0; j < batch.length; j++) {
      labels.push(hits.get(j) ?? { object: 'unclassified', intent: 'unclassified' });
    }
    options.onProgress?.(Math.min(i + INTENT_BATCH, comments.length), comments.length);
  }

  return labels;
}

export interface AxesRollup {
  axes: CommentAxes;
  cells: IntentCells;
  measurement: IntentMeasurement;
  sentiment: number | null;
  /** How many the model could not place, on either axis. Reported, not hidden. */
  unreadable: number;
}

/**
 * Turn labels into the stored shape and everything derived from it.
 *
 * The margins are counted from the labels rather than summed from the cells so
 * that a cell the renderer never shows still reaches the axis totals. Both come
 * from one pass over one list, so they cannot disagree.
 */
export function rollUpAxes(labels: AxisLabel[]): AxesRollup {
  const cells: IntentCells = {};
  const objectCounts = new Map<CommentObject, number>();
  const intentCounts = new Map<CommentIntent, number>();

  for (const label of labels) {
    const key = cellKey(label.object, label.intent);
    cells[key] = (cells[key] ?? 0) + 1;
    objectCounts.set(label.object, (objectCounts.get(label.object) ?? 0) + 1);
    intentCounts.set(label.intent, (intentCounts.get(label.intent) ?? 0) + 1);
  }

  const axes: CommentAxes = {
    object: OBJECTS.filter((k) => objectCounts.has(k)).map((key) => ({
      key,
      count: objectCounts.get(key) ?? 0,
    })),
    intent: INTENTS.filter((k) => intentCounts.has(k)).map((key) => ({
      key,
      count: intentCounts.get(key) ?? 0,
    })),
    cells: Object.entries(cells).map(([key, count]) => {
      const [object, intent] = key.split(':') as [CommentObject, CommentIntent];
      return { object, intent, count };
    }),
    total: labels.length,
  };

  // `product_comments`, deliberately. The rate answers "of the comments
  // attached to something purchasable, how many want it" — the only denominator
  // a brand can act on. A channel with nothing purchasable in it comes back
  // with `rate: null` and `commentsScored: 0`, which is UNMEASURABLE and not
  // zero: a creator who never holds a product is not one whose audience refuses
  // to buy. `commercialDensity` answers the other question over the whole
  // corpus, and is reported alongside rather than instead.
  const measurement = aggregateFromCells(cells, 'product_comments');

  return {
    axes,
    cells,
    measurement,
    sentiment: sentimentFromCells(cells),
    unreadable: labels.filter(
      (l) => l.object === 'unclassified' && l.intent === 'unclassified',
    ).length,
  };
}

/** Write the axes and everything derived from them. */
export async function storeAxes(
  supabase: SupabaseClient,
  creatorId: string,
  rollup: AxesRollup,
  clusters: CommentCluster[] = [],
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { measurement } = rollup;

  const { error } = await supabase
    .from('report_metrics')
    .update({
      comment_axes: rollup.axes,
      // Written in the same statement as the axes they are derived from. Two
      // updates would leave a window where the grid and the clusters under it
      // disagree about the same corpus.
      top_comment_clusters: clusters,
      sentiment_score: rollup.sentiment,
      purchase_intent_rate: measurement.rate,
      purchase_intent_ci_low: measurement.ciLow,
      purchase_intent_ci_high: measurement.ciHigh,
      purchase_intent_basis: measurement.basis,
      commercial_density: measurement.commercialDensity,
      intent_comments_scored: measurement.commentsScored,
      intent_posts_scored: measurement.postsScored,
      product_posts_analyzed: measurement.productPostsAnalyzed,
      intent_dispersion: measurement.dispersion,
      intent_rubric_version: INTENT_RUBRIC_VERSION,
      // THE DENOMINATOR THE AXES ARE OVER.
      //
      // `comment_axes.total` and `comments_analyzed` describe the same corpus
      // and are read interchangeably — `censusRisk` falls back to the latter,
      // `assessReport` compares against it. The signup analysis wrote its own
      // bounded figure here (600 comments); this pass read a different and
      // usually larger set, so leaving it would publish two corpus sizes for
      // one classification and let a share be divided by the wrong one.
      comments_analyzed: rollup.axes.total,
      model_version: `${aiProvider()}:${aiModel()}`,
    })
    .eq('creator_id', creatorId);

  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

export interface IntentAndStoreResult {
  commentsClassified: number;
  videos: number;
  unreadable: number;
  productComments: number;
  rate: number | null;
  sentiment: number | null;
  spend: Spend;
  provider: string;
  model: string;
}

/** The whole pass, for the worker. Never swallows. */
export async function classifyIntentAndStore(
  supabase: SupabaseClient,
  creatorId: string,
  channel: { handle?: string | null; channelId?: string | null },
  options: IntentRunOptions & { maxVideos?: number } = {},
): Promise<IntentAndStoreResult> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error('YOUTUBE_API_KEY is required — commentThreads.list needs it.');

  const keyVar = aiProvider() === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY';
  if (!process.env[keyVar]) throw new Error(`${keyVar} is required for ${aiProvider()}.`);

  const corpus = await fetchAllComments(apiKey, channel, options.maxVideos ?? Infinity);
  const spend: Spend = { inputTokens: 0, outputTokens: 0, calls: 0 };
  const labels = await classifyAxes(corpus.comments, spend, options);
  const rollup = rollUpAxes(labels);

  const clusters = buildClusters(corpus.comments, labels);
  const stored = await storeAxes(supabase, creatorId, rollup, clusters);
  if (!stored.ok) throw new Error(stored.reason);

  return {
    commentsClassified: rollup.axes.total,
    videos: corpus.videos,
    unreadable: rollup.unreadable,
    productComments: rollup.measurement.commentsScored,
    rate: rollup.measurement.rate,
    sentiment: rollup.sentiment,
    spend,
    provider: aiProvider(),
    model: aiModel(),
  };
}
