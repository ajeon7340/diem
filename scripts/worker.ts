/**
 * The worker: runs the passes that cannot finish inside a request.
 *
 *   npm run worker                      poll forever
 *   npm run worker -- --once            take at most one job, then exit
 *   npm run worker -- --drain           run until nothing is left, then exit
 *   npm run worker -- --enqueue-missing queue the passes any analysed channel still owes
 *   npm run worker -- --status          what is queued, running and failed
 *
 * WHY THIS EXISTS. Adding a candidate runs the bounded public-data analysis
 * inline — 25 uploads, 600 comments, 2-3s, no model call — and lands a real
 * row on the comparison table. The classification is a different size: 6,369 comments on @가재맨 took
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
import { AMENDMENT_ACCEPTED } from '@/lib/report/policy';
import { analyzeChannel } from '@/lib/ingest/analyze';
import { hostname } from 'node:os';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { aiModel, aiProvider } from '@/lib/ai/provider';
import { ClaimLostError } from '@/lib/ingest/classify';
import {
  classifyChannelAndStore,
  classifyChannelIntentAndStore,
} from '@/lib/ingest/channel-classify';
import { jobMaxComments, jobMaxVideos, positiveEnv } from '@/lib/ingest/worker-config';
import { runDiscoveryJob } from '@/lib/discovery/run';
import { discoveryLimits } from '@/lib/discovery/limits';
import type { AnalysisJobKind } from '@/types';

const args = process.argv.slice(2);
const ONCE = args.includes('--once');
const DRAIN = args.includes('--drain');
const ENQUEUE_MISSING = args.includes('--enqueue-missing');
const STATUS = args.includes('--status');
const VERBOSE = args.includes('--verbose');

/** How long a claim is held before another worker may take the job. */
const LEASE_SECONDS = positiveEnv('ADFIT_WORKER_LEASE', 900);
/** Gap between polls when there was nothing to do. */
const IDLE_MS = positiveEnv('ADFIT_WORKER_IDLE_MS', 15_000);
/**
 * Bound on a single signup-triggered census.
 *
 * A channel with 1,379 uploads is a multi-hour read and tens of thousands of
 * comments through a metered model. The first scan a channel gets is the one
 * that has to LAND while somebody is still looking at the shortlist, so it is
 * bounded and the report says over how many comments.
 */
const DEFAULT_MAX_VIDEOS = positiveEnv('ADFIT_WORKER_MAX_VIDEOS', 30);
/**
 * 3,000 comments is about 30 model calls and two to four minutes — the bound
 * that makes a pass finish while somebody is still interested. Videos alone
 * did not bound it: 30 videos is 2,437 comments on one channel and 28,265 on
 * another, and the second is over an hour.
 */
const DEFAULT_MAX_COMMENTS = positiveEnv('ADFIT_WORKER_MAX_COMMENTS', 3_000);

const WORKER = `${hostname()}/${process.pid}`;

/** Set by SIGINT/SIGTERM. Checked between jobs, never mid-job. */
let stopping = false;

interface JobRow {
  id: string;
  /** The public channel this job analyses. Null on a discovery job. */
  channel_id: string;
  /** The discovery run this job performs. Null on a channel job. */
  search_id: string | null;
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
    // The stage is cleared on every terminal outcome, or a succeeded job keeps
    // rendering "classifying 4,800 of 6,369" forever. The counts stay: they are
    // what the job did, and a finished job saying how much it read is useful.
    .update({ ...fields, progress_stage: null, finished_at: new Date().toISOString() })
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
interface Progress {
  done?: number;
  total?: number;
  stage?: import('@/types').AnalysisJob['progressStage'];
}

/**
 * Shared between the heartbeat and `onProgress`, so the number the terminal
 * prints and the number the profile shows come from one place. They drifted
 * apart the obvious way otherwise: --verbose printed a live count and the page
 * showed nothing at all.
 */
function progressBox() {
  const box: Progress = {};
  return {
    set(next: Progress) {
      Object.assign(box, next);
    },
    read: () => box,
  };
}

function heartbeat(supabase: SupabaseClient, jobId: string, progress: Progress) {
  return async () => {
    const { data, error } = await supabase.rpc('heartbeat_analysis_job', {
      p_job_id: jobId,
      p_worker: WORKER,
      p_lease_seconds: LEASE_SECONDS,
      // Rides the beat rather than taking a write of its own — see 0029.
      p_done: progress.done ?? null,
      p_total: progress.total ?? null,
      p_stage: progress.stage ?? null,
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

/**
 * The two model passes.
 *
 * There used to be four handlers here: these two and their creator-scoped
 * twins, which wrote to `report_metrics` and the moderation queue. The creator
 * half of the product is gone and so are they. The pipeline these call is the
 * same one those called — it never knew what a creator was.
 */
async function runChannelClassify(supabase: SupabaseClient, job: JobRow): Promise<void> {
  const channelId = job.channel_id!;
  const maxVideos = jobMaxVideos(job.params, DEFAULT_MAX_VIDEOS);
  const maxComments = jobMaxComments(job.params, DEFAULT_MAX_COMMENTS);
  log(`channel ${channelId} · ${aiProvider()} ${aiModel()} · ${maxComments} comments max`);

  const started = Date.now();
  const progress = progressBox();
  progress.set({ stage: 'fetching' });
  const result = await classifyChannelAndStore(supabase, channelId, {
    maxVideos,
    maxComments,
    jobId:job.id, worker:WORKER,
    stillMine: heartbeat(supabase, job.id, progress.read()),
    onProgress: (done, total) => {
      progress.set({ done, total, stage: 'classifying' });
      if (VERBOSE) process.stdout.write(`\r  classified ${done}/${total}`);
    },
  });
  if (VERBOSE) process.stdout.write('\r');

  log(
    `channel ${channelId} done · ${result.commentsScanned.toLocaleString('en-US')} comments · ` +
      `${result.flagged} flagged · ${result.spend.calls} calls · ` +
      `${Math.round((Date.now() - started) / 1000)}s`,
  );
  await finish(supabase, job.id, {
    status: 'succeeded',
    comments_scanned: result.commentsScanned,
    findings: result.flagged,
  });
}

async function runChannelIntent(supabase: SupabaseClient, job: JobRow): Promise<void> {
  const channelId = job.channel_id!;
  const maxVideos = jobMaxVideos(job.params, DEFAULT_MAX_VIDEOS);
  const maxComments = jobMaxComments(job.params, DEFAULT_MAX_COMMENTS);
  log(`channel ${channelId} intent · ${aiProvider()} ${aiModel()}`);

  const started = Date.now();
  const progress = progressBox();
  progress.set({ stage: 'fetching' });
  const result = await classifyChannelIntentAndStore(supabase, channelId, {
    maxVideos,
    maxComments,
    jobId:job.id, worker:WORKER,
    stillMine: heartbeat(supabase, job.id, progress.read()),
    onProgress: (done, total) => {
      progress.set({ done, total, stage: 'classifying' });
      if (VERBOSE) process.stdout.write(`\r  classified ${done}/${total}`);
    },
  });
  if (VERBOSE) process.stdout.write('\r');

  log(
    `channel ${channelId} intent done · ${result.commentsClassified.toLocaleString('en-US')} classified · ` +
      `${result.productComments} about a product · ` +
      `intent ${result.rate === null ? 'unmeasurable' : `${(result.rate * 100).toFixed(1)}%`} · ` +
      `${Math.round((Date.now() - started) / 1000)}s`,
  );
  await finish(supabase, job.id, {
    status: 'succeeded',
    comments_scanned: result.commentsClassified,
    findings: result.productComments,
  });
}

/**
 * PARTIAL on purpose. `AnalysisJobKind` may name a pass this worker does not
 * implement yet — a kind added to the type ahead of its handler, or a newer
 * deployment queuing something an older worker has never heard of. `takeOne`
 * already has the correct behaviour for that case: fail loudly and leave the
 * job QUEUED, so an out-of-date worker cannot bury work a newer one would do.
 * A total Record would instead force a placeholder handler, and a placeholder
 * marks the job succeeded having done nothing.
 */
async function runCollection(supabase: SupabaseClient, job: JobRow): Promise<void> {
  const progress = progressBox();
  const beat = heartbeat(supabase, job.id, progress.read());
  const report = await analyzeChannel(job.channel_id, {
    maxVideos: 50, maxComments: 600,
    windowDays: [30,90,365].includes(Number(job.params?.windowDays)) ? Number(job.params?.windowDays) : 90,
    onStage: async stage => { progress.set({ stage }); if (!(await beat())) throw new ClaimLostError(); },
  });
  progress.set({ stage: 'report' });
  if (!(await beat())) throw new ClaimLostError();
  const { data, error } = await supabase.rpc('commit_channel_collection', {
    p_job: job.id, p_worker: WORKER, p_report: {
      channel_id: report.channelId, title: report.channelTitle, handle: report.handle,
      avatar_url: report.avatarUrl, description: report.description, subscribers: report.subscribers,
      output_stats: report.outputStats, promotions: report.promotions,
      comment_coverage: report.coverage, comments_analyzed: report.commentsAnalyzed,
      data_fetched_at: new Date().toISOString(), evidence: report.evidence, comment_corpus: report.corpus,
    },
  });
  if (error) throw new Error(error.message);
  if (!data) throw new ClaimLostError();
  if (AMENDMENT_ACCEPTED) {
    for (const kind of ['classify_comments','classify_intent']) {
      const { error: queued } = await supabase.from('analysis_jobs').insert({ channel_id: job.channel_id, kind });
      if (queued && queued.code !== '23505') throw new Error(queued.message);
    }
  }
  await finish(supabase, job.id, { status: 'succeeded', comments_scanned: report.commentsAnalyzed });
}

/**
 * A discovery run.
 *
 * The bounds are tiny next to a classification pass — six searches and forty
 * quota units by default, seconds rather than minutes — but it goes through the
 * same claim, lease and heartbeat because the reasons for those have nothing to
 * do with duration: two workers running one search is double spend against a
 * budget capped at a hundred searches a day.
 *
 * THREE TERMINAL OUTCOMES. A run that reached its bound with candidates in hand
 * is `partial`, which is neither success nor failure, and a customer who
 * cancelled gets `cancelled` rather than an error about their own decision.
 * Neither counts as a failed attempt.
 */
async function runDiscovery(supabase: SupabaseClient, job: JobRow): Promise<void> {
  const searchId = job.search_id;
  if (!searchId) throw Object.assign(new Error('a discovery job with no search'), { terminal: true });

  const limits = discoveryLimits();
  log(
    `discovery ${job.kind} ${searchId} · ≤${limits.searchCalls} searches · ≤${limits.units} units` +
      `${AMENDMENT_ACCEPTED ? ` · ${aiProvider()} ${aiModel()}` : ' · ranking gated'}`,
  );

  const started = Date.now();
  const progress = progressBox();
  progress.set({ stage: 'fetching' });
  const beat = heartbeat(supabase, job.id, progress.read());

  const outcome = await runDiscoveryJob(supabase, job.id, searchId, WORKER, {
    checkpoint: async (stage) => {
      // The worker's stage vocabulary is fixed by a CHECK constraint (0037), so
      // the pipeline's own words are mapped rather than written through. A
      // stage the constraint rejects would fail the heartbeat, which the run
      // reads as a lost claim and stops on — a spelling mistake becoming a
      // cancellation.
      progress.set({ stage: stage === 'storing' ? 'storing' : stage === 'enriching' ? 'analysis' : 'fetching' });
      return beat();
    },
  });

  log(
    `discovery ${searchId} ${outcome.status} · ${outcome.candidates} candidates · ` +
      `${outcome.searchCalls} searches · ${outcome.unitsSpent} units · ${outcome.stoppedBecause} · ` +
      `${Math.round((Date.now() - started) / 1000)}s`,
  );

  await finish(supabase, job.id, {
    status: outcome.status,
    // `findings` is the denominated count this job produced, the same as the
    // comment passes use it for. Not a percentage, and never an estimate.
    findings: outcome.candidates,
  });
}

const HANDLERS: Partial<Record<AnalysisJobKind, (s: SupabaseClient, j: JobRow) => Promise<void>>> = {
  // `collect_channel` was implemented in `runCollection` and never registered
  // here, so every collection job queued by `queue_channel_collection` was
  // claimed, found no handler, and went back to the queue — the channel-first
  // flow's own public read, silently never running. The kind is in the enum,
  // the RPC, the retry path and the probes; this table was the only place it
  // was missing.
  collect_channel: runCollection,
  classify_comments: runChannelClassify,
  classify_intent: runChannelIntent,
  discover_criteria: runDiscovery,
  discover_similar: runDiscovery,
  discover_collabs: runDiscovery,
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
 * Queue whatever the candidates on somebody's shortlist are still owed.
 *
 * This walked `creators` before the creator half was removed. It walks
 * `channel_analyses` now — the same question asked of the thing that still
 * exists: a channel whose public read landed but whose model passes did not,
 * because the worker was down when the candidate was added or the process died
 * mid-pass. Without this those rows show dashes in the comment columns forever.
 *
 * WHAT COUNTS AS ALREADY DONE is read from `analysis_jobs`, not inferred from
 * the data, and that distinction is the whole correctness of this command.
 * Inferring got it wrong in both directions:
 *
 *   `moderation.commentsScanned` is written by the CHEAP inline pass as well
 *   as by the model one — it is a keyword census before the model supersedes
 *   it — so a channel that had never been through the model safety pass looked
 *   complete and was never queued. Observed: two channels repaired for intent
 *   and silently skipped for safety.
 *
 *   `comment_axes` being null is genuinely ambiguous the other way: a channel
 *   with comments disabled comes back with zero axes from a pass that ran
 *   perfectly, and requeuing it every time would pay for the same empty answer
 *   forever.
 *
 * A job row says what actually happened, which is the only thing that answers
 * both. A pass is owed when no job of that kind for that channel has succeeded
 * and none is queued or running.
 */
async function enqueueMissing(supabase: SupabaseClient): Promise<void> {
  if (!AMENDMENT_ACCEPTED) { log('Derived analysis gated: approval is not configured.'); return; }
  const [{ data: rows, error }, { data: jobs, error: jobError }] = await Promise.all([
    supabase
      .from('channel_analyses')
      .select('channel_id, title')
      .returns<{ channel_id: string; title: string }[]>(),
    supabase
      .from('analysis_jobs')
      .select('channel_id, kind, status')
      .in('status', ['queued', 'running', 'succeeded'])
      .returns<{ channel_id: string; kind: AnalysisJobKind; status: string }[]>(),
  ]);

  if (error || jobError) {
    console.error(`  could not read state: ${(error ?? jobError)!.message}`);
    process.exit(1);
  }

  const covered = new Set((jobs ?? []).map((j) => `${j.channel_id}:${j.kind}`));
  // The two passes a channel can be OWED. Deliberately not `Object.keys(HANDLERS)`
  // any more: that list now includes `collect_channel`, which is queued by
  // `queue_channel_collection` with a window and a refresh decision, and the
  // three discovery kinds, which are not about a channel at all. Walking every
  // analysed channel and queuing a collection for each would re-fetch the whole
  // table on demand.
  const KINDS: AnalysisJobKind[] = ['classify_comments', 'classify_intent'];

  let queued = 0;
  let skipped = 0;

  for (const row of rows ?? []) {
    for (const kind of KINDS) {
      if (covered.has(`${row.channel_id}:${kind}`)) {
        skipped += 1;
        continue;
      }
      const { error: insertError } = await supabase
        .from('analysis_jobs')
        .insert({ channel_id: row.channel_id, kind, params: {} });

      if (insertError) {
        // 23505 is the partial unique index: one is already queued or running.
        if (insertError.code === '23505') skipped += 1;
        else console.error(`  ${row.title}: ${kind}: ${insertError.message}`);
      } else {
        queued += 1;
      }
    }
  }

  log(`queued ${queued}, already done or in flight ${skipped}`);
}

async function showStatus(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase
    .from('analysis_jobs')
    .select('kind, status, attempts, max_attempts, queued_at, comments_scanned, findings, last_error, channel_id, search_id')
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
  })[]) {
    // A discovery job has no channel. `null.padEnd` is the crash that would
    // otherwise take out the one command an operator runs to find out what is
    // wrong, at the moment they are running it because something is wrong.
    const who = row.channel_id ?? row.search_id ?? '—';
    const detail =
      row.status === 'succeeded' || row.status === 'partial'
        ? row.search_id
          ? `${row.findings ?? 0} candidates`
          : `${(row.comments_scanned ?? 0).toLocaleString('en-US')} comments · ${row.findings ?? 0} flagged`
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
