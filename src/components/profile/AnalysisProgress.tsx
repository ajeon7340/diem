'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The live half of a job's state.
 *
 * The sentence is computed on the server by `describeJob`, so there is exactly
 * one place that decides how a pass is described. This adds the two things a
 * sentence cannot do: draw the fraction, and stop being stale.
 *
 * REFRESHES RATHER THAN FETCHES. `router.refresh()` re-runs the server render,
 * which already reads `analysis_jobs` under the creator's own RLS. A dedicated
 * endpoint would be a second path to the same row with its own idea of who may
 * read it — and this row is creator-only on purpose.
 *
 * Polling stops the moment the job is terminal. A 10-second interval left
 * running on a finished report is a request every 10 seconds, forever, for a
 * number that will never change again.
 */
export function AnalysisProgress({
  note,
  status,
  done,
  total,
}: {
  note: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  done: number | null;
  total: number | null;
}) {
  const router = useRouter();
  const live = status === 'queued' || status === 'running';

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(timer);
  }, [live, router]);

  // Null is not zero: until the worker reports, we do not know that it has done
  // nothing. A bar at 0% is a claim, and on a large channel the first minute is
  // YouTube pagination with no count to report at all.
  const fraction = done !== null && total !== null && total > 0 ? Math.min(done / total, 1) : null;

  return (
    <li className="text-[11px] leading-relaxed text-ink">
      <span className="flex items-center gap-1.5">
        {live ? (
          <span
            className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-indigo"
            aria-hidden
          />
        ) : null}
        <span>{note}</span>
      </span>

      {fraction !== null ? (
        <span
          className="mt-1.5 block h-1 w-full max-w-[280px] overflow-hidden rounded-full bg-ink/10"
          role="progressbar"
          aria-valuenow={Math.round(fraction * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Comment classification progress"
        >
          <span
            className="block h-full rounded-full bg-indigo transition-[width] duration-500"
            style={{ width: `${Math.round(fraction * 100)}%` }}
          />
        </span>
      ) : null}
    </li>
  );
}
