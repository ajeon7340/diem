import type { AnalysisJob } from '@/types';

/**
 * Where the analysis has got to.
 *
 * THE BAR NEVER ESTIMATES. This report has always refused to predict a
 * completion time or invent a percentage, and a progress bar is the most
 * natural place in a product to start doing both. So it shows two things, and
 * only these:
 *
 *   1. Which stage the worker has actually reported. The stages are observed
 *      events heartbeated by the job, not a plan — a stage lights up because
 *      the worker said it reached it, and the ones behind it are done because
 *      it passed them.
 *   2. Inside comment analysis, a real ratio: comments classified over
 *      comments found. That is a measured count of finished work, not a guess
 *      about remaining time, and it is the one number here that can honestly
 *      fill a bar.
 *
 * A stage with no count gets a moving indeterminate stripe rather than a
 * half-filled bar, because a bar at 40% is a claim about how much is left and
 * nothing here knows that. A channel with 400 comments and one with 26,000
 * both sit in "Analysis" for entirely different lengths of time.
 */

/** The pipeline in the order the worker reports it. */
const STAGES = [
  { keys: ['resolution'], label: 'Channel' },
  { keys: ['videos'], label: 'Videos' },
  { keys: ['comments', 'fetching'], label: 'Comments' },
  { keys: ['analysis', 'classifying'], label: 'Analysis' },
  { keys: ['report', 'storing'], label: 'Report' },
] as const;

export function stageIndex(stage: string | null): number {
  if (!stage) return 0;
  const found = STAGES.findIndex((s) => (s.keys as readonly string[]).includes(stage));
  // An unrecognised stage is the START of the pipeline, not the end. A worker
  // reporting a stage this build has never heard of must not read as "nearly
  // done" — that is the one direction the error is expensive in.
  return found === -1 ? 0 : found;
}

export interface ProgressView {
  /** Index into STAGES, or -1 when nothing is running yet. */
  stage: number;
  /** Measured fraction of comments analysed, or null when nothing counted it. */
  ratio: number | null;
  done: number | null;
  total: number | null;
  running: boolean;
}

/**
 * What the bar is allowed to show, separated from how it looks.
 *
 * `ratio` is null unless a real count exists, and the renderer has no other
 * way to fill the bar — so "no count" cannot become a percentage by accident
 * in a later edit to the markup.
 */
export function progressView(jobs: AnalysisJob[]): ProgressView | null {
  const running = jobs.find((j) => j.status === 'running');
  const queued = jobs.some((j) => j.status === 'queued');
  if (!running && !queued) return null;

  const done = running?.progressDone ?? null;
  const total = running?.progressTotal ?? null;
  return {
    stage: running ? stageIndex(running.progressStage) : -1,
    // `total` of 0 is not a denominator, and a done count without a total is
    // not a fraction of anything.
    ratio: done !== null && total !== null && total > 0 ? Math.min(1, done / total) : null,
    done,
    total,
    running: Boolean(running),
  };
}

export function AnalysisProgress({ jobs }: { jobs: AnalysisJob[] }) {
  const view = progressView(jobs);
  if (!view) return null;
  const { stage: current, ratio, done, total, running } = view;

  return (
    <div className="mt-3">
      <ol className="flex gap-1.5" aria-label="Analysis stages">
        {STAGES.map((stage, i) => {
          const state = current < 0 ? 'waiting' : i < current ? 'done' : i === current ? 'active' : 'waiting';
          return (
            <li key={stage.label} className="flex-1">
              <div
                className={
                  'h-1.5 overflow-hidden rounded-full ' +
                  (state === 'done' ? 'bg-indigo' : 'bg-line')
                }
              >
                {/* The active stage is the only one that animates, and it
                    fills only when a measured ratio exists. */}
                {state === 'active' ? (
                  ratio === null ? (
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-indigo" />
                  ) : (
                    <div
                      className="h-full rounded-full bg-indigo transition-[width] duration-500"
                      style={{ width: `${Math.round(ratio * 100)}%` }}
                    />
                  )
                ) : null}
              </div>
              <span
                className={
                  'mt-1.5 block text-[11px] ' +
                  (state === 'waiting' ? 'text-ink-faint' : 'text-ink')
                }
              >
                {stage.label}
              </span>
            </li>
          );
        })}
      </ol>

      {/* The count, spelled out, because the bar alone is not a figure anyone
          can quote and a screen reader gets nothing from a div's width. */}
      <p className="mt-2 text-[12px] text-ink-muted" role="status">
        {!running
          ? 'Queued. Work starts when a worker picks it up.'
          : ratio !== null
            ? `${done!.toLocaleString('en-US')} of ${total!.toLocaleString('en-US')} comments analysed.`
            : 'Working. No count for this stage yet.'}
      </p>
    </div>
  );
}
