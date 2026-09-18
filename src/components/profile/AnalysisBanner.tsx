'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle, TriangleAlert } from 'lucide-react';

import { cn } from '@/lib/cn';

/**
 * What the analysis is doing right now, at the top of the creator's own media
 * kit.
 *
 * The status already existed and was a sentence at the bottom of a gaps list
 * inside one panel — findable only if you were already reading the panel whose
 * figure was missing. A creator who has just signed up is looking at a report
 * with holes in it and wants one question answered before any of the others:
 * is something happening, or is this it.
 *
 * OWNER ONLY. `analysis_jobs` is creator-scoped by RLS and this is operational
 * detail about our pipeline — a buyer needs to know a figure is absent, which
 * the panels already say, not that our worker is on batch nine.
 */
export interface JobStatus {
  kind: 'classify_comments' | 'classify_intent';
  name: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  stage: 'fetching' | 'classifying' | 'storing' | null;
  done: number | null;
  total: number | null;
  attempts: number;
  maxAttempts: number;
}

export function AnalysisBanner({ jobs }: { jobs: JobStatus[] }) {
  const router = useRouter();
  const live = jobs.some((j) => j.status === 'queued' || j.status === 'running');

  useEffect(() => {
    if (!live) return;
    // Re-runs the server render, which reads the job under the creator's own
    // RLS. Stops the moment nothing is live: a 10s poll left on a finished
    // report is a request every 10 seconds forever for a number that will
    // never change again.
    const timer = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(timer);
  }, [live, router]);

  if (jobs.length === 0) return null;

  return (
    <div
      className={cn(
        'mt-4 rounded-panel border px-4 py-3',
        live ? 'border-indigo/30 bg-indigo/5' : 'border-amber/30 bg-amber-wash',
      )}
    >
      <p className="flex items-center gap-2 text-[12px] font-medium text-ink">
        {live ? (
          <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin text-indigo" aria-hidden />
        ) : (
          <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-amber" aria-hidden />
        )}
        {live ? 'Analysing your comments' : 'Analysis did not finish'}
      </p>

      <ul className="mt-2 space-y-2">
        {jobs.map((job) => (
          <li key={job.kind}>
            <p className="flex items-baseline justify-between gap-3 text-[11px] text-ink-muted">
              <span>
                {job.name} — {describe(job)}
              </span>
              {job.done !== null && job.total ? (
                <span className="tnum shrink-0 text-ink-faint">
                  {job.done.toLocaleString('en-US')} / {job.total.toLocaleString('en-US')}
                </span>
              ) : null}
            </p>
            <Bar job={job} />
          </li>
        ))}
      </ul>

      {live ? (
        <p className="mt-2.5 text-[11px] leading-snug text-ink-faint">
          The figures fill in here as each pass lands — nothing to reload.
        </p>
      ) : null}
    </div>
  );
}

function describe(job: JobStatus): string {
  switch (job.status) {
    case 'queued':
      return 'queued';
    case 'running':
      // The fetch is a minute of silence on a large channel and reads as a
      // hang without naming it.
      return job.stage === 'fetching' ? 'reading your comment section' : 'classifying';
    case 'failed':
      return job.attempts >= job.maxAttempts
        ? `could not be completed after ${job.attempts} attempts`
        : 'did not complete — it will be retried';
    case 'succeeded':
      return 'done';
  }
}

function Bar({ job }: { job: JobStatus }) {
  const live = job.status === 'queued' || job.status === 'running';
  // Null is not zero. Until the worker reports, we do not know it has done
  // nothing — and on a large channel the first minute is YouTube pagination
  // with no count to report at all. An indeterminate stripe says "working"
  // without claiming a position.
  const fraction = job.done !== null && job.total ? Math.min(job.done / job.total, 1) : null;

  if (!live) {
    return job.status === 'failed' ? (
      <span className="mt-1 block h-1 w-full rounded-full bg-amber/30" aria-hidden />
    ) : null;
  }

  return (
    <span
      className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-ink/10"
      role="progressbar"
      aria-valuenow={fraction !== null ? Math.round(fraction * 100) : undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${job.name} progress`}
    >
      <span
        className={cn(
          'block h-full rounded-full bg-indigo',
          fraction === null ? 'w-1/3 animate-pulse' : 'transition-[width] duration-500',
        )}
        style={fraction === null ? undefined : { width: `${Math.round(fraction * 100)}%` }}
      />
    </span>
  );
}
