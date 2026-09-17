/**
 * Delete or refresh stored YouTube API Data that has outlived its horizon.
 *
 *     III.E.4.d: Non-Authorized Data may be kept "not longer than 30 calendar
 *     days ... the API Client must either delete or refresh the stored data."
 *
 * The comment corpus is Non-Authorized Data — commentThreads.list returns it
 * against an API key with no User Credentials — and the creator cannot consent
 * on its behalf in any case, because it is other people's writing. Until this
 * script existed there was no expiry concept at all: rows were written once and
 * kept indefinitely.
 *
 * DELETE, NOT REFRESH. Refreshing means re-fetching from YouTube, which is the
 * ingestion worker's job and does not exist yet. Deleting is the other half of
 * the same sentence and is always available, so this takes it. When the worker
 * lands, the right shape is refresh-then-delete-what-failed; the row selection
 * here is the same either way.
 *
 * Demographics are deliberately NOT purged. III.E.4.b allows YouTube Analytics
 * and Reporting data to be stored past 30 days provided authorisation is
 * re-verified every 30 days, so they outlive the corpus — and purging them
 * would destroy the one block that needs a creator to reconnect OAuth to
 * restore.
 *
 *   npm run retention           # dry run: report what would be purged
 *   npm run retention -- --apply
 */
import { createClient } from '@supabase/supabase-js';

import { commentClustersSchema, publicOpinionSchema } from '@/lib/schemas';

import {
  API_DERIVED_COLUMNS,
  VERBATIM_RETENTION_DAYS,
  expireVerbatim,
  isPastRetention,
  purgeApiSourcedOpinion,
  retentionDays,
  verbatimDueAt,
} from '@/lib/report/policy';

const APPLY = process.argv.includes('--apply');

function makeClient(url: string, key: string) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * What an expired row becomes.
 *
 * Not a deleted row: the creator, their profile and their OAuth demographics
 * survive, and the report renders its honest "not measured" states — which is
 * precisely true once we are no longer permitted to hold the measurement.
 * Deleting the row instead would 404 a live profile over a bookkeeping
 * deadline.
 */
const PURGED: Record<string, unknown> = {
  top_comment_clusters: [],
  comment_axes: null,
  comment_coverage: {},
  promotions: [],
  intent_samples: null,
  platform_breakdown: [],
  output_stats: [],
  brand_safety_flags: [],
  sentiment_score: null,
  purchase_intent_rate: null,
  brand_safety_score: null,
  engagement_rate: null,
  purchase_intent_ci_low: null,
  purchase_intent_ci_high: null,
  commercial_density: null,
  intent_dispersion: null,
  comments_analyzed: 0,
  ai_summary: '',
  // The horizon is cleared with the data it governed. A row with no stored API
  // Data has no deadline, and leaving a past-due date on it would keep it in
  // every subsequent run's worklist forever.
  data_refresh_due_at: null,
  data_fetched_at: null,
};

// `public_opinion` is NOT in PURGED. It mixes YouTube commentary, which is API
// Data on a 30-day clock, with press and forum findings from the open web,
// which are on no clock of YouTube's. Nulling the column would delete records
// we are entitled to keep, so it is rewritten per row instead.

async function main() {
  if (!URL || !SERVICE_KEY) {
    console.error(
      'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. This job writes across\n' +
        'every creator, so it runs as the service role and never as a session.',
    );
    process.exit(1);
  }

  // Service role: RLS scopes reports to their owner or a Pro member, and a
  // retention sweep is neither. Bypassing is correct here and nowhere else.
  const supabase = makeClient(URL, SERVICE_KEY);

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('report_metrics')
    .select('creator_id, data_fetched_at, data_refresh_due_at, comments_analyzed, public_opinion')
    .lt('data_refresh_due_at', nowIso)
    .returns<
      {
        creator_id: string;
        data_fetched_at: string | null;
        data_refresh_due_at: string | null;
        comments_analyzed: number;
        public_opinion: unknown;
      }[]
    >();

  if (error) {
    console.error('[retention] query failed:', error.message);
    process.exit(1);
  }

  // The query filters; this re-checks with the same function the read path
  // uses, so a clock skew or a timezone bug cannot purge a row the application
  // would still have served.
  const expired = data.filter((row) => isPastRetention(row.data_refresh_due_at));

  console.log(`  horizon        ${retentionDays()} days`);
  console.log(`  past horizon   ${expired.length} of ${data.length} matched`);
  console.log(`  mode           ${APPLY ? 'APPLY' : 'dry run'}\n`);

  if (expired.length === 0) {
    console.log('  Nothing past the derived horizon.');
    await sweepVerbatim(supabase);
    return;
  }

  for (const row of expired) {
    console.log(
      `  ${row.creator_id}  due ${row.data_refresh_due_at}  ${row.comments_analyzed.toLocaleString('en-US')} comments`,
    );
  }

  if (!APPLY) {
    console.log(`\n  Dry run. Re-run with --apply to purge ${expired.length} row(s).`);
    console.log(`  Columns cleared: ${API_DERIVED_COLUMNS.length} + ai_summary, comments_analyzed.`);
      console.log('  demographics is NOT cleared — III.E.4.b permits keeping it.');
    console.log('  public_opinion keeps its press/forum findings — not API Data, not on this clock.');
    await sweepVerbatim(supabase);
    return;
  }

  let purged = 0;
  for (const row of expired) {
    const opinion = publicOpinionSchema.parse(row.public_opinion);
    const { error: updateError } = await supabase
      .from('report_metrics')
      .update({ ...PURGED, public_opinion: purgeApiSourcedOpinion(opinion) })
      .eq('creator_id', row.creator_id);

    if (updateError) {
      console.error(`  FAILED ${row.creator_id}: ${updateError.message}`);
      continue;
    }
    purged++;
  }

  console.log(`\n  Purged ${purged} of ${expired.length}.`);
  // A partial sweep is a partial breach, so it must not exit 0 and look like a
  // success to whatever scheduled it.
  if (purged !== expired.length) process.exit(1);

  // Rows blanked above no longer hold quotes, but every row that survived the
  // derived horizon still might.
  await sweepVerbatim(supabase);
}

/**
 * The second, much busier sweep: drop verbatim text at 30 days from rows whose
 * derived figures are still well inside the amended horizon.
 *
 * This is where nearly every live row sits. The pass above fires three years
 * after ingestion and will usually find nothing; this one fires a month after
 * and finds almost everything, which is why it selects on `data_fetched_at`
 * (indexed in 0021) rather than the derived deadline.
 *
 * `data_fetched_at` is deliberately NOT cleared here. The row still holds
 * derived figures governed by it, and clearing it would erase the derived
 * deadline along with the verbatim one — turning a row with a live obligation
 * into one that looks exempt.
 */
type Db = ReturnType<typeof makeClient>;

async function sweepVerbatim(supabase: Db) {
  const cutoff = new Date(Date.now() - VERBATIM_RETENTION_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('report_metrics')
    .select('creator_id, data_fetched_at, top_comment_clusters, public_opinion')
    .lt('data_fetched_at', cutoff)
    .returns<
      {
        creator_id: string;
        data_fetched_at: string | null;
        top_comment_clusters: unknown;
        public_opinion: unknown;
      }[]
    >();

  if (error) {
    console.error('[retention/verbatim] query failed:', error.message);
    process.exit(1);
  }

  // Re-checked with the same function the read path uses, so a clock skew
  // cannot strip a row the application would still have served intact.
  const stale = data.filter((row) => isPastRetention(verbatimDueAt(row.data_fetched_at)));

  console.log(`\n  verbatim horizon  ${VERBATIM_RETENTION_DAYS} days`);
  console.log(`  past horizon      ${stale.length} of ${data.length} matched`);

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
    const opinion = publicOpinionSchema.parse(row.public_opinion);
    const next = expireVerbatim(
      { topCommentClusters: clusters, publicOpinion: opinion },
      row.data_fetched_at,
    );
    const { error: updateError } = await supabase
      .from('report_metrics')
      .update({
        top_comment_clusters: next.topCommentClusters,
        public_opinion: next.publicOpinion,
      } as never)
      .eq('creator_id', row.creator_id);

    if (updateError) {
      console.error(`  FAILED ${row.creator_id}: ${updateError.message}`);
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
