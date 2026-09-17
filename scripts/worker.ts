/**
 * The worker: runs the passes that cannot finish inside a request.
 *
 *   npm run worker                      poll forever
 *   npm run worker -- --once            take at most one job, then exit
 *   npm run worker -- --drain           run until nothing is left, then exit
 *   npm run worker -- --enqueue-missing queue a scan for every creator owed one
 *   npm run worker -- --status          what is queued, running and failed
 *
 * WHY THIS EXISTS. Signup runs the bounded public-data analysis inline — 25
 * uploads, 600 comments, 2-3s, no model call — and lands the creator on a real
 * report. The classification is a different size: 6,369 comments on @가재맨 took
 * 43 model calls and 5m30s. That cannot run in a server action and it cannot run
 * in a serverless function, so signup records that it is OWED and this process
 * pays it.
 *
 * DEPLOYMENT. A plain Node process, deliberately: it needs to outlive an HTTP
 * request and hold a lease for minutes, which is the one shape Vercel functions
 * do not have. Run it anywhere with the service key and the two API keys — a
 * container, a box, a laptop while demoing. Several may run at once; claiming is
 * atomic (see 0028) and the only cost of a second worker is that jobs finish
 * sooner.
 *
 * NODE 22 IS REQUIRED, not preferred: supabase-js aborts on Node 20 with
 * "native WebSocket not found".
 */
import { hostname } from 'node:os';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { aiModel, aiProvider } from '@/lib/ai/provider';
import { ClaimLostError, classifyAndStore } from '@/lib/ingest/classify';
import { classifyIntentAndStore } from '@/lib/ingest/intent';
import type { AnalysisJobKind } from '@/types';

const args = process.argv.slice(2);
const ONCE = args.includes('--once');
const DRAIN = args.includes('--drain');
const ENQUEUE_MISSING = args.includes('--enqueue-missing');
const STATUS = args.includes('--status');
const VERBOSE = args.includes('--verbose');

/** How long a claim is held before another worker may take the job. */
const LEASE_SECONDS = Number(process.env.ADFIT_WORKER_LEASE ?? 900);
/** Gap between polls when there was nothing to do. */
const IDLE_MS = Number(process.env.ADFIT_WORKER_IDLE_MS ?? 15_000);
/**
 * Bound on a single signup-triggered census.
 *
 * A channel with 1,379 uploads is a multi-hour read and tens of thousands of
 * comments through a metered model. The first scan a creator gets is the one
 * that has to LAND, so it is bounded and says so; the unbounded census is
 * `scan:comments` with no --max-videos, run deliberately.
 */
const DEFAULT_MAX_VIDEOS = Number(process.env.ADFIT_WORKER_MAX_VIDEOS ?? 30);

const WORKER = `${hostname()}/${process.pid}`;

/** Set by SIGINT/SIGTERM. Checked between jobs, never mid-job. */
let stopping = false;

interface JobRow {
  id: string;
  creator_id: string;
  kind: AnalysisJobKind;
  status: string;
  attempts: number;
  max_attempts: number;
  params: Record<string, unknown> | null;
}

function log(...parts: unknown[]) {
  console.log(`  [${new Date().toISOString().slice(11, 19)}]`, ...parts);
}

function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('  NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    console.error('  Run through npm so --env-file=.env.local is applied.');
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Mark a job done.
 *
 * Scoped to `worker = WORKER` so a run whose lease expired mid-flight cannot
 * overwrite the outcome of whoever took the job afterwards. Losing that race is
 * normal and is logged, not raised: the work was done twice, which costs money
 * and is the reason the lease is generous, but the row must describe the run
 * that currently owns it.
 */
async function finish(
  supabase: SupabaseClient,
  jobId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await supabase
    .from('analysis_jobs')
    .update({ ...fields, finished_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('worker', WORKER)
    .select('id');

  if (error) log(`  ⚠ could not record the outcome of ${jobId}: ${error.message}`);
  else if ((data?.length ?? 0) === 0) {
    log(`  ⚠ ${jobId} was reassigned before this run finished — outcome not recorded`);
  }
}

/**
 * Should this run keep spending?
 *
 * The heartbeat extends the lease and answers at the same time. False means the
 * claim is gone, and `classifyComments` turns that into a ClaimLostError before
 * the next batch rather than after it.
 */
function heartbeat(supabase: SupabaseClient, jobId: string) {
  return async () => {
    const { data, error } = await supabase.rpc('heartbeat_analysis_job', {
      p_job_id: jobId,
      p_worker: WORKER,
      p_lease_seconds: LEASE_SECONDS,
    });
    // A transport failure is not proof the claim is gone. Keep going: the lease
    // is long, the next beat will tell us, and stopping a 5-minute run on one
    // dropped request wastes everything spent so far.
    if (error) {
      log(`  ⚠ heartbeat failed (${error.message}) — continuing on the existing lease`);
      return true;
    }
    return data === true;
  };
}

interface CreatorChannel {
  handle: string;
  youtube_handle: string | null;
  youtube_channel_id: string | null;
}

/**
 * The creator's declared channel, or a failure that says which kind it is.
 *
 * Shared by both passes: they read the same comments through the same fetcher,
 * so they must agree on which channel that is.
 */
async function requireChannel(
  supabase: SupabaseClient,
  creatorId: string,
): Promise<CreatorChannel> {
  const { data: creator, error } = await supabase
    .from('creators')
    .select('handle, youtube_handle, youtube_channel_id')
    .eq('id', creatorId)
    .maybeSingle<CreatorChannel>();

  if (error) throw new Error(`creator lookup failed: ${error.message}`);
  if (!creator) throw new Error('creator no longer exists');
  if (!creator.youtube_handle && !creator.youtube_channel_id) {
    // Terminal, not retryable: no number of attempts adds a channel to a
    // creator who declared none. Marked failed at its attempt ceiling so the
    // worker stops reaching for it.
    throw Object.assign(new Error('creator has declared no YouTube channel'), {
      terminal: true,
    });
  }
  return creator;
}

async function runClassifyComments(supabase: SupabaseClient, job: JobRow): Promise<void> {
  const creator = await requireChannel(supabase, job.creator_id);

  const maxVideos = Number(job.params?.maxVideos ?? DEFAULT_MAX_VIDEOS);
  log(
    `@${creator.handle} · ${aiProvider()} ${aiModel()} · ` +
      `${Number.isFinite(maxVideos) ? `${maxVideos} videos` : 'full census'}`,
  );

  const started = Date.now();
  const result = await classifyAndStore(
    supabase,
    job.creator_id,
    { handle: creator.youtube_handle, channelId: creator.youtube_channel_id },
    {
      maxVideos,
      stillMine: heartbeat(supabase, job.id),
      onProgress: VERBOSE
        ? (done, total) => process.stdout.write(`\r  classified ${done}/${total}`)
        : undefined,
    },
  );
  if (VERBOSE) process.stdout.write('\r');

  const seconds = Math.round((Date.now() - started) / 1000);
  log(
    `@${creator.handle} done · ${result.commentsScanned.toLocaleString('en-US')} comments · ` +
      `${result.flagged} flagged · ${result.spend.calls} calls · ` +
      `${result.spend.inputTokens.toLocaleString('en-US')} in · ` +
      `${result.spend.outputTokens.toLocaleString('en-US')} out · ${seconds}s`,
  );

  await finish(supabase, job.id, {
    status: 'succeeded',
    comments_scanned: result.commentsScanned,
    findings: result.flagged,
  });
}

async function runClassifyIntent(supabase: SupabaseClient, job: JobRow): Promise<void> {
  const creator = await requireChannel(supabase, job.creator_id);
  const maxVideos = Number(job.params?.maxVideos ?? DEFAULT_MAX_VIDEOS);

  log(
    `@${creator.handle} intent · ${aiProvider()} ${aiModel()} · ` +
      `${Number.isFinite(maxVideos) ? `${maxVideos} videos` : 'full census'}`,
  );

  const started = Date.now();
  const result = await classifyIntentAndStore(
    supabase,
    job.creator_id,
    { handle: creator.youtube_handle, channelId: creator.youtube_channel_id },
    {
      maxVideos,
      stillMine: heartbeat(supabase, job.id),
      onProgress: VERBOSE
        ? (done, total) => process.stdout.write(`\r  classified ${done}/${total}`)
        : undefined,
    },
  );
  if (VERBOSE) process.stdout.write('\r');

  const seconds = Math.round((Date.now() - started) / 1000);
  log(
    `@${creator.handle} intent done · ${result.commentsClassified.toLocaleString('en-US')} classified · ` +
      `${result.productComments} about a product · ` +
      // Null is the answer when nothing purchasable was found, and it is printed
      // as such: a creator who never holds a product is not one whose audience
      // refuses to buy.
      `intent ${result.rate === null ? 'unmeasurable' : `${(result.rate * 100).toFixed(1)}%`} · ` +
      `sentiment ${result.sentiment === null ? 'unmeasurable' : result.sentiment.toFixed(1)} · ` +
      `${result.spend.calls} calls · ${seconds}s`,
  );

  await finish(supabase, job.id, {
    status: 'succeeded',
    comments_scanned: result.commentsClassified,
    // "Findings" for this pass is what a brand can act on: comments attached to
    // something purchasable. Zero is a real and useful result here.
    findings: result.productComments,
  });
}

const HANDLERS: Record<AnalysisJobKind, (s: SupabaseClient, j: JobRow) => Promise<void>> = {
  classify_comments: runClassifyComments,
  classify_intent: runClassifyIntent,
};

/** Claim and run one job. Returns false when there was nothing to take. */
async function takeOne(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc('claim_analysis_job', {
    p_worker: WORKER,
    p_lease_seconds: LEASE_SECONDS,
  });

  if (error) {
    log(`  ⚠ claim failed: ${error.message}`);
    return false;
  }
  const job = data as JobRow | null;
  if (!job?.id) return false;

  log(`claimed ${job.kind} ${job.id} (attempt ${job.attempts}/${job.max_attempts})`);

  try {
    const handler = HANDLERS[job.kind];
    // An enum value the database has and this worker does not. Left QUEUED by
    // failing loudly rather than marked failed: an old worker must not bury a
    // job a newer one would handle.
    if (!handler) throw new Error(`no handler for kind "${job.kind}" — is this worker out of date?`);
    await handler(supabase, job);
  } catch (err) {
    if (err instanceof ClaimLostError) {
      // Someone else owns it now. Say nothing to the row.
      log(`  ${job.id}: ${err.message} — dropping this run`);
      return true;
    }

    const message = err instanceof Error ? err.message : String(err);
    const terminal = Boolean((err as { terminal?: boolean }).terminal);
    const exhausted = terminal || job.attempts >= job.max_attempts;

    log(`  ✗ ${job.id}: ${message}${exhausted ? '' : ' — will retry'}`);

    if (exhausted) {
      await finish(supabase, job.id, { status: 'failed', last_error: message.slice(0, 2000) });
    } else {
      // Back to queued, with the error kept. Not left `running`: the lease
      // would have to expire first, and a retryable failure should be picked up
      // on the next poll rather than fifteen minutes later.
      const { error: resetError } = await supabase
        .from('analysis_jobs')
        .update({ status: 'queued', last_error: message.slice(0, 2000), leased_until: null })
        .eq('id', job.id)
        .eq('worker', WORKER);
      if (resetError) log(`  ⚠ could not requeue ${job.id}: ${resetError.message}`);
    }
  }
  return true;
}

/**
 * Queue a scan for every creator who has a channel and no classification.
 *
 * The repair path for anyone who signed up before this existed, and for the
 * signups where `enqueueAnalysisJob` failed quietly rather than bouncing
 * somebody off a form they could no longer submit.
 */
async function enqueueMissing(supabase: SupabaseClient): Promise<void> {
  const { data: creators, error } = await supabase
    .from('creators')
    .select('id, handle, youtube_handle, youtube_channel_id')
    .not('youtube_channel_id', 'is', null);

  if (error) {
    console.error(`  could not list creators: ${error.message}`);
    process.exit(1);
  }

  let queued = 0;
  let skipped = 0;

  for (const creator of (creators ?? []) as { id: string; handle: string }[]) {
    const { data: metrics } = await supabase
      .from('report_metrics')
      .select('moderation, comment_axes')
      .eq('creator_id', creator.id)
      .maybeSingle<{
        moderation: { commentsScanned?: number } | null;
        comment_axes: unknown;
      }>();

    // WHAT COUNTS AS ALREADY DONE, per pass, and neither is the obvious field.
    //
    //   census: `moderation.commentsScanned`, not `comment_risks` — a clean
    //           channel has no risks and would read as never-scanned forever.
    //   intent: `comment_axes` present, not `purchase_intent_rate` — that is
    //           null whenever nothing purchasable was found, which is a
    //           completed measurement and not a missing one.
    const done: Record<AnalysisJobKind, boolean> = {
      classify_comments: Boolean(metrics?.moderation?.commentsScanned),
      classify_intent: metrics?.comment_axes != null,
    };

    for (const kind of Object.keys(done) as AnalysisJobKind[]) {
      if (done[kind]) {
        skipped += 1;
        continue;
      }
      const { error: insertError } = await supabase
        .from('analysis_jobs')
        .insert({ creator_id: creator.id, kind, params: {} });

      if (insertError) {
        // 23505 is the partial unique index: one is already queued or running.
        if (insertError.code === '23505') skipped += 1;
        else console.error(`  @${creator.handle} ${kind}: ${insertError.message}`);
      } else {
        queued += 1;
        console.log(`  queued ${kind} for @${creator.handle}`);
      }
    }
  }
  console.log(`\n  ${queued} queued, ${skipped} already done or already queued.`);
}

async function showStatus(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase
    .from('analysis_jobs')
    .select('kind, status, attempts, max_attempts, queued_at, comments_scanned, findings, last_error, creators(handle)')
    .order('queued_at', { ascending: false })
    .limit(40);

  if (error) {
    console.error(`  ${error.message}`);
    process.exit(1);
  }
  if (!data?.length) {
    console.log('  No jobs.');
    return;
  }

  for (const row of data as unknown as (JobRow & {
    queued_at: string;
    comments_scanned: number | null;
    findings: number | null;
    last_error: string | null;
    creators: { handle: string } | null;
  })[]) {
    const who = row.creators?.handle ? `@${row.creators.handle}` : row.creator_id;
    const detail =
      row.status === 'succeeded'
        ? `${(row.comments_scanned ?? 0).toLocaleString('en-US')} comments · ${row.findings ?? 0} flagged`
        : row.status === 'failed'
          ? (row.last_error ?? '').slice(0, 80)
          : `attempt ${row.attempts}/${row.max_attempts}`;
    console.log(
      `  ${row.status.padEnd(10)} ${row.kind.padEnd(18)} ${who.padEnd(20)} ${detail}`,
    );
  }
}

async function main() {
  const supabase = serviceClient();

  if (STATUS) return showStatus(supabase);
  if (ENQUEUE_MISSING) return enqueueMissing(supabase);

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      if (stopping) process.exit(1);
      stopping = true;
      // The current job keeps its lease and finishes. Killing mid-run would
      // throw away everything already spent on the model for it.
      console.log(`\n  ${signal} — finishing the current job, then stopping. Again to force.`);
    });
  }

  log(`worker ${WORKER} · lease ${LEASE_SECONDS}s · ${aiProvider()} ${aiModel()}`);

  let idle = false;
  while (!stopping) {
    const took = await takeOne(supabase);

    if (took) {
      idle = false;
      if (ONCE) break;
      continue;
    }

    if (DRAIN || ONCE) {
      log('nothing left to do');
      break;
    }
    if (!idle) {
      log('idle');
      idle = true;
    }
    await new Promise((resolve) => setTimeout(resolve, IDLE_MS));
  }
}

main().catch((err) => {
  console.error('[worker] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
