import 'server-only';

import { mapConcurrent } from './concurrent';

import { generateStructured } from '@/lib/ai/provider';
import { ClaimLostError, type RawComment, type Spend } from './classify';
import {
  aggregateFromCells,
  cellKey,
  sentimentFromCells,
  type IntentCells,
} from '@/lib/report/intent';
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

/**
 * Batches in flight at once.
 *
 * Four rather than more: the calls are independent, but they share one API
 * quota and one rate limit, and a pass that trips it fails a job that had
 * already paid for most of its answers. Measured 596s sequential on 3,055
 * comments — 31 calls of roughly 19 seconds each, nearly all of it waiting.
 */
export const INTENT_CONCURRENCY = 4;

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
  const batches: RawComment[][] = [];
  for (let i = 0; i < comments.length; i += INTENT_BATCH) {
    batches.push(comments.slice(i, i + INTENT_BATCH));
  }

  let done = 0;
  const perBatch = await mapConcurrent(batches, INTENT_CONCURRENCY, async (batch) => {
    // Checked per batch, not per run: this pass is minutes long and a claim
    // can be lost in the middle of it.
    if (options.stillMine && !(await options.stillMine())) throw new ClaimLostError();

    const hits = await classifyAxesBatch(batch, spend);
    const placed: AxisLabel[] = batch.map(
      (_, j) => hits.get(j) ?? { object: 'unclassified', intent: 'unclassified' },
    );
    // Batches finish out of order under concurrency, so progress counts what
    // has COMPLETED rather than how far down the list we have started.
    done += batch.length;
    options.onProgress?.(Math.min(done, comments.length), comments.length);
    return placed;
  });

  // Flattened in batch order, which `mapConcurrent` preserves — `labels` must
  // stay parallel to `comments` by position or every label lands on a
  // different comment.
  return perBatch.flat();
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
/**
 * `storeAxes` and `classifyIntentAndStore` lived here and wrote to
 * `report_metrics` keyed by `creators.id`. They went with the creator half.
 * The pass above is untouched — see the note at the foot of `classify.ts`.
 */
