import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { AnalysisJob, AnalysisJobKind, AnalysisJobStatus } from '@/types';

/**
 * Queueing and reading the long passes.
 *
 * Writes go through the SERVICE client only. `analysis_jobs` holds no INSERT
 * grant for `authenticated`, which is the point: a row here causes metered
 * model calls, so the ability to create one is not delegated to anybody who can
 * name a creator. Reads go through whatever client the caller already has —
 * RLS scopes those to the creator's own rows.
 *
 * EVERY FUNCTION TAKES ITS CLIENT rather than building one. `lib/supabase/server`
 * imports `next/headers` at module scope, and `scripts/worker.ts` is a plain
 * Node process with no request around it — importing that module from here
 * would drag Next's request storage into the worker, which is the same reason
 * `scan-comments.ts` has always constructed its own client.
 */

interface AnalysisJobRow {
  id: string;
  kind: AnalysisJobKind;
  status: AnalysisJobStatus;
  attempts: number;
  max_attempts: number;
  queued_at: string;
  started_at: string | null;
  finished_at: string | null;
  comments_scanned: number | null;
  findings: number | null;
  last_error: string | null;
  progress_done: number | null;
  progress_total: number | null;
  progress_stage: 'fetching' | 'classifying' | 'storing' | null;
}

const COLUMNS =
  'id, kind, status, attempts, max_attempts, queued_at, started_at, finished_at, ' +
  'comments_scanned, findings, last_error, progress_done, progress_total, progress_stage';

function toJob(row: AnalysisJobRow): AnalysisJob {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    queuedAt: row.queued_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    commentsScanned: row.comments_scanned,
    findings: row.findings,
    lastError: row.last_error,
    progressDone: row.progress_done,
    progressTotal: row.progress_total,
    progressStage: row.progress_stage,
  };
}

/**
 * Queue a pass for a creator.
 *
 * NEVER THROWS, for the same reason `analyzeAndStore` never throws: it is
 * called from signup, after the creator row is already written and their handle
 * is already taken. A queue that is momentarily unreachable must not bounce
 * somebody back to a form they can no longer submit. The work is simply owed
 * and not yet recorded, which `npm run worker -- --enqueue-missing` repairs.
 *
 * `already_queued` is a SUCCESS. The unique partial index in 0028 allows one
 * active job per creator per kind, so a retried server action or a second
 * signup attempt collides here rather than queueing a second metered run.
 */
export async function enqueueAnalysisJob(
  supabase: SupabaseClient | null,
  creatorId: string,
  kind: AnalysisJobKind,
  params: Record<string, unknown> = {},
): Promise<
  { ok: true; queued: boolean } | { ok: false; reason: string }
> {
  if (!supabase) return { ok: false, reason: 'no_service_key' };

  try {
    // A PLAIN INSERT, and it has to be.
    //
    // The obvious version is `.upsert(..., { onConflict: 'creator_id,kind',
    // ignoreDuplicates: true })`, and it does not work: the unique index is
    // PARTIAL (`where status in ('queued','running')`), and Postgres will only
    // infer a partial index as an ON CONFLICT arbiter when the statement
    // repeats the index predicate — which PostgREST has no way to send. The
    // server rejects it at planning time with "there is no unique or exclusion
    // constraint matching the ON CONFLICT specification", so every enqueue
    // would fail rather than dedupe. Verified against the replayed schema.
    //
    // The unique violation IS the dedupe, so it is caught rather than avoided.
    const { error } = await supabase
      .from('analysis_jobs')
      .insert({ creator_id: creatorId, kind, params });

    if (error) {
      if (error.code === '23505') return { ok: true, queued: false };
      return { ok: false, reason: error.message };
    }
    return { ok: true, queued: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The most recent job of a kind for a creator, or null.
 *
 * Ordered by `queued_at` rather than filtered to active, because a FAILED job
 * is the most useful thing to know about and would be invisible under an
 * active-only filter — the report would go back to saying nothing at all,
 * which is the state this whole change exists to remove.
 */
export async function latestAnalysisJob(
  supabase: SupabaseClient,
  creatorId: string,
  kind: AnalysisJobKind,
): Promise<AnalysisJob | null> {
  const { data, error } = await supabase
    .from('analysis_jobs')
    .select(COLUMNS)
    .eq('creator_id', creatorId)
    .eq('kind', kind)
    .order('queued_at', { ascending: false })
    .limit(1)
    .maybeSingle<AnalysisJobRow>();

  if (error || !data) return null;
  return toJob(data);
}

/**
 * How the report should describe a missing classifier pass.
 *
 * Returns null when there is nothing useful to add — no job, or one that
 * succeeded, in which case the figures are present and the absence is about
 * something else entirely.
 *
 * The strings never quote the worker's error. A creator reading their own media
 * kit is not debugging a fetch; "could not be completed" plus a retry count is
 * everything they can act on, and a Postgres message in that slot would be both
 * frightening and useless.
 */
const PASS_NAME: Record<AnalysisJobKind, string> = {
  classify_comments: 'comment safety scan',
  classify_intent: 'comment classification',
};

export function describeJob(job: AnalysisJob | null): string | null {
  if (!job) return null;
  const pass = PASS_NAME[job.kind];

  switch (job.status) {
    case 'queued':
      return `The ${pass} is queued and will run shortly.`;
    case 'running': {
      // "Running now" is true and answers nothing after two minutes of it. The
      // only question a creator has at that point is whether it is nearly done
      // or stuck, and the pass has been reporting exactly that to its caller
      // since it was written — the worker simply threw it away. See 0029.
      if (job.progressStage === 'fetching') {
        return `The ${pass} is reading the comment section now. Classifying starts when that finishes.`;
      }
      if (job.progressDone !== null && job.progressTotal) {
        return `The ${pass} is running — ${job.progressDone.toLocaleString('en-US')} of ${job.progressTotal.toLocaleString('en-US')} comments so far.`;
      }
      return `The ${pass} is running now — the figures appear here when it finishes.`;
    }
    case 'failed':
      return job.attempts >= job.maxAttempts
        ? `The ${pass} could not be completed after ${job.attempts} attempts. Nothing about the channel is implied by this — it is our pass that failed, not their audience.`
        : `The ${pass} did not complete and will be retried.`;
    case 'succeeded':
      return null;
  }
}
