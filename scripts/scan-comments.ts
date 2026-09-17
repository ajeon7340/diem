/**
 * The census scan, from a terminal.
 *
 * This replaces the off-platform search as the risk read, and the reason is the
 * denominator. A search reads seven videos out of an unknown number, chosen by
 * a rule nobody recorded — its totals describe the query. A census reads
 * everything, so "312 of 21,330" is a fact with nothing to audit.
 *
 * THE PASS ITSELF LIVES IN `src/lib/ingest/classify.ts`. This file is the
 * command line over it: flags, progress, and the offline round trip. The worker
 * (`scripts/worker.ts`) calls the same functions against a queued job, so a scan
 * somebody types and a scan that runs after signup cannot produce different
 * figures for one channel.
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
 * anyone ever exercises is the fetch. The file is [{id, index, category}].
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';

import { aiModel, aiProvider } from '@/lib/ai/provider';
import {
  classifyComments,
  describeRun,
  fetchAllComments,
  readModerationHistory,
  rollUp,
  storeClassification,
  type Flagged,
  type Spend,
} from '@/lib/ingest/classify';
import { loadExternalTerms, scanKeywords } from '@/lib/report/keywords';
import { BRAND_RISK_CATEGORIES } from '@/types';
import type { BrandRiskCategory } from '@/types';

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
 */
const prefilter = args.includes('--prefilter');

const CATEGORIES: readonly BrandRiskCategory[] = BRAND_RISK_CATEGORIES;

async function main() {
  if (!handle) {
    console.error('Usage: npm run scan:comments -- --handle <h> [--max-videos N] [--apply]');
    process.exit(1);
  }
  const YT = process.env.YOUTUBE_API_KEY;
  if (!YT) {
    console.error('YOUTUBE_API_KEY is required — commentThreads.list needs it.');
    process.exit(1);
  }

  console.log(`  reading every video on @${handle}…`);
  const { comments, videos, unreadable, channelId } = await fetchAllComments(YT, { handle }, maxVideos);
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

  if (prefilter) {
    console.log('  --prefilter: measured at 77% recall on the one labelled corpus.');
    console.log('  A quarter of findings will not reach the model. Do not use for a first scan.');
    const extraTerms = loadExternalTerms();
    const lenses = new Map<string, number>();
    let candidates = 0;
    for (const c of comments) {
      const hits = scanKeywords(c.text, extraTerms);
      if (hits.length > 0) candidates += 1;
      for (const m of hits) lenses.set(m.kind, (lenses.get(m.kind) ?? 0) + 1);
    }
    console.log(
      `  keyword lens: ${candidates} of ${comments.length} worth a second read ` +
        `(${Math.round((1 - candidates / Math.max(1, comments.length)) * 100)}% of model calls saved)`,
    );
    for (const [kind, n] of [...lenses].sort((a, b) => b[1] - a[1])) {
      console.log(`     ${String(n).padStart(5)}  ${kind}`);
    }
    console.log('     a comment the lens missed is unread, not cleared');
  }

  const spend: Spend = { inputTokens: 0, outputTokens: 0, calls: 0 };
  let flagged: Flagged[] = [];

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
    flagged = await classifyComments(comments, spend, {
      prefilter,
      onProgress: (done, total) => process.stdout.write(`\r  classified ${done}/${total}`),
    });
    process.stdout.write('\r');
    console.log(
      `  ${aiProvider()} ${aiModel()}: ${spend.calls} calls · ` +
        `${spend.inputTokens.toLocaleString('en-US')} in · ` +
        `${spend.outputTokens.toLocaleString('en-US')} out (reported by the provider)`,
    );
    console.log();
  }

  const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase =
    APPLY && URL_ && KEY
      ? createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
      : null;

  if (APPLY && !supabase) {
    console.error('  --apply needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  let creatorId: string | null = null;
  if (supabase) {
    const { data: creator } = await supabase
      .from('creators')
      .select('id')
      .eq('handle', handle)
      .maybeSingle<{ id: string }>();
    if (!creator) {
      console.error(`  no creator @${handle}`);
      process.exit(1);
    }
    creatorId = creator.id;
  }

  // What the creator has already hidden, so a re-scan does not reset it to zero.
  const history =
    supabase && creatorId
      ? await readModerationHistory(supabase, creatorId)
      : { hiddenTotal: 0, lastModeratedAt: null };

  const rollup = rollUp(comments, flagged, channelId, history);

  console.log(
    `\n  ${flagged.length} flagged of ${comments.length} (${((flagged.length / Math.max(1, comments.length)) * 100).toFixed(2)}%)`,
  );
  for (const r of rollup.risks) {
    console.log(
      `     ${String(r.count).padStart(5)}  ${r.category}${r.byCreator ? `  · ${r.byCreator} BY THE CREATOR` : ''}`,
    );
  }
  if (rollup.risks.every((r) => r.byCreator === 0)) {
    console.log('     none written by the creator — none of this touches their rating');
  }

  if (rollup.register) {
    console.log(
      `\n  register · ${(rollup.register.formalShare * 100).toFixed(1)}% formal · ` +
        `${(rollup.register.slangShare * 100).toFixed(1)}% shorthand · ` +
        `${(rollup.register.emojiShare * 100).toFixed(1)}% emoji · median ${rollup.register.medianLength} chars`,
    );
  }

  const climate = describeRun(rollup, comments.length);
  console.log(
    `\n  climate · ${climate.label ?? 'unread'}${climate.traits.length ? ` (${climate.traits.join(', ')})` : ''}`,
  );
  console.log(`  ${climate.summary}`);

  if (!supabase || !creatorId) {
    console.log('\n  Dry run. Re-run with --apply to write the rollup and the queue.');
    return;
  }

  const stored = await storeClassification(supabase, creatorId, rollup, flagged, channelId);
  if (!stored.ok) {
    console.error(`  ${stored.reason}`);
    process.exit(1);
  }
  console.log(`\n  Written. ${stored.queueRows} queue rows.`);
}

main().catch((err) => {
  console.error('[scan:comments] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
