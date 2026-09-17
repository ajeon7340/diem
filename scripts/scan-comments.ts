/**
 * The census scan: read every comment on every video, and find what would be a
 * problem for a brand placing an ad beside it.
 *
 * This replaces the off-platform search as the risk read, and the reason is the
 * denominator. A search reads seven videos out of an unknown number, chosen by
 * a rule nobody recorded — its totals describe the query. A census reads
 * everything, so "312 of 21,330" is a fact with nothing to audit.
 *
 * THE RULE IT ENFORCES: a creator is not marked down for being a target.
 *
 * Every risky comment is recorded, because a brand's ad sits beside it whoever
 * wrote it. Only `byCreator` reaches the creator's rating. Slurs arrive under
 * people, and more arrive the more visible they are; scoring that would reward
 * obscurity and punish reach.
 *
 *   npm run scan:comments -- --handle jooshica
 *   npm run scan:comments -- --handle jooshica --apply
 *   npm run scan:comments -- --handle jooshica --max-videos 20
 *   npm run scan:comments -- --handle jooshica --prefilter   (cheap, ~77% recall)
 *
 * OFFLINE MODE. `--dump <file>` fetches and writes the comments without
 * classifying; `--classified <file>` reads a classification back instead of
 * calling the model. Same shape as fit-local.ts, and for the same reason: the
 * pipeline has to be drivable end to end without an API key, or the only thing
 * anyone ever exercises is the fetch. The file is [{index, category}] against
 * the dump's own ordering.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';

import { aiModel, aiProvider, generateStructured } from '@/lib/ai/provider';

import { isCandidate, loadExternalTerms, scanKeywords } from '@/lib/report/keywords';
import { audienceClimate, measureRegister } from '@/lib/report/climate';
import { censusRisk } from '@/lib/report/safety';
import { BRAND_RISK_CATEGORIES } from '@/types';
import type { BrandRiskCategory, CommentRisk } from '@/types';

/** commentThreads.list returns 100 per page at 1 quota unit — cheap. */
const PAGE = 100;
/** Comments per classification request. Large enough to be economic, small
 *  enough that one malformed batch does not cost the whole run. */
const BATCH = 150;

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const handle = (args[args.indexOf('--handle') + 1] ?? '').replace(/^@/, '');
const maxVideos = args.includes('--max-videos')
  ? Number(args[args.indexOf('--max-videos') + 1])
  : Infinity;
const dumpTo = args.includes('--dump') ? args[args.indexOf('--dump') + 1] : null;
const classifiedFrom = args.includes('--classified')
  ? args[args.indexOf('--classified') + 1]
  : null;
/**
 * Opt-in, not opt-out, and the measurement is why.
 *
 * On the one corpus it has been measured against — 797 real comments, 31 of
 * them labelled risky by hand — the lens reaches 77% recall at 26% precision
 * and saves 88% of model calls. That trade is worth taking for a cost-bound
 * backfill and is not worth taking for the scan a brand-safety report is built
 * on: a quarter of the findings never reach the model, and the report would say
 * "31 found" when the truth is more. Silently missing is the one failure this
 * product cannot absorb.
 *
 * The seven it still missed after structural detectors were added were all
 * meaning rather than vocabulary — surgery mockery, "this weirdo", coded
 * sexism. No word list reaches those, which is the ceiling rather than a gap
 * to close.
 */
const prefilter = args.includes('--prefilter');

interface RawComment {
  id: string;
  videoId: string;
  videoTitle: string;
  text: string;
  author: string;
  authorChannelId: string | null;
  likes: number;
  publishedAt: string;
}

// Shared with the report rather than copied. A category the union has and this
// array does not is a category the scan never looks for, while `checked` still
// claims every one was screened.
const CATEGORIES: readonly BrandRiskCategory[] = BRAND_RISK_CATEGORIES;

/**
 * Plain JSON Schema, not an SDK type: `lib/ai/provider` turns it into whatever
 * the configured provider wants, and a type from one vendor's SDK sitting here
 * would quietly make this file vendor-specific again.
 */
const CLASSIFY_TOOL = {
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

const SYSTEM = `You screen comment sections for an advertising brand-safety report.

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

async function fetchAllComments(apiKey: string, channelHandle: string) {
  const get = async (path: string, params: Record<string, string>) => {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
    for (const [k, v] of Object.entries({ ...params, key: apiKey })) url.searchParams.set(k, v);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  };

  const channel = await get('channels', {
    part: 'contentDetails,snippet',
    forHandle: `@${channelHandle}`,
  });
  const uploads = channel.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  const channelId = channel.items?.[0]?.id ?? null;
  if (!uploads) throw new Error(`no uploads playlist for @${channelHandle}`);

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
        // Comments disabled or restricted on this video. Counted, not fatal —
        // the coverage figure has to distinguish "read and empty" from
        // "could not read".
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
    } while (token);
  }

  return { comments, videos: capped.length, unreadable, channelId };
}

/** Reported by the provider, accumulated across the run. Not estimated. */
export const spend = { inputTokens: 0, outputTokens: 0, calls: 0 };

async function classify(batch: RawComment[]): Promise<Map<number, BrandRiskCategory>> {
  const listing = batch.map((c, i) => `${i}. ${c.text.replace(/\s+/g, ' ').slice(0, 400)}`).join('\n');

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

async function main() {
  if (!handle) {
    console.error(
      'Usage: npm run scan:comments -- --handle <h> [--max-videos N] [--apply]',
    );
    process.exit(1);
  }
  const YT = process.env.YOUTUBE_API_KEY;
  if (!YT) {
    console.error('YOUTUBE_API_KEY is required — commentThreads.list needs it.');
    process.exit(1);
  }

  console.log(`  reading every video on @${handle}…`);
  const { comments, videos, unreadable, channelId } = await fetchAllComments(YT, handle);
  console.log(
    `  ${videos} videos · ${unreadable} with comments unreadable · ${comments.length.toLocaleString('en-US')} comments`,
  );

  if (dumpTo) {
    // Indexes are the contract between this file and the classification that
    // comes back, so the dump carries them explicitly rather than relying on
    // array order surviving a round trip through a human.
    writeFileSync(
      dumpTo,
      JSON.stringify(
        comments.map((c, index) => ({
          // `id` is the stable key and `index` is a convenience for reading the
          // file — never the other way round. See the matcher below.
          id: c.id,
          index,
          text: c.text.replace(/\s+/g, ' ').slice(0, 400),
          likes: c.likes,
          byCreator: c.authorChannelId === channelId,
        })),
        null,
        2,
      ),
    );
    console.log(`\n  Dumped ${comments.length} comments to ${dumpTo}.`);
    console.log('  Classify them, then re-run with --classified <file> to continue.');
    return;
  }

  // The keyword lens decides what the model READS, never what anything is.
  //
  // A census of 21,330 comments is 142 model requests; almost all of them are
  // spent on "love this look on you". The lens hands over the few hundred worth
  // a second read, deterministically and with a printable reason.
  //
  // A comment it misses is NOT a clean comment. It misses coded language,
  // sarcasm, script-mixing and every term invented after the lexicon was
  // written, which is why `--no-prefilter` exists and why the coverage is
  // printed rather than assumed.
  const extraTerms = loadExternalTerms();
  const candidates = prefilter
    ? comments.filter((c) => isCandidate(c.text, extraTerms))
    : comments;

  if (prefilter) {
    console.log('  --prefilter: measured at 77% recall on the one labelled corpus.');
    console.log('  A quarter of findings will not reach the model. Do not use for a first scan.');
    const lenses = new Map<string, number>();
    for (const c of candidates) {
      for (const m of scanKeywords(c.text, extraTerms)) {
        lenses.set(m.kind, (lenses.get(m.kind) ?? 0) + 1);
      }
    }
    console.log(
      `  keyword lens: ${candidates.length} of ${comments.length} worth a second read ` +
        `(${Math.round((1 - candidates.length / Math.max(1, comments.length)) * 100)}% of model calls saved)`,
    );
    for (const [kind, n] of [...lenses].sort((a, b) => b[1] - a[1])) {
      console.log(`     ${String(n).padStart(5)}  ${kind}`);
    }
    console.log('     a comment the lens missed is unread, not cleared');
  }

  const flagged: { comment: RawComment; category: BrandRiskCategory }[] = [];

  if (classifiedFrom) {
    const rows = JSON.parse(readFileSync(classifiedFrom, 'utf8')) as {
      id?: string;
      index: number;
      category: BrandRiskCategory;
    }[];

    // MATCH ON ID, NOT POSITION.
    //
    // This applied `comments[row.index]` against a FRESH fetch, and the range
    // check was the only guard — which catches a corpus that shrank and is
    // blind to one that grew. It grew: @가재맨 went 2,384 → 2,392 between two
    // runs twenty minutes apart, because it is a live channel, and every label
    // in the file then described a different comment. Nothing failed. The
    // totals were identical, the categories were identical, and 180 findings
    // had quietly been reassigned to whoever happened to be eight places along.
    //
    // A position is not an identity. Dumps written before this carry no `id`,
    // so those still fall back to the index — loudly, because on a live channel
    // that fallback is only correct if nothing was posted in between.
    const byId = new Map(comments.map((c) => [c.id, c]));
    const keyed = rows.filter((r) => typeof r.id === 'string').length;
    if (keyed === 0 && rows.length > 0) {
      console.warn(
        '  ⚠ this classification file has no comment ids — falling back to position.\n' +
          '    Correct only if the section has not changed since the dump. Re-dump to be sure.',
      );
    } else if (keyed < rows.length) {
      console.error(`  ${rows.length - keyed} rows have no id while others do — mixed file, redo it`);
      process.exit(1);
    }

    let missing = 0;
    for (const row of rows) {
      const comment = row.id !== undefined ? byId.get(row.id) : comments[row.index];
      // A classification pointing at a comment the fetch no longer has means
      // the two runs disagree about the corpus — usually because the creator
      // deleted it. Dropping it quietly would let a stale file write risk rows
      // against the wrong comments.
      if (!comment) {
        if (row.id !== undefined) {
          missing += 1;
          continue;
        }
        console.error(`  classification index ${row.index} is out of range — refetch and redo it`);
        process.exit(1);
      }
      if (!CATEGORIES.includes(row.category)) {
        console.error(`  unknown category "${row.category}" at index ${row.index}`);
        process.exit(1);
      }
      flagged.push({ comment, category: row.category });
    }
    console.log(`  ${flagged.length} classifications read from ${classifiedFrom}`);
    if (missing > 0) {
      // Reported, never silent: these are findings that no longer have a
      // comment, and the share below is computed without them.
      console.log(`  ${missing} classified comments are gone from the section since the dump`);
    }
  } else {
    // Whichever provider is configured — checking one vendor's variable while
    // calling another is how a run gets half way in and then stops.
    const keyVar = aiProvider() === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY';
    if (!process.env[keyVar]) {
      console.log(`\n  ${keyVar} not set — fetched only, nothing classified.`);
      console.log('  Use --dump <file> to classify offline instead.');
      return;
    }
    for (let i = 0; i < candidates.length; i += BATCH) {
      const batch = candidates.slice(i, i + BATCH);
      const hits = await classify(batch);
      hits.forEach((category, index) => flagged.push({ comment: batch[index], category }));
      process.stdout.write(`\r  classified ${Math.min(i + BATCH, candidates.length)}/${candidates.length}`);
    }
    process.stdout.write('\r');
    console.log(
      `  ${aiProvider()} ${aiModel()}: ${spend.calls} calls · ` +
        `${spend.inputTokens.toLocaleString('en-US')} in · ` +
        `${spend.outputTokens.toLocaleString('en-US')} out (reported by the provider)`,
    );
    console.log();
  }

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

  console.log(`\n  ${flagged.length} flagged of ${comments.length} (${((flagged.length / Math.max(1, comments.length)) * 100).toFixed(2)}%)`);
  for (const r of risks) {
    console.log(`     ${String(r.count).padStart(5)}  ${r.category}${r.byCreator ? `  · ${r.byCreator} BY THE CREATOR` : ''}`);
  }
  if (risks.every((r) => r.byCreator === 0)) {
    console.log('     none written by the creator — none of this touches their rating');
  }

  if (register) {
    console.log(
      `\n  register · ${(register.formalShare * 100).toFixed(1)}% formal · ` +
        `${(register.slangShare * 100).toFixed(1)}% shorthand · ` +
        `${(register.emojiShare * 100).toFixed(1)}% emoji · median ${register.medianLength} chars`,
    );
  }

  const climate = audienceClimate(
    null,
    censusRisk(risks, { commentsScanned: comments.length, foundTotal: flagged.length, visibleTotal: flagged.length, hiddenTotal: 0, lastModeratedAt: null }, comments.length),
    register,
  );
  console.log(`\n  climate · ${climate.label ?? 'unread'}${climate.traits.length ? ` (${climate.traits.join(', ')})` : ''}`);
  console.log(`  ${climate.summary}`);

  if (!APPLY) {
    console.log('\n  Dry run. Re-run with --apply to write the rollup and the queue.');
    return;
  }

  const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL_ || !KEY) {
    console.error('  --apply needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  const supabase = createClient(URL_, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: creator } = await supabase
    .from('creators')
    .select('id')
    .eq('handle', handle)
    .maybeSingle<{ id: string }>();
  if (!creator) {
    console.error(`  no creator @${handle}`);
    process.exit(1);
  }

  await supabase
    .from('report_metrics')
    .update({
      comment_risks: risks,
      moderation: {
        // THE SCAN'S OWN DENOMINATOR, and it was missing here. Without it
        // `censusRisk` falls back to `comments_analyzed` — the CLUSTERING
        // corpus, a different and usually much larger set — and the adjacency
        // share comes out as a fraction of something this pass never read.
        // That exact substitution already produced 0.15% where the truth was
        // 3.89%; the field exists to stop it and the writer was not filling it.
        commentsScanned: comments.length,
        foundTotal: flagged.length,
        visibleTotal: flagged.length,
        hiddenTotal: 0,
        lastModeratedAt: null,
      },
      comment_register: register,
    })
    .eq('creator_id', creator.id);

  // Queue rows are written under the service role, never by the client, so a
  // creator cannot manufacture or delete entries to shape the rollup.
  const rows = flagged.map((f) => ({
    creator_id: creator.id,
    comment_id: f.comment.id,
    video_id: f.comment.videoId,
    video_title: f.comment.videoTitle,
    excerpt: f.comment.text.slice(0, 800),
    category: f.category,
    by_creator: f.comment.authorChannelId === channelId,
    likes: f.comment.likes,
    published_at: f.comment.publishedAt || null,
  }));

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from('comment_moderation_queue')
      .upsert(rows.slice(i, i + 500), { onConflict: 'creator_id,comment_id' });
    if (error) {
      console.error('  queue write failed:', error.message);
      process.exit(1);
    }
  }
  console.log(`\n  Written. ${rows.length} queue rows.`);
}

main().catch((err) => {
  console.error('[scan:comments] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
