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
  const expired = (data ?? []).filter((row) => isPastRetention(verbatimDueAt(row.data_fetched_at)));

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
        .eq('channel_id', row.channel_id)
        .eq('data_fetched_at',row.data_fetched_at);
      if (deleteError) {
        console.error(`  FAILED ${row.channel_id}: ${deleteError.message}`);
        continue;
      }
      purged++;
    }
    console.log(`\n  Deleted ${purged} of ${expired.length}.`);
  }

  // The three private owners of expired API-derived data. Previewed in a dry
  // run and not only acted on under --apply: a dry run that silently skips two
  // thirds of the sweep tells an operator the job is smaller than it is, and
  // the whole point of the dry run is to be believed before it is scheduled.
  const shareCutoff = new Date().toISOString();
  const derivedCutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const counts = await Promise.all([
    supabase.from('report_shares').select('token', { count: 'exact', head: true }).lt('expires_at', shareCutoff),
    supabase.from('campaign_references').select('id', { count: 'exact', head: true }).lt('analysed_at', derivedCutoff),
    supabase.from('campaign_candidates').select('id', { count: 'exact', head: true }).lt('fit_written_at', derivedCutoff),
  ]);
  const [shares, references, fits] = counts;

  // A table this job expects and cannot see is not "nothing to do". It means
  // the migrations this deployment runs against are older than this script,
  // and continuing would report a clean sweep over data it never looked at.
  //
  // THE CHECK IS ON `count === null`, NOT ON `error`. Measured against a live
  // project missing these tables: supabase-js returned `error: none` and
  // `count: null` for a table that does not exist, while a real empty table
  // returned `count: 0`. Guarding on `error` alone printed "expired shares 0"
  // for a table with no rows because it had no existence — absence rendered as
  // zero, in the one job whose whole purpose is deleting things on a deadline.
  for (const [label, result] of [
    ['report_shares', shares],
    ['campaign_references', references],
    ['campaign_candidates', fits],
  ] as const) {
    if (result.error || result.count === null) {
      console.error(`\n  [retention] cannot read ${label}: ${result.error?.message ?? 'table not present'}`);
      console.error('  This deployment is missing migrations this job depends on. Apply them');
      console.error('  before scheduling retention, or expired private data is never swept.');
      process.exit(1);
    }
  }

  console.log(`\n  expired shares        ${shares.count}`);
  console.log(`  stale references      ${references.count}`);
  console.log(`  stale private fit     ${fits.count}`);

  if (APPLY) {
    const { error: sharesError } = await supabase.from('report_shares').delete().lt('expires_at', shareCutoff);
    if (sharesError) throw sharesError;
    const { error: referenceError } = await supabase.from('campaign_references').update({
      title:'Expired reference — refresh before use',channel_title:'',published_at:null,duration_sec:null,
      views:null,channel_median_views:null,multiple:null,engagement_rate:null,channel_median_engagement:null,sample_size:0,
    }).lt('analysed_at', derivedCutoff);
    if (referenceError) throw referenceError;
    // Private fit prose also contains API-derived evidence. It is not exempt.
    const { error: fitError } = await supabase.from('campaign_candidates').update({fit_summary:null,fit_model:null,fit_written_at:null})
      .lt('fit_written_at', derivedCutoff);
    if (fitError) throw fitError;
  } else {
    console.log('  Dry run. Re-run with --apply to clear the three above.');
  }

  await sweepVerbatim(supabase);
  await sweepDiscovery(supabase);

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
      .eq('channel_id', row.channel_id)
        .eq('data_fetched_at',row.data_fetched_at);

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

/**
 * Discovery's own API Data, which is all of it.
 *
 * A search result is titles, avatars, descriptions, subscriber counts and
 * verbatim description excerpts — every field came from the API, so an expired
 * search is DELETED rather than emptied, exactly like `channel_analyses`.
 *
 * TWO THINGS DELIBERATELY SURVIVE, because no YouTube policy reaches them:
 *
 *   `competitor_brands` — a list of competitors somebody assembled and
 *   confirmed. Their work, not YouTube's data. The FK is `on delete set null`
 *   so the cascade cannot take it.
 *
 *   `workspace_candidates` — the fact that this organisation saved this channel.
 *   The channel id is not API Data; the evidence cached beside it is, so the
 *   evidence is cleared and the row stays, with its reason replaced by one that
 *   says what happened rather than by silence.
 *
 * Deleting is safe for the product: a saved candidate whose evidence has gone
 * still opens, still analyses, still joins a campaign. It simply stops being
 * able to show the video that found it, which is the correct consequence of
 * being no longer allowed to hold it.
 */
async function sweepDiscovery(supabase: Db) {
  const cutoff = new Date(Date.now() - VERBATIM_RETENTION_DAYS * 86_400_000).toISOString();

  const [searches, evidence, saved] = await Promise.all([
    supabase.from('discovery_searches').select('id', { count: 'exact', head: true }).lt('created_at', cutoff),
    supabase.from('collaboration_evidence').select('id', { count: 'exact', head: true }).lt('collected_at', cutoff),
    supabase.from('workspace_candidates').select('channel_id', { count: 'exact', head: true }).lt('saved_at', cutoff),
  ]);

  // Same `count === null` guard as above, for the same measured reason: a table
  // this deployment has not migrated reports no error and no rows, and a sweep
  // that silently skips a table is a sweep that reports a clean result over
  // data it never read.
  for (const [label, result] of [
    ['discovery_searches', searches],
    ['collaboration_evidence', evidence],
    ['workspace_candidates', saved],
  ] as const) {
    if (result.error || result.count === null) {
      console.error(`\n  [retention] cannot read ${label}: ${result.error?.message ?? 'table not present'}`);
      console.error('  This deployment is missing the discovery migrations. Apply them before');
      console.error('  scheduling retention, or expired discovery data is never swept.');
      process.exit(1);
    }
  }

  console.log(`\n  expired searches      ${searches.count}`);
  console.log(`  expired collab rows   ${evidence.count}`);
  console.log(`  stale saved evidence  ${saved.count}`);

  if (!APPLY) {
    console.log('  Dry run. Re-run with --apply. Confirmed competitor brands are never swept.');
    return;
  }

  const { error: searchError } = await supabase.from('discovery_searches').delete().lt('created_at', cutoff);
  if (searchError) throw searchError;
  // Belt and braces: an evidence row whose search was already gone has no
  // cascade left to ride.
  const { error: evidenceError } = await supabase.from('collaboration_evidence').delete().lt('collected_at', cutoff);
  if (evidenceError) throw evidenceError;
  const { error: savedError } = await supabase
    .from('workspace_candidates')
    .update({
      evidence: [],
      reason: 'The evidence that surfaced this candidate has passed its 30-day retention deadline and was deleted. Re-run the search to collect it again.',
    } as never)
    .lt('saved_at', cutoff);
  if (savedError) throw savedError;
}

main().catch((err) => {
  console.error('[retention] failed:', err);
  process.exit(1);
});
