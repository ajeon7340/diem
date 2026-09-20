import 'server-only';

import type { AnalysisJob, AnalysisJobKind } from '@/types';

/**
 * How a job in flight is described to the person waiting on it.
 *
 * Writes to `analysis_jobs` go through the SERVICE client only, wherever they
 * live: the table holds no INSERT grant for `authenticated`, because a row
 * here causes metered model calls and the ability to create one is not
 * delegated to anybody who can name a channel.
 */

/**
 * `enqueueAnalysisJob` and `latestAnalysisJob` lived here and were keyed by
 * `creators.id`. Queuing now goes through `enqueueChannelJob` in
 * `ingest/channel-store.ts`, and reading a job's state through
 * `getChannelJobs` in `lib/data/campaigns.ts`, both keyed by channel id.
 *
 * What is left is the part that was never about a creator: turning a job row
 * into the sentence a waiting customer reads.
 */

/**
 * How the report should describe a missing classifier pass.
 *
 * Returns null when there is nothing useful to add — no job, or one that
 * succeeded, in which case the figures are present and the absence is about
 * something else entirely.
 *
 * The strings never quote the worker's error. Somebody comparing candidates is
 * not debugging a fetch; "could not be completed" plus a retry count is
 * everything they can act on, and a Postgres message in that slot would be
 * both frightening and useless. It also has to be unmistakably about OUR pass
 * rather than about the channel — a failed scan is not a finding.
 */
const PASS_NAME: Record<AnalysisJobKind, string> = {
  collect_channel: 'channel analysis',
  classify_comments: 'comment safety scan',
  classify_intent: 'comment classification',
  discover_criteria: 'creator search',
  discover_similar: 'similar-channel search',
  discover_collabs: 'collaboration search',
};

export function describeJob(job: AnalysisJob | null): string | null {
  if (!job) return null;
  const pass = PASS_NAME[job.kind];

  switch (job.status) {
    case 'queued':
      return `The ${pass} is queued and will run shortly.`;
    case 'running': {
      // "Running now" is true and answers nothing after two minutes of it. The
      // only question at that point is whether it is nearly done or stuck, and the pass has been reporting exactly that to its caller
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
    case 'partial':
      // Not a failure and not a completion. What was found stands; what was not
      // reached is named by the run's own coverage, which the results panel
      // renders — this sentence must not compete with it by guessing a cause.
      return `The ${pass} stopped at its limit. What it found is below, and there is more it did not reach.`;
    case 'cancelled':
      return `The ${pass} was cancelled. Anything collected before it stopped is kept.`;
  }
}
