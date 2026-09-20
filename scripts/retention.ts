/**
 * Delete or refresh stored YouTube API Data that has outlived its horizon.
 *
 *     III.E.4.d: Non-Authorized Data may be kept "not longer than 30 calendar
 *     days ... the API Client must either delete or refresh the stored data."
 *
 * The comment corpus is Non-Authorized Data — commentThreads.list returns it
 * against an API key with no User Credentials — and nobody can consent on its
 * behalf in any case, because it is other people's writing.
 *
 * WHAT CHANGED WHEN THE CREATOR HALF WENT. This swept `report_metrics`, where
 * a row hung off a creator's profile: blanking the API columns was correct
 * there because the profile, the bio and the OAuth demographics were not API
 * Data and had to survive. `channel_analyses` has no such remainder. Every
 * column in it came from the API — the title and the avatar included — so the
 * expired row is DELETED rather than emptied.
 *
 * Deleting is safe for the product, which is why it is also the honest option:
 * a candidate whose analysis is gone renders as "no public read stored yet",
 * a state the comparison table already has, and adding the candidate again
 * re-fetches it.
 *
 *   npm run retention           # dry run: report what would be purged
 *   npm run retention -- --apply
 */
import { createClient } from '@supabase/supabase-js';

import { commentClustersSchema } from '@/lib/schemas';
import {
  VERBATIM_RETENTION_DAYS,
  expireVerbatim,
  isPastRetention,
  refreshDueAt,
  retentionDays,
  verbatimDueAt,
} from '@/lib/report/policy';

const APPLY = process.argv.includes('--apply');

function makeClient(url: string, key: string) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
type Db = ReturnType<typeof makeClient>;

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

interface Row {
  channel_id: string;
  title: string;
  data_fetched_at: string;
  comments_analyzed: number;
}

async function main() {
  if (!URL || !SERVICE_KEY) {
    console.error(
      'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. This job writes across\n' +
        'every analysed channel, so it runs as the service role and never as a session.',
    );
    process.exit(1);
  }

  // Service role: `channel_analyses` is readable by any signed-in user and
  // writable by nobody through the API. A retention sweep is neither of those,
  // and bypassing RLS is correct here and nowhere else.
  const supabase = makeClient(URL, SERVICE_KEY);

  const { data, error } = await supabase
    .from('channel_analyses')
    .select('channel_id, title, data_fetched_at, comments_analyzed')
    .returns<Row[]>();

  if (error) {
    console.error('[retention] query failed:', error.message);
    process.exit(1);
  }

  // The horizon is derived from `data_fetched_at` with the same function the
  // read path uses, rather than stored on the row: a deadline written once and
  // a deadline computed on read can disagree, and the one that decides whether
  // we are in breach has to be the one the application honours.
  const expired = (data ?? []).filter((row) => isPastRetention(refreshDueAt(row.data_fetched_at)));

  console.log(`  horizon        ${retentionDays()} days`);
  console.log(`  past horizon   ${expired.length} of ${data?.length ?? 0} analysed channels`);
  console.log(`  mode           ${APPLY ? 'APPLY' : 'dry run'}\n`);

  for (const row of expired) {
    console.log(
      `  ${row.channel_id}  ${row.title}  fetched ${row.data_fetched_at}  ` +
        `${row.comments_analyzed.toLocaleString('en-US')} comments`,
    );
  }

  if (expired.length && !APPLY) {
    console.log(`\n  Dry run. Re-run with --apply to delete ${expired.length} row(s).`);
    console.log('  Candidates pointing at them keep their notes and fees; the channel re-analyses.');
  }

  let purged = 0;
  if (APPLY && expired.length) {
    for (const row of expired) {
      const { error: deleteError } = await supabase
        .from('channel_analyses')
        .delete()
        .eq('channel_id', row.channel_id);
      if (deleteError) {
        console.error(`  FAILED ${row.channel_id}: ${deleteError.message}`);
        continue;
      }
      purged++;
    }
    console.log(`\n  Deleted ${purged} of ${expired.length}.`);
  }

  await sweepVerbatim(supabase);

  // A partial sweep is a partial breach, so it must not exit 0 and look like a
  // success to whatever scheduled it.
  if (APPLY && purged !== expired.length) process.exit(1);
}

/**
 * The second, much busier sweep: drop verbatim comment text at 30 days from
 * rows whose derived figures are still well inside the amended horizon.
 *
 * This is where nearly every live row sits. The pass above fires three years
 * after ingestion and will usually find nothing; this one fires a month after
 * and finds almost everything.
 *
 * `data_fetched_at` is deliberately NOT cleared. The row still holds derived
 * figures governed by it, and clearing it would erase the derived deadline
 * along with the verbatim one — turning a row with a live obligation into one
 * that looks exempt.
 */
async function sweepVerbatim(supabase: Db) {
  const cutoff = new Date(Date.now() - VERBATIM_RETENTION_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('channel_analyses')
    .select('channel_id, data_fetched_at, top_comment_clusters')
    .lt('data_fetched_at', cutoff)
    .returns<{ channel_id: string; data_fetched_at: string; top_comment_clusters: unknown }[]>();

  if (error) {
    console.error('[retention/verbatim] query failed:', error.message);
    process.exit(1);
  }

  const stale = (data ?? []).filter((row) => isPastRetention(verbatimDueAt(row.data_fetched_at)));

  console.log(`\n  verbatim horizon  ${VERBATIM_RETENTION_DAYS} days`);
  console.log(`  past horizon      ${stale.length} of ${data?.length ?? 0} matched`);

  if (stale.length === 0) {
    console.log('  No stored quotes past 30 days.');
    return 0;
  }
  if (!APPLY) {
    console.log(`  Dry run. ${stale.length} row(s) would lose stored quotes;`);
    console.log('  counts, shares, labels, comment IDs and permalinks are kept.');
    return 0;
  }

  let stripped = 0;
  for (const row of stale) {
    const clusters = commentClustersSchema.parse(row.top_comment_clusters);
    // `publicOpinion` was the other half of this call and went with the
    // creator report; the clusters are the only verbatim text left.
    const next = expireVerbatim(
      { topCommentClusters: clusters, publicOpinion: null },
      row.data_fetched_at,
    );
    const { error: updateError } = await supabase
      .from('channel_analyses')
      .update({ top_comment_clusters: next.topCommentClusters } as never)
      .eq('channel_id', row.channel_id);

    if (updateError) {
      console.error(`  FAILED ${row.channel_id}: ${updateError.message}`);
      continue;
    }
    stripped++;
  }
  console.log(`  Stripped quotes from ${stripped} of ${stale.length}.`);
  if (stripped !== stale.length) process.exit(1);
  return stripped;
}

main().catch((err) => {
  console.error('[retention] failed:', err);
  process.exit(1);
});
