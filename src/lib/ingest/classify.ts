import 'server-only';

import { mapConcurrent } from './concurrent';
import { generateStructured } from '@/lib/ai/provider';
import { audienceClimate, measureRegister } from '@/lib/report/climate';
import { isCandidate, loadExternalTerms } from '@/lib/report/keywords';
import { censusRisk } from '@/lib/report/safety';
import { BRAND_RISK_CATEGORIES } from '@/types';
import type {
  BrandRiskCategory,
  CommentRegister,
  CommentRisk,
  ModerationState,
} from '@/types';

/**
 * The comment risk census, as a library.
 *
 * This was `scripts/scan-comments.ts` and nothing else, which meant the pass
 * only ever ran when a person typed it. It now runs from `scripts/worker.ts`
 * against a queued job, and the CLI is a second caller of the same code for
 * exactly the reason `analyzeAndStore` is shared between signup and backfill: a
 * scan run by a worker and a scan run by hand producing different figures for
 * one channel is how a stored number comes to disagree with a derived one.
 *
 * THE RULE IT ENFORCES, unchanged by the move: a creator is not marked down for
 * being a target. Every risky comment is recorded because a brand's ad sits
 * beside it whoever wrote it; only `byCreator` reaches the creator's rating.
 */

/** commentThreads.list returns 100 per page at 1 quota unit — cheap. */
const PAGE = 100;
/** Comments per classification request. Large enough to be economic, small
 *  enough that one malformed batch does not cost the whole run. */
export const BATCH = 150;

/** See `INTENT_CONCURRENCY`. Same quota, same reasoning. */
export const CLASSIFY_CONCURRENCY = 4;

// Shared with the report rather than copied. A category the union has and this
// array does not is a category the scan never looks for, while `checked` still
// claims every one was screened.
const CATEGORIES: readonly BrandRiskCategory[] = BRAND_RISK_CATEGORIES;

export interface RawComment {
  id: string;
  videoId: string;
  videoTitle: string;
  text: string;
  author: string;
  authorChannelId: string | null;
  likes: number;
  publishedAt: string;
}

export interface FetchedCorpus {
  comments: RawComment[];
  videos: number;
  unreadable: number;
  channelId: string | null;
}

export interface Flagged {
  comment: RawComment;
  category: BrandRiskCategory;
}

/** Reported by the provider, never estimated. */
export interface Spend {
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

/**
 * Plain JSON Schema, not an SDK type: `lib/ai/provider` turns it into whatever
 * the configured provider wants, and a type from one vendor's SDK sitting here
 * would quietly make this file vendor-specific again.
 */
export const CLASSIFY_TOOL = {
  name: 'record_risks',
  description: 'Record which of the numbered comments carry brand risk. Call exactly once.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      risky: {
        type: 'array',
        description:
          'Only comments that genuinely carry risk. Most comments in most sections carry none — an empty array is the expected result for a healthy batch.',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer', description: 'The number the comment was listed under.' },
            category: { type: 'string', enum: CATEGORIES },
          },
          required: ['index', 'category'],
          additionalProperties: false,
        },
      },
    },
    required: ['risky'],
    additionalProperties: false,
  },
};

export const SYSTEM = `You screen comment sections for an advertising brand-safety report.

You are given numbered comments from one creator's videos. Return only the ones that would be a genuine problem for a brand whose ad appears beside them.

CATEGORIES
- hate: slurs or hatred aimed at a protected group.
- sexual: explicit sexual content or sexual harassment.
- violence: threats, calls for harm, glorified violence.
- illegal: drugs, weapons, counterfeits, fraud offers.
- spam: scam links, engagement farming, impersonation.
- harassment: degrading attacks on a PERSON — anyone, not only the creator — that are not protected-group slurs: cataloguing their appearance as defects, mocking their body or surgery, insults about their family or parentage, calling them subhuman or worthless.

WHO THE TARGET IS DOES NOT MATTER
An advertiser's placement sits beside the comment whoever it is aimed at, so judge the comment, not the target. Many creators make videos ABOUT other people — a dispute, a call-out, an interview with someone accused of something — and the section under those fills with attacks on that third person rather than on the creator. Those count. So do attacks aimed at other commenters, at a public figure, or at the creator's family.

This is only about what an ad would appear next to. It is never a judgement of the creator, who is separately recorded as the author of a comment or not.

THE HARASSMENT BOUNDARY
Ask whether the comment is about what someone DID — their work, their conduct, their argument — or about their BODY, THEIR FAMILY, OR THEIR WORTH AS A PERSON. The first is criticism at any volume. The second is harassment even when the accusation behind it is true.

  "Her editing is heavy-handed"                      criticism
  "He's lying and the story doesn't add up"          criticism
  "This guy is a scammer, he should be prosecuted"   criticism
  "Nobody should believe a word he says"             criticism
  "Crossed eyes, crooked mouth — you call that
   beautiful?"                                       harassment
  "Your mother should have known better"             harassment
  "This retard can't even lie properly"              harassment
  "Not even a person"                                harassment

The middle two matter most on call-out channels: an audience deciding somebody is dishonest is the content, and flagging that would flag the whole genre. What crosses the line is when the target stops being their conduct and becomes their body, their intelligence, their family or their right to exist.

If you are unsure which side a comment falls on, leave it out.

WHAT IS NOT RISK
- Criticism of anyone, however blunt. "This edit is terrible", "she's overrated", "unfollowing", "he's obviously lying" — an audience is allowed to dislike someone and to conclude someone did something wrong, and flagging that as brand risk would turn ordinary disagreement into a mark against the creator.
- Accusations of wrongdoing and calls to report someone to the police or sue them. That is the audience talking about conduct through legitimate means.
- Mild profanity used for emphasis rather than at anyone.
- Arguments between commenters that stay civil.
- Negative opinions about a product.

The cost of over-flagging is not symmetric. A missed slur is a real miss. But flagging ordinary criticism inflates a number that follows a person around and shapes what they are paid, so when a comment is merely rude or merely negative, leave it out. This applies with full force to sections about a disputed third party: the crowd being harsh about what someone did is not the finding, and reporting it as one would price a whole format as unsafe for the wrong reason.

Return an empty array when nothing qualifies. That is a normal and useful result, not a failure to find something.`;

/**
 * Read every comment on every video.
 *
 * `maxVideos` bounds it for a signup-triggered run; unbounded is the census the
 * report's denominators assume. Videos whose comments cannot be read are
 * COUNTED rather than skipped silently — the coverage figure has to tell "read
 * and empty" apart from "could not read".
 */
export async function fetchAllComments(
  apiKey: string,
  /**
   * Either identifier. The CHANNEL ID IS PREFERRED where the caller has one:
   * handles are mutable and ids are not, so a creator who renamed on YouTube
   * between signup and the worker claiming their job still resolves. The CLI
   * passes a handle because that is what a person types.
   */
  channel: { handle?: string | null; channelId?: string | null },
  maxVideos: number = Infinity,
  /**
   * The bound that actually governs how long a pass takes.
   *
   * `maxVideos` was the only one, and it bounds the wrong thing: 30 videos of
   * @gajaeman is 2,437 comments and 30 videos of @Fireship is 28,265. The
   * second is ~283 model calls, which is over an hour — from a signup that
   * says the figures will appear shortly.
   *
   * A comment bound makes the cost of a pass a property of the SETTING rather
   * than of whose channel it is. The denominator is reported either way:
   * `commentsScanned` and `axes.total` both say what was read, so a capped
   * corpus is stated rather than implied.
   */
  maxComments: number = Infinity,
): Promise<FetchedCorpus> {
  const get = async (path: string, params: Record<string, string>) => {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
    for (const [k, v] of Object.entries({ ...params, key: apiKey })) url.searchParams.set(k, v);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  };

  const label = channel.channelId ?? `@${(channel.handle ?? '').replace(/^@/, '')}`;
  if (!channel.channelId && !channel.handle) {
    throw new Error('fetchAllComments needs a handle or a channel id');
  }

  const found = await get('channels', {
    part: 'contentDetails,snippet',
    ...(channel.channelId
      ? { id: channel.channelId }
      : { forHandle: `@${(channel.handle ?? '').replace(/^@/, '')}` }),
  });
  const uploads = found.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  const channelId = found.items?.[0]?.id ?? null;
  if (!uploads) throw new Error(`no uploads playlist for ${label}`);

  // Every video, not a sample — that is the whole point of a census.
  const videos: { id: string; title: string }[] = [];
  let pageToken: string | undefined;
  do {
    const page = await get('playlistItems', {
      part: 'contentDetails,snippet',
      playlistId: uploads,
      maxResults: String(PAGE),
      ...(pageToken ? { pageToken } : {}),
    });
    for (const item of page.items ?? []) {
      videos.push({ id: item.contentDetails.videoId, title: item.snippet?.title ?? '' });
    }
    pageToken = page.nextPageToken;
  } while (pageToken && videos.length < maxVideos);

  const capped = videos.slice(0, Number.isFinite(maxVideos) ? maxVideos : videos.length);
  const comments: RawComment[] = [];
  let unreadable = 0;

  for (const video of capped) {

    if (comments.length >= maxComments) break;
    let token: string | undefined;
    do {
      let page;
      try {
        page = await get('commentThreads', {
          part: 'snippet',
          videoId: video.id,
          maxResults: String(PAGE),
          // Chronological, not relevance: YouTube's ranker surfaces the loud
          // and the contentious, and a census sampled through it is not a
          // census. Same reason the intent pass orders by time.
          order: 'time',
          textFormat: 'plainText',
          ...(token ? { pageToken: token } : {}),
        });
      } catch {
        // Comments disabled or restricted on this video.
        unreadable += 1;
        break;
      }
      for (const thread of page.items ?? []) {
        const c = thread.snippet?.topLevelComment?.snippet;
        if (!c) continue;
        comments.push({
          id: thread.snippet.topLevelComment.id,
          videoId: video.id,
          videoTitle: video.title,
          text: c.textDisplay ?? '',
          author: c.authorDisplayName ?? '',
          authorChannelId: c.authorChannelId?.value ?? null,
          likes: c.likeCount ?? 0,
          publishedAt: c.publishedAt ?? '',
        });
      }
      token = page.nextPageToken;
    } while (token && comments.length < maxComments);
  }

  return { comments, videos: capped.length, unreadable, channelId };
}

/** One batch through the model. Exported so the CLI can report per-batch spend. */
export async function classifyBatch(
  batch: RawComment[],
  spend: Spend,
): Promise<Map<number, BrandRiskCategory>> {
  const listing = batch
    .map((c, i) => `${i}. ${c.text.replace(/\s+/g, ' ').slice(0, 400)}`)
    .join('\n');

  const { data, usage } = await generateStructured<{
    risky: { index: number; category: BrandRiskCategory }[];
  }>({
    system: SYSTEM,
    user: listing,
    schema: CLASSIFY_TOOL.input_schema as unknown as Record<string, unknown>,
    toolName: CLASSIFY_TOOL.name,
    maxTokens: 4_000,
  });

  spend.inputTokens += usage.inputTokens;
  spend.outputTokens += usage.outputTokens;
  spend.calls += 1;

  const out = new Map<number, BrandRiskCategory>();
  for (const r of data.risky ?? []) {
    if (r.index >= 0 && r.index < batch.length) out.set(r.index, r.category);
  }
  return out;
}

export interface ClassifyRunOptions {
  /** Opt-in. Measured at 77% recall — see `lib/report/keywords`. */
  prefilter?: boolean;
  /** Called after every batch, with how far through the run is. */
  onProgress?: (done: number, total: number) => void;
  /**
   * Called between batches. Returning false means this run no longer holds its
   * claim — another worker has taken the job — and the run STOPS rather than
   * finishing and writing over a fresher result.
   */
  stillMine?: () => Promise<boolean>;
}

export class ClaimLostError extends Error {
  constructor() {
    super('the lease on this job was taken by another worker');
    this.name = 'ClaimLostError';
  }
}

/**
 * Run every candidate comment through the model, in batches.
 *
 * The keyword lens decides what the model READS, never what anything is, and it
 * is opt-in: a comment it misses is unread, not cleared.
 */
export async function classifyComments(
  comments: RawComment[],
  spend: Spend,
  options: ClassifyRunOptions = {},
): Promise<Flagged[]> {
  const candidates = options.prefilter
    ? comments.filter((c) => isCandidate(c.text, loadExternalTerms()))
    : comments;

  const batches: RawComment[][] = [];
  for (let i = 0; i < candidates.length; i += BATCH) {
    batches.push(candidates.slice(i, i + BATCH));
  }

  let done = 0;
  const perBatch = await mapConcurrent(batches, CLASSIFY_CONCURRENCY, async (batch) => {
    // Checked BEFORE spending on the batch, not after: the point is to stop
    // paying for a job somebody else is already running.
    if (options.stillMine && !(await options.stillMine())) throw new ClaimLostError();

    const hits = await classifyBatch(batch, spend);
    const found: Flagged[] = [];
    hits.forEach((category, index) => found.push({ comment: batch[index], category }));
    // Batches land out of order, so progress counts what has COMPLETED.
    done += batch.length;
    options.onProgress?.(Math.min(done, candidates.length), candidates.length);
    return found;
  });

  // Findings have no positional contract — unlike the axis labels — but batch
  // order is kept anyway so two runs over one corpus produce the same list.
  return perBatch.flat();
}

export interface Rollup {
  risks: CommentRisk[];
  register: CommentRegister | null;
  moderation: ModerationState;
}

/**
 * Turn a classified corpus into what the report stores.
 *
 * `commentsScanned` is THIS pass's denominator and it is not optional. Without
 * it `censusRisk` falls back to `comments_analyzed` — the clustering corpus, a
 * different and usually much larger set — and the adjacency share comes out as
 * a fraction of something this pass never read. That substitution already
 * produced 0.15% where the truth was 3.89%.
 *
 * `hidden` carries forward rather than resetting. The scan is now re-runnable,
 * so writing `hiddenTotal: 0` would erase a creator's moderation history every
 * time the job ran — a figure that went backwards for a creator who had done
 * the work. The queue holds what was actioned; this reads it rather than
 * assuming.
 */
export function rollUp(
  comments: RawComment[],
  flagged: Flagged[],
  channelId: string | null,
  hidden: { hiddenTotal: number; lastModeratedAt: string | null } = {
    hiddenTotal: 0,
    lastModeratedAt: null,
  },
): Rollup {
  const risks: CommentRisk[] = CATEGORIES.map((category) => {
    const inCategory = flagged.filter((f) => f.category === category);
    return {
      category,
      count: inCategory.length,
      // The creator's own comments, matched on channel id rather than display
      // name — names are not unique and an impersonator must not be able to
      // put words in a creator's rating.
      byCreator: inCategory.filter((f) => f.comment.authorChannelId === channelId).length,
      hidden: 0,
      example: inCategory[0]?.comment.text.slice(0, 200) ?? '',
    };
  }).filter((r) => r.count > 0);

  // Same comments, no second fetch and no model call. Shapes, not meanings.
  const register = measureRegister(comments.map((c) => c.text));

  const moderation: ModerationState = {
    commentsScanned: comments.length,
    foundTotal: flagged.length,
    visibleTotal: Math.max(0, flagged.length - hidden.hiddenTotal),
    hiddenTotal: hidden.hiddenTotal,
    lastModeratedAt: hidden.lastModeratedAt,
  };

  return { risks, register, moderation };
}

/** The climate line, for whoever is printing progress. Derived, never stored. */
export function describeRun(rollup: Rollup, commentsScanned: number) {
  return audienceClimate(
    null,
    censusRisk(rollup.risks, rollup.moderation, commentsScanned),
    rollup.register,
  );
}

/**
 * WHAT USED TO BE HERE: `readModerationHistory`, `storeClassification` and
 * `classifyAndStore` — the creator-scoped writers that put this pass's output
 * into `report_metrics` and `comment_moderation_queue`.
 *
 * They went with the creator half of the product. Everything above them is the
 * pass itself and is unchanged, because it never knew what a creator was: it
 * takes a channel identifier, reads public endpoints, and hands back a rollup.
 * `ingest/channel-classify.ts` is the one caller now, and it writes to
 * `channel_analyses` keyed by channel id.
 */

export async function fetchVideoComments(
  apiKey: string,
  videoId: string,
  maxComments = 500,
): Promise<{ comments: RawComment[]; readable: boolean }> {
  const comments: RawComment[] = [];
  let token: string | undefined;

  do {
    const url = new URL('https://www.googleapis.com/youtube/v3/commentThreads');
    for (const [k, v] of Object.entries({
      part: 'snippet',
      videoId,
      maxResults: '100',
      order: 'time',
      textFormat: 'plainText',
      key: apiKey,
      ...(token ? { pageToken: token } : {}),
    })) {
      url.searchParams.set(k, v);
    }

    const res = await fetch(url, { next: { revalidate: 900 } });
    if (!res.ok) {
      // Comments disabled or restricted on this video. A readable-but-empty
      // section and an unreadable one are different facts and the caller says
      // so differently.
      return { comments, readable: comments.length > 0 };
    }

    const body = (await res.json()) as {
      items?: {
        snippet: {
          topLevelComment: {
            id: string;
            snippet: {
              textDisplay?: string;
              authorDisplayName?: string;
              authorChannelId?: { value?: string };
              likeCount?: number;
              publishedAt?: string;
            };
          };
        };
      }[];
      nextPageToken?: string;
    };

    for (const thread of body.items ?? []) {
      const c = thread.snippet?.topLevelComment;
      if (!c) continue;
      comments.push({
        id: c.id,
        videoId,
        videoTitle: '',
        text: c.snippet?.textDisplay ?? '',
        author: c.snippet?.authorDisplayName ?? '',
        authorChannelId: c.snippet?.authorChannelId?.value ?? null,
        likes: c.snippet?.likeCount ?? 0,
        publishedAt: c.snippet?.publishedAt ?? '',
      });
    }
    token = body.nextPageToken;
  } while (token && comments.length < maxComments);

  return { comments, readable: true };
}
